/**
 * GET /health
 *
 * Response shape from SPEC.md §8.1:
 *   { "status": "ok", "block": 12345678, "syncLag": 2 }
 *
 * block             — last block the indexer has processed
 * syncLag           — how many blocks behind chain tip (0 until indexer runs)
 * contractsConfigured — whether all three contract addresses are set in .env
 */
import { Router, Request, Response } from 'express';
import db from '../db/db';
import { contractsConfigured } from '../config';

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  let lastBlock = 0;

  // Guard: db may not be initialised if someone hits /health before startup
  // completes (should not happen in practice, but be safe)
  if (db.isOpen()) {
    try {
      const row = db.get<{ last_block: number }>(
        'SELECT last_block FROM sync_state WHERE id = 1'
      );
      lastBlock = row?.last_block ?? 0;
    } catch {
      // Table may not exist yet during first migration — return 0 gracefully
      lastBlock = 0;
    }
  }

  // syncLag is updated by the indexer and stored on the global object
  const syncLag: number =
    (global as unknown as { _pocSyncLag?: number })._pocSyncLag ?? 0;

  res.json({
    status: 'ok',
    block: lastBlock,
    syncLag,
    contractsConfigured: contractsConfigured(),
  });
});

export default router;
