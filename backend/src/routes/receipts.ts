/**
 * receipts.ts — SPEC.md §8.10
 *
 * GET /receipts/:jobId
 *
 * Returns the on-chain receipt plus:
 *   ipfsVerified:    true when IPFS content was reachable
 *   ipfsMatchesChain: true when sha256(ipfsContent) === resultHash from chain
 */
import { Router, Request, Response } from 'express';
import db from '../db/db';
import { fetchFromIpfs } from '../ipfs/fetch';
import { notFound } from '../lib/errors';

const router = Router();

interface ReceiptRow {
  job_id: string;
  spec_cid: string;
  policy_hash: string;
  provider: string;
  requester: string;
  result_hash: string;
  attestation_root: string;
  tier: number;
  outcome: string;
  settled_at: string;
  tx_hash: string;
}

interface JobRow {
  result_cid: string | null;
  result_hash: string | null;
}

router.get('/receipts/:jobId', async (req: Request, res: Response) => {
  const { jobId } = req.params;

  const receipt = db.get<ReceiptRow>(
    'SELECT * FROM receipts WHERE job_id = :jobId',
    { jobId }
  );

  if (!receipt) return notFound(res, `No settled receipt for job ${jobId}`);

  // Fetch result from IPFS to verify hash matches what is on-chain
  const job = db.get<JobRow>(
    'SELECT result_cid, result_hash FROM jobs WHERE job_id = :jobId',
    { jobId }
  );

  let ipfsVerified = false;
  let ipfsMatchesChain = false;

  if (job?.result_cid) {
    const fetchResult = await fetchFromIpfs(job.result_cid, receipt.result_hash);
    ipfsVerified       = fetchResult.content.length > 0;
    ipfsMatchesChain   = fetchResult.matchesExpected;
  }

  return res.json({
    receipt: {
      jobId:           receipt.job_id,
      specCid:         receipt.spec_cid,
      policyHash:      receipt.policy_hash,
      provider:        receipt.provider,
      requester:       receipt.requester,
      resultHash:      receipt.result_hash,
      attestationRoot: receipt.attestation_root,
      tier:            receipt.tier,
      outcome:         receipt.outcome,
      settledAt:       receipt.settled_at,
      txHash:          receipt.tx_hash,
    },
    ipfsVerified,
    ipfsMatchesChain,
  });
});

export default router;
