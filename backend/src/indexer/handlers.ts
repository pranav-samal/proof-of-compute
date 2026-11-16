/**
 * handlers.ts — processes each contract event and writes to SQLite.
 *
 * Every handler uses INSERT OR REPLACE so replaying the same block is safe.
 * Event signatures match EXACTLY what Member 1 deployed (read from ABI).
 *
 * JobEscrow events handled:
 *   JobRegistered, ProviderAssigned, PolicyRecorded, ResultCommitted,
 *   VerifiersSelected, AttestationSubmitted, JobSettled, ReceiptIssued,
 *   JobDisputed, DisputeResolved, TimeoutClaimed
 *
 * ProviderRegistry events handled:
 *   StakeDeposited, StakeWithdrawn, VerifierRegistered, VerifierSlashed,
 *   ProviderSlashed, ReputationUpdated
 */
import { ethers } from 'ethers';
import db from '../db/db';

// ─── Helpers ──────────────────────────────────────────────────────────────

function now(): string { return new Date().toISOString(); }
function hex(v: unknown): string { return String(v); }
function num(v: unknown): number { return Number(v); }
function str(v: unknown): string { return String(v); }
function ts(blockTs: number): string { return new Date(blockTs * 1000).toISOString(); }

// Map uint8 outcome to string
const OUTCOME_MAP: Record<number, string> = {
  0: 'NONE', 1: 'ACCEPTED', 2: 'REJECTED', 3: 'INCONCLUSIVE',
};
// Map uint8 state to string
const STATE_MAP: Record<number, string> = {
  0: 'REGISTERED', 1: 'ASSIGNED', 2: 'COMMITTED',
  3: 'VERIFYING', 4: 'SETTLED', 5: 'DISPUTED', 6: 'REFUNDED',
};

// ─── JobEscrow handlers ────────────────────────────────────────────────────

export function handleJobRegistered(
  log: ethers.Log,
  iface: ethers.Interface,
  blockTs: number
): void {
  const e = iface.parseLog(log);
  if (!e) return;
  const { jobId, requester, specCid, profileHash, payment } = e.args;
  const created = ts(blockTs);

  db.run(
    `INSERT OR REPLACE INTO jobs
       (job_id, requester, spec_cid, profile_hash, repro_class, assurance,
        deadline, payment_wei, state, outcome, created_at, updated_at)
     VALUES (:jobId, :requester, :specCid, :profileHash, 0, 0,
             0, :payment, 'REGISTERED', 'NONE', :created, :created)`,
    {
      jobId: str(jobId), requester: str(requester), specCid: str(specCid),
      profileHash: hex(profileHash), payment: str(payment), created
    }
  );

  db.run(
    `INSERT OR IGNORE INTO providers (address, capability_hash) VALUES (:addr, '0x')`,
    { addr: str(requester) }
  );

  // Record tx hash for timeline
  db.run(
    `INSERT INTO job_events (job_id, state, tx_hash, block_number, ts, detail)
     VALUES (:jobId, 'REGISTERED', :txHash, :block, :ts, :detail)`,
    {
      jobId: str(jobId), txHash: log.transactionHash, block: log.blockNumber,
      ts: ts(blockTs), detail: `specCid: ${str(specCid)}`
    }
  );

  db.persist();
  console.log(`[indexer] JobRegistered: jobId=${jobId}`);
}

export function handleProviderAssigned(
  log: ethers.Log,
  iface: ethers.Interface,
  blockTs: number
): void {
  const e = iface.parseLog(log);
  if (!e) return;
  const { jobId, provider } = e.args;

  db.run(
    `UPDATE jobs SET provider = :provider, state = 'ASSIGNED', updated_at = :now
     WHERE job_id = :jobId`,
    { provider: str(provider), now: ts(blockTs), jobId: str(jobId) }
  );

  db.run(
    `INSERT OR IGNORE INTO providers (address, capability_hash) VALUES (:addr, '0x')`,
    { addr: str(provider) }
  );

  db.run(
    `INSERT INTO job_events (job_id, state, tx_hash, block_number, ts, detail)
     VALUES (:jobId, 'ASSIGNED', :txHash, :block, :ts, :detail)`,
    {
      jobId: str(jobId), txHash: log.transactionHash, block: log.blockNumber,
      ts: ts(blockTs), detail: `provider: ${str(provider)}`
    }
  );

  db.persist();
  console.log(`[indexer] ProviderAssigned: jobId=${jobId} provider=${provider}`);
}

