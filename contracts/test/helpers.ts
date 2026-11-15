import { Signer } from "ethers";
import { ethers } from "hardhat";

export const ether = (value: string) => ethers.parseEther(value);

export async function deploySystem() {
  const signers = await ethers.getSigners();
  const [owner, requester, provider, ...verifiers] = signers;
  const nonce = await ethers.provider.getTransactionCount(owner.address);
  const predictedEscrow = ethers.getCreateAddress({ from: owner.address, nonce: nonce + 2 });

  const Registry = await ethers.getContractFactory("ProviderRegistry", owner);
  const registry = await Registry.deploy(predictedEscrow);
  await registry.waitForDeployment();
  const Policy = await ethers.getContractFactory("VerificationPolicy", owner);
  const policy = await Policy.deploy(await registry.getAddress());
  await policy.waitForDeployment();
  const Escrow = await ethers.getContractFactory("JobEscrow", owner);
  const escrow = await Escrow.deploy(await registry.getAddress(), await policy.getAddress());
  await escrow.waitForDeployment();

  await registry.connect(provider).registerProvider(ethers.keccak256(ethers.toUtf8Bytes("test-provider")));
  await registry.connect(provider).depositStake({ value: ether("10") });
  for (const verifier of verifiers) {
    await registry.connect(verifier).registerVerifier({ value: ether("1") });
  }
  return { owner, requester, provider, verifiers, registry, policy, escrow };
}

export async function createAssignedJob(
  requester: Signer,
  providerAddress: string,
  escrow: any,
  options: { reproClass?: number; assurance?: number; deadlineSeconds?: number; payment?: bigint } = {},
) {
  const latest = await ethers.provider.getBlock("latest");
  const deadline = BigInt(latest!.timestamp + (options.deadlineSeconds ?? 3600));
  const payment = options.payment ?? ether("1");
  const tx = await escrow.connect(requester).registerJob(
    "bafy-job-spec", ethers.keccak256(ethers.toUtf8Bytes("profile")),
    options.reproClass ?? 0, options.assurance ?? 0, deadline, { value: payment },
  );
  const receipt = await tx.wait();
  const parsed = receipt.logs.map((log: any) => { try { return escrow.interface.parseLog(log); } catch { return null; } }).find((log: any) => log?.name === "JobRegistered");
  const jobId = parsed.args.jobId as bigint;
  await escrow.connect(requester).assignProvider(jobId, providerAddress);
  return { jobId, deadline, payment };
}

export async function commitAndSelect(escrow: any, provider: Signer, jobId: bigint, deadline: bigint) {
  const resultHash = ethers.keccak256(ethers.toUtf8Bytes("result"));
  const checkpointRoot = ethers.keccak256(ethers.toUtf8Bytes("checkpoint"));
  await escrow.connect(provider).commitResult(jobId, resultHash, checkpointRoot, "bafy-result");
  await ethers.provider.send("hardhat_mine", ["0x2"]);
  await escrow.selectVerifiers(jobId);
  return { resultHash, checkpointRoot, deadline };
}

export async function submitVote(
  escrow: any,
  relayer: Signer,
  verifier: Signer,
  jobId: bigint,
  verdict: number,
  evidence = "evidence",
) {
  const job = await escrow.getJob(jobId);
  const network = await ethers.provider.getNetwork();
  const domain = {
    name: "ProofOfCompute",
    version: "1",
    chainId: network.chainId,
    verifyingContract: await escrow.getAddress(),
  };
  const types = {
    Attestation: [
      { name: "jobId", type: "uint256" },
      { name: "policyHash", type: "bytes32" },
      { name: "resultHash", type: "bytes32" },
      { name: "verdict", type: "uint8" },
      { name: "evidenceHash", type: "bytes32" },
    ],
  };
  const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes(evidence));
  const signature = await verifier.signTypedData(domain, types, {
    jobId, policyHash: job.policyHash, resultHash: job.resultHash, verdict, evidenceHash,
  });
  const transaction = await escrow.connect(relayer).submitAttestation(jobId, verdict, evidenceHash, signature);
  await transaction.wait();
  return { evidenceHash, transaction };
}
