/**
 * index.ts — Express application entry point.
 *
 * Startup order:
 *   1. dotenv loads .env  (must be first so config.ts sees the vars)
 *   2. runMigrations()    opens sql.js, applies schema.sql, persists data/poc.db
 *   3. Express registers all routes
 *   4. Server starts listening on PORT
 *   5. (Phase E) indexer start will be added here
 */
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { PORT } from './config';
import { runMigrations } from './db/migrate';

// ── Phase A ──────────────────────────────────────────────────────────────
import healthRouter from './routes/health';
// ── Phase B ──────────────────────────────────────────────────────────────
import ipfsRouter from './routes/ipfs';
// ── Phase C ──────────────────────────────────────────────────────────────
import providersRouter from './routes/providers';
import matchRouter from './routes/match';
// ── Phase D ──────────────────────────────────────────────────────────────
import jobsRouter from './routes/jobs';
import receiptsRouter from './routes/receipts';
import verifiersRouter from './routes/verifiers';
import statsRouter from './routes/stats';

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));

// ─── Routes ───────────────────────────────────────────────────────────────
app.use('/', healthRouter);
app.use('/', ipfsRouter);
app.use('/', providersRouter);
app.use('/', matchRouter);
app.use('/', jobsRouter);
app.use('/', receiptsRouter);
app.use('/', verifiersRouter);
app.use('/', statsRouter);

// 404 catch-all
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

// Global error handler
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[error]', err.message);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: err.message } });
});

// ─── Async startup ────────────────────────────────────────────────────────
async function start(): Promise<void> {
  await runMigrations();

  app.listen(PORT, () => {
    console.log(`[server] Proof-of-Compute backend → http://localhost:${PORT}`);
    console.log(`[server] NODE_ENV = ${process.env.NODE_ENV ?? 'development'}`);
    console.log(`[server] DB       = ${process.env.DATABASE_PATH ?? './data/poc.db'}`);
    console.log(`[server] RPC      = ${process.env.RPC_URL ?? '(not set)'}`);
  });
}

start().catch((err: Error) => {
  console.error('[startup] Fatal error:', err.message);
  process.exit(1);
});

export default app;
