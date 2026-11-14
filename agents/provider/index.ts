/**
 * provider/index.ts
 *
 * Provider agent entry point.
 *
 * Event loop:
 *  1. Subscribe to JobEscrow ProviderAssigned events where provider == walletAddress
 *  2. On event: getJob(jobId) → verify state == ASSIGNED (1)
 *  3. fetchSpec(specCid)
 *  4. runner.run(spec) → { resultBlob, checkpoints }
 *  5. uploadResult(jobId, resultBlob, checkpoints) → { cid, resultHash }
 *  6. commitResult(jobId, resultHash, merkleRoot, cid)
 *  7. Log tx hash
 */

import { ethers } from 'ethers';
import { loadProviderConfig } from '../shared/config.js';
import { getProviderWallet } from '../shared/chain.js';
import { getJobEscrow } from '../shared/contracts.js';
import { fetchSpec } from '../shared/ipfs.js';
import { uploadResult } from '../shared/ipfs.js';
import { run as runJob, type JobSpec } from './runner.js';
import { commitResult } from './commit.js';
import { computeMerkleRoot } from './merkle.js';

// Job state enum (must match Solidity)
const JOB_STATE_ASSIGNED = 1;

async function handleProviderAssigned(
  escrow: ethers.Contract,
  jobId: bigint,
  providerAddress: string,
  walletAddress: string,
  maxDurationSeconds: number
): Promise<void> {
  console.log(`\n[provider] ── ProviderAssigned event: jobId=${jobId}, provider=${providerAddress}`);

  // Skip if the event is for a different provider
  if (providerAddress.toLowerCase() !== walletAddress.toLowerCase()) {
    return;
  }

  // ── Step 2: verify job state ─────────────────────────────────────────────
  let job: Awaited<ReturnType<typeof escrow.getJob>>;
  try {
    job = await escrow.getJob(jobId);
  } catch (err) {
    console.error(`[provider] getJob(${jobId}) failed:`, err);
    return;
  }

  const jobState = Number(job.state);
  if (jobState !== JOB_STATE_ASSIGNED) {
    console.log(`[provider] Job ${jobId} is in state ${jobState}, expected ASSIGNED(1) — skipping`);
    return;
  }

  const specCid: string = job.specCid;
  console.log(`[provider] Job ${jobId} spec CID: ${specCid}`);

  // ── Step 3: fetch spec ───────────────────────────────────────────────────
  let spec: JobSpec;
  try {
    spec = (await fetchSpec(specCid)) as JobSpec;
    console.log(`[provider] Spec loaded: type=${spec.type}`);
  } catch (err) {
    console.error(`[provider] fetchSpec failed for job ${jobId}:`, err);
    return;
  }

  // ── Step 4: run the job ──────────────────────────────────────────────────
  let runResult: Awaited<ReturnType<typeof runJob>>;
  try {
    runResult = await runJob(spec, maxDurationSeconds);
    console.log(`[provider] Job ${jobId} completed. resultHash=${runResult.resultHash}, checkpoints=${runResult.checkpoints.length}`);
  } catch (err) {
    console.error(`[provider] Job ${jobId} execution failed:`, err);
    return;
  }

  // ── Step 5: upload result to IPFS ────────────────────────────────────────
  let uploadResponse: { cid: string; resultHash: string };
  try {
    uploadResponse = await uploadResult(jobId, runResult.resultBlob, runResult.checkpoints);
    console.log(`[provider] Uploaded result: cid=${uploadResponse.cid}, resultHash=${uploadResponse.resultHash}`);
  } catch (err) {
    console.error(`[provider] uploadResult failed for job ${jobId}:`, err);
    return;
  }

  // ── Compute Merkle root ──────────────────────────────────────────────────
  const merkleRoot =
    runResult.checkpoints.length > 0
      ? computeMerkleRoot(runResult.checkpoints)
      : ethers.ZeroHash;

  // Use the resultHash from the actual computation (runner already computed it)
  // The uploadResult endpoint may return a different hash (backend-computed sha256);
  // we use our own keccak256(finalState) for sha-chain, sha256 for matmul.
  const resultHashToCommit = runResult.resultHash;

  // ── Step 6: commitResult on-chain ────────────────────────────────────────
  try {
    const txHash = await commitResult(escrow, {
      jobId,
      resultHash: resultHashToCommit,
      checkpointRoot: merkleRoot,
      resultCid: uploadResponse.cid,
    });
    console.log(`[provider] ✓ commitResult mined for job ${jobId}: ${txHash}`);
  } catch (err) {
    console.error(`[provider] commitResult failed for job ${jobId}:`, err);
  }
}

async function main(): Promise<void> {
  console.log('[provider] Starting provider agent…');

  // Load + validate config
  const config = loadProviderConfig();

  // Set env vars for sub-modules that read them directly
  process.env['RPC_URL'] = config.rpcUrl;
  process.env['PROVIDER_PRIVATE_KEY'] = config.providerPrivateKey;

  const { wallet } = await getProviderWallet();
  const walletAddress = await wallet.getAddress();
  console.log(`[provider] Wallet address: ${walletAddress}`);

  const escrow = getJobEscrow(wallet, config.chainId);
  console.log(`[provider] Watching JobEscrow at ${await escrow.getAddress()}`);

  // Subscribe to ProviderAssigned events
  escrow.on(
    escrow.filters['ProviderAssigned'](null, null),
    async (jobId: bigint, provider: string) => {
      try {
        await handleProviderAssigned(
          escrow,
          jobId,
          provider,
          walletAddress,
          config.maxJobDurationSeconds
        );
      } catch (err) {
        console.error('[provider] Unhandled error in event handler:', err);
      }
    }
  );

  console.log('[provider] Listening for ProviderAssigned events…');

  // Keep the process alive
  process.on('SIGINT', () => {
    console.log('\n[provider] Shutting down…');
    escrow.removeAllListeners();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[provider] Fatal startup error:', err);
  process.exit(1);
});
