# Proof-of-Compute — Demo Runbook

**Audience**: Presenters, reviewers, and graders running the project locally.  
**Purpose**: Step-by-step instructions for starting the full stack and demonstrating both the Honest and Malicious provider flows.  
**Chain**: Hardhat local devchain — Chain ID 31337.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Repository Layout](#2-repository-layout)
3. [Terminal Layout](#3-terminal-layout)
4. [Start the Stack](#4-start-the-stack)
5. [MetaMask Setup](#5-metamask-setup)
6. [Demo: Honest Provider Flow](#6-demo-honest-provider-flow)
7. [Demo: Malicious Provider Flow](#7-demo-malicious-provider-flow)
8. [E2E Scripts (Automated)](#8-e2e-scripts-automated)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 20 | https://nodejs.org |
| npm | ≥ 10 (ships with Node 20) | — |
| MetaMask | ≥ 12 (browser extension) | https://metamask.io |

**Internet access is required** only for pinning job specs to Pinata IPFS. The chain, backend, and frontend all run locally.

Install root-level dependencies (ethers for E2E scripts):

```powershell
# From repo root
npm install
```

Install workspace dependencies:

```powershell
cd contracts && npm install && cd ..
cd backend   && npm install && cd ..
cd frontend  && npm install && cd ..
```

---

## 2. Repository Layout

```
Blockchain-cp/
├── contracts/          Solidity contracts + Hardhat
│   └── deployments/localhost.json   ← written by deploy script
├── backend/            Express + better-sqlite3 + event indexer
├── frontend/           React + Vite + ethers v6
├── agents/             Provider and verifier agent stubs
├── scripts/            E2E and seed scripts (Node ESM)
│   ├── seed-chain.mjs  ← register providers + verifiers on-chain
│   ├── e2e-honest.mjs  ← automated honest-path test
│   └── e2e-malicious.mjs ← automated malicious-path test
└── docs/               This file and task specs
```

---

## 3. Terminal Layout

Open **four terminals** side by side, all starting from the repo root:

| # | Label | Purpose |
|---|-------|---------|
| A | Hardhat | Local blockchain node |
| B | Backend | REST API + event indexer |
| C | Frontend | Vite dev server |
| D | Seed/E2E | Run seed and E2E scripts |

---

## 4. Start the Stack

Run these commands in order. Each step must complete before moving to the next.

### 4.1 Terminal A — Hardhat node

```powershell
cd contracts
npx hardhat node
```

Expected output (last lines):
```
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/
...
Account #0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 (10000 ETH)
...
```

Leave this terminal running.

### 4.2 Terminal A (second tab) or new terminal — Deploy contracts

```powershell
cd contracts
npx hardhat run scripts/deploy.ts --network localhost
```

Expected output:
```
Deployed contracts to .../contracts/deployments/localhost.json
{
  "ProviderRegistry": { "address": "0x5FbDB2315678afecb367f032d93F642f64180aa3", ...
  "VerificationPolicy": { "address": "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512", ...
  "JobEscrow": { "address": "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0", ...
```

> **Note**: Addresses are deterministic (nonce-0 from deployer). They are always the same on a fresh Hardhat node.

### 4.3 Terminal B — Backend

```powershell
cd backend
npx tsx src/index.ts
```

Expected output:
```
[migrate] Fresh database created and persisted.
[server] Proof-of-Compute backend → http://localhost:3001
[server] NODE_ENV = development
[indexer] Started. Polling every 5000ms
[indexer] JobEscrow:        0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0
[indexer] ProviderRegistry: 0x5FbDB2315678afecb367f032d93F642f64180aa3
```

Verify health:
```powershell
Invoke-RestMethod http://localhost:3001/health
# → {"status":"ok","block":3,"syncLag":0,"contractsConfigured":true}
```

### 4.4 Terminal D — On-chain seed

```powershell
# From repo root
$env:PROVIDER_REGISTRY_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3"
$env:RPC_URL                   = "http://127.0.0.1:8545"
$env:BACKEND_URL               = "http://localhost:3001"
node scripts/seed-chain.mjs
```

Expected output (abbreviated):
```
[seed] Connected to chain 31337
[seed] depositStake 12 ETH for NovaSpark Compute ✓
[seed] Profile for NovaSpark Compute stored in backend ✓
...
[seed] registerVerifier 0x14dC79964da2C08b23698B3D3cc7Ca32193d9955 bond=2 ETH ✓
[seed] registerVerifier 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 bond=1.5 ETH ✓
[seed] ✅ On-chain seed complete
```

This registers 5 GPU providers (Hardhat accounts #1–#5) and 2 verifiers (accounts #7, #0) with real on-chain transactions.

### 4.5 Terminal C — Frontend

```powershell
cd frontend
npm run dev
```

Expected output:
```
  VITE v5.x.x  ready in xxx ms
  ➜  Local:   http://localhost:5173/
```

Open http://localhost:5173 in a browser with MetaMask installed.

---

## 5. MetaMask Setup

### 5.1 Add Hardhat Local Network

1. Open MetaMask → Settings → Networks → Add network → Add manually.
2. Fill in:
   - **Network name**: Hardhat Local
   - **New RPC URL**: `http://127.0.0.1:8545`
   - **Chain ID**: `31337`
   - **Currency symbol**: `ETH`
3. Click Save, then switch to this network.

### 5.2 Import Accounts

Import these Hardhat private keys into MetaMask. Use **Import Account → Private Key**.

| Role | Account | Private Key |
|------|---------|-------------|
| Requester | `0xa0Ee7A142d267C1f36714E4a8F75612F20a79720` | `2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6` |
| Provider (NovaSpark) | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
| Verifier | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |

> **Security warning**: These are well-known Hardhat test keys. Never fund them on a real network.

---

## 6. Demo: Honest Provider Flow

This flow demonstrates a requester submitting a job, NovaSpark Compute running it correctly, a verifier confirming the result, and payment released to the provider.

### 6.1 Submit a Job (Requester)

1. Connect MetaMask with the **Requester** account (`0xa0Ee7A…`).
2. Navigate to **Marketplace** → **Submit Job**.
3. Fill in:
   - **Title**: `SHA-Chain Demo — 100 iterations`
   - **Type**: `sha-chain`
   - **Seed**: `0xdeadbeef000000000000000000000000000000000000000000000000000000`
   - **Iterations**: `100`
   - **GPU memory**: `16 GB`
   - **Payment**: `0.001 ETH`
4. Click **Submit** — MetaMask will pop up for the `registerJob` transaction.
5. After confirmation the UI navigates to the **Job Details** page.

**Expected screen**: Job state badge reads `REGISTERED`.

### 6.2 Assign NovaSpark Compute

1. Still on Job Details, find the **Assign Provider** panel.
2. Select **NovaSpark Compute** from the provider list.
3. Click **Assign** — MetaMask signs the `assignProvider` transaction.

**Expected screen**: State badge → `ASSIGNED`. Provider shown as NovaSpark.

### 6.3 Provider Commits Result

> *In a real deployment the provider agent runs automatically. For the demo, switch MetaMask to the **Provider** account.*

1. Switch MetaMask to the **Provider** account (`0x70997970C5…`).
2. Navigate to **Provider Console**.
3. Click **Commit Result** on the pending job. The agent computes SHA-256 × 100 from the seed and submits the hash.
4. MetaMask signs `commitResult`.

**Expected screen**: State badge → `COMMITTED`.

### 6.4 Verifier Checks the Work

The backend indexer calls `selectVerifiers` automatically once a new block arrives after commitBlock+1.

> *To drive it manually in the demo: switch to the **Verifier** account and visit the **Verifier Console**.*

The verifier re-executes the SHA-chain, confirms the hash matches, and submits a **PASS** attestation.

**Expected screen**: State badge → `VERIFYING`, then `SETTLED`.

### 6.5 Settlement — ACCEPTED

The indexer calls `settle` automatically once quorum (1/1 verifier) is reached.

**Expected screen**:
- State badge → `SETTLED`
- Outcome badge → `ACCEPTED` (green)
- Provider balance increases in MetaMask
- **Receipt** tab shows: `outcome: ACCEPTED`, policy hash, result hash, attestation root

---

## 7. Demo: Malicious Provider Flow

This flow demonstrates a cheating provider getting caught, slashed, and the requester refunded.

### 7.1 Submit a New Job

Same as §6.1 but use a different seed:
- **Seed**: `0xcafebabe000000000000000000000000000000000000000000000000000000`
- **Title**: `SHA-Chain Cheat Demo`

### 7.2 Assign Provider

Same as §6.2.

### 7.3 Provider Commits Wrong Hash ⚠️

1. Switch MetaMask to the **Provider** account.
2. In **Provider Console**, hold the `Shift` key (or if the app has a **Cheat Mode** toggle, enable it) and click **Commit Result**.
   - The provider submits `0xdeadbeefdeadbeef…` instead of the real hash.
3. MetaMask signs `commitResult` with the bad hash.

**Expected screen**: State badge → `COMMITTED` (hash stored on-chain is wrong).

### 7.4 Verifier Detects Mismatch

The verifier re-executes locally, computes the correct hash, finds it doesn't match the committed hash, and submits a **FAIL** attestation.

**Expected screen**: State badge → `VERIFYING`, outcome pending.

### 7.5 Settlement — REJECTED

After quorum, `settle` is called automatically.

**Expected screen**:
- State badge → `SETTLED`
- Outcome badge → `REJECTED` (red)
- Provider stake decreases in MetaMask (slashed ~50% of collateral)
- Requester balance returns to near-original (payment refunded)
- **Provider Console** → Reputation score drops from 10000 to 9500 bps
- **Receipt** tab shows: `outcome: REJECTED`

---

## 8. E2E Scripts (Automated)

The E2E scripts reproduce both flows programmatically, assert every state transition, and print every transaction hash. Run them in Terminal D after the full stack is up and seeded.

### 8.1 Honest path

```powershell
# From repo root
$env:RPC_URL     = "http://127.0.0.1:8545"
$env:BACKEND_URL = "http://localhost:3001"
$env:CHAIN_ID    = "31337"
npm run e2e:honest
```

Expected final output:
```
══════════════════════════════════════════════════
  HONEST PATH E2E TEST — ALL ASSERTIONS PASSED ✓
══════════════════════════════════════════════════
```

### 8.2 Malicious path

Run immediately after the honest path (the chain retains state):

```powershell
npm run e2e:malicious
```

Expected final output:
```
══════════════════════════════════════════════════
 MALICIOUS PATH E2E TEST — ALL ASSERTIONS PASSED ✓
 Provider cheated → detected → slashed → refunded
══════════════════════════════════════════════════
```

### 8.3 Sample transaction hash output (Honest)

```
Transaction Hashes:
registerJob         : 0x16818dbb9ac65b256fa6043521deabebec175d05e13f4952db8ba0ada61febc6
assignProvider      : 0xc956f9f44bd0d9f126728ea374c4811a1ebdbf4c4861d56d2cb6d471ee2e3b06
commitResult        : 0x4494c65814151c4fa726489bf48846878f33c7a833391377f4454a21d40436e9
selectVerifiers     : 0x9aa21760cb50e1b1f128f1988a8977b0c0101baa950c8fb80e74f54470a01681
attestations[0]     : 0x83b457619853108bd249c9feaddf43fa051036aa3e74c388ff28b0423c5ca1f3
settle              : 0xceb744c3e1e57e150a3a7462478266085076d56ee5542ad53a90222adcc88de9
```

### 8.4 Sample transaction hash output (Malicious)

```
Transaction Hashes:
registerJob         : 0x9294e12162da9c465f32b8f6394372fbb6f0364c13d1ef5b851009714abbf2dc
assignProvider      : 0x87c4432ddde2ec086a85f49595a8dee7ce78e503725cf432a38cf509af62c072
commitResult        : 0x7bac39e94375f82e7fd4915d5be439689e9353d09e9785f5d97bb09da41e77d5
selectVerifiers     : 0x594fe2c29ea24d2b20e05b8809d081bd948ac4f4d8d6907f4c15dcc650aef09b
attestations[0]     : 0x94b3032c8c38fe7a5e18565cea958124e6dcd641bfaba2086995be3ed92d07a3
settle              : 0x37eb8cedb976e58d057a4d9a28ef782dc7197e41f931d4477b72f71a2bb5de6c
```

---

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `PROVIDER_REGISTRY_ADDRESS is required` | Env var not set before seed | Set `$env:PROVIDER_REGISTRY_ADDRESS = "0x5FbDB…"` in the same PowerShell session |
| `Hardhat node NOT reachable` | Chain not started or port conflict | Kill any process on port 8545 (`netstat -ano \| findstr :8545`), restart `npx hardhat node` |
| Backend returns 500 on `/health` | Missing env var or wrong DB path | Check `backend/.env` has `RPC_URL`, `CHAIN_ID`, `IPFS_GATEWAY`; delete `backend/data/poc.db` and restart |
| MetaMask shows wrong chain or balance | MetaMask not on Hardhat Local | Switch to Chain ID 31337 in MetaMask network selector |
| `nonce has already been used` in E2E | Stale nonce from a previous run | Restart the Hardhat node (`Ctrl-C` → `npx hardhat node`), redeploy, re-seed, then re-run |
| `not enough verifiers` on-chain | Seed not run after fresh deploy | Run seed: `node scripts/seed-chain.mjs` |
| `Receipt not yet indexed` | Indexer needs 2+ blocks after settle | Run `npm run e2e:malicious` or wait 10 s; indexer will sync when next tx mines a block |
| `fetch failed` on spec pin | Backend not running when seed runs | Start backend first (`npx tsx src/index.ts`), then re-run seed |
| `ipfsMatchesChain: false` in receipt | Local gateway can't fetch Pinata CID | Expected in local dev. The CID is correct on-chain; Pinata rate limit or no network access |
| Frontend blank page | Vite not compiled | `cd frontend && npm run dev`; check browser console for the actual error |
| Provider assigned but state stuck at ASSIGNED | `INDEXER_AUTO_ADVANCE=false` in `.env` | For the UI demo, set `INDEXER_AUTO_ADVANCE=true` in `backend/.env` and restart the backend |

---

## Contract Addresses (Hardhat Local — Deterministic)

These addresses are always the same on a fresh Hardhat node because the deployer starts at nonce 0.

| Contract | Address |
|----------|---------|
| ProviderRegistry | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |
| VerificationPolicy | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` |
| JobEscrow | `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` |

---

## Account Reference (Hardhat Test Accounts)

| Role | Address | Private Key |
|------|---------|-------------|
| Deployer + verifier2 | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` | `ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` |
| Provider (NovaSpark) | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` | `59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
| Provider (CoreMesh) | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` | `5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` |
| Provider (PixelVault) | `0x90F79bf6EB2c4f870365E785982E1f101E93b906` | `7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6` |
| Provider (IronBridge) | `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` | `47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a` |
| Provider (StormCloud) | `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` | `8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba` |
| Verifier1 | `0x14dC79964da2C08b23698B3D3cc7Ca32193d9955` | `4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356` |
| Requester | `0xa0Ee7A142d267C1f36714E4a8F75612F20a79720` | `2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6` |

> **Hardhat account #6** (private key `92db14e4…`) has only 63 hex characters and is non-standard; it is skipped throughout this project.
