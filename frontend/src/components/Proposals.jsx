import { useState, useMemo, useEffect } from "react";
import { near } from "../hooks/fastnear.js";
import { useProposals } from "../hooks/useProposals.js";
import { ProposalCard } from "./ProposalCard.jsx";
import { Constants } from "../hooks/constants.js";

const PROPOSALS_PER_PAGE = 10;

export function Proposals({ accountId, agentAccountId, onRefreshAgent }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [voteData, setVoteData] = useState({});
  const [agentVotes, setAgentVotes] = useState({});
  const [voterMap, setVoterMap] = useState({});

  // Get current proposals from voting contract
  const { proposals, loading, error, refetch } = useProposals(
    Constants.VOTING_CONTRACT_ID
  );

  useEffect(() => {
    const fetchScreeningStatus = async () => {
      if (!proposals.length) return;

      const screeningPromises = proposals.map(async (proposal) => {
        try {
          const response = await fetch(
            `${Constants.API_URL}/api/vote/status/${proposal.id}`
          );
          if (response.ok) {
            const data = await response.json();
            return { proposalId: proposal.id, ...data };
          }
        } catch (error) {
          console.error(
            `Failed to fetch AI status for proposal ${proposal.id}:`,
            error
          );
        }
        return null;
      });

      const results = await Promise.allSettled(screeningPromises);
      const aiData = {};

      results.forEach((result) => {
        if (result.status === "fulfilled" && result.value) {
          const data = result.value;
          aiData[data.proposalId] = data;
        }
      });

      setVoteData(aiData);
    };

    fetchScreeningStatus();
  }, [proposals]);

  // Fetch on-chain vote by agent account (if available)
  useEffect(() => {
    const fetchAgentVotes = async () => {
      const voterAccount =
        agentAccountId || "ac-proxy.neargov.testnet"; // default to known agent
      if (!voterAccount || !proposals.length || typeof near === "undefined") {
        return;
      }

      try {
        const votePromises = proposals.map(async (proposal) => {
          try {
            const voteIdx = await near.view({
              contractId: proposal.contractId,
              methodName: "get_vote",
              args: {
                account_id: voterAccount,
                proposal_id: proposal.id,
              },
            });

            if (voteIdx === null || voteIdx === undefined) {
              return null;
            }

            const normalizedIdx =
              typeof voteIdx === "string"
                ? parseInt(voteIdx, 10)
                : typeof voteIdx === "number"
                ? voteIdx
                : null;

            if (normalizedIdx === null || Number.isNaN(normalizedIdx)) {
              return null;
            }

            const options =
              proposal.voting_options ||
              proposal.metadata?.voting_options ||
              proposal.vote_options ||
              [];

            const selectedOption =
              options[normalizedIdx] ||
              `Option ${normalizedIdx + 1 || normalizedIdx}`;

            return {
              proposalId: proposal.id,
              selectedOption,
              voter: voterAccount,
            };
          } catch (error) {
            console.error(
              `Failed to fetch on-chain agent vote for proposal ${proposal.id}:`,
              error
            );
            return null;
          }
        });

        const results = await Promise.all(votePromises);
        const mapped = {};
        results.forEach((res) => {
          if (res?.proposalId) {
            mapped[res.proposalId] = res;
          }
        });
        setAgentVotes(mapped);
        setVoterMap((prev) => ({ ...prev, ...mapped }));
      } catch (error) {
        console.error("Failed to fetch agent votes:", error);
      }
    };

    fetchAgentVotes();
  }, [agentAccountId, proposals]);

  const voteLookup = useMemo(() => {
    const lookup = {};
    Object.entries(voteData).forEach(([proposalId, data]) => {
      if (data.evaluated) {
        lookup[proposalId] = {
          proposalId,
          selectedOption: data.selectedOption,
          reasons: data.reasons,
          timestamp: data.timestamp,
          executed: data.executed,
          voter:
            data.voter ||
            data.agentAccountId ||
            data.accountId ||
            data.voterId ||
            null,
        };
      }
    });
    Object.entries(agentVotes).forEach(([proposalId, data]) => {
      if (!lookup[proposalId]) {
          lookup[proposalId] = {};
      }
      lookup[proposalId] = {
        ...lookup[proposalId],
        selectedOption:
          lookup[proposalId].selectedOption || data.selectedOption,
        voter: data.voter || lookup[proposalId].voter,
      };
    });
    Object.entries(voterMap).forEach(([proposalId, data]) => {
      if (!lookup[proposalId]) {
        lookup[proposalId] = {};
      }
      lookup[proposalId].voter = lookup[proposalId].voter || data.voter;
      lookup[proposalId].selectedOption =
        lookup[proposalId].selectedOption || data.selectedOption;
    });
    return lookup;
  }, [voteData, agentVotes, voterMap]);

  // Filter proposals by status
  const filteredProposals = useMemo(() => {
    if (statusFilter === "all") return proposals;
    if (statusFilter === "agent-evaluated") {
      return proposals.filter((p) => voteLookup[p.id]);
    }
    if (statusFilter === "agent-voted") {
      return proposals.filter((p) => voteLookup[p.id]?.selectedOption);
    }
    if (statusFilter === "agent-failed") {
      return proposals.filter((p) => !voteLookup[p.id]?.selectedOption);
    }

    const statusMap = {
      active: ["Voting"],
      pending: ["Created"],
      finished: ["Finished", "Approved", "Rejected"],
    };

    return proposals.filter((proposal) =>
      statusMap[statusFilter]?.includes(proposal.status)
    );
  }, [proposals, statusFilter, voteLookup]);

  // Pagination
  const totalPages = Math.ceil(filteredProposals.length / PROPOSALS_PER_PAGE);
  const startIndex = (currentPage - 1) * PROPOSALS_PER_PAGE;
  const paginatedProposals = filteredProposals.slice(
    startIndex,
    startIndex + PROPOSALS_PER_PAGE
  );

  // Get counts for each status
  const statusCounts = useMemo(() => {
    const agentEvaluated = proposals.filter((p) => voteLookup[p.id]).length;
    const agentVoted = proposals.filter(
      (p) => voteLookup[p.id]?.selectedOption
    ).length;
    const agentFailed = proposals.filter(
      (p) => !voteLookup[p.id]?.selectedOption
    ).length;

    return {
      all: proposals.length,
      active: proposals.filter((p) => p.status === "Live").length,
      pending: proposals.filter((p) => p.status === "Created").length,
      finished: proposals.filter((p) =>
        ["Finished", "Approved", "Rejected"].includes(p.status)
      ).length,
      "agent-evaluated": agentEvaluated,
      "agent-voted": agentVoted,
      "agent-failed": agentFailed,
    };
  }, [proposals, voteLookup]);

  const handleFilterChange = (newFilter) => {
    setStatusFilter(newFilter);
    setCurrentPage(1);
  };

  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleRefreshAll = () => {
    refetch();
    if (onRefreshAgent) {
      onRefreshAgent();
    }
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading proposals...</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header and Refresh Button */}
      <div>
        <h3 className="mb-0">Recent Proposals</h3>
      </div>
      <br />

      {/* Error Message */}
      {error && (
        <div className="alert alert-danger mb-4">
          <h6>Error loading proposals:</h6>
          <p className="mb-0">{error}</p>
        </div>
      )}

      {/* Filter Tabs */}
      {/* <div className="mb-2">
        <ul className="nav nav-pills nav-fill">
          {[
            { key: "all", label: "All", count: statusCounts.all },
            { key: "pending", label: "Pending", count: statusCounts.pending },
            { key: "active", label: "Voting", count: statusCounts.active },
            {
              key: "agent-evaluated",
              label: "Agent Evaluated",
              count: statusCounts["agent-evaluated"],
            },
            {
              key: "agent-voted",
              label: "Agent Voted",
              count: statusCounts["agent-voted"],
            },
          ].map(({ key, label, count }) => (
            <li key={key} className="nav-item">
              <button
                className={`nav-link ${statusFilter === key ? "active" : ""}`}
                onClick={() => handleFilterChange(key)}
              >
                {label}{" "}
                {count > 0 && (
                  <span className="badge bg-secondary ms-1">{count}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div> */}

      {/* Proposals List */}
      {filteredProposals.length === 0 ? (
        <div className="text-center py-5">
          <div className="text-muted">
            <h5>
              No {statusFilter === "all" ? "" : statusFilter} proposals found
            </h5>
            <p>
              {statusFilter === "active" &&
                "No proposals are currently accepting votes."}
              {statusFilter === "pending" &&
                "No proposals are awaiting review."}
              {statusFilter === "agent-evaluated" &&
                "No proposals have been evaluated by the agent yet."}
              {statusFilter === "all" &&
                "No proposals have been created yet. Create a test proposal to see the agent in action!"}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4">
            {paginatedProposals.map((proposal) => (
              <ProposalCard
                key={`${proposal.contractId}-${proposal.id}`}
                proposal={proposal}
                compact={false}
                voteStatus={voteLookup[proposal.id]}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="d-flex justify-content-center mt-4">
              <nav aria-label="Proposals pagination">
                <ul className="pagination pagination-sm mb-0">
                  <li
                    className={`page-item ${
                      currentPage === 1 ? "disabled" : ""
                    }`}
                  >
                    <button
                      className="page-link"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                    >
                      &laquo; Previous
                    </button>
                  </li>

                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                    let page = i + 1;
                    if (totalPages > 5) {
                      if (currentPage <= 3) page = i + 1;
                      else if (currentPage >= totalPages - 2)
                        page = totalPages - 4 + i;
                      else page = currentPage - 2 + i;
                    }

                    return (
                      <li
                        key={page}
                        className={`page-item ${
                          currentPage === page ? "active" : ""
                        }`}
                      >
                        <button
                          className="page-link"
                          onClick={() => handlePageChange(page)}
                        >
                          {page}
                        </button>
                      </li>
                    );
                  })}

                  <li
                    className={`page-item ${
                      currentPage === totalPages ? "disabled" : ""
                    }`}
                  >
                    <button
                      className="page-link"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                    >
                      Next &raquo;
                    </button>
                  </li>
                </ul>
              </nav>
            </div>
          )}

          <div className="text-center text-muted small mt-4">
            Showing {startIndex + 1}-
            {Math.min(
              startIndex + PROPOSALS_PER_PAGE,
              filteredProposals.length
            )}{" "}
            of {filteredProposals.length} proposals
          </div>
        </>
      )}
    </div>
  );
}

export default Proposals;
