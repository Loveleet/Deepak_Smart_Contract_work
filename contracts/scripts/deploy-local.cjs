require("ts-node/register/transpile-only");
require("tsconfig-paths/register");

const fs = require("fs/promises");
const path = require("path");
const hre = require("hardhat");

const NAME = "LAB Token";
const SYMBOL = "LAB";
const INITIAL_SUPPLY = "1000000";

const DEFAULT_FEES = [
  {
    feeType: 0,
    config: { platformFeeBps: 100, creatorFeeBps: 50, royaltyFeeBps: 25, referrerFeeBps: 25 }
  },
  {
    feeType: 1,
    config: { platformFeeBps: 100, creatorFeeBps: 50, royaltyFeeBps: 0, referrerFeeBps: 0 }
  },
  {
    feeType: 2,
    config: { platformFeeBps: 75, creatorFeeBps: 0, royaltyFeeBps: 75, referrerFeeBps: 0 }
  },
  {
    feeType: 3,
    config: { platformFeeBps: 75, creatorFeeBps: 25, royaltyFeeBps: 50, referrerFeeBps: 0 }
  },
  {
    feeType: 4,
    config: { platformFeeBps: 50, creatorFeeBps: 50, royaltyFeeBps: 0, referrerFeeBps: 0 }
  },
  {
    feeType: 5,
    config: { platformFeeBps: 25, creatorFeeBps: 0, royaltyFeeBps: 0, referrerFeeBps: 0 }
  }
];

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  console.log(`Deploying LABToken from ${deployerAddress}`);

  const LabToken = await ethers.getContractFactory("LABToken");
  const initialSupply = ethers.parseUnits(INITIAL_SUPPLY, 18);

  const contract = await LabToken.deploy(
    NAME,
    SYMBOL,
    initialSupply,
    deployerAddress,
    deployerAddress,
    deployerAddress,
    deployerAddress
  );

  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log(`LABToken deployed at ${address}`);

  for (const { feeType, config } of DEFAULT_FEES) {
    const tx = await contract.setFees(feeType, config);
    await tx.wait();
  }

  const constructorArgs = [
    NAME,
    SYMBOL,
    initialSupply.toString(),
    deployerAddress,
    deployerAddress,
    deployerAddress,
    deployerAddress
  ];

  const artifactsPath = path.resolve(__dirname, "../../shared/artifacts.json");
  const artifacts = {
    chain: "hardhat-local",
    addresses: {
      LABToken: address
    },
    abis: {
      LABToken: JSON.parse(contract.interface.formatJson())
    },
    updatedAt: new Date().toISOString()
  };

  await fs.writeFile(artifactsPath, JSON.stringify(artifacts, null, 2));

  const constructorArgsPath = path.resolve(__dirname, "../../shared/constructor-args.json");
  await fs.writeFile(constructorArgsPath, JSON.stringify(constructorArgs, null, 2));

  const totalSupply = await contract.totalSupply();
  console.log(`Total supply: ${ethers.formatUnits(totalSupply, 18)} ${SYMBOL}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
