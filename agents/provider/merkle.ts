/**
 * provider/merkle.ts
 *
 * Compute a standard binary Merkle tree root from an array of leaf values.
 *
 * Algorithm (matches Solidity MerkleProof convention):
 *   1. Hash each leaf:  leafHash = keccak256(leaf)
 *   2. Sort each pair before hashing:  nodeHash = keccak256(sort(a, b))
 *   3. Carry up odd leaves unchanged.
 *   4. Repeat until one root remains.
 *
 * Leaves are hex strings (with or without 0x prefix).
 * Returns a 0x-prefixed bytes32 hex string.
 */

import { ethers } from 'ethers';

/**
 * Compute the Merkle root of a list of leaf values.
 *
 * @param leaves  Array of hex strings representing the leaf data.
 *                Each leaf is keccak256-hashed before being placed in the tree.
 * @returns  0x-prefixed bytes32 Merkle root.
 */
export function computeMerkleRoot(leaves: string[]): string {
  if (leaves.length === 0) {
    return ethers.ZeroHash;
  }

  if (leaves.length === 1) {
    return ethers.keccak256(
      leaves[0]!.startsWith('0x') ? leaves[0]! : '0x' + leaves[0]!
    );
  }

  // Layer 0: hash each leaf
  let layer: string[] = leaves.map((leaf) => {
    const hex = leaf.startsWith('0x') ? leaf : '0x' + leaf;
    return ethers.keccak256(hex);
  });

  // Build tree bottom-up
  while (layer.length > 1) {
    const next: string[] = [];

    for (let i = 0; i < layer.length; i += 2) {
      if (i + 1 < layer.length) {
        const a = layer[i]!;
        const b = layer[i + 1]!;
        // Sort so the tree is commutative (same as OpenZeppelin MerkleProof)
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        next.push(ethers.keccak256(ethers.concat([lo, hi])));
      } else {
        // Odd leaf: carry unchanged to the next layer
        next.push(layer[i]!);
      }
    }

    layer = next;
  }

  return layer[0]!;
}
