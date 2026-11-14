/**
 * shared/ipfs.ts
 *
 * Helpers for fetching job specs from IPFS and uploading results via the backend.
 * Uses Member 2's backend endpoints:
 *   GET  /ipfs/:cid          — fetch by CID (backend proxies to gateway)
 *   POST /ipfs/result        — pin result artifacts, returns { cid, resultHash }
 */

const RETRY_COUNT = 3;
const RETRY_DELAY_MS = 2000;

function backendUrl(): string {
  return (process.env['BACKEND_URL'] ?? 'http://localhost:3001').replace(/\/$/, '');
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a job spec JSON from the backend IPFS proxy.
 * Retries up to 3 times with 2-second backoff on transient failure.
 */
export async function fetchSpec(cid: string): Promise<object> {
  const url = `${backendUrl()}/ipfs/${encodeURIComponent(cid)}`;

  for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Backend returned ${response.status} for CID ${cid}: ${text}`);
      }

      const contentType = response.headers.get('content-type') ?? '';
      if (contentType.includes('application/json')) {
        return (await response.json()) as object;
      }
      // Some gateways return raw bytes; try to parse as JSON anyway
      const text = await response.text();
      return JSON.parse(text) as object;
    } catch (err) {
      if (attempt === RETRY_COUNT) {
        throw new Error(`fetchSpec(${cid}) failed after ${RETRY_COUNT} attempts: ${(err as Error).message}`);
      }
      console.warn(`[ipfs] fetchSpec attempt ${attempt} failed, retrying in ${RETRY_DELAY_MS}ms…`);
      await sleep(RETRY_DELAY_MS);
    }
  }

  // Unreachable but satisfies TypeScript
  throw new Error(`fetchSpec(${cid}) failed`);
}

/**
 * Fetch the raw result blob for a given result CID.
 * Returns the response body as a Buffer.
 */
export async function fetchResult(cid: string): Promise<Buffer> {
  const url = `${backendUrl()}/ipfs/${encodeURIComponent(cid)}`;

  for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30_000),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Backend returned ${response.status} for CID ${cid}: ${text}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err) {
      if (attempt === RETRY_COUNT) {
        throw new Error(`fetchResult(${cid}) failed after ${RETRY_COUNT} attempts: ${(err as Error).message}`);
      }
      console.warn(`[ipfs] fetchResult attempt ${attempt} failed, retrying in ${RETRY_DELAY_MS}ms…`);
      await sleep(RETRY_DELAY_MS);
    }
  }

  throw new Error(`fetchResult(${cid}) failed`);
}

export interface UploadResultResponse {
  cid: string;
  resultHash: string; // 0x-prefixed hex bytes32
}

/**
 * Upload provider result artifacts to IPFS via the backend.
 * POST /ipfs/result  →  { cid, resultHash }
 */
export async function uploadResult(
  jobId: string | bigint,
  resultBlob: Buffer,
  checkpoints: string[]
): Promise<UploadResultResponse> {
  const url = `${backendUrl()}/ipfs/result`;
  const body = {
    jobId: jobId.toString(),
    resultBlob: resultBlob.toString('base64'),
    checkpoints,
  };

  for (let attempt = 1; attempt <= RETRY_COUNT; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Backend returned ${response.status} for POST /ipfs/result: ${text}`);
      }

      return (await response.json()) as UploadResultResponse;
    } catch (err) {
      if (attempt === RETRY_COUNT) {
        throw new Error(`uploadResult(jobId=${jobId}) failed after ${RETRY_COUNT} attempts: ${(err as Error).message}`);
      }
      console.warn(`[ipfs] uploadResult attempt ${attempt} failed, retrying in ${RETRY_DELAY_MS}ms…`);
      await sleep(RETRY_DELAY_MS);
    }
  }

  throw new Error(`uploadResult(jobId=${jobId}) failed`);
}
