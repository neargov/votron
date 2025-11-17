import {
  castVote,
  fetchProposalInfo,
  checkVoteRecordedOnChain,
  type ProposalData,
} from "./voting-utils";
import { queuedAgentAccountId } from "./agentQueue";

export type VoteOption = "For" | "Against" | "Abstain";

export interface VoterConfig {
  apiKey?: string;
  agentAccountId?: string;
  votingContractId?: string;
}

export interface VoteDecision {
  proposalId: string;
  reasons: string[];
  timestamp: string;
  executionResult?: ExecutionResult;
  selectedOption?: VoteOption;
}

export interface ExecutionStatus {
  executed: boolean;
  executionTxHash?: string;
  executedAt?: string;
  success: boolean;
  executionError?: string;
  attemptedAt?: string;
  alreadyVoted?: boolean;
}

export interface ExecutionResult {
  action: "succeeded" | "failed";
  transactionHash?: string;
  timestamp: string;
  error?: string;
  alreadyVoted?: boolean;
}

export class Voter {
  private config: VoterConfig;
  private voteHistory: Map<string, VoteDecision>;
  private executionResults: Map<string, ExecutionStatus>;

  public agentAccountId?: string;
  public votingContractId?: string;

  constructor(initialConfig: VoterConfig = {}) {
    this.config = {
      ...initialConfig,
    };

    this.agentAccountId =
      initialConfig.agentAccountId || process.env.AGENT_ACCOUNT_ID;
    this.votingContractId =
      initialConfig.votingContractId ||
      process.env.VOTING_CONTRACT_ID ||
      "shade.ballotbox.testnet";
    this.voteHistory = new Map();
    this.executionResults = new Map();

    console.log(
      `AI voter initialized (NEAR AI Cloud ${this.config.apiKey ? "✅" : "❌"})`
    );
  }

  async evaluateProposal(
    proposalId: string | number,
    proposal: ProposalData
  ): Promise<VoteDecision> {
    const id = proposalId.toString();

    const existingDecision = this.voteHistory.get(id);
    if (existingDecision) {
      const alreadyExecuted = this.isProposalExecuted(id);
      if (alreadyExecuted || existingDecision.selectedOption) {
        console.log(
          `ℹ️ Returning existing decision for proposal ${id} (already evaluated${
            alreadyExecuted ? " & executed" : ""
          })`
        );
        return existingDecision;
      }
    }

    console.log(`🔍 AI evaluating proposal ${id}: "${proposal.title}"`);

    try {
      // Ask AI for decision
      const aiDecision = await this.askAI(proposal);
      const result = this.saveResult(
        id,
        aiDecision.reasons,
        aiDecision.selectedOption
      );
      return await this.executeVote(result, proposal);
    } catch (error: any) {
      console.error(`❌ AI evaluation failed for proposal ${id}:`, error);
      return this.saveResult(id, [`❌ AI evaluation error: ${error.message}`]);
    }
  }

