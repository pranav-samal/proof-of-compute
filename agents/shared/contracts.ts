/**
 * shared/contracts.ts
 *
 * Loads ABIs and addresses from contracts/deployments/<network>.json
 * and returns typed ethers v6 Contract instances for JobEscrow and ProviderRegistry.
 *
 * Address resolution order (first match wins):
 *   1. Explicit overrideAddress argument
 *   2. Environment variable (JOB_ESCROW_ADDRESS / PROVIDER_REGISTRY_ADDRESS)
 *   3. contracts/deployments/localhost.json  (or sepolia.json for chainId 11155111)
 *
 * The deployment file is searched relative to this source file, so the lookup
 * is correct regardless of which directory the agent process is started from.
 */

import { ethers } from 'ethers';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── Fallback ABIs (human-readable) ──────────────────────────────────────────
// Used when the deployment JSON has no "abi" field.
// Covers every function and event Member 3 needs.

export const MINIMAL_JOB_ESCROW_ABI = [
  // ── Events ──
  'event ProviderAssigned(uint256 indexed jobId, address indexed provider)',
  'event VerifiersSelected(uint256 indexed jobId, address[] verifiers, uint64 verifyDeadline)',
  'event ResultCommitted(uint256 indexed jobId, bytes32 resultHash, bytes32 checkpointRoot, string resultCid)',
  'event AttestationSubmitted(uint256 indexed jobId, address indexed verifier, uint8 verdict, bytes32 evidenceHash)',
  'event JobSettled(uint256 indexed jobId, uint8 outcome)',
  'event ReceiptIssued(uint256 indexed jobId, bytes32 policyHash, bytes32 resultHash, bytes32 attestationRoot, uint8 tier, uint8 outcome, uint64 settledAt)',
  'event PolicyRecorded(uint256 indexed jobId, bytes32 policyHash, uint8 tier, uint16 samplingBps, uint256 collateral, uint32 challengeWindow)',
  // ── Write functions ──
  'function commitResult(uint256 jobId, bytes32 resultHash, bytes32 checkpointRoot, string calldata resultCid) external',
  'function submitAttestation(uint256 jobId, uint8 verdict, bytes32 evidenceHash, bytes calldata signature) external',
  'function selectVerifiers(uint256 jobId) external',
  'function settle(uint256 jobId) external',
  'function claimTimeout(uint256 jobId) external',
  // ── View functions ──
  'function getJob(uint256 jobId) external view returns (tuple(address requester, address provider, string specCid, bytes32 profileHash, uint8 reproClass, uint8 assurance, uint64 deadline, uint256 payment, uint8 state, bytes32 policyHash, bytes32 resultHash, bytes32 checkpointRoot, string resultCid, uint64 commitBlock, uint8 outcome, uint64 verifyDeadline))',
  'function getPolicy(uint256 jobId) external view returns (tuple(uint8 tier, uint16 samplingBps, uint8 verifierCount, uint8 quorum, uint256 collateral, uint32 challengeWindow))',
  'function selectedVerifiers(uint256 jobId) external view returns (address[])',
  'function getAttestation(uint256 jobId, uint256 index) external view returns (address verifier, uint8 verdict, bytes32 evidenceHash)',
  'function getReceipt(uint256 jobId) external view returns (tuple(uint256 jobId, string specCid, bytes32 policyHash, address provider, address requester, bytes32 resultHash, bytes32 attestationRoot, uint8 tier, uint8 outcome, uint64 settledAt))',
];

export const MINIMAL_PROVIDER_REGISTRY_ABI = [
  'event ProviderSlashed(address indexed provider, uint256 amount, address recipient)',
  'event VerifierSlashed(address indexed verifier, uint256 amount)',
  'function isEligibleVerifier(address v) external view returns (bool)',
  'function verifierBond(address verifier) external view returns (uint256)',
  'function verifierCount() external view returns (uint256)',
  'function verifierAt(uint256 index) external view returns (address)',
  'function reputationBps(address provider) external view returns (uint16)',
  'function freeStake(address provider) external view returns (uint256)',
  'function totalStake(address provider) external view returns (uint256)',
];

// ─── Deployment file loader ───────────────────────────────────────────────────

interface DeploymentEntry {
  address: string;
  abi?: unknown[];
}

interface DeploymentFile {
  chainId?: number;
  network?: string;
  contracts: {
    JobEscrow?: DeploymentEntry;
    ProviderRegistry?: DeploymentEntry;
    VerificationPolicy?: DeploymentEntry;
  };
}

