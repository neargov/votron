import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import dotenv from "dotenv";
import WebSocket from "ws";
import {
  queuedAgent,
  queuedAgentAccountId,
  getQueueStatus,
} from "./agentQueue";

try {
  dotenv.config({ path: ".env" });
  dotenv.config({ path: ".env.development.local", override: false });
} catch (e) {
  console.log("No local env file found, using system environment");
}

// Services
import { Voter, VoteOption, VoteDecision } from "./voter";
import createAgentRoutes from "./routes/vote";
import createDebugRoutes from "./routes/debug";
import type { ProposalData } from "./voting-utils";
import { fetchProposalInfo } from "./voting-utils";

// Configuration
const VOTING_CONTRACT_ID =
  process.env.VOTING_CONTRACT_ID || "vote.ballotbox.testnet";
const NEAR_RPC_JSON =
  process.env.NEAR_RPC_JSON || "https://rpc.testnet.near.org";
const VENEAR_CONTRACT_ID = process.env.VENEAR_CONTRACT_ID || "v.hos03.testnet";

// Initialization
const voter = new Voter({
  apiKey: process.env.NEAR_AI_CLOUD_API_KEY,
  agentAccountId: process.env.AGENT_ACCOUNT_ID,
  votingContractId: process.env.VOTING_CONTRACT_ID,
});

// For testing
const debugInfo = {
  lastWebSocketMessage: null as string | null,
  lastEventTime: null as string | null,
  wsMessageCount: 0,
};

// WebSocket monitoring
let eventClient: WebSocket | null = null;
let isConnecting = false;
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;

// Create Hono app
const app = new Hono();
app.use(cors());

// Health check
app.get("/", (c) => {
  const stats = voter.getVoteStats();
  const execStats = voter.getExecutionStats();

  return c.json({
    message: "App is running",
    shadeAgent: "active",
    voterAgent: "active",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    eventStream: eventClient ? "connected" : "disconnected",
    voter: {
      status: "active",
      totalVotes: stats.total,
      breakdown: stats.breakdown,
      lastDecision: stats.lastDecision,
    },
    execution: {
      totalExecutions: execStats.total,
      successful: execStats.successful,
      failed: execStats.failed,
    },
  });
});

// POST /api/evaluate - AI evaluation only (no vote)
app.post("/api/evaluate", async (c) => {
  try {
    const body = await c.req.json();

    if (!body.proposalId) {
      return c.json({ error: "proposalId is required" }, 400);
    }

    console.log(`🔍 AI evaluation only for proposal ${body.proposalId}...`);

    const canonicalProposal = await fetchProposalInfo(
      body.proposalId,
      VOTING_CONTRACT_ID,
      NEAR_RPC_JSON
    );

    if (!canonicalProposal) {
      return c.json(
        { error: "Proposal not found on chain", proposalId: body.proposalId },
        404
      );
    }

    const aiDecision = await voter.askAI(canonicalProposal);

    return c.json({
      proposalId: body.proposalId,
      recommendation: aiDecision.selectedOption,
      reasons: aiDecision.reasons,
      timestamp: new Date().toISOString(),
      verifiedFromChain: true,
      proposalTitle: canonicalProposal.title,
      proposalStatus: canonicalProposal.status,
      voteCast: false,
    });
  } catch (error: any) {
    console.error("❌ AI evaluation failed:", error);
    return c.json({ error: "Evaluation failed", details: error.message }, 500);
  }
});

// Mount routes
app.route(
  "/api/vote",
  createAgentRoutes(voter, {
    get eventClient() {
      return eventClient;
    },
    get isConnecting() {
      return isConnecting;
    },
    get reconnectAttempts() {
      return reconnectAttempts;
    },
    maxReconnectAttempts,
    VOTING_CONTRACT_ID,
    NEAR_RPC_JSON,
  })
);

app.route(
  "/debug",
  createDebugRoutes(
    {
      get eventClient() {
        return eventClient;
      },
      get isConnecting() {
        return isConnecting;
      },
      get reconnectAttempts() {
        return reconnectAttempts;
      },
      maxReconnectAttempts,
      VOTING_CONTRACT_ID,
    },
    debugInfo
  )
);
app.route("/api/agent", createShadeAgentApiRoutes());

