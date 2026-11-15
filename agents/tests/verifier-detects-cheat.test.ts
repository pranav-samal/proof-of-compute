/**
 * tests/verifier-detects-cheat.test.ts
 *
 * Test 10: Verifier detects a cheating provider.
 *
 * The provider runs sha-chain, computes the correct resultHash,
 * then replaces it with a wrong hash (cheat mode).
 * The verifier re-executes and should detect the mismatch → verdict = FAIL.
 */

import { describe, it, expect } from 'vitest';
import { execute as shaChainExecute } from '../jobs/sha-chain.js';
import { execute as matmulExecute, verify as matmulVerify } from '../jobs/matmul.js';
import { reexecute } from '../verifier/reexecute.js';
import { Verdict } from '../verifier/attest.js';
import { ethers } from 'ethers';

const SEED = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

describe('verifier detects cheat (test 10)', () => {
  it('verdict = FAIL when provider committed a wrong hash', () => {
    const params = { seed: SEED, iterations: 50, checkpointEvery: 10 };
    const honestResult = shaChainExecute(params);

    // Provider cheats: submit a random wrong hash
    const wrongHash = ethers.hexlify(ethers.randomBytes(32));

    const spec = { type: 'sha-chain' as const, params };
    const policy = { samplingBps: 10_000 }; // 100% sampling → full re-execution

    const result = reexecute(
      spec,
      policy,
      Buffer.from(honestResult.finalHash.slice(2), 'hex'),
      honestResult.checkpoints,
      wrongHash // ← cheat: committed hash doesn't match the actual computation
    );

    expect(result.verdict).toBe(Verdict.FAIL);
    expect(result.evidenceHash).not.toBe(ethers.ZeroHash);
  });

  it('verdict = PASS when provider committed the correct hash', () => {
    const params = { seed: SEED, iterations: 50, checkpointEvery: 10 };
    const honestResult = shaChainExecute(params);

    const spec = { type: 'sha-chain' as const, params };
    const policy = { samplingBps: 10_000 };

    const result = reexecute(
      spec,
      policy,
      Buffer.from(honestResult.finalHash.slice(2), 'hex'),
      honestResult.checkpoints,
      honestResult.resultHash // ← correct hash
    );

    expect(result.verdict).toBe(Verdict.PASS);
  });

  it('verdict = FAIL when a checkpoint has been tampered with', () => {
    const params = { seed: SEED, iterations: 40, checkpointEvery: 10 };
    const honestResult = shaChainExecute(params);

    // Tamper with checkpoint index 2
    const tamperedCheckpoints = [...honestResult.checkpoints];
    tamperedCheckpoints[2] = '0x' + 'aa'.repeat(32);

    const spec = { type: 'sha-chain' as const, params };
    const policy = { samplingBps: 10_000 };

    const result = reexecute(
      spec,
      policy,
      Buffer.from(honestResult.finalHash.slice(2), 'hex'),
      tamperedCheckpoints,
      honestResult.resultHash
    );

    expect(result.verdict).toBe(Verdict.FAIL);
  });

  it('matmul verifier detects large error → FAIL', () => {
    const params = {
      seedA: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      seedB: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      size: 4,
      precision: 'float64' as const,
    };

    const { blob } = matmulExecute(params);

    // Corrupt one element
    const tampered = Buffer.from(blob);
    const view = new DataView(tampered.buffer, tampered.byteOffset);
    view.setFloat64(0, 999999.0, true);

    expect(matmulVerify(params, tampered)).toBe(false);
  });
});
