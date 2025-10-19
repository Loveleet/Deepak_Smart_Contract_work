# LAB Token Monorepo

Production-ready pnpm workspace for an ERC20/BEP20-style dApp targeting BSC Testnet (default) or Ethereum Sepolia. The project bundles Solidity contracts, a hardened Node/Express backend, a React + Vite frontend, shared ABI/types, and CI automation.

## Table of Contents
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

## Tech Stack

- **Contracts:** Solidity `^0.8.20`, Hardhat, TypeChain, OpenZeppelin (AccessControl, Pausable, ReentrancyGuard, ERC20Permit)
- **Backend:** Node.js + TypeScript, Express, Zod validation, ethers v6, rate limiting, API-key auth
- **Frontend:** React 18, Vite, wagmi + RainbowKit, TailwindCSS, React Query, react-hook-form
- **Tooling:** pnpm workspaces, Justfile automation, Vitest, ESLint, Prettier, GitHub Actions (per package)

## Monorepo Layout

```
contracts/   Hardhat project and LABToken.sol implementation
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
```

`contracts/.env`

```bash
PRIVATE_KEY=0xYOUR_PRIVATE_KEY
RPC_URL=https://bsc-testnet.publicnode.com
BSC_SCAN_API_KEY=YOUR_BSCSCAN_KEY
ETHERSCAN_API_KEY=
CHAIN=bscTestnet
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
pnpm run deploy:testnet   # compile & deploy LABToken to configured testnet
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

1. Populate root and `contracts/.env`.
2. `pnpm run deploy:testnet`
3. Copy the transaction hash/output – deployment prints the LABToken address and writes `shared/artifacts.json` + `shared/constructor-args.json`.
4. `pnpm run postdeploy` to sync artifacts across packages.
5. `pnpm run verify:testnet` to verify on the configured explorer.

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

# Set fees (admin)
curl -X POST http://localhost:4000/set-fees \
  -H "Content-Type: application/json" \
  -H "X-API-Key: changeme" \
  -d '{"feeType":"slotBuy","config":{"platformFeeBps":100,"creatorFeeBps":50,"royaltyFeeBps":25,"referrerFeeBps":25}}'

# Slot buy transfer
curl -X POST http://localhost:4000/slot-buy \
  -H "Content-Type: application/json" \
  -d '{"recipient":"0x...","amount":"10","referrer":"0x..."}'
```

See `backend/openapi.yaml` for the full OpenAPI spec.

## Frontend

```bash
pnpm --filter frontend dev
```

Features:

- Wallet connect (MetaMask + WalletConnect)
- Live balance + fee dashboard
- Forms for every custom transfer method with decoded receipts
- Admin panel for fee/wallet management
- Toasted status + validation errors

## Testing

```bash
pnpm --filter contracts test     # Hardhat + Mocha
pnpm --filter backend test       # Vitest + Supertest
pnpm --filter frontend run typecheck
```

## Local Hardhat Testing Walkthrough

Want to exercise every transfer flow against a local blockchain? Follow these exact steps (the same ones used to validate the dashboard):

1. **Launch Hardhat node**  
   ```bash
   pnpm --filter contracts exec hardhat node
   ```  
   Keep this terminal open. It prints 20 funded accounts and their private keys.

2. **Deploy LABToken to the node**  
   In a second terminal:  
   ```bash
   HARDHAT_NETWORK=localhost pnpm --filter contracts exec node scripts/deploy-local.cjs
   ```  
   The script deploys `LABToken`, applies default fees, and writes `shared/artifacts.json`.

3. **Sync artifacts to backend/frontend**  
   ```bash
   pnpm run postdeploy
   ```

4. **Configure env files for the local chain**
   - `backend/.env`
     ```
     PORT=4000
     RPC_URL=http://127.0.0.1:8545
     PRIVATE_KEY_BACKEND_SIGNER=ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
     API_KEY_ADMIN=changeme
     CHAIN_ID=31337
     ```
   - `frontend/.env`
     ```
     VITE_BACKEND_URL=http://localhost:4000
     VITE_CHAIN_ID=31337
     VITE_WALLETCONNECT_PROJECT_ID=demo
     ```

5. **Start services**
   ```bash
   pnpm --filter backend dev
   pnpm --filter frontend dev
   ```

6. **Connect MetaMask**
   - Add a custom network: RPC `http://127.0.0.1:8545`, Chain ID `31337`.
   - Import Hardhat account #0 with private key  
     `ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`.
   - Import the LAB token address printed during deployment (default `0x5FbDB2315678afecb367f032d93F642f64180aa3` on a fresh node).

7. **Copy/paste test inputs in the dashboard**  
   - Slot Buy:  
     Recipient `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`, Amount `100`, Referrer `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65`
   - Direct Commission:  
     Seller `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`, Amount `50`
   - Royalty Transfer:  
     Recipient `0x90F79bf6EB2c4f870365E785982E1f101E93b906`, Amount `25`
   - Super Royalty Transfer:  
     Recipient `0x70997970C51812dc3A010C7d01b50e0d17dc79C8`, Amount `200`,  
     Payees `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC, 0x90F79bf6EB2c4f870365E785982E1f101E93b906`,  
     BPS `6000, 3000`
   - Creator Transfer:  
     Recipient `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`, Amount `75`
   - Flash Transfer (requires API key field set to `changeme`):  
     To `0x90F79bf6EB2c4f870365E785982E1f101E93b906`, Amount `30`

   Each submission writes a receipt card showing the decoded event data.

