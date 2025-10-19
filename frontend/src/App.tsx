import { type ReactNode, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { type FieldErrors, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Toaster, toast } from "sonner";
import clsx from "clsx";
import { env } from "./providers/wallet";
import { TxReceipt, TxReceiptCard } from "./components/TxReceipt";

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address");
const amountSchema = z.string().regex(/^\d+(\.\d+)?$/, "Amount must be numeric");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

type BackendReceipt = TxReceipt;

type ConfigResponse = {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  contract: {
    address: string;
    abi: unknown[];
  };
  wallets: {
    platformWallet: string;
    creatorWallet: string;
    royaltyWallet: string;
  };
  fees: Record<
    string,
    {
      platformFeeBps: number;
      creatorFeeBps: number;
      royaltyFeeBps: number;
      referrerFeeBps: number;
    }
  >;
};

type BalanceResponse = {
  address: string;
  balance: string;
  formatted: string;
};

const explorerBase = env.chainId === 11155111 ? "https://sepolia.etherscan.io" : "https://testnet.bscscan.com";

const fetchJson = async <T,>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    const message = (data as { error?: string }).error ?? response.statusText;
    throw new Error(message);
  }
  return data as T;
};

const slotBuyFormSchema = z.object({
  recipient: addressSchema,
  amount: amountSchema,
  referrer: addressSchema.optional().default(ZERO_ADDRESS)
});

const directCommissionSchema = z.object({
  seller: addressSchema,
  amount: amountSchema
});

const royaltyTransferSchema = z.object({
  recipient: addressSchema,
  amount: amountSchema
});

const superRoyaltySchema = z
  .object({
    recipient: addressSchema,
    amount: amountSchema,
    payees: z.string().transform((value) =>
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    ),
    bps: z.string().transform((value) =>
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => Number(entry))
    )
  })
  .refine((data) => data.payees.length === data.bps.length, "Payees and BPS counts must match")
  .refine((data) => data.bps.every((value) => Number.isFinite(value)), "Invalid BPS value")
  .refine((data) => data.bps.every((value) => Number.isInteger(value) && value >= 0), "BPS must be integers >= 0")
  .refine((data) => data.payees.every((entry) => addressSchema.safeParse(entry).success), "Invalid payee address")
  .refine((data) => data.bps.reduce((acc, cur) => acc + cur, 0) <= 10000, "Sum of BPS must be <= 10000");

const creatorTransferSchema = z.object({
  recipient: addressSchema,
  amount: amountSchema
});

const flashTransferSchema = z.object({
  to: addressSchema,
  amount: amountSchema
});

const setFeeWalletsSchema = z.object({
  platformWallet: addressSchema,
  creatorWallet: addressSchema,
  royaltyWallet: addressSchema
});

const setFeesSchema = z.object({
  feeType: z.enum([
    "slotBuy",
    "directCommission",
    "royaltyTransfer",
    "superRoyaltyTransfer",
    "creatorTransfer",
    "flashTransfer"
  ]),
  platformFeeBps: z.coerce.number().int().min(0).max(1000),
  creatorFeeBps: z.coerce.number().int().min(0).max(1000),
  royaltyFeeBps: z.coerce.number().int().min(0).max(1000),
  referrerFeeBps: z.coerce.number().int().min(0).max(1000)
});