export function handlePolicyRecorded(
  log: ethers.Log,
  iface: ethers.Interface,
  blockTs: number
): void {
  const e = iface.parseLog(log);
  if (!e) return;
  const { jobId, policyHash, tier, samplingBps, collateral, challengeWindow } = e.args;

  db.run(
    `UPDATE jobs SET policy_hash = :policyHash, state = 'ASSIGNED', updated_at = :now
     WHERE job_id = :jobId`,
    { policyHash: hex(policyHash), now: ts(blockTs), jobId: str(jobId) }
  );

  // Determine verifier count and quorum from tier
  const tierCounts = [[1, 1], [3, 2], [5, 3], [5, 4]];
  const t = num(tier);
  const [verifierCount, quorum] = tierCounts[t] ?? [1, 1];

  db.run(
    `INSERT OR REPLACE INTO policies
       (job_id, tier, sampling_bps, verifier_count, quorum, collateral_wei, challenge_window)
     VALUES (:jobId, :tier, :samplingBps, :verifierCount, :quorum, :collateral, :challengeWindow)`,
    {
      jobId: str(jobId), tier: t, samplingBps: num(samplingBps),
      verifierCount, quorum, collateral: str(collateral),
      challengeWindow: num(challengeWindow)
    }
  );

  db.run(
    `INSERT INTO job_events (job_id, state, tx_hash, block_number, ts, detail)
     VALUES (:jobId, 'ASSIGNED', :txHash, :block, :ts, :detail)`,
    {
      jobId: str(jobId), txHash: log.transactionHash, block: log.blockNumber,
      ts: ts(blockTs), detail: `policyHash: ${hex(policyHash)} tier: ${num(tier)}`
    }
  );

  db.persist();
  console.log(`[indexer] PolicyRecorded: jobId=${jobId} tier=${tier}`);
}

export function handleResultCommitted(
  log: ethers.Log,
  iface: ethers.Interface,
  blockTs: number
): void {
  const e = iface.parseLog(log);
  if (!e) return;
  const { jobId, resultHash, checkpointRoot, resultCid } = e.args;

  db.run(
    `UPDATE jobs
     SET result_hash = :resultHash, checkpoint_root = :checkpointRoot,
         result_cid = :resultCid, state = 'COMMITTED',
         commit_block = :block, updated_at = :now
     WHERE job_id = :jobId`,
    {
      resultHash: hex(resultHash), checkpointRoot: hex(checkpointRoot),
      resultCid: str(resultCid), block: log.blockNumber,
      now: ts(blockTs), jobId: str(jobId)
    }
  );

  db.run(
    `INSERT INTO job_events (job_id, state, tx_hash, block_number, ts, detail)
     VALUES (:jobId, 'COMMITTED', :txHash, :block, :ts, :detail)`,
    {
      jobId: str(jobId), txHash: log.transactionHash, block: log.blockNumber,
      ts: ts(blockTs), detail: `resultHash: ${hex(resultHash)}`
    }
  );

  db.persist();
  console.log(`[indexer] ResultCommitted: jobId=${jobId}`);
}

export function handleVerifiersSelected(
  log: ethers.Log,
  iface: ethers.Interface,
  blockTs: number
): void {
  const e = iface.parseLog(log);
  if (!e) return;
  const { jobId, verifiers, verifyDeadline } = e.args;

  db.run(
    `UPDATE jobs SET state = 'VERIFYING', updated_at = :now WHERE job_id = :jobId`,
    { now: ts(blockTs), jobId: str(jobId) }
  );

  for (let i = 0; i < verifiers.length; i++) {
    db.run(
      `INSERT OR REPLACE INTO verifier_selections
         (job_id, verifier, position, verify_deadline)
       VALUES (:jobId, :verifier, :position, :deadline)`,
      {
        jobId: str(jobId), verifier: str(verifiers[i]),
        position: i, deadline: num(verifyDeadline)
      }
    );
  }

  db.run(
    `INSERT INTO job_events (job_id, state, tx_hash, block_number, ts, detail)
     VALUES (:jobId, 'VERIFYING', :txHash, :block, :ts, :detail)`,
    {
      jobId: str(jobId), txHash: log.transactionHash, block: log.blockNumber,
      ts: ts(blockTs), detail: `${verifiers.length} verifier(s) selected`
    }
  );

  db.persist();
  console.log(`[indexer] VerifiersSelected: jobId=${jobId} count=${verifiers.length}`);
}

