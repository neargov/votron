import { Hono } from "hono";
import { agent, agentAccountId, agentInfo } from "@neardefi/shade-agent-js";
import { Voter } from "../voter";
import { fetchProposalInfo, type ProposalData } from "../voting-utils";

interface RouteConfig {
  get eventClient(): any;
  get isConnecting(): boolean;
  get reconnectAttempts(): number;
  maxReconnectAttempts: number;
  VOTING_CONTRACT_ID: string;
  NEAR_RPC_JSON: string;
}

export default function createAgentRoutes(
  voter: Voter,
  config: RouteConfig
) {
  const routes = new Hono();
  // Main voting endpoint
  routes.post("/", async (c) => {
    try {
      const { proposalId } = await c.req.json();

      if (!proposalId) {
        return c.json({ error: "proposalId required" }, 400);
      }

      let canonicalProposal: ProposalData;
      try {
        canonicalProposal = await fetchProposalInfo(
          proposalId,
          config.VOTING_CONTRACT_ID,
          config.NEAR_RPC_JSON
        );
      } catch (error: any) {
        return c.json(
          {
            error: `Failed to load proposal ${proposalId} from chain: ${error.message}`,
          },
          500
        );
      }

      const result = await voter.evaluateProposal(
        proposalId,
        canonicalProposal
      );

      return c.json({
        proposalId,
        selectedOption: result.selectedOption,
        reasons: result.reasons,
        executed: !!result.executionResult,
        transactionHash: result.executionResult?.transactionHash,
        timestamp: result.timestamp,
      });
    } catch (error) {
      console.error("❌ Vote endpoint error:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return c.json({ error: errorMessage }, 500);
    }
  });

  routes.get("/status/:proposalId", (c) => {
    const proposalId = c.req.param("proposalId");
    const voteDecision = voter.getVoteDecision(proposalId);
    const executionStatus = voter.getExecutionStatus(proposalId);

    if (!voteDecision) {
      return c.json({
        proposalId,
        evaluated: false,
        message: "Proposal not yet evaluated",
      });
    }

    return c.json({
      proposalId,
      evaluated: true,
      selectedOption: voteDecision.selectedOption,
      reasons: voteDecision.reasons,
      timestamp: voteDecision.timestamp,
      executed: !!executionStatus?.executed,
      executionStatus,
    });
  });

  routes.get("/status", async (c) => {
    try {
      const voteHistory = voter.getVoteHistory();
      const executionStats = voter.getExecutionStats();

      const forVotes = voteHistory.filter(
        (r) => r.selectedOption === "For"
      ).length;
      const againstVotes = voteHistory.filter(
        (r) => r.selectedOption === "Against"
      ).length;
      const abstainVotes = voteHistory.filter(
        (r) => r.selectedOption === "Abstain"
      ).length;

      return c.json({
        configured: !!(config.VOTING_CONTRACT_ID && voter.agentAccountId),
        agentAccount: voter.agentAccountId,
        votingContract: config.VOTING_CONTRACT_ID,
        voting: {
          totalEvaluated: voteHistory.length,
          decisions: {
            for: forVotes,
            against: againstVotes,
            abstain: abstainVotes,
          },
          lastEvaluated:
            voteHistory.length > 0
              ? voteHistory[voteHistory.length - 1].timestamp
              : null,
        },
        execution: {
          totalExecutions: executionStats.total,
          successful: executionStats.successful,
          failed: executionStats.failed,
          pending: executionStats.pending,
          lastExecution: executionStats.lastExecution,
        },
      });
    } catch (error) {
      return c.json({
        configured: false,
        totalVotes: voter.getVoteHistory().length,
        error: "Could not fetch complete status",
      });
    }
  });

  routes.get("/results", async (c) => {
    const results = voter.getVoteHistory();
    return c.json({
      results: results.map((r) => ({
        proposalId: r.proposalId,
        selectedOption: r.selectedOption,
        reasons: r.reasons,
        executed: voter.isProposalExecuted(r.proposalId),
        timestamp: r.timestamp,
      })),
      total: results.length,
    });
  });

  routes.get("/agent-info", async (c) => {
    try {
      const accountInfo = await agentAccountId();
      const agentDetails = await agentInfo();

      return c.json({
        agentAccountId: accountInfo.accountId,
        agentInfo: agentDetails,
        configuredAccountId: voter.agentAccountId,
        votingContract: config.VOTING_CONTRACT_ID,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return c.json({ error: errorMessage }, 500);
    }
  });

  routes.get("/stats", (c) => {
    const voteHistory = voter.getVoteHistory();
    const recentExecutions = voter.getRecentExecutions(5);
    const executionStats = voter.getExecutionStats();

    const forVotes = voteHistory.filter(
      (r) => r.selectedOption === "For"
    ).length;
    const againstVotes = voteHistory.filter(
      (r) => r.selectedOption === "Against"
    ).length;
    const abstainVotes = voteHistory.filter(
      (r) => r.selectedOption === "Abstain"
    ).length;

    return c.json({
      voting: {
        totalVotes: voteHistory.length,
        decisions: {
          for: forVotes,
          against: againstVotes,
          abstain: abstainVotes,
        },
        lastActivity:
          voteHistory.length > 0
            ? voteHistory[voteHistory.length - 1].timestamp
            : null,
      },
      execution: {
        total: executionStats.total,
        successful: executionStats.successful,
        failed: executionStats.failed,
        pending: executionStats.pending,
        recentExecutions,
      },
      monitoring: {
        eventStreamConnected: !!config.eventClient,
        isConnecting: config.isConnecting,
        reconnectAttempts: config.reconnectAttempts,
      },
    });
  });

  routes.get("/history", (c) => {
    const history = voter.getRecentExecutions(10);
    const stats = voter.getExecutionStats();

    return c.json({
      executions: history,
      stats: {
        total: stats.total,
        successful: stats.successful,
        failed: stats.failed,
      },
      timestamp: new Date().toISOString(),
    });
  });

  routes.get("/balance", async (c) => {
    try {
      const balance = await agent("getBalance");
      const accountId = await agentAccountId();

      return c.json({
        agentAccount: accountId.accountId,
        balance: balance,
        balanceInNEAR: balance.available
          ? (
              BigInt(balance.available) / BigInt("1000000000000000000000000")
            ).toString()
          : "unknown",
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      return c.json(
        {
          error: error.message,
          timestamp: new Date().toISOString(),
        },
        500
      );
    }
  });

  routes.delete("/history", (c) => {
    voter.clearHistory();
    return c.json({
      message: "History cleared",
      timestamp: new Date().toISOString(),
    });
  });

  return routes;
}