// Agent status endpoint
app.get("/api/agent-status", async (c) => {
  try {
    let agentRegistered: boolean = false;
    let agentInfo: any = null;
    let contractBalance: any = null;
    let connectionError: string | null = null;

    console.log(`🔍 Starting agent status check with queue...`);

    let accountInfo: { accountId: string };
    let agentAccount: string;

    try {
      accountInfo = await queuedAgentAccountId();
      agentAccount = accountInfo.accountId;
      console.log(`✅ Got agent account: ${agentAccount}`);
    } catch (error: any) {
      console.warn("Could not get agent account:", error.message);
      connectionError = error.message;
      agentAccount = "unknown";
    }

    const agentContract: string =
      process.env.AGENT_ACCOUNT_ID || "ac-sandbox.votron.testnet";

    try {
      const agentCheckResult = await queuedAgent("view", {
        contractId: agentContract,
        methodName: "get_agent",
        args: { account_id: agentAccount },
      });

      if (agentCheckResult?.error) {
        agentRegistered = false;
        agentInfo = agentCheckResult;
        connectionError = agentCheckResult.error;
        console.warn("❌ Agent NOT registered:", agentCheckResult.error);
      } else {
        agentRegistered = true;
        agentInfo = agentCheckResult;
        console.log(`✅ Agent registration verified`);
      }
    } catch (error: any) {
      agentRegistered = false;
      agentInfo = { error: error.message };
      connectionError = error.message;
      console.warn("❌ Agent registration check failed:", error.message);
    }

    try {
      const balanceResult = await queuedAgent("view", {
        contractId: agentContract,
        methodName: "get_contract_balance",
        args: {},
      });
      contractBalance = balanceResult;
      console.log(`✅ Got contract balance`);
    } catch (error: any) {
      console.warn("Could not fetch balance:", error.message);
      connectionError = error.message;
    }

    const queueStatus = getQueueStatus();

    return c.json({
      agentContract: {
        contractId: agentContract,
        agentAccountId: agentAccount,
        agentRegistered,
        agentInfo,
        contractBalance,
        votingContract: VOTING_CONTRACT_ID,
        connectionError,
      },
      autoApproval: {
        enabled: agentRegistered,
        method: "agent_contract",
      },
      queueStatus,
    });
  } catch (error: any) {
    console.error("❌ Agent status check failed:", error);
    const agentContractFallback: string =
      process.env.AGENT_ACCOUNT_ID || "ac-sandbox.votron.testnet";
    return c.json(
      {
        error: error.message,
        agentContract: {
          contractId: agentContractFallback,
          connectionError: error.message,
        },
      },
      500
    );
  }
});

app.get("/api/queue-status", (c) => {
  const status = getQueueStatus();
  return c.json({
    queue: status,
    timestamp: new Date().toISOString(),
    message: status.isProcessing
      ? "Queue is processing requests"
      : "Queue is idle",
  });
});

app.post("/api/manual-vote", async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}));
    const { proposalId, vote } = body;

    if (!proposalId) {
      return c.json({ error: "proposalId required" }, 400);
    }

    const voteChoice = parseInt(vote);
    if (![0, 1, 2].includes(voteChoice)) {
      return c.json(
        {
          error: "Invalid vote. Use 0=For, 1=Against, 2=Abstain",
        },
        400
      );
    }

    const finalVote: VoteOption =
      voteChoice === 0 ? "For" : voteChoice === 1 ? "Against" : "Abstain";

    const canonicalProposal = await fetchProposalInfo(
      proposalId,
      VOTING_CONTRACT_ID,
      NEAR_RPC_JSON
    );

    const manualResult = await voter.recordManualVote(
      proposalId,
      finalVote,
      `Raw manual vote: ${finalVote}`,
      canonicalProposal
    );

    return c.json({
      success: true,
      proposalId,
      vote: finalVote,
      method: "manual-vote",
      transactionHash: manualResult.executionResult?.transactionHash,
    });
  } catch (error: any) {
    console.error("❌ Manual vote failed:", error);
    return c.json({ error: error.message }, 500);
  }
});

// Shade Agent API routes
function createShadeAgentApiRoutes() {
  const agentApiRoutes = new Hono();

  agentApiRoutes.post("/getAccountId", async (c) => {
    try {
      const result = await queuedAgentAccountId();
      return c.json(result);
    } catch (error: any) {
      console.error("❌ Shade agent API error:", error);
      return c.json({ error: error.message }, 500);
    }
  });

  agentApiRoutes.post("/getBalance", async (c) => {
    try {
      const result = await queuedAgent("getBalance");
      return c.json(result);
    } catch (error: any) {
      console.error("❌ Shade agent API error:", error);
      return c.json({ error: error.message }, 500);
    }
  });

  agentApiRoutes.post("/call", async (c) => {
    try {
      const body = await c.req.json();
      const result = await queuedAgent("call", body);
      return c.json(result);
    } catch (error: any) {
      console.error("❌ Shade agent API error:", error);
      return c.json({ error: error.message }, 500);
    }
  });

  agentApiRoutes.post("/view", async (c) => {
    try {
      const body = await c.req.json();
      const result = await queuedAgent("view", body);
      return c.json(result);
    } catch (error: any) {
      console.error("❌ Shade agent API error:", error);
      return c.json({ error: error.message }, 500);
    }
  });

  agentApiRoutes.post("/:method", async (c) => {
    try {
      const method = c.req.param("method");
      const body = await c.req.json();
      const result = await queuedAgent(method, body);
      return c.json(result);
    } catch (error: any) {
      console.error("❌ Shade agent API error:", error);
      return c.json({ error: error.message }, 500);
    }
  });

  return agentApiRoutes;
}

