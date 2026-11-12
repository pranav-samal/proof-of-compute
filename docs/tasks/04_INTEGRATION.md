# Task 04 — Frontend Integration, Simulation, Deployment, and Docs (Member 4)

> Read `docs/SPEC.md` in full before writing any code.
> Every field name, endpoint, function signature, and type in this file is copied from
> SPEC.md or from `frontend/src/types/index.ts` (which is the authority for all type shapes).
> If you find a contradiction, fix SPEC.md first by PR.

---

## 1. Goal and Scope

**In scope:**

**1a. Frontend real adapters** — Replace the mock adapters in `frontend/src/services/api.ts`
and `frontend/src/services/chain.ts` with real implementations that call the backend REST
API and the deployed contracts. `VITE_USE_MOCK=false` must produce a fully working app.

**1b. Simulation** — Write a Python 3 simulator in `/simulation` that produces
`frontend/public/simulation.json`. The frontend's `SimulationPage` must load from that file
when `VITE_USE_MOCK=false` instead of computing locally.

**1c. Deployment** — Write `docker-compose.yml` at the repo root and a `scripts/start-local.sh`
that starts the full local stack in the right order.

**1d. Docs** — Keep `docs/SPEC.md` and `docs/WORK_PLAN.md` in sync with what is actually
built. Write `docs/PATENT.md` once the full flow works.

**Out of scope:**
- Solidity contracts.
- Backend Express server internals.
- Agent job execution logic.
- Any change to the frontend UI that is not required to wire in real data.

---

## 2. Prerequisites and Dependencies

| Dependency | From | File / Endpoint |
|---|---|---|
| Deployed contract ABIs and addresses | Member 1 | `contracts/deployments/localhost.json` |
| All backend REST endpoints live | Member 2 | `http://localhost:3001` |
| `GET /providers`, `GET /jobs`, `GET /jobs/:id/timeline`, `GET /receipts/:jobId` | Member 2 | SPEC.md §8 |
| `JobEscrow` ABI | Member 1 | `contracts/deployments/localhost.json` |
| `ProviderRegistry` ABI | Member 1 | `contracts/deployments/localhost.json` |
| Provider agent and verifier running | Member 3 | `npm run provider`, `npm run verifier` |

**You are the integration member. You are unblocked to start items 1b, 1c, 1d, and the
`isContractConfigured` → `true` guard immediately. The real adapters (1a) need Members 1
and 2 to finish their Phase A/B first.**

---

## 3. Tech Stack and Folder / File Structure

### 3a. Frontend (existing, extend only)

```
frontend/src/services/
├── api.ts       — EXTEND: add realApi implementation; keep mockApi intact
└── chain.ts     — EXTEND: add realChain implementation; keep mockChain intact
```

No other frontend files should need changes unless a field name in the types does not match
what the backend returns. If that happens, fix the adapter mapping (not the type).
See SPEC.md §13 (Known Mismatches) for the full mapping list.

### 3b. Simulation

```
simulation/
├── simulate.py              — Main simulator script
├── requirements.txt         — numpy (required), matplotlib (optional)
├── config.json              — Tunable parameters (see §4b below)
└── output/
    └── simulation_results.json   — Written by simulate.py
```

The output file is also copied / symlinked into `frontend/public/simulation.json` so the
frontend can fetch it at runtime.

### 3c. Deployment

```
(repo root)
├── docker-compose.yml
└── scripts/
    ├── start-local.sh       — Starts full stack in order
    └── deploy-contracts.sh  — Compile + deploy to localhost, writes deployments JSON
```

---

## 4. Step-by-Step Implementation Checklist

### Phase A — Guard and env setup (do first, unblocks frontend testing)

- [ ] **A1.** Add `VITE_BACKEND_URL` and all `VITE_CONTRACT_*` vars to `frontend/.env.example`
  (they are already in SPEC.md §11; just confirm they match and are present).  
  *Do not create or edit any other frontend file.*

