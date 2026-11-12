# Proof-of-Compute — Technical Specification

**Version:** 1.0  
**Status:** Frozen for MVP. Changes require a PR approved by all four members.  
**Owner:** All members. Contract ABI section owned by Member 1.

> This file is the single source of truth for all shared names — function signatures, events,
> API endpoints, field names, constants, and type definitions. Every team member reads this
> before writing any code. If a name is not here, do not invent it; open a PR to add it.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Networks and Toolchain](#2-networks-and-toolchain)
3. [Canonical Enumerations](#3-canonical-enumerations)
4. [Risk Score and Verification Policy](#4-risk-score-and-verification-policy)
5. [Contract Interface](#5-contract-interface)
6. [Events](#6-events)
7. [Workload Specifications](#7-workload-specifications)
8. [Backend REST API](#8-backend-rest-api)
9. [Database Schema](#9-database-schema)
10. [Shared TypeScript Types](#10-shared-typescript-types)
11. [Environment Variables](#11-environment-variables)
12. [End-to-End Sequences](#12-end-to-end-sequences)
13. [Known Mismatches](#13-known-mismatches)
14. [Open Questions](#14-open-questions)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  User Browser                                                   │
│  frontend/ (React + Vite)                                       │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────────────────┐  │
│  │  pages/     │  │ services/   │  │  lib/risk.ts           │  │
│  │  components/│  │  api.ts     │  │  (policy computation)  │  │
│  │             │  │  chain.ts   │  └────────────────────────┘  │
│  └─────────────┘  └──────┬──────┘                              │
└─────────────────────────-│───────────────────────────────────-─┘
                           │ HTTP                │ ethers v6 / JSON-RPC
           ┌───────────────▼──────┐    ┌─────────▼──────────────────┐
           │  backend/            │    │  EVM Chain                 │
           │  Express REST API    │    │  (Hardhat local / Sepolia) │
           │  SQLite indexer      │    │                            │
           │  IPFS (Pinata)       │    │  ProviderRegistry.sol      │
           └──────────────────────┘    │  VerificationPolicy.sol    │
                     ▲                 │  JobEscrow.sol             │
                     │ events          │  Receipt (inside Escrow)   │
           ┌─────────┴────────────┐    └─────────▲──────────────────┘
           │  agents/             │              │ transactions
           │  provider-agent      ├──────────────┘
           │  verifier-service    │
           └──────────────────────┘
                     │
           ┌─────────▼────────────┐
           │  IPFS                │
           │  Job spec (pin)      │
           │  Result artifacts    │
           └──────────────────────┘
```

**Data flow summary**
1. Requester pins job spec to IPFS via backend → receives `specCid`.
2. Requester calls `JobEscrow.registerJob` on-chain with `specCid`, `profileHash`, `reproClass`, `assurance`, `deadline`, value = payment.
3. Requester calls `JobEscrow.assignProvider`; contract calls `VerificationPolicy.derivePolicy`, locks provider collateral, records policy hash → emits `PolicyRecorded`.
4. Provider agent downloads spec by CID, runs job in Docker, uploads result to IPFS, calls `commitResult` with result hash and checkpoint Merkle root.
5. Anyone calls `selectVerifiers` after the commit block + 1; verifiers are drawn from `ProviderRegistry`.
6. Verifier service re-executes sampled portion, signs EIP-712 attestation, calls `submitAttestation`.
7. `settle` is called once quorum is reached (or `claimTimeout` on deadline breach).
8. `ReceiptIssued` event is emitted; backend indexes it; frontend receipt page verifies.

---

## 2. Networks and Toolchain

| Item | Value |
|---|---|
| Local chain | Hardhat, `chainId 31337`, `http://127.0.0.1:8545` |
| Testnet | Sepolia (`chainId 11155111`) |
| Solidity | `^0.8.24` |
| Contract framework | Hardhat |
| Contract libraries | OpenZeppelin Contracts v5 |
| Contract tests | TypeScript, ethers v6, Chai, Hardhat Toolbox |
| Backend / agents language | Node.js 20, TypeScript |
| Backend web framework | Express |
| Database | SQLite via `better-sqlite3` |
| IPFS pinning | Pinata (JWT auth), public gateway for reads |
| IPFS local (optional) | Kubo (`http://127.0.0.1:5001`) |
| Attestation signing | EIP-712 |
| Frontend wallet | ethers v6 direct (`window.ethereum`) or wagmi — Member 4 decision |
| Simulation | Python 3, `numpy`, optional `matplotlib`; output to `frontend/public/simulation.json` |

---

## 3. Canonical Enumerations

These values are used identically in Solidity (as `uint8` enums), TypeScript, and the REST API.

### Job State

```
REGISTERED → ASSIGNED → COMMITTED → VERIFYING → SETTLED
                                               ↘ DISPUTED → REFUNDED
```

| Name | uint8 | Description |
|---|---|---|
| `REGISTERED` | 0 | Payment locked in escrow; spec CID stored |
| `ASSIGNED` | 1 | Provider matched; collateral locked; policy recorded |
| `COMMITTED` | 2 | Provider submitted result hash and checkpoint root |
| `VERIFYING` | 3 | Verifiers selected; awaiting attestations |
| `SETTLED` | 4 | Quorum reached; escrow distributed; receipt written |
| `DISPUTED` | 5 | Challenge raised during challenge window |
| `REFUNDED` | 6 | Payment returned to requester |

### Outcome

| Name | uint8 | Description |
|---|---|---|
| `NONE` | 0 | Not yet settled |
| `ACCEPTED` | 1 | Result accepted; payment released to provider |
| `REJECTED` | 2 | Result rejected; provider slashed; requester refunded |
| `INCONCLUSIVE` | 3 | Quorum not reached; payment held; arbitrator decides |

### Reproducibility Class

| Name | uint8 | Description |
|---|---|---|
| `D` | 0 | Deterministic — bit-for-bit identical output given same inputs and seed |
| `T` | 1 | Tolerance-bound — output varies within a defined tolerance (e.g. 1e-6 relative) |
| `N` | 2 | Non-deterministic — output is inherently random (e.g. image generation) |

### Assurance Level

Integer 0–3. Maps directly to verification tier (see §4).

| Value | Label |
|---|---|
| 0 | Low |
| 1 | Medium |
| 2 | High |
| 3 | Maximum |

### Attestation Verdict

| Name | uint8 | Description |
|---|---|---|
| `PASS` | 0 | Verifier result matches committed result |
| `FAIL` | 1 | Verifier result contradicts committed result |
| `INCONCLUSIVE` | 2 | Verifier could not determine correctness |

---

## 4. Risk Score and Verification Policy

All computations below are authoritative. The contract (`VerificationPolicy.sol`) and the
frontend (`frontend/src/lib/risk.ts`) must produce the same tier from the same inputs.
The contract uses integer arithmetic in basis points (1 bps = 0.01%). The frontend
uses floating-point and converts for display.

### 4.1 Risk Score Formula

```
R = (w1·V + w2·(1−Rep) + w3·Dh + w4·C + w5·A) / sumWeights

V   = min(1, payment / providerStake)        — stake coverage ratio
Rep = reputationBps / 10000                   — provider reputation [0,1]
Dh  = min(1, (disputes + slashes) / 10)      — dispute/slash history [0,1]
C   = 0 if D, 0.5 if T, 1 if N              — reproducibility risk
A   = assuranceLevel / 3                     — requested assurance [0,1]
```

**Default weights (basis points, owner-changeable):**

| Weight | Symbol | Default bps |
|---|---|---|
| w1 | Stake coverage | 3000 |
| w2 | Reputation | 2000 |
| w3 | Dispute history | 1500 |
| w4 | Reproducibility | 1500 |
| w5 | Assurance | 2000 |

Sum of weights = 10000 (enforced by contract setter).

**Risk score result:** `riskBps` ∈ [0, 10000] (contract); `riskScore` ∈ [0, 1] (frontend float).

### 4.2 Tier Derivation

| Condition | Tier |
|---|---|
| `riskBps < 2500` | 0 — Hash + rule check |
| `riskBps < 5000` | 1 — Sampled re-execution |
| `riskBps < 7500` | 2 — Redundant multi-provider |
| `riskBps ≥ 7500` | 3 — Full re-execution + challenge window |

### 4.3 Sampling Probability

```
samplingBps = min(10000, K × payment × 10000 / providerStake)
K = 2 (owner-changeable)
```

For display, `samplingPct = samplingBps / 100`.

### 4.4 Verifier Count and Quorum

| Tier | Verifier count | Quorum (minimum pass votes) |
|---|---|---|
| 0 | 1 | 1 |
| 1 | 3 | 2 |
| 2 | 5 | 3 |
| 3 | 5 | 4 |

### 4.5 Required Collateral

```
collateral = payment × (5000 + riskBps) / 10000
```

(At zero risk: 50% of payment. At maximum risk: 150% of payment.)

### 4.6 Challenge Window

| Tier | Window |
|---|---|
| 0, 1, 2 | 0 seconds (no challenge window) |
| 3 | 3600 seconds (1 hour) — owner-changeable; testnet may use shorter |

### 4.7 Verifier Fee

```
verifierFee = payment × 200 / 10000    (2%, owner-changeable)
```

Split equally among verifiers whose verdict matched the final outcome.

### 4.8 Slash on REJECTED

- Provider loses **50%** of locked collateral.
  - Half of that (25% of locked collateral) → split to verifiers who voted FAIL.
  - Other half (25% of locked collateral) → requester.
- Remaining 50% of collateral → unlocked back to provider.
- Requester receives full payment refund.

### 4.9 Verifier Bond Slash on Wrong Verdict

Verifiers who attested with a verdict that contradicts the final outcome (minority voters) lose **10%** of their bond.

### 4.10 Policy Record Timing

The policy is computed and stored on-chain in `assignProvider`. It **cannot be changed after that call**. This is the invariant that the protocol's security rests on.

---

## 5. Contract Interface

Solidity `^0.8.24`. All `uint256` job IDs. All ETH amounts in wei. All bps values `uint16`.

### 5.1 ProviderRegistry

```solidity
// Registration
function registerProvider(bytes32 capabilityHash) external;

// Stake (providers)
function depositStake() external payable;
function withdrawStake(uint256 amount) external;
function freeStake(address provider) external view returns (uint256);
function totalStake(address provider) external view returns (uint256);

// Verifier bond
function registerVerifier() external payable;
function withdrawBond(uint256 amount) external;
function verifierBond(address verifier) external view returns (uint256);
function verifierCount() external view returns (uint256);
function verifierAt(uint256 index) external view returns (address);
function isEligibleVerifier(address v) external view returns (bool);

// Reputation
function reputationBps(address provider) external view returns (uint16);

// Called only by JobEscrow (onlyEscrow modifier)
function lockStake(address provider, uint256 amount) external;
function unlockStake(address provider, uint256 amount) external;
function slash(address provider, uint256 amount, address recipient) external;
function slashBond(address verifier, uint256 amount) external;
function recordOutcome(address provider, uint8 outcome) external;  // updates reputation
```

### 5.2 VerificationPolicy

```solidity
struct Policy {
    uint8  tier;
    uint16 samplingBps;
    uint8  verifierCount;
    uint8  quorum;
    uint256 collateral;       // in wei
    uint32 challengeWindow;   // in seconds
}

function computeRisk(
    uint256 payment,
    address provider,
    uint8   reproClass,
    uint8   assurance
) external view returns (uint16 riskBps);

function derivePolicy(
    uint256 payment,
    address provider,
    uint8   reproClass,
    uint8   assurance
) external view returns (Policy memory policy);

// Owner-only setters
function setWeights(
    uint16 w1, uint16 w2, uint16 w3, uint16 w4, uint16 w5
) external;    // must sum to 10000
function setK(uint16 k) external;
function setChallengeWindow(uint32 seconds_) external;
function setVerifierFeesBps(uint16 bps) external;
function setSlashBps(uint16 bps) external;
function setVerifierSlashBps(uint16 bps) external;
```

### 5.3 JobEscrow

```solidity
struct JobRecord {
    address  requester;
    address  provider;
    string   specCid;
    bytes32  profileHash;
    uint8    reproClass;
    uint8    assurance;
    uint64   deadline;
    uint256  payment;
    uint8    state;           // OnChainJobStatus uint8
    bytes32  policyHash;
    bytes32  resultHash;
    bytes32  checkpointRoot;
    string   resultCid;
    uint64   commitBlock;
    uint8    outcome;
    uint64   verifyDeadline;
}

struct ReceiptRecord {
    uint256 jobId;
    string  specCid;
    bytes32 policyHash;
    address provider;
    address requester;
    bytes32 resultHash;
    bytes32 attestationRoot;  // keccak256 of attestation hashes in submission order
    uint8   tier;
    uint8   outcome;
    uint64  settledAt;
}

// Requester
function registerJob(
    string  calldata specCid,
    bytes32 profileHash,
    uint8   reproClass,
    uint8   assurance,
    uint64  deadline
) external payable returns (uint256 jobId);

function assignProvider(
    uint256 jobId,
    address provider
) external;
// - Requires state == REGISTERED, caller == requester
// - Calls VerificationPolicy.derivePolicy, stores policy hash
// - Calls ProviderRegistry.lockStake(provider, collateral)
// - Sets state = ASSIGNED
// - Emits PolicyRecorded

// Provider
function commitResult(
    uint256 jobId,
    bytes32 resultHash,
    bytes32 checkpointRoot,
    string  calldata resultCid
) external;
// - Requires state == ASSIGNED, caller == provider, block.timestamp < deadline
// - Sets state = COMMITTED, records commitBlock

// Anyone (after commitBlock + 1)
function selectVerifiers(uint256 jobId) external;
// - Requires state == COMMITTED
// - seed = keccak256(abi.encode(block.prevrandao, blockhash(commitBlock + 1), jobId))
//   If commitBlock + 1 >= block.number, use block.prevrandao alone (fallback)
// - Selects Policy.verifierCount verifiers from ProviderRegistry (excludes provider and requester)
// - Sets state = VERIFYING, records verifyDeadline
// - Emits VerifiersSelected

// Selected verifiers
function submitAttestation(
    uint256 jobId,
    uint8   verdict,
    bytes32 evidenceHash,
    bytes   calldata signature
) external;
// - EIP-712 domain: name="ProofOfCompute", version="1", chainId, verifyingContract
// - Signed type: Attestation(uint256 jobId, bytes32 policyHash, bytes32 resultHash,
//                            uint8 verdict, bytes32 evidenceHash)
// - Recovered signer must be in selected verifier set for this job
// - Emits AttestationSubmitted

// Anyone (once quorum reached or verifyDeadline passed without quorum)
function settle(uint256 jobId) external;
// - Tallies attestations; determines outcome
// - Distributes payments according to §4.7, §4.8
// - Writes ReceiptRecord
// - Emits JobSettled, ReceiptIssued

// Anyone (after deadline, provider has not committed)
function claimTimeout(uint256 jobId) external;
// - Requires state == ASSIGNED and block.timestamp > deadline
// - Refunds payment to requester, unlocks provider collateral
// - Sets state = REFUNDED

// Arbitrator only (for DISPUTED state)
function resolveDispute(uint256 jobId, uint8 outcome) external;

// Views
function getJob(uint256 jobId) external view returns (JobRecord memory);
function getPolicy(uint256 jobId) external view returns (VerificationPolicy.Policy memory);
function getReceipt(uint256 jobId) external view returns (ReceiptRecord memory);
function getAttestation(uint256 jobId, uint256 index) external view
    returns (address verifier, uint8 verdict, bytes32 evidenceHash);
function selectedVerifiers(uint256 jobId) external view returns (address[] memory);
```

> **Known limitation:** `prevrandao`-based verifier selection is a prototype randomness source.
> It is manipulable by validators in theory. VRF (e.g., Chainlink VRF) is planned for a future
> version after MVP.

---

## 6. Events

```solidity
// ProviderRegistry
event StakeDeposited(address indexed provider, uint256 amount);
event StakeWithdrawn(address indexed provider, uint256 amount);
event VerifierRegistered(address indexed verifier, uint256 bond);
event ProviderSlashed(address indexed provider, uint256 amount, address recipient);
event VerifierSlashed(address indexed verifier, uint256 amount);
event ReputationUpdated(address indexed provider, uint16 reputationBps);

// JobEscrow
event JobRegistered(
    uint256 indexed jobId,
    address indexed requester,
    string  specCid,
    bytes32 profileHash,
    uint256 payment
);
event ProviderAssigned(uint256 indexed jobId, address indexed provider);
event PolicyRecorded(
    uint256 indexed jobId,
    bytes32 policyHash,
    uint8   tier,
    uint16  samplingBps,
    uint256 collateral,
    uint32  challengeWindow
);
event ResultCommitted(
    uint256 indexed jobId,
    bytes32 resultHash,
    bytes32 checkpointRoot,
    string  resultCid
);
event VerifiersSelected(uint256 indexed jobId, address[] verifiers, uint64 verifyDeadline);
event AttestationSubmitted(
    uint256 indexed jobId,
    address indexed verifier,
    uint8   verdict,
    bytes32 evidenceHash
);
event JobSettled(uint256 indexed jobId, uint8 outcome);
event JobDisputed(uint256 indexed jobId, address challenger);
event DisputeResolved(uint256 indexed jobId, uint8 outcome);
event TimeoutClaimed(uint256 indexed jobId, address claimedBy);
event ReceiptIssued(
    uint256 indexed jobId,
    bytes32 policyHash,
    bytes32 resultHash,
    bytes32 attestationRoot,
    uint8   tier,
    uint8   outcome,
    uint64  settledAt
);
```

---

## 7. Workload Specifications

A job spec is a JSON object pinned to IPFS. The CID is stored on-chain.

### 7.1 Job Spec Schema (all workloads)

```jsonc
{
  "type":    "sha-chain" | "matmul",   // workload type identifier
  "params":  { ... },                  // type-specific parameters (see below)
  "image":   "string",                 // Docker image URI (e.g. "poc-runner:latest")
  "resources": {
    "cpuCores":      "integer",
    "memoryMb":      "integer",
    "timeLimitSecs": "integer"
  }
}
```

### 7.2 Workload: `sha-chain` (Reproducibility class D)

```jsonc
{
  "type": "sha-chain",
  "params": {
    "seed":            "hex string (32 bytes)",
    "iterations":      "integer (N)",
    "checkpointEvery": "integer (M)"
  },
  "image": "poc-runner:latest"
}
```

**Execution:** Iterate SHA-256 starting from `seed`, `N` times. Record state every `M` iterations as a checkpoint. Upload all checkpoint states to IPFS as a JSON array; compute Merkle root over checkpoint hashes; commit `resultHash = keccak256(finalState)` and `checkpointRoot = merkleRoot`.

**Verification (sampled):** Verifier receives `samplingBps`; selects segment indices using `keccak256(abi.encode(seed, i)) % segmentCount`. Recomputes those segments from the prior checkpoint and checks continuity.

**Expected output field:** not used (deterministic — verifier recomputes).

### 7.3 Workload: `matmul` (Reproducibility class T)

```jsonc
{
  "type": "matmul",
  "params": {
    "seedA":     "hex string (32 bytes, used to generate matrix A)",
    "seedB":     "hex string (32 bytes, used to generate matrix B)",
    "size":      "integer (N×N)",
    "precision": "float32 | float64"
  },
  "expectedOutput": {
    "resultHash": "SHA-256 hex of reference output (computed by requester or oracle)"
  },
  "tolerance": 1e-6,
  "image": "poc-runner:latest"
}
```

**Execution:** Generate matrices A and B from seeds, multiply, return result matrix as binary blob uploaded to IPFS. `resultHash = sha256(blob)`.

**Verification:** Verifier re-runs with same seeds, compares element-wise with relative tolerance `1e-6`. Passes if max relative error ≤ tolerance.

---

## 8. Backend REST API

Base URL: `http://localhost:3001` (dev). Content-Type: `application/json`.

### Error format (all endpoints)

```json
{
  "error": {
    "code":    "PROVIDER_NOT_FOUND",
    "message": "No provider with address 0x..."
  }
}
```

Standard HTTP status codes: 200, 201, 400, 404, 409, 500.

### 8.1 `GET /health`

**Response 200:**
```json
{ "status": "ok", "block": 12345678, "syncLag": 2 }
```

### 8.2 `GET /providers`

**Query parameters:**

| Param | Type | Description |
|---|---|---|
| `gpu` | string | GPU model substring filter |
| `minVram` | integer | Minimum VRAM in GB |
| `maxPrice` | number | Max price per GPU-hour in USD |
| `minStake` | number | Min stake in ETH |
| `minReputation` | integer | Min reputation in bps (0–10000) |
| `available` | boolean | Filter by availability |
| `sort` | string | `price`, `reputation`, `stake`, `rating` |

**Response 200:**
```json
{
  "providers": [
    {
      "address":          "0x...",
      "capabilityHash":   "0x...",
      "stakeWei":         "1000000000000000000",
      "lockedStakeWei":   "0",
      "reputationBps":    9700,
      "slashCount":       0,
      "verifiedJobCount": 1812,
      "profile": {
        "name":          "NovaSpark Compute",
        "location":      "Ashburn, VA",
        "gpu":           { "model": "NVIDIA H100 SXM5", "vramGb": 80, "count": 8, "architecture": "Hopper", "cudaCores": 16896 },
        "ramGb":         512,
        "storageGb":     4000,
        "pricePerHour":  3.20,
        "frameworks":    ["PyTorch", "CUDA 12.2"],
        "availability":  "available",
        "uptimePercent": 99.7,
        "tags":          ["LLM Training"],
        "joinedDate":    "2023-01-15"
      },
      "profileCid":       "bafybeig...",
      "profileHash":      "0x..."
    }
  ]
}
```

### 8.3 `GET /providers/:address`

**Response 200:** Single provider object (same shape as array element above).  
**Response 404:** `{ "error": { "code": "PROVIDER_NOT_FOUND", "message": "..." } }`

### 8.4 `PUT /providers/:address/profile`

Update provider display profile (off-chain metadata only; not a contract call).

**Request body:**
```json
{
  "profile": { ... },   // same shape as profile object above
  "signature": "0x..."  // EIP-191 personal_sign over keccak256(JSON.stringify(profile))
}
```

**Response 200:** `{ "profileCid": "bafybeig...", "profileHash": "0x..." }`  
**Response 400:** signature invalid.

### 8.5 `POST /jobs/spec`

Validate job spec JSON, pin to IPFS, return CID and profile hash.

**Request body:** Job spec object (see §7.1).

**Response 201:**
```json
{
  "cid":         "bafybeig...",
  "profileHash": "0x..."
}
```

**Response 400:** spec validation failure `{ "error": { "code": "INVALID_SPEC", "message": "..." } }`

### 8.6 `POST /jobs/match`

Return ranked list of providers matching the job requirements with score breakdown.

**Request body:**
```json
{
  "reproClass":    0,
  "assurance":     1,
  "minVramGb":     16,
  "minRamGb":      32,
  "gpuModel":      "NVIDIA H100 SXM5",
  "frameworks":    ["PyTorch"],
  "budgetWei":     "1000000000000000000",
  "deadlineTs":    1700000000
}
```

**Response 200:**
```json
{
  "matches": [
    {
      "address": "0x...",
      "score":   0.92,
      "breakdown": {
        "hardwareCompatibility": 1.0,
        "costScore":             0.85,
        "reputationScore":       0.97,
        "availabilityScore":     1.0
      },
      "estimatedCostWei": "950000000000000000",
      "policy": {
        "tier":          1,
        "samplingBps":   1000,
        "verifierCount": 3,
        "quorum":        2,
        "collateralWei": "750000000000000000",
        "challengeWindow": 0
      }
    }
  ]
}
```

### 8.7 `GET /jobs`

**Query parameters:** `requester` (address), `provider` (address), `state` (OnChainJobStatus string), `limit` (integer, default 20), `offset` (integer, default 0).

**Response 200:**
```json
{
  "jobs":  [ { ...job objects... } ],
  "total": 42
}
```

**Job object:**
```json
{
  "jobId":        "1",
  "requester":    "0x...",
  "provider":     "0x...",
  "specCid":      "bafybeig...",
  "profileHash":  "0x...",
  "reproClass":   0,
  "assurance":    1,
  "deadline":     1700000000,
  "paymentWei":   "1000000000000000000",
  "state":        "ASSIGNED",
  "policyHash":   "0x...",
  "resultHash":   "0x...",
  "checkpointRoot": "0x...",
  "resultCid":    "bafybeig...",
  "outcome":      "NONE",
  "createdAt":    "2026-10-01T09:00:00Z",
  "updatedAt":    "2026-10-01T09:05:00Z"
}
```

### 8.8 `GET /jobs/:id`

Same as single job object above.  
**Response 404:** `{ "error": { "code": "JOB_NOT_FOUND", ... } }`

### 8.9 `GET /jobs/:id/timeline`

**Response 200:**
```json
{
  "jobId":   "1",
  "events":  [
    {
      "state":   "REGISTERED",
      "txHash":  "0x...",
      "block":   12345678,
      "ts":      "2026-10-01T09:00:00Z",
      "detail":  "specCid: bafybeig..."
    }
  ]
}
```

### 8.10 `GET /receipts/:jobId`

**Response 200:**
```json
{
  "receipt": {
    "jobId":           "1",
    "specCid":         "bafybeig...",
    "policyHash":      "0x...",
    "provider":        "0x...",
    "requester":       "0x...",
    "resultHash":      "0x...",
    "attestationRoot": "0x...",
    "tier":            1,
    "outcome":         "ACCEPTED",
    "settledAt":       "2026-10-01T16:05:00Z",
    "txHash":          "0x..."
  },
  "ipfsVerified": true,
  "ipfsMatchesChain": true
}
```

**Response 404:** job not found or not settled.

### 8.11 `GET /verifiers`

**Response 200:**
```json
{
  "verifiers": [
    {
      "address":        "0x...",
      "bondWei":        "2500000000000000000",
      "assignedTasks":  14,
      "completedTasks": 13,
      "slashCount":     0,
      "isEligible":     true
    }
  ]
}
```

### 8.12 `GET /stats/requester/:address`

**Response 200:**
```json
{
  "address":       "0x...",
  "totalJobs":     4,
  "activeJobs":    1,
  "completedJobs": 2,
  "totalSpentWei": "2300000000000000000",
  "successRate":   1.0
}
```

### 8.13 `POST /ipfs/result`

Pin provider result artifacts. Called by agent.

**Request body:**
```json
{
  "jobId":    "1",
  "resultBlob": "base64 encoded",
  "checkpoints": [ "hex...", "..." ]
}
```

**Response 201:**
```json
{ "cid": "bafybeig...", "resultHash": "0x..." }
```

### 8.14 `GET /ipfs/:cid`

Proxy fetch from IPFS gateway.

**Response 200:** raw content with `Content-Type` from IPFS.  
**Response 404:** not found on gateway.

---

## 9. Database Schema

SQLite. All tables use `INTEGER PRIMARY KEY` auto-increment unless noted. All ETH amounts stored as TEXT (wei strings) to avoid integer overflow. All timestamps stored as ISO-8601 TEXT.

```sql
CREATE TABLE providers (
    address         TEXT PRIMARY KEY,
    capability_hash TEXT NOT NULL,
    stake_wei       TEXT NOT NULL DEFAULT '0',
    locked_wei      TEXT NOT NULL DEFAULT '0',
    reputation_bps  INTEGER NOT NULL DEFAULT 10000,
    slash_count     INTEGER NOT NULL DEFAULT 0,
    verified_jobs   INTEGER NOT NULL DEFAULT 0,
    last_seen_block INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE provider_profiles (
    address         TEXT PRIMARY KEY REFERENCES providers(address),
    profile_json    TEXT NOT NULL,
    profile_cid     TEXT NOT NULL,
    profile_hash    TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE TABLE jobs (
    job_id          TEXT PRIMARY KEY,
    requester       TEXT NOT NULL,
    provider        TEXT,
    spec_cid        TEXT NOT NULL,
    profile_hash    TEXT NOT NULL,
    repro_class     INTEGER NOT NULL,
    assurance       INTEGER NOT NULL,
    deadline        INTEGER NOT NULL,
    payment_wei     TEXT NOT NULL,
    state           TEXT NOT NULL DEFAULT 'REGISTERED',
    policy_hash     TEXT,
    result_hash     TEXT,
    checkpoint_root TEXT,
    result_cid      TEXT,
    commit_block    INTEGER,
    outcome         TEXT NOT NULL DEFAULT 'NONE',
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE TABLE policies (
    job_id          TEXT PRIMARY KEY REFERENCES jobs(job_id),
    tier            INTEGER NOT NULL,
    sampling_bps    INTEGER NOT NULL,
    verifier_count  INTEGER NOT NULL,
    quorum          INTEGER NOT NULL,
    collateral_wei  TEXT NOT NULL,
    challenge_window INTEGER NOT NULL
);

CREATE TABLE verifier_selections (
    job_id          TEXT NOT NULL REFERENCES jobs(job_id),
    verifier        TEXT NOT NULL,
    position        INTEGER NOT NULL,
    verify_deadline INTEGER NOT NULL,
    PRIMARY KEY (job_id, verifier)
);

CREATE TABLE attestations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id          TEXT NOT NULL REFERENCES jobs(job_id),
    verifier        TEXT NOT NULL,
    verdict         TEXT NOT NULL,
    evidence_hash   TEXT,
    tx_hash         TEXT NOT NULL,
    block_number    INTEGER NOT NULL,
    ts              TEXT NOT NULL
);

CREATE TABLE settlements (
    job_id          TEXT PRIMARY KEY REFERENCES jobs(job_id),
    outcome         TEXT NOT NULL,
    provider_paid   TEXT NOT NULL DEFAULT '0',
    requester_refund TEXT NOT NULL DEFAULT '0',
    verifier_fees   TEXT NOT NULL DEFAULT '0',
    slash_amount    TEXT NOT NULL DEFAULT '0',
    tx_hash         TEXT NOT NULL,
    block_number    INTEGER NOT NULL,
    ts              TEXT NOT NULL
);

CREATE TABLE receipts (
    job_id          TEXT PRIMARY KEY REFERENCES jobs(job_id),
    spec_cid        TEXT NOT NULL,
    policy_hash     TEXT NOT NULL,
    provider        TEXT NOT NULL,
    requester       TEXT NOT NULL,
    result_hash     TEXT NOT NULL,
    attestation_root TEXT NOT NULL,
    tier            INTEGER NOT NULL,
    outcome         TEXT NOT NULL,
    settled_at      TEXT NOT NULL,
    tx_hash         TEXT NOT NULL
);

CREATE TABLE sync_state (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    last_block      INTEGER NOT NULL DEFAULT 0,
    updated_at      TEXT NOT NULL
);
```

**Indexer behaviour:** Polls from `sync_state.last_block + 1`, waits for `CONFIRMATIONS=2` confirmations (configurable), upserts are idempotent (all event handlers use `INSERT OR REPLACE`).

---

## 10. Shared TypeScript Types

These types are canonical. They live in `frontend/src/types/index.ts` and are the authority.
Backend and agent code should copy or re-declare compatible types — do not import from frontend.

```typescript
// Job state (matches Solidity enum uint8)
type OnChainJobStatus =
  | 'REGISTERED' | 'ASSIGNED' | 'COMMITTED'
  | 'VERIFYING'  | 'SETTLED'  | 'DISPUTED' | 'REFUNDED';

// Outcome (matches Solidity enum uint8)
type Outcome = 'NONE' | 'ACCEPTED' | 'REJECTED' | 'INCONCLUSIVE';

// Reproducibility class (matches Solidity enum uint8)
type ReproducibilityClass = 'D' | 'T' | 'N';

// Verification tier
type VerificationTier = 0 | 1 | 2 | 3;

// Attestation verdict
type AttestationVerdict = 'pass' | 'fail' | 'inconclusive';

// Policy (what gets hashed and stored on-chain)
interface VerificationPolicy {
  riskScore:              number;    // float 0–1 (frontend display only)
  tier:                   VerificationTier;
  samplingPct:            number;    // 0–100 (frontend display); contract uses samplingBps
  requiredCollateralEth:  number;    // ETH float (frontend display); contract uses wei
  challengeWindowSecs:    number;
  reproducibilityClass:   ReproducibilityClass;
  assuranceLevel:         'low' | 'medium' | 'high' | 'maximum';
}

// Settlement outcome (frontend)
interface SettlementOutcome {
  status:    'released' | 'slashed' | 'refunded' | 'held';
  amountEth: number;
  txHash?:   string;
  timestamp?: string;
  note:      string;
}

// Attestation (frontend)
interface Attestation {
  verifierId: string;    // "ver-001" in mock; real address on-chain
  verdict:    'pass' | 'fail' | 'inconclusive';
  timestamp:  string;
  txHash?:    string;
}

// Job receipt (frontend)
interface JobReceipt {
  jobId:            string;
  policyHash:       string;
  resultHash:       string;
  attestations:     Attestation[];
  quorumRequired:   number;
  settlement:       SettlementOutcome | null;
  receiptTimestamp?: string;
  txHash?:          string;
}
```

---

## 11. Environment Variables

### frontend/.env.example

```bash
VITE_USE_MOCK=true
VITE_RPC_URL=http://127.0.0.1:8545
VITE_CHAIN_ID=31337
VITE_CONTRACT_PROVIDER_REGISTRY=
VITE_CONTRACT_VERIFICATION_POLICY=
VITE_CONTRACT_JOB_ESCROW=
VITE_EXPLORER_BASE=https://sepolia.etherscan.io/tx/
VITE_BACKEND_URL=http://localhost:3001
```

### contracts/.env.example

```bash
DEPLOYER_PRIVATE_KEY=
RPC_URL=http://127.0.0.1:8545
ETHERSCAN_API_KEY=
HARDHAT_NETWORK=localhost
```

### backend/.env.example

```bash
PORT=3001
NODE_ENV=development
DATABASE_PATH=./data/poc.db
RPC_URL=http://127.0.0.1:8545
CHAIN_ID=31337
CONFIRMATIONS=2
PROVIDER_REGISTRY_ADDRESS=
VERIFICATION_POLICY_ADDRESS=
JOB_ESCROW_ADDRESS=
INDEXER_START_BLOCK=0
PINATA_JWT=
IPFS_GATEWAY=https://gateway.pinata.cloud/ipfs/
IPFS_LOCAL_API=http://127.0.0.1:5001
```

### agents/.env.example

```bash
RPC_URL=http://127.0.0.1:8545
CHAIN_ID=31337
PROVIDER_PRIVATE_KEY=
VERIFIER_PRIVATE_KEY=
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

## 12. End-to-End Sequences

### 12.1 Honest Case

```
Requester                   Backend              Chain                     Provider Agent      Verifier Service
    │                          │                    │                             │                    │
    │── POST /jobs/spec ───────►│                    │                             │                    │
    │◄── {cid, profileHash} ───│                    │                             │                    │
    │                          │                    │                             │                    │
    │── registerJob(specCid, profileHash, D, 1,      │                             │                    │
    │      deadline) + payment ────────────────────►│                             │                    │
    │◄── jobId, tx ────────────────────────────────│                             │                    │
    │                          │◄── JobRegistered ─│                             │                    │
    │                          │                    │                             │                    │
    │── POST /jobs/match ──────►│                    │                             │                    │
    │◄── ranked providers ─────│                    │                             │                    │
    │                          │                    │                             │                    │
    │── assignProvider(jobId, providerAddr) ───────►│                             │                    │
    │◄── tx ───────────────────────────────────────│                             │                    │
    │                          │◄── PolicyRecorded ─│                             │                    │
    │                          │◄── ProviderAssigned│                             │                    │
    │                          │                    │                             │                    │
    │                          │                    │── JobAssigned event ────────►│                    │
    │                          │                    │                        download spec by CID      │
    │                          │                    │                        run job in Docker         │
    │                          │                    │                        upload result to IPFS     │
    │                          │                    │◄── commitResult(jobId, resultHash, root, cid) ──│
    │                          │◄── ResultCommitted─│                             │                    │
    │                          │                    │                             │                    │
    │── selectVerifiers(jobId) ────────────────────►│                             │                    │
    │◄── tx ───────────────────────────────────────│                             │                    │
    │                          │◄── VerifiersSelected│                            │── selected? ───────►│
    │                          │                    │                             │            re-execute sampled
    │                          │                    │◄── submitAttestation (PASS) ─────────────────────│
    │                          │◄── AttestationSubmitted│                         │                    │
    │                          │                    │                             │                    │
    │── settle(jobId) ─────────────────────────────►│                             │                    │
    │◄── tx ───────────────────────────────────────│                             │                    │
    │                          │◄── JobSettled ─────│                             │                    │
    │                          │◄── ReceiptIssued ──│                             │                    │
    │                          │                    │                             │                    │
    │── GET /receipts/1 ───────►│                    │                             │                    │
    │◄── receipt + ipfsVerified─│                    │                             │                    │
```

### 12.2 Malicious Provider Case

Same as above until `commitResult`. Provider submits a wrong result hash (AGENT_CHEAT_MODE=true).

```
    │                          │                    │◄── commitResult(jobId, WRONG_hash, ...) ────────│
    │                          │                    │                             │                    │
    │── selectVerifiers ───────────────────────────►│                             │                    │
    │                          │                    │◄── submitAttestation (FAIL) ─────────────────────│
    │                          │                    │                             │                    │
    │── settle(jobId) ─────────────────────────────►│
    │          outcome = REJECTED                    │
    │          provider slashed 50% collateral       │
    │          25% → verifiers who voted FAIL        │
    │          25% → requester                       │
    │          payment refunded to requester         │
    │◄── tx ───────────────────────────────────────│
    │                          │◄── ProviderSlashed ─│
    │                          │◄── JobSettled (REJECTED)
    │                          │◄── ReceiptIssued ──│
```

---

## 13. Known Mismatches

The following differences exist between the frontend's current types/implementation
and this SPEC. The frontend type is authoritative for the shape of data it consumes.
Member 4 must reconcile these when implementing real adapters.

| # | Location | Frontend (authoritative) | SPEC / Contract | Resolution |
|---|---|---|---|---|
| 1 | `Provider.id` | `string` (e.g. `"prov-001"`) | On-chain `address` (e.g. `"0x..."`) | Member 4: map `address` → `id` in real `api.ts` |
| 2 | `Provider.reputation` | `number` 0–100 | `reputationBps` uint16 0–10000 | Member 4: divide by 100 in adapter |
| 3 | `VerificationPolicy.assuranceLevel` | `'low'\|'medium'\|'high'\|'maximum'` | `uint8` 0–3 | Member 4: map string ↔ integer in adapter |
| 4 | `VerificationPolicy.samplingPct` | `number` 0–100 | `samplingBps` uint16 0–10000 | Member 4: divide by 100 in adapter |
| 5 | `VerificationPolicy.requiredCollateralEth` | ETH as `number` | Wei as `BigInt` / string | Member 4: use `formatEther` |
| 6 | `JobReceipt.quorumRequired` | `number` | Derived from policy tier (§4.4) | Backend returns it; frontend displays it |
| 7 | `SettlementOutcome.status` | `'released'\|'slashed'\|'refunded'\|'held'` | Outcome enum `ACCEPTED\|REJECTED\|INCONCLUSIVE` | Member 4: map enum → status string |
| 8 | `Attestation.verifierId` | `string` (e.g. `"ver-001"`) | On-chain `address` | Member 4: use address directly as verifierId |
| 9 | `frontend/src/lib/risk.ts` computeRiskScore | Uses workloadType + budget | SPEC uses payment/stake ratio + reputationBps + disputeHistory | Member 4: replace with SPEC formula when real data available; frontend preview is display-only until then |
| 10 | `ChainService.registerJobOnChain` signature | `(jobId, policy, escrowEth)` | `JobEscrow.registerJob(specCid, profileHash, reproClass, assurance, deadline)` payable | Member 4: update `ChainService` interface to match contract |
| 11 | `ChainService.submitAttestation` signature | `(jobId, verdict)` | `submitAttestation(jobId, verdict, evidenceHash, signature)` EIP-712 | Member 4: update interface; verifier service builds the full call |
| 12 | `Job.id` | `string` (e.g. `"job-2401"`) | `uint256` on-chain | Member 4: convert to string in adapter |

---

## 14. Open Questions

These are unresolved. Do not guess. Resolve as a group and update SPEC.md by PR.

| # | Question | Owned by | Needed by |
|---|---|---|---|
| OQ-1 | What is the minimum verifier bond in ETH? Is there a minimum to register as a verifier? | Member 1 | Member 3 (agent won't start if bond is insufficient) |
| OQ-2 | Who calls `selectVerifiers`? The requester, the backend, or the provider agent? | All | Member 3 |
| OQ-3 | Who calls `settle`? Same question. | All | Member 3 |
| OQ-4 | For `matmul` class T: who provides the reference `expectedOutput.resultHash` in the job spec, and how is it verified before the job runs? | All | Member 3 |
| OQ-5 | IPFS gateway for reads: public Pinata gateway or a pinned CID on the backend's own node? Does the backend proxy all IPFS reads or only the receipt verification? | Member 2 | Member 3, Member 4 |
| OQ-6 | What Docker image name and tag does the agent use? Is it built in this repo or pulled from a registry? | Member 3 | Member 3, Member 4 (compose file) |
| OQ-7 | Dispute window for Tier 3: who can raise a dispute, and what triggers `JobDisputed`? Only the requester, or any third party? | Member 1 | Member 1, Member 4 |
| OQ-8 | Is the `arbitrator` a fixed address (owner) in MVP, or a multisig? | Member 1 | All |
| OQ-9 | Sepolia deployment: will the team use a shared deployer key stored somewhere, or does each member deploy their own instance? | All | Member 1, Member 4 |
| OQ-10 | Frontend wallet: wagmi or bare ethers v6 `window.ethereum`? The existing `WalletContext.tsx` uses bare ethers; upgrading to wagmi is Member 4's decision. | Member 4 | Member 4 |
