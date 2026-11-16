/**
 * dev-all.mjs — starts the full local stack in the right order.
 * Windows PowerShell compatible (pure Node.js, no bash required).
 *
 * Usage:  npm run dev:all   (from repo root)
 *
 * Order:
 *   1. Start Hardhat node
 *   2. Wait until node responds
 *   3. Deploy contracts → write deployments/localhost.json
 *   4. Update frontend, backend, agents .env with new addresses
 *   5. Reset backend DB (delete poc.db so migrations run fresh)
 *   6. Run on-chain seed (registers providers + verifiers on-chain)
 *   7. Start backend
 *   8. Start provider agent
 *   9. Start verifier service
 *  10. Start frontend
 */
import { spawn, execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT   = dirname(dirname(fileURLToPath(import.meta.url)));
const C      = (...p) => join(ROOT, ...p);

const processes = [];

function log(tag, msg) {
  console.log(`\x1b[36m[${tag}]\x1b[0m ${msg}`);
}
function ok(tag, msg) {
  console.log(`\x1b[32m[${tag}]\x1b[0m ${msg}`);
}
function err(tag, msg) {
  console.error(`\x1b[31m[${tag}]\x1b[0m ${msg}`);
}

function spawnService(tag, cmd, args, cwd, env = {}) {
  const proc = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });
  processes.push(proc);
  proc.stdout.on('data', (d) => d.toString().split('\n').filter(Boolean).forEach(l => log(tag, l)));
  proc.stderr.on('data', (d) => d.toString().split('\n').filter(Boolean).forEach(l => log(tag, l)));
  proc.on('exit', (code) => code && err(tag, `exited with code ${code}`));
  return proc;
}

async function waitForRpc(url, maxMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
      });
      if (res.ok) return;
    } catch { /* not ready yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`RPC at ${url} did not respond within ${maxMs}ms`);
}

async function waitForHttp(url, maxMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* not ready */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`HTTP ${url} did not respond within ${maxMs}ms`);
}

function updateEnvFile(filePath, updates) {
  let content = existsSync(filePath) ? readFileSync(filePath, 'utf-8') : '';
  for (const [key, value] of Object.entries(updates)) {
    const re = new RegExp(`^${key}=.*$`, 'm');
    const line = `${key}=${value}`;
    if (re.test(content)) {
      content = content.replace(re, line);
    } else {
      content += `\n${line}`;
    }
  }
  writeFileSync(filePath, content);
}