- [ ] **A2.** In `frontend/src/services/chain.ts`, update `isContractConfigured()` so it returns
  `true` when `import.meta.env.VITE_CONTRACT_JOB_ESCROW` is non-empty.  
  *Expected:* The "Sign Transaction" button on the Submit Job page becomes enabled when the
  env var is set. *(This is the only change to chain.ts at this stage.)*

### Phase B — Real `api.ts` adapter

Implement `realApi: ApiService` in `frontend/src/services/api.ts`. All calls go to
`import.meta.env.VITE_BACKEND_URL`. Respect the `VITE_USE_MOCK` flag:
`export const api = useMock ? mockApi : realApi`.

Apply the field mappings from **SPEC.md §13 (Known Mismatches)** in the adapter,
not in the page components:

| Mismatch | Mapping rule |
|---|---|
| `Provider.id` ← `address` | `id: p.address` |
| `Provider.reputation` ← `reputationBps` | `reputation: p.reputationBps / 100` |
| `VerificationPolicy.assuranceLevel` ← `uint8` | `['low','medium','high','maximum'][v]` |
| `VerificationPolicy.samplingPct` ← `samplingBps` | `samplingPct: p.samplingBps / 100` |
| `VerificationPolicy.requiredCollateralEth` ← `collateralWei` | `formatEther(collateralWei)` |
| `JobReceipt.quorumRequired` | Derive from policy tier per SPEC.md §4.4 |
| `SettlementOutcome.status` ← `Outcome` enum | `ACCEPTED→'released', REJECTED→'slashed', INCONCLUSIVE→'held'` |
| `Attestation.verifierId` ← `address` | use address string directly |
| `Job.id` ← `uint256` | `id: job.jobId.toString()` |

- [ ] **B1.** Implement `realApi.listProviders()` → `GET /providers`.
- [ ] **B2.** Implement `realApi.getProvider(id)` → `GET /providers/:address`.
- [ ] **B3.** Implement `realApi.listJobs()` → `GET /jobs?requester=<walletAddress>`.
- [ ] **B4.** Implement `realApi.getJob(id)` → `GET /jobs/:id` + `GET /jobs/:id/timeline`.
  Merge timeline events into `Job.timeline` array using `JobTimelineEvent` shape.
- [ ] **B5.** Implement `realApi.getReceipt(jobId)` → `GET /receipts/:jobId`. Map to `JobReceipt`.
- [ ] **B6.** Implement `realApi.getDashboardMetrics()` → `GET /stats/requester/:address`.
- [ ] **B7.** Implement `realApi.listVerifiers()` → `GET /verifiers`. Map to `VerifierNode[]`.
- [ ] **B8.** Implement `realApi.registerJob(config)` → `POST /jobs/spec`.
  This endpoint only pins the spec to IPFS and returns `{ cid, profileHash }`.
  The returned `cid` is used by `realChain.registerJobOnChain` as `specCid`.
  `registerJob` must return the job ID string, so after pinning it calls
  `realChain.registerJobOnChain` and returns the resulting on-chain job ID.

*Expected after Phase B:* With `VITE_USE_MOCK=false` and backend running,
the Marketplace page shows real providers from the chain.

### Phase C — Real `chain.ts` adapter

Implement `realChain: ChainService` in `frontend/src/services/chain.ts`.

The existing `ChainService` interface was designed before the contract ABI was finalised.
The real adapter must implement the **updated** function signatures from SPEC.md §5.3,
while keeping the `ChainService` interface backward-compatible for the UI.

The updated `ChainService` interface (replace the old interface in `chain.ts`):

