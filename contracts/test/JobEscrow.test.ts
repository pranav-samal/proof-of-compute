import { expect } from "chai";
import { ethers, network } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { commitAndSelect, createAssignedJob, deploySystem, ether, submitVote } from "./helpers";

describe("JobEscrow", function () {
  it("registerJob stores the fields and emits JobRegistered", async function () {
    const { requester, escrow } = await deploySystem();
    const latest = await ethers.provider.getBlock("latest");
    const deadline = BigInt(latest!.timestamp + 3600);
    const payment = ether("1");
    await expect(escrow.connect(requester).registerJob("bafy-job-spec", ethers.keccak256(ethers.toUtf8Bytes("profile")), 0, 0, deadline, { value: payment }))
      .to.emit(escrow, "JobRegistered").withArgs(1, requester.address, "bafy-job-spec", ethers.keccak256(ethers.toUtf8Bytes("profile")), payment);
    const jobId = 1n;
    const job = await escrow.getJob(jobId);
    expect([job.requester, job.provider, job.specCid, job.payment, job.deadline, job.state]).to.deep.equal([
      requester.address, ethers.ZeroAddress, "bafy-job-spec", payment, deadline, 0n,
    ]);
  });

  it("assignProvider locks collateral, records the policy hash, and emits events", async function () {
    const { requester, provider, registry, escrow, policy } = await deploySystem();
    const latest = await ethers.provider.getBlock("latest");
    const payment = ether("1");
    const tx = await escrow.connect(requester).registerJob("bafy-job-spec", ethers.ZeroHash, 0, 0, BigInt(latest!.timestamp + 3600), { value: payment });
    const receipt = await tx.wait();
    const registration = receipt!.logs.map((log) => { try { return escrow.interface.parseLog(log); } catch { return null; } }).find((log) => log?.name === "JobRegistered")!;
    const jobId = registration.args.jobId as bigint;
    const selectedPolicy = await policy.derivePolicy(payment, provider.address, 0, 0);
    const expectedPolicyHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
      ["tuple(uint8,uint16,uint8,uint8,uint256,uint32)"], [[
        selectedPolicy.tier, selectedPolicy.samplingBps, selectedPolicy.verifierCount,
        selectedPolicy.quorum, selectedPolicy.collateral, selectedPolicy.challengeWindow,
      ]],
    ));
    await expect(escrow.connect(requester).assignProvider(jobId, provider.address))
      .to.emit(escrow, "PolicyRecorded").withArgs(jobId, expectedPolicyHash, 0, selectedPolicy.samplingBps, selectedPolicy.collateral, 0)
      .and.to.emit(escrow, "ProviderAssigned").withArgs(jobId, provider.address);
    const assignedJob = await escrow.getJob(jobId);
    expect(assignedJob.policyHash).to.equal(expectedPolicyHash);
    expect(await registry.freeStake(provider.address)).to.equal(ether("10") - selectedPolicy.collateral);
  });

  it("assignProvider reverts when provider free stake is below collateral", async function () {
    const { requester, provider, registry, escrow } = await deploySystem();
    await registry.connect(provider).withdrawStake(ether("9.9"));
    const latest = await ethers.provider.getBlock("latest");
    const tx = await escrow.connect(requester).registerJob("bafy", ethers.ZeroHash, 0, 0, BigInt(latest!.timestamp + 3600), { value: ether("1") });
    const receipt = await tx.wait();
    const event = receipt!.logs.map((log) => { try { return escrow.interface.parseLog(log); } catch { return null; } }).find((log) => log?.name === "JobRegistered")!;
    await expect(escrow.connect(requester).assignProvider(event.args.jobId, provider.address))
      .to.be.revertedWith("ProviderRegistry: insufficient free stake");
  });

  it("commitResult stores the result hash and emits ResultCommitted", async function () {
    const { requester, provider, escrow } = await deploySystem();
    const { jobId, deadline } = await createAssignedJob(requester, provider.address, escrow);
    const resultHash = ethers.keccak256(ethers.toUtf8Bytes("result"));
    const checkpointRoot = ethers.keccak256(ethers.toUtf8Bytes("checkpoint"));
    await expect(escrow.connect(provider).commitResult(jobId, resultHash, checkpointRoot, "bafy-result"))
      .to.emit(escrow, "ResultCommitted").withArgs(jobId, resultHash, checkpointRoot, "bafy-result");
    await network.provider.send("hardhat_mine", ["0x2"]);
    await escrow.selectVerifiers(jobId);
    const job = await escrow.getJob(jobId);
    expect([job.resultHash, job.checkpointRoot, job.resultCid, job.state]).to.deep.equal([resultHash, checkpointRoot, "bafy-result", 3n]);
  });

  it("commitResult reverts after the job deadline", async function () {
    const { requester, provider, escrow } = await deploySystem();
    const { jobId, deadline } = await createAssignedJob(requester, provider.address, escrow, { deadlineSeconds: 60 });
    await time.increaseTo(deadline + 1n);
    await expect(escrow.connect(provider).commitResult(jobId, ethers.ZeroHash, ethers.ZeroHash, "bafy"))
      .to.be.revertedWith("JobEscrow: deadline passed");
  });

  it("selectVerifiers selects the policy count and emits VerifiersSelected", async function () {
    const { requester, provider, escrow, policy } = await deploySystem();
    const { jobId, deadline } = await createAssignedJob(requester, provider.address, escrow);
    await escrow.connect(provider).commitResult(jobId, ethers.ZeroHash, ethers.ZeroHash, "bafy");
    await expect(escrow.selectVerifiers(jobId)).to.be.revertedWith("JobEscrow: too early");
    await network.provider.send("hardhat_mine", ["0x2"]);
    const policyInfo = await policy.derivePolicy(ether("1"), provider.address, 0, 0);
    await expect(escrow.selectVerifiers(jobId)).to.emit(escrow, "VerifiersSelected");
    expect(await escrow.selectedVerifiers(jobId)).to.have.length(Number(policyInfo.verifierCount));
    expect((await escrow.getJob(jobId)).verifyDeadline).to.equal(deadline);
  });

  it("accepts a valid EIP-712 signature from a selected verifier", async function () {
    const { requester, provider, verifiers, escrow } = await deploySystem();
    const { jobId, deadline } = await createAssignedJob(requester, provider.address, escrow);
    await commitAndSelect(escrow, provider, jobId, deadline);
    const selected = (await escrow.selectedVerifiers(jobId))[0];
    const verifier = verifiers.find((candidate) => candidate.address.toLowerCase() === selected.toLowerCase())!;
    const submitted = await submitVote(escrow, requester, verifier, jobId, 0);
    await expect(submitted.transaction).to.emit(escrow, "AttestationSubmitted").withArgs(jobId, verifier.address, 0, submitted.evidenceHash);
    expect((await escrow.getAttestation(jobId, 0)).verifier).to.equal(verifier.address);
  });

  it("rejects attestations from non-selected verifiers and duplicate attestations", async function () {
    const { requester, provider, verifiers, escrow } = await deploySystem();
    const { jobId, deadline } = await createAssignedJob(requester, provider.address, escrow);
    await commitAndSelect(escrow, provider, jobId, deadline);
    const selected = (await escrow.selectedVerifiers(jobId))[0].toLowerCase();
    const outsider = verifiers.find((candidate) => candidate.address.toLowerCase() !== selected)!;
    const job = await escrow.getJob(jobId);
    const chain = await ethers.provider.getNetwork();
    const domain = { name: "ProofOfCompute", version: "1", chainId: chain.chainId, verifyingContract: await escrow.getAddress() };
    const types = { Attestation: [
      { name: "jobId", type: "uint256" }, { name: "policyHash", type: "bytes32" }, { name: "resultHash", type: "bytes32" },
      { name: "verdict", type: "uint8" }, { name: "evidenceHash", type: "bytes32" },
    ] };
    const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes("evidence"));
    const signature = await outsider.signTypedData(domain, types, { jobId, policyHash: job.policyHash, resultHash: job.resultHash, verdict: 0, evidenceHash });
    await expect(escrow.connect(requester).submitAttestation(jobId, 0, evidenceHash, signature)).to.be.revertedWith("JobEscrow: not selected verifier");
    const selectedSigner = verifiers.find((candidate) => candidate.address.toLowerCase() === selected)!;
    const accepted = await submitVote(escrow, requester, selectedSigner, jobId, 0);
    const acceptedJob = await escrow.getJob(jobId);
    const duplicate = await selectedSigner.signTypedData(domain, types, {
      jobId, policyHash: acceptedJob.policyHash, resultHash: acceptedJob.resultHash, verdict: 0, evidenceHash: accepted.evidenceHash,
    });
    await expect(escrow.connect(requester).submitAttestation(jobId, 0, accepted.evidenceHash, duplicate)).to.be.revertedWith("JobEscrow: already attested");
  });

  it("settles ACCEPTED work, paying the provider minus the fee and matching verifiers", async function () {
    const { owner, requester, provider, verifiers, registry, escrow } = await deploySystem();
    const { jobId, deadline, payment } = await createAssignedJob(requester, provider.address, escrow);
    await commitAndSelect(escrow, provider, jobId, deadline);
    const selected = (await escrow.selectedVerifiers(jobId))[0];
    const verifier = verifiers.find((candidate) => candidate.address.toLowerCase() === selected.toLowerCase())!;
    await submitVote(escrow, requester, verifier, jobId, 0);
    const balanceBefore = await ethers.provider.getBalance(provider.address);
    const fee = payment * 200n / 10_000n;
    await expect(escrow.connect(owner).settle(jobId)).to.emit(escrow, "JobSettled").withArgs(jobId, 1);
    expect(await ethers.provider.getBalance(provider.address)).to.equal(balanceBefore + payment - fee);
    expect((await escrow.getJob(jobId)).outcome).to.equal(1);
    expect(await registry.freeStake(provider.address)).to.equal(ether("10"));
  });

  it("settles REJECTED work, refunds payment, shares collateral, and charges the fee to additional collateral", async function () {
    const { owner, requester, provider, verifiers, registry, escrow } = await deploySystem();
    const { jobId, deadline, payment } = await createAssignedJob(requester, provider.address, escrow);
    await commitAndSelect(escrow, provider, jobId, deadline);
    const selected = (await escrow.selectedVerifiers(jobId))[0];
    const verifier = verifiers.find((candidate) => candidate.address.toLowerCase() === selected.toLowerCase())!;
    await submitVote(escrow, requester, verifier, jobId, 1);
    const requesterBefore = await ethers.provider.getBalance(requester.address);
    const fee = payment * 200n / 10_000n;
    await escrow.connect(owner).settle(jobId);
    expect(await ethers.provider.getBalance(requester.address)).to.equal(requesterBefore + payment + (ether("0.53") / 4n));
    expect((await escrow.getJob(jobId)).outcome).to.equal(2);
    expect(await registry.totalStake(provider.address)).to.equal(ether("10") - ether("0.53") / 2n - fee);
    expect(await registry.freeStake(provider.address)).to.equal(await registry.totalStake(provider.address));
  });

  it("holds INCONCLUSIVE work for arbitration", async function () {
    const { owner, requester, provider, verifiers, escrow } = await deploySystem();
    const { jobId, deadline } = await createAssignedJob(requester, provider.address, escrow);
    await commitAndSelect(escrow, provider, jobId, deadline);
    const selected = (await escrow.selectedVerifiers(jobId))[0];
    const verifier = verifiers.find((candidate) => candidate.address.toLowerCase() === selected.toLowerCase())!;
    await submitVote(escrow, requester, verifier, jobId, 2);
    await time.increaseTo(deadline + 1n);
    await escrow.connect(owner).settle(jobId);
    expect((await escrow.getJob(jobId)).state).to.equal(5);
    await expect(escrow.connect(owner).resolveDispute(jobId, 1)).to.emit(escrow, "DisputeResolved").withArgs(jobId, 1);
    expect((await escrow.getJob(jobId)).state).to.equal(4);
  });

  it("claimTimeout refunds requester and unlocks collateral if provider did not commit", async function () {
    const { requester, provider, registry, escrow } = await deploySystem();
    const { jobId, deadline, payment } = await createAssignedJob(requester, provider.address, escrow, { deadlineSeconds: 60 });
    const balanceBefore = await ethers.provider.getBalance(requester.address);
    await time.increaseTo(deadline + 1n);
    await expect(escrow.claimTimeout(jobId)).to.emit(escrow, "TimeoutClaimed");
    expect(await ethers.provider.getBalance(requester.address)).to.equal(balanceBefore + payment);
    expect((await escrow.getJob(jobId)).state).to.equal(6);
    expect(await registry.freeStake(provider.address)).to.equal(ether("10"));
  });

  it("claimTimeout moves verifier timeout to dispute for owner resolution", async function () {
    const { owner, requester, provider, escrow } = await deploySystem();
    const { jobId, deadline } = await createAssignedJob(requester, provider.address, escrow, { deadlineSeconds: 60 });
    await commitAndSelect(escrow, provider, jobId, deadline);
    await time.increaseTo(deadline + 1n);
    await escrow.claimTimeout(jobId);
    expect((await escrow.getJob(jobId)).outcome).to.equal(3);
    await escrow.connect(owner).resolveDispute(jobId, 1);
    expect((await escrow.getJob(jobId)).outcome).to.equal(1);
  });

  it("runs an end-to-end honest job and writes a receipt", async function () {
    const { requester, provider, verifiers, escrow } = await deploySystem();
    const { jobId, deadline } = await createAssignedJob(requester, provider.address, escrow);
    await commitAndSelect(escrow, provider, jobId, deadline);
    const verifierAddress = (await escrow.selectedVerifiers(jobId))[0];
    const verifier = verifiers.find((candidate) => candidate.address.toLowerCase() === verifierAddress.toLowerCase())!;
    await submitVote(escrow, requester, verifier, jobId, 0, "verified result");
    await escrow.settle(jobId);
    const receipt = await escrow.getReceipt(jobId);
    expect([receipt.jobId, receipt.outcome, receipt.resultHash]).to.deep.equal([jobId, 1n, (await escrow.getJob(jobId)).resultHash]);
  });

  it("runs a malicious-provider case where a FAIL vote rejects the committed result", async function () {
    const { requester, provider, verifiers, escrow } = await deploySystem();
    const { jobId, deadline } = await createAssignedJob(requester, provider.address, escrow);
    await commitAndSelect(escrow, provider, jobId, deadline);
    const verifierAddress = (await escrow.selectedVerifiers(jobId))[0];
    const verifier = verifiers.find((candidate) => candidate.address.toLowerCase() === verifierAddress.toLowerCase())!;
    await submitVote(escrow, requester, verifier, jobId, 1, "mismatch detected");
    await escrow.settle(jobId);
    expect((await escrow.getJob(jobId)).outcome).to.equal(2);
  });

  it("allows only the requester to challenge a tier-3 quorum during its challenge window", async function () {
    const { owner, requester, provider, verifiers, policy, escrow } = await deploySystem();
    await policy.setWeights(0, 0, 0, 10_000, 0);
    const { jobId, deadline } = await createAssignedJob(requester, provider.address, escrow, { reproClass: 2, assurance: 3, deadlineSeconds: 10_000 });
    await commitAndSelect(escrow, provider, jobId, deadline);
    const selected = await escrow.selectedVerifiers(jobId);
    for (const address of selected.slice(0, 4)) {
      const verifier = verifiers.find((candidate) => candidate.address.toLowerCase() === address.toLowerCase())!;
      await submitVote(escrow, requester, verifier, jobId, 0);
    }
    await expect(escrow.connect(provider).challenge(jobId)).to.be.revertedWith("JobEscrow: not requester");
    await expect(escrow.connect(requester).challenge(jobId)).to.emit(escrow, "JobDisputed");
    expect((await escrow.getJob(jobId)).state).to.equal(5);
    await escrow.connect(owner).resolveDispute(jobId, 1);
    expect((await escrow.getJob(jobId)).state).to.equal(4);
  });

  it("validates job registration with zero payment", async function () {
    const { requester, escrow } = await deploySystem();
    const latest = await ethers.provider.getBlock("latest");
    await expect(escrow.connect(requester).registerJob("bafy", ethers.ZeroHash, 0, 0, BigInt(latest!.timestamp + 3600), { value: 0 }))
      .to.be.revertedWith("JobEscrow: payment required");
  });

  it("prevents non-requester from assigning provider", async function () {
    const { requester, provider, escrow } = await deploySystem();
    const latest = await ethers.provider.getBlock("latest");
    const tx = await escrow.connect(requester).registerJob("bafy", ethers.ZeroHash, 0, 0, BigInt(latest!.timestamp + 3600), { value: ether("1") });
    const receipt = await tx.wait();
    const event = receipt!.logs.map((log) => { try { return escrow.interface.parseLog(log); } catch { return null; } }).find((log) => log?.name === "JobRegistered")!;
    await expect(escrow.connect(provider).assignProvider(event.args.jobId, provider.address))
      .to.be.revertedWith("JobEscrow: not requester");
  });

  it("prevents duplicate provider assignment", async function () {
    const { requester, provider, escrow } = await deploySystem();
    const latest = await ethers.provider.getBlock("latest");
    const tx = await escrow.connect(requester).registerJob("bafy", ethers.ZeroHash, 0, 0, BigInt(latest!.timestamp + 3600), { value: ether("1") });
    const receipt = await tx.wait();
    const event = receipt!.logs.map((log) => { try { return escrow.interface.parseLog(log); } catch { return null; } }).find((log) => log?.name === "JobRegistered")!;
    await escrow.connect(requester).assignProvider(event.args.jobId, provider.address);
    await expect(escrow.connect(requester).assignProvider(event.args.jobId, provider.address))
      .to.be.revertedWith("JobEscrow: already assigned");
  });

  it("prevents non-provider from committing result", async function () {
    const { requester, provider, escrow } = await deploySystem();
    const { jobId } = await createAssignedJob(requester, provider.address, escrow);
    await expect(escrow.connect(requester).commitResult(jobId, ethers.ZeroHash, ethers.ZeroHash, "bafy"))
      .to.be.revertedWith("JobEscrow: not provider");
  });

  it("prevents settlement before quorum or deadline", async function () {
    const { owner, requester, provider, escrow } = await deploySystem();
    const { jobId, deadline } = await createAssignedJob(requester, provider.address, escrow);
    await commitAndSelect(escrow, provider, jobId, deadline);
    await expect(escrow.connect(owner).settle(jobId))
      .to.be.revertedWith("JobEscrow: cannot settle yet");
  });

  it("validates constructor parameters", async function () {
    const signers = await ethers.getSigners();
    const [owner] = signers;
    const nonce = await ethers.provider.getTransactionCount(owner.address);
    const predictedEscrow = ethers.getCreateAddress({ from: owner.address, nonce: nonce + 2 });
    const Registry = await ethers.getContractFactory("ProviderRegistry", owner);
    const registry = await Registry.deploy(predictedEscrow);
    const Policy = await ethers.getContractFactory("VerificationPolicy", owner);
    const policy = await Policy.deploy(await registry.getAddress());
    const Escrow = await ethers.getContractFactory("JobEscrow", owner);
    await expect(Escrow.deploy(ethers.ZeroAddress, await policy.getAddress()))
      .to.be.revertedWith("JobEscrow: zero dependency");
    await expect(Escrow.deploy(await registry.getAddress(), ethers.ZeroAddress))
      .to.be.revertedWith("JobEscrow: zero dependency");
  });
});