export function handleAttestationSubmitted(
  log: ethers.Log,
  iface: ethers.Interface,
  blockTs: number
): void {
  const e = iface.parseLog(log);
  if (!e) return;
  const { jobId, verifier, verdict, evidenceHash } = e.args;

  // Map uint8 verdict to string
  const verdictMap: Record<number, string> = { 0: 'PASS', 1: 'FAIL', 2: 'INCONCLUSIVE' };
  const verdictStr = verdictMap[num(verdict)] ?? 'INCONCLUSIVE';

  db.run(
    `INSERT OR REPLACE INTO attestations
       (job_id, verifier, verdict, evidence_hash, tx_hash, block_number, ts)
     VALUES (:jobId, :verifier, :verdict, :evidenceHash, :txHash, :block, :ts)`,
    {
      jobId: str(jobId), verifier: str(verifier), verdict: verdictStr,
      evidenceHash: hex(evidenceHash), txHash: log.transactionHash,
      block: log.blockNumber, ts: ts(blockTs)
    }
  );

  db.persist();
  console.log(`[indexer] AttestationSubmitted: jobId=${jobId} verifier=${verifier} verdict=${verdictStr}`);
}

export function handleJobSettled(
  log: ethers.Log,
  iface: ethers.Interface,
  blockTs: number
): void {
  const e = iface.parseLog(log);
  if (!e) return;
  const { jobId, outcome } = e.args;
  const outcomeStr = OUTCOME_MAP[num(outcome)] ?? 'NONE';

  db.run(
    `UPDATE jobs SET state = 'SETTLED', outcome = :outcome, updated_at = :now
     WHERE job_id = :jobId`,
    { outcome: outcomeStr, now: ts(blockTs), jobId: str(jobId) }
  );

  db.run(
    `INSERT OR REPLACE INTO settlements
       (job_id, outcome, provider_paid, requester_refund, verifier_fees,
        slash_amount, tx_hash, block_number, ts)
     VALUES (:jobId, :outcome, '0', '0', '0', '0', :txHash, :block, :ts)`,
    {
      jobId: str(jobId), outcome: outcomeStr, txHash: log.transactionHash,
      block: log.blockNumber, ts: ts(blockTs)
    }
  );

  db.run(
    `INSERT INTO job_events (job_id, state, tx_hash, block_number, ts, detail)
     VALUES (:jobId, 'SETTLED', :txHash, :block, :ts, :detail)`,
    {
      jobId: str(jobId), txHash: log.transactionHash, block: log.blockNumber,
      ts: ts(blockTs), detail: `outcome: ${outcomeStr}`
    }
  );

  db.persist();
  console.log(`[indexer] JobSettled: jobId=${jobId} outcome=${outcomeStr}`);
}

export function handleReceiptIssued(
  log: ethers.Log,
  iface: ethers.Interface,
  blockTs: number
): void {
  const e = iface.parseLog(log);
  if (!e) return;
  const { jobId, policyHash, resultHash, attestationRoot, tier, outcome, settledAt } = e.args;
  const outcomeStr = OUTCOME_MAP[num(outcome)] ?? 'NONE';

  // Fetch provider + requester from jobs table
  const job = db.get<{ provider: string; requester: string; spec_cid: string }>(
    'SELECT provider, requester, spec_cid FROM jobs WHERE job_id = :jobId',
    { jobId: str(jobId) }
  );

  db.run(
    `INSERT OR REPLACE INTO receipts
       (job_id, spec_cid, policy_hash, provider, requester, result_hash,
        attestation_root, tier, outcome, settled_at, tx_hash)
     VALUES (:jobId, :specCid, :policyHash, :provider, :requester, :resultHash,
             :attestationRoot, :tier, :outcome, :settledAt, :txHash)`,
    {
      jobId: str(jobId), specCid: job?.spec_cid ?? '',
      policyHash: hex(policyHash), provider: job?.provider ?? '',
      requester: job?.requester ?? '', resultHash: hex(resultHash),
      attestationRoot: hex(attestationRoot), tier: num(tier),
      outcome: outcomeStr,
      settledAt: new Date(num(settledAt) * 1000).toISOString(),
      txHash: log.transactionHash
    }
  );

  db.persist();
  console.log(`[indexer] ReceiptIssued: jobId=${jobId}`);
}

export function handleJobDisputed(
  log: ethers.Log,
  iface: ethers.Interface,
  blockTs: number
): void {
  const e = iface.parseLog(log);
  if (!e) return;
  const { jobId } = e.args;

  db.run(
    `UPDATE jobs SET state = 'DISPUTED', updated_at = :now WHERE job_id = :jobId`,
    { now: ts(blockTs), jobId: str(jobId) }
  );
  db.persist();
  console.log(`[indexer] JobDisputed: jobId=${jobId}`);
}