```typescript
export interface ChainService {
  // Register job on-chain: pins spec first (via api.registerJob), then calls contract
  registerJobOnChain(
    specCid:      string,
    profileHash:  string,
    reproClass:   number,   // 0=D, 1=T, 2=N
    assurance:    number,   // 0–3
    deadlineTs:   number,   // unix timestamp
    paymentWei:   bigint,
  ): Promise<{ txHash: string; jobId: string }>;

  // Provider commits result
  commitResult(
    jobId:          string,
    resultHash:     string,
    checkpointRoot: string,
    resultCid:      string,
  ): Promise<string>;   // tx hash

  // Verifier submits attestation (EIP-712)
  submitAttestation(
    jobId:        string,
    verdict:      0 | 1 | 2,   // PASS=0, FAIL=1, INCONCLUSIVE=2
    evidenceHash: string,
    signature:    string,
  ): Promise<string>;   // tx hash

  // Query settlement
  getSettlement(jobId: string): Promise<import('./types').SettlementOutcome | null>;

  // Stake management (provider)
  depositStake(amountWei: bigint): Promise<string>;
  withdrawStake(amountWei: bigint): Promise<string>;

  // Assign provider (requester calls)
  assignProvider(jobId: string, providerAddress: string): Promise<string>;

  // Select verifiers (anyone calls, after commitBlock+1)
  selectVerifiers(jobId: string): Promise<string>;

  // Settle (anyone calls once quorum reached)
  settle(jobId: string): Promise<string>;

  isContractConfigured(): boolean;
}
```

> **Note:** The old interface had `registerJobOnChain(jobId, policy, escrowEth)`.
> The new one matches the actual contract function. Keep `mockChain` implementing the
> *old* interface shape so existing mock tests do not break; `realChain` implements the
> *new* shape. Update the UI pages that call these functions to use the new signatures.

- [ ] **C1.** Load contract ABI from `contracts/deployments/<chainId>.json` at runtime.
  Use `VITE_CONTRACT_JOB_ESCROW`, `VITE_CONTRACT_PROVIDER_REGISTRY` env vars for addresses.
- [ ] **C2.** Implement `realChain.registerJobOnChain` using `JobEscrow.registerJob` with `msg.value = paymentWei`.
- [ ] **C3.** Implement `realChain.assignProvider` using `JobEscrow.assignProvider`.
- [ ] **C4.** Implement `realChain.depositStake` / `withdrawStake` using `ProviderRegistry`.
- [ ] **C5.** Implement `realChain.selectVerifiers` and `realChain.settle`.
- [ ] **C6.** Implement `realChain.getSettlement` by calling `JobEscrow.getJob` view and mapping `outcome` enum.

*Expected:* With wallet connected and contracts deployed, clicking "Submit Job" on the
frontend sends a real transaction and the job appears in the job list.

### Phase D — Wire UI pages to real data

The pages were already written against the mock. With real adapters in place, most pages
should work automatically. Check each one:

- [ ] **D1.** `MarketplacePage` — providers from `api.listProviders()`, stake and reputation fields populated from real on-chain data.
- [ ] **D2.** `SubmitJobPage` — "Sign Transaction" calls `realChain.registerJobOnChain` after `api.registerJob` pins the spec.
- [ ] **D3.** `JobDetailsPage` — job timeline from `GET /jobs/:id/timeline` mapped to `JobTimelineEvent[]`. Tx hash links use `VITE_EXPLORER_BASE`.
- [ ] **D4.** `ReceiptPage` — receipt from `api.getReceipt()`. QR code encodes the receipt URL.
- [ ] **D5.** `DashboardPage` — metrics from `api.getDashboardMetrics()`.
- [ ] **D6.** `ProviderConsolePage` — `depositStake` / `withdrawStake` call `realChain`.
- [ ] **D7.** `VerifierConsolePage` — `submitAttestation` calls `realChain.submitAttestation` with EIP-712 signature built by the frontend using `ethers.TypedDataEncoder`.
- [ ] **D8.** `SimulationPage` — when `VITE_USE_MOCK=false`, load data from `fetch('/simulation.json')` instead of calling `simulationDataPoints()`. Fall back to `simulationDataPoints()` if the fetch fails.

### Phase E — Simulation script

- [ ] **E1.** Write `simulation/requirements.txt`: `numpy>=1.26.0`.