const SectionCard = ({ title, description, children }: { title: string; description?: string; children: ReactNode }) => (
  <section className="rounded-xl border border-slate-800 bg-slate-900/70 p-6 shadow-lg shadow-emerald-500/5">
    <header className="mb-4">
      <h3 className="text-lg font-semibold text-emerald-300">{title}</h3>
      {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
    </header>
    {children}
  </section>
);

const FormErrors = ({ errors }: { errors: FieldErrors }) => {
  const messages = Object.values(errors)
    .map((error) => {
      if (!error) {
        return null;
      }
      if ("message" in error && error.message) {
        return String(error.message);
      }
      if ("types" in error && error.types) {
        return Object.values(error.types)
          .map(String)
          .join(", ");
      }
      if ("ref" in error && error.ref) {
        return "Invalid field value";
      }
      return null;
    })
    .filter(Boolean);

  if (messages.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-red-300">
      {messages.map((message, index) => (
        <div key={`${message}-${index}`}>{message}</div>
      ))}
    </div>
  );
};

function useBackendSubmit(apiKey: string) {
  return useMemo(() => {
    const submit = async (endpoint: string, payload: unknown, requireKey = false) => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      if (requireKey) {
        if (!apiKey) {
          throw new Error("API key required");
        }
        headers["X-API-Key"] = apiKey;
      }
      return fetchJson<BackendReceipt>(`${env.backendUrl}${endpoint}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });
    };
    return submit;
  }, [apiKey]);
}

const App = () => {
  const { address, isConnected } = useAccount();
  const [apiKey, setApiKey] = useState("");
  const submit = useBackendSubmit(apiKey);

  const configQuery = useQuery({
    queryKey: ["config"],
    queryFn: () => fetchJson<ConfigResponse>(`${env.backendUrl}/config`),
    refetchInterval: 15_000
  });

  const balanceQuery = useQuery({
    queryKey: ["balance", address],
    queryFn: () => fetchJson<BalanceResponse>(`${env.backendUrl}/balance/${address}`),
    enabled: Boolean(address),
    refetchInterval: 10_000
  });

  const [slotReceipt, setSlotReceipt] = useState<TxReceipt | null>(null);
  const [directReceipt, setDirectReceipt] = useState<TxReceipt | null>(null);
  const [royaltyReceipt, setRoyaltyReceipt] = useState<TxReceipt | null>(null);
  const [superRoyaltyReceipt, setSuperRoyaltyReceipt] = useState<TxReceipt | null>(null);
  const [creatorReceipt, setCreatorReceipt] = useState<TxReceipt | null>(null);
  const [flashReceipt, setFlashReceipt] = useState<TxReceipt | null>(null);
  const [feesReceipt, setFeesReceipt] = useState<TxReceipt | null>(null);
  const [feeWalletReceipt, setFeeWalletReceipt] = useState<TxReceipt | null>(null);

  const slotForm = useForm<z.infer<typeof slotBuyFormSchema>>({
    resolver: zodResolver(slotBuyFormSchema),
    defaultValues: { referrer: ZERO_ADDRESS }
  });
  const directForm = useForm<z.infer<typeof directCommissionSchema>>({
    resolver: zodResolver(directCommissionSchema)
  });
  const royaltyForm = useForm<z.infer<typeof royaltyTransferSchema>>({
    resolver: zodResolver(royaltyTransferSchema)
  });
  const superRoyaltyForm = useForm<z.infer<typeof superRoyaltySchema>>({
    resolver: zodResolver(superRoyaltySchema)
  });
  const creatorForm = useForm<z.infer<typeof creatorTransferSchema>>({
    resolver: zodResolver(creatorTransferSchema)
  });
  const flashForm = useForm<z.infer<typeof flashTransferSchema>>({
    resolver: zodResolver(flashTransferSchema)
  });
  const setFeeWalletsForm = useForm<z.infer<typeof setFeeWalletsSchema>>({
    resolver: zodResolver(setFeeWalletsSchema)
  });
  const setFeesForm = useForm<z.infer<typeof setFeesSchema>>({
    resolver: zodResolver(setFeesSchema),
    defaultValues: {
      feeType: "slotBuy",
      platformFeeBps: 0,
      creatorFeeBps: 0,
      royaltyFeeBps: 0,
      referrerFeeBps: 0
    }
  });

  const slotMutation = useMutation({
    mutationFn: (payload: z.infer<typeof slotBuyFormSchema>) => submit("/slot-buy", payload),
    onSuccess: (receipt) => {
      setSlotReceipt(receipt);
      toast.success("Slot buy executed");
      slotForm.reset({ referrer: ZERO_ADDRESS });
      balanceQuery.refetch();
    },
    onError: (error: unknown) => toast.error((error as Error).message)
  });

  const directMutation = useMutation({
    mutationFn: (payload: z.infer<typeof directCommissionSchema>) => submit("/direct-commission", payload),
    onSuccess: (receipt) => {
      setDirectReceipt(receipt);
      toast.success("Direct commission executed");
      directForm.reset();
      balanceQuery.refetch();
    },
    onError: (error: unknown) => toast.error((error as Error).message)
  });

  const royaltyMutation = useMutation({
    mutationFn: (payload: z.infer<typeof royaltyTransferSchema>) => submit("/royalty-transfer", payload),
    onSuccess: (receipt) => {
      setRoyaltyReceipt(receipt);
      toast.success("Royalty transfer executed");
      royaltyForm.reset();
      balanceQuery.refetch();
    },
    onError: (error: unknown) => toast.error((error as Error).message)
  });

  const superRoyaltyMutation = useMutation({
    mutationFn: (payload: z.infer<typeof superRoyaltySchema>) =>
      submit("/super-royalty-transfer", {
        recipient: payload.recipient,
        amount: payload.amount,
        payees: payload.payees,
        bps: payload.bps
      }),
    onSuccess: (receipt) => {
      setSuperRoyaltyReceipt(receipt);
      toast.success("Super royalty transfer executed");
      superRoyaltyForm.reset();
      balanceQuery.refetch();
    },
    onError: (error: unknown) => toast.error((error as Error).message)
  });

  const creatorMutation = useMutation({
    mutationFn: (payload: z.infer<typeof creatorTransferSchema>) => submit("/creator-transfer", payload),
    onSuccess: (receipt) => {
      setCreatorReceipt(receipt);
      toast.success("Creator transfer executed");
      creatorForm.reset();
      balanceQuery.refetch();
    },
    onError: (error: unknown) => toast.error((error as Error).message)
  });

  const flashMutation = useMutation({
    mutationFn: (payload: z.infer<typeof flashTransferSchema>) => submit("/flash-transfer", payload, true),
    onSuccess: (receipt) => {
      setFlashReceipt(receipt);
      toast.success("Flash transfer executed");
      flashForm.reset();
      balanceQuery.refetch();
    },
    onError: (error: unknown) => toast.error((error as Error).message)
  });

  const setFeeWalletsMutation = useMutation({
    mutationFn: (payload: z.infer<typeof setFeeWalletsSchema>) => submit("/set-fee-wallets", payload, true),
    onSuccess: (receipt) => {
      setFeeWalletReceipt(receipt);
      toast.success("Fee wallets updated");
      configQuery.refetch();
    },
    onError: (error: unknown) => toast.error((error as Error).message)
  });

  const setFeesMutation = useMutation({
    mutationFn: (payload: z.infer<typeof setFeesSchema>) =>
      submit(
        "/set-fees",
        {
          feeType: payload.feeType,
          config: {
            platformFeeBps: payload.platformFeeBps,
            creatorFeeBps: payload.creatorFeeBps,
            royaltyFeeBps: payload.royaltyFeeBps,
            referrerFeeBps: payload.referrerFeeBps
          }
        },
        true
      ),
    onSuccess: (receipt) => {
      setFeesReceipt(receipt);
      toast.success("Fees updated");
      configQuery.refetch();
    },
    onError: (error: unknown) => toast.error((error as Error).message)
  });

  const isAdmin = useMemo(() => {
    if (!isConnected || !address || !configQuery.data) {
      return false;
    }
    const lower = address.toLowerCase();
    return Object.values(configQuery.data.wallets).some((wallet) => wallet.toLowerCase() === lower);
  }, [address, isConnected, configQuery.data]);

  return (
    <div className="min-h-screen bg-slate-950">
      <Toaster richColors />
      <header className="border-b border-slate-900 bg-slate-950/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div>
            <h1 className="text-2xl font-semibold text-emerald-300">LAB Token Dashboard</h1>
            <p className="text-sm text-slate-400">
              Manage token flows, fees, and advanced payouts on BSC Testnet
            </p>
          </div>
          <ConnectButton />
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="text-sm text-slate-400">Network</div>
            <div className="mt-1 text-lg font-semibold text-emerald-300">
              {env.chainId === 11155111 ? "Ethereum Sepolia" : "BSC Testnet"}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="text-sm text-slate-400">Total Supply</div>
            <div className="mt-1 text-lg font-semibold text-slate-100">
              {configQuery.data?.totalSupply ?? "—"} {configQuery.data?.symbol ?? ""}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="text-sm text-slate-400">Your Balance</div>
            <div className="mt-1 text-lg font-semibold text-slate-100">
              {balanceQuery.data?.formatted ?? (isConnected ? "Loading…" : "—")}
            </div>
          </div>
        </section>

        <SectionCard title="Token Overview" description="Current fee settings and payout wallets.">
          {configQuery.isLoading ? (
            <div className="text-sm text-slate-400">Loading configuration…</div>
          ) : configQuery.data ? (
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Fee Wallets</h4>
                <dl className="mt-3 space-y-2 text-sm">
                  {Object.entries(configQuery.data.wallets).map(([key, value]) => (
                    <div key={key} className="flex flex-col rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                      <dt className="text-slate-400">{key}</dt>
                      <dd className="font-mono text-emerald-200">{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Fees (bps)</h4>
                <div className="mt-3 space-y-3 text-sm">
                  {Object.entries(configQuery.data.fees).map(([key, value]) => (
                    <div key={key} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                      <div className="text-emerald-300">{key}</div>
                      <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-xs text-slate-300">
                        <span>Platform: {value.platformFeeBps}</span>
                        <span>Creator: {value.creatorFeeBps}</span>
                        <span>Royalty: {value.royaltyFeeBps}</span>
                        <span>Referrer: {value.referrerFeeBps}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-red-400">{configQuery.error?.message}</div>
          )}
        </SectionCard>

        <SectionCard title="API Key" description="Required for admin-only endpoints and flash transfers.">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="password"
              placeholder="Enter API key"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              className="flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 md:max-w-xs"
            />
            <span className="text-xs text-slate-400">
              Supplied as `X-API-Key` header to privileged backend routes.
            </span>
          </div>
        </SectionCard>

        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title="Slot Buy" description="Distribute platform, creator, royalty, and referral fees.">
            <form
              className="space-y-3"
              onSubmit={slotForm.handleSubmit((values) => slotMutation.mutate(values))}
            >
              <input
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                placeholder="Recipient"
                {...slotForm.register("recipient")}
              />
              <input
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                placeholder="Amount (tokens)"
                {...slotForm.register("amount")}
              />
              <input
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                placeholder="Referrer (optional)"
                {...slotForm.register("referrer")}
              />
              <button
                type="submit"
                className={clsx(
                  "w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400",
                  slotMutation.isPending && "opacity-70"
                )}
                disabled={slotMutation.isPending}
              >
                {slotMutation.isPending ? "Submitting…" : "Execute slot buy"}
              </button>
              <FormErrors errors={slotForm.formState.errors} />
            </form>
            <TxReceiptCard receipt={slotReceipt} title="Latest Slot Buy" explorerBase={explorerBase} />
          </SectionCard>

          <SectionCard
            title="Direct Commission"
            description="Split sale proceeds between seller and platform/creator fees."
          >
            <form
              className="space-y-3"
              onSubmit={directForm.handleSubmit((values) => directMutation.mutate(values))}
            >
              <input
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                placeholder="Seller address"
                {...directForm.register("seller")}
              />
              <input
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                placeholder="Amount"
                {...directForm.register("amount")}
              />
              <button
                type="submit"
                className={clsx(
                  "w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400",
                  directMutation.isPending && "opacity-70"
                )}
                disabled={directMutation.isPending}
              >
                {directMutation.isPending ? "Submitting…" : "Execute direct commission"}
              </button>
              <FormErrors errors={directForm.formState.errors} />
            </form>
            <TxReceiptCard receipt={directReceipt} title="Latest Direct Commission" explorerBase={explorerBase} />
          </SectionCard>

          <SectionCard title="Royalty Transfer" description="Route secondary royalties with platform cut.">
            <form
              className="space-y-3"
              onSubmit={royaltyForm.handleSubmit((values) => royaltyMutation.mutate(values))}
            >
              <input
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                placeholder="Recipient"
                {...royaltyForm.register("recipient")}
              />
              <input
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                placeholder="Amount"
                {...royaltyForm.register("amount")}
              />
              <button
                type="submit"
                className={clsx(
                  "w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400",
                  royaltyMutation.isPending && "opacity-70"
                )}
                disabled={royaltyMutation.isPending}
              >
                {royaltyMutation.isPending ? "Submitting…" : "Execute royalty transfer"}
              </button>
              <FormErrors errors={royaltyForm.formState.errors} />
            </form>
            <TxReceiptCard receipt={royaltyReceipt} title="Latest Royalty Transfer" explorerBase={explorerBase} />
          </SectionCard>

          <SectionCard
            title="Super Royalty Transfer"
            description="Split payouts across multiple payees (comma separated addresses and BPS)."
          >
            <form
              className="space-y-3"
              onSubmit={superRoyaltyForm.handleSubmit((values) => superRoyaltyMutation.mutate(values))}
            >
              <input
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                placeholder="Recipient"
                {...superRoyaltyForm.register("recipient")}
              />
              <input
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                placeholder="Amount"
                {...superRoyaltyForm.register("amount")}
              />
              <textarea
                className="h-20 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                placeholder="Payees (comma separated addresses)"
                {...superRoyaltyForm.register("payees")}
              />
              <textarea
                className="h-20 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                placeholder="BPS (comma separated numbers)"
                {...superRoyaltyForm.register("bps")}
              />
              <button
                type="submit"
                className={clsx(
                  "w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400",
                  superRoyaltyMutation.isPending && "opacity-70"
                )}
                disabled={superRoyaltyMutation.isPending}
              >
                {superRoyaltyMutation.isPending ? "Submitting…" : "Execute super royalty transfer"}
              </button>
              <FormErrors errors={superRoyaltyForm.formState.errors} />
            </form>
            <TxReceiptCard
              receipt={superRoyaltyReceipt}
              title="Latest Super Royalty Transfer"
              explorerBase={explorerBase}
            />
          </SectionCard>

          <SectionCard title="Creator Transfer" description="Send token with creator fee split.">
            <form
              className="space-y-3"
              onSubmit={creatorForm.handleSubmit((values) => creatorMutation.mutate(values))}
            >
              <input
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                placeholder="Recipient"
                {...creatorForm.register("recipient")}
              />
              <input
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                placeholder="Amount"
                {...creatorForm.register("amount")}
              />
              <button
                type="submit"
                className={clsx(
                  "w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400",
                  creatorMutation.isPending && "opacity-70"
                )}
                disabled={creatorMutation.isPending}
              >
                {creatorMutation.isPending ? "Submitting…" : "Execute creator transfer"}
              </button>
              <FormErrors errors={creatorForm.formState.errors} />
            </form>
            <TxReceiptCard receipt={creatorReceipt} title="Latest Creator Transfer" explorerBase={explorerBase} />
          </SectionCard>

          <SectionCard title="Flash Transfer" description="Requires FLASH_ROLE and API key.">
            <form
              className="space-y-3"
              onSubmit={flashForm.handleSubmit((values) => flashMutation.mutate(values))}
            >
              <input
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                placeholder="Recipient"
                {...flashForm.register("to")}
              />
              <input
                className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                placeholder="Amount"
                {...flashForm.register("amount")}
              />
              <button
                type="submit"
                className={clsx(
                  "w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400",
                  flashMutation.isPending && "opacity-70"
                )}
                disabled={flashMutation.isPending}
              >
                {flashMutation.isPending ? "Submitting…" : "Execute flash transfer"}
              </button>
              <FormErrors errors={flashForm.formState.errors} />
            </form>
            <TxReceiptCard receipt={flashReceipt} title="Latest Flash Transfer" explorerBase={explorerBase} />
          </SectionCard>
        </div>

        {isAdmin && (
          <SectionCard title="Admin Panel" description="Update fee wallets, fee schedules, and manage roles.">
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Set Fee Wallets</h4>
                <form
                  className="mt-3 space-y-3"
                  onSubmit={setFeeWalletsForm.handleSubmit((values) => setFeeWalletsMutation.mutate(values))}
                >
                  <input
                    className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                    placeholder="Platform wallet"
                    {...setFeeWalletsForm.register("platformWallet")}
                  />
                  <input
                    className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                    placeholder="Creator wallet"
                    {...setFeeWalletsForm.register("creatorWallet")}
                  />
                  <input
                    className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                    placeholder="Royalty wallet"
                    {...setFeeWalletsForm.register("royaltyWallet")}
                  />
                  <button
                    type="submit"
                    className={clsx(
                      "w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400",
                      setFeeWalletsMutation.isPending && "opacity-70"
                    )}
                    disabled={setFeeWalletsMutation.isPending}
                  >
                    {setFeeWalletsMutation.isPending ? "Saving…" : "Update fee wallets"}
                  </button>
                  <FormErrors errors={setFeeWalletsForm.formState.errors} />
                </form>
                <TxReceiptCard receipt={feeWalletReceipt} title="Latest Fee Wallet Update" explorerBase={explorerBase} />
              </div>

              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Set Fees</h4>
                <form
                  className="mt-3 space-y-3"
                  onSubmit={setFeesForm.handleSubmit((values) => setFeesMutation.mutate(values))}
                >
                  <select
                    className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                    {...setFeesForm.register("feeType")}
                  >
                    <option value="slotBuy">Slot Buy</option>
                    <option value="directCommission">Direct Commission</option>
                    <option value="royaltyTransfer">Royalty Transfer</option>
                    <option value="superRoyaltyTransfer">Super Royalty Transfer</option>
                    <option value="creatorTransfer">Creator Transfer</option>
                    <option value="flashTransfer">Flash Transfer</option>
                  </select>
                  {["platformFeeBps", "creatorFeeBps", "royaltyFeeBps", "referrerFeeBps"].map((field) => (
                    <input
                      key={field}
                      type="number"
                      className="w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                      placeholder={`${field} (bps)`}
                      {...setFeesForm.register(field as keyof z.infer<typeof setFeesSchema>)}
                    />
                  ))}
                  <button
                    type="submit"
                    className={clsx(
                      "w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400",
                      setFeesMutation.isPending && "opacity-70"
                    )}
                    disabled={setFeesMutation.isPending}
                  >
                    {setFeesMutation.isPending ? "Saving…" : "Update fees"}
                  </button>
                  <FormErrors errors={setFeesForm.formState.errors} />
                </form>
                <TxReceiptCard receipt={feesReceipt} title="Latest Fee Update" explorerBase={explorerBase} />
              </div>
            </div>
          </SectionCard>
        )}
      </main>

      <footer className="border-t border-slate-900 bg-slate-950/70 py-6">
        <div className="mx-auto max-w-6xl px-6 text-sm text-slate-500">
          Connected contract:{" "}
          <span className="font-mono text-emerald-200">{configQuery.data?.contract.address ?? "—"}</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
