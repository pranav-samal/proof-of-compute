/**
 * chain.ts — Typed interface for all on-chain interactions.
 * Uses ethers v6 internally. Mock implementation is active when
 * VITE_USE_MOCK=true or no wallet is connected.
 *
 * The ChainService interface matches the actual deployed contract ABI
 * (JobEscrow + ProviderRegistry) as defined in SPEC.md §5.3.
 */
import type { SettlementOutcome } from '../types';

// ─── Updated Interface (SPEC §5.3 / task §5) ─────────────────────────────

export interface ChainService {
  /** Register job on-chain: calls JobEscrow.registerJob with msg.value = paymentWei */
  registerJobOnChain(
    specCid: string,
    profileHash: string,
    reproClass: number,   // 0=D, 1=T, 2=N
    assurance: number,   // 0–3
    deadlineTs: number,   // unix timestamp
    paymentWei: bigint,
  ): Promise<{ txHash: string; jobId: string }>;

  /** Provider commits result hash and checkpoint root */
  commitResult(
    jobId: string,
    resultHash: string,
    checkpointRoot: string,
    resultCid: string,
  ): Promise<string>;   // tx hash

  /** Verifier submits attestation with EIP-712 signature */
  submitAttestation(
    jobId: string,
    verdict: 0 | 1 | 2,   // PASS=0, FAIL=1, INCONCLUSIVE=2
    evidenceHash: string,
    signature: string,
  ): Promise<string>;   // tx hash

  /** Query settlement outcome for a job */
  getSettlement(jobId: string): Promise<SettlementOutcome | null>;

  /** Provider deposits stake into ProviderRegistry (wei) */
  depositStake(amountWei: bigint): Promise<string>;

  /** Provider withdraws free (unlocked) stake (wei) */
  withdrawStake(amountWei: bigint): Promise<string>;

  /** Requester assigns a provider to a registered job */
  assignProvider(jobId: string, providerAddress: string): Promise<string>;

  /** Select verifiers for a committed job (anyone can call after commitBlock+1) */
  selectVerifiers(jobId: string): Promise<string>;

  /** Settle a job once quorum is reached (anyone can call) */
  settle(jobId: string): Promise<string>;

  /** Check if contract addresses are configured via env vars */
  isContractConfigured(): boolean;
}

// ─── Mock implementation ──────────────────────────────────────────────────
// Keeps the same external behaviour as before so existing mock paths work.

const mockChain: ChainService = {
  registerJobOnChain: async (_specCid, _profileHash, _reproClass, _assurance, _deadlineTs, _paymentWei) => {
    return {
      txHash: '0x' + Math.random().toString(16).slice(2, 66),
      jobId: String(Math.floor(Math.random() * 100000)),
    };
  },

  commitResult: async (_jobId, _resultHash, _checkpointRoot, _resultCid) => {
    return '0x' + Math.random().toString(16).slice(2, 66);
  },

  submitAttestation: async (_jobId, _verdict, _evidenceHash, _signature) => {
    return '0x' + Math.random().toString(16).slice(2, 66);
  },

  getSettlement: async (_jobId) => {
    return null;
  },

  depositStake: async (_amountWei) => {
    return '0x' + Math.random().toString(16).slice(2, 66);
  },

  withdrawStake: async (_amountWei) => {
    return '0x' + Math.random().toString(16).slice(2, 66);
  },

  assignProvider: async (_jobId, _providerAddress) => {
    return '0x' + Math.random().toString(16).slice(2, 66);
  },

  selectVerifiers: async (_jobId) => {
    return '0x' + Math.random().toString(16).slice(2, 66);
  },

  settle: async (_jobId) => {
    return '0x' + Math.random().toString(16).slice(2, 66);
  },

  isContractConfigured: () => false,
};

// ─── Real implementation ──────────────────────────────────────────────────

import { BrowserProvider, Contract, formatEther } from 'ethers';
import { parseEther } from 'ethers';

// Contract addresses come from env vars; ABI is embedded as fragments above.
// No runtime JSON import needed — the minimal ABI fragments cover all calls we make.

