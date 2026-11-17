/**
 * indexer.ts — on-chain event poll loop.
 *
 * Uses minimal ABI fragments (event signatures only) to avoid loading
 * the full 1.8MB deployments ABI into memory.
 *
 * Auto-advance: after processing events the indexer calls selectVerifiers
 * on any COMMITTED job (after commitBlock+1), and settle on any VERIFYING
 * job that has reached quorum. This means the backend drives the happy-path
 * automatically without needing manual UI calls.
 */
import { ethers } from 'ethers';
import db from '../db/db';
import { RPC_URL, CONFIRMATIONS, INDEXER_START_BLOCK, INDEXER_AUTO_ADVANCE } from '../config';
import { getJobEscrowAddress, getProviderRegistryAddress, loadDeployment } from './abis';
import * as H from './handlers';

const POLL_INTERVAL_MS = 2_000;

// ─── Minimal function ABIs for auto-advance ───────────────────────────────
const ESCROW_CALL_ABI = [
  'function selectVerifiers(uint256 jobId) external',
  'function settle(uint256 jobId) external',
  'function getJob(uint256 jobId) external view returns (tuple(address requester, address provider, string specCid, bytes32 profileHash, uint8 reproClass, uint8 assurance, uint64 deadline, uint256 payment, uint8 state, bytes32 policyHash, bytes32 resultHash, bytes32 checkpointRoot, string resultCid, uint64 commitBlock, uint8 outcome, uint64 verifyDeadline))',
  'function getAttestation(uint256 jobId, uint256 index) external view returns (address verifier, uint8 verdict, bytes32 evidenceHash)',
];
// Hardhat deployer account drives auto-advance transactions
const HARDHAT_DEPLOYER_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

// ─── Minimal event ABIs (fragments only — no function ABIs needed) ────────
// This avoids loading the full 1.8MB ABI into memory.

const ESCROW_EVENTS = [
  'event JobRegistered(uint256 indexed jobId, address indexed requester, string specCid, bytes32 profileHash, uint256 payment)',
  'event ProviderAssigned(uint256 indexed jobId, address indexed provider)',
  'event PolicyRecorded(uint256 indexed jobId, bytes32 policyHash, uint8 tier, uint16 samplingBps, uint256 collateral, uint32 challengeWindow)',
  'event ResultCommitted(uint256 indexed jobId, bytes32 resultHash, bytes32 checkpointRoot, string resultCid)',
  'event VerifiersSelected(uint256 indexed jobId, address[] verifiers, uint64 verifyDeadline)',
  'event AttestationSubmitted(uint256 indexed jobId, address indexed verifier, uint8 verdict, bytes32 evidenceHash)',
  'event JobSettled(uint256 indexed jobId, uint8 outcome)',
  'event ReceiptIssued(uint256 indexed jobId, bytes32 policyHash, bytes32 resultHash, bytes32 attestationRoot, uint8 tier, uint8 outcome, uint64 settledAt)',
  'event JobDisputed(uint256 indexed jobId, address challenger)',
  'event TimeoutClaimed(uint256 indexed jobId, address claimedBy)',
];

const REGISTRY_EVENTS = [
  'event StakeDeposited(address indexed provider, uint256 amount)',
  'event StakeWithdrawn(address indexed provider, uint256 amount)',
  'event VerifierRegistered(address indexed verifier, uint256 bond)',
  'event ProviderSlashed(address indexed provider, uint256 amount, address recipient)',
  'event VerifierSlashed(address indexed verifier, uint256 amount)',
  'event ReputationUpdated(address indexed provider, uint16 reputationBps)',
];

// ─── Helpers ──────────────────────────────────────────────────────────────

function getLastBlock(): number {
  const row = db.get<{ last_block: number }>('SELECT last_block FROM sync_state WHERE id = 1');
  return row?.last_block ?? INDEXER_START_BLOCK;
}

function setLastBlock(block: number): void {
  db.run(
    `UPDATE sync_state SET last_block = :block, updated_at = :now WHERE id = 1`,
    { block, now: new Date().toISOString() }
  );
  db.persist();
}

// ─── Main ─────────────────────────────────────────────────────────────────

