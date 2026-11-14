/**
 * verifier/submit.ts
 *
 * Call JobEscrow.submitAttestation on-chain with the signed EIP-712 attestation.
 */

import { ethers } from 'ethers';
import type { SignedAttestation } from './attest.js';

/**
 * Submit a signed attestation to the JobEscrow contract.
 *
 * @param escrow     Ethers Contract instance of JobEscrow
 * @param signed     The signed attestation (from attest.signAttestation)
 * @returns          Transaction hash
 */
export async function submitAttestation(
  escrow: ethers.Contract,
  signed: SignedAttestation
): Promise<string> {
  const { jobId, verdict, evidenceHash, signature } = signed;

  console.log(`[submit] Calling submitAttestation for jobId=${jobId}`);
  console.log(`[submit]   verdict      = ${verdict}`);
  console.log(`[submit]   evidenceHash = ${evidenceHash}`);
  console.log(`[submit]   signer       = ${signed.signerAddress}`);

  const tx = await escrow.submitAttestation(jobId, verdict, evidenceHash, signature);
  const receipt = await tx.wait();

  const txHash: string = receipt?.hash ?? (tx as { hash: string }).hash;
  console.log(`[submit] submitAttestation mined: txHash=${txHash}`);
  return txHash;
}
