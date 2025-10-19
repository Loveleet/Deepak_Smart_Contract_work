import { promises as fs } from "node:fs";
import path from "node:path";
import { run } from "hardhat";
import "dotenv/config";

async function main() {
  const artifactsPath = path.resolve(__dirname, "../../shared/artifacts.json");
  const constructorArgsPath = path.resolve(__dirname, "../../shared/constructor-args.json");

  const artifactsRaw = await fs.readFile(artifactsPath, "utf8");
  const constructorArgsRaw = await fs.readFile(constructorArgsPath, "utf8");

  const artifacts = JSON.parse(artifactsRaw);
  const constructorArgs = JSON.parse(constructorArgsRaw);

  if (!artifacts.addresses?.LABToken) {
    throw new Error("LABToken address missing from artifacts.json");
  }

  const address: string = artifacts.addresses.LABToken;

  if (!Array.isArray(constructorArgs) || constructorArgs.length !== 7) {
    throw new Error("constructor-args.json is invalid");
  }

  const parsedArgs = [
    constructorArgs[0],
    constructorArgs[1],
    BigInt(constructorArgs[2]),
    constructorArgs[3],
    constructorArgs[4],
    constructorArgs[5],
    constructorArgs[6]
  ];

  await run("verify:verify", {
    address,
    constructorArguments: parsedArgs
  });

  console.log(`Verification submitted for LABToken at ${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
