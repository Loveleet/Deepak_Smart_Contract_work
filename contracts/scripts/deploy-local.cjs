require("ts-node/register/transpile-only");
require("tsconfig-paths/register");

const fs = require("fs/promises");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const { ethers } = hre;
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();

  console.log(`Deploying GAINUSDTDistributor (local) from ${deployerAddress}`);

  const MockUSDT = await ethers.getContractFactory("MockUSDT");
  const mockUsdt = await MockUSDT.deploy(6, ethers.parseUnits("10000000", 6));
  await mockUsdt.waitForDeployment();
  console.log(`Mock USDT deployed at ${await mockUsdt.getAddress()}`);

  const Distributor = await ethers.getContractFactory("GAINUSDTDistributor");
  const distributor = await Distributor.deploy(await mockUsdt.getAddress(), 6, deployerAddress, deployerAddress);

  await distributor.waitForDeployment();

  const address = await distributor.getAddress();
  console.log(`GAINUSDTDistributor deployed at ${address}`);

  const constructorArgs = [await mockUsdt.getAddress(), 6, deployerAddress, deployerAddress];

  const artifactsPath = path.resolve(__dirname, "../../shared/artifacts.json");
  const artifacts = {
    chain: "hardhat-local",
    addresses: {
      GAINUSDTDistributor: address,
      USDT: await mockUsdt.getAddress()
    },
    abis: {
      GAINUSDTDistributor: JSON.parse(distributor.interface.formatJson())
    },
    updatedAt: new Date().toISOString()
  };

  await fs.writeFile(artifactsPath, JSON.stringify(artifacts, null, 2));

  const constructorArgsPath = path.resolve(__dirname, "../../shared/constructor-args.json");
  await fs.writeFile(constructorArgsPath, JSON.stringify(constructorArgs, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
