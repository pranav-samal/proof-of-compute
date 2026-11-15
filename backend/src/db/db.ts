/**
 * db.ts — better-sqlite3 database singleton.
 *
 * better-sqlite3 is a native synchronous SQLite driver.
 * It uses a prebuilt binary (no compilation needed on most platforms).
 * Much lower memory footprint than sql.js (WASM).
 *
 * API surface:
 *   db.run(sql, params?)   — execute INSERT/UPDATE/DELETE/DDL
 *   db.get<T>(sql, params?) — first row as T, or undefined
 *   db.all<T>(sql, params?) — all rows as T[]
 *   db.exec(sql)           — multi-statement SQL (schema migrations)
 *   db.persist()           — no-op (better-sqlite3 writes to disk automatically)
 */
import BetterSqlite3 from 'better-sqlite3';
import type { Database as BSDatabase } from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { DATABASE_PATH } from '../config';

// ─── Singleton ────────────────────────────────────────────────────────────

let _db: BSDatabase | null = null;
const dbFilePath = path.resolve(DATABASE_PATH);

function ensureDir(): void {
  const dir = path.dirname(dbFilePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Opens (or creates) the database. Safe to call multiple times. */
export async function openDatabase(): Promise<BSDatabase> {
  if (_db) return _db;
  ensureDir();
  _db = new BetterSqlite3(dbFilePath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  return _db;
}

/** No-op — better-sqlite3 writes to disk automatically on every statement. */
export function persist(): void {
  // better-sqlite3 is synchronous and always writes to disk — nothing to do
}

function assertOpen(): BSDatabase {
  if (!_db) throw new Error('[db] Not initialised — await openDatabase() first');
  return _db;
}

// ─── Query helpers ─────────────────────────────────────────────────────────

type Params = Record<string, unknown> | unknown[];

/** Execute a mutating SQL statement. */
export function run(sql: string, params?: Params): void {
  const db = assertOpen();
  if (params !== undefined) {
    db.prepare(sql).run(params as Record<string, unknown>);
  } else {
    db.prepare(sql).run();
  }
}

/** Return the first matching row as T, or undefined. */
export function get<T = Record<string, unknown>>(sql: string, params?: Params): T | undefined {
  const db = assertOpen();
  const stmt = db.prepare(sql);
  if (params !== undefined) {
    return stmt.get(params as Record<string, unknown>) as T | undefined;
  }
  return stmt.get() as T | undefined;
}

/** Return all matching rows as T[]. */
export function all<T = Record<string, unknown>>(sql: string, params?: Params): T[] {
  const db = assertOpen();
  const stmt = db.prepare(sql);
  if (params !== undefined) {
    return stmt.all(params as Record<string, unknown>) as T[];
  }
  return stmt.all() as T[];
}

/** Run a multi-statement SQL string (schema migration). */
export function exec(sql: string): void {
  assertOpen().exec(sql);
}

export function isOpen(): boolean {
  return _db !== null;
}

export default { run, get, all, exec, persist, openDatabase, isOpen };
