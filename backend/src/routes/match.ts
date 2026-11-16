/**
 * match.ts — SPEC.md §8.5 and §8.6
 *
 * POST /jobs/spec    — validate spec JSON, pin to IPFS, return { cid, profileHash }
 * POST /jobs/match   — rank providers for a job request
 */
import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import db from '../db/db';
import { pinJson } from '../ipfs/pin';
import { ipfsConfigured } from '../config';
import { badRequest, serverError } from '../lib/errors';

const router = Router();

// ─── Spec validation ──────────────────────────────────────────────────────

function validateSpec(spec: unknown): string | null {
  if (typeof spec !== 'object' || spec === null) return 'Spec must be an object';
  const s = spec as Record<string, unknown>;
  if (!s['type'] || typeof s['type'] !== 'string') return 'Missing field: type';
  if (!['sha-chain', 'matmul'].includes(s['type'] as string))
    return `Unknown workload type: ${s['type']}. Supported: sha-chain, matmul`;
  if (!s['params'] || typeof s['params'] !== 'object') return 'Missing field: params';
  if (!s['image'] || typeof s['image'] !== 'string') return 'Missing field: image';
  if (!s['resources'] || typeof s['resources'] !== 'object') return 'Missing field: resources';
  const res = s['resources'] as Record<string, unknown>;
  if (!res['cpuCores']) return 'Missing resources.cpuCores';
  if (!res['memoryMb']) return 'Missing resources.memoryMb';
  if (!res['timeLimitSecs']) return 'Missing resources.timeLimitSecs';
  return null;
}

// ─── POST /jobs/spec ──────────────────────────────────────────────────────

router.post('/jobs/spec', async (req: Request, res: Response) => {
  const spec = req.body as Record<string, unknown>;

  const validationError = validateSpec(spec);
  if (validationError) {
    return badRequest(res, validationError, 'INVALID_SPEC');
  }

  // Extract optional title for the spec_titles cache
  const title = (typeof spec['title'] === 'string' && spec['title'].trim())
    ? spec['title'].trim()
    : `${String(spec['type'])} job`;

  // Compute profile hash (keccak256 equivalent: sha256 for off-chain)
  const specStr = JSON.stringify(spec);
  const profileHash = `0x${crypto.createHash('sha256').update(specStr).digest('hex')}`;

  let cid: string;

  if (!ipfsConfigured()) {
    cid = `bafylocal${profileHash.slice(2, 34)}`;
  } else {
    try {
      const pinResult = await pinJson(spec, 'job-spec');
      cid = pinResult.cid;
    } catch (err) {
      return serverError(res, `IPFS pin failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Cache the title so the jobs list can show it without an IPFS fetch
  if (db.isOpen()) {
    db.run(
      `INSERT OR REPLACE INTO spec_titles (spec_cid, title, created_at)
       VALUES (:cid, :title, :now)`,
      { cid, title, now: new Date().toISOString() }
    );
    db.persist();
  }

  return res.status(201).json({ cid, profileHash });
});

// ─── POST /jobs/match ─────────────────────────────────────────────────────

interface MatchRequest {
  reproClass?: number;
  assurance?: number;
  minVramGb?: number;
  minRamGb?: number;
  gpuModel?: string;
  frameworks?: string[];
  budgetWei?: string;
  deadlineTs?: number;
}

interface ProviderProfileRow {
  address: string;
  stake_wei: string;
  reputation_bps: number;
  profile_json: string;
}

router.post('/jobs/match', (req: Request, res: Response) => {
  const body = req.body as MatchRequest;
  const budgetWei = BigInt(body.budgetWei ?? '0');

  // Pull all providers that have a profile
  const rows = db.all<ProviderProfileRow>(
    `SELECT p.address, p.stake_wei, p.reputation_bps, pp.profile_json
     FROM providers p
     INNER JOIN provider_profiles pp ON pp.address = p.address
     WHERE CAST(p.stake_wei AS INTEGER) > CAST(p.locked_wei AS INTEGER)`
  );

  const matches = rows
    .map((row) => {
      let profile: Record<string, unknown>;
      try { profile = JSON.parse(row.profile_json); } catch { return null; }

      const gpu = profile['gpu'] as Record<string, unknown> | undefined;
      const vramGb = Number(gpu?.['vramGb'] ?? 0);
      const ramGb = Number(profile['ramGb'] ?? 0);
      const pricePerHour = Number(profile['pricePerHour'] ?? 0);
      const availability = profile['availability'] as string;
      const frameworks = (profile['frameworks'] as string[] | undefined) ?? [];

      // Hard filters
      if (body.minVramGb && vramGb < body.minVramGb) return null;
      if (body.minRamGb && ramGb < body.minRamGb) return null;
      if (availability === 'offline') return null;
      if (body.gpuModel && !(gpu?.['model'] as string ?? '').includes(body.gpuModel)) return null;
      if (body.frameworks?.length) {
        const hasAll = body.frameworks.every((f) => frameworks.includes(f));
        if (!hasAll) return null;
      }

      // Scoring (0–1 for each dimension, equal weights)
      const hardwareScore = 1.0; // passed hard filters above
      const availabilityScore = availability === 'available' ? 1.0 : 0.5;
      const reputationScore = row.reputation_bps / 10000;

      // Cost score: cheaper = higher score (normalised vs budget)
      const hourlyWei = BigInt(Math.round(pricePerHour * 1e18 / 3600));
      const costScore = budgetWei > 0n && hourlyWei > 0n
        ? Math.min(1, Number(budgetWei) / Number(hourlyWei) / 10)
        : 0.5;

      const score = (hardwareScore + availabilityScore + reputationScore + costScore) / 4;

      // Rough policy estimate (risk-score based on repro class + assurance)
      const reproRisk = [0.05, 0.25, 0.50][body.reproClass ?? 0] ?? 0.05;
      const assuranceRisk = (body.assurance ?? 1) / 3;
      const riskBps = Math.min(10000, Math.round((reproRisk + assuranceRisk) * 5000));
      const tier = riskBps < 2500 ? 0 : riskBps < 5000 ? 1 : riskBps < 7500 ? 2 : 3;
      const verifierCounts = [1, 3, 5, 5];
      const quorums = [1, 2, 3, 4];
      const samplingBpsList = [0, 1000, 5000, 10000];
      const collateralWei = budgetWei > 0n
        ? String(budgetWei * BigInt(5000 + riskBps) / 10000n)
        : '0';

      return {
        address: row.address,
        score: parseFloat(score.toFixed(4)),
        breakdown: {
          hardwareCompatibility: hardwareScore,
          costScore: parseFloat(costScore.toFixed(4)),
          reputationScore: parseFloat(reputationScore.toFixed(4)),
          availabilityScore,
        },
        estimatedCostWei: budgetWei > 0n ? String(hourlyWei) : '0',
        policy: {
          tier,
          samplingBps: samplingBpsList[tier],
          verifierCount: verifierCounts[tier],
          quorum: quorums[tier],
          collateralWei,
          challengeWindow: tier === 3 ? 3600 : 0,
        },
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b?.score ?? 0) - (a?.score ?? 0));

  return res.json({ matches });
});

export default router;
