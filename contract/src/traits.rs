use near_sdk::{
    ext_contract,
    json_types::{Base58CryptoHash, U64},
    serde::{Deserialize, Serialize},
    serde_json::Value,
    AccountId, Promise, PromiseError,
};
use schemars::JsonSchema;

pub type ProposalId = u32;

#[derive(Clone, Serialize, Deserialize, JsonSchema)]
#[serde(crate = "near_sdk::serde")]
#[schemars(crate = "schemars")]
pub struct MerkleProof {
    pub index: u32,
    #[schemars(with = "String")]
    pub path: Vec<Base58CryptoHash>,
}

// Optional typed payload for manual serialization if needed elsewhere
#[derive(Clone, Serialize, Deserialize, JsonSchema)]
#[serde(crate = "near_sdk::serde")]
#[schemars(crate = "schemars")]
pub struct ProxyVoteArgs {
    pub proposal_id: ProposalId,
    pub vote: u8,
    pub merkle_proof: MerkleProof,
    pub v_account: VAccount,
}

#[derive(Clone, Serialize, Deserialize, JsonSchema)]
#[serde(crate = "near_sdk::serde")]
#[schemars(crate = "schemars")]
pub struct AccountDelegation {
    #[schemars(with = "String")]
    pub account_id: AccountId,
}

#[derive(Clone, Serialize, Deserialize, JsonSchema)]
#[serde(crate = "near_sdk::serde")]
#[schemars(crate = "schemars")]
pub struct Account {
    #[schemars(with = "String")]
    pub account_id: AccountId,
    #[schemars(with = "String")]
    pub update_timestamp: U64,
    pub balance: Value,
    pub delegated_balance: Value,
    pub delegation: Option<AccountDelegation>,
}

#[derive(Clone, Serialize, Deserialize, JsonSchema)]
#[serde(crate = "near_sdk::serde")]
#[schemars(crate = "schemars")]
pub enum VAccount {
    V0(Account),
}

#[allow(dead_code)]
#[ext_contract(ext_voting)]
pub trait VotingContract {
    #[payable]
    fn vote(
        &mut self,
        proposal_id: ProposalId,
        vote: u8,
        merkle_proof: MerkleProof,
        v_account: VAccount,
    ) -> Promise;
}

#[allow(dead_code)]
#[ext_contract(ext_self)]
pub trait SelfCallbacks {
    fn vote_callback(
        &mut self,
        proposal_id: ProposalId,
        vote: u8,
        #[callback_result] result: Result<(), PromiseError>,
    );
}
