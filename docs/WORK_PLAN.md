# Proof-of-Compute: Work Plan (MVP, 4 members)

Frontend is done and uses mock adapters (`frontend/src/services/`, `VITE_USE_MOCK=true`).

**Goal of the MVP:** Every item in the patent runs for real on a blockchain (local Hardhat
chain for development, Sepolia for the final demo) with real transactions, real IPFS storage
and real verification. No fake data.

---

## Key Documents

| Document | Purpose |
|---|---|
| **[docs/SPEC.md](SPEC.md)** | Single source of truth — all function names, events, API endpoints, types |
| **[docs/tasks/01_CONTRACTS.md](tasks/01_CONTRACTS.md)** | Member 1 task file — smart contracts |
| **[docs/tasks/02_BACKEND.md](tasks/02_BACKEND.md)** | Member 2 task file — backend API, IPFS, indexer |
| **[docs/tasks/03_AGENTS.md](tasks/03_AGENTS.md)** | Member 3 task file — provider agent, verifier service |
| **[docs/tasks/04_INTEGRATION.md](tasks/04_INTEGRATION.md)** | Member 4 task file — real adapters, simulation, deployment, docs |

---

## Rules for Everyone (also paste into your AI tool prompt)

- Read `docs/SPEC.md` first. Use only names (functions, events, endpoints, fields) defined in it.
- If something is not in `SPEC.md`, do not invent it. Ask in the group and add it to `SPEC.md` by pull request.
- Work only in your own folder. Shared files change only by pull request approved by all.
- Branch names: `feat/contracts-*`, `feat/backend-*`, `feat/agents-*`, `feat/integration-*`.
- Never push to `main`. Open a pull request and have one other member review it.
- Pull the latest `main` before starting, and merge your branch only after it works with the frontend (`VITE_USE_MOCK=false`).
- Never commit private keys or `.env` files.

---

## Shared Definitions (all in SPEC.md — Member 1 owns the final contract ABI)

**Job states:** `REGISTERED → ASSIGNED → COMMITTED → VERIFYING → SETTLED / DISPUTED → REFUNDED`

**Outcomes:** `NONE`, `ACCEPTED`, `REJECTED`, `INCONCLUSIVE`

**Verification tiers:**
| Tier | Method |
|---|---|
| 0 | Hash + rule check |
| 1 | Sampled re-execution (~10%) |
| 2 | Redundant multi-provider execution |
| 3 | Full re-execution + 1-hour challenge window |

**Risk score formula:** `R = (w1·V + w2·(1−Rep) + w3·Dh + w4·C + w5·A) / 10000`  
Default weights (bps): 3000, 2000, 1500, 1500, 2000. All owner-changeable.

**Reproducibility classes:** D (deterministic), T (tolerance-bound), N (non-deterministic)

**Collateral:** `payment × (5000 + riskBps) / 10000`

**Slash on REJECTED:** Provider loses 50% of locked collateral. 25% → verifiers who voted FAIL. 25% → requester. Payment fully refunded.

**Receipt fields:** `jobId, specCid, policyHash, provider, requester, resultHash, attestationRoot, tier, outcome, settledAt`

---

## Task Assignments

### Member 1 — Smart Contracts (`/contracts`)

Full task: **[docs/tasks/01_CONTRACTS.md](tasks/01_CONTRACTS.md)**

Summary:
- `ProviderRegistry.sol` — stake, verifier bond, reputation, slashing
- `VerificationPolicy.sol` — risk score computation, policy derivation
- `JobEscrow.sol` — full job lifecycle, EIP-712 attestations, receipt
- TypeScript/Chai tests for every happy and failure path
- Deploy script → `contracts/deployments/<network>.json`

**Publish first (even as a stub):** `deployments/localhost.json` with ABIs. Others are blocked until this exists.

---

### Member 2 — Backend API, IPFS, Indexer (`/backend`)

Full task: **[docs/tasks/02_BACKEND.md](tasks/02_BACKEND.md)**

