import { useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { parseUnits } from "viem";
import type { Abi } from "viem";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast, Toaster } from "sonner";
import clsx from "clsx";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { env } from "./providers/wallet";
import { TxReceiptCard } from "./components/TxReceipt";

type ConfigResponse = {
  chain: string;
  contract: { address: string; abi: unknown };
  usdtToken: string;
  tokenDecimals: number;
  creatorWallet: string;
  flashWallet: string;
  slotPrices: string[];
  royaltyBps: Record<string, number>;
};

type UserProfile = {
  address: string;
  referrer: string;
  maxSlot: number;
  registeredAllowance: { allowance: string; blockNum: number };
  qualifiedDirects: Array<{ level: number; count: number }>;
};

const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }]
  }
] as const;

const fetchJson = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok) {
    throw new Error((data as { error?: string }).error ?? response.statusText);
  }
  return data as T;
};

const explorerForChain = (chain: string | number | undefined) => {
  if (chain === "bscTestnet" || chain === 97) {
    return "https://testnet.bscscan.com";
  }
  if (chain === "bsc" || chain === 56) {
    return "https://bscscan.com";
  }
  if (chain === "hardhat-local" || chain === 31337) {
    return "http://127.0.0.1:8545";
  }
  return "https://etherscan.io";
};

const SectionCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-6 shadow-lg shadow-emerald-500/5">
    <h3 className="text-lg font-semibold text-emerald-300">{title}</h3>
    <div className="mt-3 space-y-3 text-sm text-slate-200">{children}</div>
  </section>
);

