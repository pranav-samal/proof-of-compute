# Proof-of-Compute — Full Audit Report

**Date:** 2026-11-17  
**Auditor:** Phase 0 static analysis + live service inspection  
**Method:** Read every source file; ran services; navigated every page  

---

## 1. Service startup state (what runs, what crashes)

| Service | Starts? | Notes |
|---|---|---|
| Hardhat node | ✅ | `npx hardhat node` in `/contracts` |
| Contract deploy | ✅ | Deterministic addresses on Hardhat (same every restart) |
| Backend | ✅ | `npx tsx src/index.ts` in `/backend` — CORS added, better-sqlite3 |
| Provider agent | ✅ | `npm run provider` in `/agents` — watches ProviderAssigned events |
| Verifier service | ✅ | `npm run verifier` in `/agents` — watches VerifiersSelected events |
| Frontend | ✅ | `npm run dev` in `/frontend` |
| Seed script | ✅ | Writes 5 providers to DB (but NOT to chain — see BUG-01) |
| `npm run dev:all` at repo root | ❌ MISSING | No root `package.json`; no orchestration script exists |

---

## 2. Page-by-page audit

### 2.1 Wallet Connect (Header)

| Check | Result |
|---|---|
| Connect button visible | ✅ |
| MetaMask opens | ✅ |
| Address shown shortened | ✅ |
| Network shown (Hardhat Local) | ✅ |
| Disconnect works | ✅ |
| `isContractConfigured()` returns true | ✅ (VITE_CONTRACT_JOB_ESCROW is set) |

**No issues.**

---

### 2.2 Marketplace (`/marketplace`)

| Check | Result |
|---|---|
| Providers load from backend | ✅ after CORS fix |
| 5 providers shown | ✅ |
| Filters work (JS-side) | ✅ |
| "Assign provider" button | ❌ **BUG-02** |
| Providers are from seed DB, not from chain | ⚠️ **MOCK-01** |
| "Demo data" badge not shown | ✅ (removed) |

**BUG-02:** The "Select" button navigates to `/submit-job` with `state: {providerId}` — it does NOT call `assignProvider` on-chain. `assignProvider` is a separate step that only appears in the Provider Console "Commit Result" dropdown, not the marketplace flow. After `registerJob`, the requester must call `assignProvider` before the agent can run. The UI has no button for this on the Job Details page.

**MOCK-01:** Seed data is inserted directly into SQLite with fabricated stake/reputation numbers. These providers are NOT registered on-chain in `ProviderRegistry.sol`. Therefore `assignProvider` will fail because `lockStake` will revert (provider has no on-chain stake). The indexer has never seen these providers because no `StakeDeposited` or `registerProvider` events exist for them.

---

### 2.3 Submit Job (`/submit-job`)

| Check | Result |
|---|---|
| 5-step wizard | ✅ |
| Risk score computes locally | ✅ |
| "Sign Transaction" enabled with wallet connected | ✅ |
| `POST /jobs/spec` → CID | ✅ (Pinata JWT set) |
| `chain.registerJobOnChain` → MetaMask | ✅ |
| JobRegistered event parsed → jobId extracted | ✅ |
| Navigates to `/jobs` after tx | ✅ |
| **Two MetaMask popups** | ❌ **BUG-03** |
| Payment amount mismatch | ❌ **BUG-04** |
| "Assign provider" step missing | ❌ **BUG-05** |

**BUG-03 (two transactions):** `registerJob` is confirmed once. But the page calls `navigate('/jobs')` which triggers `api.listJobs()` → backend → no job found (indexer lag) → empty. User clicks "Submit Job" again → second MetaMask popup. Actually the two popups are caused by React StrictMode double-invoking `handleSignTransaction` in development. Fix: `useRef` guard or disable StrictMode.

**BUG-04 (payment mismatch):** Review step shows `policy.requiredCollateralEth` as "Locks in escrow". The collateral is what the **provider** locks at `assignProvider`, not what the requester pays. The requester locks `paymentWei = BigInt(Math.round(budgetUsd * 5e12))`. For $20 budget that is 20 × 5×10¹² = 10¹⁴ wei = 0.0001 ETH. MetaMask shows 0.0001 ETH. The review says "0.015 ETH collateral" (computed by `risk.ts` as `budgetUsd/2000 * tierMultiplier`). These are two different numbers with two different meanings, and the label is wrong.

**BUG-05:** After `registerJob`, the requester must call `assignProvider(jobId, providerAddress)` on-chain before the agent will pick it up. There is no UI button for this anywhere except the hidden Provider Console "Commit" tab dropdown — and even there, `assignProvider` is not called on-chain at all (the CommitTab only calls `commitResult`). The job sits in REGISTERED state forever until someone manually calls `assignProvider` from a script or Hardhat console.

