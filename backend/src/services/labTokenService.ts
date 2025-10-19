import { Contract, EventLog, Interface, JsonRpcProvider, Wallet, formatUnits, parseUnits } from "ethers";
import { loadArtifacts } from "../lib/artifacts.js";
import { getProvider, getSigner } from "../lib/provider.js";
import { HttpError } from "../lib/httpError.js";

const FEE_TYPE_MAP = {
  slotBuy: 0,
  directCommission: 1,
  royaltyTransfer: 2,
  superRoyaltyTransfer: 3,
  creatorTransfer: 4,
  flashTransfer: 5
} as const;

type FeeConfigInput = {
  platformFeeBps: number;
  creatorFeeBps: number;
  royaltyFeeBps: number;
  referrerFeeBps: number;
};

type TransactionResult = {
  hash: string;
  blockNumber: number;
  events: Array<{
    name: string;
    args: Record<string, unknown>;
  }>;
};

export class LabTokenService {
  private provider: JsonRpcProvider;
  private signer: Wallet;
  private contract: Contract | null = null;
  private readonly decimalsCache: Promise<number>;
  private readonly ifaceCache: Promise<Interface>;

  constructor() {
    this.provider = getProvider();
    this.signer = getSigner();
    this.decimalsCache = this.initDecimals();
    this.ifaceCache = this.initInterface();
  }

  private async initInterface() {
    const artifacts = await loadArtifacts();
    const abi = artifacts.abis.LABToken;
    return new Interface(abi);
  }

  private async resolveContract() {
    if (this.contract) {
      return this.contract;
    }
    const artifacts = await loadArtifacts();
    const address = artifacts.addresses.LABToken;
    if (!address) {
      throw new HttpError(500, "LABToken address is missing. Deploy contracts first.");
    }
    const abi = artifacts.abis.LABToken;
    const contract = new Contract(address, abi, this.provider);
    this.contract = contract.connect(this.signer);
    return this.contract;
  }

  private async initDecimals() {
    const contract = await this.resolveContract();
    const decimals: number = await contract.decimals();
    return decimals;
  }

  private async toBigInt(amount: string) {
    const decimals = await this.decimalsCache;
    return parseUnits(amount, decimals);
  }

  private async parseReceipt(result: Awaited<ReturnType<Contract["waitForDeployment"]>>) {
    return result;
  }

  private async executeWrite(method: string, args: unknown[]): Promise<TransactionResult> {
    const contract = await this.resolveContract();
    const fn = contract.getFunction(method);
    if (!fn) {
      throw new HttpError(500, `Contract method ${method} not found`);
    }
    const tx = await fn(...args);
    const receipt = await tx.wait();
    const iface = await this.ifaceCache;

    const decodedEvents = receipt?.logs
      ?.map((log) => {
        try {
          const parsed = iface.parseLog(log as EventLog);
          return {
            name: parsed.name,
            args: parsed.args
          };
        } catch {
          return null;
        }
      })
      .filter((event): event is NonNullable<typeof event> => event !== null);

    return {
      hash: tx.hash,
      blockNumber: receipt?.blockNumber ?? 0,
      events: decodedEvents?.map((event) => ({
        name: event.name,
        args: Object.fromEntries(
          Object.entries(event.args).filter(([key]) => Number.isNaN(Number(key)))
        )
      })) ?? []
    };
  }

  async getSummary() {
    const contract = await this.resolveContract();
    const decimals = await this.decimalsCache;
    const artifacts = await loadArtifacts();

    const [name, symbol, totalSupply, platformWallet, creatorWallet, royaltyWallet] = await Promise.all([
      contract.name(),
      contract.symbol(),
      contract.totalSupply(),
      contract.platformWallet(),
      contract.creatorWallet(),
      contract.royaltyWallet()
    ]);

    const fees = await this.getAllFees();

    return {
      name,
      symbol,
      decimals,
      totalSupply: formatUnits(totalSupply, decimals),
      contract: {
        address: artifacts.addresses.LABToken,
        abi: artifacts.abis.LABToken
      },
      wallets: {
        platformWallet,
        creatorWallet,
        royaltyWallet
      },
      fees
    };
  }

  async getAllFees() {
    const contract = await this.resolveContract();
    const entries = await Promise.all(
      Object.entries(FEE_TYPE_MAP).map(async ([key, value]) => {
        const config = await contract.getFees(value);
        return [
          key,
          {
            platformFeeBps: Number(config.platformFeeBps),
            creatorFeeBps: Number(config.creatorFeeBps),
            royaltyFeeBps: Number(config.royaltyFeeBps),
            referrerFeeBps: Number(config.referrerFeeBps)
          }
        ] as const;
      })
    );

    return Object.fromEntries(entries);
  }

  async setFees(feeType: keyof typeof FEE_TYPE_MAP, config: FeeConfigInput) {
    const feeIndex = FEE_TYPE_MAP[feeType];
    return this.executeWrite("setFees", [feeIndex, config]);
  }

  async setFeeWallets(platformWallet: string, creatorWallet: string, royaltyWallet: string) {
    return this.executeWrite("setFeeWallets", [platformWallet, creatorWallet, royaltyWallet]);
  }

  async slotBuy(recipient: string, amount: string, referrer: string) {
    const value = await this.toBigInt(amount);
    return this.executeWrite("slotBuy", [recipient, value, referrer]);
  }

  async directCommission(seller: string, amount: string) {
    const value = await this.toBigInt(amount);
    return this.executeWrite("directCommission", [seller, value]);
  }

  async royaltyTransfer(recipient: string, amount: string) {
    const value = await this.toBigInt(amount);
    return this.executeWrite("royaltyTransfer", [recipient, value]);
  }

  async superRoyaltyTransfer(recipient: string, amount: string, payees: string[], bps: number[]) {
    const value = await this.toBigInt(amount);
    return this.executeWrite("superRoyaltyTransfer", [recipient, value, payees, bps]);
  }

  async creatorTransfer(recipient: string, amount: string) {
    const value = await this.toBigInt(amount);
    return this.executeWrite("creatorTransfer", [recipient, value]);
  }

  async flashTransfer(to: string, amount: string) {
    const value = await this.toBigInt(amount);
    return this.executeWrite("flashTransfer", [to, value]);
  }

  async balanceOf(address: string) {
    const contract = await this.resolveContract();
    const decimals = await this.decimalsCache;
    const balance = await contract.balanceOf(address);
    return {
      address,
      balance: balance.toString(),
      formatted: formatUnits(balance, decimals)
    };
  }
}

export const labTokenService = new LabTokenService();
