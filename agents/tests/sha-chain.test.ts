/**
 * tests/sha-chain.test.ts
 *
 * Tests for the sha-chain workload executor (task §8, items 1–3).
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { execute, verifySegment, selectSegmentIndices } from '../jobs/sha-chain.js';
import { ethers } from 'ethers';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** SHA-256 a hex string, returns hex string without 0x. */
function sha256hex(hex: string): string {
  const buf = Buffer.from(hex.startsWith('0x') ? hex.slice(2) : hex, 'hex');
  return createHash('sha256').update(buf).digest('hex');
}

// Known seed for deterministic tests
const SEED = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

// ─── Test 1: execute with known seed produces expected final hash ─────────────

describe('sha-chain.execute', () => {
  it('produces a deterministic final hash for known inputs (N=100, M=10)', () => {
    const params = { seed: SEED, iterations: 100, checkpointEvery: 10 };
    const result = execute(params);

    // Recompute independently to verify
    let state = Buffer.from(SEED.slice(2), 'hex');
    for (let i = 0; i < 100; i++) {
      state = Buffer.from(sha256hex('0x' + state.toString('hex')), 'hex');
    }
    const expectedFinalHash = '0x' + state.toString('hex');
    const expectedResultHash = ethers.keccak256(state);

    expect(result.finalHash.toLowerCase()).toBe(expectedFinalHash.toLowerCase());
    expect(result.resultHash.toLowerCase()).toBe(expectedResultHash.toLowerCase());
  });

  it('records checkpoints at every M iterations plus initial seed', () => {
    const params = { seed: SEED, iterations: 50, checkpointEvery: 10 };
    const result = execute(params);

    // Checkpoints: index 0 (seed), 10, 20, 30, 40, 50 → 6 total
    expect(result.checkpoints.length).toBe(6);
  });

  it('produces the same result when run twice (deterministic)', () => {
    const params = { seed: SEED, iterations: 20, checkpointEvery: 5 };
    const r1 = execute(params);
    const r2 = execute(params);
    expect(r1.finalHash).toBe(r2.finalHash);
    expect(r1.resultHash).toBe(r2.resultHash);
    expect(r1.merkleRoot).toBe(r2.merkleRoot);
  });

  it('throws for zero iterations', () => {
    expect(() => execute({ seed: SEED, iterations: 0, checkpointEvery: 1 })).toThrow();
  });

  it('throws for bad seed length', () => {
    expect(() => execute({ seed: '0xdeadbeef', iterations: 1, checkpointEvery: 1 })).toThrow();
  });
});

// ─── Test 2: verifySegment returns true for a correct segment ─────────────────

describe('sha-chain.verifySegment', () => {
  it('returns true for a correct segment (test 2)', () => {
    const params = { seed: SEED, iterations: 30, checkpointEvery: 10 };
    const { checkpoints } = execute(params);

    // Segment 0: checkpoints[0] → checkpoints[1]
    const ok = verifySegment(params, checkpoints[0]!, checkpoints[1]!, 0);
    expect(ok).toBe(true);
  });

  it('returns true for all segments in a known result', () => {
    const params = { seed: SEED, iterations: 40, checkpointEvery: 10 };
    const { checkpoints } = execute(params);

    for (let i = 0; i < checkpoints.length - 1; i++) {
      expect(verifySegment(params, checkpoints[i]!, checkpoints[i + 1]!, i)).toBe(true);
    }
  });

  // ── Test 3: verifySegment returns false for a corrupted segment ─────────────

  it('returns false for a corrupted segment (test 3)', () => {
    const params = { seed: SEED, iterations: 30, checkpointEvery: 10 };
    const { checkpoints } = execute(params);

    // Corrupt the end checkpoint of segment 0
    const corruptEnd = '0x' + '00'.repeat(32);
    const bad = verifySegment(params, checkpoints[0]!, corruptEnd, 0);
    expect(bad).toBe(false);
  });

  it('returns false when start checkpoint is wrong', () => {
    const params = { seed: SEED, iterations: 30, checkpointEvery: 10 };
    const { checkpoints } = execute(params);

    const corruptStart = '0x' + 'ff'.repeat(32);
    const bad = verifySegment(params, corruptStart, checkpoints[1]!, 0);
    expect(bad).toBe(false);
  });
});

// ─── selectSegmentIndices ─────────────────────────────────────────────────────

describe('sha-chain.selectSegmentIndices', () => {
  it('returns indices within [0, segmentCount)', () => {
    const indices = selectSegmentIndices(SEED, 10, 3);
    expect(indices.length).toBeGreaterThan(0);
    for (const idx of indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(10);
    }
  });

  it('returns at most segmentCount unique indices', () => {
    const indices = selectSegmentIndices(SEED, 5, 10);
    expect(indices.length).toBeLessThanOrEqual(5);
    expect(new Set(indices).size).toBe(indices.length);
  });
});
