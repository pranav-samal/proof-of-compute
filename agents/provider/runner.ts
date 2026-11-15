/**
 * provider/runner.ts
 *
 * Execute a job spec either:
 *   - In a Docker container (NO_DOCKER=false, default)
 *   - Directly in Node.js (NO_DOCKER=true, for local dev)
 *
 * Returns resultBlob (Buffer) and checkpoints (hex string array).
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as shaChain from '../jobs/sha-chain.js';
import * as matmul from '../jobs/matmul.js';

const execFileAsync = promisify(execFile);

export interface JobSpec {
  type: 'sha-chain' | 'matmul';
  params: Record<string, unknown>;
  image?: string;
  resources?: {
    cpuCores?: number;
    memoryMb?: number;
    timeLimitSecs?: number;
  };
}

export interface RunResult {
  resultBlob: Buffer;
  checkpoints: string[];
  resultHash: string; // sha256 hex (matmul) OR keccak256 hex (sha-chain) — ready to commit
  finalHash?: string; // raw final SHA-256 state (sha-chain only)
}

// ─── Docker runner ────────────────────────────────────────────────────────────

async function runInDocker(spec: JobSpec, timeoutSeconds: number): Promise<RunResult> {
  const image = spec.image ?? 'poc-runner:latest';
  const cpus = spec.resources?.cpuCores?.toString() ?? '1';
  const memMb = spec.resources?.memoryMb ?? 512;
  const timeLimitSecs = spec.resources?.timeLimitSecs ?? timeoutSeconds;

  const dockerArgs = [
    'run',
    '--rm',
    '--cpus', cpus,
    '--memory', `${memMb}m`,
    '--network', 'none',         // no outbound network from job containers
    image,
    JSON.stringify({ type: spec.type, params: spec.params }),
  ];

  const runtime = process.env['CONTAINER_RUNTIME'] ?? 'docker';

  try {
    const { stdout } = await execFileAsync(runtime, dockerArgs, {
      timeout: timeLimitSecs * 1000,
      maxBuffer: 100 * 1024 * 1024, // 100 MB
    });

    // The container is expected to print a JSON result to stdout
    const parsed = JSON.parse(stdout.trim()) as {
      resultBlob: string;         // base64
      checkpoints: string[];
      resultHash: string;
      finalHash?: string;
    };

    return {
      resultBlob: Buffer.from(parsed.resultBlob, 'base64'),
      checkpoints: parsed.checkpoints,
      resultHash: parsed.resultHash,
      finalHash: parsed.finalHash,
    };
  } catch (err) {
    const error = err as NodeJS.ErrnoError & { killed?: boolean };
    if (error.killed || (error as { signal?: string }).signal === 'SIGTERM') {
      throw new Error(`Docker container timed out after ${timeLimitSecs}s for job type "${spec.type}"`);
    }
    throw new Error(`Docker run failed: ${error.message}`);
  }
}

// ─── In-process runner (NO_DOCKER=true) ──────────────────────────────────────

function runInProcess(spec: JobSpec): RunResult {
  if (spec.type === 'sha-chain') {
    const params = spec.params as shaChain.ShaChainParams;
    const result = shaChain.execute(params);

    return {
      resultBlob: Buffer.from(result.finalHash.slice(2), 'hex'),
      checkpoints: result.checkpoints,
      resultHash: result.resultHash,
      finalHash: result.finalHash,
    };
  }

  if (spec.type === 'matmul') {
    const params = spec.params as matmul.MatmulParams;
    const result = matmul.execute(params);

    return {
      resultBlob: result.blob,
      checkpoints: [],
      resultHash: '0x' + result.resultHash,
      finalHash: undefined,
    };
  }

  throw new Error(`Unsupported workload type: "${(spec as JobSpec).type}"`);
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Run a job spec and return the result.
 *
 * Uses Docker when NO_DOCKER=false (or unset).
 * Falls back to in-process execution when NO_DOCKER=true.
 */
export async function run(spec: JobSpec, maxDurationSeconds?: number): Promise<RunResult> {
  const noDocker = (process.env['NO_DOCKER'] ?? 'false').toLowerCase() === 'true';
  const timeout = maxDurationSeconds ?? parseInt(process.env['MAX_JOB_DURATION_SECONDS'] ?? '300', 10);

  if (noDocker) {
    console.log(`[runner] NO_DOCKER=true — running ${spec.type} in-process`);
    return runInProcess(spec);
  }

  console.log(`[runner] Running ${spec.type} in Docker image ${spec.image ?? 'poc-runner:latest'}`);
  return runInDocker(spec, timeout);
}
