/**
 * jobs/matmul.ts
 *
 * matmul workload executor (Reproducibility class T — tolerance-bound).
 *
 * Spec §7.3:
 *   Generate matrices A and B from seeds, multiply, return result matrix
 *   as a binary blob.  resultHash = sha256(blob).
 *
 *   Verification: re-run, compare element-wise with relative tolerance 1e-6.
 *   FAIL if maxRelativeError > 1e-6.
 *
 * Matrix generation: we use a seeded LCG (linear congruential generator) so
 * the matrices are deterministically reproducible without numpy.  The LCG
 * parameters match the reference implementation in the SPEC.
 */

import { createHash } from 'crypto';

export interface MatmulParams {
  seedA: string;        // hex string, 32 bytes
  seedB: string;        // hex string, 32 bytes
  size: number;         // N×N
  precision: 'float32' | 'float64';
}

export interface MatmulResult {
  resultHash: string;   // sha256 hex of the binary blob (no 0x prefix)
  blob: Buffer;         // raw binary representation of the result matrix
}

// ─── Deterministic matrix generation ─────────────────────────────────────────

/**
 * Seeded LCG that produces values in [0, 1).
 * We seed it with the first 4 bytes of sha256(seed) to get a uint32.
 */
class SeededRng {
  private state: number;

  constructor(seed: string) {
    // sha256(seed) → take first 4 bytes as uint32
    const hex = seed.startsWith('0x') ? seed.slice(2) : seed;
    const hash = createHash('sha256').update(Buffer.from(hex, 'hex')).digest();
    this.state = hash.readUInt32BE(0);
  }

  /** Next pseudo-random float in [0, 1). */
  next(): number {
    // LCG constants from Numerical Recipes
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }
}

/** Generate an N×N matrix from a seed. Returns a flat Float64Array. */
function generateMatrix(seed: string, n: number): Float64Array {
  const rng = new SeededRng(seed);
  const m = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) {
    m[i] = rng.next() * 2 - 1; // values in [-1, 1)
  }
  return m;
}

/** Multiply two N×N matrices (flat Float64Arrays). Returns a Float64Array. */
function matmul(a: Float64Array, b: Float64Array, n: number): Float64Array {
  const c = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < n; k++) {
      const aik = a[i * n + k]!;
      for (let j = 0; j < n; j++) {
        c[i * n + j]! += aik * b[k * n + j]!;
      }
    }
  }
  return c;
}

/** Serialise a Float64Array or Float32Array to Buffer (little-endian). */
function matrixToBuffer(matrix: Float64Array | Float32Array): Buffer {
  return Buffer.from(matrix.buffer, matrix.byteOffset, matrix.byteLength);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Execute the matmul workload.
 * Returns the result blob and its SHA-256 hash.
 */
export function execute(params: MatmulParams): MatmulResult {
  const { seedA, seedB, size, precision } = params;

  if (size <= 0) throw new Error('size must be > 0');

  const a = generateMatrix(seedA, size);
  const b = generateMatrix(seedB, size);
  const c = matmul(a, b, size);

  let blob: Buffer;
  if (precision === 'float32') {
    // Downcast to float32
    const c32 = new Float32Array(c.length);
    for (let i = 0; i < c.length; i++) {
      c32[i] = Math.fround(c[i]!);
    }
    blob = matrixToBuffer(c32);
  } else {
    blob = matrixToBuffer(c);
  }

  const resultHash = createHash('sha256').update(blob).digest('hex');
  return { resultHash, blob };
}

/**
 * Verify the result blob against a fresh computation.
 *
 * Returns true if max relative error ≤ tolerance (1e-6).
 */
export function verify(params: MatmulParams, resultBlob: Buffer): boolean {
  const { seedA, seedB, size, precision, tolerance = 1e-6 } = params as MatmulParams & { tolerance?: number };

  const a = generateMatrix(seedA, size);
  const b = generateMatrix(seedB, size);
  const c = matmul(a, b, size);

  // Deserialise resultBlob back to a typed array
  let submitted: Float64Array | Float32Array;
  if (precision === 'float32') {
    if (resultBlob.length !== size * size * 4) return false;
    submitted = new Float32Array(
      resultBlob.buffer,
      resultBlob.byteOffset,
      size * size
    );
  } else {
    if (resultBlob.length !== size * size * 8) return false;
    submitted = new Float64Array(
      resultBlob.buffer,
      resultBlob.byteOffset,
      size * size
    );
  }

  let maxRelError = 0;
  for (let i = 0; i < c.length; i++) {
    const ref = c[i]!;
    const got = submitted[i]!;
    const denom = Math.abs(ref);
    if (denom < Number.EPSILON) {
      // Near-zero reference — use absolute error
      const absErr = Math.abs(got - ref);
      maxRelError = Math.max(maxRelError, absErr);
    } else {
      maxRelError = Math.max(maxRelError, Math.abs(got - ref) / denom);
    }
    if (maxRelError > tolerance) return false; // early exit
  }

  return maxRelError <= tolerance;
}
