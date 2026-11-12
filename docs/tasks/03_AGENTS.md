# Task 03 — Provider Agent and Verifier Service (Member 3)

> Read `docs/SPEC.md` in full before writing any code.
> Every contract call, event name, field name, and workload definition in this file
> is copied from SPEC.md. If you find a contradiction, fix SPEC.md first by PR.

---

## 1. Goal and Scope

**In scope:**
- **Provider agent**: watches for `ProviderAssigned` events, downloads the job spec by CID, runs the job in a Docker container, uploads result to IPFS, computes result hash and checkpoint Merkle root, calls `JobEscrow.commitResult` on-chain.
- **Verifier service**: watches for `VerifiersSelected` events, checks if its address is in the selected set, re-executes the sampled portion (or full job for Tier 3), signs an EIP-712 attestation, calls `JobEscrow.submitAttestation` on-chain.
- Support two workload types: `sha-chain` (class D) and `matmul` (class T) — see SPEC.md §7.
- `AGENT_CHEAT_MODE=true` env flag: provider agent submits a deliberately wrong result hash. Used only to demonstrate slashing.
- `NO_DOCKER=true` env flag: run workloads directly in Node.js for local dev (no container needed).

**Out of scope:**
- Frontend code.
- Backend REST server.
- Contracts.
- Running `selectVerifiers` or `settle` (those are OQ-2 / OQ-3 — resolve with the group first).

---

## 2. Prerequisites and Dependencies

| Dependency | From | File |
|---|---|---|
| Contract ABIs and addresses | Member 1 | `contracts/deployments/localhost.json` |
| `JobEscrow` ABI (at minimum `commitResult`, `submitAttestation`, `getJob`, `getPolicy`, `selectedVerifiers` events/functions) | Member 1 | — |
| `GET /ipfs/:cid` | Member 2 | `http://localhost:3001/ipfs/:cid` |
| `POST /ipfs/result` | Member 2 | `http://localhost:3001/ipfs/result` |
| IPFS gateway | SPEC.md §11 | `IPFS_GATEWAY` env var |

**Blocking:** Cannot call `commitResult` without ABI (Member 1 Phase A). Cannot download spec without backend IPFS proxy or direct gateway. Start the Docker runner and workload logic in parallel.

---

## 3. Tech Stack and Folder / File Structure

```
agents/
├── provider/
│   ├── index.ts            — Entry point: watch for ProviderAssigned, dispatch jobs
│   ├── runner.ts           — Execute job in Docker (or NO_DOCKER fallback)
│   ├── commit.ts           — Build commitResult call; cheat mode flag
│   └── merkle.ts           — Compute checkpoint Merkle root (keccak256 leaves)
├── verifier/
│   ├── index.ts            — Entry point: watch for VerifiersSelected, check eligibility
│   ├── reexecute.ts        — Re-execute sampled segments
│   ├── attest.ts           — Build and sign EIP-712 attestation
│   └── submit.ts           — Call submitAttestation on-chain
├── shared/
│   ├── chain.ts            — ethers v6 provider + signer factory
│   ├── contracts.ts        — Load ABI from deployments JSON
│   ├── ipfs.ts             — Fetch spec by CID; upload result via backend
│   └── config.ts           — Reads process.env, validates required vars
├── jobs/
│   ├── sha-chain.ts        — sha-chain workload executor
│   └── matmul.ts           — matmul workload executor
├── Dockerfile.provider
├── Dockerfile.verifier
├── package.json
├── tsconfig.json
├── .env.example
└── .env                    (gitignored)
```

**package.json dependencies:**
```json
{
  "dependencies": {
    "ethers": "^6.13.0",
    "node-fetch": "^3.3.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "ts-node": "^10.9.0",
    "nodemon": "^3.1.0",
    "vitest": "^1.6.0"
  }
}
```

---

## 4. Step-by-Step Implementation Checklist

### Phase A — Setup

- [ ] **A1.** `npm init`, install dependencies, `tsconfig.json`, npm scripts (`provider`, `verifier`, `test`).  
  *Expected:* `npm run provider` starts without crashing (even if no chain connection yet).

- [ ] **A2.** Write `shared/config.ts` that reads and validates all required env vars. Throw at startup if missing.  
  *Expected:* Starting with an empty `.env` prints a clear error listing missing vars.

- [ ] **A3.** Write `shared/chain.ts`: factory that creates an `ethers.JsonRpcProvider` and returns a `Wallet` from `PROVIDER_PRIVATE_KEY` or `VERIFIER_PRIVATE_KEY`.  
  *Expected:* `const { wallet } = await getProviderWallet()` works.

