# Task 02 — Backend API, IPFS, and Event Indexer (Member 2)

> Read `docs/SPEC.md` in full before writing any code.
> Every endpoint, field name, error code, and table name in this file is copied from SPEC.md.
> If you find a contradiction, fix SPEC.md first by PR.

---

## 1. Goal and Scope

**In scope:**
- Express REST API implementing every endpoint in SPEC.md §8.
- SQLite database (via `better-sqlite3`) with the schema in SPEC.md §9.
- On-chain event indexer: polls for new blocks, processes every event from SPEC.md §6, upserts into SQLite.
- IPFS integration: pin specs and results to Pinata; verify content on reads.
- Provider matching and ranking endpoint.
- `GET /receipts/:jobId`: verify IPFS content matches on-chain hashes and return `ipfsVerified` flag.

**Out of scope:**
- Submitting any on-chain transactions (the backend is read/index only except IPFS pinning).
- Frontend code.
- Agent code.
- Running the actual job computation.

---

## 2. Prerequisites and Dependencies

| Dependency | From | File / Endpoint |
|---|---|---|
| Contract ABIs and addresses | Member 1 | `contracts/deployments/localhost.json` and `contracts/deployments/sepolia.json` |
| Event definitions | SPEC.md §6 | — |
| API shape consumed by frontend | SPEC.md §8 and `frontend/src/services/api.ts` | — |

**Blocking:** You cannot index events without the ABI. Wait for Member 1 Phase A (stub contracts deployed). Start the Express server and SQLite schema in parallel.

---

## 3. Tech Stack and Folder / File Structure

```
backend/
├── src/
│   ├── index.ts              — Express app entry point
│   ├── routes/
│   │   ├── providers.ts      — GET /providers, GET /providers/:address, PUT /providers/:address/profile
│   │   ├── jobs.ts           — POST /jobs/spec, POST /jobs/match, GET /jobs, GET /jobs/:id, GET /jobs/:id/timeline
│   │   ├── receipts.ts       — GET /receipts/:jobId
│   │   ├── verifiers.ts      — GET /verifiers
│   │   ├── stats.ts          — GET /stats/requester/:address
│   │   ├── ipfs.ts           — POST /ipfs/result, GET /ipfs/:cid
│   │   └── health.ts         — GET /health
│   ├── db/
│   │   ├── schema.sql        — Authoritative SQL from SPEC.md §9
│   │   ├── migrate.ts        — Run schema.sql on startup
│   │   └── db.ts             — better-sqlite3 singleton
│   ├── indexer/
│   │   ├── indexer.ts        — Main poll loop
│   │   └── handlers/
│   │       ├── providerRegistry.ts  — StakeDeposited, VerifierRegistered, etc.
│   │       └── jobEscrow.ts         — JobRegistered, PolicyRecorded, ResultCommitted, etc.
│   ├── ipfs/
│   │   ├── pin.ts            — Pinata JWT pin
│   │   └── fetch.ts          — Gateway fetch + hash verification
│   ├── matching/
│   │   └── rank.ts           — Provider scoring logic
│   └── config.ts             — Reads process.env, validates required vars
├── data/                     — Runtime SQLite file (gitignored)
├── package.json
├── tsconfig.json
├── .env.example
└── .env                      (gitignored)
```

**package.json dependencies:**
```json
{
  "dependencies": {
    "express": "^4.19.0",
    "better-sqlite3": "^9.6.0",
    "ethers": "^6.13.0",
    "node-fetch": "^3.3.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "ts-node": "^10.9.0",
    "nodemon": "^3.1.0",
    "supertest": "^7.0.0",
    "@types/supertest": "^6.0.0",
    "vitest": "^1.6.0"
  }
}
```

---

## 4. Step-by-Step Implementation Checklist

### Phase A — Skeleton and schema

- [ ] **A1.** `npm init`, install dependencies, `tsconfig.json`, `package.json` scripts (`dev`, `build`, `start`, `test`).  
  *Expected:* `npm run dev` starts an Express server on port 3001.