8. **Reset when needed**  
   Stop backend/frontend, kill the Hardhat node, restart from step 1 to get a clean blockchain.

## Continuous Integration

Three GitHub Action workflows (`contracts-ci`, `backend-ci`, `frontend-ci`) run build/lint/test pipelines on push and PRs.

## Post-Deployment Artifacts

- `shared/artifacts.json` – canonical ABI + deployed address map
- `shared/constructor-args.json` – constructor parameters for verification
- `backend/src/generated/artifacts.json`, `frontend/src/generated/artifacts.json` – synced copies for runtime/build-time consumption

## Connecting to an Existing Deployment

If you already have a LABToken (or compatible contract) running on a public network, you can point this stack at it without redeploying:

1. **Collect contract details**
   - Deployed address
   - ABI (copy from your verified source or block explorer)
   - Chain identifier (e.g. `97` for BSC Testnet, `11155111` for Sepolia)

2. **Edit `shared/artifacts.json`**
   ```json
   {
     "chain": "bscTestnet",
     "addresses": {
       "LABToken": "0xYourLiveTokenAddress"
     },
     "abis": {
       "LABToken": [ ... ABI JSON ... ]
     },
     "updatedAt": "2025-10-18T12:34:56.000Z"
   }
   ```

   **Example** (Sepolia deployment):
   ```json
   {
     "chain": "sepolia",
     "addresses": {
       "LABToken": "0x1234567890abcdef1234567890abcdef12345678"
     },
     "abis": {
       "LABToken": [
         {
           "inputs": [
             { "internalType": "address", "name": "recipient", "type": "address" },
             { "internalType": "uint256", "name": "amount", "type": "uint256" },
             { "internalType": "address", "name": "referrer", "type": "address" }
           ],
           "name": "slotBuy",
           "outputs": [],
           "stateMutability": "nonpayable",
           "type": "function"
         }
         // …rest of ABI entries…
       ]
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
     RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
     PRIVATE_KEY_BACKEND_SIGNER=0xfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeedfeed
     API_KEY_ADMIN=supersecret
     CHAIN_ID=11155111
     ```
   - `frontend/.env`
     ```
     VITE_BACKEND_URL=http://localhost:4000
     VITE_CHAIN_ID=11155111
     VITE_WALLETCONNECT_PROJECT_ID=abc123yourwcprojectid
     ```

5. **Restart services**
   ```bash
   pnpm --filter backend dev
   pnpm --filter frontend dev
   ```

6. **Verify**
   - Hit `GET /config` and `GET /balance/:address` to confirm the backend can read on-chain state.
   - Use the dashboard to exercise transfers. Admin routes (set fees/wallets, flash transfer) still require the backend signer to hold `DEFAULT_ADMIN_ROLE`, `FEE_MANAGER_ROLE`, and `FLASH_ROLE`.

With these steps, the frontend and backend operate against the existing deployment without code changes.

## Deploying to BSC Testnet

Want to run the full stack on Binance Smart Chain Testnet (Chapel)? Follow this checklist:

1. **Prereqs**
   - Testnet BNB (grab from the official faucet)
   - RPC endpoint, e.g. `https://bsc-testnet.publicnode.com`
   - Deployer/admin private key (will receive the LAB supply and hold admin roles)
   - Optional: BscScan API key for contract verification

2. **Set environment variables**
   - Root `.env`
     ```
     CHAIN=bscTestnet
     RPC_URL=https://bsc-testnet.publicnode.com
     PRIVATE_KEY=0xYOUR_TESTNET_DEPLOYER_KEY
     BSC_SCAN_API_KEY=YOUR_BSCSCAN_KEY
     ```
   - `contracts/.env`
     ```
     PRIVATE_KEY=0xYOUR_TESTNET_DEPLOYER_KEY
     RPC_URL=https://bsc-testnet.publicnode.com
     BSC_SCAN_API_KEY=YOUR_BSCSCAN_KEY
     ETHERSCAN_API_KEY=
     CHAIN=bscTestnet
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

3. **Deploy LABToken**
   ```bash
   pnpm run deploy:testnet
   ```
   Note the printed contract address—`shared/artifacts.json` is updated automatically.

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
   - Add the deployed LAB token under “Import Tokens”.
   - Walk through the same transfer forms as in the local walkthrough—transactions will broadcast to the live testnet.

8. **Need to redeploy?** Re-run the deploy script (or edit `shared/artifacts.json` with the new address) and execute `pnpm run postdeploy` again before restarting services.

## Notes

- `LABToken` includes ERC20Permit, AccessControl roles (`DEFAULT_ADMIN_ROLE`, `FEE_MANAGER_ROLE`, `FLASH_ROLE`), pausability, safe fee caps, and mint/burn admin gates.
- All high-level transfer flows (`slotBuy`, `directCommission`, `royaltyTransfer`, `superRoyaltyTransfer`, `creatorTransfer`, `flashTransfer`) are exposed through the backend and surfaced in the frontend dashboard.
- Additional conveniences: Justfile shortcuts, OpenAPI spec, shared schema validation, rate limiting, and toast-based UX.
