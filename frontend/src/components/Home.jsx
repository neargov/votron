import { useState, useEffect } from "react";
import { near } from "../hooks/fastnear.js";
import { Connect } from "./Connect.jsx";
import { Proposals } from "./Proposals.jsx";
import { Status } from "./Status.jsx";
import { Constants } from "../hooks/constants.js";

export function Home({ accountId }) {
  const [agentStatus, setAgentStatus] = useState(null);
  const [executionHistory, setExecutionHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [isDeciding, setIsDeciding] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  // Status
  const wsConnected = !!stats?.monitoring?.eventStreamConnected;
  const agentRegistered = !!agentStatus?.agentContract?.agentRegistered;

  // Fetch agent data
  useEffect(() => {
    fetchAllAgentData();

    // Refresh every 5 seconds
    const interval = setInterval(fetchAllAgentData, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchAllAgentData = async () => {
    try {
      await Promise.all([
        fetchAgentStatus(),
        fetchStats(),
        fetchExecutionHistory(),
      ]);
    } catch (error) {
      console.error("Failed to fetch agent data:", error);
    }
  };

  const fetchAgentStatus = async () => {
    try {
      const response = await fetch(`${Constants.API_URL}/api/agent-status`);
      if (response.ok) {
        const data = await response.json();
        setAgentStatus(data);
      } else {
        console.error("Failed to fetch agent status:", response.status);
      }
    } catch (error) {
      console.error("Failed to fetch agent status:", error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${Constants.API_URL}/api/vote/stats`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  };

  const fetchExecutionHistory = async () => {
    try {
      const response = await fetch(`${Constants.API_URL}/api/vote/history`);
      if (response.ok) {
        const data = await response.json();
        setExecutionHistory(data.history || []);
      }
    } catch (error) {
      console.error("Failed to fetch execution history:", error);
    }
  };

  const createTestProposal = async () => {
    if (!accountId) {
      alert("Please sign in to create a proposal.");
      return;
    }

    try {
      const defaultMetadata = {
        title:
          "NEAR Developer Education Platform: Comprehensive Tutorial Series",
        description: `
**Project Overview:**
Create a comprehensive educational platform with video tutorials, hands-on workshops, and interactive coding examples to onboard new developers to the NEAR ecosystem.

**Specific Deliverables:**
1. 20 high-quality video tutorials (15-30 minutes each) covering:
   - NEAR fundamentals and account model
   - Smart contract development with Rust
   - Frontend integration with near-api-js
   - Cross-contract calls and complex workflows
   - Testing and deployment best practices

2. Interactive coding playground with 15 pre-built examples
3. 4 live workshop sessions (2 hours each) with Q&A
4. Comprehensive documentation and code repositories
5. Developer certification program with completion badges

**Timeline:** 3 months
- Month 1: Content planning and first 8 tutorials
- Month 2: Remaining tutorials and interactive examples
- Month 3: Live workshops and platform polish

**Budget Breakdown:**
- Video production and editing: $8,000
- Platform development: $5,000
- Workshop hosting and coordination: $2,000
- Documentation and testing: $3,000
- Marketing and outreach: $2,000
**Total: $20,000**

**Team Qualifications:**
- Lead developer with 3+ years Rust experience
- Educational content creator with 50K+ YouTube subscribers
- Previous NEAR grant recipient with proven delivery record

**Success Metrics:**
- 500+ developers complete at least 5 tutorials
- 100+ developers earn certification
- 50+ new smart contracts deployed by graduates
- 4.5+ star average rating from participants

**Long-term Impact:**
This initiative will significantly expand NEAR's developer community, reduce onboarding friction, and create a sustainable education resource for future ecosystem growth.
  `,
        link: "https://near-dev-education.org",
        voting_options: ["Approve", "Reject"],
      };

      await near.sendTx({
        receiverId: Constants.VOTING_CONTRACT_ID,
        actions: [
          near.actions.functionCall({
            methodName: "create_proposal",
            gas: $$`100 Tgas`,
            deposit: $$`0.1 NEAR`,
            args: { metadata: defaultMetadata },
          }),
        ],
        waitUntil: "INCLUDED",
      });

      setTimeout(() => {
        fetchAllAgentData();
      }, 3000);
    } catch (error) {
      console.error("Failed to create proposal:", error);
    }
  };

  const testScreening = async () => {
    setIsDeciding(true);
    setTestResult(null);

    try {
      console.log("🤖 Testing AI voting...");

      const response = await fetch(
        `${Constants.API_URL}/api/vote/test-ai-voting`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposal: {
              title: "Test NEAR DeFi Protocol Development",
              description:
                "Building a new automated market maker (AMM) protocol for the NEAR ecosystem. Budget: $10,000 for 3 months of development. Our team has previous DeFi experience with Uniswap and PancakeSwap. The protocol will feature low slippage, multi-token pools, and yield farming capabilities.",
              proposer_id: "developer.testnet",
            },
          }),
        }
      );

      const result = await response.json();
      setTestResult(result);

      console.log("🤖 AI Test Result:", result);

      if (result.success) {
        const decision = result.aiDecision.approved ? "APPROVED" : "REJECTED";
        alert(
          `✅ AI Test Complete!\n\nDecision: ${decision}\n\nReasons:\n${result.aiDecision.reasons.join(
            "\n"
          )}`
        );
      } else {
        alert(`❌ AI Test Failed: ${result.error}`);
      }
    } catch (error) {
      console.error("AI test failed:", error);
      const errorResult = { success: false, error: error.message };
      setTestResult(errorResult);
      alert(`❌ Test Failed: ${error.message}`);
    } finally {
      setIsDeciding(false);
    }
  };

  const testExecution = async () => {
    setIsExecuting(true);
    setTestResult(null);

    try {
      // Get latest proposal ID dynamically
      const proposalsResponse = await fetch(
        `${Constants.API_URL}/api/proposals/shade.ballotbox.testnet`
      );
      const proposalsData = await proposalsResponse.json();

      if (!proposalsData.proposals || proposalsData.proposals.length === 0) {
        throw new Error("No proposals found");
      }

      // Get the latest proposal (highest ID)
      const latestProposal = proposalsData.proposals.reduce((latest, current) =>
        current.id > latest.id ? current : latest
      );

      const proposalId = latestProposal.id.toString();
      const proposalTitle = latestProposal.title;

      console.log(
        `🚀 Testing execution with latest proposal #${proposalId}: "${proposalTitle}"`
      );

      console.log(`🎯 Using proposal #${proposalId}: "${proposalTitle}"`);

      // Step 1: Clear backend execution history to reset "already executed" status
      console.log("🧹 Clearing backend execution history first...");
      try {
        const clearResponse = await fetch(
          `${Constants.API_URL}/api/vote/history`,
          { method: "DELETE" }
        );
        if (clearResponse.ok) {
          console.log("✅ Backend history cleared successfully");
        } else {
          console.log(
            "⚠️ Could not clear backend history, continuing anyway..."
          );
        }
      } catch (e) {
        console.log("⚠️ Error clearing history, continuing anyway...", e);
      }

      // Step 2: Check the ACTUAL proposal status from the voting contract
      console.log("📊 Checking actual proposal status from voting contract...");

      let actualProposalStatus = latestProposal.status || "Created";
      console.log(
        `📋 Found proposal #${proposalId} with status: ${actualProposalStatus}`
      );

      // Step 3: Determine execution reason based on ACTUAL status
      let executionReason = "";
      if (
        actualProposalStatus === "CREATED" ||
        actualProposalStatus === "PENDING"
      ) {
        executionReason = `Proposal status is ${actualProposalStatus} - needs execution to become VOTING/ACTIVE`;
      } else if (
        actualProposalStatus === "VOTING" ||
        actualProposalStatus === "ACTIVE"
      ) {
        executionReason = `Proposal already ${actualProposalStatus} - testing re-execution`;
      } else {
        executionReason = `Status is ${actualProposalStatus} - testing execution`;
      }

      console.log(`🔍 Execution reason: ${executionReason}`);

      // Step 4: Execute the proposal (should work now that history is cleared)
      console.log(`🚀 Executing proposal #${proposalId}...`);

      const executionResponse = await fetch(
        `${Constants.API_URL}/api/vote/execute/${proposalId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: true }),
        }
      );

      const executionResult = await executionResponse.json();
      console.log("🚀 Agent Contract Execution Result:", executionResult);

      setTestResult(executionResult);

      if (executionResult.success) {
        const summary = `✅ Agent Contract Execution Complete!

Proposal ID: #${executionResult.proposalId}
Title: "${proposalTitle}"

🔄 BEFORE: Status was ${actualProposalStatus}
⚡ EXECUTION: ${executionReason}
✅ AFTER: Check if status changed to VOTING/ACTIVE

Transaction Hash: ${executionResult.execution.transactionHash}
Timestamp: ${new Date(executionResult.execution.timestamp).toLocaleTimeString()}

🔗 View on NearBlocks: https://nearblocks.io/txns/${
          executionResult.execution.transactionHash
        }

💡 To verify success: Refresh the page and check if proposal #${proposalId} status changed to VOTING/ACTIVE`;

        alert(summary);

        // Refresh proposals to see if status changed
        if (typeof refetchProposals === "function") {
          console.log("🔄 Refreshing proposals to check status change...");
          setTimeout(() => refetchProposals(), 1000); // Wait 1 second for blockchain update
        }
      } else {
        let errorMsg = `❌ Agent Contract Execution Still Failed: ${executionResult.error}

Current proposal status: ${actualProposalStatus}
${executionReason}

Even after clearing backend history, the execution failed.
This suggests a deeper issue with the agent contract or cross-contract call.`;

        alert(errorMsg);
      }
    } catch (error) {
      console.error("Real execution test failed:", error);
      const errorResult = {
        success: false,
        error: error.message,
        type: "agent_contract_execution",
      };
      setTestResult(errorResult);

      alert(`❌ Agent Contract Execution Failed: ${error.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="container-fluid">
      <div className="panel">
        {/* Header */}
        <div className="mb-4">
          <div className="mb-2">
            <h2 className="mb-0">🤖 Votron</h2>
          </div>
          <div className="mb-1">
            <h3>Autonomous Reviewer</h3>
          </div>

          {/* Real-time status */}
          <div className="row mb-4">
            <div className="d-flex align-items-center p-3 mb-1">
              <span>
                {wsConnected ? (
                  <>
                    🟢 <b>WebSocket:</b> Connected
                  </>
                ) : (
                  <>
                    🔴 <b>WebSocket:</b> Not Connected
                  </>
                )}
              </span>
            </div>

            <div className="d-flex align-items-center p-3">
              <span>
                {agentRegistered ? (
                  <>
                    ☑️ <b>Agent:</b> Registered
                  </>
                ) : (
                  <>
                    ⚠️ <b>Agent:</b> Not Registered
                  </>
                )}
              </span>
            </div>
          </div>

          {/* Buttons for Testing */}
          <div className="d-flex gap-2 flex-wrap">
            {/* <Connect accountId={accountId} />
            <button
              className="btn btn-success btn-sm"
              style={{ minWidth: "140px" }}
              onClick={createTestProposal}
              disabled={!accountId}
              title={!accountId ? "Sign in required" : "Create a proposal"}
            >
              📝 Create Proposal
            </button> */}
            <button
              className="btn btn-outline-primary btn-sm"
              style={{ minWidth: "140px" }}
              onClick={testScreening}
              disabled={isDeciding}
            >
              {isDeciding ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2"></span>
                  Testing...
                </>
              ) : (
                <>Test Decision</>
              )}
            </button>
            <button
              className="btn btn-outline-primary btn-sm"
              style={{ minWidth: "140px" }}
              onClick={testExecution}
              disabled={isExecuting}
            >
              {isExecuting ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2"></span>
                  Executing...
                </>
              ) : (
                <> Test Approval</>
              )}
            </button>
          </div>
        </div>

        {/* Test Results */}
        {testResult && (
          <div
            className={`mt-3 p-3 rounded ${
              testResult.success
                ? "bg-light border-success"
                : "bg-light border-danger"
            }`}
          >
            <h6 className={testResult.success ? "text-success" : "text-danger"}>
              {testResult.success ? "✅" : "❌"} Test Result:{" "}
              {testResult.testType}
            </h6>

            {testResult.success &&
              testResult.testType === "ai_evaluation_only" && (
                <div>
                  <p>
                    <strong>AI Decision:</strong>
                    <span
                      className={
                        testResult.aiDecision.approved
                          ? "text-success"
                          : "text-warning"
                      }
                    >
                      {testResult.aiDecision.approved
                        ? " APPROVED"
                        : " REJECTED"}
                    </span>
                  </p>
                  <small>
                    Reasons: {testResult.aiDecision.reasons.join(", ")}
                  </small>
                </div>
              )}

            {testResult.success && testResult.testType === "execution_test" && (
              <div>
                <p>
                  <strong>Proposal:</strong> {testResult.proposalId}
                </p>
                <p>
                  <strong>Result:</strong>{" "}
                  {testResult.execution.action.toUpperCase()}
                </p>
                {testResult.execution.transactionHash && (
                  <small>
                    TX: {testResult.execution.transactionHash.substring(0, 20)}
                    ...
                  </small>
                )}
              </div>
            )}

            {!testResult.success && (
              <p className="text-danger">{testResult.error}</p>
            )}
          </div>
        )}

        {/* Workflow Tracking */}
        <div className="mb-5">
          <Status />
        </div>

        {/* List of All Proposals */}
        <div className="mb-4">
          <Proposals
            accountId={accountId}
            executionHistory={executionHistory}
            onRefreshAgent={fetchAllAgentData}
          />
        </div>
      </div>
    </div>
  );
}

export default Home;
