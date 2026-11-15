/**
 * shared/chain.ts
 *
 * Factory for ethers v6 JsonRpcProvider and Wallet instances.
 */

import { ethers } from 'ethers';

export interface WalletBundle {
  provider: ethers.JsonRpcProvider;
  wallet: ethers.Wallet;
}

function normaliseKey(key: string): string {
  // Accept keys with or without 0x prefix
  return key.startsWith('0x') ? key : `0x${key}`;
}

/**
 * Create a provider + wallet for the provider agent.
 * Reads RPC_URL and PROVIDER_PRIVATE_KEY from env.
 */
export async function getProviderWallet(): Promise<WalletBundle> {
  const rpcUrl = process.env['RPC_URL'];
  const privateKey = process.env['PROVIDER_PRIVATE_KEY'];

  if (!rpcUrl) throw new Error('RPC_URL is not set');
  if (!privateKey) throw new Error('PROVIDER_PRIVATE_KEY is not set');

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(normaliseKey(privateKey), provider);

  return { provider, wallet };
}

/**
 * Create a provider + wallet for the verifier service.
 * Reads RPC_URL and VERIFIER_PRIVATE_KEY from env.
 */
export async function getVerifierWallet(): Promise<WalletBundle> {
  const rpcUrl = process.env['RPC_URL'];
  const privateKey = process.env['VERIFIER_PRIVATE_KEY'];

  if (!rpcUrl) throw new Error('RPC_URL is not set');
  if (!privateKey) throw new Error('VERIFIER_PRIVATE_KEY is not set');

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(normaliseKey(privateKey), provider);

  return { provider, wallet };
}

/**
 * Build a wallet from an explicit private key and rpcUrl.
 * Useful for testing.
 */
export function buildWallet(rpcUrl: string, privateKey: string): WalletBundle {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(normaliseKey(privateKey), provider);
  return { provider, wallet };
}
