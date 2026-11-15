/**
 * verifiers.ts — SPEC.md §8.11
 *
 * GET /verifiers
 */
import { Router, Request, Response } from 'express';
import db from '../db/db';

const router = Router();

interface VerifierRow {
  address: string;
  stake_wei: string;   // verifiers store bond in same providers table (locked_wei = bond)
  reputation_bps: number;
  slash_count: number;
  verified_jobs: number;
}

router.get('/verifiers', (_req: Request, res: Response) => {
  // Verifiers are providers that have registered as verifiers
  // For MVP: all providers with stake > 0 are eligible (real eligibility is on-chain)
  const rows = db.all<VerifierRow>(
    `SELECT address, stake_wei, reputation_bps, slash_count, verified_jobs
     FROM providers
     WHERE CAST(stake_wei AS INTEGER) > 0
     ORDER BY reputation_bps DESC`
  );

  const verifiers = rows.map((r) => ({
    address:        r.address,
    bondWei:        r.stake_wei,     // bond and stake are the same field for MVP
    assignedTasks:  0,               // populated by indexer in Phase E
    completedTasks: r.verified_jobs,
    slashCount:     r.slash_count,
    isEligible:     r.slash_count < 3 && parseInt(r.stake_wei, 10) > 0,
  }));

  return res.json({ verifiers });
});

export default router;
