import { config as loadEnv } from "dotenv";
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@typechain/hardhat";
import "tsconfig-paths/register.js";

loadEnv({ path: "../.env" });

const { RPC_URL, PRIVATE_KEY, BSC_SCAN_API_KEY, ETHERSCAN_API_KEY, CHAIN } = process.env;

const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];

const isBsc = !CHAIN || CHAIN === "bscTestnet";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      chainId: 31337
    },
    testnet: {
      url: RPC_URL || "",
      chainId: isBsc ? 97 : 11155111,
      accounts
    }
  },
  etherscan: {
    apiKey: isBsc ? BSC_SCAN_API_KEY || "" : ETHERSCAN_API_KEY || "",
    customChains: [
      isBsc
        ? {
            network: "testnet",
            chainId: 97,
            urls: {
              apiURL: "https://api-testnet.bscscan.com/api",
              browserURL: "https://testnet.bscscan.com"
            }
          }
        : {
            network: "testnet",
            chainId: 11155111,
            urls: {
              apiURL: "https://api-sepolia.etherscan.io/api",
              browserURL: "https://sepolia.etherscan.io"
            }
          }
    ]
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6"
  },
  paths: {
    artifacts: "artifacts",
    cache: "cache",
    sources: "contracts",
    tests: "test"
  }
};

export default config;
