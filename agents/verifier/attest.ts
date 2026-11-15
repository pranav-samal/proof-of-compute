/**
 * verifier/attest.ts
 *
 * Build and sign an EIP-712 Attestation for a verifier verdict.
 *
 * Domain (from SPEC.md §5.3):
 *   { name: "ProofOfCompute", version: "1", chainId, verifyingContract }
 *
 * Type:
 *   Attestation(uint256 jobId, bytes32 policyHash, bytes32 resultHash,
 *               uint8 verdict, bytes32 evidenceHash)
 *
 * Verdict values (SPEC §3):
 *   PASS = 0, FAIL = 1, INCONCLUSIVE = 2
 */

import { ethers } from 'ethers';

// ─── Verdict enum ─────────────────────────────────────────────────────────────

export const Verdict = {
  PASS: 0,
  FAIL: 1,
  INCONCLUSIVE: 2,
} as const;

export type VerdictValue = (typeof Verdict)[keyof typeof Verdict];

// ─── EIP-712 domain and types ─────────────────────────────────────────────────

const EIP712_DOMAIN_NAME = 'ProofOfCompute';
const EIP712_DOMAIN_VERSION = '1';

const ATTESTATION_TYPES = {
  Attestation: [
    { name: 'jobId',        type: 'uint256' },
    { name: 'policyHash',   type: 'bytes32' },
    { name: 'resultHash',   type: 'bytes32' },
    { name: 'verdict',      type: 'uint8'   },
    { name: 'evidenceHash', type: 'bytes32' },
  ],
};

export interface AttestationData {
  jobId: bigint;
  policyHash: string;    // 0x-prefixed bytes32
  resultHash: string;    // 0x-prefixed bytes32
  verdict: VerdictValue;
  evidenceHash: string;  // 0x-prefixed bytes32
}

export interface SignedAttestation extends AttestationData {
  signature: string;     // 0x-prefixed 65-byte hex
  signerAddress: string;
}

/**
 * Sign an EIP-712 Attestation using the verifier's wallet.
 *
 * @param wallet             ethers Wallet (must have a connected provider for chainId)
 * @param verifyingContract  Address of JobEscrow (the verifyingContract in the domain)
 * @param data               Attestation fields
 * @returns                  Signed attestation with signature and signer address
 */
export async function signAttestation(
  wallet: ethers.Wallet,
  verifyingContract: string,
  data: AttestationData
): Promise<SignedAttestation> {
  const provider = wallet.provider;
  if (!provider) throw new Error('Wallet must have a connected provider to read chainId');

  const network = await provider.getNetwork();
  const chainId = network.chainId;

  const domain: ethers.TypedDataDomain = {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId,
    verifyingContract,
  };

  // ethers v6 _signTypedData is replaced by signTypedData
  const signature = await wallet.signTypedData(domain, ATTESTATION_TYPES, {
    jobId: data.jobId,
    policyHash: data.policyHash,
    resultHash: data.resultHash,
    verdict: data.verdict,
    evidenceHash: data.evidenceHash,
  });

  const signerAddress = await wallet.getAddress();

  return {
    ...data,
    signature,
    signerAddress,
  };
}

/**
 * Recover the signer address from a signed attestation.
 * Useful for unit testing that the signature is valid.
 */
export function recoverSigner(
  verifyingContract: string,
  chainId: bigint,
  data: AttestationData,
  signature: string
): string {
  const domain: ethers.TypedDataDomain = {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId,
    verifyingContract,
  };

  return ethers.verifyTypedData(domain, ATTESTATION_TYPES, {
    jobId: data.jobId,
    policyHash: data.policyHash,
    resultHash: data.resultHash,
    verdict: data.verdict,
    evidenceHash: data.evidenceHash,
  }, signature);
}
