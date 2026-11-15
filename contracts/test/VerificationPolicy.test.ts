import { expect } from "chai";
import { ethers } from "hardhat";
import { deploySystem } from "./helpers";

describe("VerificationPolicy", function () {
  it("computes the specified integer risk score", async function () {
    const signers = await ethers.getSigners();
    const [owner] = signers;
    const freshProvider = signers[signers.length - 1];
    const nonce = await ethers.provider.getTransactionCount(owner.address);
    const predictedEscrow = ethers.getCreateAddress({ from: owner.address, nonce: nonce + 2 });
    const Registry = await ethers.getContractFactory("ProviderRegistry", owner);
    const registry = await Registry.deploy(predictedEscrow);
    await registry.waitForDeployment();
    const Policy = await ethers.getContractFactory("VerificationPolicy", owner);
    const policy = await Policy.deploy(await registry.getAddress());
    await policy.waitForDeployment();
    
    await registry.connect(freshProvider).registerProvider(ethers.keccak256(ethers.toUtf8Bytes("fresh")));
    await registry.connect(freshProvider).depositStake({ value: ethers.parseEther("10") });
    const payment = ethers.parseEther("1");
    // V=1000 bps, Rep=10000, Dh=0, C=0, A=3333 bps (floor).
    expect(await policy.computeRisk(payment, freshProvider.address, 0, 1)).to.equal(966);
  });

  it("derives tiers, verifier counts, quorum, collateral, and challenge windows", async function () {
    const signers = await ethers.getSigners();
    const [owner] = signers;
    const freshProvider = signers[signers.length - 2];
    const nonce = await ethers.provider.getTransactionCount(owner.address);
    const predictedEscrow = ethers.getCreateAddress({ from: owner.address, nonce: nonce + 2 });
    const Registry = await ethers.getContractFactory("ProviderRegistry", owner);
    const registry = await Registry.deploy(predictedEscrow);
    await registry.waitForDeployment();
    const Policy = await ethers.getContractFactory("VerificationPolicy", owner);
    const policy = await Policy.deploy(await registry.getAddress());
    await policy.waitForDeployment();
    
    await registry.connect(freshProvider).registerProvider(ethers.keccak256(ethers.toUtf8Bytes("fresh2")));
    await registry.connect(freshProvider).depositStake({ value: ethers.parseEther("10") });
    const low = await policy.derivePolicy(ethers.parseEther("1"), freshProvider.address, 0, 0);
    expect([low.tier, low.verifierCount, low.quorum, low.challengeWindow]).to.deep.equal([0n, 1n, 1n, 0n]);
    await policy.setWeights(10_000, 0, 0, 0, 0);
    const mediumRisk = await policy.derivePolicy(ethers.parseEther("6"), freshProvider.address, 0, 0);
    expect([mediumRisk.tier, mediumRisk.verifierCount, mediumRisk.quorum]).to.deep.equal([2n, 5n, 3n]);
    await policy.setWeights(0, 0, 0, 10_000, 0);
    const high = await policy.derivePolicy(ethers.parseEther("1"), freshProvider.address, 2, 3);
    expect([high.tier, high.verifierCount, high.quorum, high.challengeWindow]).to.deep.equal([3n, 5n, 4n, 3600n]);
    expect(high.collateral).to.equal(ethers.parseEther("1.5"));
  });

  it("restricts configuration setters and enforces valid weights and rates", async function () {
    const { owner, requester, policy } = await deploySystem();
    await expect(policy.connect(requester).setK(3)).to.be.reverted;
    await expect(policy.setWeights(1, 1, 1, 1, 1)).to.be.revertedWith("VerificationPolicy: weights must sum to 10000");
    await policy.setWeights(2000, 2000, 2000, 2000, 2000);
    await policy.setK(3);
    await policy.setChallengeWindow(120);
    await policy.setVerifierFeesBps(300);
    await policy.setSlashBps(4000);
    await policy.setVerifierSlashBps(500);
    expect(await policy.verifierFeesBps()).to.equal(300);
    expect(await policy.slashBps()).to.equal(4000);
    expect(await policy.verifierSlashBps()).to.equal(500);
    expect(await policy.owner()).to.equal(owner.address);
    await expect(policy.setVerifierFeesBps(10_001)).to.be.revertedWith("VerificationPolicy: invalid verifier fee");
  });

  it("validates input parameters for risk computation", async function () {
    const signers = await ethers.getSigners();
    const [owner] = signers;
    const testProvider = signers[signers.length - 5];
    const nonce = await ethers.provider.getTransactionCount(owner.address);
    const predictedEscrow = ethers.getCreateAddress({ from: owner.address, nonce: nonce + 2 });
    const Registry = await ethers.getContractFactory("ProviderRegistry", owner);
    const registry = await Registry.deploy(predictedEscrow);
    await registry.waitForDeployment();
    const Policy = await ethers.getContractFactory("VerificationPolicy", owner);
    const policy = await Policy.deploy(await registry.getAddress());
    await policy.waitForDeployment();

    await registry.connect(testProvider).registerProvider(ethers.keccak256(ethers.toUtf8Bytes("test")));
    await registry.connect(testProvider).depositStake({ value: ethers.parseEther("10") });

    // Test invalid repro class
    await expect(policy.computeRisk(ethers.parseEther("1"), testProvider.address, 3, 0)).to.be.revertedWith("VerificationPolicy: invalid repro class");
    
    // Test invalid assurance
    await expect(policy.computeRisk(ethers.parseEther("1"), testProvider.address, 0, 4)).to.be.revertedWith("VerificationPolicy: invalid assurance");
  });

  it("validates setter bounds", async function () {
    const signers = await ethers.getSigners();
    const [owner] = signers;
    const nonce = await ethers.provider.getTransactionCount(owner.address);
    const predictedEscrow = ethers.getCreateAddress({ from: owner.address, nonce: nonce + 2 });
    const Registry = await ethers.getContractFactory("ProviderRegistry", owner);
    const registry = await Registry.deploy(predictedEscrow);
    await registry.waitForDeployment();
    const Policy = await ethers.getContractFactory("VerificationPolicy", owner);
    const policy = await Policy.deploy(await registry.getAddress());
    await policy.waitForDeployment();

    await expect(policy.setSlashBps(10_001)).to.be.revertedWith("VerificationPolicy: invalid slash rate");
    await expect(policy.setVerifierSlashBps(10_001)).to.be.revertedWith("VerificationPolicy: invalid verifier slash rate");
  });

  it("rejects zero registry address in constructor", async function () {
    const signers = await ethers.getSigners();
    const [owner] = signers;
    const Policy = await ethers.getContractFactory("VerificationPolicy", owner);
    await expect(Policy.deploy(ethers.ZeroAddress)).to.be.revertedWith("VerificationPolicy: zero registry");
  });
});