const App = () => {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  useEffect(() => {
    if (!walletClient) return;
    (async () => {
      try {
        await walletClient.switchChain({ id: 31337 });
      } catch (error) {
        console.warn("Unable to switch to Hardhat chain", error);
      }
    })();
  }, [walletClient]);

  const [selectedSlot, setSelectedSlot] = useState(1);
  const [sponsor, setSponsor] = useState("");
  const [lastTx, setLastTx] = useState<{ hash: string; label: string } | null>(null);

  const configQuery = useQuery<ConfigResponse>({
    queryKey: ["config"],
    queryFn: () => fetchJson<ConfigResponse>(`${env.backendUrl}/config`),
    refetchInterval: 30000
  });

  const userProfileQuery = useQuery<UserProfile>({
    queryKey: ["user", address],
    queryFn: () => fetchJson<UserProfile>(`${env.backendUrl}/user/${address}`),
    enabled: Boolean(address)
  });

  const explorerBase = useMemo(() => explorerForChain(configQuery.data?.chain), [configQuery.data?.chain]);

  const distributorAbi = useMemo(() => configQuery.data?.contract.abi as Abi | undefined, [configQuery.data?.contract.abi]);

  const slotPriceString = useMemo(() => {
    const data = configQuery.data;
    if (!data) return "0";
    return data.slotPrices[selectedSlot - 1] ?? "0";
  }, [configQuery.data, selectedSlot]);

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!configQuery.data) throw new Error("Config not loaded");
      const amount = parseUnits(slotPriceString, configQuery.data.tokenDecimals);
      if (!walletClient) throw new Error("Connect wallet to continue");
      if (!publicClient) throw new Error("Public client unavailable");
      const hash = await walletClient.writeContract({
        address: configQuery.data.usdtToken as `0x${string}`,
        abi: erc20Abi,
        functionName: "approve",
        args: [configQuery.data.contract.address as `0x${string}`, amount]
      });
      toast.info("Approval submitted", { description: `Tx ${hash}` });
      await publicClient.waitForTransactionReceipt({ hash });
      toast.success("Approval confirmed");
      setLastTx({ hash, label: `Approved USDT for slot ${selectedSlot}` });
    },
    onError: (error: unknown) => toast.error((error as Error).message)
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      if (!configQuery.data) throw new Error("Config not loaded");
      if (!distributorAbi) throw new Error("ABI not available");
      if (!walletClient) throw new Error("Connect wallet to continue");
      if (!publicClient) throw new Error("Public client unavailable");
      const hash = await walletClient.writeContract({
        address: configQuery.data.contract.address as `0x${string}`,
        abi: distributorAbi,
        functionName: "registerApproval",
        args: []
      });
      toast.info("Approval registered", { description: `Tx ${hash}` });
      await publicClient.waitForTransactionReceipt({ hash });
      toast.success("Registration mined. Wait one block before slot buy." );
      setLastTx({ hash, label: "Registered approval" });
    },
    onError: (error: unknown) => toast.error((error as Error).message)
  });

  const slotBuyMutation = useMutation({
    mutationFn: async () => {
      if (!configQuery.data) throw new Error("Config not loaded");
      if (!sponsor) throw new Error("Sponsor required");
      if (!distributorAbi) throw new Error("ABI not available");
      if (!walletClient) throw new Error("Connect wallet to continue");
      if (!publicClient) throw new Error("Public client unavailable");
      const hash = await walletClient.writeContract({
        address: configQuery.data.contract.address as `0x${string}`,
        abi: distributorAbi,
        functionName: "slotBuy",
        args: [selectedSlot, sponsor as `0x${string}`]
      });
      toast.info("Slot purchase submitted", { description: `Tx ${hash}` });
      await publicClient.waitForTransactionReceipt({ hash });
      toast.success("Slot purchase confirmed" );
      setLastTx({ hash, label: `Slot ${selectedSlot} purchased` });
      userProfileQuery.refetch();
    },
    onError: (error: unknown) => toast.error((error as Error).message)
  });

  const connectedAddress = address ?? "";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Toaster richColors />
      <header className="border-b border-slate-900 bg-slate-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
          <div>
            <h1 className="text-2xl font-semibold text-emerald-300">GAIN-USDT Control Center</h1>
            <p className="text-sm text-slate-400">Interact with the slot distributor using mUSDT on BSC.</p>
          </div>
          <div className="flex items-center gap-3">
            {isConnected && (
              <span className="hidden text-xs text-slate-300 md:block">
                <span className="font-mono text-emerald-400">{connectedAddress}</span>
              </span>
            )}
            <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
        <SectionCard title="Network Summary">
          {configQuery.isLoading ? (
            <div>Loading configuration…</div>
          ) : configQuery.error ? (
            <div className="text-red-400">{(configQuery.error as Error).message}</div>
          ) : configQuery.data ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-slate-400">Chain</div>
                <div className="font-mono">{configQuery.data.chain}</div>
                <div className="mt-2 text-slate-400">Distributor</div>
                <div className="font-mono text-xs">{configQuery.data.contract.address}</div>
                <div className="mt-2 text-slate-400">USDT Token</div>
                <div className="font-mono text-xs">{configQuery.data.usdtToken}</div>
              </div>
              <div>
                <div className="text-slate-400">Creator Wallet</div>
                <div className="font-mono text-xs">{configQuery.data.creatorWallet}</div>
                <div className="mt-2 text-slate-400">Flash Wallet</div>
                <div className="font-mono text-xs">{configQuery.data.flashWallet}</div>
                <div className="mt-2 text-slate-400">Royalty %</div>
                <div className="grid grid-cols-2 gap-x-4 text-xs">
                  {Object.entries(configQuery.data.royaltyBps).map(([level, bp]) => (
                    <div key={level} className="flex justify-between">
                      <span>L{level}</span>
                      <span>{Number(bp) / 100}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard title="Slot Prices">
          <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
            {configQuery.data?.slotPrices.map((price, index) => (
              <div
                key={index}
                className={clsx(
                  "rounded-lg border border-slate-800 bg-slate-950/60 p-3",
                  selectedSlot === index + 1 && "border-emerald-400"
                )}
              >
                <div className="text-slate-400">Slot {index + 1}</div>
                <div className="text-lg font-semibold">{price} USDT</div>
                <button
                  className="mt-2 w-full rounded bg-emerald-500 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                  onClick={() => setSelectedSlot(index + 1)}
                >
                  Select
                </button>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Approval & Purchase Flow">
          <p className="text-xs text-slate-400">
            Step 1: Approve mUSDT for the contract. Step 2: Register approval (wait one block). Step 3: Execute slot purchase.
          </p>
          <div className="flex flex-col gap-3 md:flex-row">
            <button
              className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? "Approving…" : `Approve Slot ${selectedSlot}`}
            </button>
            <button
              className="rounded bg-slate-800 px-4 py-2 text-sm font-semibold hover:bg-slate-700"
              onClick={() => registerMutation.mutate()}
              disabled={registerMutation.isPending}
            >
              {registerMutation.isPending ? "Registering…" : "Register Approval"}
            </button>
            <div className="flex flex-1 items-center gap-2">
              <input
                className="flex-1 rounded border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-emerald-400 focus:outline-none"
                placeholder="Sponsor address"
                value={sponsor}
                onChange={(event) => setSponsor(event.target.value)}
              />
              <button
                className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
                onClick={() => slotBuyMutation.mutate()}
                disabled={slotBuyMutation.isPending}
              >
                {slotBuyMutation.isPending ? "Buying…" : `Buy Slot ${selectedSlot}`}
              </button>
            </div>
          </div>
          <TxReceiptCard hash={lastTx?.hash ?? null} label={lastTx?.label ?? "Last Transaction"} explorerBase={explorerBase} />
        </SectionCard>

        {isConnected && userProfileQuery.data && (
          <SectionCard title="Your Profile">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-slate-400">Referrer</div>
                <div className="font-mono text-xs">{userProfileQuery.data.referrer || "None"}</div>
                <div className="mt-2 text-slate-400">Highest Slot Owned</div>
                <div>{userProfileQuery.data.maxSlot}</div>
              </div>
              <div>
                <div className="text-slate-400">Registered Allowance</div>
                <div>{userProfileQuery.data.registeredAllowance.allowance} USDT</div>
                <div className="text-xs text-slate-500">Recorded at block {userProfileQuery.data.registeredAllowance.blockNum}</div>
              </div>
            </div>
            <div>
              <div className="text-slate-400">Qualified Directs</div>
              <div className="mt-1 grid grid-cols-3 gap-2 text-xs">
                {userProfileQuery.data.qualifiedDirects.map((item) => (
                  <div key={item.level} className="rounded border border-slate-800 bg-slate-950/60 p-2">
                    <div>L{item.level}</div>
                    <div className="font-semibold">{item.count}</div>
                  </div>
                ))}
              </div>
            </div>
          </SectionCard>
        )}

      </main>
    </div>
  );
};

export default App;