// Minimal ABI fragments — we only need the functions we call.
const JOB_ESCROW_ABI = [
  'function registerJob(string calldata specCid, bytes32 profileHash, uint8 reproClass, uint8 assurance, uint64 deadline) external payable returns (uint256 jobId)',
  'function assignProvider(uint256 jobId, address provider) external',
  'function commitResult(uint256 jobId, bytes32 resultHash, bytes32 checkpointRoot, string calldata resultCid) external',
  'function submitAttestation(uint256 jobId, uint8 verdict, bytes32 evidenceHash, bytes calldata signature) external',
  'function selectVerifiers(uint256 jobId) external',
  'function settle(uint256 jobId) external',
  'function getJob(uint256 jobId) external view returns (tuple(address requester, address provider, string specCid, bytes32 profileHash, uint8 reproClass, uint8 assurance, uint64 deadline, uint256 payment, uint8 state, bytes32 policyHash, bytes32 resultHash, bytes32 checkpointRoot, string resultCid, uint64 commitBlock, uint8 outcome, uint64 verifyDeadline))',
  // Event needed to extract jobId from registerJob receipt
  'event JobRegistered(uint256 indexed jobId, address indexed requester, string specCid, bytes32 profileHash, uint256 payment)',
];

const PROVIDER_REGISTRY_ABI = [
  'function depositStake() external payable',
  'function withdrawStake(uint256 amount) external',
  'function freeStake(address provider) external view returns (uint256)',
];

function mapOnChainOutcome(outcome: number): SettlementOutcome['status'] {
  // SPEC §3: NONE=0, ACCEPTED=1, REJECTED=2, INCONCLUSIVE=3
  if (outcome === 1) return 'released';
  if (outcome === 2) return 'slashed';
  if (outcome === 3) return 'held';
  return 'refunded';
}

async function getSigner() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ethereum = (window as any).ethereum;
  if (!ethereum) throw new Error('Wallet not connected');
  const provider = new BrowserProvider(ethereum);
  return provider.getSigner();
}

async function checkNetwork() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ethereum = (window as any).ethereum;
  if (!ethereum) throw new Error('Wallet not connected');
  const provider = new BrowserProvider(ethereum);
  const network = await provider.getNetwork();
  const expectedChainId = Number(import.meta.env.VITE_CHAIN_ID ?? '31337');
  if (Number(network.chainId) !== expectedChainId) {
    throw new Error(`Wrong network: connected to chainId ${network.chainId}, expected ${expectedChainId}`);
  }
}

function getJobEscrowAddress(): string {
  const addr = import.meta.env.VITE_CONTRACT_JOB_ESCROW;
  if (!addr) throw new Error('VITE_CONTRACT_JOB_ESCROW is not configured');
  return addr;
}

function getProviderRegistryAddress(): string {
  const addr = import.meta.env.VITE_CONTRACT_PROVIDER_REGISTRY;
  if (!addr) throw new Error('VITE_CONTRACT_PROVIDER_REGISTRY is not configured');
  return addr;
}

