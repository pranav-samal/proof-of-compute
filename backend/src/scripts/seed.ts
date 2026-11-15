/**
 * seed.ts — Seeds the backend DB with mock providers for local development.
 * Run once after starting the backend:
 *   npx tsx src/scripts/seed.ts
 *
 * This inserts provider rows directly so the frontend shows data
 * before any on-chain activity has occurred.
 * NOT for production use.
 */
import 'dotenv/config';
import { openDatabase, persist, run } from '../db/db';

const PROVIDERS = [
  {
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    stake_wei: '12500000000000000000',
    locked_wei: '0',
    reputation_bps: 9700,
    slash_count: 0,
    verified_jobs: 1812,
    profile: {
      name: 'NovaSpark Compute', location: 'Ashburn, VA',
      gpu: { model: 'NVIDIA H100 SXM5', vramGb: 80, count: 8, architecture: 'Hopper', cudaCores: 16896 },
      ramGb: 512, storageGb: 4000, pricePerHour: 3.20,
      frameworks: ['PyTorch', 'TensorFlow', 'CUDA 12.2', 'DeepSpeed', 'JAX'],
      availability: 'available', uptimePercent: 99.7,
      tags: ['LLM Training', 'High Availability', 'NVLink'], joinedDate: '2023-01-15',
    },
  },
  {
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    stake_wei: '8000000000000000000',
    locked_wei: '2400000000000000000',
    reputation_bps: 9100,
    slash_count: 0,
    verified_jobs: 698,
    profile: {
      name: 'CoreMesh Labs', location: 'Frankfurt, DE',
      gpu: { model: 'NVIDIA A100 80GB', vramGb: 80, count: 4, architecture: 'Ampere', cudaCores: 6912 },
      ramGb: 256, storageGb: 2000, pricePerHour: 2.40,
      frameworks: ['PyTorch', 'TensorFlow', 'CUDA 12.1', 'Triton', 'ONNX Runtime'],
      availability: 'available', uptimePercent: 99.2,
      tags: ['EU Data Residency', 'GDPR Compliant'], joinedDate: '2023-04-02',
    },
  },
  {
    address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    stake_wei: '5500000000000000000',
    locked_wei: '1000000000000000000',
    reputation_bps: 8800,
    slash_count: 1,
    verified_jobs: 2150,
    profile: {
      name: 'PixelVault Systems', location: 'Singapore',
      gpu: { model: 'NVIDIA RTX 4090', vramGb: 24, count: 4, architecture: 'Ada Lovelace', cudaCores: 16384 },
      ramGb: 128, storageGb: 1000, pricePerHour: 0.95,
      frameworks: ['PyTorch', 'CUDA 12.0', 'Stable Diffusion', 'ComfyUI'],
      availability: 'available', uptimePercent: 98.8,
      tags: ['Image Generation', 'Inference', 'Budget-Friendly'], joinedDate: '2023-06-18',
    },
  },
  {
    address: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
    stake_wei: '10000000000000000000',
    locked_wei: '5700000000000000000',
    reputation_bps: 9500,
    slash_count: 0,
    verified_jobs: 870,
    profile: {
      name: 'IronBridge Compute', location: 'London, UK',
      gpu: { model: 'NVIDIA H100 PCIe', vramGb: 80, count: 2, architecture: 'Hopper', cudaCores: 14592 },
      ramGb: 256, storageGb: 2000, pricePerHour: 2.85,
      frameworks: ['PyTorch', 'TensorFlow', 'CUDA 12.2', 'vLLM', 'DeepSpeed'],
      availability: 'available', uptimePercent: 99.4,
      tags: ['LLM Inference', 'Enterprise', 'UK Hosted'], joinedDate: '2023-03-07',
    },
  },
  {
    address: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
    stake_wei: '2000000000000000000',
    locked_wei: '500000000000000000',
    reputation_bps: 7000,
    slash_count: 0,
    verified_jobs: 300,
    profile: {
      name: 'StormCloud GPU', location: 'Dallas, TX',
      gpu: { model: 'NVIDIA RTX 4080', vramGb: 16, count: 4, architecture: 'Ada Lovelace', cudaCores: 9728 },
      ramGb: 96, storageGb: 800, pricePerHour: 0.75,
      frameworks: ['PyTorch', 'CUDA 12.0', 'Stable Diffusion'],
      availability: 'available', uptimePercent: 97.1,
      tags: ['Image Processing', 'Mid-Range'], joinedDate: '2024-02-14',
    },
  },
];

async function seed() {
  await openDatabase();
  console.log('[seed] Seeding providers...');

  for (const p of PROVIDERS) {
    const profileJson = JSON.stringify(p.profile);
    const profileHash = '0xseed' + p.address.slice(2, 10);

    // Upsert provider
    run(
      `INSERT OR REPLACE INTO providers
         (address, capability_hash, stake_wei, locked_wei, reputation_bps, slash_count, verified_jobs, last_seen_block)
       VALUES (:address, '0xseed', :stake, :locked, :rep, :slashes, :vjobs, 0)`,
      { address: p.address, stake: p.stake_wei, locked: p.locked_wei,
        rep: p.reputation_bps, slashes: p.slash_count, vjobs: p.verified_jobs }
    );

    // Upsert profile
    run(
      `INSERT OR REPLACE INTO provider_profiles
         (address, profile_json, profile_cid, profile_hash, updated_at)
       VALUES (:address, :profile, 'bafyseed', :hash, :now)`,
      { address: p.address, profile: profileJson, hash: profileHash, now: new Date().toISOString() }
    );

    console.log(`[seed] ✓ ${p.profile.name} (${p.address})`);
  }

  persist();
  console.log(`[seed] Done — seeded ${PROVIDERS.length} providers.`);
}

seed().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