  public async askAI(proposal: ProposalData): Promise<{
    reasons: string[];
    selectedOption: VoteOption;
  }> {
    const apiKey = this.config.apiKey || process.env.NEAR_AI_CLOUD_API_KEY;

    if (!apiKey) {
      throw new Error("No NEAR AI Cloud API key configured");
    }

    const prompt = `# House of Stake — Voting Agent
Your job is to recommend a vote based only on whether the proposal benefits the NEAR ecosystem.

You receive:
- title
- description
- voting_options: For, Against, Abstain

Use only the information in the title and description.

Mapping:
- For → meaningful benefit
- Abstain → unclear benefit
- Against → no benefit or poses risk

"Benefit" means the proposal provides a clear and specific benefit to NEAR's governance, infrastructure, or ecosystem growth.

## Meaningful Benefit → For
Select For when the proposal provides a clear and specific positive benefit.

## Unclear Benefit → Abstain
Select Abstain when the description does not provide enough information to determine whether it benefits the ecosystem.

## No Benefit or Risk → Against
Select Against when the proposal is irrelevant to NEAR, asks for funding without a clear purpose, centralizes control, or poses an obvious risk to the ecosystem.

## Output Format (JSON Only)
Return only valid JSON:
{
  "selected_option": "For | Against | Abstain",
  "reason": "Short explanation based only on title and description."
}

Always select the option that matches whether the proposal offers meaningful benefit, unclear benefit, or no benefit to the NEAR ecosystem.

Proposal context:
Title: ${proposal.title || "No title"}
Description: ${proposal.description || "No description"}`;

    try {
      console.log(`🤖 Sending proposal to NEAR AI Cloud for screening...`);

      const response = await fetch(
        "https://cloud-api.near.ai/v1/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-oss-120b",
            messages: [{ role: "user", content: prompt }],
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `NEAR AI Cloud API error: ${response.status} - ${errorText.substring(
            0,
            200
          )}`
        );
      }

      const data = await response.json();
      const aiResponse = data.choices?.[0]?.message?.content || "";
      const decision = this.parseAIResponse(aiResponse);

      console.log(`✅ AI recommendation: ${decision.selectedOption}`);

      return decision;
    } catch (error: any) {
      console.error("🤖 AI API call failed:", error);
      throw new Error(`AI evaluation failed: ${error.message}`);
    }
  }

  private parseAIResponse(response: string): {
    reasons: string[];
    selectedOption: VoteOption;
  } {
    const normalizeOption = (value: any): VoteOption | null => {
      if (!value) return null;
      const option = value.toString().trim().toLowerCase();
      if (option === "for") return "For";
      if (option === "against") return "Against";
      if (option === "abstain") return "Abstain";
      return null;
    };

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const selected =
          normalizeOption(parsed.selected_option) ||
          normalizeOption(parsed.selectedOption) ||
          normalizeOption(parsed.decision);
        const reason =
          parsed.reason ||
          (Array.isArray(parsed.reasons) ? parsed.reasons.join(" ") : "");

        const option = selected || "Abstain";
        return {
          reasons: [
            `Vote: ${option}`,
            reason ? `Reason: ${reason}` : "Reason: Not provided",
          ],
          selectedOption: option,
        };
      }

      const text = response.toLowerCase();
      let option: VoteOption = "Abstain";
      if (text.includes("against")) {
        option = "Against";
      } else if (text.includes("for")) {
        option = "For";
      } else if (text.includes("abstain")) {
        option = "Abstain";
      }

      return {
        reasons: [`Vote: ${option}`, "Reason: Could not parse structured JSON"],
        selectedOption: option,
      };
    } catch (error) {
      return {
        reasons: ["Failed to parse AI response"],
        selectedOption: "Abstain",
      };
    }
  }

  private async executeVote(
    result: VoteDecision,
    proposal?: ProposalData
  ): Promise<VoteDecision> {
    if (!result.selectedOption) {
      return result;
    }

    try {
      console.log(
        `🤖 Executing autonomous vote for proposal ${result.proposalId}`
      );
      const executionResult = await this.voteOnProposal(
        result.proposalId,
        result.selectedOption,
        proposal
      );
      result.executionResult = executionResult;
      result.reasons.push(
        `🤖 Autonomous vote submitted: ${result.selectedOption}`
      );
      this.voteHistory.set(result.proposalId, result);
    } catch (error: any) {
      console.error(`❌ Failed to execute autonomous vote:`, error);
      const failureTimestamp = new Date().toISOString();
      this.executionResults.set(result.proposalId, {
        executed: false,
        executionError: error.message,
        success: false,
        attemptedAt: failureTimestamp,
        alreadyVoted: error?.message?.includes("Already voted"),
      });
      result.reasons.push(`❌ Voting failed: ${error.message}`);
    }

    return result;
  }

  private async voteOnProposal(
    proposalId: string,
    selectedOption: VoteOption,
    proposal?: ProposalData
  ): Promise<ExecutionResult> {
    if (!this.votingContractId) {
      throw new Error("Voting contract ID is not configured");
    }

    if (this.isProposalExecuted(proposalId)) {
      throw new Error(`Proposal ${proposalId} already voted`);
    }

    let proposalDetails = proposal;
    const needsFullDetails =
      !proposalDetails ||
      !proposalDetails.voting_options ||
      !proposalDetails.snapshot_and_state;

    if (needsFullDetails) {
      const rpcUrl =
        process.env.NEAR_RPC_JSON || "https://rpc.testnet.near.org";
      proposalDetails = await fetchProposalInfo(
        proposalId,
        this.votingContractId,
        rpcUrl
      );
    }

    if (!proposalDetails) {
      throw new Error("Unable to load proposal details for voting");
    }

    this.validateProposalStatus(proposalDetails);

    const rpcUrl = process.env.NEAR_RPC_JSON || "https://rpc.testnet.near.org";
    const agentAccountInfo = await queuedAgentAccountId().catch(() => null);
    const proxyAccountId =
      agentAccountInfo?.accountId || "ac-proxy.neargov.testnet";

    const hasVotedOnChain = await this.checkIfAlreadyVoted(
      proposalId,
      proxyAccountId,
      this.votingContractId,
      rpcUrl
    );

    if (hasVotedOnChain) {
      console.log(
        `ℹ️ Account ${proxyAccountId} already voted on proposal ${proposalId}`
      );
      throw new Error(`Already voted on proposal ${proposalId}`);
    }

    let voteResult: { transactionHash?: string; alreadyVoted?: boolean };
    try {
      voteResult = await castVote(
        proposalId,
        proposalDetails,
        selectedOption,
        this.votingContractId
      );
    } catch (error: any) {
      const message = error?.message || "";
      if (message.includes("Already voted")) {
        console.log(
          `ℹ️ Proposal ${proposalId} already voted for ${selectedOption}, recording status`
        );
        voteResult = { transactionHash: undefined, alreadyVoted: true };
      } else {
        throw error;
      }
    }

    const timestamp = new Date().toISOString();
    this.executionResults.set(proposalId, {
      executed: true,
      executionTxHash: voteResult.transactionHash,
      executedAt: timestamp,
      success: true,
      alreadyVoted: voteResult.alreadyVoted === true,
    });

    return {
      action: "succeeded",
      transactionHash: voteResult.transactionHash,
      timestamp,
      alreadyVoted: voteResult.alreadyVoted === true,
    };
  }

  public recordExecutionFailure(
    proposalId: string,
    errorMessage: string
  ): void {
    this.executionResults.set(proposalId, {
      executed: false,
      success: false,
      executionError: errorMessage,
      attemptedAt: new Date().toISOString(),
      alreadyVoted: false,
    });
    this.trimExecutionResults();
  }

  private validateProposalStatus(proposal: ProposalData): void {
    if (!proposal.status || proposal.status === "Voting") {
      return;
    }
    if (proposal.status === "Approved") {
      throw new Error("Voting has not started yet");
    }
    if (proposal.status === "Finished") {
      throw new Error("Voting has already ended");
    }
    throw new Error(`Cannot vote on proposal: status is ${proposal.status}`);
  }

  private async checkIfAlreadyVoted(
    proposalId: string,
    accountId: string,
    votingContractId: string,
    rpcUrl: string
  ): Promise<boolean> {
    const { recorded, verified } = await checkVoteRecordedOnChain(
      proposalId,
      accountId,
      votingContractId,
      rpcUrl
    );
    if (!verified) {
      console.warn(
        "⚠️ Could not verify existing vote status (proceeding with vote attempt)"
      );
      return false;
    }
    return recorded;
  }

  public async recordManualVote(
    proposalId: string | number,
    selectedOption: VoteOption,
    reason?: string,
    proposal?: ProposalData
  ): Promise<VoteDecision> {
    const id = proposalId.toString();
    const reasons = [reason || `Manual vote recorded: ${selectedOption}`];
    const result = this.saveResult(id, reasons, selectedOption);
    return await this.executeVote(result, proposal);
  }

  private trimExecutionResults() {
    if (this.executionResults.size > 1000) {
      const executions = Array.from(this.executionResults.entries());
      const oldestExecution = executions.sort((a, b) => {
        const timeA = new Date(
          a[1].executedAt || a[1].attemptedAt || 0
        ).getTime();
        const timeB = new Date(
          b[1].executedAt || b[1].attemptedAt || 0
        ).getTime();
        return timeA - timeB;
      })[0];
      this.executionResults.delete(oldestExecution[0]);
    }
  }

  private saveResult(
    proposalId: string,
    reasons: string[],
    selectedOption?: VoteOption
  ): VoteDecision {
    const result: VoteDecision = {
      proposalId,
      reasons,
      timestamp: new Date().toISOString(),
      selectedOption,
    };

    this.voteHistory.set(proposalId, result);

    if (this.voteHistory.size > 1000) {
      const entries = Array.from(this.voteHistory.entries());
      const oldest = entries.sort(
        (a, b) =>
          new Date(a[1].timestamp).getTime() -
          new Date(b[1].timestamp).getTime()
      )[0];
      this.voteHistory.delete(oldest[0]);
    }

    this.trimExecutionResults();

    const decisionEmoji =
      selectedOption === "For"
        ? "✅"
        : selectedOption === "Against"
        ? "❌"
        : selectedOption === "Abstain"
        ? "⏸️"
        : "ℹ️";
    const decisionText = selectedOption
      ? `VOTE: ${selectedOption}`
      : "NO DECISION";
    console.log(`${decisionEmoji} Proposal ${proposalId}: ${decisionText}`);
    console.log(`   Reasons: ${reasons.join(" | ")}`);
    if (selectedOption) {
      console.log(`   Recommended vote: ${selectedOption}`);
    }

    return result;
  }

  getVoteHistory(): VoteDecision[] {
    return Array.from(this.voteHistory.values());
  }

  getVoteDecision(proposalId: string): VoteDecision | undefined {
    return this.voteHistory.get(proposalId);
  }

  getVoteStats() {
    const history = this.getVoteHistory();
    const forVotes = history.filter((r) => r.selectedOption === "For").length;
    const againstVotes = history.filter(
      (r) => r.selectedOption === "Against"
    ).length;
    const abstainVotes = history.filter(
      (r) => r.selectedOption === "Abstain"
    ).length;

    return {
      total: history.length,
      breakdown: {
        for: forVotes,
        against: againstVotes,
        abstain: abstainVotes,
      },
      lastDecision:
        history.length > 0 ? history[history.length - 1].timestamp : null,
    };
  }

  // Execution tracking methods
  getExecutionStatus(proposalId: string) {
    return this.executionResults.get(proposalId) || null;
  }

  isProposalExecuted(proposalId: string): boolean {
    const result = this.executionResults.get(proposalId);
    return result?.executed === true;
  }

  getRecentExecutions(limit: number = 10) {
    return Array.from(this.executionResults.entries())
      .map(([proposalId, result]) => ({ proposalId, ...result }))
      .sort((a, b) => {
        const timeA = new Date(a.executedAt || a.attemptedAt || 0).getTime();
        const timeB = new Date(b.executedAt || b.attemptedAt || 0).getTime();
        return timeB - timeA;
      })
      .slice(0, limit);
  }

  getExecutionStats() {
    const executions = Array.from(this.executionResults.values());
    const successful = executions.filter((e) => e.executed && e.success).length;
    const failed = executions.filter((e) => !e.success).length;

    return {
      total: executions.length,
      successful,
      failed,
      pending: executions.filter((e) => !e.executed).length,
      lastExecution:
        executions.length > 0
          ? executions[executions.length - 1].attemptedAt
          : null,
    };
  }

  clearHistory() {
    this.voteHistory.clear();
    this.executionResults.clear();
    console.log("🧹 History cleared");
  }
}
