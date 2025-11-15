import { queuedAgentAccountId, queuedAgentCall } from "./agentQueue";
import type { VoteOption } from "./voter";

export interface ProposalData {
  id?: string | number;
  title?: string;
  description?: string;
  link?: string;
  proposer_id?: string;
  deadline?: string;
  voting_end?: string;
  snapshot_block?: string;
  total_voting_power?: string;
  voting_options?: string[];
  status?: string;
  voting_start_time_ns?: string;
  voting_duration_ns?: string;
  snapshot_and_state?: SnapshotAndState | null;
}

interface SnapshotInfo {
  root: string;
  length: number | string;
  block_height: number | string;
}

interface SnapshotAndState {
  snapshot: SnapshotInfo;
  timestamp_ns?: string;
  total_venear?: string;
  venear_growth_config?: any;
}

interface ContractProposalMetadata {
  title?: string;
  description?: string;
  link?: string;
  proposer_id?: string;
  voting_options?: any;
  voting_start_time_ns?: string;
  voting_duration_ns?: string;
}

interface ContractProposalInfo {
  id?: number;
  status?: string | Record<string, any>;
  voting_start_time_ns?: string;
  voting_duration_ns?: string;
  proposer_id?: string;
  metadata?: ContractProposalMetadata;
  title?: string;
  description?: string;
  link?: string;
  voting_options?: string[];
  snapshot_and_state?: SnapshotAndState | null;
}

interface ContractProposalResponse {
  metadata?: ContractProposalMetadata;
  proposal?: ContractProposalInfo;
  snapshot_and_state?: SnapshotAndState | null;
  [key: string]: any;
}

function normalizeProposalStatus(
  status: ContractProposalInfo["status"]
): string | undefined {
  if (!status) return undefined;
  if (typeof status === "string") {
    const normalized = status.trim();
    if (!normalized) return undefined;
    if (normalized.toLowerCase() === "approved") return "Approved";
    if (normalized.toLowerCase() === "voting") return "Voting";
    return normalized;
  }
  if (typeof status === "object") {
    const keys = Object.keys(status);
    if (keys.length === 0) return undefined;
    const key = keys[0];
    if (key === "Approved" || key === "Voting") return key;
    return key;
  }
  return undefined;
}

function toOptionalString(value: any): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint")
    return value.toString();
  if (typeof value === "object") {
    if (Object.prototype.hasOwnProperty.call(value, "0")) {
      const inner = (value as any)[0];
      return inner === undefined || inner === null
        ? undefined
        : inner.toString();
    }
    if (Object.prototype.hasOwnProperty.call(value, "value")) {
      const inner = (value as any).value;
      return inner === undefined || inner === null
        ? undefined
        : inner.toString();
    }
  }
  if (typeof value.toString === "function") return value.toString();
  return undefined;
}

export async function fetchProposalInfo(
  proposalId: string | number,
  VOTING_CONTRACT_ID: string,
  NEAR_RPC_JSON: string
): Promise<ProposalData> {
  const id = parseInt(proposalId.toString());
  console.log(`🔍 Fetching proposal ID: ${id}`);

  const payload = {
    jsonrpc: "2.0",
    id: "1",
    method: "query",
    params: {
      request_type: "call_function",
      finality: "final",
      account_id: VOTING_CONTRACT_ID,
      method_name: "get_proposal",
      args_base64: Buffer.from(JSON.stringify({ proposal_id: id })).toString(
        "base64"
      ),
    },
  };

  const res = await fetch(NEAR_RPC_JSON, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`RPC request failed: ${res.status}`);
  }

  const json = await res.json();

  if (json.error) {
    throw new Error(`RPC error: ${json.error.message}`);
  }

  if (!json.result || !json.result.result || json.result.result.length === 0) {
    throw new Error(`Proposal ${proposalId} does not exist`);
  }

  const bytes = json.result.result;
  const raw = Buffer.from(bytes).toString("utf-8");
  const proposalInfo: ContractProposalResponse = JSON.parse(raw);

  const metadata =
    proposalInfo.metadata || proposalInfo.proposal?.metadata || {};
  const proposal = proposalInfo.proposal || {};
  const combined: Record<string, any> = { ...proposal, ...proposalInfo };

  const normalizedStatus = normalizeProposalStatus(
    proposal.status || (proposalInfo as any).status
  );
  const snapshot =
    proposal.snapshot_and_state || proposalInfo.snapshot_and_state || null;

  return {
    id: proposal.id?.toString() || combined.id?.toString() || id.toString(),
    title:
      metadata?.title ||
      proposal?.title ||
      (proposalInfo as any).title ||
      combined.title,
    description:
      metadata?.description ||
      proposal?.description ||
      (proposalInfo as any).description ||
      combined.description,
    link:
      metadata?.link ||
      proposal?.link ||
      (proposalInfo as any).link ||
      combined.link,
    proposer_id:
      metadata?.proposer_id ||
      proposal?.proposer_id ||
      (proposalInfo as any).proposer_id,
    voting_options:
      metadata?.voting_options ||
      proposal?.voting_options ||
      (proposalInfo as any).voting_options,
    voting_start_time_ns:
      toOptionalString(proposal?.voting_start_time_ns) ||
      toOptionalString((proposalInfo as any).voting_start_time_ns),
    voting_duration_ns:
      toOptionalString(proposal?.voting_duration_ns) ||
      toOptionalString((proposalInfo as any).voting_duration_ns),
    snapshot_and_state: snapshot,
    status: normalizedStatus,
  };
}

