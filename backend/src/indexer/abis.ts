/**
 * abis.ts — loads contract ABIs and addresses from Member 1's deployments file.
 *
 * Path: contracts/deployments/localhost.json  (chainId 31337)
 *       contracts/deployments/sepolia.json    (chainId 11155111)
 *
 * Falls back gracefully if the file doesn't exist so the server can still
 * start without contracts deployed.
 */
import fs from 'fs';
import path from 'path';
import { CHAIN_ID, PROVIDER_REGISTRY_ADDRESS, JOB_ESCROW_ADDRESS } from '../config';

// Resolve deployments file relative to repo root (two levels up from backend/src/indexer)
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const networkName = CHAIN_ID === 11155111 ? 'sepolia' : 'localhost';
const DEPLOYMENTS_PATH = path.join(REPO_ROOT, 'contracts', 'deployments', `${networkName}.json`);

export interface DeploymentJson {
  ProviderRegistry: { address: string; abi: unknown[] };
  VerificationPolicy: { address: string; abi: unknown[] };
  JobEscrow:          { address: string; abi: unknown[] };
}

let _deployment: DeploymentJson | null = null;

export function loadDeployment(): DeploymentJson | null {
  if (_deployment) return _deployment;

  if (!fs.existsSync(DEPLOYMENTS_PATH)) {
    console.warn(`[indexer] Deployments file not found at ${DEPLOYMENTS_PATH} — indexer will not start`);
    return null;
  }

  try {
    const raw = fs.readFileSync(DEPLOYMENTS_PATH, 'utf-8');
    _deployment = JSON.parse(raw) as DeploymentJson;
    console.log(`[indexer] Loaded deployments from ${DEPLOYMENTS_PATH}`);
    return _deployment;
  } catch (err) {
    console.error('[indexer] Failed to parse deployments JSON:', err);
    return null;
  }
}

/** Returns the JobEscrow address — env var takes priority over deployments file */
export function getJobEscrowAddress(): string {
  if (JOB_ESCROW_ADDRESS) return JOB_ESCROW_ADDRESS;
  return loadDeployment()?.JobEscrow.address ?? '';
}

/** Returns the ProviderRegistry address — env var takes priority */
export function getProviderRegistryAddress(): string {
  if (PROVIDER_REGISTRY_ADDRESS) return PROVIDER_REGISTRY_ADDRESS;
  return loadDeployment()?.ProviderRegistry.address ?? '';
}
