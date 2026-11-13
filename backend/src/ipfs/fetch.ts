/**
 * fetch.ts — Fetch content from IPFS gateway and optionally verify its hash.
 *
 * Used by:
 *   - GET /ipfs/:cid  (proxy read to client)
 *   - GET /receipts/:jobId  (verify ipfsMatchesChain flag)
 */
import crypto from 'crypto';
import { IPFS_GATEWAY } from '../config.js';

// ─── Types ────────────────────────────────────────────────────────────────

export interface FetchResult {
  /** Raw content as a Buffer */
  content: Buffer;
  /** SHA-256 hex digest of the content */
  hash: string;
  /** True when hash matches the expectedHash argument */
  matchesExpected: boolean;
}

// ─── Implementation ───────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a CID from the configured IPFS gateway.
 *
 * @param cid           IPFS CID (e.g. "bafybeig...")
 * @param expectedHash  Optional SHA-256 hex to verify against
 * @returns             FetchResult with content, hash, and matchesExpected flag
 *
 * Retries up to 3 times with 2-second backoff on network errors.
 * If the gateway times out or is unreachable, returns matchesExpected: false
 * rather than throwing — the caller sets ipfsVerified: false in the response.
 */
export async function fetchFromIpfs(
  cid: string,
  expectedHash?: string
): Promise<FetchResult> {
  const url = `${IPFS_GATEWAY.endsWith('/') ? IPFS_GATEWAY : IPFS_GATEWAY + '/'}${cid}`;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });

      if (!response.ok) {
        // 404 from gateway — not a transient error, don't retry
        if (response.status === 404) {
          return { content: Buffer.alloc(0), hash: '', matchesExpected: false };
        }
        throw new Error(`Gateway returned HTTP ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const content = Buffer.from(arrayBuffer);
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      const matchesExpected = expectedHash ? hash === expectedHash : true;

      return { content, hash, matchesExpected };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        console.warn(
          `[ipfs] Fetch attempt ${attempt}/${MAX_RETRIES} failed for ${cid}: ${lastError.message}. Retrying in ${RETRY_DELAY_MS}ms…`
        );
        await sleep(RETRY_DELAY_MS);
      }
    }
  }

  // All retries exhausted — return safe failure state
  console.error(`[ipfs] All ${MAX_RETRIES} fetch attempts failed for ${cid}: ${lastError?.message}`);
  return { content: Buffer.alloc(0), hash: '', matchesExpected: false };
}

/**
 * Fetch and parse JSON from IPFS.
 * Returns null if the content cannot be fetched or parsed.
 */
export async function fetchJsonFromIpfs<T = unknown>(cid: string): Promise<T | null> {
  const result = await fetchFromIpfs(cid);
  if (!result.content.length) return null;
  try {
    return JSON.parse(result.content.toString('utf-8')) as T;
  } catch {
    console.error(`[ipfs] Failed to parse JSON for CID ${cid}`);
    return null;
  }
}
