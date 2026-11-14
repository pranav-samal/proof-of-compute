/**
 * shared/contracts.ts
 *
 * Loads ABIs from contracts/deployments/<network>.json and returns
 * typed ethers v6 Contract instances.
 *
 * The file is optional at startup — if the deployment file doesn't exist yet
 * (Member 1 hasn't deployed), functions return null so the agent can boot
 * and report a clear error only when it actually tries to call the contract.
 */

import { ethers } from 'ethers';
import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';

// ─── Minimal ABIs ────────────────────────────────────────────────────────────
// These cover only the functions and events Member 3 needs.
// When Member 1 ships the full ABI, replace MINIMAL_JOB_ESCROW_ABI with the
// full artifact from contracts/deployments/localhost.json.

export const MINIMAL_JOB_ESCROW_ABI = [
  // Events
  'event ProviderAssigned(uint256 indexed jobId, address indexed provider)',
  'event VerifiersSelected(uint256 indexed jobId, address[] verifiers, uint64 verifyDeadline)',
  'event ResultCommitted(uint256 indexed jobId, bytes32 resultHash, bytes32 checkpointRoot, string resultCid)',
  'event AttestationSubmitted(uint256 indexed jobId, address indexed verifier, uint8 verdict, bytes32 evidenceHash)',
  'event JobSettled(uint256 indexed jobId, uint8 outcome)',
  'event ReceiptIssued(uint256 indexed jobId, bytes32 policyHash, bytes32 resultHash, bytes32 attestationRoot, uint8 tier, uint8 outcome, uint64 settledAt)',
  'event PolicyRecorded(uint256 indexed jobId, bytes32 policyHash, uint8 tier, uint16 samplingBps, uint256 collateral, uint32 challengeWindow)',

  // Provider
  'function commitResult(uint256 jobId, bytes32 resultHash, bytes32 checkpointRoot, string calldata resultCid) external',

  // Verifier
  'function submitAttestation(uint256 jobId, uint8 verdict, bytes32 evidenceHash, bytes calldata signature) external',

  // Views
  'function getJob(uint256 jobId) external view returns (tuple(address requester, address provider, string specCid, bytes32 profileHash, uint8 reproClass, uint8 assurance, uint64 deadline, uint256 payment, uint8 state, bytes32 policyHash, bytes32 resultHash, bytes32 checkpointRoot, string resultCid, uint64 commitBlock, uint8 outcome, uint64 verifyDeadline))',
  'function getPolicy(uint256 jobId) external view returns (tuple(uint8 tier, uint16 samplingBps, uint8 verifierCount, uint8 quorum, uint256 collateral, uint32 challengeWindow))',
  'function selectedVerifiers(uint256 jobId) external view returns (address[])',
  'function getAttestation(uint256 jobId, uint256 index) external view returns (address verifier, uint8 verdict, bytes32 evidenceHash)',
  'function getReceipt(uint256 jobId) external view returns (tuple(uint256 jobId, string specCid, bytes32 policyHash, address provider, address requester, bytes32 resultHash, bytes32 attestationRoot, uint8 tier, uint8 outcome, uint64 settledAt))',
];

export const MINIMAL_PROVIDER_REGISTRY_ABI = [
  'function isEligibleVerifier(address v) external view returns (bool)',
  'function verifierBond(address verifier) external view returns (uint256)',
  'function verifierCount() external view returns (uint256)',
  'function verifierAt(uint256 index) external view returns (address)',
  'function reputationBps(address provider) external view returns (uint16)',
  'event ProviderSlashed(address indexed provider, uint256 amount, address recipient)',
  'event VerifierSlashed(address indexed verifier, uint256 amount)',
];

// ─── Deployment loader ───────────────────────────────────────────────────────

interface DeploymentEntry {
  address: string;
  abi?: unknown[];
}

interface DeploymentFile {
  chainId: number;
  contracts: {
    JobEscrow?: DeploymentEntry;
    ProviderRegistry?: DeploymentEntry;
    VerificationPolicy?: DeploymentEntry;
  };
}

function findDeploymentFile(chainId: number): string | null {
  // Walk up from __dirname to find the contracts/deployments directory
  const candidates = [
    resolve(process.cwd(), `../contracts/deployments/${chainId === 31337 ? 'localhost' : 'sepolia'}.json`),
    resolve(process.cwd(), `contracts/deployments/${chainId === 31337 ? 'localhost' : 'sepolia'}.json`),
    resolve(process.cwd(), `../contracts/deployments/localhost.json`),
    resolve(process.cwd(), `contracts/deployments/localhost.json`),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function loadDeployment(chainId: number): DeploymentFile | null {
  const path = findDeploymentFile(chainId);
  if (!path) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as DeploymentFile;
  } catch {
    return null;
  }
}

// ─── Contract factories ───────────────────────────────────────────────────────

/**
 * Returns a JobEscrow contract instance connected to the given signer.
 * Uses ABI from deployment file if available, falls back to minimal ABI.
 */
export function getJobEscrow(
  signer: ethers.Signer,
  chainId: number = 31337,
  overrideAddress?: string
): ethers.Contract {
  let address = overrideAddress ?? process.env['JOB_ESCROW_ADDRESS'];
  let abi: unknown[] = MINIMAL_JOB_ESCROW_ABI;

  if (!address) {
    const deployment = loadDeployment(chainId);
    if (deployment?.contracts?.JobEscrow) {
      address = deployment.contracts.JobEscrow.address;
      if (deployment.contracts.JobEscrow.abi) {
        abi = deployment.contracts.JobEscrow.abi;
      }
    }
  }

  if (!address) {
    throw new Error(
      'JobEscrow address not found. Set JOB_ESCROW_ADDRESS in .env or ensure contracts/deployments/<network>.json exists.'
    );
  }

  return new ethers.Contract(address, abi as ethers.InterfaceAbi, signer);
}

/**
 * Returns a ProviderRegistry contract instance connected to the given signer.
 */
export function getProviderRegistry(
  signer: ethers.Signer,
  chainId: number = 31337,
  overrideAddress?: string
): ethers.Contract {
  let address = overrideAddress ?? process.env['PROVIDER_REGISTRY_ADDRESS'];
  let abi: unknown[] = MINIMAL_PROVIDER_REGISTRY_ABI;

  if (!address) {
    const deployment = loadDeployment(chainId);
    if (deployment?.contracts?.ProviderRegistry) {
      address = deployment.contracts.ProviderRegistry.address;
      if (deployment.contracts.ProviderRegistry.abi) {
        abi = deployment.contracts.ProviderRegistry.abi;
      }
    }
  }

  if (!address) {
    throw new Error(
      'ProviderRegistry address not found. Set PROVIDER_REGISTRY_ADDRESS in .env or ensure contracts/deployments/<network>.json exists.'
    );
  }

  return new ethers.Contract(address, abi as ethers.InterfaceAbi, signer);
}
