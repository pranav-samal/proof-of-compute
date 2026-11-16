/**
 * seed-chain.mjs — registers providers and verifiers ON-CHAIN (real transactions).
 *
 * Uses Hardhat test accounts so this only runs on the local devchain.
 * Idempotent: checks on-chain state before each tx, skips if already registered.
 *
 * Providers registered (Hardhat accounts #1–#5):
 *   #1  0x70997970… — NovaSpark Compute  — NVIDIA H100 SXM5  12 ETH stake
 *   #2  0x3C44CdDd… — CoreMesh Labs      — NVIDIA A100 80GB   8 ETH stake
 *   #3  0x90F79bf6… — PixelVault Systems — NVIDIA RTX 4090    5 ETH stake
 *   #4  0x15d34AAf… — IronBridge Compute — NVIDIA H100 PCIe  10 ETH stake
 *   #5  0x9965507D… — StormCloud GPU     — NVIDIA RTX 4080    2 ETH stake
 *
 * Verifiers registered (Hardhat accounts #7 and #0):
 *   #7   0x14dC79… — 2 ETH bond
 *   #0   0xf39Fd6… — 1.5 ETH bond (the deployer also acts as verifier2 in the E2E demo)
 *
 * Env vars required: PROVIDER_REGISTRY_ADDRESS, RPC_URL, BACKEND_URL
 */
import { ethers } from 'ethers';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const C = (...p) => join(ROOT, ...p);

const RPC_URL = process.env.RPC_URL ?? 'http://127.0.0.1:8545';
const REGISTRY_ADDRESS = process.env.PROVIDER_REGISTRY_ADDRESS;
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:3001';

if (!REGISTRY_ADDRESS) {
  console.error('[seed] PROVIDER_REGISTRY_ADDRESS is required');
  process.exit(1);
}

// Minimal ABI for the seed
const REGISTRY_ABI = [
  'function registerProvider(bytes32 capabilityHash) external',
  'function depositStake() external payable',
  'function registerVerifier() external payable',
  'function totalStake(address provider) external view returns (uint256)',
  'function freeStake(address provider) external view returns (uint256)',
  'function verifierBond(address verifier) external view returns (uint256)',
];

// Hardhat deterministic private keys (accounts #0–#9, all 64 hex chars without 0x)
const HARDHAT_KEYS = [
  'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', // #0 deployer
  '59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', // #1
  '5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', // #2
  '7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6', // #3
  '47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a', // #4
  '8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba', // #5
  // NOTE: Hardhat's #6 key is invalid (63 hex chars) and is intentionally omitted
  // here, which makes every index after #5 shift by one: index 6 = account #7,
  // index 7 = account #8 (0 ETH — do NOT use), index 8 = account #9. The VERIFIERS
  // array below uses explicit keys to sidestep this off-by-one entirely.
  '4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356', // index 6 = Hardhat #7 → 0x14dC79964d…  (funded)
  'dbda1821b80551c9d65939329250132c0de68a8df4c26568cc54d4f26bc88cad', // index 7 = Hardhat #8 → 0xbDDc9a931E… (0 ETH — unused)
  '2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6', // index 8 = Hardhat #9 → 0xa0Ee7A142d…  (funded)
];

