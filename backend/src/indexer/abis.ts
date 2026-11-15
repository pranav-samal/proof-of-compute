/**
 * abis.ts — loads contract addresses from Member 1's deployments file.
 *
 * We deliberately do NOT load the full ABI arrays here — they are ~1.8MB
 * and cause memory issues. The indexer uses minimal event fragment ABIs instead.
 *
 * Path: contracts/deployments/localhost.json  (chainId 31337)
 *       contracts/deployments/sepolia.json    (chainId 11155111)
 */
import fs from 'fs';
import path from 'path';
import { CHAIN_ID, PROVIDER_REGISTRY_ADDRESS, JOB_ESCROW_ADDRESS } from '../config';

// Resolve deployments file — 3 levels up from backend/src/indexer
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const networkName = CHAIN_ID === 11155111 ? 'sepolia' : 'localhost';
const DEPLOYMENTS_PATH = path.join(REPO_ROOT, 'contracts', 'deployments', `${networkName}.json`);

// Only load addresses, not full ABIs
interface AddressesOnly {
  ProviderRegistry: { address: string };
  VerificationPolicy: { address: string };
  JobEscrow: { address: string };
}

let _addresses: AddressesOnly | null = null;
let _loaded = false;

export function loadDeployment(): AddressesOnly | null {
  if (_loaded) return _addresses;
  _loaded = true;

  if (!fs.existsSync(DEPLOYMENTS_PATH)) {
    console.warn(`[indexer] Deployments file not found at ${DEPLOYMENTS_PATH} — indexer will not start`);
    return null;
  }

  try {
    const raw = fs.readFileSync(DEPLOYMENTS_PATH, 'utf-8');
    const full = JSON.parse(raw) as {
      ProviderRegistry: { address: string };
      VerificationPolicy: { address: string };
      JobEscrow: { address: string };
    };
    // Only keep addresses — discard the ABI arrays to save memory
    _addresses = {
      ProviderRegistry: { address: full.ProviderRegistry.address },
      VerificationPolicy: { address: full.VerificationPolicy.address },
      JobEscrow: { address: full.JobEscrow.address },
    };
    console.log(`[indexer] Loaded deployments from ${DEPLOYMENTS_PATH}`);
    return _addresses;
  } catch (err) {
    console.error('[indexer] Failed to parse deployments JSON:', err);
    return null;
  }
}

export function getJobEscrowAddress(): string {
  if (JOB_ESCROW_ADDRESS) return JOB_ESCROW_ADDRESS;
  return loadDeployment()?.JobEscrow.address ?? '';
}

export function getProviderRegistryAddress(): string {
  if (PROVIDER_REGISTRY_ADDRESS) return PROVIDER_REGISTRY_ADDRESS;
  return loadDeployment()?.ProviderRegistry.address ?? '';
}
