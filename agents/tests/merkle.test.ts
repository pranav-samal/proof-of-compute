/**
 * tests/merkle.test.ts
 *
 * Tests for the Merkle root computation (task §8, item 7).
 */

import { describe, it, expect } from 'vitest';
import { computeMerkleRoot } from '../provider/merkle.js';
import { ethers } from 'ethers';

describe('computeMerkleRoot', () => {
  // ── Test 7: produces expected root for a known leaf set ───────────────────

  it('single leaf: root = keccak256(leaf) (test 7a)', () => {
    const leaf = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
    const root = computeMerkleRoot([leaf]);
    const expected = ethers.keccak256(leaf);
    expect(root.toLowerCase()).toBe(expected.toLowerCase());
  });

  it('two leaves: root = keccak256(sort(h(a), h(b))) (test 7b)', () => {
    const a = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const b = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

    const ha = ethers.keccak256(a);
    const hb = ethers.keccak256(b);
    const [lo, hi] = ha <= hb ? [ha, hb] : [hb, ha];
    const expected = ethers.keccak256(ethers.concat([lo, hi]));

    const root = computeMerkleRoot([a, b]);
    expect(root.toLowerCase()).toBe(expected.toLowerCase());
  });

  it('empty leaves: returns ZeroHash', () => {
    expect(computeMerkleRoot([])).toBe(ethers.ZeroHash);
  });

  it('is deterministic — same leaves produce same root', () => {
    const leaves = [
      '0x1111111111111111111111111111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222222222222222222222222222',
      '0x3333333333333333333333333333333333333333333333333333333333333333',
      '0x4444444444444444444444444444444444444444444444444444444444444444',
    ];
    expect(computeMerkleRoot(leaves)).toBe(computeMerkleRoot(leaves));
  });

  it('odd number of leaves: last leaf is carried up', () => {
    const leaves = [
      '0x1111111111111111111111111111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222222222222222222222222222',
      '0x3333333333333333333333333333333333333333333333333333333333333333',
    ];
    const root = computeMerkleRoot(leaves);
    expect(root).toMatch(/^0x[0-9a-fA-F]{64}$/);
  });

  it('four leaves: produces a known root', () => {
    // Build the tree manually and compare
    const leaves = [
      '0x1111111111111111111111111111111111111111111111111111111111111111',
      '0x2222222222222222222222222222222222222222222222222222222222222222',
      '0x3333333333333333333333333333333333333333333333333333333333333333',
      '0x4444444444444444444444444444444444444444444444444444444444444444',
    ];

    // Level 0 (leaves hashed)
    const h = leaves.map((l) => ethers.keccak256(l));

    // Level 1
    const pair = (a: string, b: string) => {
      const [lo, hi] = a <= b ? [a, b] : [b, a];
      return ethers.keccak256(ethers.concat([lo, hi]));
    };

    const l1a = pair(h[0]!, h[1]!);
    const l1b = pair(h[2]!, h[3]!);

    // Level 2 (root)
    const expected = pair(l1a, l1b);

    expect(computeMerkleRoot(leaves).toLowerCase()).toBe(expected.toLowerCase());
  });
});
