/**
 * migrate.ts — applies schema.sql to the database.
 *
 * Uses sql.js's native `db.exec()` which handles the full multi-statement
 * SQL file in one call. Safe to run on every startup — all CREATE TABLE
 * statements use IF NOT EXISTS, and seed rows use INSERT OR IGNORE.
 *
 * Run standalone:   npx ts-node src/db/migrate.ts
 * Called by:        src/index.ts on startup
 */
import fs from 'fs';
import path from 'path';
import { openDatabase, persist } from './db';

export async function runMigrations(): Promise<void> {
  const db = await openDatabase();

  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf-8');

  // sql.js .exec() runs the entire script in one call — handles multi-statement SQL
  db.exec(sql);

  // Write the initialised DB to disk
  persist();

  console.log('[migrate] Schema applied and persisted to disk.');
}

// Allow running directly: npx ts-node src/db/migrate.ts
if (require.main === module) {
  runMigrations()
    .then(() => { console.log('[migrate] Done.'); process.exit(0); })
    .catch((err: Error) => { console.error('[migrate] Error:', err.message); process.exit(1); });
}
