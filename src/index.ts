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
} catch (e) {
  console.log("No local env file found, using system environment");
}

// Import services
import { Voter, VoteOption, VoteDecision } from "./voter";
import createAgentRoutes from "./routes/vote";
import createDebugRoutes from "./routes/debug";
import type { ProposalData } from "./voting-utils";
import { fetchProposalInfo } from "./voting-utils";

import { agent, agentAccountId } from "@neardefi/shade-agent-js";

// Configuration
const VOTING_CONTRACT_ID =
  process.env.VOTING_CONTRACT_ID || "shade.ballotbox.testnet";
const NEAR_RPC_JSON =
  process.env.NEAR_RPC_JSON || "https://rpc.testnet.near.org";
const VENEAR_CONTRACT_ID = process.env.VENEAR_CONTRACT_ID || "v.hos03.testnet";

// Initialize voter
const voter = new Voter({
  apiKey: process.env.NEAR_AI_CLOUD_API_KEY,
  agentAccountId: process.env.AGENT_ACCOUNT_ID,
  votingContractId: process.env.VOTING_CONTRACT_ID,
});

// Testing
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

// POST /api/evaluate - AI evaluation only (no vote cast)
app.post("/api/evaluate", async (c) => {
  try {
    const body = await c.req.json();

    if (!body.proposalId) {
      return c.json({ error: "proposalId is required" }, 400);
    }

    console.log(`🔍 AI evaluation only for proposal ${body.proposalId}...`);

    // Fetch from chain
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

    // AI Evaluation only
    const decision = await voter.evaluateProposal(
      body.proposalId,
      canonicalProposal
    );

    return c.json({
      proposalId: body.proposalId,
      recommendation: decision.selectedOption,
      reasons: decision.reasons,
      timestamp: decision.timestamp,
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
      eventClient,
      isConnecting,
      reconnectAttempts,
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

      // Check if the result contains an error
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
    return c.json(
      {
        error: error.message,
        agentContract: {
          contractId: "ac-sandbox.votron.testnet",
          connectionError: error.message,
        },
      },
      200
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

// Shade Agent API routes (for library compatibility)
function createShadeAgentApiRoutes() {
  const agentApiRoutes = new Hono();

  agentApiRoutes.post("/getAccountId", async (c) => {
    try {
      const result = await agentAccountId();
      return c.json(result);
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });

  agentApiRoutes.post("/getBalance", async (c) => {
    try {
      const result = await agent("getBalance");
      return c.json(result);
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });

  agentApiRoutes.post("/call", async (c) => {
    try {
      const body = await c.req.json();
      const result = await agent("call", body);
      return c.json(result);
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });

  agentApiRoutes.post("/view", async (c) => {
    try {
      const body = await c.req.json();
      const result = await agent("view", body);
      return c.json(result);
    } catch (error: any) {
      return c.json({ error: error.message }, 500);
    }
  });

  agentApiRoutes.post("/:method", async (c) => {
    try {
      const method = c.req.param("method");
      const body = await c.req.json();
      const result = await agent(method, body);
      return c.json(result);
    } catch (error: any) {
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

    let fullProposal: ProposalData | null = null;
    try {
      fullProposal = await fetchProposalInfo(
        proposalId,
        VOTING_CONTRACT_ID,
        NEAR_RPC_JSON
      );
      console.log(
        `📋 Loaded proposal info: ${fullProposal.title || "Untitled proposal"}`
      );
      if (fullProposal.status) {
        console.log(`📊 Current status: ${fullProposal.status}`);
      }
      if (
        fullProposal.voting_start_time_ns &&
        !eventDetails.voting_start_time_ns
      ) {
        console.log(
          `🕒 Voting start (contract): ${fullProposal.voting_start_time_ns}`
        );
      }
    } catch (error: any) {
      console.warn(
        `⚠️ Could not fetch proposal ${proposalId} info:`,
        error.message
      );
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
    console.error(
      `❌ Failed to process approval ${proposalId}:`,
      error
    );
  }
}

// Event processing helpers
function extractProposalId(event: any): string | null {
  const proposalId = event.event_data?.[0]?.proposal_id;
  return proposalId !== undefined ? proposalId.toString() : null;
}

function extractEventType(event: any): string | null {
  return event.event_event || null;
}

function extractAccountId(event: any): string | null {
  return event.account_id || null;
}

function extractProposalDetails(event: any) {
  const eventData = event.event_data?.[0] || {};
  return {
    proposalId: eventData.proposal_id,
    proposal_id: eventData.proposal_id,
    title: eventData.title,
    description: eventData.description,
    link: eventData.link,
    proposer_id: eventData.proposer_id,
    voting_options: eventData.voting_options,
    reviewer_id: eventData.reviewer_id,
    voting_start_time_ns: eventData.voting_start_time_ns,
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
            path: "action.FunctionCall.receiver_id",
            operator: { Equals: VOTING_CONTRACT_ID },
          },
          {
            path: "event_event",
            operator: { Equals: "approve_proposal" },
          },
          {
            path: "action.FunctionCall.method_name",
            operator: { Equals: "approve_proposal" },
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

        // Store for debugging
        debugInfo.lastWebSocketMessage = text;
        debugInfo.lastEventTime = new Date().toISOString();
        debugInfo.wsMessageCount++;

        console.log("📨 Raw WebSocket message:", text);

        if (!text.startsWith("{") && !text.startsWith("[")) {
          console.log("📨 WebSocket message (non-JSON):", text);
          return;
        }

        const events = JSON.parse(text);
        console.log("📨 Parsed events:", JSON.stringify(events, null, 2));
        const eventArray = Array.isArray(events) ? events : [events];

        for (const event of eventArray) {
          const proposalId = extractProposalId(event);
          const eventType = extractEventType(event);
          const accountId = extractAccountId(event);

          if (accountId && accountId !== VOTING_CONTRACT_ID) {
            continue;
          }

          if (!proposalId || !eventType) {
            continue;
          }

          console.log(`🎯 PROCESSING ${eventType} for proposal ${proposalId}`);
          const eventDetails = extractProposalDetails(event);

          if (
            eventType === "approve_proposal" ||
            eventType.includes("approve")
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

// Start the server
const port = Number(process.env.PORT || "3000");

console.log(`🚀 Starting Proposal Reviewer Agent`);

// Start proposal monitoring
if (VOTING_CONTRACT_ID) {
  setTimeout(() => {
    console.log(
      `📋 Starting NEAR proposal monitoring for ${VOTING_CONTRACT_ID}...`
    );
    startEventStream();
  }, 2000);
}

serve({ fetch: app.fetch, port });