const PROVIDERS = [
  {
    key: HARDHAT_KEYS[1],
    stakeEth: '12',
    profile: {
      name: 'NovaSpark Compute',
      location: 'Ashburn, VA',
      gpu: { model: 'NVIDIA H100 SXM5', vramGb: 80, count: 8, architecture: 'Hopper', cudaCores: 16896 },
      ramGb: 512, storageGb: 4000, pricePerHour: 3.20,
      frameworks: ['PyTorch', 'TensorFlow', 'CUDA 12.2', 'DeepSpeed', 'JAX'],
      availability: 'available', uptimePercent: 99.7,
      tags: ['LLM Training', 'High Availability', 'NVLink'],
      joinedDate: new Date().toISOString().split('T')[0],
    },
  },
  {
    key: HARDHAT_KEYS[2],
    stakeEth: '8',
    profile: {
      name: 'CoreMesh Labs',
      location: 'Frankfurt, DE',
      gpu: { model: 'NVIDIA A100 80GB', vramGb: 80, count: 4, architecture: 'Ampere', cudaCores: 6912 },
      ramGb: 256, storageGb: 2000, pricePerHour: 2.40,
      frameworks: ['PyTorch', 'TensorFlow', 'CUDA 12.1', 'Triton', 'ONNX Runtime'],
      availability: 'available', uptimePercent: 99.2,
      tags: ['EU Data Residency', 'GDPR Compliant'],
      joinedDate: new Date().toISOString().split('T')[0],
    },
  },
  {
    key: HARDHAT_KEYS[3],
    stakeEth: '5',
    profile: {
      name: 'PixelVault Systems',
      location: 'Singapore',
      gpu: { model: 'NVIDIA RTX 4090', vramGb: 24, count: 4, architecture: 'Ada Lovelace', cudaCores: 16384 },
      ramGb: 128, storageGb: 1000, pricePerHour: 0.95,
      frameworks: ['PyTorch', 'CUDA 12.0', 'Stable Diffusion', 'ComfyUI'],
      availability: 'available', uptimePercent: 98.8,
      tags: ['Image Generation', 'Inference', 'Budget-Friendly'],
      joinedDate: new Date().toISOString().split('T')[0],
    },
  },
  {
    key: HARDHAT_KEYS[4],
    stakeEth: '10',
    profile: {
      name: 'IronBridge Compute',
      location: 'London, UK',
      gpu: { model: 'NVIDIA H100 PCIe', vramGb: 80, count: 2, architecture: 'Hopper', cudaCores: 14592 },
      ramGb: 256, storageGb: 2000, pricePerHour: 2.85,
      frameworks: ['PyTorch', 'TensorFlow', 'CUDA 12.2', 'vLLM', 'DeepSpeed'],
      availability: 'available', uptimePercent: 99.4,
      tags: ['LLM Inference', 'Enterprise', 'UK Hosted'],
      joinedDate: new Date().toISOString().split('T')[0],
    },
  },
  {
    key: HARDHAT_KEYS[5],
    stakeEth: '2',
    profile: {
      name: 'StormCloud GPU',
      location: 'Dallas, TX',
      gpu: { model: 'NVIDIA RTX 4080', vramGb: 16, count: 4, architecture: 'Ada Lovelace', cudaCores: 9728 },
      ramGb: 96, storageGb: 800, pricePerHour: 0.75,
      frameworks: ['PyTorch', 'CUDA 12.0', 'Stable Diffusion'],
      availability: 'available', uptimePercent: 97.1,
      tags: ['Image Processing', 'Mid-Range'],
      joinedDate: new Date().toISOString().split('T')[0],
    },
  },
];

// Verifiers use explicit private keys (not HARDHAT_KEYS indices) because the
// invalid #6 key was omitted from that array, which shifts every later index by
// one. #7 and #0 (the deployer) are both funded Hardhat accounts.
const VERIFIERS = [
  { key: '4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356', bondEth: '2' },   // Hardhat #7 → 0x14dC79964d…
  { key: 'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', bondEth: '1.5' }, // Hardhat #0 (deployer) → 0xf39Fd6e51a… — also acts as verifier2 in the E2E demo
];

