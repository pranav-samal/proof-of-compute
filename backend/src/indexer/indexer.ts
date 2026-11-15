/**
 * indexer.ts — on-chain event poll loop.
 *
 * How it works:
 *   1. Read sync_state.last_block from SQLite
 *   2. Get latest block from chain
 *   3. toBlock = latest - CONFIRMATIONS  (wait for finality)
 *   4. Query all relevant events from (last_block+1) to toBlock
 *   5. Process each event with the right handler
 *   6. Update sync_state.last_block = toBlock
 *   7. Wait POLL_INTERVAL_MS, repeat
 *
 * Idempotent: replaying the same block range produces the same DB state
 * because all handlers use INSERT OR REPLACE.
 */
import { ethers } from 'ethers';
import db from '../db/db';
import { RPC_URL, CONFIRMATIONS, INDEXER_START_BLOCK } from '../config';
import { loadDeployment, getJobEscrowAddress, getProviderRegistryAddress } from './abis';
import * as H from './handlers';

const POLL_INTERVAL_MS = 5_000;

// ─── Setup ────────────────────────────────────────────────────────────────

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

// ─── Main loop ────────────────────────────────────────────────────────────

export async function startIndexer(): Promise<void> {
  const deployment = loadDeployment();
  if (!deployment) {
    console.warn('[indexer] No deployment found — indexer not started. Deploy contracts first.');
    return;
  }

  const escrowAddress    = getJobEscrowAddress();
  const registryAddress  = getProviderRegistryAddress();

  if (!escrowAddress || !registryAddress) {
    console.warn('[indexer] Contract addresses not configured — indexer not started.');
    return;
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);

  // Build interfaces from real ABIs
  const escrowIface    = new ethers.Interface(deployment.JobEscrow.abi as ethers.InterfaceAbi);
  const registryIface  = new ethers.Interface(deployment.ProviderRegistry.abi as ethers.InterfaceAbi);

  // Build topic sets for efficient log filtering
  const escrowTopics = [
    escrowIface.getEvent('JobRegistered')!.topicHash,
    escrowIface.getEvent('ProviderAssigned')!.topicHash,
    escrowIface.getEvent('PolicyRecorded')!.topicHash,
    escrowIface.getEvent('ResultCommitted')!.topicHash,
    escrowIface.getEvent('VerifiersSelected')!.topicHash,
    escrowIface.getEvent('AttestationSubmitted')!.topicHash,
    escrowIface.getEvent('JobSettled')!.topicHash,
    escrowIface.getEvent('ReceiptIssued')!.topicHash,
    escrowIface.getEvent('JobDisputed')!.topicHash,
    escrowIface.getEvent('TimeoutClaimed')!.topicHash,
  ];

  const registryTopics = [
    registryIface.getEvent('StakeDeposited')!.topicHash,
    registryIface.getEvent('StakeWithdrawn')!.topicHash,
    registryIface.getEvent('VerifierRegistered')!.topicHash,
    registryIface.getEvent('ProviderSlashed')!.topicHash,
    registryIface.getEvent('VerifierSlashed')!.topicHash,
    registryIface.getEvent('ReputationUpdated')!.topicHash,
  ];

  console.log(`[indexer] Started. Polling every ${POLL_INTERVAL_MS}ms`);
  console.log(`[indexer] JobEscrow:         ${escrowAddress}`);
  console.log(`[indexer] ProviderRegistry:  ${registryAddress}`);

  async function poll(): Promise<void> {
    try {
      const latestBlock = await provider.getBlockNumber();
      const fromBlock   = getLastBlock() + 1;
      const toBlock     = latestBlock - CONFIRMATIONS;

      // Update syncLag on global for /health endpoint
      (global as unknown as { _pocSyncLag: number })._pocSyncLag = latestBlock - getLastBlock();

      if (fromBlock > toBlock) return; // caught up, nothing to do

      // Fetch JobEscrow logs
      const escrowLogs = await provider.getLogs({
        address: escrowAddress,
        topics:  [escrowTopics],
        fromBlock,
        toBlock,
      });

      // Fetch ProviderRegistry logs
      const registryLogs = await provider.getLogs({
        address: registryAddress,
        topics:  [registryTopics],
        fromBlock,
        toBlock,
      });

      // Process all logs in block order
      const allLogs = [...escrowLogs, ...registryLogs]
        .sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);

      for (const log of allLogs) {
        // Get block timestamp (cache to avoid repeated RPC calls)
        const block = await provider.getBlock(log.blockNumber);
        const blockTs = block?.timestamp ?? Math.floor(Date.now() / 1000);

        const topic = log.topics[0];

        // ── JobEscrow handlers ──────────────────────────────────────────
        if (log.address.toLowerCase() === escrowAddress.toLowerCase()) {
          if (topic === escrowIface.getEvent('JobRegistered')!.topicHash)
            H.handleJobRegistered(log, escrowIface, blockTs);
          else if (topic === escrowIface.getEvent('ProviderAssigned')!.topicHash)
            H.handleProviderAssigned(log, escrowIface, blockTs);
          else if (topic === escrowIface.getEvent('PolicyRecorded')!.topicHash)
            H.handlePolicyRecorded(log, escrowIface, blockTs);
          else if (topic === escrowIface.getEvent('ResultCommitted')!.topicHash)
            H.handleResultCommitted(log, escrowIface, blockTs);
          else if (topic === escrowIface.getEvent('VerifiersSelected')!.topicHash)
            H.handleVerifiersSelected(log, escrowIface, blockTs);
          else if (topic === escrowIface.getEvent('AttestationSubmitted')!.topicHash)
            H.handleAttestationSubmitted(log, escrowIface, blockTs);
          else if (topic === escrowIface.getEvent('JobSettled')!.topicHash)
            H.handleJobSettled(log, escrowIface, blockTs);
          else if (topic === escrowIface.getEvent('ReceiptIssued')!.topicHash)
            H.handleReceiptIssued(log, escrowIface, blockTs);
          else if (topic === escrowIface.getEvent('JobDisputed')!.topicHash)
            H.handleJobDisputed(log, escrowIface, blockTs);
          else if (topic === escrowIface.getEvent('TimeoutClaimed')!.topicHash)
            H.handleTimeoutClaimed(log, escrowIface, blockTs);
        }

        // ── ProviderRegistry handlers ───────────────────────────────────
        if (log.address.toLowerCase() === registryAddress.toLowerCase()) {
          if (topic === registryIface.getEvent('StakeDeposited')!.topicHash)
            H.handleStakeDeposited(log, registryIface);
          else if (topic === registryIface.getEvent('StakeWithdrawn')!.topicHash)
            H.handleStakeWithdrawn(log, registryIface);
          else if (topic === registryIface.getEvent('VerifierRegistered')!.topicHash)
            H.handleVerifierRegistered(log, registryIface);
          else if (topic === registryIface.getEvent('ProviderSlashed')!.topicHash)
            H.handleProviderSlashed(log, registryIface);
          else if (topic === registryIface.getEvent('VerifierSlashed')!.topicHash)
            H.handleVerifierSlashed(log, registryIface);
          else if (topic === registryIface.getEvent('ReputationUpdated')!.topicHash)
            H.handleReputationUpdated(log, registryIface);
        }
      }

      setLastBlock(toBlock);

      if (allLogs.length > 0) {
        console.log(`[indexer] Processed ${allLogs.length} events (blocks ${fromBlock}–${toBlock})`);
      }
    } catch (err) {
      // Don't crash on RPC errors — just log and retry next poll
      console.error('[indexer] Poll error:', err instanceof Error ? err.message : String(err));
    }
  }

  // Start polling
  const tick = async (): Promise<void> => {
    await poll();
    setTimeout(() => { void tick(); }, POLL_INTERVAL_MS);
  };

  void tick();
}