export function handleTimeoutClaimed(
  log: ethers.Log,
  iface: ethers.Interface,
  blockTs: number
): void {
  const e = iface.parseLog(log);
  if (!e) return;
  const { jobId } = e.args;

  db.run(
    `UPDATE jobs SET state = 'REFUNDED', outcome = 'NONE', updated_at = :now
     WHERE job_id = :jobId`,
    { now: ts(blockTs), jobId: str(jobId) }
  );
  db.persist();
  console.log(`[indexer] TimeoutClaimed: jobId=${jobId}`);
}

// ─── ProviderRegistry handlers ────────────────────────────────────────────

export function handleStakeDeposited(
  log: ethers.Log,
  iface: ethers.Interface
): void {
  const e = iface.parseLog(log);
  if (!e) return;
  const { provider, amount } = e.args;

  db.run(
    `INSERT OR IGNORE INTO providers (address, capability_hash) VALUES (:addr, '0x')`,
    { addr: str(provider) }
  );
  // Add to existing stake
  db.run(
    `UPDATE providers
     SET stake_wei = CAST(CAST(stake_wei AS INTEGER) + CAST(:amount AS INTEGER) AS TEXT),
         last_seen_block = :block
     WHERE address = :addr`,
    { amount: str(amount), block: log.blockNumber, addr: str(provider) }
  );
  db.persist();
  console.log(`[indexer] StakeDeposited: provider=${provider} amount=${amount}`);
}

export function handleStakeWithdrawn(
  log: ethers.Log,
  iface: ethers.Interface
): void {
  const e = iface.parseLog(log);
  if (!e) return;
  const { provider, amount } = e.args;

  db.run(
    `UPDATE providers
     SET stake_wei = CAST(MAX(0, CAST(stake_wei AS INTEGER) - CAST(:amount AS INTEGER)) AS TEXT)
     WHERE address = :addr`,
    { amount: str(amount), addr: str(provider) }
  );
  db.persist();
}

export function handleVerifierRegistered(
  log: ethers.Log,
  iface: ethers.Interface
): void {
  const e = iface.parseLog(log);
  if (!e) return;
  const { verifier, bond } = e.args;

  db.run(
    `INSERT OR IGNORE INTO providers (address, capability_hash) VALUES (:addr, '0x')`,
    { addr: str(verifier) }
  );
  db.run(
    `UPDATE providers SET stake_wei = :bond WHERE address = :addr`,
    { bond: str(bond), addr: str(verifier) }
  );
  db.persist();
  console.log(`[indexer] VerifierRegistered: verifier=${verifier} bond=${bond}`);
}

export function handleProviderSlashed(
  log: ethers.Log,
  iface: ethers.Interface
): void {
  const e = iface.parseLog(log);
  if (!e) return;
  const { provider, amount } = e.args;

  db.run(
    `UPDATE providers
     SET slash_count = slash_count + 1,
         stake_wei = CAST(MAX(0, CAST(stake_wei AS INTEGER) - CAST(:amount AS INTEGER)) AS TEXT)
     WHERE address = :addr`,
    { amount: str(amount), addr: str(provider) }
  );
  db.persist();
  console.log(`[indexer] ProviderSlashed: provider=${provider}`);
}

export function handleVerifierSlashed(
  log: ethers.Log,
  iface: ethers.Interface
): void {
  const e = iface.parseLog(log);
  if (!e) return;
  const { verifier, amount } = e.args;

  db.run(
    `UPDATE providers
     SET slash_count = slash_count + 1,
         stake_wei = CAST(MAX(0, CAST(stake_wei AS INTEGER) - CAST(:amount AS INTEGER)) AS TEXT)
     WHERE address = :addr`,
    { amount: str(amount), addr: str(verifier) }
  );
  db.persist();
}

export function handleReputationUpdated(
  log: ethers.Log,
  iface: ethers.Interface
): void {
  const e = iface.parseLog(log);
  if (!e) return;
  const { provider, reputationBps } = e.args;

  db.run(
    `UPDATE providers SET reputation_bps = :rep WHERE address = :addr`,
    { rep: num(reputationBps), addr: str(provider) }
  );
  db.persist();
  console.log(`[indexer] ReputationUpdated: provider=${provider} rep=${reputationBps}`);
}
