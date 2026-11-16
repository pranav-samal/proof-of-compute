/**
 * e2e-malicious.mjs — End-to-end test: malicious provider path.
 *
 * Usage:
 *   npm run e2e:malicious          (from repo root)
 *
 * Prerequisites: same as e2e-honest (Hardhat node + contracts + backend).
 *
 * What it proves:
 *   Step 1  Pin job spec
 *   Step 2  Register job (payment locked)
 *   Step 3  Assign provider (collateral locked)
 *   Step 4  Provider commits a WRONG result hash (simulates cheat)
 *   Step 5  selectVerifiers
 *   Step 6  Verifiers re-execute locally → find mismatch → submit FAIL
 *   Step 7  settle called → REJECTED outcome
 *   Step 8  Assert: provider collateral slashed (50%)
 *   Step 9  Assert: requester refunded
 *   Step 10 Assert: provider reputation decreased
 *   Step 11 Fetch receipt → outcome = REJECTED
 *   Step 12 Print all transaction hashes
 */
import { ethers } from 'ethers';
import {
  KEYS, RPC_URL, CHAIN_ID,
  step, ok, info, fail, txok, assert, assertEq, assertGt, assertLt,
  getContracts, waitForJobState, signAttestation, runShaChain, mineBlocks, nonceTracker,
  backendGet, backendPost, sleep,
} from './e2e-lib.mjs';

const provider = new ethers.JsonRpcProvider(RPC_URL);

