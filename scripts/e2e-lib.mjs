/**
 * e2e-lib.mjs — shared helpers for end-to-end test scripts.
 * Loaded by e2e-honest.mjs and e2e-malicious.mjs.
 */
import { ethers } from 'ethers';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

export const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const C = (...p) => join(ROOT, ...p);

// ─── Config ───────────────────────────────────────────────────────────────

export const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8545';
export const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3001';
export const CHAIN_ID = Number(process.env.CHAIN_ID ?? '31337');

// Hardhat deterministic accounts — #1 (provider), #7 and #0-deployer (verifiers), #9 (requester).
// Verifier2 reuses the deployer (#0) because only 8 Hardhat accounts are funded
// (the #6 key is invalid; #8 is unfunded), and 5 are already providers.
export const KEYS = {
  deployer: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', // #0
  requester: '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6', // #9
  provider: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', // #1
  verifier1: '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356', // #7
  verifier2: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', // #0 (deployer — doubles as verifier2)
};

// ─── Contract loading ──────────────────────────────────────────────────────

export function loadDeployment() {
  const path = C('contracts', 'deployments', 'localhost.json');
  if (!existsSync(path)) throw new Error(`deployments/localhost.json not found — run: cd contracts && npx hardhat run scripts/deploy.ts --network localhost`);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function getContracts(signerOrProvider) {
  const d = loadDeployment();
  return {
    registry: new ethers.Contract(d.ProviderRegistry.address, d.ProviderRegistry.abi, signerOrProvider),
    escrow: new ethers.Contract(d.JobEscrow.address, d.JobEscrow.abi, signerOrProvider),
    policy: new ethers.Contract(d.VerificationPolicy.address, d.VerificationPolicy.abi, signerOrProvider),
    addresses: {
      registry: d.ProviderRegistry.address,
      escrow: d.JobEscrow.address,
      policy: d.VerificationPolicy.address,
    },
  };
}

// ─── Logging ──────────────────────────────────────────────────────────────

let _step = 0;
export function step(msg) {
  _step++;
  console.log(`\n\x1b[36m━━ Step ${_step}: ${msg}\x1b[0m`);
}
export function ok(msg) { console.log(`  \x1b[32m✓\x1b[0m ${msg}`); }
export function fail(msg) { console.log(`  \x1b[31m✗\x1b[0m ${msg}`); }
export function info(msg) { console.log(`  \x1b[90m→\x1b[0m ${msg}`); }
export function txok(label, hash) {
  console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  console.log(`  \x1b[90m  txHash: ${hash}\x1b[0m`);
}

// ─── Assertions ────────────────────────────────────────────────────────────

export function assert(condition, message) {
  if (!condition) {
    console.error(`\n\x1b[31m[ASSERT FAILED] ${message}\x1b[0m\n`);
    process.exit(1);
  }
  ok(`ASSERT: ${message}`);
}

export function assertEq(actual, expected, label) {
  const a = String(actual), e = String(expected);
  if (a !== e) {
    console.error(`\n\x1b[31m[ASSERT FAILED] ${label}\n  expected: ${e}\n  actual:   ${a}\x1b[0m\n`);
    process.exit(1);
  }
  ok(`${label} = ${a}`);
}

export function assertGt(actual, min, label) {
  if (Number(actual) <= Number(min)) {
    console.error(`\n\x1b[31m[ASSERT FAILED] ${label}: ${actual} should be > ${min}\x1b[0m\n`);
    process.exit(1);
  }
  ok(`${label}: ${actual} > ${min}`);
}

export function assertLt(actual, max, label) {
  if (Number(actual) >= Number(max)) {
    console.error(`\n\x1b[31m[ASSERT FAILED] ${label}: ${actual} should be < ${max}\x1b[0m\n`);
    process.exit(1);
  }
  ok(`${label}: ${actual} < ${max}`);
}

// ─── Wait helpers ──────────────────────────────────────────────────────────

/**
 * mineBlocks/mineExtra/nonceFor helpers
 */
export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Mine `count` empty blocks. Hardhat's default automine mode produces one
 * block per transaction and no empty blocks, so block.number never advances
 * on its own. selectVerifiers requires block.number > commitBlock + 1, so the
 * E2E must force blocks forward with the hardhat_mine RPC before calling it.
 */
export async function mineBlocks(provider, count = 2) {
  await provider.send('hardhat_mine', ['0x' + count.toString(16)]);
}

/**
 * Returns a nonce tracker for the given wallet address.
 * Fetches the current pending nonce once from the chain and then increments
 * it locally on every call to `next()`. This sidesteps ethers v6's internal
 * nonce caching which breaks on Hardhat automine when the same wallet sends
 * multiple sequential transactions within one script run.
 *
 * Usage:
 *   const nonces = await nonceTracker(provider, wallet.address);
 *   const tx = await contract.someMethod(args, { nonce: nonces.next() });
 */
export async function nonceTracker(provider, address) {
  let n = await provider.getTransactionCount(address, 'pending');
  return { next() { return n++; } };
}

export async function waitForJobState(escrow, jobId, targetState, maxWaitMs = 120_000) {
  const STATE_NAMES = ['REGISTERED', 'ASSIGNED', 'COMMITTED', 'VERIFYING', 'SETTLED', 'DISPUTED', 'REFUNDED'];
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const job = await escrow.getJob(jobId);
    const stateName = STATE_NAMES[Number(job.state)] ?? `UNKNOWN(${job.state})`;
    if (Number(job.state) === targetState) {
      info(`Job #${jobId} reached state ${stateName} ✓`);
      return job;
    }
    info(`Job #${jobId} state = ${stateName}, waiting…`);
    await sleep(3000);
  }
  throw new Error(`Job #${jobId} did not reach state ${targetState} within ${maxWaitMs}ms`);
}

// ─── EIP-712 attestation signing ──────────────────────────────────────────

export async function signAttestation(wallet, escrowAddress, { jobId, policyHash, resultHash, verdict, evidenceHash }) {
  const domain = {
    name: 'ProofOfCompute',
    version: '1',
    chainId: CHAIN_ID,
    verifyingContract: escrowAddress,
  };
  const types = {
    Attestation: [
      { name: 'jobId', type: 'uint256' },
      { name: 'policyHash', type: 'bytes32' },
      { name: 'resultHash', type: 'bytes32' },
      { name: 'verdict', type: 'uint8' },
      { name: 'evidenceHash', type: 'bytes32' },
    ],
  };
  const value = { jobId, policyHash, resultHash, verdict, evidenceHash };
  return wallet.signTypedData(domain, types, value);
}

// ─── SHA-256 chain workload (matches agents/jobs/sha-chain.ts) ────────────

import { createHash } from 'crypto';

export function runShaChain(seedHex, iterations) {
  let state = Buffer.from(seedHex.replace('0x', ''), 'hex');
  for (let i = 0; i < iterations; i++) {
    state = createHash('sha256').update(state).digest();
  }
  return '0x' + state.toString('hex');
}

// ─── Backend API helpers ───────────────────────────────────────────────────

export async function backendGet(path) {
  const res = await fetch(`${BACKEND_URL}${path}`);
  if (!res.ok) throw new Error(`Backend GET ${path} → ${res.status}`);
  return res.json();
}

export async function backendPost(path, body) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Backend POST ${path} → ${res.status}: ${JSON.stringify(data)}`);
  return data;
}
