/**
 * jobs.ts — SPEC.md §8.7, §8.8, §8.9
 *
 * GET /jobs                — list jobs (filter by requester, provider, state)
 * GET /jobs/:id            — single job
 * GET /jobs/:id/timeline   — ordered state transition events
 */
import { Router, Request, Response } from 'express';
import db from '../db/db';
import { notFound } from '../lib/errors';

const router = Router();

// ─── Shared helpers ───────────────────────────────────────────────────────

interface JobRow {
  job_id: string;
  requester: string;
  provider: string | null;
  spec_cid: string;
  profile_hash: string;
  repro_class: number;
  assurance: number;
  deadline: number;
  payment_wei: string;
  state: string;
  policy_hash: string | null;
  result_hash: string | null;
  checkpoint_root: string | null;
  result_cid: string | null;
  commit_block: number | null;
  outcome: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

function formatJob(j: JobRow) {
  // Resolve title: job_events-era jobs have no title column; look up spec_titles cache
  let title: string = j.title ?? '';
  if (!title) {
    interface TitleRow { title: string; }
    const cached = db.get<TitleRow>(
      'SELECT title FROM spec_titles WHERE spec_cid = :cid',
      { cid: j.spec_cid }
    );
    title = cached?.title ?? `Job #${j.job_id}`;
  }

  return {
    jobId: j.job_id,
    title,
    requester: j.requester,
    provider: j.provider ?? null,
    specCid: j.spec_cid,
    profileHash: j.profile_hash,
    reproClass: j.repro_class,
    assurance: j.assurance,
    deadline: j.deadline,
    paymentWei: j.payment_wei,
    state: j.state,
    policyHash: j.policy_hash ?? null,
    resultHash: j.result_hash ?? null,
    checkpointRoot: j.checkpoint_root ?? null,
    resultCid: j.result_cid ?? null,
    outcome: j.outcome,
    createdAt: j.created_at,
    updatedAt: j.updated_at,
  };
}

// ─── GET /jobs ────────────────────────────────────────────────────────────

router.get('/jobs', (req: Request, res: Response) => {
  const { requester, provider, state, limit = '20', offset = '0' } = req.query as Record<string, string>;

  let sql = 'SELECT * FROM jobs WHERE 1=1';
  const params: Record<string, unknown> = {};

  if (requester) { sql += ' AND LOWER(requester) = LOWER(:requester)'; params.requester = requester; }
  if (provider) { sql += ' AND LOWER(provider) = LOWER(:provider)'; params.provider = provider; }
  if (state) { sql += ' AND state = :state'; params.state = state; }

  sql += ' ORDER BY created_at DESC';
  sql += ' LIMIT :limit OFFSET :offset';
  params.limit = parseInt(limit, 10);
  params.offset = parseInt(offset, 10);

  const rows = db.all<JobRow>(sql, params);

  // Total count (without pagination)
  let countSql = 'SELECT COUNT(*) as cnt FROM jobs WHERE 1=1';
  if (requester) countSql += ` AND LOWER(requester) = LOWER('${requester}')`;
  if (provider) countSql += ` AND LOWER(provider) = LOWER('${provider}')`;
  if (state) countSql += ` AND state = '${state}'`;
  const countRow = db.get<{ cnt: number }>(countSql);

  return res.json({
    jobs: rows.map(formatJob),
    total: countRow?.cnt ?? 0,
  });
});

// ─── GET /jobs/:id ────────────────────────────────────────────────────────

router.get('/jobs/:id', (req: Request, res: Response) => {
  // skip if the path continues (e.g. /jobs/1/timeline handled below)
  const job = db.get<JobRow>('SELECT * FROM jobs WHERE job_id = :id', { id: req.params.id });
  if (!job) return notFound(res, `Job ${req.params.id} not found`);
  return res.json(formatJob(job));
});

// ─── GET /jobs/:id/timeline ───────────────────────────────────────────────

router.get('/jobs/:id/timeline', (req: Request, res: Response) => {
  const { id } = req.params;

  const job = db.get<JobRow>('SELECT * FROM jobs WHERE job_id = :id', { id });
  if (!job) return notFound(res, `Job ${id} not found`);

  // Events from job_events table (tx hashes stored by indexer)
  interface EvtRow { state: string; tx_hash: string; block_number: number; ts: string; detail: string | null; }
  const events: Array<{ state: string; txHash: string | null; block: number | null; ts: string; detail: string }> = [];

  // Pull structured events from job_events table (has real tx hashes)
  const storedEvents = db.all<EvtRow>(
    'SELECT state, tx_hash, block_number, ts, detail FROM job_events WHERE job_id = :id ORDER BY block_number ASC, id ASC',
    { id }
  );

  // Merge stored events (deduplicated by state — keep first occurrence per state)
  const seenStates = new Set<string>();
  for (const ev of storedEvents) {
    const key = `${ev.state}-${ev.tx_hash}`;
    if (seenStates.has(key)) continue;
    seenStates.add(key);
    events.push({
      state: ev.state,
      txHash: ev.tx_hash,
      block: ev.block_number,
      ts: ev.ts,
      detail: ev.detail ?? '',
    });
  }

  // If no stored events (old jobs pre-job_events table), fall back to derived events
  if (events.length === 0) {
    events.push({ state: 'REGISTERED', txHash: null, block: null, ts: job.created_at, detail: `specCid: ${job.spec_cid}` });
    if (job.policy_hash && job.state !== 'REGISTERED') {
      events.push({ state: 'ASSIGNED', txHash: null, block: null, ts: job.updated_at, detail: `provider: ${job.provider ?? '?'}` });
    }
    if (job.result_hash) {
      events.push({ state: 'COMMITTED', txHash: null, block: job.commit_block ?? null, ts: job.updated_at, detail: `resultHash: ${job.result_hash}` });
    }
  }

  // Always append attestations (they already store tx_hash)
  interface AttRow { verifier: string; verdict: string; tx_hash: string; block_number: number; ts: string; }
  const attestations = db.all<AttRow>(
    'SELECT verifier, verdict, tx_hash, block_number, ts FROM attestations WHERE job_id = :id ORDER BY ts ASC',
    { id }
  );
  for (const a of attestations) {
    events.push({ state: 'VERIFYING', txHash: a.tx_hash, block: a.block_number, ts: a.ts, detail: `verifier: ${a.verifier} verdict: ${a.verdict}` });
  }

  // Settlement
  interface SettRow { outcome: string; tx_hash: string; block_number: number; ts: string; }
  const settlement = db.get<SettRow>('SELECT outcome, tx_hash, block_number, ts FROM settlements WHERE job_id = :id', { id });
  if (settlement && !events.find((e) => e.state === 'SETTLED')) {
    events.push({ state: 'SETTLED', txHash: settlement.tx_hash, block: settlement.block_number, ts: settlement.ts, detail: `outcome: ${settlement.outcome}` });
  }

  return res.json({ jobId: id, events });
});

export default router;
