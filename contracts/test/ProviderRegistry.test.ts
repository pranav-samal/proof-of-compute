import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { commitAndSelect, createAssignedJob, deploySystem, submitVote } from "./helpers";

describe("ProviderRegistry", function () {
  it("starts providers at 10000 reputation and tracks stake deposits and withdrawals", async function () {
    const signers = await ethers.getSigners();
    const [owner] = signers;
    const freshProvider = signers[signers.length - 1]; // Use a fresh signer not touched by deploySystem
    const nonce = await ethers.provider.getTransactionCount(owner.address);
    const predictedEscrow = ethers.getCreateAddress({ from: owner.address, nonce: nonce + 2 });
    const Registry = await ethers.getContractFactory("ProviderRegistry", owner);
    const registry = await Registry.deploy(predictedEscrow);
    await registry.waitForDeployment();
    
    await registry.connect(freshProvider).registerProvider(ethers.keccak256(ethers.toUtf8Bytes("fresh")));
    expect(await registry.reputationBps(freshProvider.address)).to.equal(10_000);
    await registry.connect(freshProvider).depositStake({ value: ethers.parseEther("1") });
    expect(await registry.totalStake(freshProvider.address)).to.equal(ethers.parseEther("1"));
    expect(await registry.freeStake(freshProvider.address)).to.equal(ethers.parseEther("1"));
    await registry.connect(freshProvider).withdrawStake(ethers.parseEther("0.4"));
    expect(await registry.freeStake(freshProvider.address)).to.equal(ethers.parseEther("0.6"));
  });

  it("registers verifiers and makes only bonded addresses eligible", async function () {
    const signers = await ethers.getSigners();
    const [owner] = signers;
    const freshVerifiers = signers.slice(signers.length - 10); // Use fresh signers
    const nonce = await ethers.provider.getTransactionCount(owner.address);
    const predictedEscrow = ethers.getCreateAddress({ from: owner.address, nonce: nonce + 2 });
    const Registry = await ethers.getContractFactory("ProviderRegistry", owner);
    const registry = await Registry.deploy(predictedEscrow);
    await registry.waitForDeployment();
    
    for (const verifier of freshVerifiers.slice(0, 5)) {
      await registry.connect(verifier).registerVerifier({ value: ethers.parseEther("0.1") });
    }
    expect(await registry.verifierCount()).to.equal(5);
    expect(await registry.verifierAt(2)).to.equal(freshVerifiers[2].address);
    expect(await registry.isEligibleVerifier(freshVerifiers[2].address)).to.equal(true);
    await registry.connect(freshVerifiers[2]).withdrawBond(ethers.parseEther("0.1"));
    expect(await registry.isEligibleVerifier(freshVerifiers[2].address)).to.equal(false);
  });

  it("restricts stake locks to JobEscrow and prevents withdrawing locked collateral", async function () {
    const { owner, requester, provider, registry, escrow, policy } = await deploySystem();
    await registry.connect(provider).depositStake({ value: ethers.parseEther("2") });
    await expect(registry.connect(owner).lockStake(provider.address, 1)).to.be.revertedWith("ProviderRegistry: only escrow");
    const now = await ethers.provider.getBlock("latest");
    const tx = await escrow.connect(requester).registerJob("bafy-test", ethers.ZeroHash, 0, 0, BigInt(now!.timestamp + 3600), { value: ethers.parseEther("1") });
    const receipt = await tx.wait();
    const jobId = receipt!.logs.map((log) => { try { return escrow.interface.parseLog(log); } catch { return null; } }).find((log) => log?.name === "JobRegistered")!.args.jobId;
    const derived = await policy.derivePolicy(ethers.parseEther("1"), provider.address, 0, 0);
    await escrow.connect(requester).assignProvider(jobId, provider.address);
    await expect(registry.connect(provider).withdrawStake(ethers.parseEther("12"))).to.be.revertedWith("ProviderRegistry: exceeds free stake");
    expect(await registry.freeStake(provider.address)).to.equal(ethers.parseEther("12") - derived.collateral);
  });

  it("updates reputation and risk history for rejected and inconclusive outcomes", async function () {
    const { owner, requester, provider, verifiers, registry, escrow } = await deploySystem();
    await expect(registry.connect(provider).recordOutcome(provider.address, 2)).to.be.revertedWith("ProviderRegistry: only escrow");
    let history = await registry.riskHistory(provider.address);
    expect([history.disputeCount, history.slashCount]).to.deep.equal([0n, 0n]);
    const rejectedJob = await createAssignedJob(requester, provider.address, escrow);
    await commitAndSelect(escrow, provider, rejectedJob.jobId, rejectedJob.deadline);
    const failVerifierAddress = (await escrow.selectedVerifiers(rejectedJob.jobId))[0];
    const failVerifier = verifiers.find((candidate) => candidate.address.toLowerCase() === failVerifierAddress.toLowerCase())!;
    await submitVote(escrow, requester, failVerifier, rejectedJob.jobId, 1);
    await escrow.connect(owner).settle(rejectedJob.jobId);
    expect(await registry.reputationBps(provider.address)).to.equal(9500);
    history = await registry.riskHistory(provider.address);
    expect([history.disputeCount, history.slashCount]).to.deep.equal([0n, 1n]);

    const inconclusiveJob = await createAssignedJob(requester, provider.address, escrow);
    await commitAndSelect(escrow, provider, inconclusiveJob.jobId, inconclusiveJob.deadline);
    const selectedAddress = (await escrow.selectedVerifiers(inconclusiveJob.jobId))[0];
    const selectedVerifier = verifiers.find((candidate) => candidate.address.toLowerCase() === selectedAddress.toLowerCase())!;
    await submitVote(escrow, requester, selectedVerifier, inconclusiveJob.jobId, 2);
    await time.increaseTo(inconclusiveJob.deadline + 1n);
    await escrow.settle(inconclusiveJob.jobId);
    history = await registry.riskHistory(provider.address);
    expect([history.disputeCount, history.slashCount]).to.deep.equal([1n, 1n]);
  });

  it("validates stake and bond operations with edge cases", async function () {
    const signers = await ethers.getSigners();
    const [owner] = signers;
    const testProvider = signers[signers.length - 3];
    const testVerifier = signers[signers.length - 4];
    const nonce = await ethers.provider.getTransactionCount(owner.address);
    const predictedEscrow = ethers.getCreateAddress({ from: owner.address, nonce: nonce + 2 });
    const Registry = await ethers.getContractFactory("ProviderRegistry", owner);
    const registry = await Registry.deploy(predictedEscrow);
    await registry.waitForDeployment();

    // Test zero stake deposit
    await expect(registry.connect(testProvider).depositStake({ value: 0 })).to.be.revertedWith("ProviderRegistry: stake required");
    
    // Test zero withdrawal
    await registry.connect(testProvider).depositStake({ value: ethers.parseEther("1") });
    await expect(registry.connect(testProvider).withdrawStake(0)).to.be.revertedWith("ProviderRegistry: amount is zero");
    
    // Test zero bond
    await expect(registry.connect(testVerifier).registerVerifier({ value: 0 })).to.be.revertedWith("ProviderRegistry: bond required");
    
    // Test invalid bond withdrawal
    await registry.connect(testVerifier).registerVerifier({ value: ethers.parseEther("0.5") });
    await expect(registry.connect(testVerifier).withdrawBond(0)).to.be.revertedWith("ProviderRegistry: invalid bond withdrawal");
    await expect(registry.connect(testVerifier).withdrawBond(ethers.parseEther("1"))).to.be.revertedWith("ProviderRegistry: invalid bond withdrawal");
  });

  it("handles zero escrow address in constructor", async function () {
    const signers = await ethers.getSigners();
    const [owner] = signers;
    const Registry = await ethers.getContractFactory("ProviderRegistry", owner);
    await expect(Registry.deploy(ethers.ZeroAddress)).to.be.revertedWith("ProviderRegistry: zero escrow");
  });
});