export async function startIndexer(): Promise<void> {
  // Check deployment file exists (addresses needed)
  const deployment = loadDeployment();
  if (!deployment) {
    console.warn('[indexer] No deployment found — indexer not started.');
    return;
  }

  const escrowAddress = getJobEscrowAddress();
  const registryAddress = getProviderRegistryAddress();

  if (!escrowAddress || !registryAddress) {
    console.warn('[indexer] Contract addresses not configured — indexer not started.');
    return;
  }

  const rpcProvider = new ethers.JsonRpcProvider(RPC_URL);

  // Use minimal fragment ABIs — much less memory than full ABI
  const escrowIface = new ethers.Interface(ESCROW_EVENTS);
  const registryIface = new ethers.Interface(REGISTRY_EVENTS);

  // Create a signer contract for auto-advance calls (uses Hardhat deployer key)
  const autoWallet = new ethers.Wallet(HARDHAT_DEPLOYER_KEY, rpcProvider);
  const escrow = new ethers.Contract(escrowAddress, ESCROW_CALL_ABI, autoWallet);

  // Pre-compute topic hashes once
  const escrowTopics = ESCROW_EVENTS.map((e) => {
    const frag = ethers.EventFragment.from(e.replace('event ', ''));
    return ethers.id(`${frag.name}(${frag.inputs.map((i) => i.type).join(',')})`);
  });
  const registryTopics = REGISTRY_EVENTS.map((e) => {
    const frag = ethers.EventFragment.from(e.replace('event ', ''));
    return ethers.id(`${frag.name}(${frag.inputs.map((i) => i.type).join(',')})`);
  });

  console.log(`[indexer] Started. Polling every ${POLL_INTERVAL_MS}ms`);
  console.log(`[indexer] JobEscrow:         ${escrowAddress}`);
  console.log(`[indexer] ProviderRegistry:  ${registryAddress}`);

  // Block cache to avoid repeated RPC calls for the same block
  const blockTsCache = new Map<number, number>();

  async function getBlockTs(blockNumber: number, provider: ethers.JsonRpcProvider): Promise<number> {
    if (blockTsCache.has(blockNumber)) return blockTsCache.get(blockNumber)!;
    const block = await provider.getBlock(blockNumber);
    const ts = block?.timestamp ?? Math.floor(Date.now() / 1000);
    blockTsCache.set(blockNumber, ts);
    // Keep cache small
    if (blockTsCache.size > 100) {
      const firstKey = blockTsCache.keys().next().value;
      if (firstKey !== undefined) blockTsCache.delete(firstKey);
    }
    return ts;
  }

  async function poll(): Promise<void> {
    try {
      const latestBlock = await rpcProvider.getBlockNumber();
      const fromBlock = getLastBlock() + 1;
      const toBlock = latestBlock - CONFIRMATIONS;

      (global as unknown as { _pocSyncLag: number })._pocSyncLag = latestBlock - getLastBlock();

      // ── Auto-advance runs on EVERY tick, not only when new logs exist. ─────
      // On Hardhat automine no new blocks are produced between transactions, so
      // fromBlock > toBlock is the normal idle state. Without this, the indexer
      // never calls selectVerifiers after commitResult and the job gets stuck in
      // COMMITTED forever.
      if (INDEXER_AUTO_ADVANCE) {
        // If a COMMITTED job is waiting and Hardhat hasn't advanced past
        // commitBlock+1 yet, mine two empty blocks to unblock selectVerifiers.
        interface CommittedJob { job_id: string; commit_block: number | null; }
        const committed = db.all<CommittedJob>(
          "SELECT job_id, commit_block FROM jobs WHERE state = 'COMMITTED'"
        );
        if (committed.length > 0) {
          const needsMine = committed.some(
            (j) => j.commit_block !== null && latestBlock <= j.commit_block + 1
          );
          if (needsMine) {
            try {
              // hardhat_mine only works on a local Hardhat node — safe to call;
              // on a real network this is a no-op error we silently ignore.
              await rpcProvider.send('hardhat_mine', ['0x3']);
            } catch { /* not a Hardhat node — ignore */ }
          }
        }
        await autoAdvance(escrow, await rpcProvider.getBlockNumber());
      }

      if (fromBlock > toBlock) return;

      const [escrowLogs, registryLogs] = await Promise.all([
        rpcProvider.getLogs({ address: escrowAddress, topics: [escrowTopics], fromBlock, toBlock }),
        rpcProvider.getLogs({ address: registryAddress, topics: [registryTopics], fromBlock, toBlock }),
      ]);

      const allLogs = [...escrowLogs, ...registryLogs]
        .sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);

      for (const log of allLogs) {
        const blockTs = await getBlockTs(log.blockNumber, rpcProvider);
        const topic = log.topics[0];

        if (log.address.toLowerCase() === escrowAddress.toLowerCase()) {
          if (topic === escrowTopics[0]) H.handleJobRegistered(log, escrowIface, blockTs);
          else if (topic === escrowTopics[1]) H.handleProviderAssigned(log, escrowIface, blockTs);
          else if (topic === escrowTopics[2]) H.handlePolicyRecorded(log, escrowIface, blockTs);
          else if (topic === escrowTopics[3]) H.handleResultCommitted(log, escrowIface, blockTs);
          else if (topic === escrowTopics[4]) H.handleVerifiersSelected(log, escrowIface, blockTs);
          else if (topic === escrowTopics[5]) H.handleAttestationSubmitted(log, escrowIface, blockTs);
          else if (topic === escrowTopics[6]) H.handleJobSettled(log, escrowIface, blockTs);
          else if (topic === escrowTopics[7]) H.handleReceiptIssued(log, escrowIface, blockTs);
          else if (topic === escrowTopics[8]) H.handleJobDisputed(log, escrowIface, blockTs);
          else if (topic === escrowTopics[9]) H.handleTimeoutClaimed(log, escrowIface, blockTs);
        }

        if (log.address.toLowerCase() === registryAddress.toLowerCase()) {
          if (topic === registryTopics[0]) H.handleStakeDeposited(log, registryIface);
          else if (topic === registryTopics[1]) H.handleStakeWithdrawn(log, registryIface);
          else if (topic === registryTopics[2]) H.handleVerifierRegistered(log, registryIface);
          else if (topic === registryTopics[3]) H.handleProviderSlashed(log, registryIface);
          else if (topic === registryTopics[4]) H.handleVerifierSlashed(log, registryIface);
          else if (topic === registryTopics[5]) H.handleReputationUpdated(log, registryIface);
        }
      }

      setLastBlock(toBlock);

      if (allLogs.length > 0) {
        console.log(`[indexer] Processed ${allLogs.length} events (blocks ${fromBlock}–${toBlock})`);
      }

    } catch (err) {
      console.error('[indexer] Poll error:', err instanceof Error ? err.message : String(err));
    }
  }

  // ── Auto-advance: selectVerifiers and settle ─────────────────────────
  async function autoAdvance(escrowContract: ethers.Contract, latestBlock: number): Promise<void> {
    // 1. selectVerifiers on COMMITTED jobs (after commitBlock+1)
    interface CommittedJob { job_id: string; commit_block: number | null; }
    const committed = db.all<CommittedJob>(
      "SELECT job_id, commit_block FROM jobs WHERE state = 'COMMITTED'"
    );
    for (const j of committed) {
      if (!j.commit_block) continue;
      if (latestBlock <= j.commit_block + 1) continue; // need at least 1 block gap
      try {
        const tx = await escrowContract.selectVerifiers(BigInt(j.job_id));
        await tx.wait();
        console.log(`[indexer] auto selectVerifiers jobId=${j.job_id} tx=${tx.hash}`);
      } catch (e) {
        // May already be VERIFYING if another call raced — ignore revert
        const msg = e instanceof Error ? e.message : String(e);
        if (!msg.includes('revert') && !msg.includes('invalid state')) {
          console.warn(`[indexer] selectVerifiers failed jobId=${j.job_id}: ${msg}`);
        }
      }
    }

    // 2. settle on VERIFYING jobs that have enough attestations
    interface VerifyingJob { job_id: string; }
    const verifying = db.all<VerifyingJob>("SELECT job_id FROM jobs WHERE state = 'VERIFYING'");
    for (const j of verifying) {
      // Check quorum from policies table
      interface PolicyRow { quorum: number; }
      const policy = db.get<PolicyRow>('SELECT quorum FROM policies WHERE job_id = :id', { id: j.job_id });
      if (!policy) continue;
      interface ACount { cnt: number; }
      const passCount = db.get<ACount>(
        "SELECT COUNT(*) as cnt FROM attestations WHERE job_id = :id AND verdict = 'PASS'",
        { id: j.job_id }
      );
      if ((passCount?.cnt ?? 0) >= policy.quorum) {
        try {
          const tx = await escrowContract.settle(BigInt(j.job_id));
          await tx.wait();
          console.log(`[indexer] auto settle jobId=${j.job_id} tx=${tx.hash}`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!msg.includes('revert') && !msg.includes('invalid state')) {
            console.warn(`[indexer] settle failed jobId=${j.job_id}: ${msg}`);
          }
        }
      }
    }
  }

  const tick = async (): Promise<void> => {
    await poll();
    setTimeout(() => { void tick(); }, POLL_INTERVAL_MS);
  };

  void tick();
}
