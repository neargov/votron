import { useState, useEffect, useRef } from "react";
import { Constants } from "../hooks/constants.js";

export function Status() {
  const [workflowSteps, setWorkflowSteps] = useState([
    {
      id: 1,
      name: "New Proposal Detected",
      status: "pending",
      timestamp: null,
      details: null,
    },
    {
      id: 2,
      name: "Content Sent to Claude AI",
      status: "pending",
      timestamp: null,
      details: null,
    },
    {
      id: 3,
      name: "AI Decision Received",
      status: "pending",
      timestamp: null,
      details: null,
    },
    {
      id: 4,
      name: "Execute Agent Contract Call",
      status: "pending",
      timestamp: null,
      details: null,
    },
  ]);

  const [currentStep, setCurrentStep] = useState(1);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [trackedProposalId, setTrackedProposalId] = useState(null);

  // Use refs to avoid stale closures and infinite re-renders
  const lastMessageCountRef = useRef(0);
  const lastProcessedMessageRef = useRef(null);
  const monitoringIntervalRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  const isTrackingRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => {
    isTrackingRef.current = isTracking;
  }, [isTracking]);

  useEffect(() => {
    const initializeMessageCount = async () => {
      try {
        const wsResponse = await fetch(
          `${Constants.API_URL}/api/debug/websocket-activity`
        );
        if (wsResponse.ok) {
          const wsData = await wsResponse.json();

          // Fix message count if there's a cached message but count is 0
          const actualCount =
            wsData.lastMessage && wsData.messageCount === 0
              ? 1
              : wsData.messageCount || 0;

          lastMessageCountRef.current = actualCount;
          lastProcessedMessageRef.current = wsData.lastMessage;
          setIsInitialized(true);

          console.log("🔧 Initialized with message count:", actualCount);
          console.log("🔧 Has cached message:", !!wsData.lastMessage);
        }
      } catch (error) {
        console.error("Failed to initialize message count:", error);
        setIsInitialized(true);
      }
    };

    initializeMessageCount();
  }, []); // Only run once

  useEffect(() => {
    if (!isInitialized) return;

    // Start monitoring interval ONCE
    const startMonitoring = () => {
      if (monitoringIntervalRef.current) {
        clearInterval(monitoringIntervalRef.current);
      }

      monitoringIntervalRef.current = setInterval(async () => {
        try {
          const wsResponse = await fetch(
            `${Constants.API_URL}/api/debug/websocket-activity`
          );
          if (wsResponse.ok) {
            const wsData = await wsResponse.json();

            console.log("🔍 WebSocket monitoring:", {
              isTracking: isTrackingRef.current,
              currentCount: wsData.messageCount,
              lastCount: lastMessageCountRef.current,
              hasMessage: !!wsData.lastMessage,
              messageChanged:
                wsData.lastMessage !== lastProcessedMessageRef.current,
            });

            // Always show live events in console
            if (
              wsData.lastMessage &&
              wsData.lastMessage !== lastProcessedMessageRef.current
            ) {
              try {
                const messageData = JSON.parse(wsData.lastMessage);
                const events = Array.isArray(messageData)
                  ? messageData
                  : [messageData];

                for (const event of events) {
                  if (event.event_event === "create_proposal") {
                    const proposalId = event.event_data?.[0]?.proposal_id;
                    const title = event.event_data?.[0]?.title;
                    console.log(
                      `🔥 LIVE WebSocket: New Proposal #${proposalId} - "${title}"`
                    );
                  }
                }
              } catch (e) {
                // Ignore parsing errors
              }
            }

            // Only process new messages if not already tracking
            if (!isTrackingRef.current) {
              if (
                wsData.lastMessage &&
                wsData.lastMessage !== lastProcessedMessageRef.current
              ) {
                console.log(`📨 New WebSocket message detected`);
                checkForNewProposal(wsData);
              }
            }

            // Update refs (not state to avoid re-renders)
            const actualCount =
              wsData.lastMessage && wsData.messageCount === 0
                ? 1
                : wsData.messageCount || 0;
            lastMessageCountRef.current = actualCount;
            lastProcessedMessageRef.current = wsData.lastMessage;
          }
        } catch (error) {
          console.error("Monitoring error:", error);
        }
      }, 2000);
    };

    startMonitoring();

    return () => {
      if (monitoringIntervalRef.current) {
        clearInterval(monitoringIntervalRef.current);
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [isInitialized]); // Only depend on isInitialized

  const cardStyle = {
    boxShadow: "0 0.125rem 0.25rem rgba(0, 0, 0, 0.075)",
    borderRadius: "0.5rem",
    border: "none",
  };

  const cardHeaderStyle = {
    backgroundColor: "#f8f9fa",
    borderBottom: "1px solid #dee2e6",
    borderRadius: "0.5rem 0.5rem 0 0",
    padding: "0.75rem 1rem",
  };

  const cardBodyStyle = {
    padding: "1rem",
  };

  const workflowItemStyle = {
    position: "relative",
    paddingLeft: "2rem",
    marginBottom: "1rem",
  };

  const timelineLineStyle = {
    position: "absolute",
    left: "0.75rem",
    top: "1.5rem",
    bottom: "-1rem",
    width: "2px",
    backgroundColor: "#dee2e6",
  };

  const timelineDotStyle = {
    position: "absolute",
    left: "0.375rem",
    top: "0.125rem",
    width: "1rem",
    height: "1rem",
    borderRadius: "50%",
    backgroundColor: "#fff",
    border: "2px solid #dee2e6",
    fontSize: "0.5rem",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const detailsBoxStyle = {
    backgroundColor: "#f8f9fa",
    borderRadius: "0.375rem",
    padding: "0.5rem 0.75rem",
    marginTop: "0.5rem",
    fontSize: "0.875rem",
  };

  const checkForNewProposal = (wsData) => {
    console.log("🔍 checkForNewProposal called with:", {
      hasMessage: !!wsData.lastMessage,
      messagePreview: wsData.lastMessage?.substring(0, 100),
    });

    const lastMessage = wsData.lastMessage;
    let hasNewProposal = false;
    let proposalId = null;
    let proposalData = null;

    if (lastMessage) {
      try {
        console.log("🔍 Raw WebSocket message:", lastMessage);
        const messageData = JSON.parse(lastMessage);
        const events = Array.isArray(messageData) ? messageData : [messageData];

        console.log("🔍 Parsed events:", events);

        for (const event of events) {
          const hasTxHash = event.transaction_id || event.receipt_id;
          const hasProposalId = event.event_data?.[0]?.proposal_id;
          const eventType = event.event_event;

          console.log("🔍 Event analysis:", {
            hasTxHash,
            hasProposalId,
            eventType,
            eventStructure: {
              hasEventData: !!event.event_data,
              hasEventEvent: !!event.event_event,
              hasTransactionId: !!event.transaction_id,
            },
          });

          if (hasTxHash && hasProposalId && eventType === "create_proposal") {
            hasNewProposal = true;
            proposalId = hasProposalId.toString();
            proposalData = event.event_data[0];

            console.log("✅ NEW PROPOSAL detected:", {
              eventType: eventType,
              txHash: event.transaction_id || event.receipt_id,
              proposalId: proposalId,
              title: proposalData.title,
            });
            break;
          }
        }
      } catch (e) {
        console.warn("Could not parse WebSocket message:", e);
      }
    }

    if (hasNewProposal && proposalId) {
      console.log(
        `🚀 Starting workflow tracking for NEW proposal ${proposalId}`
      );
      startWorkflowTracking(wsData, proposalId, proposalData);
    } else {
      console.log(
        "📊 WebSocket activity detected but not a new proposal creation"
      );
    }
  };

  const startWorkflowTracking = (wsData, proposalId, proposalData) => {
    if (isTrackingRef.current) {
      console.log("⚠️ Already tracking, ignoring duplicate");
      return;
    }

    setTrackedProposalId(proposalId);
    setIsTracking(true);
    console.log(`🔄 SET isTracking to TRUE for proposal ${proposalId}`);

    const detectionTime = new Date();
    console.log(`🔄 Started tracking proposal ${proposalId}`);

    // Step 1: Mark as complete immediately
    updateStep(1, "completed", detectionTime, {
      method: "WebSocket Event",
      proposalId: proposalId,
      title: proposalData?.title || `Proposal #${proposalId}`,
      proposer: proposalData?.proposer_id,
      txHash: wsData.lastMessage
        ? JSON.parse(wsData.lastMessage)[0]?.transaction_id
        : null,
    });

    // Step 2: Now active
    setCurrentStep(2);
    updateStep(2, "active", detectionTime, {
      action: "Sending to Claude AI for screening...",
    });

    // Start polling backend
    startPolling(proposalId);
  };

  const updateStep = (stepId, status, timestamp, details) => {
    setWorkflowSteps((prev) =>
      prev.map((step) =>
        step.id === stepId
          ? {
              ...step,
              status,
              timestamp,
              details: { ...step.details, ...details },
            }
          : step
      )
    );
  };

  const startPolling = (proposalId) => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    console.log(`🔄 Starting to poll for proposal ${proposalId}`);

    pollingIntervalRef.current = setInterval(async () => {
      console.log(`🔄 Polling attempt for proposal ${proposalId}...`);

      try {
        if (proposalId) {
          const proposalResponse = await fetch(
            `${Constants.API_URL}/api/vote/status/${proposalId}`
          );

          console.log(`📡 Response status: ${proposalResponse.status}`);

          if (proposalResponse.ok) {
            const proposalStatus = await proposalResponse.json();

            console.log(`📊 Proposal data:`, proposalStatus);

            if (proposalStatus.screened) {
              console.log(`✅ DETECTED: Proposal ${proposalId} was screened!`);

              const screeningTime = new Date(proposalStatus.timestamp);

              // Step 2: AI screening completed
              updateStep(2, "completed", screeningTime, {
                action: "Claude AI screening completed",
              });

              // Step 3: AI decision received
              const decision = proposalStatus.approved
                ? "APPROVED"
                : "NOT APPROVED";
              updateStep(3, "completed", screeningTime, {
                decision,
                reasons: proposalStatus.reasons,
              });

              setCurrentStep(proposalStatus.approved ? 4 : 5);

              // Step 4: Check execution
              if (proposalStatus.approved && proposalStatus.executed) {
                // COMPLETE: Proposal approved AND executed
                updateStep(4, "completed", new Date(), {
                  action: "Agent contract executed approval",
                  transactionHash:
                    proposalStatus.executionResult?.executionTxHash,
                });

                // Stop polling - workflow complete!
                console.log(
                  `✅ WORKFLOW COMPLETE: Proposal ${proposalId} executed`
                );
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
              } else if (proposalStatus.approved && !proposalStatus.executed) {
                // CONTINUE: Proposal approved but not yet executed
                updateStep(4, "active", new Date(), {
                  action: "Waiting for agent contract execution...",
                });

                // Keep polling for execution
                console.log(
                  `🔄 CONTINUE POLLING: Waiting for execution of proposal ${proposalId}`
                );
              } else {
                // SKIP: Proposal not approved
                updateStep(4, "skipped", new Date(), {
                  reason: "Proposal not approved by AI",
                });

                // Stop polling - workflow complete (but skipped execution)
                console.log(
                  `⏩ WORKFLOW COMPLETE: Proposal ${proposalId} not approved`
                );
                clearInterval(pollingIntervalRef.current);
                pollingIntervalRef.current = null;
              }
            } else {
              console.log(`⏳ Proposal ${proposalId} not yet screened`);
            }
          }
        }
      } catch (error) {
        console.error("❌ Polling error:", error);
      }
    }, 2000);

    console.log(`✅ setInterval created:`, pollingIntervalRef.current);
  };

  const resetWorkflow = async () => {
    console.log(`🔄 RESET WORKFLOW CALLED!`);

    setWorkflowSteps((prev) =>
      prev.map((step) => ({
        ...step,
        status: "pending",
        timestamp: null,
        details: null,
      }))
    );
    setCurrentStep(1);
    setIsTracking(false);
    setTrackedProposalId(null);

    // Refresh WebSocket state
    try {
      const wsResponse = await fetch(
        `${Constants.API_URL}/api/debug/websocket-activity`
      );
      if (wsResponse.ok) {
        const wsData = await wsResponse.json();
        const actualCount =
          wsData.lastMessage && wsData.messageCount === 0
            ? 1
            : wsData.messageCount || 0;
        lastMessageCountRef.current = actualCount;
        lastProcessedMessageRef.current = wsData.lastMessage;
      }
    } catch (error) {
      console.error("Failed to sync WebSocket state:", error);
    }

    if (pollingIntervalRef.current) {
      console.log(`🔄 CLEARING INTERVAL ${pollingIntervalRef.current}`);
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  };

  const manualTriggerFromCache = async () => {
    try {
      console.log("🧪 Manually checking cached WebSocket message...");

      const wsResponse = await fetch(
        `${Constants.API_URL}/api/debug/websocket-activity`
      );
      if (wsResponse.ok) {
        const wsData = await wsResponse.json();
        if (wsData.lastMessage) {
          checkForNewProposal(wsData);
        } else {
          alert("No cached WebSocket message found");
        }
      }
    } catch (error) {
      console.error("Manual trigger failed:", error);
      alert(`Manual trigger failed: ${error.message}`);
    }
  };

  const getStepColor = (step) => {
    switch (step.status) {
      case "completed":
        return "text-success";
      case "active":
        return "text-primary";
      case "skipped":
        return "text-warning";
      case "error":
        return "text-danger";
      default:
        return "text-muted";
    }
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "";
    return new Date(timestamp).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-1">
        {/* <button
            className="btn btn-outline-secondary btn-sm"
            onClick={manualTriggerFromCache}
            title="Process cached WebSocket message"
          >
            Check Cache
          </button> */}
        <h3>Shade Agent Workflow</h3>

        <button
          className="btn btn-outline-secondary btn-sm"
          onClick={resetWorkflow}
          title="Reset workflow tracking"
        >
          Reset
        </button>
      </div>
      <div style={cardStyle} className="bg-white">
        <div style={cardBodyStyle}>
          {!isTracking ? (
            <div className="text-center py-4">
              <div className="h6 text-muted mb-3">
                📡 Monitoring WebSocket for new proposals...
              </div>
              <small className="text-muted">
                Create a proposal or click "Check Cache" to view results from
                the latest one.
              </small>
            </div>
          ) : (
            <div className="workflow-steps" style={{ position: "relative" }}>
              {workflowSteps.map((step, index) => (
                <div key={step.id} style={workflowItemStyle}>
                  {/* Timeline line */}
                  {index < workflowSteps.length - 1 && (
                    <div style={timelineLineStyle}></div>
                  )}

                  {/* Timeline dot */}
                  <div
                    style={{
                      ...timelineDotStyle,
                      borderColor:
                        step.status === "completed"
                          ? "#198754"
                          : step.status === "active"
                          ? "#0d6efd"
                          : step.status === "skipped"
                          ? "#ffc107"
                          : "#dee2e6",
                      backgroundColor:
                        step.status === "completed"
                          ? "#198754"
                          : step.status === "active"
                          ? "#0d6efd"
                          : "#fff",
                    }}
                  >
                    {step.status === "active" && (
                      <div
                        className="spinner-border spinner-border-sm text-white"
                        style={{ width: "0.6rem", height: "0.6rem" }}
                      ></div>
                    )}
                  </div>

                  {/* Step content */}
                  <div>
                    <div className="d-flex justify-content-between align-items-center">
                      <span className={`fw-semibold ${getStepColor(step)}`}>
                        Step {step.id}: {step.name}
                      </span>
                      {step.timestamp && (
                        <small className="text-muted">
                          {formatTimestamp(step.timestamp)}
                        </small>
                      )}
                    </div>

                    {step.details && (
                      <div style={detailsBoxStyle} className="text-muted">
                        {step.details.proposalId && (
                          <div className="mb-1">
                            📝 Proposal ID: #{step.details.proposalId}
                          </div>
                        )}
                        {step.details.title && (
                          <div className="mb-1">
                            📄 Title: {step.details.title}
                          </div>
                        )}
                        {step.details.proposer && (
                          <div className="mb-1">
                            👤 Proposer: {step.details.proposer}
                          </div>
                        )}
                        {step.details.txHash && (
                          <div className="mb-1">
                            🔗 Transaction:{" "}
                            <a
                              href={`https://explorer.testnet.near.org/transactions/${step.details.txHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary text-decoration-none"
                            >
                              {step.details.txHash.substring(0, 12)}...
                            </a>
                          </div>
                        )}
                        {step.details.method && (
                          <div className="mb-1">
                            📡 Method: {step.details.method}
                          </div>
                        )}
                        {step.details.decision && (
                          <div
                            className={`mb-1 fw-bold ${
                              step.details.decision === "APPROVED"
                                ? "text-success"
                                : "text-warning"
                            }`}
                          >
                            🤖 AI Decision: {step.details.decision}
                          </div>
                        )}
                        {step.details.action && (
                          <div className="mb-1">⚡ {step.details.action}</div>
                        )}
                        {step.details.reason && (
                          <div className="mb-1">💭 {step.details.reason}</div>
                        )}
                        {step.details.executions && (
                          <div className="mb-1">
                            🚀 Executions: {step.details.executions}
                          </div>
                        )}
                        {step.details.totalScreened && (
                          <div className="mb-1">
                            📊 Total Screened: {step.details.totalScreened}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
