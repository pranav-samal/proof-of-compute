/**
 * provider/commit.ts
 *
 * Build and submit the commitResult transaction.
 *
 * AGENT_CHEAT_MODE=true: replaces the correct resultHash with random bytes
 * before calling commitResult.  This is used only to demonstrate the slashing
 * mechanism in the demo.  NEVER enable in production.
 */

import { ethers } from 'ethers';

export interface CommitParams {
  jobId: bigint;
  resultHash: string;      // 0x-prefixed bytes32
  checkpointRoot: string;  // 0x-prefixed bytes32
  resultCid: string;
}

/**
 * Returns the resultHash to actually submit on-chain.
 * If AGENT_CHEAT_MODE=true, replaces it with random bytes.
 */
export function buildResultHash(correctHash: string): string {
  const cheatMode = (process.env['AGENT_CHEAT_MODE'] ?? 'false').toLowerCase() === 'true';

  if (cheatMode) {
    // Generate a random 32-byte hash — guaranteed to be wrong
    const wrongHash = ethers.hexlify(ethers.randomBytes(32));
    console.warn(`[commit] ⚠  CHEAT MODE: replacing correct hash ${correctHash} with WRONG hash ${wrongHash}`);
    return wrongHash;
  }

  return correctHash;
}

/**
 * Call JobEscrow.commitResult on-chain.
 *
 * @param escrow   Ethers Contract instance of JobEscrow
 * @param params   Job ID, hashes, CID
 * @returns        Transaction hash
 */
export async function commitResult(
  escrow: ethers.Contract,
  params: CommitParams
): Promise<string> {
  const { jobId, checkpointRoot, resultCid } = params;

  // Apply cheat mode if enabled
  const resultHash = buildResultHash(params.resultHash);

  console.log(`[commit] Calling commitResult for jobId=${jobId}`);
  console.log(`[commit]   resultHash     = ${resultHash}`);
  console.log(`[commit]   checkpointRoot = ${checkpointRoot}`);
  console.log(`[commit]   resultCid      = ${resultCid}`);

  const tx = await escrow.commitResult(jobId, resultHash, checkpointRoot, resultCid);
  const receipt = await tx.wait();

  const txHash: string = receipt?.hash ?? (tx as { hash: string }).hash;
  console.log(`[commit] commitResult mined: txHash=${txHash}`);
  return txHash;
}