- [ ] **E2.** Write `simulation/config.json`:
  ```json
  {
    "nJobs": 1000,
    "cheatingProbRange": [0.0, 1.0],
    "cheatingProbSteps": 21,
    "stakeEth": 10.0,
    "paymentEth": 1.0,
    "K": 2,
    "weights": [3000, 2000, 1500, 1500, 2000],
    "tierThresholds": [2500, 5000, 7500],
    "verifierFeesBps": 200,
    "slashBps": 5000
  }
  ```

- [ ] **E3.** Write `simulation/simulate.py`:
  - For each `cheatingProb` from `cheatingProbRange` in `cheatingProbSteps` steps:
    - Simulate `nJobs` jobs using `config.json` parameters.
    - Policy 1 "always-reexecute": verifier cost = 1× job cost always.
    - Policy 2 "fixed-10pct-sampling": sample 10% of tasks; verifier cost = 0.1× job cost.
    - Policy 3 "risk-adaptive": use the risk formula from SPEC.md §4 to assign a tier;
      verifier cost = `samplingBps / 10000` × job cost.
    - For each policy, compute: `avgVerifierCost` (normalized to 1.0 = one job cost),
      `detectionRate` (fraction of cheating jobs caught), `falsePositiveRate`.
  - Write output to `simulation/output/simulation_results.json`.
  - Also copy to `frontend/public/simulation.json`.

- [ ] **E4.** Output JSON schema (one object per cheatingProb step):
  ```json
  [
    {
      "cheatingProb": 0.0,
      "alwaysReExecuteCost": 2.0,
      "fixedSamplingCost": 1.1,
      "riskAdaptiveCost": 1.0,
      "detectionRate": 0.0,
      "falsePositiveRate": 0.0
    }
  ]
  ```
  This matches `SimDataPoint` in `frontend/src/types/index.ts` (with the addition of
  `falsePositiveRate` which the frontend should render if present).

*Expected:* `python simulation/simulate.py` runs without error, writes
`frontend/public/simulation.json`, and `SimulationPage` loads from it.

### Phase F — Docker Compose and run scripts

- [ ] **F1.** Write `docker-compose.yml` at repo root:

  ```yaml
  services:
    chain:
      image: "node:20-slim"
      working_dir: /app/contracts
      volumes: ["./contracts:/app/contracts", "./contracts/deployments:/app/contracts/deployments"]
      command: "npx hardhat node"
      ports: ["8545:8545"]
      healthcheck:
        test: ["CMD", "curl", "-f", "http://localhost:8545"]
        interval: 5s
        retries: 10

    deploy:
      image: "node:20-slim"
      working_dir: /app/contracts
      volumes: ["./contracts:/app/contracts"]
      depends_on:
        chain:
          condition: service_healthy
      command: "npx hardhat run scripts/deploy.ts --network localhost"

    backend:
      build: "./backend"
      env_file: "./backend/.env"
      ports: ["3001:3001"]
      depends_on:
        deploy:
          condition: service_completed_successfully
      volumes: ["./contracts/deployments:/app/deployments:ro"]

    provider-agent:
      build:
        context: "./agents"
        dockerfile: "Dockerfile.provider"
      env_file: "./agents/.env"
      depends_on: [backend]

    verifier-service:
      build:
        context: "./agents"
        dockerfile: "Dockerfile.verifier"
      env_file: "./agents/.env"
      depends_on: [backend]

    frontend:
      build: "./frontend"
      env_file: "./frontend/.env"
      ports: ["5173:5173"]
      depends_on: [backend]
  ```

- [ ] **F2.** Write `scripts/start-local.sh`:
  ```bash
  #!/usr/bin/env bash
  set -e
  echo "==> Starting local Proof-of-Compute stack"
  cd "$(git rev-parse --show-toplevel)"

  echo "[1/5] Starting Hardhat node..."
  (cd contracts && npx hardhat node &)
  sleep 3

  echo "[2/5] Deploying contracts..."
  (cd contracts && npx hardhat run scripts/deploy.ts --network localhost)

  echo "[3/5] Starting backend..."
  (cd backend && npm run dev &)
  sleep 2

  echo "[4/5] Starting agents..."
  (cd agents && npm run provider &)
  (cd agents && npm run verifier &)

  echo "[5/5] Starting frontend..."
  cd frontend && VITE_USE_MOCK=false npm run dev
  ```

