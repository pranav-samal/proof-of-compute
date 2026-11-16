-- Proof-of-Compute database schema
-- Source of truth: docs/SPEC.md §9
-- All ETH amounts stored as TEXT wei strings (never floats).
-- All timestamps stored as ISO-8601 TEXT.
-- All handlers must use INSERT OR REPLACE for idempotency.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ─── Providers ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS providers (
    address         TEXT PRIMARY KEY,
    capability_hash TEXT NOT NULL,
    stake_wei       TEXT NOT NULL DEFAULT '0',
    locked_wei      TEXT NOT NULL DEFAULT '0',
    reputation_bps  INTEGER NOT NULL DEFAULT 10000,
    slash_count     INTEGER NOT NULL DEFAULT 0,
    verified_jobs   INTEGER NOT NULL DEFAULT 0,
    last_seen_block INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS provider_profiles (
    address         TEXT PRIMARY KEY REFERENCES providers(address),
    profile_json    TEXT NOT NULL,
    profile_cid     TEXT NOT NULL,
    profile_hash    TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

-- ─── Jobs ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS jobs (
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
    title           TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS policies (
    job_id           TEXT PRIMARY KEY REFERENCES jobs(job_id),
    tier             INTEGER NOT NULL,
    sampling_bps     INTEGER NOT NULL,
    verifier_count   INTEGER NOT NULL,
    quorum           INTEGER NOT NULL,
    collateral_wei   TEXT NOT NULL,
    challenge_window INTEGER NOT NULL
);

-- ─── Verifiers ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS verifier_selections (
    job_id          TEXT NOT NULL REFERENCES jobs(job_id),
    verifier        TEXT NOT NULL,
    position        INTEGER NOT NULL,
    verify_deadline INTEGER NOT NULL,
    PRIMARY KEY (job_id, verifier)
);

CREATE TABLE IF NOT EXISTS attestations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id          TEXT NOT NULL REFERENCES jobs(job_id),
    verifier        TEXT NOT NULL,
    verdict         TEXT NOT NULL,       -- 'PASS' | 'FAIL' | 'INCONCLUSIVE'
    evidence_hash   TEXT,
    tx_hash         TEXT NOT NULL,
    block_number    INTEGER NOT NULL,
    ts              TEXT NOT NULL
);

-- ─── Settlement & receipts ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS settlements (
    job_id           TEXT PRIMARY KEY REFERENCES jobs(job_id),
    outcome          TEXT NOT NULL,      -- 'ACCEPTED' | 'REJECTED' | 'INCONCLUSIVE'
    provider_paid    TEXT NOT NULL DEFAULT '0',
    requester_refund TEXT NOT NULL DEFAULT '0',
    verifier_fees    TEXT NOT NULL DEFAULT '0',
    slash_amount     TEXT NOT NULL DEFAULT '0',
    tx_hash          TEXT NOT NULL,
    block_number     INTEGER NOT NULL,
    ts               TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS receipts (
    job_id           TEXT PRIMARY KEY REFERENCES jobs(job_id),
    spec_cid         TEXT NOT NULL,
    policy_hash      TEXT NOT NULL,
    provider         TEXT NOT NULL,
    requester        TEXT NOT NULL,
    result_hash      TEXT NOT NULL,
    attestation_root TEXT NOT NULL,
    tier             INTEGER NOT NULL,
    outcome          TEXT NOT NULL,
    settled_at       TEXT NOT NULL,
    tx_hash          TEXT NOT NULL
);

-- ─── Spec title cache ────────────────────────────────────────────────────────
-- Stores the human-readable title for each spec CID so the job list can
-- show something better than "Job #1".  Written by POST /jobs/spec.

CREATE TABLE IF NOT EXISTS spec_titles (
    spec_cid  TEXT PRIMARY KEY,
    title     TEXT NOT NULL,
    created_at TEXT NOT NULL
);

-- ─── Per-state transaction hashes ──────────────────────────────────────────
-- Records the tx hash each time a job state changes.

CREATE TABLE IF NOT EXISTS job_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id          TEXT NOT NULL,
    state           TEXT NOT NULL,
    tx_hash         TEXT NOT NULL,
    block_number    INTEGER NOT NULL,
    ts              TEXT NOT NULL,
    detail          TEXT
);

CREATE TABLE IF NOT EXISTS sync_state (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    last_block  INTEGER NOT NULL DEFAULT 0,
    updated_at  TEXT NOT NULL
);

-- Seed the single sync_state row (idempotent)
INSERT OR IGNORE INTO sync_state (id, last_block, updated_at)
VALUES (1, 0, datetime('now'));
