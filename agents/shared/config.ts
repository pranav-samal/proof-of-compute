/**
 * shared/config.ts
 *
 * Reads and validates all required environment variables.
 * Throws at startup if any required variable is missing.
 */

export interface Config {
  rpcUrl: string;
  chainId: number;
  providerPrivateKey: string;
  verifierPrivateKey: string;
  providerRegistryAddress: string;
  jobEscrowAddress: string;
  backendUrl: string;
  ipfsGateway: string;
  containerRuntime: string;
  noDocker: boolean;
  agentCheatMode: boolean;
  maxJobDurationSeconds: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function optionalEnv(name: string, defaultValue: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : defaultValue;
}

function boolEnv(name: string, defaultValue: boolean): boolean {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value.trim().toLowerCase() === 'true';
}

function intEnv(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = parseInt(value.trim(), 10);
  if (isNaN(parsed)) return defaultValue;
  return parsed;
}

/** Load and validate configuration for the provider agent. */
export function loadProviderConfig(): Config {
  const missing: string[] = [];

  function safeRequire(name: string): string {
    const value = process.env[name];
    if (!value || value.trim() === '') {
      missing.push(name);
      return '';
    }
    return value.trim();
  }

  const config: Config = {
    rpcUrl: safeRequire('RPC_URL'),
    chainId: intEnv('CHAIN_ID', 31337),
    providerPrivateKey: safeRequire('PROVIDER_PRIVATE_KEY'),
    verifierPrivateKey: optionalEnv('VERIFIER_PRIVATE_KEY', ''),
    providerRegistryAddress: safeRequire('PROVIDER_REGISTRY_ADDRESS'),
    jobEscrowAddress: safeRequire('JOB_ESCROW_ADDRESS'),
    backendUrl: optionalEnv('BACKEND_URL', 'http://localhost:3001'),
    ipfsGateway: optionalEnv('IPFS_GATEWAY', 'https://gateway.pinata.cloud/ipfs/'),
    containerRuntime: optionalEnv('CONTAINER_RUNTIME', 'docker'),
    noDocker: boolEnv('NO_DOCKER', false),
    agentCheatMode: boolEnv('AGENT_CHEAT_MODE', false),
    maxJobDurationSeconds: intEnv('MAX_JOB_DURATION_SECONDS', 300),
  };

  if (missing.length > 0) {
    throw new Error(
      `Provider agent cannot start. Missing required environment variables:\n  ${missing.join('\n  ')}\n\nCopy agents/.env.example to agents/.env and fill in the values.`
    );
  }

  if (config.agentCheatMode) {
    console.warn('');
    console.warn('╔══════════════════════════════════════════════════╗');
    console.warn('║          ⚠  [CHEAT MODE ACTIVE]  ⚠               ║');
    console.warn('║  Provider will submit a WRONG result hash.        ║');
    console.warn('║  This triggers slashing. NEVER use in production. ║');
    console.warn('╚══════════════════════════════════════════════════╝');
    console.warn('');
  }

  return config;
}

/** Load and validate configuration for the verifier service. */
export function loadVerifierConfig(): Config {
  const missing: string[] = [];

  function safeRequire(name: string): string {
    const value = process.env[name];
    if (!value || value.trim() === '') {
      missing.push(name);
      return '';
    }
    return value.trim();
  }

  const config: Config = {
    rpcUrl: safeRequire('RPC_URL'),
    chainId: intEnv('CHAIN_ID', 31337),
    providerPrivateKey: optionalEnv('PROVIDER_PRIVATE_KEY', ''),
    verifierPrivateKey: safeRequire('VERIFIER_PRIVATE_KEY'),
    providerRegistryAddress: safeRequire('PROVIDER_REGISTRY_ADDRESS'),
    jobEscrowAddress: safeRequire('JOB_ESCROW_ADDRESS'),
    backendUrl: optionalEnv('BACKEND_URL', 'http://localhost:3001'),
    ipfsGateway: optionalEnv('IPFS_GATEWAY', 'https://gateway.pinata.cloud/ipfs/'),
    containerRuntime: optionalEnv('CONTAINER_RUNTIME', 'docker'),
    noDocker: boolEnv('NO_DOCKER', false),
    agentCheatMode: false, // verifier never cheats
    maxJobDurationSeconds: intEnv('MAX_JOB_DURATION_SECONDS', 300),
  };

  if (missing.length > 0) {
    throw new Error(
      `Verifier service cannot start. Missing required environment variables:\n  ${missing.join('\n  ')}\n\nCopy agents/.env.example to agents/.env and fill in the values.`
    );
  }

  return config;
}
