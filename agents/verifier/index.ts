/**
 * verifier/index.ts
 *
 * Verifier service entry point.
 *
 * Event loop:
 *  1. Subscribe to JobEscrow VerifiersSelected events
 *  2. On event: check if walletAddress is in selectedVerifiers[]
 *  3. getJob(jobId) + getPolicy(jobId)
 *  4. fetchSpec(specCid) + fetchResult(resultCid)
 *  5. reexecute(spec, policy, result) → { verdict, evidenceHash }
 *  6. signAttestation(jobId, policyHash, resultHash, verdict, evidenceHash)
 *  7. JobEscrow.submitAttestation(jobId, verdict, evidenceHash, signature)
 *  8. Log tx hash
 */

import { ethers } from 'ethers';
import { loadVerifierConfig } from '../shared/config.js';
import { getVerifierWallet } from '../shared/chain.js';
import { getJobEscrow } from '../shared/contracts.js';
import { fetchSpec, fetchResult } from '../shared/ipfs.js';
import { reexecute, type FullSpec } from './reexecute.js';
import { signAttestation, Verdict } from './attest.js';
import { submitAttestation } from './submit.js';

async function handleVerifiersSelected(
  escrow: ethers.Contract,
  wallet: ethers.Wallet,
  jobId: bigint,
  verifiers: string[],
  verifyDeadline: bigint,
  walletAddress: string
): Promise<void> {
  console.log(`\n[verifier] ── VerifiersSelected event: jobId=${jobId}, verifiers=${verifiers.length}`);

  // ── Step 2: check eligibility ────────────────────────────────────────────
  const isSelected = verifiers.some(
    (v) => v.toLowerCase() === walletAddress.toLowerCase()
  );

  if (!isSelected) {
    console.log(`[verifier] Not selected for job ${jobId} — skipping`);
    return;
  }

  console.log(`[verifier] Selected for job ${jobId}, deadline=${verifyDeadline}`);

  // Check deadline
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (verifyDeadline > 0n && now > verifyDeadline) {
    console.warn(`[verifier] Job ${jobId} verify deadline has passed — skipping`);
    return;
  }

  // ── Step 3: get job and policy ───────────────────────────────────────────
  let job: Awaited<ReturnType<typeof escrow.getJob>>;
  let policy: Awaited<ReturnType<typeof escrow.getPolicy>>;

  try {
    job = await escrow.getJob(jobId);
    policy = await escrow.getPolicy(jobId);
  } catch (err) {
    console.error(`[verifier] getJob/getPolicy failed for job ${jobId}:`, err);
    return;
  }

  const specCid: string = job.specCid;
  const resultCid: string = job.resultCid;
  const committedHash: string = job.resultHash;
  const policyHash: string = job.policyHash;

  if (!specCid || !resultCid || !committedHash) {
    console.warn(`[verifier] Job ${jobId} is missing specCid, resultCid, or resultHash — skipping`);
    return;
  }

  // ── Step 4: fetch spec and result ────────────────────────────────────────
  let spec: FullSpec;
  let resultBlob: Buffer;

  try {
    spec = (await fetchSpec(specCid)) as FullSpec;
    console.log(`[verifier] Spec loaded: type=${spec.type}`);
  } catch (err) {
    console.error(`[verifier] fetchSpec failed for job ${jobId}:`, err);
    return;
  }

  try {
    resultBlob = await fetchResult(resultCid);
    console.log(`[verifier] Result blob loaded: ${resultBlob.length} bytes`);
  } catch (err) {
    console.error(`[verifier] fetchResult failed for job ${jobId}:`, err);
    return;
  }

  // For sha-chain we need the checkpoints from the result blob (treat as JSON array of hex strings)
  let checkpoints: string[] = [];
  if (spec.type === 'sha-chain') {
    try {
      checkpoints = JSON.parse(resultBlob.toString('utf8')) as string[];
    } catch {
      // If we can't parse checkpoints, we can still try to verify
      console.warn(`[verifier] Could not parse checkpoints for job ${jobId}`);
    }
  }

  // ── Step 5: re-execute ───────────────────────────────────────────────────
  const policyInfo = {
    samplingBps: Number(policy.samplingBps),
  };

  const { verdict, evidenceHash, detail } = reexecute(
    spec,
    policyInfo,
    resultBlob,
    checkpoints,
    committedHash
  );

  const verdictName = verdict === Verdict.PASS ? 'PASS' : verdict === Verdict.FAIL ? 'FAIL' : 'INCONCLUSIVE';
  console.log(`[verifier] Verdict for job ${jobId}: ${verdictName} — ${detail}`);

  // ── Step 6: sign attestation ─────────────────────────────────────────────
  const escrowAddress = await escrow.getAddress();

  let signed: Awaited<ReturnType<typeof signAttestation>>;
  try {
    signed = await signAttestation(wallet, escrowAddress, {
      jobId,
      policyHash,
      resultHash: committedHash,
      verdict,
      evidenceHash,
    });
  } catch (err) {
    console.error(`[verifier] EIP-712 signing failed for job ${jobId}:`, err);
    return;
  }

  // ── Step 7: submit attestation ───────────────────────────────────────────
  try {
    const txHash = await submitAttestation(escrow, signed);
    console.log(`[verifier] ✓ submitAttestation mined for job ${jobId}: ${txHash}`);
  } catch (err) {
    console.error(`[verifier] submitAttestation failed for job ${jobId}:`, err);
  }
}

async function main(): Promise<void> {
  console.log('[verifier] Starting verifier service…');

  const config = loadVerifierConfig();

  process.env['RPC_URL'] = config.rpcUrl;
  process.env['VERIFIER_PRIVATE_KEY'] = config.verifierPrivateKey;

  const { wallet } = await getVerifierWallet();
  const walletAddress = await wallet.getAddress();
  console.log(`[verifier] Wallet address: ${walletAddress}`);

  const escrow = getJobEscrow(wallet, config.chainId);
  console.log(`[verifier] Watching JobEscrow at ${await escrow.getAddress()}`);

  escrow.on(
    escrow.filters['VerifiersSelected'](null),
    async (jobId: bigint, verifiers: string[], verifyDeadline: bigint) => {
      try {
        await handleVerifiersSelected(
          escrow,
          wallet,
          jobId,
          verifiers,
          verifyDeadline,
          walletAddress
        );
      } catch (err) {
        console.error('[verifier] Unhandled error in event handler:', err);
      }
    }
  );

  console.log('[verifier] Listening for VerifiersSelected events…');

  process.on('SIGINT', () => {
    console.log('\n[verifier] Shutting down…');
    escrow.removeAllListeners();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[verifier] Fatal startup error:', err);
  process.exit(1);
});
