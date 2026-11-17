/**
 * Provider routes — SPEC.md §8.2, §8.3, §8.4
 *
 * GET  /providers
 * GET  /providers/:address
 * PUT  /providers/:address/profile
 */
import { Router, Request, Response } from 'express';
import { ethers } from 'ethers';
import crypto from 'crypto';
import db from '../db/db';
import { pinJson } from '../ipfs/pin';
import { ipfsConfigured } from '../config';
import { notFound, badRequest, serverError } from '../lib/errors';

const router = Router();

// ─── Types ────────────────────────────────────────────────────────────────

interface ProviderRow {
  address: string;
  capability_hash: string;
  stake_wei: string;
  locked_wei: string;
  reputation_bps: number;
  slash_count: number;
  verified_jobs: number;
  last_seen_block: number;
}

interface ProfileRow {
  address: string;
  profile_json: string;
  profile_cid: string;
  profile_hash: string;
  updated_at: string;
}

function formatProvider(p: ProviderRow, profile: ProfileRow | undefined) {
  return {
    address: p.address,
    capabilityHash: p.capability_hash,
    stakeWei: p.stake_wei,
    lockedStakeWei: p.locked_wei,
    reputationBps: p.reputation_bps,
    slashCount: p.slash_count,
    verifiedJobCount: p.verified_jobs,
    profile: profile ? JSON.parse(profile.profile_json) : null,
    profileCid: profile?.profile_cid ?? null,
    profileHash: profile?.profile_hash ?? null,
  };
}

// ─── GET /providers ───────────────────────────────────────────────────────

router.get('/providers', (req: Request, res: Response) => {
  try {
    const {
      gpu, minVram, maxPrice, minStake, minReputation, available, sort,
    } = req.query as Record<string, string | undefined>;

    // Two separate simple queries — avoids JOIN performance issues with sql.js
    const providerRows = db.all<ProviderRow>('SELECT * FROM providers');
    const profileRows = db.all<ProfileRow>('SELECT * FROM provider_profiles');

    // Build lookup map
    const profileMap = new Map<string, ProfileRow>();
    for (const pp of profileRows) profileMap.set(pp.address, pp);

    let results = providerRows.map((p) => ({
      raw: p,
      formatted: formatProvider(p, profileMap.get(p.address)),
    }));

    // Apply filters in JS
    if (minStake) {
      const minS = parseFloat(minStake) * 1e18;
      results = results.filter((r) => parseFloat(r.raw.stake_wei) >= minS);
    }
    if (minReputation) {
      const minR = parseInt(minReputation, 10);
      results = results.filter((r) => r.raw.reputation_bps >= minR);
    }
    if (gpu) {
      const q = gpu.toLowerCase();
      results = results.filter((r) => {
        const profile = r.formatted.profile as Record<string, unknown> | null;
        const model = (profile?.gpu as Record<string, unknown> | undefined)?.model?.toString() ?? '';
        return model.toLowerCase().includes(q);
      });
    }
    if (minVram) {
      const mv = parseInt(minVram, 10);
      results = results.filter((r) => {
        const profile = r.formatted.profile as Record<string, unknown> | null;
        return Number((profile?.gpu as Record<string, unknown> | undefined)?.vramGb ?? 0) >= mv;
      });
    }
    if (maxPrice) {
      const mp = parseFloat(maxPrice);
      results = results.filter((r) => {
        const profile = r.formatted.profile as Record<string, unknown> | null;
        return Number(profile?.pricePerHour ?? 999) <= mp;
      });
    }
    if (available === 'true') {
      results = results.filter((r) => {
        const profile = r.formatted.profile as Record<string, unknown> | null;
        return profile?.availability === 'available';
      });
    }

    // Sort
    switch (sort) {
      case 'reputation': results.sort((a, b) => b.raw.reputation_bps - a.raw.reputation_bps); break;
      case 'price': results.sort((a, b) => {
        const profileA = a.formatted.profile as Record<string, unknown> | null;
        const profileB = b.formatted.profile as Record<string, unknown> | null;
        return Number(profileA?.pricePerHour ?? 0) - Number(profileB?.pricePerHour ?? 0);
      }); break;
      default: results.sort((a, b) => b.raw.reputation_bps - a.raw.reputation_bps);
    }

    return res.json({ providers: results.map((r) => r.formatted) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[GET /providers] Error:', msg);
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: msg } });
  }
});

// ─── GET /providers/:address ──────────────────────────────────────────────

router.get('/providers/:address', (req: Request, res: Response) => {
  const { address } = req.params;
  // Normalize to EIP-55 checksum so lowercase MetaMask addresses match the DB.
  let normalizedAddress = address;
  try { normalizedAddress = ethers.getAddress(address); } catch { /* keep original if invalid */ }

  const provider = db.get<ProviderRow>(
    'SELECT * FROM providers WHERE LOWER(address) = LOWER(:address)',
    { address: normalizedAddress }
  );
  if (!provider) return notFound(res, `No provider with address ${address}`);

  const profile = db.get<ProfileRow>(
    'SELECT * FROM provider_profiles WHERE LOWER(address) = LOWER(:address)',
    { address: normalizedAddress }
  );

  return res.json(formatProvider(provider, profile));
});

// ─── PUT /providers/:address/profile ─────────────────────────────────────

router.put('/providers/:address/profile', async (req: Request, res: Response) => {
  const { address } = req.params;
  const { profile, signature } = req.body as { profile?: unknown; signature?: string };

  if (!profile || !signature) {
    return badRequest(res, 'profile and signature are required');
  }

  // EIP-191 signature verification
  try {
    const message = JSON.stringify(profile);
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() !== address.toLowerCase()) {
      return res.status(400).json({
        error: { code: 'INVALID_SIGNATURE', message: 'Signature does not match address' },
      });
    }
  } catch {
    return res.status(400).json({
      error: { code: 'INVALID_SIGNATURE', message: 'Could not recover signer from signature' },
    });
  }

  // Ensure provider row exists
  db.run(
    `INSERT OR IGNORE INTO providers (address, capability_hash) VALUES (:address, '0x')`,
    { address }
  );

  let profileCid = '';
  let profileHash = '';

  if (ipfsConfigured()) {
    try {
      const { cid, contentHash } = await pinJson(profile, `profile-${address}`);
      profileCid = cid;
      profileHash = `0x${contentHash}`;
    } catch (err) {
      return serverError(res, `IPFS pin failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else {
    profileHash = `0x${crypto.createHash('sha256').update(JSON.stringify(profile)).digest('hex')}`;
  }

  const now = new Date().toISOString();
  db.run(
    `INSERT OR REPLACE INTO provider_profiles
       (address, profile_json, profile_cid, profile_hash, updated_at)
     VALUES (:address, :profile_json, :profile_cid, :profile_hash, :now)`,
    { address, profile_json: JSON.stringify(profile), profile_cid: profileCid, profile_hash: profileHash, now }
  );
  db.persist();

  return res.json({ profileCid, profileHash });
});

export default router;
