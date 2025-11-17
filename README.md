# Votron: NEAR AI Delegate

> [!WARNING]
> This technology has not yet undergone a formal audit. Please conduct your own due diligence and exercise caution before integrating or relying on it in production environments.

Votron detects House of Stake proposals, evaluates them using NEAR AI, and casts on-chain votes with veNEAR voting power delegated to it.

_Built with the [Shade Agent framework](https://docs.near.org/ai/shade-agents/introduction)_

## Features

- 💭 **LLM-Based Analysis**: NEAR AI Cloud
- 🔐 **Secure Execution**: Phala (TEEs)
- 📡 **Monitoring**: Intear Events API

## Prerequisites

### Required Tools

#### `near-cli-rs`

```bash
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/near/near-cli-rs/releases/latest/download/near-cli-rs-installer.sh | sh
```

#### `shade-agent-cli`

```bash
npm i -g @neardefi/shade-agent-cli
```

#### Docker

Install Docker for [Mac](https://docs.docker.com/desktop/setup/install/mac-install/) or [Linux](https://docs.docker.com/desktop/setup/install/linux/) and set up an account.

Log in to docker, `docker login` for Mac or `sudo docker login` for Linux.

### Accounts & Keys

1. **Create NEAR testnet account:**

```bash
near account create-account sponsor-by-faucet-service <example-name.testnet> autogenerate-new-keypair print-to-terminal network-config testnet create
```

> [!IMPORTANT]
> Be sure to record the account name and `seed phrase`!

2. **Get Phala Cloud API key:**

- Sign up: https://cloud.phala.network/register
- Get API key: https://cloud.phala.network/dashboard/tokens

> Phala Cloud is a service that offers secure and private hosting in a TEE using [Dstack](https://docs.phala.network/overview/phala-network/dstack).

3. **Get NEAR AI Cloud API key:**

- Sign up: https://cloud.near.ai
- Generate API key via dashboard

## Setup

1. **Clone the repository:**

```bash
git clone https://github.com/neargov/votron && cd votron
```

2. **Install dependencies:**

```bash
npm i
```

3. **Configure environment:**

```bash
cp .env.development.local.example .env.development.local
```

## Getting Started

Edit `.env.development.local` with your credentials:

```env
NEAR_AI_CLOUD_API_KEY=your_near_ai_api_key
NEAR_ACCOUNT_ID=your_near_account_id
NEAR_SEED_PHRASE="your seed phrase"
NEXT_PUBLIC_contractId=ac-proxy.example.testnet
VOTING_CONTRACT_ID=vote.ballotbox.testnet
VENEAR_CONTRACT_ID=v.hos03.testnet
NEAR_RPC_JSON=https://rpc.testnet.near.org
```

4. **Start Docker:**

### Mac

Simply open the Docker Desktop application or run:

```bash
open -a Docker
```

### Linux

```bash
sudo systemctl start docker
```

## Local Development

1. **Deploy proxy contract locally:**

```bash
# Build contract
cd contract
docker run --rm -v "$(pwd)":/workspace pivortex/near-builder@sha256:cdffded38c6cff93a046171269268f99d517237fac800f58e5ad1bcd8d6e2418 cargo near build non-reproducible-wasm

# Deploy with Shade Agent CLI
cd ..
shade-agent-cli --wasm contract/target/near/contract.wasm --funding 5
```

> The CLI on Linux may prompt you to enter your `sudo password`.

2. **Start agent in another terminal:**

```bash
npm run dev
```

The app will be running here: https://localhost:3000

### Contract Development

The proxy contract is in `contract/`:

- `src/lib.rs` - Main contract logic
- `src/traits.rs` - Type definitions and external contract interfaces

---

## TEE Deployment

1. Change the `NEXT_PUBLIC_contractId` prefix to `ac-sandbox.example.testnet`

2. Run the Shade Agent CLI

```bash
shade-agent-cli --wasm contract/target/near/contract.wasm --funding 5
```

> The CLI on Linux may prompt you to enter your `sudo password`.

The last URL the CLI outputs is where your app is hosted.

If your application is not working, head over to your App on Phala Dashboard and review the logs.

## Interacting with the Agent

You can interact with your agent via the APIs directly or via a lightweight frontend contained in this repo.

### Direct

For Phala deployments, swap localhost:3000 for your deployment URL.

### Testing

To see the agent in action:

```bash
cd frontend
npm i
npm run dev
```

To run the frontend with your Phala deployment, change the `API_URL` to Phala URL in your [config.js](./frontend/src/config.js) file.

## API Endpoints

### Vote on Proposal

```bash
POST /api/vote
Content-Type: application/json

{
  "proposalId": "0"
}
```

### Manual Vote

```bash
POST /api/manual-vote
Content-Type: application/json

{
  "proposalId": "0",
  "vote": 0  # 0=For, 1=Against, 2=Abstain
}
```

### Check Status

```bash
GET /api/vote/status
GET /api/vote/status/:proposalId
GET /api/agent-status
```

## More Info

- [Shade Agent Framework](https://docs.near.org/ai/shade-agents/introduction)
- [Phala Cloud](https://phala.com)
- [Intear Events API](https://docs.intear.tech/docs/events-api)
- [NEAR AI Cloud](https://cloud.near.ai)
- [House of Stake](https://houseofstake.org)

## License

MIT
