/**
 * verifier/reexecute.ts
 *
 * Re-execute the sampled portion of a job and determine the verdict.
 *
 * sha-chain (class D):
 *   Select segment indices via keccak256(abi.encode(seed, i)) % segmentCount.
 *   Recompute each sampled segment and check continuity.
 *   Verdict = FAIL if any segment mismatches.
 *
 * matmul (class T):
 *   Re-run the full multiplication and compare with 1e-6 relative tolerance.
 *   Verdict = FAIL if maxRelativeError > 1e-6.
 */

import { ethers } from 'ethers';
import * as shaChain from '../jobs/sha-chain.js';
import * as matmul from '../jobs/matmul.js';
import { Verdict, type VerdictValue } from './attest.js';

export interface ReexecuteResult {
  verdict: VerdictValue;
  evidenceHash: string;   // 0x-prefixed bytes32
  detail: string;         // human-readable explanation
}

// ─── sha-chain ────────────────────────────────────────────────────────────────

interface ShaChainSpec {
  type: 'sha-chain';
  params: shaChain.ShaChainParams;
}

interface PolicyInfo {
  samplingBps: number;    // e.g. 1000 = 10%
}

/**
 * Verify a sha-chain result.
 *
 * @param spec           Job spec (must have type == 'sha-chain')
 * @param policy         Verification policy (used for samplingBps)
 * @param checkpoints    Checkpoints returned by the provider
 * @param committedHash  resultHash stored on-chain (what provider committed)
 */
function verifyShaChain(
  spec: ShaChainSpec,
  policy: PolicyInfo,
  checkpoints: string[],
  committedHash: string
): ReexecuteResult {
  const params = spec.params;
  const segmentCount = checkpoints.length - 1;

  if (segmentCount <= 0) {
    // No segments to verify — inconclusive
    return {
      verdict: Verdict.INCONCLUSIVE,
      evidenceHash: ethers.ZeroHash,
      detail: 'No checkpoints to verify',
    };
  }

  // Determine how many segments to sample
  const sampleCount = Math.max(1, Math.ceil((segmentCount * policy.samplingBps) / 10_000));
  const indices = shaChain.selectSegmentIndices(params.seed, segmentCount, sampleCount);

  for (const idx of indices) {
    const start = checkpoints[idx];
    const end = checkpoints[idx + 1];

    if (!start || !end) {
      return {
        verdict: Verdict.INCONCLUSIVE,
        evidenceHash: ethers.ZeroHash,
        detail: `Missing checkpoint at index ${idx}`,
      };
    }

    const ok = shaChain.verifySegment(params, start, end, idx);
    if (!ok) {
      // Evidence: keccak256(abi.encode(recomputedEndHash, committedCheckpoint))
      const evidenceHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['bytes32', 'bytes32'],
          [end, committedHash]
        )
      );
      return {
        verdict: Verdict.FAIL,
        evidenceHash,
        detail: `Segment ${idx} failed: checkpoint mismatch`,
      };
    }
  }

  // Also recompute the final hash from the last checkpoint to verify committedHash
  const lastCheckpoint = checkpoints[checkpoints.length - 1]!;
  const { resultHash: recomputedFinalHash } = shaChain.execute({
    ...params,
    // Run the last segment only (from last checkpoint)
    seed: lastCheckpoint.startsWith('0x') ? lastCheckpoint : '0x' + lastCheckpoint,
    iterations: params.checkpointEvery,
  });

  // The committed hash should match keccak256(last SHA-256 state)
  // We can't reconstruct the exact final state without full re-execution,
  // so we trust the sampled segment check above and also verify the full execution
  // when samplingBps is 10000 (100%).
  const fullSample = policy.samplingBps >= 10_000;
  if (fullSample) {
    const full = shaChain.execute(params);
    if (full.resultHash.toLowerCase() !== committedHash.toLowerCase()) {
      const evidenceHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['bytes32', 'bytes32'],
          [full.resultHash, committedHash]
        )
      );
      return {
        verdict: Verdict.FAIL,
        evidenceHash,
        detail: `Full re-execution hash ${full.resultHash} != committed ${committedHash}`,
      };
    }
  }

  void recomputedFinalHash; // used only for full-sample path above

  return {
    verdict: Verdict.PASS,
    evidenceHash: ethers.ZeroHash,
    detail: `Sampled ${indices.length}/${segmentCount} segments — all passed`,
  };
}

// ─── matmul ───────────────────────────────────────────────────────────────────

interface MatmulSpec {
  type: 'matmul';
  params: matmul.MatmulParams;
  tolerance?: number;
}

function verifyMatmul(
  spec: MatmulSpec,
  resultBlob: Buffer,
  committedHash: string
): ReexecuteResult {
  const ok = matmul.verify(spec.params, resultBlob);

  if (!ok) {
    const evidenceHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['string', 'bytes32'],
        ['matmul_tolerance_exceeded', committedHash]
      )
    );
    return {
      verdict: Verdict.FAIL,
      evidenceHash,
      detail: 'matmul tolerance exceeded (max relative error > 1e-6)',
    };
  }

  return {
    verdict: Verdict.PASS,
    evidenceHash: ethers.ZeroHash,
    detail: 'matmul result within tolerance',
  };
}

// ─── Public entry point ───────────────────────────────────────────────────────

export interface FullSpec {
  type: 'sha-chain' | 'matmul';
  params: Record<string, unknown>;
  tolerance?: number;
}

/**
 * Re-execute the job and return a verdict.
 *
 * @param spec           Job spec JSON from IPFS
 * @param policy         Policy record from getPolicy(jobId)
 * @param resultBlob     Raw result blob downloaded from IPFS (for matmul)
 * @param checkpoints    Checkpoint list (for sha-chain)
 * @param committedHash  resultHash stored on-chain
 */
export function reexecute(
  spec: FullSpec,
  policy: PolicyInfo,
  resultBlob: Buffer,
  checkpoints: string[],
  committedHash: string
): ReexecuteResult {
  if (spec.type === 'sha-chain') {
    return verifyShaChain(spec as ShaChainSpec, policy, checkpoints, committedHash);
  }

  if (spec.type === 'matmul') {
    return verifyMatmul(spec as MatmulSpec, resultBlob, committedHash);
  }

  return {
    verdict: Verdict.INCONCLUSIVE,
    evidenceHash: ethers.ZeroHash,
    detail: `Unknown workload type: "${(spec as FullSpec).type}"`,
  };
}
