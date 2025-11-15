import { useState, useEffect } from "react";
import { Constants } from "../hooks/constants.js";

export function Settings() {
  const [agentStatus, setAgentStatus] = useState(null);
  const [autoApprovalStats, setAutoApprovalStats] = useState(null);
  const [executionHistory, setExecutionHistory] = useState(null);
  const [websocketStatus, setWebsocketStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [testResults, setTestResults] = useState(null);

  useEffect(() => {
    fetchAllAgentData();

    // Auto-refresh every 10 seconds for live monitoring
    const interval = setInterval(fetchAllAgentData, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchAllAgentData = async () => {
    await Promise.all([
      fetchAgentStatus(),
      fetchAutoApprovalStats(),
      fetchExecutionHistory(),
      fetchWebsocketStatus(),
    ]);
  };

  const fetchAgentStatus = async () => {
    try {
      const response = await fetch(`${Constants.API_URL}/api/agent-status`);
      if (response.ok) {
        const data = await response.json();
        setAgentStatus(data);
      }
    } catch (error) {
      console.error("Failed to fetch agent status:", error);
    }
  };

  const fetchAutoApprovalStats = async () => {
    try {
      const response = await fetch(`${Constants.API_URL}/api/vote/stats`);
      if (response.ok) {
        const data = await response.json();
        setAutoApprovalStats(data);
      }
    } catch (error) {
      console.error("Failed to fetch auto-approval stats:", error);
    }
  };

  const fetchExecutionHistory = async () => {
    try {
      const response = await fetch(`${Constants.API_URL}/api/vote/history`);
      if (response.ok) {
        const data = await response.json();
        setExecutionHistory(data);
      }
    } catch (error) {
      console.error("Failed to fetch execution history:", error);
    }
  };

  const fetchWebsocketStatus = async () => {
    try {
      const response = await fetch(
        `${Constants.API_URL}/api/debug/websocket-status`
      );
      if (response.ok) {
        const data = await response.json();
        setWebsocketStatus(data);
      }
    } catch (error) {
      console.error("Failed to fetch WebSocket status:", error);
    }
  };

  const runDiagnostics = async () => {
    setLoading(true);
    setTestResults(null);

    const results = {
      timestamp: new Date().toLocaleString(),
      tests: [],
    };

    try {
      // Test 1: API Health Check
      try {
        const healthResponse = await fetch(`${Constants.API_URL}/`);
        const healthData = await healthResponse.json();
        results.tests.push({
          name: "API Health Check",
          status: "success",
          message: `Server running, uptime: ${healthData.uptime}s, screener: ${healthData.screener?.status}`,
        });
      } catch (error) {
        results.tests.push({
          name: "API Health Check",
          status: "error",
          message: error.message,
        });
      }

      // Test 2: Agent Contract Status
      try {
        const statusResponse = await fetch(
          `${Constants.API_URL}/api/agent-status`
        );
        const statusData = await statusResponse.json();
        results.tests.push({
          name: "Agent Contract Status",
          status: statusData.agentContract?.agentRegistered
            ? "success"
            : "warning",
          message: `Registered: ${
            statusData.agentContract?.agentRegistered ? "Yes" : "No"
          }, Balance: ${
            statusData.agentContract?.contractBalance || "Unknown"
          }`,
        });
      } catch (error) {
        results.tests.push({
          name: "Agent Contract Status",
          status: "error",
          message: error.message,
        });
      }

      // Test 3: WebSocket Connection
      try {
        const wsResponse = await fetch(
          `${Constants.API_URL}/api/debug/websocket-status`
        );
        const wsData = await wsResponse.json();
        results.tests.push({
          name: "WebSocket Connection",
          status: wsData.connected ? "success" : "warning",
          message: `Connected: ${
            wsData.connected ? "Yes" : "No"
          }, Reconnect attempts: ${wsData.reconnectAttempts}`,
        });
      } catch (error) {
        results.tests.push({
          name: "WebSocket Connection",
          status: "error",
          message: error.message,
        });
      }

      // Test 4: Auto-Approval System
      try {
        const statsResponse = await fetch(
          `${Constants.API_URL}/api/vote/stats`
        );
        const statsData = await statsResponse.json();
        results.tests.push({
          name: "Auto-Approval System",
          status: "success",
          message: `Screened: ${
            statsData.autoApproval?.totalScreened || 0
          }, Executed: ${statsData.autoApproval?.executed || 0}, Failed: ${
            statsData.autoApproval?.executionFailed || 0
          }`,
        });
      } catch (error) {
        results.tests.push({
          name: "Auto-Approval System",
          status: "error",
          message: error.message,
        });
      }

      // Test 5: Agent Approval Test
      try {
        const approvalResponse = await fetch(
          `${Constants.API_URL}/api/agent-approve`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              proposalId: "test-diagnostics",
              force: true,
            }),
          }
        );

        const approvalData = await approvalResponse.json();

        if (approvalResponse.ok && approvalData.success) {
          results.tests.push({
            name: "Agent Contract Test",
            status: "success",
            message: `Agent contract approval test successful`,
          });
        } else {
          results.tests.push({
            name: "Agent Contract Test",
            status: "warning",
            message: approvalData.error || "Agent approval test failed",
          });
        }
      } catch (error) {
        results.tests.push({
          name: "Agent Contract Test",
          status: "error",
          message: error.message,
        });
      }

      // Test 6: Environment Check
      try {
        const envResponse = await fetch(`${Constants.API_URL}/debug/env`);
        const envData = await envResponse.json();
        results.tests.push({
          name: "Environment Check",
          status: envData.hasNearAiKey ? "success" : "warning",
          message: `NEAR AI Cloud API: ${
            envData.hasNearAiKey ? "Configured" : "Missing"
          }, Agent: ${envData.agentAccountId || "Missing"}`,
        });
      } catch (error) {
        results.tests.push({
          name: "Environment Check",
          status: "error",
          message: error.message,
        });
      }

      setTestResults(results);
      await fetchAllAgentData();
    } catch (error) {
      setTestResults({
        timestamp: new Date().toLocaleString(),
        error: error.message,
        tests: [],
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const colors = {
      success: "bg-success",
      warning: "bg-warning text-dark",
      error: "bg-danger",
    };
    return colors[status] || "bg-secondary";
  };

  return (
    <div className="container-fluid">
      <div className="panel">
        <div className="d-flex justify-content-between align-items-center mb-4">
          <h2>⚙️ Shade Agent Management</h2>
          <div className="d-flex gap-2">
            <button
              className="btn btn-outline-secondary btn-sm"
              onClick={fetchAllAgentData}
              disabled={loading}
            >
              🔄 Refresh
            </button>
            <button
              className="btn btn-primary"
              onClick={runDiagnostics}
              disabled={loading}
            >
              {loading
                ? "🔄 Running Diagnostics..."
                : "🧪 Run Full Diagnostics"}
            </button>
          </div>
        </div>

        {/* System Configuration */}
        <div className="card mb-4">
          <div className="card-header">
            <h5>🔧 System Configuration</h5>
          </div>
          <div className="card-body">
            <div className="row">
              <div className="col-md-6">
                <p>
                  <strong>Voting Contract:</strong>{" "}
                  <code>{Constants.VOTING_CONTRACT_ID}</code>
                </p>
                <p>
                  <strong>Agent Contract:</strong>{" "}
                  <code>{Constants.AGENT_ACCOUNT_ID}</code>
                </p>
                <p>
                  <strong>TEE API Endpoint:</strong>{" "}
                  <code>{Constants.API_URL}</code>
                </p>
              </div>
              <div className="col-md-6">
                {agentStatus?.agentContract && (
                  <>
                    <p>
                      <strong>Agent Registration:</strong>
                      <span
                        className={`badge ms-2 ${
                          agentStatus.agentContract.agentRegistered
                            ? "bg-success"
                            : "bg-danger"
                        }`}
                      >
                        {agentStatus.agentContract.agentRegistered
                          ? "Registered"
                          : "Not Registered"}
                      </span>
                    </p>
                    <p>
                      <strong>Contract Balance:</strong>{" "}
                      {agentStatus.agentContract.contractBalance || "Unknown"}{" "}
                      yoctoNEAR
                    </p>
                    <p>
                      <strong>Auto-Approval:</strong>
                      <span
                        className={`badge ms-2 ${
                          agentStatus.autoApproval?.enabled
                            ? "bg-success"
                            : "bg-warning text-dark"
                        }`}
                      >
                        {agentStatus.autoApproval?.enabled
                          ? "Enabled"
                          : "Disabled"}
                      </span>
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Real-time Status Dashboard */}
        <div className="row mb-4">
          <div className="col-md-4">
            <div className="card border-primary">
              <div className="card-header">
                <h6>📊 Processing Statistics</h6>
              </div>
              <div className="card-body">
                {autoApprovalStats?.autoApproval ? (
                  <div className="row text-center">
                    <div className="col-6">
                      <div className="h4 text-primary mb-0">
                        {autoApprovalStats.autoApproval.totalScreened}
                      </div>
                      <small>Screened</small>
                    </div>
                    <div className="col-6">
                      <div className="h4 text-success mb-0">
                        {autoApprovalStats.autoApproval.executed}
                      </div>
                      <small>Executed</small>
                    </div>
                    <div className="col-6 mt-2">
                      <div className="h4 text-warning mb-0">
                        {autoApprovalStats.autoApproval.pending}
                      </div>
                      <small>Pending</small>
                    </div>
                    <div className="col-6 mt-2">
                      <div className="h4 text-danger mb-0">
                        {autoApprovalStats.autoApproval.executionFailed}
                      </div>
                      <small>Failed</small>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted text-center">
                    Loading statistics...
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="col-md-4">
            <div className="card border-info">
              <div className="card-header">
                <h6>🔌 Connection Status</h6>
              </div>
              <div className="card-body">
                {websocketStatus && autoApprovalStats?.monitoring ? (
                  <>
                    <div className="d-flex justify-content-between mb-2">
                      <span>WebSocket:</span>
                      <span
                        className={`badge ${
                          autoApprovalStats.monitoring.eventStreamConnected
                            ? "bg-success"
                            : "bg-danger"
                        }`}
                      >
                        {autoApprovalStats.monitoring.eventStreamConnected
                          ? "Connected"
                          : "Disconnected"}
                      </span>
                    </div>
                    <div className="d-flex justify-content-between mb-2">
                      <span>Connecting:</span>
                      <span
                        className={`badge ${
                          websocketStatus.isConnecting
                            ? "bg-warning text-dark"
                            : "bg-secondary"
                        }`}
                      >
                        {websocketStatus.isConnecting ? "Yes" : "No"}
                      </span>
                    </div>
                    <div className="d-flex justify-content-between mb-2">
                      <span>Reconnects:</span>
                      <span className="badge bg-info">
                        {websocketStatus.reconnectAttempts}
                      </span>
                    </div>
                    <small className="text-muted">
                      Contract: {websocketStatus.votingContract}
                    </small>
                  </>
                ) : (
                  <p className="text-muted">Loading connection status...</p>
                )}
              </div>
            </div>
          </div>

          <div className="col-md-4">
            <div className="card border-success">
              <div className="card-header">
                <h6>🛡️ Security Features</h6>
              </div>
              <div className="card-body">
                {agentStatus?.securityFeatures ? (
                  <>
                    <div className="d-flex justify-content-between mb-2">
                      <span>TEE Attestation:</span>
                      <span
                        className={`badge ${
                          agentStatus.securityFeatures.attestationRequired
                            ? "bg-success"
                            : "bg-warning text-dark"
                        }`}
                      >
                        {agentStatus.securityFeatures.attestationRequired
                          ? "Required"
                          : "Optional"}
                      </span>
                    </div>
                    <div className="d-flex justify-content-between mb-2">
                      <span>Codehash Validation:</span>
                      <span
                        className={`badge ${
                          agentStatus.securityFeatures.codehashValidation
                            ? "bg-success"
                            : "bg-warning text-dark"
                        }`}
                      >
                        {agentStatus.securityFeatures.codehashValidation
                          ? "Active"
                          : "Inactive"}
                      </span>
                    </div>
                    <div className="d-flex justify-content-between">
                      <span>Access Control:</span>
                      <span className="badge bg-info">
                        {agentStatus.securityFeatures.accessControl}
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-muted">Loading security info...</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Execution History */}
        {executionHistory?.executions &&
          executionHistory.executions.length > 0 && (
            <div className="card mb-4">
              <div className="card-header">
                <h5>📋 Recent Agent Activity</h5>
              </div>
              <div className="card-body">
                <div className="table-responsive">
                  <table className="table table-sm">
                    <thead>
                      <tr>
                        <th>Proposal ID</th>
                        <th>Status</th>
                        <th>Method</th>
                        <th>Transaction</th>
                        <th>Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {executionHistory.executions
                        .slice(0, 10)
                        .map((execution, i) => (
                          <tr key={i}>
                            <td>#{execution.proposalId}</td>
                            <td>
                              <span
                                className={`badge ${
                                  execution.success ? "bg-success" : "bg-danger"
                                }`}
                              >
                                {execution.success ? "Success" : "Failed"}
                              </span>
                            </td>
                            <td>
                              {execution.executionTxHash ? (
                                <a
                                  href={`https://explorer.testnet.near.org/transactions/${execution.executionTxHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-decoration-none"
                                >
                                  <small>
                                    {execution.executionTxHash.substring(0, 8)}
                                    ...
                                  </small>
                                </a>
                              ) : (
                                <small className="text-muted">N/A</small>
                              )}
                            </td>
                            <td>
                              <small>
                                {new Date(
                                  execution.executedAt || execution.attemptedAt
                                ).toLocaleString()}
                              </small>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-muted small">
                  Showing latest{" "}
                  {Math.min(10, executionHistory.executions.length)} of{" "}
                  {executionHistory.totalExecutions} total executions
                </div>
              </div>
            </div>
          )}

        {/* Diagnostic Results */}
        {testResults && (
          <div className="card mb-4">
            <div className="card-header">
              <h5>🧪 Diagnostic Results ({testResults.timestamp})</h5>
            </div>
            <div className="card-body">
              {testResults.error ? (
                <div className="alert alert-danger">
                  <strong>Diagnostics Failed:</strong> {testResults.error}
                </div>
              ) : (
                <div>
                  {testResults.tests.map((test, index) => (
                    <div
                      key={index}
                      className="d-flex justify-content-between align-items-center mb-2 p-3 border rounded"
                    >
                      <div>
                        <strong>{test.name}</strong>
                        <br />
                        <small className="text-muted">{test.message}</small>
                      </div>
                      <span className={`badge ${getStatusBadge(test.status)}`}>
                        {test.status.toUpperCase()}
                      </span>
                    </div>
                  ))}

                  <div className="mt-3 text-center">
                    {testResults.tests.filter((t) => t.status === "success")
                      .length === testResults.tests.length ? (
                      <div className="alert alert-success">
                        🎉 All diagnostics passed! Your shade agent is fully
                        operational.
                      </div>
                    ) : testResults.tests.filter((t) => t.status === "error")
                        .length > 0 ? (
                      <div className="alert alert-danger">
                        ❌ Critical issues detected. Check the results above for
                        details.
                      </div>
                    ) : (
                      <div className="alert alert-warning">
                        ⚠️ Some warnings detected. Agent may still be
                        functional.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="card">
          <div className="card-header">
            <h5>⚡ Quick Actions</h5>
          </div>
          <div className="card-body">
            <div className="d-flex gap-2 flex-wrap">
              <button
                className="btn btn-outline-primary"
                onClick={() => window.open(`${Constants.API_URL}/`, "_blank")}
              >
                🏠 Agent Dashboard
              </button>

              <button
                className="btn btn-outline-info"
                onClick={() =>
                  window.open(
                    `${Constants.API_URL}/api/debug/websocket-status`,
                    "_blank"
                  )
                }
              >
                📡 WebSocket Status
              </button>

              <button
                className="btn btn-outline-success"
                onClick={() =>
                  window.open(`${Constants.API_URL}/api/vote/history`, "_blank")
                }
              >
                📊 Execution History
              </button>

              <button
                className="btn btn-outline-warning"
                onClick={() =>
                  window.open(`${Constants.API_URL}/debug/env`, "_blank")
                }
              >
                🔍 Environment Debug
              </button>

              <button
                className="btn btn-outline-secondary"
                onClick={() =>
                  window.open(`${Constants.API_URL}/api/vote/stats`, "_blank")
                }
              >
                📈 Live Stats
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;
