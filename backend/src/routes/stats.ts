/**
 * stats.ts — SPEC.md §8.12
 *
 * GET /stats/requester/:address
 */
import { Router, Request, Response } from 'express';
import db from '../db/db';

const router = Router();

router.get('/stats/requester/:address', (req: Request, res: Response) => {
  const { address } = req.params;

  const totalRow = db.get<{ cnt: number }>(
    'SELECT COUNT(*) as cnt FROM jobs WHERE requester = :address',
    { address }
  );
  const activeRow = db.get<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM jobs
     WHERE requester = :address AND state NOT IN ('SETTLED','REFUNDED','DISPUTED')`,
    { address }
  );
  const completedRow = db.get<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM jobs
     WHERE requester = :address AND state = 'SETTLED' AND outcome = 'ACCEPTED'`,
    { address }
  );
  const spendRow = db.get<{ total: string | null }>(
    `SELECT SUM(CAST(payment_wei AS INTEGER)) as total FROM jobs
     WHERE requester = :address AND outcome = 'ACCEPTED'`,
    { address }
  );

  const total     = totalRow?.cnt ?? 0;
  const active    = activeRow?.cnt ?? 0;
  const completed = completedRow?.cnt ?? 0;
  const totalSpentWei = spendRow?.total ?? '0';
  const successRate = total > 0 ? completed / total : 0;

  return res.json({
    address,
    totalJobs:     total,
    activeJobs:    active,
    completedJobs: completed,
    totalSpentWei: totalSpentWei ?? '0',
    successRate:   parseFloat(successRate.toFixed(4)),
  });
});

export default router;
