/**
 * indexer.ts — on-chain event poll loop.
 *
 * Uses minimal ABI fragments (event signatures only) to avoid loading
 * the full 1.8MB deployments ABI into memory.
 */
import { ethers } from 'ethers';
import db from '../db/db';
import { RPC_URL, CONFIRMATIONS, INDEXER_START_BLOCK } from '../config';
import { getJobEscrowAddress, getProviderRegistryAddress, loadDeployment } from './abis';
import * as H from './handlers';

const POLL_INTERVAL_MS = 5_000;

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

  const tick = async (): Promise<void> => {
    await poll();
    setTimeout(() => { void tick(); }, POLL_INTERVAL_MS);
  };

  void tick();
}
