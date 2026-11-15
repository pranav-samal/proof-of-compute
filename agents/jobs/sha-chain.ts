/**
 * jobs/sha-chain.ts
 *
 * sha-chain workload executor (Reproducibility class D — deterministic).
 *
 * Spec §7.2:
 *   Iterate SHA-256 starting from `seed`, N times.
 *   Record state every M iterations as a checkpoint.
 *   resultHash = keccak256(finalState)   [hex bytes32]
 *   checkpointRoot = merkleRoot over checkpoint hashes
 */

import { createHash } from 'crypto';
import { ethers } from 'ethers';

export interface ShaChainParams {
  seed: string;          // hex string, 32 bytes (with or without 0x prefix)
  iterations: number;    // N
  checkpointEvery: number; // M
}

export interface ShaChainResult {
  finalHash: string;     // hex string — the last SHA-256 state (raw, not keccak)
  resultHash: string;    // 0x-prefixed bytes32 — keccak256(finalHash bytes)
  checkpoints: string[]; // hex strings, one per M iterations
  merkleRoot: string;    // 0x-prefixed bytes32 — Merkle root of checkpoint hashes
}

/** Strip leading 0x and return a Buffer of exactly 32 bytes. */
function seedToBuffer(seed: string): Buffer {
  const hex = seed.startsWith('0x') ? seed.slice(2) : seed;
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) {
    throw new Error(`seed must be 32 bytes, got ${buf.length}`);
  }
  return buf;
}

/** SHA-256 of a buffer, returns Buffer. */
function sha256(input: Buffer): Buffer {
  return createHash('sha256').update(input).digest();
}

/**
 * Run the sha-chain workload.
 *
 * Returns the final SHA-256 state (as finalHash), the keccak256 of that
 * state (as resultHash to commit on-chain), and all checkpoints.
 */
export function execute(params: ShaChainParams): ShaChainResult {
  const { seed, iterations, checkpointEvery } = params;

  if (iterations <= 0) throw new Error('iterations must be > 0');
  if (checkpointEvery <= 0) throw new Error('checkpointEvery must be > 0');

  let state = seedToBuffer(seed);
  const checkpoints: string[] = [];

  // Checkpoint 0 is the initial seed
  checkpoints.push('0x' + state.toString('hex'));

  for (let i = 1; i <= iterations; i++) {
    state = sha256(state);
    if (i % checkpointEvery === 0) {
      checkpoints.push('0x' + state.toString('hex'));
    }
  }

  const finalHash = '0x' + state.toString('hex');

  // resultHash = keccak256 of the final state bytes (what we commit on-chain)
  const resultHash = ethers.keccak256(state);

  // Merkle root of checkpoints (import from merkle.ts would cause a circular dep,
  // so we inline the same logic here and also expose computeMerkleRoot from merkle.ts)
  const merkleRoot = computeMerkleRootLocal(checkpoints);

  return { finalHash, resultHash, checkpoints, merkleRoot };
}

/** Inline Merkle root so this file has no circular dependency. */
function computeMerkleRootLocal(leaves: string[]): string {
  if (leaves.length === 0) return ethers.ZeroHash;
  if (leaves.length === 1) return ethers.keccak256(leaves[0]!);

  // Hash each leaf
  let layer: string[] = leaves.map((l) => ethers.keccak256(l));

  while (layer.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      if (i + 1 < layer.length) {
        // Sort pair so the tree is order-independent (standard Merkle convention)
        const a = layer[i]!;
        const b = layer[i + 1]!;
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        next.push(ethers.keccak256(ethers.concat([lo, hi])));
      } else {
        // Odd leaf: carry it up unchanged
        next.push(layer[i]!);
      }
    }
    layer = next;
  }

  return layer[0]!;
}

/**
 * Verify a single segment of the sha-chain.
 *
 * A segment spans from checkpoint[segmentIndex] to checkpoint[segmentIndex + 1].
 * The verifier recomputes the SHA-256 chain for `checkpointEvery` steps starting
 * from startCheckpoint and checks that it arrives at endCheckpoint.
 *
 * @param params           Full job params (we need checkpointEvery and seed for sampling)
 * @param startCheckpoint  Hex string — the checkpoint at the start of this segment
 * @param endCheckpoint    Hex string — the expected checkpoint at the end
 * @param segmentIndex     Which segment (0-based index into the checkpoint array)
 * @returns true if the segment is correct, false if it has been tampered with
 */
export function verifySegment(
  params: ShaChainParams,
  startCheckpoint: string,
  endCheckpoint: string,
  segmentIndex: number
): boolean {
  const { checkpointEvery } = params;
  void segmentIndex; // used by caller for sampling selection, not needed here

  let state = Buffer.from(
    startCheckpoint.startsWith('0x') ? startCheckpoint.slice(2) : startCheckpoint,
    'hex'
  );

  for (let i = 0; i < checkpointEvery; i++) {
    state = sha256(state);
  }

  const recomputed = '0x' + state.toString('hex');
  const expected = endCheckpoint.startsWith('0x') ? endCheckpoint : '0x' + endCheckpoint;

  return recomputed.toLowerCase() === expected.toLowerCase();
}

/**
 * Select segment indices for verification using the SPEC §7.2 formula:
 *   segmentIndex = keccak256(abi.encode(seed, i)) % segmentCount
 *
 * @param seed         Original job seed (hex string)
 * @param segmentCount Number of segments (checkpoints.length - 1)
 * @param sampleCount  How many segments to sample
 */
export function selectSegmentIndices(
  seed: string,
  segmentCount: number,
  sampleCount: number
): number[] {
  const indices = new Set<number>();
  let i = 0;

  while (indices.size < Math.min(sampleCount, segmentCount)) {
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'uint256'],
      [seed.startsWith('0x') ? seed : '0x' + seed, BigInt(i)]
    );
    const hash = ethers.keccak256(encoded);
    const idx = Number(BigInt(hash) % BigInt(segmentCount));
    indices.add(idx);
    i++;
  }

  return Array.from(indices).sort((a, b) => a - b);
}