- [ ] **A4.** Write `shared/contracts.ts`: load ABIs from `contracts/deployments/<network>.json` based on `CHAIN_ID`, return typed contract instances.  
  *Expected:* `const escrow = getJobEscrow(wallet)` returns a typed `Contract`.

### Phase B — IPFS helpers

- [ ] **B1.** Write `shared/ipfs.ts`:
  - `fetchSpec(cid: string): Promise<object>` — `GET /ipfs/:cid` from backend, parse JSON.
  - `uploadResult(jobId, resultBuffer, checkpoints): Promise<{ cid, resultHash }>` — `POST /ipfs/result` to backend.
  *Expected:* Unit test with mocked HTTP returns expected shapes.

### Phase C — Workload executors

- [ ] **C1.** Write `jobs/sha-chain.ts`:
  - `execute(params: ShaChainParams): Promise<ShaChainResult>` — iterates SHA-256 `N` times from `seed`, records checkpoint every `M` iterations.
  - Returns `{ finalHash: string, checkpoints: string[], merkleRoot: string }`.
  - `verifySegment(params, startCheckpoint, endCheckpoint, segmentIndex): Promise<boolean>` — recomputes a single segment and checks continuity.

- [ ] **C2.** Write `jobs/matmul.ts`:
  - `execute(params: MatmulParams): Promise<MatmulResult>` — generate matrices from seeds, multiply, return binary blob.
  - `verify(params, resultBlob): Promise<boolean>` — re-run, compare with tolerance `1e-6` relative error.

- [ ] **C3.** Write `provider/merkle.ts`: `computeMerkleRoot(leaves: string[]): string` — keccak256 leaves, pair and hash up the tree.  
  *Expected:* Unit test: `computeMerkleRoot(["0xaaa", "0xbbb"])` matches a known expected root.

### Phase D — Provider agent

- [ ] **D1.** Write `provider/runner.ts`: given a spec object, run the appropriate workload.
  - If `NO_DOCKER=false`: run in Docker container using `docker run` with limits from `spec.resources`.
  - If `NO_DOCKER=true`: call the workload executor directly.
  - Return result blob and checkpoints.

- [ ] **D2.** Write `provider/commit.ts`:
  - If `AGENT_CHEAT_MODE=true`: replace `resultHash` with a random wrong hash before calling `commitResult`.
  - Build the call: `JobEscrow.commitResult(jobId, resultHash, checkpointRoot, resultCid)`.

- [ ] **D3.** Write `provider/index.ts`: event loop.
  ```
  1. Subscribe to JobEscrow ProviderAssigned events where provider == walletAddress
  2. On event: getJob(jobId) → verify state == ASSIGNED
  3. fetchSpec(specCid)
  4. runner.run(spec) → { resultBlob, checkpoints }
  5. uploadResult(jobId, resultBlob, checkpoints) → { cid, resultHash }
  6. commit(jobId, resultHash, merkleRoot, cid)
  7. Log tx hash
  ```
  *Expected:* Full honest run: provider agent picks up job, runs sha-chain, commits correct hash.

### Phase E — Verifier service

- [ ] **E1.** Write `verifier/attest.ts`:
  - Build EIP-712 message: domain `{name:"ProofOfCompute", version:"1", chainId, verifyingContract}`, type `Attestation(uint256 jobId, bytes32 policyHash, bytes32 resultHash, uint8 verdict, bytes32 evidenceHash)`.
  - Sign with verifier wallet.

- [ ] **E2.** Write `verifier/reexecute.ts`: given job spec and policy, re-execute the sampled segments. Determine segment indices using `keccak256(abi.encode(seed, i)) % segmentCount`. Return `{ verdict, evidenceHash }`.

- [ ] **E3.** Write `verifier/index.ts`: event loop.
  ```
  1. Subscribe to JobEscrow VerifiersSelected events
  2. On event: check if walletAddress is in selectedVerifiers array
  3. getJob(jobId) + getPolicy(jobId)
  4. fetchSpec(specCid) + fetchResult(resultCid)
  5. reexecute(spec, policy, result) → { verdict, evidenceHash }
  6. attest.sign(jobId, policyHash, resultHash, verdict, evidenceHash) → signature
  7. JobEscrow.submitAttestation(jobId, verdict, evidenceHash, signature)
  8. Log tx hash
  ```

### Phase F — Docker