function mapVoteChoiceToIndex(
  votingOptions: string[] | undefined,
  selectedOption: VoteOption
): number {
  if (!votingOptions || votingOptions.length === 0) {
    throw new Error("Voting options are not available for this proposal");
  }

  const normalizedChoice = selectedOption.toLowerCase();
  const index = votingOptions.findIndex((option) => {
    if (!option) return false;
    return option.toString().trim().toLowerCase() === normalizedChoice;
  });

  if (index === -1) {
    throw new Error(
      `Selected option "${selectedOption}" not found in voting options`
    );
  }

  return index;
}

function parseBlockHeightValue(value: number | string | undefined): number {
  if (value === undefined || value === null) {
    throw new Error("Snapshot block height is missing");
  }

  const blockHeight = typeof value === "string" ? parseInt(value, 10) : value;

  if (Number.isNaN(blockHeight)) {
    throw new Error(`Invalid snapshot block height: ${value}`);
  }

  return blockHeight;
}

export async function fetchAccountProofForSnapshot(
  accountId: string,
  snapshotState: SnapshotAndState,
  VENEAR_CONTRACT_ID: string,
  NEAR_RPC_JSON: string
): Promise<{ merkleProof: any; vAccount: any }> {
  if (!snapshotState?.snapshot) {
    throw new Error("Snapshot data is missing for this proposal");
  }

  const blockHeight = parseBlockHeightValue(
    snapshotState.snapshot.block_height
  );

  const payload = {
    jsonrpc: "2.0",
    id: `proof-${accountId}`,
    method: "query",
    params: {
      request_type: "call_function",
      account_id: VENEAR_CONTRACT_ID,
      method_name: "get_proof",
      args_base64: Buffer.from(
        JSON.stringify({ account_id: accountId })
      ).toString("base64"),
      block_id: blockHeight,
    },
  };

  const res = await fetch(NEAR_RPC_JSON, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Proof RPC request failed: ${res.status}`);
  }

  const json = await res.json();

  if (json.error) {
    throw new Error(`Proof RPC error: ${json.error.message}`);
  }

  if (!json.result || !json.result.result) {
    throw new Error("Proof RPC response missing result data");
  }

  const decoded = Buffer.from(json.result.result).toString("utf-8");
  const parsed = JSON.parse(decoded);

  if (Array.isArray(parsed)) {
    const [merkleProof, vAccount] = parsed;
    return { merkleProof, vAccount };
  }

  if (parsed?.merkle_proof && parsed?.v_account) {
    return {
      merkleProof: parsed.merkle_proof,
      vAccount: parsed.v_account,
    };
  }

  throw new Error("Unexpected proof response structure");
}

export async function castVote(
  proposalId: string,
  proposal: ProposalData,
  selectedOption: VoteOption,
  VOTING_CONTRACT_ID: string
): Promise<{ transactionHash?: string }> {
  if (!proposal.voting_options || proposal.voting_options.length === 0) {
    throw new Error("Voting options not available for this proposal");
  }

  if (!proposal.snapshot_and_state?.snapshot) {
    throw new Error("Snapshot data missing for this proposal");
  }

  const voteIndex = mapVoteChoiceToIndex(
    proposal.voting_options,
    selectedOption
  );
  const accountInfo = await queuedAgentAccountId();
  const accountId = accountInfo.accountId;

  console.log(
    `🗳️ Preparing vote (${selectedOption}) for proposal ${proposalId} as ${accountId}`
  );

  const venearContract = process.env.VENEAR_CONTRACT_ID || "v.hos03.testnet";
  const nearRpcJson =
    process.env.NEAR_RPC_JSON || "https://rpc.testnet.near.org";

  const { merkleProof, vAccount } = await fetchAccountProofForSnapshot(
    accountId,
    proposal.snapshot_and_state,
    venearContract,
    nearRpcJson
  );

  const voteResult = await queuedAgentCall({
    contractId: VOTING_CONTRACT_ID,
    methodName: "vote",
    args: {
      proposal_id: parseInt(proposalId),
      vote: voteIndex,
      merkle_proof: merkleProof,
      v_account: vAccount,
    },
    deposit: "1",
  });

  if (voteResult?.error) {
    throw new Error(voteResult.error);
  }

  const txHash =
    voteResult?.transaction?.hash ||
    voteResult?.txHash ||
    voteResult?.receipt?.transaction_hash ||
    voteResult?.receipt?.id ||
    voteResult?.hash ||
    voteResult?.transaction_outcome?.id ||
    null;

  if (txHash) {
    console.log(`✅ Vote submitted for proposal ${proposalId}: ${txHash}`);
  } else {
    console.log(
      `✅ Vote submitted for proposal ${proposalId} (no tx hash reported)`
    );
  }

  return { transactionHash: txHash || undefined };
}