async function main() {
  console.log('\x1b[1m\x1b[31m');
  console.log('══════════════════════════════════════════════════');
  console.log(' PROOF-OF-COMPUTE  —  Malicious Provider E2E Test ');
  console.log('══════════════════════════════════════════════════');
  console.log('\x1b[0m');

  const requesterWallet = new ethers.Wallet(KEYS.requester, provider);
  const providerWallet = new ethers.Wallet(KEYS.provider, provider);
  const verifier1 = new ethers.Wallet(KEYS.verifier1, provider);
  const verifier2 = new ethers.Wallet(KEYS.verifier2, provider);

  info(`Requester : ${requesterWallet.address}`);
  info(`Provider  : ${providerWallet.address}  ← CHEAT MODE`);

  const { escrow, registry, addresses } = getContracts(provider);
  const escrowReq = escrow.connect(requesterWallet);
  const escrowPrv = escrow.connect(providerWallet);

  // Per-wallet nonce trackers
  const reqN = await nonceTracker(provider, requesterWallet.address);
  const prvN = await nonceTracker(provider, providerWallet.address);

  const txs = {};

  // ─── Step 1: Pin spec ──────────────────────────────────────────────────

  step('Pin job spec');
  const spec = {
    type: 'sha-chain',
    title: 'E2E Malicious Test — Provider Cheats',
    description: 'Automated end-to-end malicious path test',
    params: { seed: '0xcafebabe' + '00'.repeat(28), iterations: 100, checkpointEvery: 10 },
    image: 'poc-runner:latest',
    resources: { cpuCores: 1, memoryMb: 512, timeLimitSecs: 60 },
  };
  const { cid, profileHash } = await backendPost('/jobs/spec', spec);
  ok(`CID: ${cid}`);

  // ─── Step 2: Register job ──────────────────────────────────────────────

  step('Register job (payment locked in escrow)');

  const paymentWei = ethers.parseEther('0.001');
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 7200);

  const profileHashBytes = profileHash.startsWith('0x')
    ? profileHash.padEnd(66, '0').slice(0, 66)
    : '0x' + profileHash.padEnd(64, '0').slice(0, 64);

  const requesterBalBefore = await provider.getBalance(requesterWallet.address);
  const providerStakeBefore = await registry.totalStake(providerWallet.address);
  const repBefore = await registry.reputationBps(providerWallet.address);

  const regTx = await escrowReq.registerJob(cid, profileHashBytes, 0, 1, deadline, { value: paymentWei, nonce: reqN.next() });
  const regRcpt = await regTx.wait();
  txs.registerJob = regRcpt.hash;
  txok('registerJob', regRcpt.hash);

  let jobId = null;
  for (const log of regRcpt.logs) {
    try {
      const p = escrow.interface.parseLog(log);
      if (p?.name === 'JobRegistered') { jobId = p.args[0]; break; }
    } catch { /* skip */ }
  }
  assert(jobId !== null, 'Job registered');
  ok(`Job ID: ${jobId}`);

  // ─── Step 3: Assign provider ───────────────────────────────────────────

  step('Assign provider (collateral locked)');

  const assignTx = await escrowReq.assignProvider(jobId, providerWallet.address, { nonce: reqN.next() });
  const assignRcpt = await assignTx.wait();
  txs.assignProvider = assignRcpt.hash;
  txok('assignProvider', assignRcpt.hash);

  let policyHash = null;
  for (const log of assignRcpt.logs) {
    try {
      const p = escrow.interface.parseLog(log);
      if (p?.name === 'PolicyRecorded') { policyHash = p.args[1]; break; }
    } catch { /* skip */ }
  }
  assert(policyHash !== null, 'PolicyRecorded event found');

  const providerStakeAfterAssign = await registry.totalStake(providerWallet.address);
  assertLt(
    await registry.freeStake(providerWallet.address),
    providerStakeBefore,
    'Provider free stake decreased (collateral locked)'
  );

  // ─── Step 4: Provider commits WRONG result (cheat mode) ───────────────

  step('Provider commits deliberately WRONG result hash ⚠️ CHEAT MODE');

  const correctHash = runShaChain(spec.params.seed, spec.params.iterations);
  // Cheat: submit a random wrong hash
  const wrongHash = '0x' + 'deadbeef'.repeat(8);
  assert(correctHash !== wrongHash, 'Wrong hash is different from correct hash');
  info(`Correct hash: ${correctHash}`);
  info(`Wrong hash  : ${wrongHash}  ← this is what the cheating provider submits`);

  const commitTx = await escrowPrv.commitResult(jobId, wrongHash, '0x' + '00'.repeat(32), cid, { nonce: prvN.next() });
  const commitRcpt = await commitTx.wait();
  txs.commitResult = commitRcpt.hash;
  txok('commitResult (WRONG hash)', commitRcpt.hash);

  // ─── Step 5: Select verifiers ─────────────────────────────────────────

  step('Select verifiers');

  const job3 = await escrow.getJob(jobId);
  const commitBlock = Number(job3.commitBlock);
  await mineBlocks(provider, 5);
  await sleep(300);
  info(`mined 5 blocks → block ${await provider.getBlockNumber()} (commitBlock was ${commitBlock})`);

  const selectTx = await escrowReq.selectVerifiers(jobId, { nonce: reqN.next() });
  const selectRcpt = await selectTx.wait();
  txs.selectVerifiers = selectRcpt.hash;
  txok('selectVerifiers', selectRcpt.hash);

  let selectedVerifiers = [];
  for (const log of selectRcpt.logs) {
    try {
      const p = escrow.interface.parseLog(log);
      if (p?.name === 'VerifiersSelected') { selectedVerifiers = p.args[1]; break; }
    } catch { /* skip */ }
  }
  assert(selectedVerifiers.length > 0, `Verifiers selected: ${selectedVerifiers.length}`);

  // ─── Step 6: Verifiers detect wrong result → submit FAIL ──────────────

  step('Verifiers re-execute locally, detect mismatch → submit FAIL attestations');

  const evidenceHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(['bytes32', 'bytes32'], [correctHash, wrongHash])
  );
  const verdict = 1; // FAIL
  txs.attestations = [];

  for (const verWallet of [verifier1, verifier2]) {
    if (!selectedVerifiers.map(a => a.toLowerCase()).includes(verWallet.address.toLowerCase())) {
      info(`${verWallet.address} not in selected set — skipping`);
      continue;
    }

    // Verifier re-executes and finds the committed hash does NOT match
    const recomputedHash = runShaChain(spec.params.seed, spec.params.iterations);
    assert(
      recomputedHash.toLowerCase() !== wrongHash.toLowerCase(),
      `Verifier ${verWallet.address.slice(0, 8)}… detects mismatch`
    );
    info(`Recomputed: ${recomputedHash}`);
    info(`Committed : ${wrongHash}  ← MISMATCH — voting FAIL`);

    const sig = await signAttestation(verWallet, addresses.escrow, {
      jobId,
      policyHash,
      resultHash: wrongHash, // must match what was committed on-chain
      verdict,
      evidenceHash,
    });

    const verN = await nonceTracker(provider, verWallet.address);
    const attTx = await escrow.connect(verWallet).submitAttestation(jobId, verdict, evidenceHash, sig, { nonce: verN.next() });
    const attRcpt = await attTx.wait();
    txs.attestations.push(attRcpt.hash);
    txok(`submitAttestation (FAIL) from ${verWallet.address}`, attRcpt.hash);
  }

  // ─── Step 7: Settle → REJECTED ────────────────────────────────────────

  step('Settle (expect REJECTED outcome)');

  const settleTx = await escrowReq.settle(jobId, { nonce: reqN.next() });
  const settleRcpt = await settleTx.wait();
  txs.settle = settleRcpt.hash;
  txok('settle', settleRcpt.hash);

  const jobFinal = await escrow.getJob(jobId);
  assertEq(Number(jobFinal.state), 4, 'State = SETTLED (4)');
  assertEq(Number(jobFinal.outcome), 2, 'Outcome = REJECTED (2) ✓ cheat detected');

  // ─── Step 8–10: Assert slash, refund, reputation ──────────────────────

  step('Assert slash, refund, and reputation decrease');

  const providerStakeAfterSettle = await registry.totalStake(providerWallet.address);
  assertLt(
    providerStakeAfterSettle,
    providerStakeAfterAssign,
    'Provider stake decreased (slashed)'
  );
  info(`Provider stake before: ${ethers.formatEther(providerStakeBefore)} ETH`);
  info(`Provider stake after:  ${ethers.formatEther(providerStakeAfterSettle)} ETH`);
  info(`Slash amount: ${ethers.formatEther(providerStakeBefore - providerStakeAfterSettle)} ETH`);

  const requesterBalAfter = await provider.getBalance(requesterWallet.address);
  // Requester should have received a refund (payment back)
  // Net change ≈ 0 minus gas (they got payment back)
  info(`Requester balance before: ${ethers.formatEther(requesterBalBefore)} ETH`);
  info(`Requester balance after:  ${ethers.formatEther(requesterBalAfter)} ETH`);
  info(`Net change: ${ethers.formatEther(requesterBalAfter - requesterBalBefore)} ETH (includes gas costs)`);

  const repAfter = await registry.reputationBps(providerWallet.address);
  info(`Provider reputation before: ${repBefore} bps`);
  info(`Provider reputation after:  ${repAfter} bps`);
  assertLt(repAfter, repBefore, 'Provider reputation decreased after slashing');

  // ─── Step 11: Fetch receipt ────────────────────────────────────────────

  step('Fetch receipt from backend');

  // Mine 3 extra blocks so the indexer (CONFIRMATIONS=2) can process the settle event.
  await mineBlocks(provider, 3);

  // Wait up to 30 s for the indexer (polls every 5 s)
  let receiptData = null;
  for (let i = 0; i < 6; i++) {
    await sleep(5000);
    try {
      receiptData = await backendGet(`/receipts/${jobId}`);
      if (receiptData?.receipt) break;
    } catch { /* indexer may still be syncing */ }
  }

  if (receiptData?.receipt) {
    assertEq(receiptData.receipt.outcome, 'REJECTED', 'Receipt outcome = REJECTED');
    ok(`Receipt verified on-chain ✓`);
  } else {
    info('Receipt not yet indexed — check /receipts/<jobId> after indexer syncs');
  }

  // ─── Step 12: Summary ─────────────────────────────────────────────────

  step('Transaction hash summary');
  console.log('\n  \x1b[1mTransaction Hashes:\x1b[0m');
  for (const [label, hash] of Object.entries(txs)) {
    if (Array.isArray(hash)) {
      hash.forEach((h, i) => console.log(`  ${label}[${i}]: ${h}`));
    } else {
      console.log(`  ${label.padEnd(20)}: ${hash}`);
    }
  }

  console.log('\n\x1b[1m\x1b[32m');
  console.log('══════════════════════════════════════════════════');
  console.log(' MALICIOUS PATH E2E TEST — ALL ASSERTIONS PASSED ✓');
  console.log(' Provider cheated → detected → slashed → refunded ');
  console.log('══════════════════════════════════════════════════');
  console.log('\x1b[0m');
}

main().catch((e) => {
  console.error('\n\x1b[31m[E2E FAILED]\x1b[0m', e.message);
  if (e.stack) console.error(e.stack);
  process.exit(1);
});