- [ ] **A2.** Write `db/schema.sql` from SPEC.md §9 verbatim. Write `db/migrate.ts` that runs it on startup.  
  *Expected:* Server starts, `data/poc.db` exists, all tables present (`sqlite3 data/poc.db ".tables"`).

- [ ] **A3.** Implement `GET /health` returning `{ status: "ok", block: 0, syncLag: 0 }`.  
  *Expected:* `curl http://localhost:3001/health` returns 200.

### Phase B — IPFS

- [ ] **B1.** Implement `ipfs/pin.ts`: accepts content buffer, pins via Pinata JWT, returns CID.  
  *Expected:* Unit test with mocked Pinata HTTP call returns a CID.

- [ ] **B2.** Implement `ipfs/fetch.ts`: fetches from `IPFS_GATEWAY + cid`, computes SHA-256, compares to expected hash.  
  *Expected:* Returns `{ content, hash, matchesExpected: boolean }`.

- [ ] **B3.** Implement `POST /ipfs/result` and `GET /ipfs/:cid`.

### Phase C — Provider endpoints

- [ ] **C1.** Implement `GET /providers` with all query filters and sort (from SPEC §8.2).  
  *Expected:* Returns `{ providers: [] }` when no rows in DB.

- [ ] **C2.** Implement `GET /providers/:address` (404 if not found).

- [ ] **C3.** Implement `PUT /providers/:address/profile` with EIP-191 signature verification.  
  EIP-191: `personal_sign` over `keccak256(toUtf8Bytes(JSON.stringify(profile)))`. Recover signer; must match `:address`.  
  *Expected:* Wrong signature → 400. Correct → pins profile to IPFS, upserts `provider_profiles`.

- [ ] **C4.** Implement `POST /jobs/spec`: validate spec JSON (must have `type`, `params`, `image`, `resources`), pin to Pinata, compute `profileHash = keccak256(JSON.stringify(spec))`, return `{ cid, profileHash }`.

- [ ] **C5.** Implement `POST /jobs/match` (see scoring in SPEC §8.6).

### Phase D — Job and receipt endpoints

- [ ] **D1.** Implement `GET /jobs`, `GET /jobs/:id`, `GET /jobs/:id/timeline`.
- [ ] **D2.** Implement `GET /receipts/:jobId`: fetch receipt from DB, fetch IPFS content by `resultCid`, compare `sha256(content)` to `resultHash` from chain, set `ipfsMatchesChain` flag.
- [ ] **D3.** Implement `GET /verifiers`, `GET /stats/requester/:address`.

### Phase E — Event indexer

- [ ] **E1.** Write `indexer/indexer.ts`: poll loop using `ethers.JsonRpcProvider`, read `sync_state.last_block`, query logs `fromBlock` to `toBlock = latestBlock - CONFIRMATIONS`, process, update `sync_state`.

- [ ] **E2.** Implement handler for every event in SPEC.md §6 that the backend cares about:
  - `JobRegistered` → insert into `jobs`
  - `ProviderAssigned` → update `jobs.provider`, `jobs.state`
  - `PolicyRecorded` → update `jobs.policy_hash`, insert into `policies`
  - `ResultCommitted` → update `jobs.result_hash`, `jobs.checkpoint_root`, `jobs.result_cid`, `jobs.state`
  - `VerifiersSelected` → insert into `verifier_selections`
  - `AttestationSubmitted` → insert into `attestations`
  - `JobSettled` → update `jobs.state`, `jobs.outcome`, insert into `settlements`
  - `ReceiptIssued` → insert into `receipts`
  - `StakeDeposited` → upsert `providers.stake_wei`
  - `VerifierRegistered` → upsert `verifiers` (providers table)
  - `ProviderSlashed` → update `providers.slash_count`, `providers.stake_wei`
  - `ReputationUpdated` → update `providers.reputation_bps`

- [ ] **E3.** All handlers use `INSERT OR REPLACE` for idempotency.  
  *Expected:* Replaying the same block range produces the same DB state.

---

## 5. Exact Interfaces to Implement

### API endpoints (from SPEC.md §8)

