import { useState, useEffect, useRef } from "react";
import { near } from "../hooks/fastnear.js";
import { Connect } from "./Connect.jsx";
import { Proposals } from "./Proposals.jsx";
import { Status } from "./Status.jsx";
import { Constants } from "../hooks/constants.js";

export function Home({ accountId }) {
  const [agentStatus, setAgentStatus] = useState(null);
  const [stats, setStats] = useState(null);
  const [isDeciding, setIsDeciding] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const hasFetchedRef = useRef(false);

  // Status
  const wsConnected = !!stats?.monitoring?.eventStreamConnected;
  const agentRegistered = !!agentStatus?.agentContract?.agentRegistered;

  // Fetch agent data
  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    fetchAllAgentData();
  }, []);

  const fetchAllAgentData = async () => {
    try {
      await Promise.all([
        fetchAgentStatus(),
        fetchStats(),
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
        voting_options: ["For", "Against", "Abstain"],
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

  const createSampleProposal = async () => {
    if (!accountId) {
      alert("Please sign in to create a proposal.");
      return;
    }

    setActionLoading("create");
    try {
      await near.sendTx({
        receiverId: Constants.VOTING_CONTRACT_ID,
        actions: [
          near.actions.functionCall({
            methodName: "create_proposal",
            gas: $$`300 Tgas`,
            deposit: $$`0.015 NEAR`,
            args: {
              metadata: {
                title: "AI Governance Product Research",
                description: "Experiment with autonomous delegate agents!",
                link: "https://gov.near.org",
                voting_options: ["For", "Against", "Abstain"],
              },
            },
          }),
        ],
        waitUntil: "INCLUDED",
      });
      console.log("Sample proposal transaction submitted, awaiting wallet signature.");
      fetchAllAgentData();
    } catch (error) {
      console.error("Failed to create sample proposal:", error);
      alert(`Failed to create sample: ${error.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const approveProposal = async () => {
    if (!accountId) {
      alert("Please sign in to approve a proposal.");
      return;
    }
    const proposalId = prompt("Enter proposal ID to approve (screening):", "");
    if (!proposalId) return;

    setActionLoading("approve");
    try {
      await near.sendTx({
        receiverId: Constants.VOTING_CONTRACT_ID,
        actions: [
          near.actions.functionCall({
            methodName: "approve_proposal",
            gas: $$`300 Tgas`,
            deposit: $$`1 yoctoNEAR`,
            args: { proposal_id: Number(proposalId), voting_start_time_sec: null },
          }),
        ],
        waitUntil: "INCLUDED",
      });
      console.log(`Proposal #${proposalId} approval transaction submitted.`);
      fetchAllAgentData();
    } catch (error) {
      console.error("Failed to approve proposal:", error);
      alert(`Approval failed: ${error.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const testEvaluation = async () => {
    const proposalId = prompt("Enter a proposal ID to evaluate:", "");

    if (!proposalId) {
      return;
    }

    setIsDeciding(true);
    setTestResult(null);

    try {
      const response = await fetch(`${Constants.API_URL}/api/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Evaluation request failed");
      }

      const data = await response.json();
      const reasonsText = Array.isArray(data.reasons)
        ? data.reasons.join("\n")
        : data.reasons || "No reasons provided.";

      setTestResult({ success: true, ...data });

      alert(
        `✅ Evaluation Complete!\n\nProposal #${data.proposalId}${
          data.proposalTitle ? `: ${data.proposalTitle}` : ""
        }\nRecommendation: ${data.recommendation}\nVerified from chain: ${
          data.verifiedFromChain ? "Yes" : "No"
        }\n\nReasons:\n${reasonsText}`
      );
    } catch (error) {
      console.error("Evaluation test failed:", error);
      setTestResult({ success: false, error: error.message });
      alert(`❌ Evaluation Failed: ${error.message}`);
    } finally {
      setIsDeciding(false);
    }
  };

  const manualVote = async () => {
    const proposalId = prompt("Enter proposal ID to vote on:", "");
    if (!proposalId) return;

    const voteOption = prompt(
      'Enter vote option ("For", "Against", "Abstain"):',
      "For"
    );
    if (!voteOption) return;

    setActionLoading("manualVote");
    try {
      const voteMap = { For: 0, Against: 1, Abstain: 2 };
      const voteValue = voteMap[voteOption];
      if (voteValue === undefined) {
        throw new Error("Invalid vote option");
      }

      const response = await fetch(`${Constants.API_URL}/api/manual-vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposalId, vote: voteValue }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Manual vote failed");
      }

      alert(
        `Manual vote sent.\nProposal #${proposalId}\nVote: ${voteOption}\nTransaction: ${data.transactionHash || "pending"}`
      );
    } catch (error) {
      console.error("Manual vote failed:", error);
      alert(`Manual vote failed: ${error.message}`);
    } finally {
      setActionLoading(null);
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
            <h3>Autonomous Voter</h3>
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
            <Connect accountId={accountId} />
            <button
              className="btn btn-success btn-sm"
              style={{ minWidth: "140px" }}
              onClick={createTestProposal}
              disabled={!accountId}
              title={!accountId ? "Sign in required" : "Create a proposal"}
            >
              📝 Create Proposal
            </button>
            <button
              className="btn btn-outline-success btn-sm"
              style={{ minWidth: "160px" }}
              onClick={createSampleProposal}
              disabled={!accountId || actionLoading === "create"}
              title={!accountId ? "Sign in required" : "Create sample proposal"}
            >
              {actionLoading === "create" ? "Creating..." : "Create Sample"}
            </button>
            <button
              className="btn btn-outline-warning btn-sm"
              style={{ minWidth: "160px" }}
              onClick={approveProposal}
              disabled={!accountId || actionLoading === "approve"}
              title={!accountId ? "Sign in required" : "Approve proposal"}
            >
              {actionLoading === "approve" ? "Approving..." : "Approve (Screen)"}
            </button>
            <button
              className="btn btn-outline-primary btn-sm"
              style={{ minWidth: "140px" }}
              onClick={testEvaluation}
              disabled={isDeciding}
            >
              {isDeciding ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2"></span>
                  Testing...
                </>
              ) : (
                <>Test Evaluation</>
              )}
            </button>
            <button
              className="btn btn-outline-secondary btn-sm"
              style={{ minWidth: "140px" }}
              onClick={manualVote}
              disabled={actionLoading === "manualVote"}
            >
              {actionLoading === "manualVote" ? "Voting..." : "Manual Vote"}
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
              {testResult.recommendation ? "evaluation" : "error"}
            </h6>

            {testResult.success && (
              <div>
                <p className="mb-1">
                  <strong>Proposal:</strong>{" "}
                  {testResult.proposalTitle
                    ? `${testResult.proposalTitle} (#${testResult.proposalId})`
                    : `#${testResult.proposalId}`}
                </p>
                <p className="mb-1">
                  <strong>Recommendation:</strong>{" "}
                  <span
                    className={
                      testResult.recommendation === "For"
                        ? "text-success"
                        : testResult.recommendation === "Against"
                        ? "text-danger"
                        : "text-secondary"
                    }
                  >
                    {testResult.recommendation}
                  </span>
                </p>
                <p className="mb-1">
                  <strong>Verified From Chain:</strong>{" "}
                  {testResult.verifiedFromChain ? "Yes" : "No"}
                </p>
                {testResult.reasons && (
                  <small>
                    Reasons:{" "}
                    {Array.isArray(testResult.reasons)
                      ? testResult.reasons.join(", ")
                      : testResult.reasons}
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
            agentAccountId={agentStatus?.agentContract?.agentAccountId}
            onRefreshAgent={fetchAllAgentData}
          />
        </div>
      </div>
    </div>
  );
}

export default Home;
