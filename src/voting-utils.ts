import {
  queuedAgentAccountId,
  queuedAgentCall,
  queuedAgent,
} from "./agentQueue";
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

export async function checkVoteRecordedOnChain(
  proposalId: string | number,
  accountId: string,
  votingContractId: string,
  rpcUrl: string,
  maxRetries: number = 2
): Promise<{ recorded: boolean; verified: boolean }> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = attempt === 1 ? 300 : 500;
      console.log(
        `⏳ Retrying vote verification after ${delay}ms (attempt ${
          attempt + 1
        }/${maxRetries + 1})...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    try {
      const payload = {
        jsonrpc: "2.0",
        id: "get-vote",
        method: "query",
        params: {
          request_type: "call_function",
          finality: "final",
          account_id: votingContractId,
          method_name: "get_vote",
          args_base64: Buffer.from(
            JSON.stringify({
              account_id: accountId,
              proposal_id: parseInt(proposalId as any),
            })
          ).toString("base64"),
        },
      };

      const res = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        console.warn(
          `⚠️ get_vote HTTP ${res.status} while verifying vote (attempt ${
            attempt + 1
          }/${maxRetries + 1})`
        );
        if (attempt < maxRetries) continue;
        return { recorded: false, verified: false };
      }

      const json = await res.json();

      if (!json.result?.result) {
        if (attempt < maxRetries) {
          console.log(
            `ℹ️ Vote not found on-chain yet (attempt ${attempt + 1}/${
              maxRetries + 1
            }), retrying...`
          );
          continue;
        }
        console.warn(
          `⚠️ Vote not found after ${maxRetries + 1} verification attempts`
        );
        return { recorded: false, verified: true };
      }

      const decoded = Buffer.from(json.result.result).toString("utf-8");

      try {
        const parsed = JSON.parse(decoded);
        const recorded = parsed !== null && parsed !== undefined;
        if (recorded) {
          console.log(
            `✅ Vote verified on-chain (attempt ${attempt + 1}/${
              maxRetries + 1
            })`
          );
          return { recorded: true, verified: true };
        }
        if (attempt < maxRetries) {
          console.log(
            `ℹ️ Vote shows as null/undefined (attempt ${attempt + 1}/${
              maxRetries + 1
            }), retrying...`
          );
          continue;
        }
        return { recorded: false, verified: true };
      } catch (parseErr) {
        console.warn(
          `⚠️ Failed to parse get_vote response (attempt ${attempt + 1}/${
            maxRetries + 1
          }):`,
          decoded.substring(0, 200)
        );
        return { recorded: false, verified: false };
      }
    } catch (err: any) {
      console.warn(
        `⚠️ get_vote check failed (attempt ${attempt + 1}/${maxRetries + 1}):`,
        err?.message || String(err)
      );
      if (attempt < maxRetries) continue;
      return { recorded: false, verified: false };
    }
  }

  return { recorded: false, verified: false };
}

export async function fetchAccountProofForSnapshot(
  accountId: string,
  snapshotState: SnapshotAndState,
  VENEAR_CONTRACT_ID: string,
  NEAR_RPC_JSON: string
): Promise<{
  merkleProof: { index?: number; [key: string]: any };
  vAccount: any;
}> {
  type RpcCallFunctionResponse = {
    jsonrpc: string;
    id?: string | number;
    error?: { message: string };
    result?: {
      result?: number[];
      block_height?: number;
      block_hash?: string;
      logs?: string[];
    };
  };

  type MerkleProofRaw = {
    index?: number | string;
    [key: string]: any;
  };

  const normalizeProof = (
    proof: MerkleProofRaw
  ): { index?: number; [key: string]: any } => {
    const normalizedIndex =
      typeof proof.index === "string" ? parseInt(proof.index, 10) : proof.index;
    return { ...proof, index: normalizedIndex };
  };

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

  console.log(
    "📡 Fetching account proof",
    JSON.stringify(
      {
        accountId,
        venearAccountId: VENEAR_CONTRACT_ID,
        blockHeight,
        rpcUrl: NEAR_RPC_JSON,
      },
      null,
      2
    )
  );

  const res = await fetch(NEAR_RPC_JSON, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Proof RPC request failed: ${res.status}`);
  }

  const json: RpcCallFunctionResponse = await res.json();

  console.log("🔍 Proof RPC raw response:", JSON.stringify(json, null, 2));

  if (json.error) {
    throw new Error(`Proof RPC error: ${json.error.message}`);
  }

  if (!json.result || !json.result.result) {
    throw new Error("Proof RPC response missing result data");
  }

  const bytes: number[] = json.result.result;
  const decoded = Buffer.from(bytes).toString("utf-8");

  let parsed: any;
  try {
    parsed = JSON.parse(decoded);
  } catch (e) {
    console.error("❌ Failed to parse proof response JSON:", decoded);
    throw new Error("Failed to parse proof response JSON");
  }

  // Expected shape: [merkleProof, vAccount]
  if (Array.isArray(parsed)) {
    const [merkleProof, vAccount] = parsed as [MerkleProofRaw, any];
    const normalizedProof = normalizeProof(merkleProof || {});
    console.log(
      "✅ Normalized merkle proof:",
      JSON.stringify(normalizedProof, null, 2)
    );
    return { merkleProof: normalizedProof, vAccount };
  }

  if (parsed?.merkle_proof && parsed?.v_account) {
    const normalizedProof = normalizeProof(
      parsed.merkle_proof as MerkleProofRaw
    );
    console.log(
      "✅ Normalized merkle proof:",
      JSON.stringify(normalizedProof, null, 2)
    );
    return {
      merkleProof: normalizedProof,
      vAccount: parsed.v_account,
    };
  }

  console.error(
    "❌ Unexpected proof response structure after decode:",
    JSON.stringify(parsed, null, 2)
  );
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

  // Votes are submitted via proxy contract; proof must match its account ID
  const agentAccountInfo = await queuedAgentAccountId().catch(() => null);
  const proxyContractId =
    process.env.NEXT_PUBLIC_contractId ||
    agentAccountInfo?.accountId ||
    "ac-proxy.neargov.testnet";
  const voterAccountId = proxyContractId;

  console.log(
    `🗳️ Preparing vote (${selectedOption}) for proposal ${proposalId} as ${voterAccountId}`
  );

  const venearContract = process.env.VENEAR_CONTRACT_ID || "v.hos03.testnet";
  const nearRpcJson =
    process.env.NEAR_RPC_JSON || "https://rpc.testnet.near.org";

  const { merkleProof, vAccount } = await fetchAccountProofForSnapshot(
    voterAccountId,
    proposal.snapshot_and_state,
    venearContract,
    nearRpcJson
  );

  console.log(
    `📡 Sending vote via proxy contract ${proxyContractId} with method cast_vote`
  );

  const voteResultRaw = await queuedAgent("functionCall", {
    contractId: proxyContractId,
    methodName: "cast_vote",
    args: {
      proposal_id: parseInt(proposalId),
      vote: voteIndex,
      merkle_proof: merkleProof,
      v_account: vAccount,
    },
    gas: "300000000000000",
    attachedDeposit: "1000000000000000000000", // 0.001 NEAR
  });

  if (voteResultRaw?.error) {
    throw new Error(voteResultRaw.error);
  }

  let voteResult: any = voteResultRaw;
  if (typeof voteResultRaw === "string") {
    const trimmed = voteResultRaw.trim();
    if (!trimmed) {
      voteResult = {};
    } else {
      voteResult = { hash: trimmed };
    }
  } else if (!voteResultRaw || typeof voteResultRaw !== "object") {
    console.warn(
      "ℹ️ Agent call returned an unexpected response; proceeding without tx hash"
    );
    voteResult = {};
  }

  const txHash =
    voteResult?.transaction?.hash ||
    voteResult?.txHash ||
    voteResult?.receipt?.transaction_hash ||
    voteResult?.receipt?.id ||
    voteResult?.hash ||
    voteResult?.transaction_outcome?.id ||
    null;

  const outcomeId =
    voteResult?.transaction_outcome?.id ||
    voteResult?.transaction?.hash ||
    voteResult?.hash ||
    null;

  if (!txHash && !outcomeId) {
    const { recorded, verified } = await checkVoteRecordedOnChain(
      proposalId,
      voterAccountId,
      VOTING_CONTRACT_ID,
      nearRpcJson,
      2
    );

    if (verified && recorded) {
      console.log(
        `✅ Vote verified on-chain despite missing tx hash after retries`
      );
    } else if (verified && !recorded) {
      throw new Error(
        "Vote not recorded on-chain after verification (tried 3 times over ~800ms)"
      );
    } else {
      console.warn(
        "⚠️ Vote verification unavailable (RPC/parse error); proceeding without on-chain confirmation"
      );
    }
  }

  console.log(`✅ Vote cast successfully on proposal ${proposalId}`);

  // Even if no txn hash is returned, consider call successful
  return { transactionHash: txHash || outcomeId || undefined };
}
