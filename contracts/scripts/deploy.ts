import { promises as fs } from "node:fs";
import path from "node:path";
import { formatUnits, parseUnits } from "ethers";
import hre from "hardhat";
import { deploymentArtifactsSchema } from "@lab/shared";
import "dotenv/config";

const NAME = "LAB Token";
const SYMBOL = "LAB";
const INITIAL_SUPPLY = "1000000";

const DEFAULT_FEES = [
  {
    feeType: 0,
    label: "SlotBuy",
    config: { platformFeeBps: 100, creatorFeeBps: 50, royaltyFeeBps: 25, referrerFeeBps: 25 }
  },
  {
    feeType: 1,
    label: "DirectCommission",
    config: { platformFeeBps: 100, creatorFeeBps: 50, royaltyFeeBps: 0, referrerFeeBps: 0 }
  },
  {
    feeType: 2,
    label: "RoyaltyTransfer",
    config: { platformFeeBps: 75, creatorFeeBps: 0, royaltyFeeBps: 75, referrerFeeBps: 0 }
  },
  {
    feeType: 3,
    label: "SuperRoyaltyTransfer",
    config: { platformFeeBps: 75, creatorFeeBps: 25, royaltyFeeBps: 50, referrerFeeBps: 0 }
  },
  {
    feeType: 4,
    label: "CreatorTransfer",
    config: { platformFeeBps: 50, creatorFeeBps: 50, royaltyFeeBps: 0, referrerFeeBps: 0 }
  },
  {
    feeType: 5,
    label: "FlashTransfer",
    config: { platformFeeBps: 25, creatorFeeBps: 0, royaltyFeeBps: 0, referrerFeeBps: 0 }
  }
];

async function main() {
  const { ethers } = hre as unknown as { ethers: any };
  const { PRIVATE_KEY, RPC_URL, CHAIN } = process.env;

  if (!PRIVATE_KEY) {
    throw new Error("PRIVATE_KEY is required");
  }

  if (!RPC_URL) {
    throw new Error("RPC_URL is required");
  }

  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  console.log(`Deploying LABToken with account: ${deployerAddress}`);

  const platformWallet = deployerAddress;
  const creatorWallet = deployerAddress;
  const royaltyWallet = deployerAddress;

  const LabToken = await ethers.getContractFactory("LABToken");
  const contract = await LabToken.deploy(
    NAME,
    SYMBOL,
    parseUnits(INITIAL_SUPPLY, 18),
    platformWallet,
    creatorWallet,
    royaltyWallet,
    deployerAddress
  );

  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`LABToken deployed at: ${address}`);

  const constructorArgs = [
    NAME,
    SYMBOL,
    parseUnits(INITIAL_SUPPLY, 18).toString(),
    platformWallet,
    creatorWallet,
    royaltyWallet,
    deployerAddress
  ];

  for (const { feeType, label, config } of DEFAULT_FEES) {
    const tx = await contract.setFees(feeType, config);
    await tx.wait();
    console.log(`Configured fees for ${label}`);
  }

  const chain = CHAIN ?? "bscTestnet";
  const formattedAbi = contract.interface.formatJson();
  const abi = JSON.parse(formattedAbi);

  const parsed = deploymentArtifactsSchema.parse({
    chain,
    addresses: {
      LABToken: address
    },
    abis: {
      LABToken: abi
    },
    updatedAt: new Date().toISOString()
  });

  const artifactsPath = path.resolve(__dirname, "../../shared/artifacts.json");
  await fs.writeFile(artifactsPath, JSON.stringify(parsed, null, 2));
  console.log(`Artifacts written to ${artifactsPath}`);

  const constructorArgsPath = path.resolve(__dirname, "../../shared/constructor-args.json");
  await fs.writeFile(constructorArgsPath, JSON.stringify(constructorArgs, null, 2));
  console.log(`Constructor arguments written to ${constructorArgsPath}`);

  const totalSupply = await contract.totalSupply();
  console.log(`Total Supply: ${formatUnits(totalSupply, 18)} ${SYMBOL}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
