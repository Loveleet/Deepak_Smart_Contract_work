import { promises as fs } from "node:fs";
import path from "node:path";
import hre from "hardhat";
import { deploymentArtifactsSchema } from "@lab/shared";
import "dotenv/config";

async function main() {
  const { ethers } = hre as unknown as { ethers: any };
  const { CHAIN, USDT_ADDRESS, USDT_DECIMALS, CREATOR_WALLET, FLASH_WALLET } = process.env;

  if (!USDT_ADDRESS) {
    throw new Error("USDT_ADDRESS is required");
  }

  const decimals = USDT_DECIMALS ? Number(USDT_DECIMALS) : 6;
  if (Number.isNaN(decimals)) {
    throw new Error("USDT_DECIMALS must be a number");
  }

  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  const creator = CREATOR_WALLET ?? deployerAddress;
  const flash = FLASH_WALLET ?? deployerAddress;

  console.log(`Deploying GAINUSDTDistributor with deployer ${deployerAddress}`);
  console.log(`USDT token: ${USDT_ADDRESS}`);
  console.log(`Creator wallet: ${creator}`);
  console.log(`Flash wallet: ${flash}`);

  const Distributor = await ethers.getContractFactory("GAINUSDTDistributor");
  const contract = await Distributor.deploy(USDT_ADDRESS, decimals, creator, flash);

  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`GAINUSDTDistributor deployed at: ${address}`);

  const constructorArgs = [USDT_ADDRESS, decimals, creator, flash];

  const chain = CHAIN ?? "bscTestnet";
  const formattedAbi = contract.interface.formatJson();
  const abi = JSON.parse(formattedAbi);

  const parsed = deploymentArtifactsSchema.parse({
    chain,
    addresses: {
      GAINUSDTDistributor: address
    },
    abis: {
      GAINUSDTDistributor: abi
    },
    updatedAt: new Date().toISOString()
  });

  const artifactsPath = path.resolve(__dirname, "../../shared/artifacts.json");
  await fs.writeFile(artifactsPath, JSON.stringify(parsed, null, 2));
  console.log(`Artifacts written to ${artifactsPath}`);

  const constructorArgsPath = path.resolve(__dirname, "../../shared/constructor-args.json");
  await fs.writeFile(constructorArgsPath, JSON.stringify(constructorArgs, null, 2));
  console.log(`Constructor arguments written to ${constructorArgsPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
