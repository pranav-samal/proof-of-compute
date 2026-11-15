/**
 * config.ts — reads and validates all environment variables.
 *
 * RULE: If a required variable is missing or empty this module throws
 * immediately on import. The server never starts in a broken state.
 *
 * Required vs optional:
 *   - Required at startup: PORT, DATABASE_PATH, RPC_URL, CHAIN_ID, IPFS_GATEWAY
 *   - Required for indexer (can be set later): CONTRACT addresses
 *   - Optional: IPFS_LOCAL_API
 */

function require_env(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`[config] Missing required environment variable: ${name}`);
  }
  return value.trim();
}

function optional_env(name: string, fallback = ''): string {
  return (process.env[name] ?? fallback).trim();
}

// ─── Server ───────────────────────────────────────────────────────────────

export const PORT = parseInt(optional_env('PORT', '3001'), 10);
export const NODE_ENV = optional_env('NODE_ENV', 'development');

// ─── Database ─────────────────────────────────────────────────────────────

export const DATABASE_PATH = optional_env('DATABASE_PATH', './data/poc.db');

// ─── Blockchain ───────────────────────────────────────────────────────────

export const RPC_URL = require_env('RPC_URL');
export const CHAIN_ID = parseInt(require_env('CHAIN_ID'), 10);
export const CONFIRMATIONS = parseInt(optional_env('CONFIRMATIONS', '2'), 10);
export const INDEXER_START_BLOCK = parseInt(optional_env('INDEXER_START_BLOCK', '0'), 10);

// ─── Contract addresses ───────────────────────────────────────────────────
// These can be empty on first startup (before contracts are deployed).
// The indexer will simply skip events if they are not set.

export const PROVIDER_REGISTRY_ADDRESS = optional_env('PROVIDER_REGISTRY_ADDRESS');
export const VERIFICATION_POLICY_ADDRESS = optional_env('VERIFICATION_POLICY_ADDRESS');
export const JOB_ESCROW_ADDRESS = optional_env('JOB_ESCROW_ADDRESS');

/** Returns true when all three contract addresses are configured. */
export function contractsConfigured(): boolean {
  return (
    PROVIDER_REGISTRY_ADDRESS !== '' &&
    VERIFICATION_POLICY_ADDRESS !== '' &&
    JOB_ESCROW_ADDRESS !== ''
  );
}

// ─── IPFS ─────────────────────────────────────────────────────────────────

export const PINATA_JWT = optional_env('PINATA_JWT');
export const IPFS_GATEWAY = require_env('IPFS_GATEWAY');
export const IPFS_LOCAL_API = optional_env('IPFS_LOCAL_API', 'http://127.0.0.1:5001');

/** Returns true when Pinata JWT is configured. */
export function ipfsConfigured(): boolean {
  return PINATA_JWT !== '';
}