- [ ] **F1.** Write `Dockerfile.provider` and `Dockerfile.verifier` (Node 20 slim, copies built JS).  
  *Expected:* `docker build -f Dockerfile.provider .` succeeds.

---

## 5. Exact Interfaces to Implement

### Contract calls (from SPEC.md §5.3)

```typescript
// Provider agent calls:
JobEscrow.commitResult(jobId, resultHash, checkpointRoot, resultCid)

// Verifier service calls:
JobEscrow.submitAttestation(jobId, verdict, evidenceHash, signature)
// EIP-712 domain: name="ProofOfCompute", version="1", chainId, verifyingContract
// Signed type: Attestation(uint256 jobId, bytes32 policyHash, bytes32 resultHash,
//                           uint8 verdict, bytes32 evidenceHash)
```

### Events listened to (from SPEC.md §6)

```
Provider agent:    ProviderAssigned(jobId, provider)
Verifier service:  VerifiersSelected(jobId, verifiers[], verifyDeadline)
```

### Views called

```typescript
JobEscrow.getJob(jobId)        // → JobRecord
JobEscrow.getPolicy(jobId)     // → Policy
JobEscrow.selectedVerifiers(jobId)  // → address[]
```

### Workload spec JSON (from SPEC.md §7)

```typescript
interface ShaChainSpec {
  type: "sha-chain";
  params: { seed: string; iterations: number; checkpointEvery: number };
  image: string;
  resources: { cpuCores: number; memoryMb: number; timeLimitSecs: number };
}

interface MatmulSpec {
  type: "matmul";
  params: { seedA: string; seedB: string; size: number; precision: "float32" | "float64" };
  expectedOutput: { resultHash: string };
  tolerance: number;
  image: string;
  resources: { cpuCores: number; memoryMb: number; timeLimitSecs: number };
}
```

---

## 6. Configuration and Environment Variables

```bash
# agents/.env  (copy from .env.example, never commit)
RPC_URL=http://127.0.0.1:8545
CHAIN_ID=31337
PROVIDER_PRIVATE_KEY=     # 32-byte hex, no 0x prefix, different from deployer
VERIFIER_PRIVATE_KEY=     # different address from provider
PROVIDER_REGISTRY_ADDRESS=
JOB_ESCROW_ADDRESS=
BACKEND_URL=http://localhost:3001
IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs/
CONTAINER_RUNTIME=docker
NO_DOCKER=false
AGENT_CHEAT_MODE=false
MAX_JOB_DURATION_SECONDS=300
```

---

## 7. Error Handling and Edge Cases

- **Job already committed** (re-org or duplicate event): check `job.state !== ASSIGNED` before committing; skip if already COMMITTED.
- **Docker container timeout**: kill container after `MAX_JOB_DURATION_SECONDS`; do not commit; log error.
- **Docker not available** (`NO_DOCKER=false` but docker daemon missing): fail fast with clear error.
- **Verifier not in selected set**: silently skip — not an error.
- **EIP-712 signature failure** (wrong chain ID, wrong contract address): log and do not submit.
- **IPFS fetch timeout**: retry up to 3 times with 2-second backoff before failing the job.
- **`AGENT_CHEAT_MODE=true` warning**: log a prominent `[CHEAT MODE ACTIVE]` message on startup so it is never accidentally enabled.
- **Wrong result hash detected by verifier**: verifier votes FAIL and submits `evidenceHash = keccak256(abi.encode(recomputedHash, committedHash))`.
- **matmul tolerance failure**: if `maxRelativeError > 1e-6`, verdict = FAIL.
- **Checkpoint Merkle root mismatch**: if any segment fails during sampling, verdict = FAIL.

---

## 8. Tests Required

```bash
# Run all tests
npm test
```

**Required test cases:**

1. `sha-chain.execute` with known seed and N=100 produces expected final hash
2. `sha-chain.verifySegment` returns `true` for a correct segment
3. `sha-chain.verifySegment` returns `false` for a corrupted segment
4. `matmul.execute` with known seeds produces deterministic result
5. `matmul.verify` returns `true` within tolerance
6. `matmul.verify` returns `false` when result differs by more than `1e-6`
7. `merkle.computeMerkleRoot` produces expected root for a known leaf set
8. `attest.signAttestation` produces a valid EIP-712 signature (verify with `ethers.verifyTypedData`)
9. Provider agent cheat mode: `AGENT_CHEAT_MODE=true` replaces correct hash with random bytes
10. Verifier detects cheat: re-execute returns different hash → verdict = FAIL

---

## 9. Acceptance Criteria

