use near_sdk::{
    env::{self},
    near, require,
    store::{IterableMap, IterableSet},
    AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError,
};

mod traits;
use traits::{ext_self, ext_voting, MerkleProof, ProposalId, SelfCallbacks, VAccount};

// Governance constants
const GAS_FOR_GOVERNANCE: Gas = Gas::from_tgas(50);
const GAS_FOR_CALLBACK: Gas = Gas::from_tgas(30);
const DEPOSIT: NearToken = NearToken::from_millinear(1); // 0.001 NEAR
const VOTING_CONTRACT: &str = "vote.ballotbox.testnet";

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Worker {
    codehash: String,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    pub owner_id: AccountId,
    pub approved_codehashes: IterableSet<String>,
    pub worker_by_account_id: IterableMap<AccountId, Worker>,
}

#[near]
impl Contract {
    #[init]
    #[private]
    pub fn init(owner_id: AccountId) -> Self {
        Self {
            owner_id,
            approved_codehashes: IterableSet::new(b"a"),
            worker_by_account_id: IterableMap::new(b"b"),
        }
    }

    // Owner management functions

    pub fn approve_codehash(&mut self, codehash: String) {
        self.require_owner();
        self.approved_codehashes.insert(codehash);
    }

    pub fn register_agent(&mut self, codehash: String) -> bool {
        // THIS IS A LOCAL DEV CONTRACT, SKIPPING ATTESTATION CHECKS

        let predecessor = env::predecessor_account_id();
        self.worker_by_account_id
            .insert(predecessor, Worker { codehash });

        true
    }

    // Governance functions

    pub fn cast_vote(
    &mut self,
    proposal_id: ProposalId,
    vote: u8,
    merkle_proof: MerkleProof,
    v_account: VAccount,
) -> Promise {
    env::log_str(&format!(
        "🗳️ PROXY: Casting vote {} for proposal {}",
        vote, proposal_id
    ));

    ext_voting::ext(VOTING_CONTRACT.parse().unwrap())
        .with_static_gas(GAS_FOR_GOVERNANCE)
        .with_attached_deposit(DEPOSIT)
        .vote(proposal_id, vote, merkle_proof, v_account)
        .then(
            ext_self::ext(env::current_account_id())
                .with_static_gas(GAS_FOR_CALLBACK)
                .vote_callback(proposal_id, vote)
        )
}

    // View functions

    pub fn get_agent(&self, account_id: AccountId) -> Worker {
        self.worker_by_account_id
            .get(&account_id)
            .expect("no worker found")
            .to_owned()
    }

    pub fn get_contract_balance(&self) -> NearToken {
        env::account_balance()
    }

    // Access control helpers

    fn require_owner(&mut self) {
        require!(env::predecessor_account_id() == self.owner_id);
    }

    #[allow(dead_code)]
    fn require_approved_codehash(&mut self) {
        let worker = self.get_agent(env::predecessor_account_id());
        require!(self.approved_codehashes.contains(&worker.codehash));
    }
}

// Implement the callback trait
#[near]
impl SelfCallbacks for Contract {
    #[private]
    fn vote_callback(
        &mut self,
        proposal_id: ProposalId,
        vote: u8,
        #[callback_result] result: Result<(), PromiseError>,
    ) {
        match result {
            Ok(_) => {
                env::log_str(&format!(
                    "✅ PROXY: Successfully cast vote {} for proposal {}",
                    vote, proposal_id
                ));
            }
            Err(e) => {
                env::log_str(&format!(
                    "❌ PROXY: Failed to cast vote for proposal {}: {:?}",
                    proposal_id, e
                ));
            }
        }
    }
}
