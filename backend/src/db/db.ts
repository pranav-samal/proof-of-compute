/**
 * db.ts — sql.js database singleton.
 *
 * sql.js is a pure JavaScript/WASM port of SQLite — zero native compilation,
 * works on any platform without build tools.
 *
 * API surface:
 *   db.run(sql, params?)   — execute INSERT/UPDATE/DELETE/DDL
 *   db.get<T>(sql, params?)  — first row as T, or undefined
 *   db.all<T>(sql, params?)  — all rows as T[]
 *   db.exec(sql)           — multi-statement SQL (schema migrations)
 *   db.persist()           — flush in-memory DB to disk file
 */
import initSqlJs from 'sql.js';
import type { Database, SqlJsStatic, BindParams } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { DATABASE_PATH } from '../config';

// ─── Singleton state ──────────────────────────────────────────────────────

let _sqlJs: SqlJsStatic | null = null;
let _db: Database | null = null;
const dbFilePath = path.resolve(DATABASE_PATH);

function ensureDir(): void {
  const dir = path.dirname(dbFilePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ─── Initialisation ───────────────────────────────────────────────────────

/**
 * Open (or create) the database. Must be awaited before any query.
 * Safe to call multiple times — returns the existing instance.
 */
export async function openDatabase(): Promise<Database> {
  if (_db) return _db;

  _sqlJs = await initSqlJs();
  ensureDir();

  if (fs.existsSync(dbFilePath)) {
    const buf = fs.readFileSync(dbFilePath);
    _db = new _sqlJs.Database(buf);
  } else {
    _db = new _sqlJs.Database();
  }

  _db.run('PRAGMA foreign_keys = ON;');
  return _db;
}

// ─── Persist ─────────────────────────────────────────────────────────────

/** Write the in-memory database back to the .db file. */
export function persist(): void {
  if (!_db) throw new Error('[db] Not initialised — await openDatabase() first');
  ensureDir();
  const data = _db.export();
  fs.writeFileSync(dbFilePath, Buffer.from(data));
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function assertOpen(): Database {
  if (!_db) throw new Error('[db] Not initialised — await openDatabase() first');
  return _db;
}

/**
 * Convert a plain JS object { name: value } into sql.js named-param form
 * { ':name': value }. Positional arrays are passed through unchanged.
 */
function toBindParams(params?: BindParams | Record<string, unknown>): BindParams | undefined {
  if (params === undefined || params === null) return undefined;
  if (Array.isArray(params)) return params as BindParams;
  // Named params: prefix keys with ':'
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
    out[k.startsWith(':') ? k : `:${k}`] = v;
  }
  return out as BindParams;
}

// ─── Public query API ─────────────────────────────────────────────────────

/** Execute a mutating SQL statement. */
export function run(
  sql: string,
  params?: BindParams | Record<string, unknown>
): void {
  assertOpen().run(sql, toBindParams(params));
}

/** Return the first matching row as T, or undefined. */
export function get<T = Record<string, unknown>>(
  sql: string,
  params?: BindParams | Record<string, unknown>
): T | undefined {
  const db = assertOpen();
  const stmt = db.prepare(sql);
  stmt.bind(toBindParams(params));
  if (!stmt.step()) { stmt.free(); return undefined; }
  const row = stmt.getAsObject({}) as T;
  stmt.free();
  return row;
}

/** Return all matching rows as T[]. */
export function all<T = Record<string, unknown>>(
  sql: string,
  params?: BindParams | Record<string, unknown>
): T[] {
  const db = assertOpen();
  const stmt = db.prepare(sql);
  stmt.bind(toBindParams(params));
  const rows: T[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject({}) as T);
  stmt.free();
  return rows;
}

/** Run a multi-statement SQL string (used for schema migration). */
export function exec(sql: string): void {
  assertOpen().run(sql);
}

export function isOpen(): boolean {
  return _db !== null;
}

// Default export so callers can do `import db from './db'`
export default { run, get, all, exec, persist, openDatabase, isOpen };
