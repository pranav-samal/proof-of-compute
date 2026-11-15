/**
 * tests/attest.test.ts
 *
 * Tests for EIP-712 attestation signing (task §8, items 8–9).
 *
 * These tests run without a live RPC connection by injecting a mock provider
 * that returns a fixed chainId.
 */

import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { signAttestation, recoverSigner, Verdict } from '../verifier/attest.js';

// Use a known test key (Hardhat account #1)
const TEST_PRIVATE_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const CONTRACT_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const CHAIN_ID = 31337n;

/**
 * Build a wallet with a lightweight mock provider that returns a fixed chainId.
 * No actual RPC connection is needed.
 */
function buildTestWallet(): ethers.Wallet {
  const mockProvider = {
    getNetwork: async () => ({ chainId: CHAIN_ID, name: 'hardhat' }),
    // Minimal interface — ethers Wallet only calls getNetwork() for signTypedData
  } as unknown as ethers.Provider;

  return new ethers.Wallet(TEST_PRIVATE_KEY, mockProvider);
}

// ── Test 8: signAttestation produces valid EIP-712 signature ──────────────────

describe('attest.signAttestation', () => {
  it('produces a recoverable EIP-712 signature (test 8)', async () => {
    const wallet = buildTestWallet();

    const data = {
      jobId: 1n,
      policyHash: ethers.id('test-policy'),
      resultHash: ethers.id('test-result'),
      verdict: Verdict.PASS,
      evidenceHash: ethers.ZeroHash,
    };

    // Sign
    const signed = await signAttestation(wallet, CONTRACT_ADDRESS, data);

    expect(signed.signature).toMatch(/^0x[0-9a-fA-F]{130}$/);
    expect(signed.signerAddress.toLowerCase()).toBe(wallet.address.toLowerCase());

    // Recover using ethers.verifyTypedData (no network call needed)
    const recovered = recoverSigner(CONTRACT_ADDRESS, CHAIN_ID, data, signed.signature);
    expect(recovered.toLowerCase()).toBe(wallet.address.toLowerCase());
  });

  it('FAIL verdict also produces a valid recoverable signature', async () => {
    const wallet = buildTestWallet();

    const data = {
      jobId: 42n,
      policyHash: ethers.id('policy-42'),
      resultHash: ethers.id('result-42'),
      verdict: Verdict.FAIL,
      evidenceHash: ethers.id('evidence-42'),
    };

    const signed = await signAttestation(wallet, CONTRACT_ADDRESS, data);
    const recovered = recoverSigner(CONTRACT_ADDRESS, CHAIN_ID, data, signed.signature);
    expect(recovered.toLowerCase()).toBe(wallet.address.toLowerCase());
  });

  it('signature changes when any field changes', async () => {
    const wallet = buildTestWallet();

    const base = {
      jobId: 1n,
      policyHash: ethers.id('p'),
      resultHash: ethers.id('r'),
      verdict: Verdict.PASS,
      evidenceHash: ethers.ZeroHash,
    };

    const s1 = await signAttestation(wallet, CONTRACT_ADDRESS, base);
    const s2 = await signAttestation(wallet, CONTRACT_ADDRESS, { ...base, jobId: 2n });

    expect(s1.signature).not.toBe(s2.signature);
  });

  it('INCONCLUSIVE verdict produces a recoverable signature', async () => {
    const wallet = buildTestWallet();

    const data = {
      jobId: 7n,
      policyHash: ethers.ZeroHash,
      resultHash: ethers.ZeroHash,
      verdict: Verdict.INCONCLUSIVE,
      evidenceHash: ethers.ZeroHash,
    };

    const signed = await signAttestation(wallet, CONTRACT_ADDRESS, data);
    const recovered = recoverSigner(CONTRACT_ADDRESS, CHAIN_ID, data, signed.signature);
    expect(recovered.toLowerCase()).toBe(wallet.address.toLowerCase());
  });
});

// ── Test 9: cheat mode replaces correct hash with wrong hash ──────────────────

describe('provider cheat mode', () => {
  it('buildResultHash returns random bytes when AGENT_CHEAT_MODE=true (test 9)', async () => {
    const { buildResultHash } = await import('../provider/commit.js');

    const correctHash = ethers.id('correct-result');

    // Without cheat mode
    process.env['AGENT_CHEAT_MODE'] = 'false';
    const honest = buildResultHash(correctHash);
    expect(honest).toBe(correctHash);

    // With cheat mode
    process.env['AGENT_CHEAT_MODE'] = 'true';
    const cheat = buildResultHash(correctHash);
    expect(cheat).not.toBe(correctHash);
    expect(cheat).toMatch(/^0x[0-9a-fA-F]{64}$/);

    // Clean up
    process.env['AGENT_CHEAT_MODE'] = 'false';
  });

  it('two cheat hashes are different (randomness is real)', async () => {
    const { buildResultHash } = await import('../provider/commit.js');
    process.env['AGENT_CHEAT_MODE'] = 'true';

    const correctHash = ethers.id('correct-result');
    const c1 = buildResultHash(correctHash);
    const c2 = buildResultHash(correctHash);

    // Both should differ from correct hash
    expect(c1).not.toBe(correctHash);
    expect(c2).not.toBe(correctHash);
    // They are random, so there's a 1/2^256 chance of collision — safe to assert
    expect(c1).not.toBe(c2);

    process.env['AGENT_CHEAT_MODE'] = 'false';
  });
});