---

### 2.4 Job Details (`/jobs` and `/jobs/:id`)

| Check | Result |
|---|---|
| Job list loads | ❌ **BUG-06** |
| Job appears after `registerJob` tx | ❌ **BUG-06** |
| Timeline shows real events | ❌ **BUG-07** |
| Policy tab shows computed policy | ⚠️ shows locally-computed estimate, not on-chain hash |
| Commitment tab | ⚠️ correct logic but no data because job never reaches COMMITTED |
| Attestations tab | ⚠️ correct logic but no data |
| Settlement tab | ⚠️ correct logic but no data |
| `DemoBadge` on commitment/settlement | ❌ should be removed when data is real |
| Job title shows "Job #1" not user's title | ❌ **BUG-08** |
| Explorer links point to Sepolia | ❌ **BUG-09** |

**BUG-06 (job list empty after transaction):** `realApi.listJobs()` calls `GET /jobs?requester=<walletAddress>` but `getWalletAddress()` always returns `null` — the function reads `window.ethereum` to check if it exists but never calls `eth_accounts` to get the actual address. So the backend receives `GET /jobs` with no `requester` filter and returns all jobs. If the indexer hasn't indexed the `JobRegistered` event yet (needs `CONFIRMATIONS=2` blocks after tx), the job is simply not in the DB. No retry, no polling, no chain fallback. The UI shows a blank list.

**BUG-07 (timeline missing tx hashes):** The backend `GET /jobs/:id/timeline` constructs timeline events from DB rows but the REGISTERED event has `txHash: null` (not stored from indexer — the `handleJobRegistered` handler does not store the tx hash). The ProviderAssigned, PolicyRecorded events have `txHash: null` too (see `handlers.ts` — none of the handlers store the tx hash). Only attestations and settlements store `tx_hash` from `log.transactionHash`.

**BUG-08 (job title):** `mapJob()` in `api.ts` constructs `title: 'Job #${j.jobId}'`. The original title the user typed in the Submit Job wizard is never stored anywhere — it's not in the spec, not sent to the backend, not in the contract. The job spec (IPFS CID) contains the workload parameters but not a human title.

**BUG-09 (wrong explorer):** `const EXPLORER_BASE = 'https://sepolia.etherscan.io/tx/'` is hardcoded in `JobDetailsPage.tsx`. For local Hardhat chain there is no explorer. Should read from `import.meta.env.VITE_EXPLORER_BASE` and show a copy button on localhost.

---

### 2.5 Dashboard (`/dashboard`)

| Check | Result |
|---|---|
| Metrics load from backend | ✅ (calls `GET /stats/requester/:address`) |
| Metrics are correct | ❌ **BUG-10** |
| SpendChart is real | ❌ **MOCK-02** |
| "100% success rate" at 0 jobs | ❌ **BUG-11** |
| "Illustrative data" label present | ❌ **BUG-12** (should be removed in real mode) |

**BUG-10 (metrics wrong):** `getWalletAddress()` returns `null` → `getDashboardMetrics()` calls `GET /stats/requester/0x000...000` → returns zeroes for the null address. So the wallet's real jobs are never counted.

**BUG-11 (100% success rate):** `MetricCard` for Completed hardcodes `trend: { value: '100%', direction: 'up', label: 'success rate' }` regardless of actual data. File: `DashboardPage.tsx` line ~170.

**MOCK-02 (hardcoded chart):** `SPEND_DATA` is a hardcoded array `[112.00, 17.80, 0, 0]` with labels "Oct 1" / "Oct 5". File: `DashboardPage.tsx` lines ~28–34.

**BUG-12:** The amber banner "Illustrative dashboard data — not real job records or payments" is shown even when `VITE_USE_MOCK=false`. Should only show in mock mode or not at all when data is live.

---

### 2.6 Provider Console (`/provider`)

| Check | Result |
|---|---|
| Page loads | ❌ **BUG-13** (infinite Loading…) |
| Stake deposit button | ⚠️ wired but provider address is wrong |
| Commit result | ⚠️ wired but no assigned jobs |

**BUG-13 (infinite loading):** `useEffect` calls `api.getProvider(DEMO_PROVIDER_ID)` where `DEMO_PROVIDER_ID = 'prov-001'`. The real backend stores providers by Ethereum address (e.g. `0x70997970…`). There is no provider with id `'prov-001'` in the backend. `api.getProvider('prov-001')` calls `GET /providers/prov-001` → 404 → `mapProvider` is never called → `setProvider(null)` → page renders "Loading…" forever because the conditional is `if (!provider) return <p>Loading…</p>` with no error/empty state.

**Root cause file:** `ProviderConsolePage.tsx` line: `const DEMO_PROVIDER_ID = 'prov-001';`  
**Fix:** Use the connected wallet address: `const { address } = useWallet()` then `api.getProvider(address)`.

