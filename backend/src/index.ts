/**
 * index.ts — Express application entry point.
 *
 * Startup order:
 *   1. dotenv loads .env into process.env
 *   2. config.ts validates env vars (throws fast if required ones are missing)
 *   3. runMigrations() opens sql.js, applies schema.sql, persists to disk
 *   4. Express app registers routes
 *   5. Server starts listening on PORT
 *   6. (Phase E) indexer will be started here
 */
import 'dotenv/config';   // ← must be first import so process.env is populated
import express, { Request, Response, NextFunction } from 'express';
import { PORT } from './config';
import { runMigrations } from './db/migrate';
import healthRouter from './routes/health';

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────

app.use(express.json({ limit: '10mb' }));

// ─── Routes ───────────────────────────────────────────────────────────────

app.use('/', healthRouter);

// Catch-all 404 — Phase C–E routes will be added above this
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
  // 1. Apply schema (creates data/poc.db if it doesn't exist)
  await runMigrations();

  // 2. Start listening
  app.listen(PORT, () => {
    console.log(`[server] Proof-of-Compute backend → http://localhost:${PORT}`);
    console.log(`[server] NODE_ENV  = ${process.env.NODE_ENV ?? 'development'}`);
    console.log(`[server] DB        = ${process.env.DATABASE_PATH ?? './data/poc.db'}`);
    console.log(`[server] RPC       = ${process.env.RPC_URL ?? '(not set)'}`);
  });
}

start().catch((err: Error) => {
  console.error('[startup] Fatal error:', err.message);
  process.exit(1);
});

export default app;