Summary:
- Express REST API — all 14 endpoints from SPEC.md §8
- SQLite (better-sqlite3) — all 13 tables from SPEC.md §9
- Event indexer — polls all events from SPEC.md §6, idempotent upserts
- Pinata IPFS — pin specs and results, verify on reads
- Provider matching and ranking — `POST /jobs/match`
- `GET /receipts/:jobId` — includes `ipfsMatchesChain` flag

**Depends on:** Member 1 ABI stub.

---

### Member 3 — Provider Agent and Verifier Service (`/agents`)

Full task: **[docs/tasks/03_AGENTS.md](tasks/03_AGENTS.md)**

Summary:
- Provider agent — watches `ProviderAssigned`, runs job in Docker, commits result hash
- Verifier service — watches `VerifiersSelected`, re-executes, signs EIP-712 attestation
- Workloads: `sha-chain` (class D), `matmul` (class T)
- `AGENT_CHEAT_MODE=true` — wrong hash for slashing demo
- `NO_DOCKER=true` — local dev without Docker

**Depends on:** Member 1 ABI stub + Member 2 IPFS endpoints.

---

### Member 4 — Frontend Real Adapters, Simulation, Deployment, Docs (`/frontend`, `/simulation`, `/docs`)

Full task: **[docs/tasks/04_INTEGRATION.md](tasks/04_INTEGRATION.md)**

Summary:
- `frontend/src/services/api.ts` — real HTTP adapter for all backend endpoints
- `frontend/src/services/chain.ts` — real ethers v6 adapter for all contract calls
- Apply all field mappings from SPEC.md §13 (Known Mismatches)
- `simulation/simulate.py` — Python 3 policy comparison simulator → `frontend/public/simulation.json`
- `docker-compose.yml` + `scripts/start-local.sh`
- Keep SPEC.md and patent text in sync after full flow works

**Integrates with everyone. Runs the final end-to-end test.**

---

## Dependency Order

```
Step 1  All members read and agree on docs/SPEC.md
Step 2  Member 1 publishes deployments/localhost.json with ABI stubs
Step 3  Members 2, 3, 4 begin building against the ABI
Step 4  Member 1 completes contract logic and all tests pass
Step 5  Each member tests against the real local chain
Step 6  Each member merges by PR (one reviewer required)
Step 7  Member 4 runs full end-to-end, files issues against whoever owns the failing part
Step 8  Deploy to Sepolia, update deployments/sepolia.json
```

---

## MVP is Done When This Runs End-to-End on a Testnet

1. A requester connects a wallet, submits a job, and the payment is locked in escrow (real transaction).
2. The risk score and policy are recorded on-chain **before** any result exists.
3. The provider agent runs the job and commits the result hash on-chain.
4. Verifiers are selected by chain randomness and submit signed EIP-712 attestations.
5. **Honest case:** payment released, reputation updated, receipt written, QR code works.
6. **Malicious case:** wrong result detected, provider slashed, requester refunded, receipt shows REJECTED.
7. The receipt page verifies the job through its job ID or QR code against the chain and IPFS.
8. The Simulation page shows real simulator output from `simulation.json`.

---

## Open Questions

All unresolved questions are listed in **SPEC.md §14**. Resolve as a group; update SPEC.md by PR.

| # | Short description | Blocking whom |
|---|---|---|
| OQ-1 | Minimum verifier bond amount | Member 3 |
| OQ-2 | Who calls `selectVerifiers`? | Member 3 |
| OQ-3 | Who calls `settle`? | Member 3 |
| OQ-4 | Who provides `matmul` reference hash? | Member 3 |
| OQ-5 | IPFS gateway strategy | Member 3, Member 4 |
| OQ-6 | Docker image name and tag | Member 3, Member 4 |
| OQ-7 | Who can raise a dispute? | Member 1, Member 4 |
| OQ-8 | Arbitrator — fixed address or multisig? | All |
| OQ-9 | Sepolia deployer key strategy | Member 1, Member 4 |
| OQ-10 | Frontend wallet — wagmi vs bare ethers? | Member 4 |
