/**
 * IPFS routes — from SPEC.md §8.13 and §8.14
 *
 * POST /ipfs/result  — pin provider result artifacts, return { cid, resultHash }
 * GET  /ipfs/:cid    — proxy fetch from IPFS gateway
 */
import { Router, Request, Response } from 'express';
import { pinBuffer } from '../ipfs/pin.js';
import { fetchFromIpfs } from '../ipfs/fetch.js';
import { ipfsConfigured } from '../config.js';
import db from '../db/db.js';

const router = Router();

// ─── POST /ipfs/result ────────────────────────────────────────────────────
// Called by the provider agent after running a job.
// Pins result blob + checkpoint list to Pinata, returns CID and SHA-256 hash.

router.post('/ipfs/result', async (req: Request, res: Response) => {
  if (!ipfsConfigured()) {
    return res.status(503).json({
      error: { code: 'IPFS_NOT_CONFIGURED', message: 'PINATA_JWT is not set in environment' },
    });
  }

  const { jobId, resultBlob, checkpoints } = req.body as {
    jobId?: string;
    resultBlob?: string;      // base64 encoded
    checkpoints?: string[];
  };

  if (!jobId || !resultBlob) {
    return res.status(400).json({
      error: { code: 'INVALID_REQUEST', message: 'jobId and resultBlob are required' },
    });
  }

  try {
    // Decode base64 blob
    const buffer = Buffer.from(resultBlob, 'base64');

    // Pin the result blob
    const { cid, contentHash: resultHash } = await pinBuffer(buffer, `result-${jobId}`);

    // Optionally pin checkpoints as JSON alongside
    if (checkpoints && checkpoints.length > 0) {
      await import('../ipfs/pin.js').then(({ pinJson }) =>
        pinJson({ jobId, checkpoints }, `checkpoints-${jobId}`)
      );
    }

    // Update the job row with result CID if job exists
    if (db.isOpen()) {
      db.run(
        `UPDATE jobs SET result_cid = :cid, updated_at = :now WHERE job_id = :jobId`,
        { cid, now: new Date().toISOString(), jobId }
      );
      db.persist();
    }

    return res.status(201).json({ cid, resultHash });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown IPFS error';
    return res.status(500).json({ error: { code: 'IPFS_ERROR', message } });
  }
});

// ─── GET /ipfs/:cid ───────────────────────────────────────────────────────
// Proxies a read from the IPFS gateway.
// Returns the raw content with the content-type from the gateway.

router.get('/ipfs/:cid', async (req: Request, res: Response) => {
  const { cid } = req.params;

  if (!cid || cid.trim() === '') {
    return res.status(400).json({
      error: { code: 'INVALID_REQUEST', message: 'CID is required' },
    });
  }

  const result = await fetchFromIpfs(cid);

  if (!result.content.length) {
    return res.status(404).json({
      error: { code: 'IPFS_NOT_FOUND', message: `CID ${cid} not found on gateway` },
    });
  }

  // Try to detect if it's JSON
  let contentType = 'application/octet-stream';
  try {
    JSON.parse(result.content.toString('utf-8'));
    contentType = 'application/json';
  } catch {
    // not JSON — send as binary
  }

  res.setHeader('Content-Type', contentType);
  res.setHeader('X-Content-Hash', result.hash);
  return res.send(result.content);
});

export default router;