| Method | Path | Request | Response |
|---|---|---|---|
| `GET` | `/health` | — | `{ status, block, syncLag }` |
| `GET` | `/providers` | query params | `{ providers: [...] }` |
| `GET` | `/providers/:address` | — | provider object |
| `PUT` | `/providers/:address/profile` | `{ profile, signature }` | `{ profileCid, profileHash }` |
| `POST` | `/jobs/spec` | spec JSON | `{ cid, profileHash }` |
| `POST` | `/jobs/match` | match request | `{ matches: [...] }` |
| `GET` | `/jobs` | query params | `{ jobs: [...], total }` |
| `GET` | `/jobs/:id` | — | job object |
| `GET` | `/jobs/:id/timeline` | — | `{ jobId, events: [...] }` |
| `GET` | `/receipts/:jobId` | — | `{ receipt, ipfsVerified, ipfsMatchesChain }` |
| `GET` | `/verifiers` | — | `{ verifiers: [...] }` |
| `GET` | `/stats/requester/:address` | — | stats object |
| `POST` | `/ipfs/result` | `{ jobId, resultBlob, checkpoints }` | `{ cid, resultHash }` |
| `GET` | `/ipfs/:cid` | — | raw content |

All response shapes are in **SPEC.md §8** verbatim.

### Error format (all endpoints)

```json
{ "error": { "code": "ERROR_CODE", "message": "Human readable" } }
```

Error codes: `PROVIDER_NOT_FOUND`, `JOB_NOT_FOUND`, `INVALID_SPEC`, `INVALID_SIGNATURE`, `IPFS_ERROR`, `INTERNAL_ERROR`.

### Database schema

From **SPEC.md §9** verbatim. All ETH as wei TEXT strings. All timestamps as ISO-8601 TEXT.

---

## 6. Configuration and Environment Variables

```bash
# backend/.env  (copy from .env.example, never commit)
PORT=3001
NODE_ENV=development
DATABASE_PATH=./data/poc.db
RPC_URL=http://127.0.0.1:8545
CHAIN_ID=31337
CONFIRMATIONS=2
PROVIDER_REGISTRY_ADDRESS=     # from contracts/deployments/localhost.json
VERIFICATION_POLICY_ADDRESS=   # from contracts/deployments/localhost.json
JOB_ESCROW_ADDRESS=            # from contracts/deployments/localhost.json
INDEXER_START_BLOCK=0
PINATA_JWT=                    # Pinata API JWT
IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs/
IPFS_LOCAL_API=http://127.0.0.1:5001   # optional
```

`src/config.ts` must throw at startup if any required variable is missing.

---

## 7. Error Handling and Edge Cases

- **Missing contract address in env:** Server must fail fast with a clear error at startup.
- **Indexer block gap:** If `sync_state.last_block` is 0 and `INDEXER_START_BLOCK` is set, start from that block.
- **Pinata rate limit (429):** Retry with exponential backoff, max 3 retries.
- **IPFS gateway timeout:** Return `ipfsVerified: false`, do not fail the receipt endpoint.
- **Chain reorg:** Indexer must handle the case where `latest - CONFIRMATIONS < sync_state.last_block` gracefully (no negative query range).
- **`PUT /providers/:address/profile` signature mismatch:** Return 400, do not persist.
- **`POST /jobs/spec` unknown workload type:** Return 400 with `code: "INVALID_SPEC"`.
- **`GET /jobs/:id` job not in DB yet (indexer lag):** Return 404, not an error.
- **SQLite WAL mode:** Enable for concurrent reads during indexer writes.

---

