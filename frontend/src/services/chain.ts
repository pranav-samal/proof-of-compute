/**
 * chain.ts — Typed interface for all on-chain interactions.
 * Uses ethers v6 internally. Mock implementation is active when
 * VITE_USE_MOCK=true or no wallet is connected.
 *
 * IMPORTANT: No real contract functions are defined here yet.
 * Every stub is marked TODO and returns illustrative data.
 */
import type { VerificationPolicy, SettlementOutcome, Attestation } from '../types';

// ─── Interface ────────────────────────────────────────────────────────────

export interface ChainService {
  /**
   * Register a job on-chain and lock escrow.
   * TODO: implement when contract ABI is available.
   * @returns tx hash
   */
  registerJobOnChain(
    jobId: string,
    policy: VerificationPolicy,
    escrowEth: number,
  ): Promise<string>;

  /**
   * Provider commits a result hash.
   * TODO: implement when contract ABI is available.
   */
  commitResult(jobId: string, resultHash: string): Promise<string>;

  /**
   * Verifier submits an attestation.
   * TODO: implement when contract ABI is available.
   */
  submitAttestation(jobId: string, verdict: Attestation['verdict']): Promise<string>;

  /**
   * Query settlement outcome for a job.
   * TODO: implement when contract ABI is available.
   */
  getSettlement(jobId: string): Promise<SettlementOutcome | null>;

  /**
   * Provider deposits stake.
   * TODO: implement when contract ABI is available.
   */
  depositStake(amountEth: number): Promise<string>;

  /**
   * Provider withdraws free (unlocked) stake.
   * TODO: implement when contract ABI is available.
   */
  withdrawStake(amountEth: number): Promise<string>;

  /** Check if a contract address is configured. */
  isContractConfigured(): boolean;
}

// ─── Mock implementation ──────────────────────────────────────────────────

const mockChain: ChainService = {
  registerJobOnChain: async (_jobId, _policy, _escrowEth) => {
    // TODO: call ProofOfCompute.registerJob(jobId, policyHash, {value: escrowEth})
    return '0x' + Math.random().toString(16).slice(2, 66);
  },

  commitResult: async (_jobId, _resultHash) => {
    // TODO: call ProofOfCompute.commitResult(jobId, resultHash)
    return '0x' + Math.random().toString(16).slice(2, 66);
  },

  submitAttestation: async (_jobId, _verdict) => {
    // TODO: call ProofOfCompute.submitAttestation(jobId, verdict)
    return '0x' + Math.random().toString(16).slice(2, 66);
  },

  getSettlement: async (_jobId) => {
    // TODO: query ProofOfCompute.getSettlement(jobId)
    return null;
  },

  depositStake: async (_amountEth) => {
    // TODO: call ProofOfCompute.depositStake({value: amountEth})
    return '0x' + Math.random().toString(16).slice(2, 66);
  },

  withdrawStake: async (_amountEth) => {
    // TODO: call ProofOfCompute.withdrawStake(amountEth)
    return '0x' + Math.random().toString(16).slice(2, 66);
  },

  isContractConfigured: () => false, // no contract deployed yet
};

// ─── Export selected adapter ──────────────────────────────────────────────

const useMock = import.meta.env.VITE_USE_MOCK !== 'false';
export const chain: ChainService = useMock ? mockChain : ((() => { throw new Error('Real chain not configured'); })());
