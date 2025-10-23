import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import hre from "hardhat";

async function main() {
  const artifactsPath = resolve(__dirname, "../../shared/artifacts.json");
  const artifacts = JSON.parse(await readFile(artifactsPath, "utf8"));

  const [buyer] = await hre.ethers.getSigners();
  const usdt = await hre.ethers.getContractAt("MockUSDT", artifacts.addresses.USDT);

  const allowance = await usdt.allowance(buyer.address, artifacts.addresses.GAINUSDTDistributor);
  console.log("Buyer:", buyer.address);
  console.log("Distributor:", artifacts.addresses.GAINUSDTDistributor);
  console.log("Allowance:", allowance.toString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