/** Absolute path to the repo root (two levels up from agents/shared/). */
function repoRoot(): string {
  // In ESM, __dirname is not available; derive it from import.meta.url.
  // Fallback to process.cwd() when running under ts-node or vitest.
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    // __dirname = <repo>/agents/shared  →  go up two levels
    return resolve(__dirname, '..', '..');
  } catch {
    // Fallback: assume cwd is the agents/ folder
    return resolve(process.cwd(), '..');
  }
}

function networkName(chainId: number): string {
  return chainId === 11155111 ? 'sepolia' : 'localhost';
}

function findDeploymentFile(chainId: number): string | null {
  const root = repoRoot();
  const name = networkName(chainId);

  const candidates = [
    resolve(root, 'contracts', 'deployments', `${name}.json`),
    resolve(root, 'contracts', 'deployments', 'localhost.json'),
    // Also try relative to cwd for environments where repo root detection fails
    resolve(process.cwd(), '..', 'contracts', 'deployments', `${name}.json`),
    resolve(process.cwd(), '..', 'contracts', 'deployments', 'localhost.json'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

let _deploymentCache: DeploymentFile | null | undefined = undefined;

function loadDeployment(chainId: number): DeploymentFile | null {
  if (_deploymentCache !== undefined) return _deploymentCache;
  const path = findDeploymentFile(chainId);
  if (!path) {
    console.warn(
      `[contracts] contracts/deployments/${networkName(chainId)}.json not found. ` +
      'Set JOB_ESCROW_ADDRESS and PROVIDER_REGISTRY_ADDRESS in .env as a fallback.'
    );
    _deploymentCache = null;
    return null;
  }
  try {
    _deploymentCache = JSON.parse(readFileSync(path, 'utf8')) as DeploymentFile;
    console.log(`[contracts] Loaded deployment from ${path}`);
    return _deploymentCache;
  } catch (err) {
    console.warn(`[contracts] Failed to parse ${path}:`, err);
    _deploymentCache = null;
    return null;
  }
}

// ─── Contract factory helpers ─────────────────────────────────────────────────

function resolveContract(
  name: 'JobEscrow' | 'ProviderRegistry',
  envVar: string,
  fallbackAbi: unknown[],
  chainId: number,
  overrideAddress?: string
): { address: string; abi: unknown[] } {
  // 1. Explicit override
  if (overrideAddress) {
    return { address: overrideAddress, abi: fallbackAbi };
  }

  // 2. Environment variable
  const envAddress = process.env[envVar];

  // 3. Deployment file
  const deployment = loadDeployment(chainId);
  const entry = deployment?.contracts?.[name];

  const address = envAddress?.trim() || entry?.address;
  if (!address) {
    throw new Error(
      `${name} address not found. Either:\n` +
      `  • Set ${envVar} in agents/.env, or\n` +
      `  • Ensure contracts/deployments/${networkName(chainId)}.json exists (Member 1 deploys this).`
    );
  }

  // Prefer ABI from the deployment file when available (most complete)
  const abi = (entry?.abi && entry.abi.length > 0) ? entry.abi : fallbackAbi;
  return { address, abi };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a JobEscrow Contract instance connected to `signer`.
 *
 * @param signer          Wallet or provider-connected signer
 * @param chainId         Chain ID (default 31337 — Hardhat local)
 * @param overrideAddress Bypass env + deployment file lookup
 */
export function getJobEscrow(
  signer: ethers.Signer,
  chainId: number = 31337,
  overrideAddress?: string
): ethers.Contract {
  const { address, abi } = resolveContract(
    'JobEscrow',
    'JOB_ESCROW_ADDRESS',
    MINIMAL_JOB_ESCROW_ABI,
    chainId,
    overrideAddress
  );
  return new ethers.Contract(address, abi as ethers.InterfaceAbi, signer);
}

/**
 * Returns a ProviderRegistry Contract instance connected to `signer`.
 */
export function getProviderRegistry(
  signer: ethers.Signer,
  chainId: number = 31337,
  overrideAddress?: string
): ethers.Contract {
  const { address, abi } = resolveContract(
    'ProviderRegistry',
    'PROVIDER_REGISTRY_ADDRESS',
    MINIMAL_PROVIDER_REGISTRY_ABI,
    chainId,
    overrideAddress
  );
  return new ethers.Contract(address, abi as ethers.InterfaceAbi, signer);
}
