/**
 * migrate.ts — applies schema.sql to the database.
 *
 * Uses sql.js's native `db.exec()` which handles the full multi-statement
 * SQL file in one call. Safe to run on every startup — all CREATE TABLE
 * statements use IF NOT EXISTS, and seed rows use INSERT OR IGNORE.
 *
 * IMPORTANT: We do NOT call persist() here on restarts when the DB file
 * already exists — that would overwrite seeded/live data with the
 * in-memory copy before any data is loaded from disk.
 *
 * Run standalone:   npx tsx src/db/migrate.ts
 * Called by:        src/index.ts on startup
 */
import fs from 'fs';
import path from 'path';
import { openDatabase, persist, exec } from './db';
import { DATABASE_PATH } from '../config';

export async function runMigrations(): Promise<void> {
  const dbFileExisted = fs.existsSync(path.resolve(DATABASE_PATH));

  // openDatabase() reads from disk if file exists, creates fresh if not
  await openDatabase();

  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf-8');

  // Apply schema — IF NOT EXISTS means existing data is preserved
  exec(sql);

  if (!dbFileExisted) {
    // Fresh DB — persist the schema to disk for the first time
    persist();
    console.log('[migrate] Fresh database created and persisted.');
  } else {
    console.log('[migrate] Schema checked — existing database loaded.');
  }
}

// Allow running directly: npx tsx src/db/migrate.ts
if (require.main === module) {
  runMigrations()
    .then(() => { console.log('[migrate] Done.'); process.exit(0); })
    .catch((err: Error) => { console.error('[migrate] Error:', err.message); process.exit(1); });
}
