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
 * Verifiers registered (Hardhat accounts #6–#8):
 *   #6  0x976EA74… — 2 ETH bond
 *   #7  0x14dC79e… — 1.5 ETH bond
 *   #8  0x23618e4… — 3 ETH bond
 *
 * Env vars required: PROVIDER_REGISTRY_ADDRESS, RPC_URL, BACKEND_URL
 */
import { ethers } from 'ethers';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const C = (...p) => join(ROOT, ...p);

const RPC_URL             = process.env.RPC_URL             ?? 'http://127.0.0.1:8545';
const REGISTRY_ADDRESS    = process.env.PROVIDER_REGISTRY_ADDRESS;
const BACKEND_URL         = process.env.BACKEND_URL         ?? 'http://localhost:3001';

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
  'function verifierBond(address verifier) external view returns (uint256)',
];

// Hardhat deterministic private keys (accounts #0–#8)
const HARDHAT_KEYS = [
  'ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', // #0 deployer
  '59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', // #1
  '5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', // #2
  '7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6', // #3
  '47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a', // #4
  '8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba', // #5
  '92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564', // #6
  '4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356', // #7
  'dbda1821b80551c9d65939329250132c0de68a8df4c26568cc54d4f26bc88cad', // #8
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

const VERIFIERS = [
  { key: HARDHAT_KEYS[6], bondEth: '2' },
  { key: HARDHAT_KEYS[7], bondEth: '1.5' },
  { key: HARDHAT_KEYS[8], bondEth: '3' },
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
    const wallet = new ethers.Wallet(p.key, provider);
    const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, wallet);
    const addr = wallet.address;

    // Idempotency check
    const existingStake = await registry.totalStake(addr);
    if (existingStake > 0n) {
      console.log(`[seed] ✓ Provider ${p.profile.name} (${addr}) already registered (stake=${ethers.formatEther(existingStake)} ETH)`);
    } else {
      // registerProvider with a capability hash derived from profile
      const capHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(p.profile.gpu)));
      let tx = await registry.registerProvider(capHash);
      await tx.wait();
      console.log(`[seed] registerProvider ${p.profile.name} ✓`);

      // depositStake
      tx = await registry.depositStake({ value: ethers.parseEther(p.stakeEth) });
      await tx.wait();
      console.log(`[seed] depositStake ${p.stakeEth} ETH for ${p.profile.name} ✓`);
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

  for (const v of VERIFIERS) {
    const wallet = new ethers.Wallet(v.key, provider);
    const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, wallet);
    const addr = wallet.address;

    const existingBond = await registry.verifierBond(addr);
    if (existingBond > 0n) {
      console.log(`[seed] ✓ Verifier ${addr} already registered (bond=${ethers.formatEther(existingBond)} ETH)`);
    } else {
      const tx = await registry.registerVerifier({ value: ethers.parseEther(v.bondEth) });
      await tx.wait();
      console.log(`[seed] registerVerifier ${addr} bond=${v.bondEth} ETH ✓`);
    }
  }

  console.log('[seed] ✅ On-chain seed complete');
}

main().catch((e) => { console.error('[seed] FATAL:', e.message); process.exit(1); });