```bash
# 1. All unit tests pass
cd agents && npm test
# Expected: X passing, 0 failing

# 2. Provider agent honest run (requires running chain + backend + deployed contracts):
npm run provider
# Expected: picks up ProviderAssigned event, runs sha-chain, commits correct hash
# Check: curl http://localhost:3001/jobs/1 → state: "COMMITTED"

# 3. Verifier service honest run:
npm run verifier
# Expected: picks up VerifiersSelected event, re-executes, votes PASS
# Check: curl http://localhost:3001/jobs/1 → at least 1 attestation with verdict PASS

# 4. Cheat mode run (malicious provider):
AGENT_CHEAT_MODE=true npm run provider
# Expected: provider commits WRONG hash
# After verifier runs and quorum is REJECTED:
# Check: curl http://localhost:3001/receipts/1 → outcome: "REJECTED"
# Check: curl http://localhost:3001/providers/<address> → slashCount: 1

# 5. Docker isolation:
NO_DOCKER=false npm run provider
# Expected: job runs in container with cpu/memory limits
```

---

## 10. Definition of Done

- [ ] Provider agent subscribes to `ProviderAssigned` and calls `commitResult` for every assigned job
- [ ] `AGENT_CHEAT_MODE=true` submits a wrong hash (used only for demo, never in production)
- [ ] Verifier service subscribes to `VerifiersSelected`, checks eligibility, votes correctly
- [ ] EIP-712 attestation signature verified in unit test
- [ ] `sha-chain` workload executor passes all test cases
- [ ] `matmul` workload executor passes all test cases
- [ ] Merkle root computation passes unit test
- [ ] `NO_DOCKER=true` works for local dev without Docker daemon
- [ ] All tests pass: `npm test` → 0 failures
- [ ] No mock data in production paths
- [ ] `AGENT_CHEAT_MODE` logs a prominent warning on startup when active
- [ ] Private keys never logged
- [ ] `config.ts` throws on missing required env vars
- [ ] This task file's acceptance criteria pass on a clean machine

---

## 11. Hand-off

**When provider agent is working against local chain:**
- Confirm which workload Docker image name and tag is used (resolve OQ-6 first).
- Tell Member 4 the exact address used for the provider wallet so it can be shown in the UI.
- Confirm how `selectVerifiers` and `settle` are called — resolve OQ-2 and OQ-3 with the group.

---

## 12. Prompt for Your AI Tool

```
You are implementing the provider agent and verifier service for Proof-of-Compute,
a blockchain-based decentralised compute marketplace.

BEFORE WRITING ANY CODE:
1. Read docs/SPEC.md completely.
2. Read docs/tasks/03_AGENTS.md completely.
3. Use ONLY the function names, event names, parameter names, and constant values
   defined in those two files. Do NOT invent alternatives.
4. If something is not defined in SPEC.md, say "OPEN QUESTION: <description>" and stop.

IMPLEMENT:
- agents/provider/index.ts (watches ProviderAssigned, runs job, commits result)
- agents/provider/runner.ts (Docker + NO_DOCKER fallback)
- agents/provider/commit.ts (commitResult call, cheat mode)
- agents/provider/merkle.ts (Merkle root from checkpoints)
- agents/verifier/index.ts (watches VerifiersSelected, re-executes, attests)
- agents/verifier/attest.ts (EIP-712 Attestation signing)
- agents/verifier/reexecute.ts (sampled segment verification)
- agents/shared/chain.ts, contracts.ts, ipfs.ts, config.ts
- agents/jobs/sha-chain.ts (sha-chain workload)
- agents/jobs/matmul.ts (matmul workload)
- All 10 test cases from task file §8

CONSTRAINTS:
- Node.js 20, TypeScript, ethers v6. No extra dependencies unless absolutely necessary.
- EIP-712 domain and type exactly as in SPEC.md §5.3.
- Checkpoint Merkle root: keccak256 leaves, standard binary tree.
- AGENT_CHEAT_MODE=true must log "[CHEAT MODE ACTIVE]" prominently on startup.
- NO_DOCKER=true must work without Docker daemon.
- All contract function names, parameter names, and event names from SPEC.md §5.3 and §6.
- config.ts must throw on missing required env vars.

FINISH BY:
1. Running `npm test` and reporting the result.
2. Demonstrating the honest run acceptance criterion (task file §9 items 2–3).
3. Demonstrating the cheat mode acceptance criterion (task file §9 item 4).
4. Listing every file created or modified.
5. Listing every OPEN QUESTION encountered.
```
