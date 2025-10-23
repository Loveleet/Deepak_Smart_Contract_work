import { Contract, JsonRpcProvider, formatUnits } from "ethers";
import { loadArtifacts } from "../lib/artifacts.js";
import { getProvider } from "../lib/provider.js";
import { HttpError } from "../lib/httpError.js";

export class GainDistributorService {
  private provider: JsonRpcProvider;
  private contract: Contract | null = null;

  constructor() {
    this.provider = getProvider();
  }

  private async resolveContract() {
    if (this.contract) {
      return this.contract;
    }
    const artifacts = await loadArtifacts();
    const address = artifacts.addresses.GAINUSDTDistributor;
    if (!address) {
      throw new HttpError(500, "GAINUSDTDistributor address missing from artifacts. Run deploy/postdeploy.");
    }
    const abi = artifacts.abis.GAINUSDTDistributor;
    if (!abi) {
      throw new HttpError(500, "GAINUSDTDistributor ABI missing from artifacts.");
    }
    const contract = new Contract(address, abi, this.provider);
    this.contract = contract;
    return this.contract;
  }

  async getSummary() {
    const contract = await this.resolveContract();
    const artifacts = await loadArtifacts();

    const [usdt, decimals, creator, flash] = await Promise.all([
      contract.USDT(),
      contract.tokenDecimals(),
      contract.creatorWallet(),
      contract.flashWallet()
    ]);

    const slotPrices: string[] = [];
    for (let i = 1; i <= 12; i++) {
      const price: bigint = await contract.SLOT_PRICE(i);
      slotPrices.push(formatUnits(price, decimals));
    }

    const royaltyBps: Record<number, number> = {};
    for (let level = 5; level <= 11; level++) {
      const bp: number = await contract.ROYALTY_BP(level);
      royaltyBps[level] = bp;
    }

    return {
      chain: artifacts.chain,
      contract: {
        address: artifacts.addresses.GAINUSDTDistributor,
        abi: artifacts.abis.GAINUSDTDistributor
      },
      usdtToken: usdt,
      tokenDecimals: Number(decimals),
      creatorWallet: creator,
      flashWallet: flash,
      slotPrices,
      royaltyBps
    };
  }

  async getUserProfile(address: string) {
    const contract = await this.resolveContract();
    const decimals: number = await contract.tokenDecimals();
    const [referrer, slot, allowanceRec, qualified] = await Promise.all([
      contract.referrerOf(address),
      contract.userSlot(address),
      contract.registeredAllowance(address),
      Promise.all(
        Array.from({ length: 12 }, (_, idx) => contract.qualifiedDirects(address, idx + 1))
      )
    ]);

    return {
      address,
      referrer,
      maxSlot: Number(slot),
      registeredAllowance: {
        allowance: formatUnits(allowanceRec.allowance, decimals),
        blockNum: Number(allowanceRec.blockNum)
      },
      qualifiedDirects: qualified.map((value: bigint, index: number) => ({
        level: index + 1,
        count: Number(value)
      }))
    };
  }
}

export const gainDistributorService = new GainDistributorService();
