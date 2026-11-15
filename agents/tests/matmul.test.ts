/**
 * tests/matmul.test.ts
 *
 * Tests for the matmul workload executor (task §8, items 4–6).
 */

import { describe, it, expect } from 'vitest';
import { execute, verify } from '../jobs/matmul.js';

const SEED_A = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SEED_B = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

// ─── Test 4: execute produces deterministic result ────────────────────────────

describe('matmul.execute', () => {
  it('produces a deterministic result hash for known seeds (test 4)', () => {
    const params = { seedA: SEED_A, seedB: SEED_B, size: 8, precision: 'float64' as const };
    const r1 = execute(params);
    const r2 = execute(params);

    expect(r1.resultHash).toBe(r2.resultHash);
    expect(r1.blob.length).toBe(8 * 8 * 8); // 8×8 float64 = 512 bytes
  });

  it('produces different hashes for different seeds', () => {
    const p1 = { seedA: SEED_A, seedB: SEED_B, size: 4, precision: 'float64' as const };
    const p2 = { seedA: SEED_B, seedB: SEED_A, size: 4, precision: 'float64' as const };
    expect(execute(p1).resultHash).not.toBe(execute(p2).resultHash);
  });

  it('float32 blob is half the size of float64', () => {
    const params32 = { seedA: SEED_A, seedB: SEED_B, size: 4, precision: 'float32' as const };
    const params64 = { seedA: SEED_A, seedB: SEED_B, size: 4, precision: 'float64' as const };
    const r32 = execute(params32);
    const r64 = execute(params64);
    expect(r32.blob.length).toBe(4 * 4 * 4);   // 4×4 float32 = 64 bytes
    expect(r64.blob.length).toBe(4 * 4 * 8);   // 4×4 float64 = 128 bytes
  });
});

// ─── Test 5: verify returns true within tolerance ─────────────────────────────

describe('matmul.verify', () => {
  it('returns true for the exact result blob (test 5)', () => {
    const params = { seedA: SEED_A, seedB: SEED_B, size: 8, precision: 'float64' as const };
    const { blob } = execute(params);
    expect(verify(params, blob)).toBe(true);
  });

  it('returns true for float32 within tolerance', () => {
    const params = { seedA: SEED_A, seedB: SEED_B, size: 8, precision: 'float32' as const };
    const { blob } = execute(params);
    expect(verify(params, blob)).toBe(true);
  });

  // ── Test 6: verify returns false when result differs by more than 1e-6 ──────

  it('returns false when result differs by more than 1e-6 (test 6)', () => {
    const params = { seedA: SEED_A, seedB: SEED_B, size: 4, precision: 'float64' as const };
    const { blob } = execute(params);

    // Corrupt one element by adding a large value
    const tampered = Buffer.from(blob);
    const view = new DataView(tampered.buffer, tampered.byteOffset, tampered.byteLength);
    const original = view.getFloat64(0, true);
    view.setFloat64(0, original + 1.0, true); // +1.0 — far outside 1e-6 tolerance

    expect(verify(params, tampered)).toBe(false);
  });

  it('returns false when result blob has wrong size', () => {
    const params = { seedA: SEED_A, seedB: SEED_B, size: 4, precision: 'float64' as const };
    const tooShort = Buffer.alloc(10);
    expect(verify(params, tooShort)).toBe(false);
  });
});