const realChain: ChainService = {
  isContractConfigured(): boolean {
    return !!(import.meta.env.VITE_CONTRACT_JOB_ESCROW);
  },

  async registerJobOnChain(
    specCid: string,
    profileHash: string,
    reproClass: number,
    assurance: number,
    deadlineTs: number,
    paymentWei: bigint,
  ): Promise<{ txHash: string; jobId: string }> {
    if (!this.isContractConfigured()) throw new Error('Wallet not connected');
    await checkNetwork();

    const signer = await getSigner();
    const escrow = new Contract(getJobEscrowAddress(), JOB_ESCROW_ABI, signer);

    // profileHash must be bytes32 — pad/truncate to 32 bytes if needed
    const profileHashBytes = profileHash.startsWith('0x')
      ? profileHash.padEnd(66, '0').slice(0, 66)
      : '0x' + profileHash.padEnd(64, '0').slice(0, 64);

    const tx = await escrow.registerJob(
      specCid,
      profileHashBytes,
      reproClass,
      assurance,
      BigInt(deadlineTs),
      { value: paymentWei },
    );
    const receipt = await tx.wait();

    // Extract jobId from JobRegistered event (topic[1] is indexed jobId)
    let jobId = '0';
    if (receipt?.logs) {
      for (const log of receipt.logs) {
        try {
          const parsed = escrow.interface.parseLog(log);
          if (parsed?.name === 'JobRegistered') {
            jobId = parsed.args[0].toString();
            break;
          }
        } catch {
          // not this contract's event
        }
      }
    }

    return { txHash: receipt?.hash ?? tx.hash, jobId };
  },

  async commitResult(
    jobId: string,
    resultHash: string,
    checkpointRoot: string,
    resultCid: string,
  ): Promise<string> {
    if (!this.isContractConfigured()) throw new Error('Wallet not connected');
    await checkNetwork();

    const signer = await getSigner();
    const escrow = new Contract(getJobEscrowAddress(), JOB_ESCROW_ABI, signer);

    const tx = await escrow.commitResult(
      BigInt(jobId),
      resultHash,
      checkpointRoot,
      resultCid,
    );
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  },

  async submitAttestation(
    jobId: string,
    verdict: 0 | 1 | 2,
    evidenceHash: string,
    signature: string,
  ): Promise<string> {
    if (!this.isContractConfigured()) throw new Error('Wallet not connected');
    await checkNetwork();

    const signer = await getSigner();
    const escrow = new Contract(getJobEscrowAddress(), JOB_ESCROW_ABI, signer);

    const tx = await escrow.submitAttestation(
      BigInt(jobId),
      verdict,
      evidenceHash,
      signature,
    );
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  },

  async getSettlement(jobId: string): Promise<SettlementOutcome | null> {
    if (!this.isContractConfigured()) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ethereum = (window as any).ethereum;
    if (!ethereum) return null;

    const provider = new BrowserProvider(ethereum);
    const escrow = new Contract(getJobEscrowAddress(), JOB_ESCROW_ABI, provider);

    try {
      const job = await escrow.getJob(BigInt(jobId));
      const outcome = Number(job.outcome);
      if (outcome === 0) return null; // NONE — not yet settled

      return {
        status: mapOnChainOutcome(outcome),
        amountEth: parseFloat(formatEther(job.payment)),
        note: `On-chain outcome: ${outcome}`,
      };
    } catch {
      return null;
    }
  },

  async depositStake(amountWei: bigint): Promise<string> {
    if (!this.isContractConfigured()) throw new Error('Wallet not connected');
    await checkNetwork();

    const signer = await getSigner();
    const registry = new Contract(getProviderRegistryAddress(), PROVIDER_REGISTRY_ABI, signer);

    const tx = await registry.depositStake({ value: amountWei });
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  },

  async withdrawStake(amountWei: bigint): Promise<string> {
    if (!this.isContractConfigured()) throw new Error('Wallet not connected');
    await checkNetwork();

    const signer = await getSigner();
    const registry = new Contract(getProviderRegistryAddress(), PROVIDER_REGISTRY_ABI, signer);

    const tx = await registry.withdrawStake(amountWei);
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  },

  async assignProvider(jobId: string, providerAddress: string): Promise<string> {
    if (!this.isContractConfigured()) throw new Error('Wallet not connected');
    await checkNetwork();

    const signer = await getSigner();
    const escrow = new Contract(getJobEscrowAddress(), JOB_ESCROW_ABI, signer);

    const tx = await escrow.assignProvider(BigInt(jobId), providerAddress);
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  },

  async selectVerifiers(jobId: string): Promise<string> {
    if (!this.isContractConfigured()) throw new Error('Wallet not connected');
    await checkNetwork();

    const signer = await getSigner();
    const escrow = new Contract(getJobEscrowAddress(), JOB_ESCROW_ABI, signer);

    const tx = await escrow.selectVerifiers(BigInt(jobId));
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  },

  async settle(jobId: string): Promise<string> {
    if (!this.isContractConfigured()) throw new Error('Wallet not connected');
    await checkNetwork();

    const signer = await getSigner();
    const escrow = new Contract(getJobEscrowAddress(), JOB_ESCROW_ABI, signer);

    const tx = await escrow.settle(BigInt(jobId));
    const receipt = await tx.wait();
    return receipt?.hash ?? tx.hash;
  },
};

// ─── Export selected adapter ──────────────────────────────────────────────

const useMock = import.meta.env.VITE_USE_MOCK !== 'false';
export { realChain };
export const chain: ChainService = useMock ? mockChain : realChain;

// Re-export parseEther helper so pages can convert ETH floats to wei without
// importing ethers directly (keeps the chain abstraction in one place)
export { parseEther, formatEther };