- [ ] **F3.** Write `scripts/deploy-contracts.sh`: thin wrapper around Hardhat deploy.

- [ ] **F4.** Write a `frontend/Dockerfile` for the compose file:
  ```dockerfile
  FROM node:20-slim AS build
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci
  COPY . .
  RUN npm run build

  FROM node:20-slim
  WORKDIR /app
  RUN npm install -g serve
  COPY --from=build /app/dist ./dist
  CMD ["serve", "-s", "dist", "-l", "5173"]
  ```

### Phase G — Docs sync

- [ ] **G1.** After full end-to-end run succeeds, update `docs/SPEC.md §13` (Known Mismatches)
  to mark each resolved mismatch as "✅ Resolved in real adapter".

- [ ] **G2.** After full end-to-end run succeeds, update `docs/SPEC.md §14` (Open Questions)
  to mark each resolved question as "✅ Resolved: <answer>".

- [ ] **G3.** Write `docs/PATENT.md` once the full flow works. It must accurately describe
  what is *actually* implemented, not the idealised design. Cross-check with SPEC.md.

---

## 5. Exact Interfaces to Implement

### `ApiService` (from `frontend/src/services/api.ts`, authoritative)

```typescript
export interface ApiService {
  listProviders(): Promise<Provider[]>;
  getProvider(id: string): Promise<Provider | null>;
  listJobs(): Promise<Job[]>;
  getJob(id: string): Promise<Job | null>;
  getReceipt(jobId: string): Promise<JobReceipt | null>;
  getDashboardMetrics(): Promise<DashboardMetrics>;
  listVerifiers(): Promise<VerifierNode[]>;
  registerJob(config: JobConfig): Promise<string>;
}
```

**Backend base URL:** `import.meta.env.VITE_BACKEND_URL` (default `http://localhost:3001`).

**All field mappings** from SPEC.md §13 must be applied in the adapter.

### `ChainService` (updated interface — see §4 Phase C above)

The updated interface replaces the existing `ChainService` in `frontend/src/services/chain.ts`.
Keep `mockChain` unchanged so the existing mock path continues to work.

### Simulation output type (from `frontend/src/types/index.ts`)

```typescript
interface SimDataPoint {
  cheatingProb:          number;   // 0–1
  alwaysReExecuteCost:   number;   // normalized, 1.0 = one job cost
  fixedSamplingCost:     number;
  riskAdaptiveCost:      number;
  detectionRate:         number;   // fraction 0–1
  falsePositiveRate?:    number;   // new field, optional for backward compat
}
```

---

## 6. Configuration and Environment Variables

### frontend/.env (non-mock, production values)

```bash
VITE_USE_MOCK=false
VITE_RPC_URL=http://127.0.0.1:8545
VITE_CHAIN_ID=31337
VITE_CONTRACT_PROVIDER_REGISTRY=   # from contracts/deployments/localhost.json
VITE_CONTRACT_VERIFICATION_POLICY= # from contracts/deployments/localhost.json
VITE_CONTRACT_JOB_ESCROW=          # from contracts/deployments/localhost.json
VITE_EXPLORER_BASE=https://sepolia.etherscan.io/tx/
VITE_BACKEND_URL=http://localhost:3001
```

### simulation (no .env — config.json only)

No secrets. All parameters in `simulation/config.json`.

---

## 7. Error Handling and Edge Cases

- **Backend unreachable**: `realApi` methods must reject with a clear error; the UI already
  has empty states for this. Do not catch and swallow errors silently.
- **Wallet not connected**: `realChain` methods must check `isContractConfigured()` before any
  call and throw `"Wallet not connected"` if false. The UI already disables the button, but the
  guard must exist in the adapter too.
- **Chain ID mismatch**: Check `provider.getNetwork().chainId` matches `VITE_CHAIN_ID` before
  any transaction; throw `"Wrong network"` if not.
