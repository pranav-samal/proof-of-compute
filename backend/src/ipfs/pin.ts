/**
 * pin.ts — Pin content to Pinata IPFS.
 *
 * Uses the Pinata v1 pinning API with JWT auth.
 * Returns the IPFS CID on success.
 *
 * If PINATA_JWT is not set, throws immediately so the caller
 * can return a clear 503 to the client.
 */
import crypto from 'crypto';
import { PINATA_JWT, ipfsConfigured } from '../config.js';

const PINATA_PIN_URL = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';
const PINATA_PIN_FILE_URL = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

// ─── Types ────────────────────────────────────────────────────────────────

export interface PinResult {
  cid: string;
  /** SHA-256 hex digest of the serialised content — stored on-chain */
  contentHash: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function sha256hex(data: string | Buffer): string {
  return crypto
    .createHash('sha256')
    .update(typeof data === 'string' ? Buffer.from(data) : data)
    .digest('hex');
}

function assertConfigured(): void {
  if (!ipfsConfigured()) {
    throw new Error('IPFS not configured: PINATA_JWT is missing in .env');
  }
}

// ─── Pin JSON ─────────────────────────────────────────────────────────────

/**
 * Pin a JSON object to Pinata.
 * @param content   Any JSON-serialisable object (job spec, profile, etc.)
 * @param name      Optional label shown in the Pinata dashboard
 * @returns         { cid, contentHash }
 */
export async function pinJson(
  content: unknown,
  name = 'proof-of-compute'
): Promise<PinResult> {
  assertConfigured();

  const body = JSON.stringify({
    pinataContent: content,
    pinataMetadata: { name },
  });

  const contentHash = sha256hex(JSON.stringify(content));

  const response = await fetch(PINATA_PIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Pinata error ${response.status}: ${text}`);
  }

  const data = await response.json() as { IpfsHash: string };
  return { cid: data.IpfsHash, contentHash };
}

// ─── Pin raw buffer ───────────────────────────────────────────────────────

/**
 * Pin a raw binary buffer to Pinata (for result artifacts).
 * @param buffer    Binary content
 * @param filename  Filename shown in Pinata dashboard
 * @returns         { cid, contentHash }
 */
export async function pinBuffer(
  buffer: Buffer,
  filename = 'result'
): Promise<PinResult> {
  assertConfigured();

  const contentHash = sha256hex(buffer);

  // Pinata file pin uses multipart/form-data
  const formData = new FormData();
  const blob = new Blob([buffer]);
  formData.append('file', blob, filename);
  formData.append(
    'pinataMetadata',
    JSON.stringify({ name: filename })
  );

  const response = await fetch(PINATA_PIN_FILE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
      // Note: do NOT set Content-Type — fetch sets it automatically with boundary
    },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Pinata file pin error ${response.status}: ${text}`);
  }

  const data = await response.json() as { IpfsHash: string };
  return { cid: data.IpfsHash, contentHash };
}