async function pinProfileToBackend(profile, signerAddress, privateKey) {
  // Create a minimal signature (backend verifies EIP-191)
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  const message = JSON.stringify(profile);
  const signature = await wallet.signMessage(message);

  const res = await fetch(`${BACKEND_URL}/providers/${signerAddress}/profile`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile, signature }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Backend profile update failed: ${JSON.stringify(err)}`);
  }
  return res.json();
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const network = await provider.getNetwork();
  console.log(`[seed] Connected to chain ${network.chainId}`);

  // ── Register providers ───────────────────────────────────────────────

  for (const p of PROVIDERS) {
    // Create fresh wallet each iteration so nonce is fetched from chain
    const wallet = new ethers.Wallet(p.key.replace('0x', ''), provider);
    const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, wallet);
    const addr = wallet.address;

    // Idempotency: check stake to decide what still needs to happen
    const existingStake = await registry.totalStake(addr);

    if (existingStake === 0n) {
      // Check if already registered (freeStake > 0 would mean registered but not deposited yet)
      // Try depositStake first; if it reverts, then try registerProvider + depositStake
      const freeStk = await registry.freeStake(addr);

      if (freeStk === 0n) {
        // Check on-chain if provider record exists by calling freeStake result
        // If freeStake returns 0 AND totalStake is 0, we need to check registration status
        // Use a try/catch on depositStake to determine if registered
        let registered = false;
        try {
          // Test registration by calling depositStake with 0 value as a staticCall
          // If it doesn't revert with "not registered" but reverts with "value required", they're registered
          await registry.depositStake.staticCall({ value: 0n });
        } catch (e) {
          // If error is about value being 0, they ARE registered
          // If error is about not being registered, they're NOT registered
          registered = !e.message?.toLowerCase().includes('not registered') &&
            !e.message?.toLowerCase().includes('register');
        }

        if (!registered) {
          try {
            const capHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(p.profile.gpu)));
            const nonce = await provider.getTransactionCount(addr, 'pending');
            const tx = await registry.registerProvider(capHash, { nonce });
            await tx.wait();
            console.log(`[seed] registerProvider ${p.profile.name} ✓`);
          } catch (e) {
            console.warn(`[seed] registerProvider: ${e.message?.slice(0, 80)}`);
          }
        }
      }

      // depositStake — always use pending nonce to avoid stale cache
      try {
        const nonce = await provider.getTransactionCount(addr, 'pending');
        const tx = await registry.depositStake({ value: ethers.parseEther(p.stakeEth), nonce });
        await tx.wait();
        console.log(`[seed] depositStake ${p.stakeEth} ETH for ${p.profile.name} ✓`);
      } catch (e) {
        console.warn(`[seed] depositStake warning: ${e.message?.slice(0, 100)}`);
      }
    } else {
      console.log(`[seed] ✓ Provider ${p.profile.name} (${addr}) already registered (stake=${ethers.formatEther(existingStake)} ETH)`);
    }

    // Always upsert the profile in the backend (idempotent)
    try {
      await pinProfileToBackend(p.profile, addr, p.key);
      console.log(`[seed] Profile for ${p.profile.name} stored in backend ✓`);
    } catch (e) {
      console.warn(`[seed] Profile update warning: ${e.message}`);
    }
  }

  // ── Register verifiers ──────────────────────────────────────────────
  // Both verifier accounts (#7 and the deployer #0) are funded Hardhat
  // accounts, so no top-up is needed. Idempotent: skipped if already bonded.

  for (const v of VERIFIERS) {
    const wallet = new ethers.Wallet(v.key.replace('0x', ''), provider);
    const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, wallet);
    const addr = wallet.address;

    const existingBond = await registry.verifierBond(addr);
    if (existingBond > 0n) {
      console.log(`[seed] ✓ Verifier ${addr} already registered (bond=${ethers.formatEther(existingBond)} ETH)`);
      continue;
    }

    const nonce = await provider.getTransactionCount(addr, 'pending');
    const tx = await registry.registerVerifier({ value: ethers.parseEther(v.bondEth), nonce });
    await tx.wait();
    console.log(`[seed] registerVerifier ${addr} bond=${v.bondEth} ETH ✓`);
  }

  console.log('[seed] ✅ On-chain seed complete');
}

main().catch((e) => { console.error('[seed] FATAL:', e.message); process.exit(1); });