---

### 2.7 Verifier Console (`/verifier`)

| Check | Result |
|---|---|
| Overview tab loads | ✅ (calls `api.listVerifiers()` → backend verifiers table) |
| Attest tab | ✅ EIP-712 signing wired with real `signer.signTypedData` |
| policyHash/resultHash placeholders | ❌ **BUG-14** |
| Bond deposit/withdraw | ✅ wired to `chain.depositStake` |
| `DEMO_VERIFIER_ID = 'ver-001'` | ❌ **BUG-15** (same hardcode issue) |

**BUG-14:** EIP-712 attestation signing uses `'0x' + '0'.repeat(64)` as both `policyHash` and `resultHash`. This signature will be rejected on-chain because the contract verifies the signature against the actual stored `policyHash` and `resultHash`. The UI would need to fetch the job's actual values before signing.

**BUG-15:** `DEMO_VERIFIER_ID = 'ver-001'` does not correspond to any real on-chain or backend verifier. Same root cause as BUG-13. Should use the connected wallet address.

---

### 2.8 Job Receipt (`/receipt/:jobId`)

| Check | Result |
|---|---|
| Input and lookup work | ✅ |
| Auto-lookup from URL | ✅ |
| QR code renders | ✅ |
| "job-2401" placeholder in hint text | ❌ **BUG-16** |
| Hash match panel | ✅ (correct — IPFS fetch → sha256 compare) |
| Receipt shows real data | ❌ only shows data if job is SETTLED and in DB |
| `DemoBadge` shown on all receipts | ❌ **BUG-17** |

**BUG-16:** Hint text says "Try: job-2401 or job-2402" — these are mock IDs from MOCK_JOBS. Real job IDs are numeric integers (1, 2, 3…) emitted by `JobEscrow.registerJob`. File: `ReceiptPage.tsx` line ~70.

**BUG-17:** `DemoBadge` is shown on all receipts including real on-chain ones. File: `ReceiptPage.tsx` — multiple `<DemoBadge />` calls in `ReceiptDisplay`.

---

### 2.9 Verification page (`/verification`)

| Check | Result |
|---|---|
| Displays correctly | ✅ (informational, mostly static) |
| LiveEvidence section | ⚠️ queries real jobs but only shows SETTLED jobs |
| No blocking bugs | ✅ |

---

### 2.10 Simulation page (`/simulation`)

| Check | Result |
|---|---|
| `simulation.json` exists | ✅ |
| Chart loads | ✅ when `VITE_USE_MOCK=false` loads from `/simulation.json` |
| "Simulation data" label | ✅ |
| No real data expected here | ✅ — simulator output is correct to label |

**No blocking bugs.**

---

## 3. All mock data locations (files and line numbers)

| Location | Line(s) | What | Should be |
|---|---|---|---|
| `DashboardPage.tsx` | 28–34 | `SPEND_DATA` hardcoded | Real per-wallet ETH spend from backend |
| `DashboardPage.tsx` | ~170 | `trend: {value:'100%'}` | Computed from `successRate` |
| `DashboardPage.tsx` | ~185 | "Illustrative dashboard data" banner | Hidden when `VITE_USE_MOCK=false` |
| `DashboardPage.tsx` | ~200 | "Illustrative total" subtitle | Removed |
| `JobDetailsPage.tsx` | ~37 | `EXPLORER_BASE` Sepolia hardcode | `VITE_EXPLORER_BASE` env var |
| `JobDetailsPage.tsx` | commitment/attestation/settlement tabs | `<DemoBadge />` | Remove when data is real |
| `JobDetailsPage.tsx` | cost card | "Illustrative. No real payment." | Remove when real |
| `ProviderConsolePage.tsx` | 25 | `DEMO_PROVIDER_ID = 'prov-001'` | `useWallet().address` |
| `ProviderConsolePage.tsx` | stake cards | `<DemoBadge className="mx-auto" />` | Remove when on-chain |
| `ProviderConsolePage.tsx` | commit tx result | `<DemoBadge label="Mock tx" />` | Remove when real tx |
| `VerifierConsolePage.tsx` | ~8 | `DEMO_VERIFIER_ID = 'ver-001'` | `useWallet().address` |
| `VerifierConsolePage.tsx` | bond tx | `<DemoBadge label="Mock tx" />` | Remove when real tx |
| `ReceiptPage.tsx` | ~70 | "Try: job-2401 or job-2402" | Numeric examples (1, 2) |
| `ReceiptPage.tsx` | all `<DemoBadge />` | Demo data badges | Remove when receipt is real |
| `api.ts` | 71–87 | `MOCK_VERIFIERS` with fake addresses | Real from backend |
| `api.ts` | `getWalletAddress()` | Always returns `null` | Read from `window.ethereum` accounts |
| `backend/src/scripts/seed.ts` | all | DB-only seed, no on-chain txs | Real `registerProvider` + `depositStake` calls |
| `frontend/src/components/layout/Sidebar.tsx` | footer | "No real compute, blockchain, or payments" | Real network info |