## 8. Tests Required

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage
```

**Required test cases:**

1. `GET /health` returns 200 with correct shape
2. `GET /providers` returns empty array on fresh DB
3. `PUT /providers/:address/profile` — valid EIP-191 signature accepted
4. `PUT /providers/:address/profile` — invalid signature rejected with 400
5. `POST /jobs/spec` — valid sha-chain spec returns `{ cid, profileHash }`
6. `POST /jobs/spec` — missing `type` field rejected with 400
7. `POST /jobs/match` — returns ranked list ordered by score descending
8. `GET /jobs/:id` — 404 when job not in DB
9. `GET /receipts/:jobId` — 404 when job not settled
10. Indexer idempotency: process same block twice, DB row count unchanged
11. `GET /receipts/:jobId` — `ipfsMatchesChain: false` when IPFS content is modified

Use `supertest` for HTTP tests. Mock Pinata and IPFS gateway calls with `vitest` mocking.

---

## 9. Acceptance Criteria

```bash
# 1. Server starts
cd backend && npm run dev
curl http://localhost:3001/health
# Expected: {"status":"ok","block":N,"syncLag":M}

# 2. All tests pass
npm test
# Expected: X passing, 0 failing

# 3. After local chain is running and contracts are deployed:
# Start indexer (runs inside the server)
# Submit a job on-chain (from Member 1 test scripts)
# Wait 2 blocks for confirmation
curl http://localhost:3001/jobs/1
# Expected: job object with state "REGISTERED"

# 4. After full honest run end-to-end:
curl http://localhost:3001/receipts/1
# Expected: receipt with ipfsVerified: true, ipfsMatchesChain: true, outcome: "ACCEPTED"

# 5. IPFS verify flag
# Corrupt the content in IPFS (not possible directly, but simulate in test)
# See test case 11 above
```

---

## 10. Definition of Done

- [ ] All 14 REST endpoints implemented and return correct shapes from SPEC.md §8
- [ ] All 13 SQLite tables created from SPEC.md §9 verbatim
- [ ] Indexer processes all events from SPEC.md §6 and upserts idempotently
- [ ] `ipfsMatchesChain` flag computed correctly in `GET /receipts/:jobId`
- [ ] EIP-191 signature verified in `PUT /providers/:address/profile`
- [ ] All test cases pass: `npm test` → 0 failures
- [ ] `config.ts` throws on missing required env vars
- [ ] No mock data in production code paths (mock is in test files only)
- [ ] `PINATA_JWT` and private keys never logged
- [ ] `DATABASE_PATH` default is `./data/poc.db`; directory created on startup
- [ ] This task file's acceptance criteria pass on a clean machine

---

## 11. Hand-off

**Publish when server is running against local chain:**
- API base URL: `http://localhost:3001`
- Example request/response for every endpoint (paste into docs or Postman collection).
- Confirm which fields are wei strings vs ETH floats so Member 4 can build the adapter correctly.

---

## 12. Prompt for Your AI Tool

```
You are implementing the backend for Proof-of-Compute, a blockchain-based
decentralised compute marketplace.

BEFORE WRITING ANY CODE:
1. Read docs/SPEC.md completely.
2. Read docs/tasks/02_BACKEND.md completely.
3. Use ONLY the endpoint paths, field names, error codes, and table names defined
   in those two files. Do NOT invent alternatives.
4. If something is not defined in SPEC.md, say "OPEN QUESTION: <description>" and stop.

IMPLEMENT:
- Express REST API: all 14 endpoints from SPEC.md §8
- SQLite schema: all 13 tables from SPEC.md §9
- Event indexer: all events from SPEC.md §6 (task file §4 Phase E lists exactly which)
- IPFS helpers: Pinata pin + gateway fetch with hash verification
- Provider matching/ranking: POST /jobs/match
- All test cases from task file §8

CONSTRAINTS:
- Node.js 20, TypeScript, Express, better-sqlite3, ethers v6.
- All ETH amounts stored as TEXT wei strings in SQLite. Never store floats for money.
- EIP-191 personal_sign verification in PUT /providers/:address/profile.
- Indexer uses INSERT OR REPLACE for idempotency.
- config.ts must throw at startup if any required env var is missing.
- No mock data in production paths. Mocks are in test files only.
- Error format: { "error": { "code": "...", "message": "..." } } for all errors.

FINISH BY:
1. Running `npm test` and reporting the result.
2. Listing every endpoint and confirming it matches SPEC.md §8.
3. Listing every file created or modified.
4. Listing every OPEN QUESTION encountered.
```