- **Contract ABI not found**: if `contracts/deployments/<chainId>.json` does not exist at
  runtime, `isContractConfigured()` returns `false` and `realChain` methods throw descriptively.
- **`registerJob` partial failure**: if `POST /jobs/spec` succeeds but `registerJobOnChain`
  fails, the CID is already pinned (no rollback possible). Log the CID so the user can retry.
- **Simulation `fetch` failure**: `SimulationPage` falls back to `simulationDataPoints()` from
  `src/lib/risk.ts` if `fetch('/simulation.json')` fails. Log a warning.
- **`simulate.py` integer overflow**: use `numpy.float64` throughout; `config.json` values are
  all within safe float64 range.
- **EIP-712 wrong domain in verifier frontend**: use `ethers.TypedDataEncoder` with exactly
  the domain and type from SPEC.md §5.3. Any mismatch causes signature rejection on-chain.

---

## 8. Tests Required

```bash
# Frontend type check (no logic tests needed for adapter mapping)
cd frontend && npx tsc --noEmit

# Simulation
cd simulation && python -m pytest test_simulate.py -v
# (write test_simulate.py with at least the test cases below)

# Full integration test (requires running stack)
# (manual or via start-local.sh)
```

**Required test cases for `simulation/test_simulate.py`:**

1. Output file contains exactly `cheatingProbSteps` entries.
2. `alwaysReExecuteCost` is constant (2.0) across all entries.
3. `fixedSamplingCost` is constant (1.1) across all entries.
4. `riskAdaptiveCost` is non-decreasing as `cheatingProb` increases.
5. `detectionRate` is non-decreasing as `cheatingProb` increases.
6. All `detectionRate` values are in [0, 1].
7. `riskAdaptiveCost <= alwaysReExecuteCost` for all entries.
8. Output JSON is valid and matches the `SimDataPoint` schema.

---

## 9. Acceptance Criteria

```bash
# 1. TypeScript compiles cleanly
cd frontend && npx tsc --noEmit
# Expected: exit 0

# 2. VITE_USE_MOCK=false with running stack
cd frontend && VITE_USE_MOCK=false npm run dev
# Open http://localhost:5173/marketplace
# Expected: real providers from chain (not "Demo data" badge)

# 3. Submit a real job
# Connect MetaMask to localhost:8545 (Hardhat account)
# Fill in Submit Job form → Continue → Review → Sign Transaction
# Expected: MetaMask popup, transaction confirmed, job appears in /jobs

# 4. Full honest-case end-to-end
# (Provider agent and verifier running)
curl http://localhost:3001/receipts/1
# Expected: { receipt: {...}, ipfsVerified: true, ipfsMatchesChain: true }
# Open http://localhost:5173/receipt/1
# Expected: QR code shown, outcome "ACCEPTED"

# 5. Full malicious-case end-to-end
# Start provider with AGENT_CHEAT_MODE=true
curl http://localhost:3001/receipts/2
# Expected: outcome "REJECTED", provider slashCount incremented

# 6. Simulation
cd simulation && python simulate.py
# Expected: frontend/public/simulation.json written
# Open http://localhost:5173/simulation
# Expected: charts loaded from file (not computed inline), "Simulation data" label shown

# 7. Simulation tests
cd simulation && python -m pytest test_simulate.py -v
# Expected: 8 passing

# 8. Docker Compose
docker compose up --build
# Expected: all services healthy, http://localhost:5173 serves the app

# 9. TypeScript check still passes after adapter changes
cd frontend && npx tsc --noEmit
# Expected: exit 0 (must stay at 0 TypeScript errors)
```

---

## 10. Definition of Done

