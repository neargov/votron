import { useState } from "react";

export function ProposalCard({ proposal, agentExecution }) {
  const [showDetails, setShowDetails] = useState(false);

  const getStatusBadge = (status) => {
    const statusConfig = {
      Created: { class: "bg-warning text-dark", text: "Pending" },
      Rejected: { class: "bg-danger", text: "Rejected" },
      Approved: { class: "bg-primary", text: "Approved" },
      Voting: { class: "bg-success", text: "Voting" },
      Finished: { class: "bg-dark", text: "Finished" },
    };

    const config = statusConfig[status] || {
      class: "bg-secondary",
      text: status,
    };

    return <span className={`badge ${config.class}`}>{config.text}</span>;
  };

  const getAgentExecutionBadge = (execution, proposalStatus) => {
    if (!execution) {
      return <span className="badge bg-dark">NOT PROCESSED</span>;
    }

    // Handle AI evaluation data
    if (execution.type === "ai_evaluation") {
      return execution.approved ? (
        <span className="badge bg-success">APPROVED</span>
      ) : (
        <span className="badge bg-danger">NOT APPROVED</span>
      );
    }

    // Handle agent execution data
    if (execution.executed === false) {
      return <span className="badge bg-danger">FAILED</span>;
    }

    return <span className="badge bg-success">APPROVED</span>;
  };

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return "Unknown";

    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        return "Invalid Date";
      }
      return date.toLocaleString();
    } catch {
      return "Invalid Date";
    }
  };

  const cardStyle = {
    boxShadow: "0 0.125rem 0.25rem rgba(0, 0, 0, 0.075)",
    borderRadius: "0.5rem",
    border: "none",
    padding: "1.25rem",
    marginBottom: "1rem",
  };

  const backgroundBoxStyle = {
    borderRadius: "0.375rem",
  };

  const codeStyle = {
    borderRadius: "0.25rem",
    padding: "0.25rem 0.5rem",
    fontSize: "0.875em",
  };

  return (
    <div className="bg-white" style={cardStyle}>
      <div className="d-flex justify-content-between align-items-start">
        <div className="flex-grow-1">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <div className="mb-0 flex-grow-1 me-3" style={{ minWidth: 0 }}>
              <strong>{proposal.id}.</strong> {proposal.title}
            </div>
            <div className="d-flex flex-shrink-0">
              {getStatusBadge(proposal.status)}
            </div>
          </div>
          <div className="text-muted small mt-2 mb-3">
            by{" "}
            <code className="bg-light text-dark" style={codeStyle}>
              {proposal.proposer_id}
            </code>
          </div>
          <div className="d-flex justify-content-between align-items-center">
            {(proposal.description ||
              proposal.voting_end ||
              proposal.deadline) && (
              <button
                className="btn btn-sm text-muted mt-2"
                style={{
                  background: "none",
                  border: "none",
                  padding: "0.25rem 0",
                  textDecoration: "none",
                }}
                onClick={() => setShowDetails(!showDetails)}
              >
                {showDetails ? "▼ Hide Details" : "▶ Show Details"}
              </button>
            )}
            <div style={backgroundBoxStyle}>
              {getAgentExecutionBadge(agentExecution, proposal.status)}
            </div>
          </div>

          {/* Togglable Details Section */}
          {showDetails && (
            <div className="mt-2">
              {/* Original proposal description */}
              {proposal.description && (
                <div className="mb-1" style={backgroundBoxStyle}>
                  <strong>Description:</strong>
                  <p className="small text-secondary mb-0">
                    {proposal.description.length > 120
                      ? `${proposal.description.substring(0, 120)}...`
                      : proposal.description}
                  </p>
                </div>
              )}
              {/* Voting/Timeline info if available */}
              {(proposal.voting_end || proposal.deadline) && (
                <div
                  className="text-muted small mb-1"
                  style={backgroundBoxStyle}
                >
                  {proposal.voting_end && (
                    <div className="mb-2">
                      <strong>Voting ends:</strong>{" "}
                      {formatTimestamp(proposal.voting_end)}
                    </div>
                  )}
                  {proposal.deadline && (
                    <div className="mb-0">
                      <strong>Deadline:</strong>{" "}
                      {formatTimestamp(proposal.deadline)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
