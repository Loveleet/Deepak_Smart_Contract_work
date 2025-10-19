import { JsonRpcProvider, Wallet } from "ethers";
import { config } from "../config.js";

const provider = new JsonRpcProvider(config.rpcUrl, config.chainId);
const signer = new Wallet(config.backendPrivateKey, provider);

export const getProvider = () => provider;
export const getSigner = () => signer;