---

## 4. Root causes of the five known symptoms

### "Two MetaMask transactions confirmed but Job Details shows nothing"

**Cause 1 (double popup):** React StrictMode double-invokes effects in development. `handleSignTransaction` is called twice. Fix: add a `useRef` guard (`signingRef.current`) so the second invocation is a no-op.

**Cause 2 (blank job list after tx):** `getWalletAddress()` returns `null` → jobs queried with no requester filter → indexer has not processed the event yet (needs 2 confirmations + 5 s poll interval) → empty list returned → no retry or polling. Fix: (a) fix `getWalletAddress` to call `eth_accounts`, (b) poll `/jobs` for 30 s after a new transaction, (c) fall back to `escrow.getJob(jobId)` directly from chain.

### "Review shows 0.015 ETH collateral but MetaMask asks 0.0001 ETH"

**Cause:** Two different values are displayed with conflicting labels. `policy.requiredCollateralEth` is the provider's required collateral (locked at `assignProvider`). `paymentWei` is the requester's payment (locked at `registerJob`). Fix: rename the label to "Payment to lock in escrow" and show `paymentWei` in ETH. Show collateral separately as "Provider must stake".

### "Provider Console stays on Loading…"

**Cause:** `api.getProvider('prov-001')` → `GET /providers/prov-001` → 404 (backend stores by address). `setProvider(null)` never clears "Loading…" (no error/empty state path). Fix: use connected wallet address; add not-registered empty state.

### "Job Receipt placeholder says job-2401"

**Cause:** Hint text hardcoded to mock IDs. Real IDs are `uint256` integers (1, 2, 3). Fix: change hint to "Try: 1, 2" and read actual recent settled job IDs from backend.

### "Dashboard shows 100% success rate at 0 jobs"

**Cause 1:** `getWalletAddress()` returns `null` → stats fetched for `0x000…000` → all zeroes returned.  
**Cause 2:** `trend: {value: '100%'}` hardcoded regardless of `successRate` metric value.  
**Fix:** Fix `getWalletAddress`; compute trend from actual `successRate`; show `—` when total jobs is 0.

---

## 5. Missing infrastructure (blockers for live E2E)

| Missing | Impact | Phase to fix |
|---|---|---|
| No root `package.json` / `npm run dev:all` | No one-command start | Phase 1 |
| Seed script does NOT call `registerProvider` on-chain | `assignProvider` will revert | Phase 1 |
| No `assignProvider` button in UI after `registerJob` | Jobs stay REGISTERED forever | Phase 2b |
| `getWalletAddress()` always returns `null` | Dashboard, jobs, stats all empty | Phase 2b |
| Indexer does not store tx hashes in timeline events | Timeline missing links | Phase 2c |
| No auto-advance after `registerJob` → agents don't see it | Full flow never completes | Phase 2k |
| No retry / polling after transactions | Blank pages | Phase 2b |
| No error boundary | Uncaught exceptions crash the whole UI | Phase 2j |
| Explorer links hardcoded to Sepolia | Tx links broken on localhost | Phase 2c |

---

## 6. What actually works end-to-end today

1. ✅ Wallet connect with MetaMask (Hardhat Local)
2. ✅ Marketplace shows providers (from seed DB, not chain)
3. ✅ Submit Job → MetaMask → `registerJob` confirmed → `JobRegistered` event emitted on-chain
4. ✅ Indexer picks up `JobRegistered` and writes to DB (after 2 confirmations + ≤5 s)
5. ✅ Backend `/health` returns correct block number
6. ✅ IPFS spec pin via Pinata works
7. ✅ Simulation page loads from `simulation.json`
8. ✅ Verifier EIP-712 signing code is correct (but policyHash/resultHash are placeholder zeros)
9. ✅ Stake deposit/withdraw calls are wired to real contract

---

## 7. What does NOT work end-to-end today

1. ❌ Job list is blank after submitting a job (BUG-06)
2. ❌ No `assignProvider` UI → job never reaches ASSIGNED
3. ❌ Provider/verifier consoles load wrong ID (BUG-13, BUG-15)
4. ❌ Dashboard metrics always 0 (BUG-10)
5. ❌ Receipt page uses mock job IDs in hint (BUG-16)
6. ❌ Timeline missing tx hashes (BUG-07)
7. ❌ Agent never runs because job never reaches ASSIGNED
8. ❌ No `npm run dev:all` to start everything in one command

---

*End of audit. Phase 1 and Phase 2 fixes follow.*
