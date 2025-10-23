# LAB Token Monorepo

Production-ready pnpm workspace for the GAIN-USDT peer-to-peer revenue platform. The stack spans Solidity contracts, a hardened Node/Express backend, a React + Vite frontend, shared ABI/types, and CI automation. It targets Binance Smart Chain (Testnet by default) and can be re-pointed at other EVM networks when needed.

## Table of Contents
- [Product Overview](#product-overview)
- [Tech Stack](#tech-stack)
- [Monorepo Layout](#monorepo-layout)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Common Commands](#common-commands)
- [Deployment & Verification](#deployment--verification)
- [Backend API](#backend-api)
- [Frontend](#frontend)
- [Testing](#testing)
- [Local Hardhat Testing Walkthrough](#local-hardhat-testing-walkthrough)
- [Connecting to an Existing Deployment](#connecting-to-an-existing-deployment)
- [Deploying to BSC Testnet](#deploying-to-bsc-testnet)
- [Continuous Integration](#continuous-integration)
- [Post-Deployment Artifacts](#post-deployment-artifacts)

## Product Overview
- **Mission:** Enable a provably fair, 12-slot matrix earnings engine where every transaction distributes USDT instantly to sponsors, uplines, royalty achievers, and the creator vault.
- **Trustless & Transparent:** All logic executes on-chain; funds move wallet-to-wallet without custodial holding. Anyone can audit slot purchases, royalty routes, and balances.
- **Immutable & Unstoppable:** Once the contract is deployed on BSC, it cannot be modified. Community governance and new deployments drive evolution.
- **Slot Mechanics:** The first slots begin at 20–25 USDT and double through twelve tiers (Star → Blue Diamond). Slots never expire, unlocking permanent earning potential.
- **Distribution Model:** 70% uplines (1-2-3-4 spillover), 12% direct sponsor commission, 15% royalty across levels 5–11 (5%,4%,2%,1%,1%,1%,1%), 3% creator operations wallet. Any unassigned royalty remainder flows to the flash vault.
- **Royalty Qualifications:** Earning each royalty band requires four qualified directs at or above the respective slot level, incentivising team growth.
- **User Experience:** The React dashboard is a convenience layer; power users can interact directly with the contract via wallets/dApps by calling `registerApproval` and `slotBuy`.

## Tech Stack

- **Contracts:** Solidity `^0.8.20`, Hardhat, TypeChain, OpenZeppelin (AccessControl, Pausable, ReentrancyGuard, ERC20Permit)
- **Backend:** Node.js + TypeScript, Express, Zod validation, ethers v6, rate limiting, API-key auth
- **Frontend:** React 18, Vite, wagmi + RainbowKit, TailwindCSS, React Query, react-hook-form
- **Tooling:** pnpm workspaces, Justfile automation, Vitest, ESLint, Prettier, GitHub Actions (per package)

## Monorepo Layout

```
contracts/   Hardhat project with GAINUSDTDistributor and mocks
backend/     Express API proxying privileged token flows
frontend/    Vite React dashboard with wallet integrations
shared/      Shared ABI + type helpers
.github/     Contracts, backend, and frontend CI pipelines
```

## Prerequisites

- Node.js 20+
- pnpm `8.15.5`
- Git
- Optional: Just (`brew install just`)

## Installation

```bash
pnpm install
```

### Environment Variables

Root `.env` (select chain + deploy credentials):

```bash
CHAIN=bscTestnet   # or sepolia
RPC_URL=https://bsc-testnet.publicnode.com
PRIVATE_KEY=0xYOUR_PRIVATE_KEY
BSC_SCAN_API_KEY=YOUR_BSCSCAN_KEY
USDT_ADDRESS=0xc9722e88c255f2c793867c19a2f7c8b62a97e5
USDT_DECIMALS=6
CREATOR_WALLET=0xYOUR_CREATOR_WALLET
FLASH_WALLET=0xYOUR_FLASH_WALLET
ADMIN_WALLET=0xYOUR_ADMIN_WALLET
```

`contracts/.env`

```bash
PRIVATE_KEY=0xYOUR_PRIVATE_KEY
RPC_URL=https://bsc-testnet.publicnode.com
BSC_SCAN_API_KEY=YOUR_BSCSCAN_KEY
ETHERSCAN_API_KEY=
CHAIN=bscTestnet
USDT_ADDRESS=0xc9722e88c255f2c793867c19a2f7c8b62a97e5
USDT_DECIMALS=6
CREATOR_WALLET=0xYOUR_CREATOR_WALLET
FLASH_WALLET=0xYOUR_FLASH_WALLET
ADMIN_WALLET=0xYOUR_ADMIN_WALLET
```

`backend/.env`

```bash
PORT=4000
RPC_URL=https://bsc-testnet.publicnode.com
PRIVATE_KEY_BACKEND_SIGNER=0xYOUR_ADMIN_KEY
API_KEY_ADMIN=changeme
CHAIN_ID=97
```

`frontend/.env`

```bash
VITE_BACKEND_URL=http://localhost:4000
VITE_CHAIN_ID=97
VITE_WALLETCONNECT_PROJECT_ID=YOUR_WC_PROJECT_ID
```

> After deploying contracts, run `pnpm run postdeploy` to copy `shared/artifacts.json` into `backend/src/generated/` and `frontend/src/generated/`.

## Common Commands

```bash
pnpm dev                  # run backend + frontend together
pnpm run deploy:testnet   # compile & deploy GAINUSDTDistributor to the configured network
pnpm run verify:testnet   # verify contract on BscScan/Sepolia
pnpm run postdeploy       # sync ABI/address to backend & frontend
pnpm --filter contracts test
pnpm --filter backend test
pnpm --filter frontend run build

# with just
just deploy-testnet
just test-contracts
```

## Deployment & Verification

1. Populate root and `contracts/.env` with the target USDT token, creator/flash wallets, and admin key.
2. `pnpm run deploy:testnet`
3. Copy the transaction hash/output – the script prints the `GAINUSDTDistributor` address and writes `shared/artifacts.json` + `shared/constructor-args.json` (including the ABI).
4. `pnpm run postdeploy` to sync artifacts across packages (backend + frontend will now point to the fresh deployment).
5. `pnpm run verify:testnet` to submit verification to BscScan (requires `BSC_SCAN_API_KEY`).

## Backend API

Start the API:

```bash
pnpm --filter backend dev
```

Health check:

```bash
curl http://localhost:4000/health
```

Key endpoints (`X-API-Key` required for admin routes):

```bash
# Read config
curl http://localhost:4000/config

# Read user profile
curl http://localhost:4000/user/0x0000000000000000000000000000000000000001

# Pause contract (admin)
curl -X POST http://localhost:4000/admin/pause \
  -H "X-API-Key: changeme"

# Update creator wallet (admin)
curl -X POST http://localhost:4000/admin/set-creator-wallet \
  -H "Content-Type: application/json" \
  -H "X-API-Key: changeme" \
  -d '{"wallet":"0x1234..."}'

# Withdraw USDT (admin)
curl -X POST http://localhost:4000/admin/withdraw-usdt \
  -H "Content-Type: application/json" \
  -H "X-API-Key: changeme" \
  -d '{"to":"0xabc...","amount":"150"}'
```

See `backend/openapi.yaml` for the full OpenAPI spec.

## Frontend

```bash
pnpm --filter frontend dev
```

Features:

- Wallet connect (MetaMask + WalletConnect)
- Live distributor snapshot (slot prices, royalty splits, wallets)
- Guided workflow for `approve` → `registerApproval` → `slotBuy`
- Real-time transaction toasts with explorer links
- Admin console to pause/unpause, update wallets, withdraw USDT, recover dust tokens

## Testing

```bash
pnpm --filter contracts test     # Hardhat + Mocha
pnpm --filter backend test       # Vitest + Supertest
pnpm --filter frontend run typecheck
```

## Local Hardhat Testing Walkthrough

Spin up a disposable environment to validate the full approval → slot purchase flow locally:

1. **Start a node**
   ```bash
   pnpm --filter contracts exec hardhat node
   ```
   Keep this terminal running; Hardhat exposes funded test accounts here.

2. **Deploy MockUSDT + distributor**
   ```bash
   HARDHAT_NETWORK=localhost pnpm --filter contracts exec node scripts/deploy-local.cjs
   ```
   Outputs the MockUSDT and `GAINUSDTDistributor` addresses and writes them to `shared/artifacts.json`.

3. **Sync artifacts to apps**
   ```bash
   pnpm run postdeploy
   ```

4. **Configure env files**
   - `backend/.env`
     ```bash
     PORT=4000
     RPC_URL=http://127.0.0.1:8545
     PRIVATE_KEY_BACKEND_SIGNER=ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
     API_KEY_ADMIN=changeme
     CHAIN_ID=31337
     ```
   - `frontend/.env`
     ```bash
     VITE_BACKEND_URL=http://localhost:4000
     VITE_CHAIN_ID=31337
     VITE_WALLETCONNECT_PROJECT_ID=demo
     ```

5. **Run backend & frontend**
   ```bash
   pnpm --filter backend dev
   pnpm --filter frontend dev
   ```

6. **Wallet setup**
   - Add network → RPC `http://127.0.0.1:8545`, Chain ID `31337`.
   - Import Hardhat account #0 (private key `ac0974…ff80`).
   - Add MockUSDT (address printed in step 2).

7. **Test the flow**
   1. Approve MockUSDT for the distributor contract.
   2. Register the approval and pause a second so the next block mines.
   3. Enter a sponsor (e.g. `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`) and click **Buy Slot 1**.
   4. Verify results from the backend:
      ```bash
      curl http://localhost:4000/user/0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 | jq
      curl http://localhost:4000/user/0x70997970C51812dc3A010C7d01b50e0d17dc79C8 | jq
      ```
      Expect the buyer to show `maxSlot: 1` and the sponsor to show `qualifiedDirects` level 1 = 1.
   5. (Optional) In the Hardhat console fund another account with MockUSDT, switch MetaMask to it, set yourself as sponsor, and repeat steps 1–4 to watch the direct commission land in your wallet.

8. **Reset**
   Stop backend/frontend, Ctrl+C the Hardhat node, and repeat from step 1 whenever you need a fresh chain.

## Continuous Integration

Three GitHub Action workflows (`contracts-ci`, `backend-ci`, `frontend-ci`) run build/lint/test pipelines on push and PRs.

## Post-Deployment Artifacts

- `shared/artifacts.json` – canonical ABI + deployed address map
- `shared/constructor-args.json` – constructor parameters for verification
- `backend/src/generated/artifacts.json`, `frontend/src/generated/artifacts.json` – synced copies for runtime/build-time consumption

## Connecting to an Existing Deployment

If you already have a `GAINUSDTDistributor` deployed (for example the production mUSDT distributor on BSC Testnet), you can point the stack at it without redeploying:

1. **Collect contract details**
   - Distributor address
   - ABI (from your verified source or explorer)
   - USDT token address used by the distributor
   - Chain identifier (e.g. `97` for BSC Testnet)

2. **Edit `shared/artifacts.json`**
   ```json
   {
     "chain": "bscTestnet",
     "addresses": {
       "GAINUSDTDistributor": "0xYourDistributorAddress",
       "USDT": "0xc9722e88c255f2c793867c19a2f7c8b62a97e5"
     },
     "abis": {
       "GAINUSDTDistributor": [ ... ABI JSON ... ]
     },
     "updatedAt": "2025-10-18T12:34:56.000Z"
   }
   ```

3. **Sync artifacts across packages**
   ```bash
   pnpm run postdeploy
   ```

4. **Configure environment files**
   - `backend/.env`
     ```
     PORT=4000
     RPC_URL=https://bsc-testnet.publicnode.com
     PRIVATE_KEY_BACKEND_SIGNER=0xfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeed
     API_KEY_ADMIN=supersecret
     CHAIN_ID=97
     ```
   - `frontend/.env`
     ```
     VITE_BACKEND_URL=http://localhost:4000
     VITE_CHAIN_ID=97
     VITE_WALLETCONNECT_PROJECT_ID=abc123yourwcprojectid
     ```

5. **Restart services**
   ```bash
   pnpm --filter backend dev
   pnpm --filter frontend dev
   ```

6. **Verify**
   - Hit `GET /config` and `GET /balance/:address` to confirm the backend can read on-chain state.
   - Use the dashboard to approve/register/execute slot purchases against the live distributor. Admin routes (pause/unpause, wallet updates, withdrawals) still require the backend signer to hold the necessary roles.

With these steps, the frontend and backend operate against the existing deployment without code changes.

## Deploying to BSC Testnet

Want to run the full stack on Binance Smart Chain Testnet (Chapel)? Follow this checklist:

1. **Prereqs**
   - Testnet BNB (claim from https://testnet.bnbchain.org/faucet-smart)
   - RPC endpoint, e.g. `https://bsc-testnet.publicnode.com`
   - Deployer/admin private key (receives contract roles and royalty authority)
   - Optional: BscScan API key for contract verification

2. **Set environment variables**
   - Root `.env`
     ```
     CHAIN=bscTestnet
     RPC_URL=https://bsc-testnet.publicnode.com
     PRIVATE_KEY=0xYOUR_TESTNET_DEPLOYER_KEY
     BSC_SCAN_API_KEY=YOUR_BSCSCAN_KEY
     USDT_ADDRESS=0xc9722e88c255f2c793867c19a2f7c8b62a97e5
     USDT_DECIMALS=6
     CREATOR_WALLET=0xYOUR_CREATOR_WALLET
     FLASH_WALLET=0xYOUR_FLASH_WALLET
     ADMIN_WALLET=0xYOUR_ADMIN_WALLET
     ```
   - `contracts/.env`
     ```
     PRIVATE_KEY=0xYOUR_TESTNET_DEPLOYER_KEY
     RPC_URL=https://bsc-testnet.publicnode.com
     BSC_SCAN_API_KEY=YOUR_BSCSCAN_KEY
     ETHERSCAN_API_KEY=
     CHAIN=bscTestnet
     USDT_ADDRESS=0xc9722e88c255f2c793867c19a2f7c8b62a97e5
     USDT_DECIMALS=6
     CREATOR_WALLET=0xYOUR_CREATOR_WALLET
     FLASH_WALLET=0xYOUR_FLASH_WALLET
     ADMIN_WALLET=0xYOUR_ADMIN_WALLET
     ```
   - `backend/.env`
     ```
     PORT=4000
     RPC_URL=https://bsc-testnet.publicnode.com
     PRIVATE_KEY_BACKEND_SIGNER=0xYOUR_TESTNET_ADMIN_KEY
     API_KEY_ADMIN=changeme
     CHAIN_ID=97
     ```
   - `frontend/.env`
     ```
     VITE_BACKEND_URL=http://localhost:4000
     VITE_CHAIN_ID=97
     VITE_WALLETCONNECT_PROJECT_ID=YOUR_WC_PROJECT_ID
     ```

3. **Deploy the slot distributor**
   ```bash
   pnpm run deploy:testnet
   ```
   The script prints the deployed address and updates `shared/artifacts.json`.

4. **Sync artifacts for frontend/backend**
   ```bash
   pnpm run postdeploy
   ```

5. **(Optional) Verify contract on BscScan**
   ```bash
   pnpm run verify:testnet
   ```

6. **Start services pointing at BSC Testnet**
   ```bash
   pnpm --filter backend dev
   pnpm --filter frontend dev
   ```

7. **Use the dashboard**
   - In MetaMask, switch to BSC Testnet and import the deployer/admin account.
   - Add the USDT token used by the distributor (e.g. mUSDT at `0xc9722e88c255f2c793867c19a2f7c8b62a97e5`).
   - Run the workflow: USDT `approve` → `registerApproval` → `slotBuy` and review receipts for upline/direct/royalty flows.

8. **Need to redeploy?** Re-run the deploy script (or edit `shared/artifacts.json` with the new address) and execute `pnpm run postdeploy` before restarting services.

## Notes

- The codebase now centers on `GAINUSDTDistributor`; a lightweight `MockUSDT` contract is included for local testing.
- Key roles: `DEFAULT_ADMIN_ROLE`, `PAUSER_ROLE`, and `FUNDS_ROLE`. Only addresses with the appropriate role can pause/unpause or withdraw tokens.
- The backend surfaces read-only endpoints plus admin utilities (pause/unpause, wallet updates, withdrawals). End-user flows (`approve`, `registerApproval`, `slotBuy`) are executed directly from the frontend via wagmi.
- Additional conveniences: Justfile shortcuts, OpenAPI spec, shared schema validation, rate limiting, and toast-based UX.