async function handleVote(proposalId: string, eventDetails: any) {
  try {
    console.log(`✅ Processing approval for proposal ${proposalId}`);
    if (eventDetails.reviewer_id) {
      console.log(`👤 Reviewer: ${eventDetails.reviewer_id}`);
    }
    if (eventDetails.voting_start_time_ns) {
      console.log(`🕒 Voting start (ns): ${eventDetails.voting_start_time_ns}`);
    }

    // Wait for proposal to be ready with snapshot to avoid redundant later fetches
    let fullProposal: ProposalData | null = null;
    const readinessDelays = [0, 300, 500, 800, 1200]; // progressive backoff in ms

    for (let attempt = 0; attempt < readinessDelays.length; attempt++) {
      if (attempt > 0) {
        const delay = readinessDelays[attempt];
        console.log(
          `⏳ Waiting ${delay}ms for proposal snapshot (attempt ${
            attempt + 1
          }/${readinessDelays.length})...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      try {
        const proposal = await fetchProposalInfo(
          proposalId,
          VOTING_CONTRACT_ID,
          NEAR_RPC_JSON
        );

        if (attempt === 0) {
          console.log(
            "🔍 Raw proposal status:",
            typeof proposal.status,
            JSON.stringify(proposal.status)
          );
        }

        const hasSnapshot = !!proposal.snapshot_and_state?.snapshot;
        const hasOptions =
          Array.isArray(proposal.voting_options) &&
          proposal.voting_options.length > 0;

        console.log(
          `📋 Loaded proposal info: ${proposal.title || "Untitled proposal"}`
        );
        console.log(
          `📊 Status: ${proposal.status || "unknown"} | 📸 Snapshot: ${
            hasSnapshot ? "present" : "missing"
          } | 🗳️ Options: ${proposal.voting_options?.length || 0}`
        );

        if (
          proposal.voting_start_time_ns &&
          !eventDetails.voting_start_time_ns
        ) {
          console.log(
            `🕒 Voting start (contract): ${proposal.voting_start_time_ns}`
          );
        }

        if (!hasSnapshot || !hasOptions) {
          console.log(
            `⏸️ Proposal not ready yet (attempt ${attempt + 1}/${
              readinessDelays.length
            })`
          );
          continue;
        }

        console.log(
          `✅ Proposal ${proposalId} ready with snapshot (attempt ${
            attempt + 1
          })`
        );
        fullProposal = proposal;
        break;
      } catch (error: any) {
        console.warn(
          `⚠️ Error fetching proposal ${proposalId} (attempt ${attempt + 1}/${
            readinessDelays.length
          }):`,
          error.message
        );
      }
    }

    if (!fullProposal) {
      console.warn(
        `⚠️ Skipping vote for proposal ${proposalId}: unable to load canonical data`
      );
      return;
    }

    let evaluation = voter.getVoteDecision(proposalId);
    if (!evaluation && fullProposal) {
      console.log(`🤖 Running AI evaluation for proposal ${proposalId}`);
      evaluation = await voter.evaluateProposal(proposalId, fullProposal);
    }

    if (evaluation) {
      console.log(`\n🗳️ PROPOSAL ${proposalId} APPROVED FOR VOTING:`);
      console.log(`📋 Our decision: ${evaluation.selectedOption || "Unknown"}`);
      console.log(`📋 Reasons: ${evaluation.reasons.join(" | ")}`);
    } else {
      console.log(
        `⚠️ Proposal ${proposalId} was approved but we haven't evaluated it`
      );
    }

    if (evaluation?.executionResult?.transactionHash) {
      console.log(
        `🔗 Vote already cast on-chain: ${evaluation.executionResult.transactionHash}`
      );
    } else if (evaluation?.selectedOption && fullProposal) {
      console.log(
        `ℹ️ Vote decision: ${evaluation.selectedOption} for proposal ${proposalId}`
      );
    } else {
      console.log(
        `ℹ️ Skipping vote for proposal ${proposalId}: ${
          evaluation ? "no recorded voting choice" : "no evaluation result"
        }`
      );
    }
  } catch (error: any) {
    console.error(`❌ Failed to process approval ${proposalId}:`, error);
  }
}

// Event processing helpers
function extractProposalId(event: any): string | null {
  const proposalId =
    event.event_data?.[0]?.proposal_id ?? event.data?.[0]?.proposal_id;
  return proposalId !== undefined ? proposalId.toString() : null;
}

function extractEventType(event: any): string | null {
  return event.event_event || null;
}

function extractAccountId(event: any): string | null {
  return event.account_id || null;
}

function extractProposalDetails(event: any) {
  const eventData = event.event_data?.[0] ?? event.data?.[0] ?? {};
  const startTimeSec = eventData.voting_start_time_sec;
  const startTimeNs =
    startTimeSec !== undefined && startTimeSec !== null
      ? (BigInt(startTimeSec) * 1_000_000_000n).toString()
      : undefined;
  return {
    proposalId: eventData.proposal_id,
    proposal_id: eventData.proposal_id,
    title: eventData.title,
    description: eventData.description,
    link: eventData.link,
    proposer_id: eventData.proposer_id,
    reviewer_id: eventData.account_id,
    voting_options: eventData.voting_options,
    voting_start_time_sec: startTimeSec,
    voting_start_time_ns: startTimeNs,
  };
}

// WebSocket connection
async function startEventStream() {
  if (!VOTING_CONTRACT_ID) {
    console.log("⚠️ VOTING_CONTRACT_ID not set - skipping proposal monitoring");
    return;
  }

  if (isConnecting) {
    console.log("⏳ Event stream connection already in progress");
    return;
  }

  isConnecting = true;

  try {
    if (eventClient) {
      eventClient.close();
      eventClient = null;
    }

    console.log("🔗 Connecting to Intear WebSocket API...");
    eventClient = new WebSocket(
      "wss://ws-events-v3-testnet.intear.tech/events/log_nep297"
    );

    eventClient.on("open", () => {
      console.log("✅ WebSocket connected");

      const contractFilter = {
        And: [
          {
            path: "account_id",
            operator: { Equals: VOTING_CONTRACT_ID },
          },
          {
            path: "event_event",
            operator: { Equals: "proposal_approve" },
          },
        ],
      };

      eventClient!.send(JSON.stringify(contractFilter));
      console.log("📤 Filter sent to WebSocket");

      reconnectAttempts = 0;
      isConnecting = false;
    });

    eventClient.on("message", async (data) => {
      try {
        const text = data.toString();

        debugInfo.lastWebSocketMessage = text;
        debugInfo.lastEventTime = new Date().toISOString();
        debugInfo.wsMessageCount++;

        console.log("📨 Raw WebSocket message:", text);

        if (!text.startsWith("{") && !text.startsWith("[")) {
          console.log("📨 WebSocket message (non-JSON):", text);
          return;
        }

        const events = JSON.parse(text);
        const eventArray = Array.isArray(events) ? events : [events];

        console.log("📨 Parsed events:", JSON.stringify(eventArray, null, 2));

        for (const event of eventArray) {
          const proposalId = extractProposalId(event);
          const eventType = extractEventType(event);

          if (!proposalId || !eventType) continue;

          console.log(`🎯 PROCESSING ${eventType} for proposal ${proposalId}`);

          const eventDetails = extractProposalDetails(event);

          if (
            eventType === "proposal_approve" ||
            eventType === "approve_proposal"
          ) {
            await handleVote(proposalId, eventDetails);
          } else {
            console.log(`⏩ Unhandled event type: ${eventType}`);
          }
        }
      } catch (err: any) {
        console.error("❌ Event processing error:", err);
      }
    });

    eventClient.on("close", () => {
      console.log("🔌 WebSocket closed");
      eventClient = null;
      isConnecting = false;

      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        console.log(
          `🔄 Retry attempt ${reconnectAttempts}/${maxReconnectAttempts}`
        );
        startEventStream();
      } else {
        console.error("❌ Max reconnection attempts reached");
      }
    });

    eventClient.on("error", (err) => {
      console.error("❌ WebSocket error:", err.message);
      if (eventClient) {
        eventClient.close();
        eventClient = null;
      }
      isConnecting = false;
    });
  } catch (err: any) {
    console.error("❌ Failed to create WebSocket:", err);
    isConnecting = false;
  }
}

// Start server
const port = Number(process.env.PORT || "3000");

console.log(`🚀 Starting Proposal Reviewer Agent`);

// Start monitoring
if (VOTING_CONTRACT_ID) {
  setTimeout(() => {
    console.log(
      `📋 Starting NEAR proposal monitoring for ${VOTING_CONTRACT_ID}...`
    );
    startEventStream();
  }, 2000);
}

serve({ fetch: app.fetch, port });