- [ ] `VITE_USE_MOCK=false` — Marketplace page shows real on-chain providers with no "Demo data" badges
- [ ] `VITE_USE_MOCK=false` — Submit Job form sends a real transaction; MetaMask popup appears
- [ ] `VITE_USE_MOCK=false` — Job timeline shows real on-chain events with real tx hash links
- [ ] `VITE_USE_MOCK=false` — Receipt page shows real receipt from chain + IPFS verified
- [ ] `VITE_USE_MOCK=true` — All existing mock paths still work (no regression)
- [ ] `ChainService.isContractConfigured()` returns `true` only when env vars are set
- [ ] Chain ID mismatch check throws `"Wrong network"` before any transaction
- [ ] `simulation/simulate.py` runs without error and writes `frontend/public/simulation.json`
- [ ] All 8 simulation test cases pass: `python -m pytest test_simulate.py`
- [ ] `SimulationPage` loads from `simulation.json` file when `VITE_USE_MOCK=false`
- [ ] `docker-compose.yml` starts all services in correct dependency order
- [ ] `scripts/start-local.sh` starts the full stack on a clean machine
- [ ] `frontend/src/services/api.ts` has zero direct imports from `../data/`  
      (all data comes through the service interface, not raw mock files)
- [ ] `docs/SPEC.md §13` Known Mismatches all marked resolved
- [ ] `docs/SPEC.md §14` Open Questions updated with resolved answers
- [ ] `npx tsc --noEmit` in `frontend/` exits 0 after all changes
- [ ] No `.env` files committed. No private keys committed.

---

## 11. Hand-off

**When real adapters are working:**
- Confirm to Members 1, 2, 3 which exact env var values they need to set in their `.env`
  files to connect to the shared Sepolia deployment.
- Update `README.md` full-stack run instructions with the actual commands that work.
- Write `docs/PATENT.md` and tag the commit as `v0.1.0-mvp`.

---

## 12. Prompt for Your AI Tool

```
You are implementing the frontend real adapters, simulation script, deployment config,
and documentation for Proof-of-Compute, a blockchain-based decentralised compute marketplace.

BEFORE WRITING ANY CODE:
1. Read docs/SPEC.md completely.
2. Read docs/tasks/04_INTEGRATION.md completely.
3. Read frontend/src/services/api.ts, chain.ts and frontend/src/types/index.ts completely.
   The types in index.ts are the authority. Do not change them except to add falsePositiveRate
   to SimDataPoint as an optional field.
4. Use ONLY the function names, field names, endpoint paths, and constant values defined in
   SPEC.md. Do NOT invent alternatives.
5. If something is not defined in SPEC.md, say "OPEN QUESTION: <description>" and stop.

IMPLEMENT (in this order):
1. frontend/src/services/api.ts — add realApi implementing ApiService using fetch()
   to VITE_BACKEND_URL. Apply ALL field mappings from SPEC.md §13.
2. frontend/src/services/chain.ts — update ChainService interface (new signatures from
   task file §5); add realChain. Keep mockChain unchanged.
3. Wire D1–D8 page changes (task file §4 Phase D).
4. simulation/simulate.py + requirements.txt + config.json + test_simulate.py.
5. docker-compose.yml + scripts/start-local.sh + scripts/deploy-contracts.sh.
6. frontend/Dockerfile.

CONSTRAINTS:
- Do NOT modify any frontend file except frontend/src/services/api.ts, chain.ts,
  frontend/src/pages/SimulationPage.tsx (fetch from /simulation.json),
  frontend/src/pages/SubmitJobPage.tsx (new chain.ts signatures),
  frontend/src/pages/ProviderConsolePage.tsx (depositStake/withdrawStake wei),
  frontend/src/pages/VerifierConsolePage.tsx (submitAttestation real call),
  and frontend/.env.example.
- VITE_USE_MOCK=true must continue to work with zero changes to mock paths.
- ETH amounts: all contract calls use BigInt wei; display uses formatEther.
- EIP-712 domain and type exactly as in SPEC.md §5.3.
- Simulation: Python 3, numpy only. No external HTTP calls.
- npx tsc --noEmit in frontend/ must exit 0 after every change.

FINISH BY:
1. Running npx tsc --noEmit in frontend/ and reporting result.
2. Running python -m pytest simulation/test_simulate.py and reporting result.
3. Running through acceptance criteria §9 items 1–9 and reporting each result.
4. Listing every file created or modified.
5. Listing every OPEN QUESTION encountered.
```