async function main() {
  // ── Step 1: Start Hardhat node ──────────────────────────────────────────
  log('hardhat', 'Starting Hardhat node on :8545…');
  spawnService('hardhat', 'npx', ['hardhat', 'node'], C('contracts'));

  await waitForRpc('http://127.0.0.1:8545');
  ok('hardhat', 'Node is up');

  // ── Step 2: Deploy contracts ───────────────────────────────────────────
  log('deploy', 'Deploying contracts…');
  try {
    execSync('npx hardhat run scripts/deploy.ts --network localhost', {
      cwd: C('contracts'),
      stdio: 'inherit',
      timeout: 60_000,
    });
  } catch (e) {
    err('deploy', 'Deploy failed: ' + e.message);
    process.exit(1);
  }

  const deployments = JSON.parse(readFileSync(C('contracts', 'deployments', 'localhost.json'), 'utf-8'));
  const PR = deployments.ProviderRegistry.address;
  const VP = deployments.VerificationPolicy.address;
  const JE = deployments.JobEscrow.address;
  ok('deploy', `ProviderRegistry:   ${PR}`);
  ok('deploy', `VerificationPolicy: ${VP}`);
  ok('deploy', `JobEscrow:          ${JE}`);

  // ── Step 3: Sync addresses into all .env files ─────────────────────────
  log('env', 'Updating .env files with new addresses…');

  updateEnvFile(C('backend', '.env'), {
    PROVIDER_REGISTRY_ADDRESS:   PR,
    VERIFICATION_POLICY_ADDRESS: VP,
    JOB_ESCROW_ADDRESS:          JE,
  });

  updateEnvFile(C('agents', '.env'), {
    PROVIDER_REGISTRY_ADDRESS: PR,
    JOB_ESCROW_ADDRESS:        JE,
  });

  updateEnvFile(C('frontend', '.env'), {
    VITE_CONTRACT_PROVIDER_REGISTRY:   PR,
    VITE_CONTRACT_VERIFICATION_POLICY: VP,
    VITE_CONTRACT_JOB_ESCROW:          JE,
  });
  ok('env', 'All .env files updated');

  // ── Step 4: Reset backend DB so migrations run fresh ─────────────────
  const dbPath = C('backend', 'data', 'poc.db');
  if (existsSync(dbPath)) {
    unlinkSync(dbPath);
    log('db', 'Deleted stale poc.db');
  }

  // ── Step 5: Start backend (migration + indexer start automatically) ───
  log('backend', 'Starting backend on :3001…');
  spawnService('backend', 'npx', ['tsx', 'src/index.ts'], C('backend'));
  await waitForHttp('http://localhost:3001/health');
  ok('backend', 'Backend is up');

  // ── Step 6: Run on-chain seed ─────────────────────────────────────────
  log('seed', 'Running on-chain seed (register providers + verifiers)…');
  try {
    execSync('node ../scripts/seed-chain.mjs', {
      cwd: C('contracts'),
      stdio: 'inherit',
      timeout: 120_000,
      env: {
        ...process.env,
        PROVIDER_REGISTRY_ADDRESS: PR,
        JOB_ESCROW_ADDRESS: JE,
        RPC_URL: 'http://127.0.0.1:8545',
        CHAIN_ID: '31337',
        BACKEND_URL: 'http://localhost:3001',
      },
    });
  } catch (e) {
    err('seed', 'Seed failed: ' + e.message);
    // Not fatal — continue anyway
  }

  // ── Step 7: Start agents ───────────────────────────────────────────────
  log('provider', 'Starting provider agent…');
  spawnService('provider', 'npm', ['run', 'provider'], C('agents'));

  log('verifier', 'Starting verifier service…');
  spawnService('verifier', 'npm', ['run', 'verifier'], C('agents'));

  // ── Step 8: Start frontend ─────────────────────────────────────────────
  log('frontend', 'Starting frontend on :5173…');
  spawnService('frontend', 'npm', ['run', 'dev'], C('frontend'), {
    VITE_CONTRACT_PROVIDER_REGISTRY:   PR,
    VITE_CONTRACT_VERIFICATION_POLICY: VP,
    VITE_CONTRACT_JOB_ESCROW:          JE,
  });

  ok('★', '');
  ok('★', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  ok('★', ' PROOF-OF-COMPUTE STACK IS RUNNING');
  ok('★', '');
  ok('★', '  Frontend : http://localhost:5173');
  ok('★', '  Backend  : http://localhost:3001');
  ok('★', '  Chain    : http://127.0.0.1:8545  (chainId 31337)');
  ok('★', '');
  ok('★', '  MetaMask setup:');
  ok('★', '   Network : Hardhat Local');
  ok('★', '   RPC URL : http://127.0.0.1:8545');
  ok('★', '   ChainId : 31337');
  ok('★', '   Import  : ac0974bec39...ff80  (Hardhat account #0, 10 000 ETH)');
  ok('★', '');
  ok('★', '  After chain restart, go to MetaMask → Settings →');
  ok('★', '  Advanced → Reset account  (clears nonce cache).');
  ok('★', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  ok('★', '');

  // Keep alive until Ctrl-C
  process.on('SIGINT', () => {
    log('stop', 'Shutting down all services…');
    processes.forEach(p => { try { p.kill(); } catch { /* ignore */ } });
    process.exit(0);
  });
}

main().catch((e) => { console.error('[fatal]', e.message); process.exit(1); });
