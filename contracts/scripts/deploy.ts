import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { artifacts, ethers, network } from "hardhat";

async function main(): Promise<void> {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployer account configured for this network");

  const firstNonce = await ethers.provider.getTransactionCount(deployer.address);
  const escrowAddress = ethers.getCreateAddress({ from: deployer.address, nonce: firstNonce + 2 });

  const Registry = await ethers.getContractFactory("ProviderRegistry", deployer);
  const registry = await Registry.deploy(escrowAddress);
  await registry.waitForDeployment();

  const Policy = await ethers.getContractFactory("VerificationPolicy", deployer);
  const policy = await Policy.deploy(await registry.getAddress());
  await policy.waitForDeployment();

  const Escrow = await ethers.getContractFactory("JobEscrow", deployer);
  const escrow = await Escrow.deploy(await registry.getAddress(), await policy.getAddress());
  await escrow.waitForDeployment();
  if ((await escrow.getAddress()).toLowerCase() !== escrowAddress.toLowerCase()) {
    throw new Error("Predicted JobEscrow address did not match deployed address");
  }

  const [registryArtifact, policyArtifact, escrowArtifact] = await Promise.all([
    artifacts.readArtifact("ProviderRegistry"),
    artifacts.readArtifact("VerificationPolicy"),
    artifacts.readArtifact("JobEscrow"),
  ]);
  const deployments = {
    ProviderRegistry: { address: await registry.getAddress(), abi: registryArtifact.abi },
    VerificationPolicy: { address: await policy.getAddress(), abi: policyArtifact.abi },
    JobEscrow: { address: await escrow.getAddress(), abi: escrowArtifact.abi },
  };
  const outputDirectory = path.join(__dirname, "..", "deployments");
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, `${network.name}.json`);
  await writeFile(outputPath, `${JSON.stringify(deployments, null, 2)}\n`, "utf8");
  console.log(`Deployed contracts to ${outputPath}`);
  console.log(JSON.stringify(deployments, null, 2));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
