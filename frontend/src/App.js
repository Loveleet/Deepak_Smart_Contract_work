import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Toaster, toast } from "sonner";
import clsx from "clsx";
import { env } from "./providers/wallet";
import { TxReceiptCard } from "./components/TxReceipt";
const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Invalid address");
const amountSchema = z.string().regex(/^\d+(\.\d+)?$/, "Amount must be numeric");
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const explorerBase = env.chainId === 11155111 ? "https://sepolia.etherscan.io" : "https://testnet.bscscan.com";
const fetchJson = async (url, options) => {
    const response = await fetch(url, options);
    const data = await response.json();
    if (!response.ok) {
        const message = data.error ?? response.statusText;
        throw new Error(message);
    }
    return data;
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
    payees: z.string().transform((value) => value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)),
    bps: z.string().transform((value) => value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => Number(entry)))
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
const SectionCard = ({ title, description, children }) => (_jsxs("section", { className: "rounded-xl border border-slate-800 bg-slate-900/70 p-6 shadow-lg shadow-emerald-500/5", children: [_jsxs("header", { className: "mb-4", children: [_jsx("h3", { className: "text-lg font-semibold text-emerald-300", children: title }), description ? _jsx("p", { className: "mt-1 text-sm text-slate-400", children: description }) : null] }), children] }));
const FormErrors = ({ errors }) => {
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
    return (_jsx("div", { className: "rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-red-300", children: messages.map((message, index) => (_jsx("div", { children: message }, `${message}-${index}`))) }));
};
function useBackendSubmit(apiKey) {
    return useMemo(() => {
        const submit = async (endpoint, payload, requireKey = false) => {
            const headers = {
                "Content-Type": "application/json"
            };
            if (requireKey) {
                if (!apiKey) {
                    throw new Error("API key required");
                }
                headers["X-API-Key"] = apiKey;
            }
            return fetchJson(`${env.backendUrl}${endpoint}`, {
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
        queryFn: () => fetchJson(`${env.backendUrl}/config`),
        refetchInterval: 15_000
    });
    const balanceQuery = useQuery({
        queryKey: ["balance", address],
        queryFn: () => fetchJson(`${env.backendUrl}/balance/${address}`),
        enabled: Boolean(address),
        refetchInterval: 10_000
    });
    const [slotReceipt, setSlotReceipt] = useState(null);
    const [directReceipt, setDirectReceipt] = useState(null);
    const [royaltyReceipt, setRoyaltyReceipt] = useState(null);
    const [superRoyaltyReceipt, setSuperRoyaltyReceipt] = useState(null);
    const [creatorReceipt, setCreatorReceipt] = useState(null);
    const [flashReceipt, setFlashReceipt] = useState(null);
    const [feesReceipt, setFeesReceipt] = useState(null);
    const [feeWalletReceipt, setFeeWalletReceipt] = useState(null);
    const slotForm = useForm({
        resolver: zodResolver(slotBuyFormSchema),
        defaultValues: { referrer: ZERO_ADDRESS }
    });
    const directForm = useForm({
        resolver: zodResolver(directCommissionSchema)
    });
    const royaltyForm = useForm({
        resolver: zodResolver(royaltyTransferSchema)
    });
    const superRoyaltyForm = useForm({
        resolver: zodResolver(superRoyaltySchema)
    });
    const creatorForm = useForm({
        resolver: zodResolver(creatorTransferSchema)
    });
    const flashForm = useForm({
        resolver: zodResolver(flashTransferSchema)
    });
    const setFeeWalletsForm = useForm({
        resolver: zodResolver(setFeeWalletsSchema)
    });
    const setFeesForm = useForm({
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
        mutationFn: (payload) => submit("/slot-buy", payload),
        onSuccess: (receipt) => {
            setSlotReceipt(receipt);
            toast.success("Slot buy executed");
            slotForm.reset({ referrer: ZERO_ADDRESS });
            balanceQuery.refetch();
        },
        onError: (error) => toast.error(error.message)
    });
    const directMutation = useMutation({
        mutationFn: (payload) => submit("/direct-commission", payload),
        onSuccess: (receipt) => {
            setDirectReceipt(receipt);
            toast.success("Direct commission executed");
            directForm.reset();
            balanceQuery.refetch();
        },
        onError: (error) => toast.error(error.message)
    });
    const royaltyMutation = useMutation({
        mutationFn: (payload) => submit("/royalty-transfer", payload),
        onSuccess: (receipt) => {
            setRoyaltyReceipt(receipt);
            toast.success("Royalty transfer executed");
            royaltyForm.reset();
            balanceQuery.refetch();
        },
        onError: (error) => toast.error(error.message)
    });
    const superRoyaltyMutation = useMutation({
        mutationFn: (payload) => submit("/super-royalty-transfer", {
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
        onError: (error) => toast.error(error.message)
    });
    const creatorMutation = useMutation({
        mutationFn: (payload) => submit("/creator-transfer", payload),
        onSuccess: (receipt) => {
            setCreatorReceipt(receipt);
            toast.success("Creator transfer executed");
            creatorForm.reset();
            balanceQuery.refetch();
        },
        onError: (error) => toast.error(error.message)
    });
    const flashMutation = useMutation({
        mutationFn: (payload) => submit("/flash-transfer", payload, true),
        onSuccess: (receipt) => {
            setFlashReceipt(receipt);
            toast.success("Flash transfer executed");
            flashForm.reset();
            balanceQuery.refetch();
        },
        onError: (error) => toast.error(error.message)
    });
    const setFeeWalletsMutation = useMutation({
        mutationFn: (payload) => submit("/set-fee-wallets", payload, true),
        onSuccess: (receipt) => {
            setFeeWalletReceipt(receipt);
            toast.success("Fee wallets updated");
            configQuery.refetch();
        },
        onError: (error) => toast.error(error.message)
    });
    const setFeesMutation = useMutation({
        mutationFn: (payload) => submit("/set-fees", {
            feeType: payload.feeType,
            config: {
                platformFeeBps: payload.platformFeeBps,
                creatorFeeBps: payload.creatorFeeBps,
                royaltyFeeBps: payload.royaltyFeeBps,
                referrerFeeBps: payload.referrerFeeBps
            }
        }, true),
        onSuccess: (receipt) => {
            setFeesReceipt(receipt);
            toast.success("Fees updated");
            configQuery.refetch();
        },
        onError: (error) => toast.error(error.message)
    });
    const isAdmin = useMemo(() => {
        if (!isConnected || !address || !configQuery.data) {
            return false;
        }
        const lower = address.toLowerCase();
        return Object.values(configQuery.data.wallets).some((wallet) => wallet.toLowerCase() === lower);
    }, [address, isConnected, configQuery.data]);
    return (_jsxs("div", { className: "min-h-screen bg-slate-950", children: [_jsx(Toaster, { richColors: true }), _jsx("header", { className: "border-b border-slate-900 bg-slate-950/70 backdrop-blur", children: _jsxs("div", { className: "mx-auto flex max-w-6xl items-center justify-between px-6 py-6", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-semibold text-emerald-300", children: "LAB Token Dashboard" }), _jsx("p", { className: "text-sm text-slate-400", children: "Manage token flows, fees, and advanced payouts on BSC Testnet" })] }), _jsx(ConnectButton, {})] }) }), _jsxs("main", { className: "mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8", children: [_jsxs("section", { className: "grid gap-4 md:grid-cols-3", children: [_jsxs("div", { className: "rounded-xl border border-slate-800 bg-slate-900/70 p-4", children: [_jsx("div", { className: "text-sm text-slate-400", children: "Network" }), _jsx("div", { className: "mt-1 text-lg font-semibold text-emerald-300", children: env.chainId === 11155111 ? "Ethereum Sepolia" : "BSC Testnet" })] }), _jsxs("div", { className: "rounded-xl border border-slate-800 bg-slate-900/70 p-4", children: [_jsx("div", { className: "text-sm text-slate-400", children: "Total Supply" }), _jsxs("div", { className: "mt-1 text-lg font-semibold text-slate-100", children: [configQuery.data?.totalSupply ?? "—", " ", configQuery.data?.symbol ?? ""] })] }), _jsxs("div", { className: "rounded-xl border border-slate-800 bg-slate-900/70 p-4", children: [_jsx("div", { className: "text-sm text-slate-400", children: "Your Balance" }), _jsx("div", { className: "mt-1 text-lg font-semibold text-slate-100", children: balanceQuery.data?.formatted ?? (isConnected ? "Loading…" : "—") })] })] }), _jsx(SectionCard, { title: "Token Overview", description: "Current fee settings and payout wallets.", children: configQuery.isLoading ? (_jsx("div", { className: "text-sm text-slate-400", children: "Loading configuration\u2026" })) : configQuery.data ? (_jsxs("div", { className: "grid gap-6 md:grid-cols-2", children: [_jsxs("div", { children: [_jsx("h4", { className: "text-sm font-semibold uppercase tracking-wide text-slate-400", children: "Fee Wallets" }), _jsx("dl", { className: "mt-3 space-y-2 text-sm", children: Object.entries(configQuery.data.wallets).map(([key, value]) => (_jsxs("div", { className: "flex flex-col rounded-lg border border-slate-800 bg-slate-950/60 p-3", children: [_jsx("dt", { className: "text-slate-400", children: key }), _jsx("dd", { className: "font-mono text-emerald-200", children: value })] }, key))) })] }), _jsxs("div", { children: [_jsx("h4", { className: "text-sm font-semibold uppercase tracking-wide text-slate-400", children: "Fees (bps)" }), _jsx("div", { className: "mt-3 space-y-3 text-sm", children: Object.entries(configQuery.data.fees).map(([key, value]) => (_jsxs("div", { className: "rounded-lg border border-slate-800 bg-slate-950/60 p-3", children: [_jsx("div", { className: "text-emerald-300", children: key }), _jsxs("div", { className: "mt-2 grid grid-cols-2 gap-2 font-mono text-xs text-slate-300", children: [_jsxs("span", { children: ["Platform: ", value.platformFeeBps] }), _jsxs("span", { children: ["Creator: ", value.creatorFeeBps] }), _jsxs("span", { children: ["Royalty: ", value.royaltyFeeBps] }), _jsxs("span", { children: ["Referrer: ", value.referrerFeeBps] })] })] }, key))) })] })] })) : (_jsx("div", { className: "text-sm text-red-400", children: configQuery.error?.message })) }), _jsx(SectionCard, { title: "API Key", description: "Required for admin-only endpoints and flash transfers.", children: _jsxs("div", { className: "flex flex-wrap items-center gap-3", children: [_jsx("input", { type: "password", placeholder: "Enter API key", value: apiKey, onChange: (event) => setApiKey(event.target.value), className: "flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 md:max-w-xs" }), _jsx("span", { className: "text-xs text-slate-400", children: "Supplied as `X-API-Key` header to privileged backend routes." })] }) }), _jsxs("div", { className: "grid gap-6 lg:grid-cols-2", children: [_jsxs(SectionCard, { title: "Slot Buy", description: "Distribute platform, creator, royalty, and referral fees.", children: [_jsxs("form", { className: "space-y-3", onSubmit: slotForm.handleSubmit((values) => slotMutation.mutate(values)), children: [_jsx("input", { className: "w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none", placeholder: "Recipient", ...slotForm.register("recipient") }), _jsx("input", { className: "w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none", placeholder: "Amount (tokens)", ...slotForm.register("amount") }), _jsx("input", { className: "w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none", placeholder: "Referrer (optional)", ...slotForm.register("referrer") }), _jsx("button", { type: "submit", className: clsx("w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400", slotMutation.isPending && "opacity-70"), disabled: slotMutation.isPending, children: slotMutation.isPending ? "Submitting…" : "Execute slot buy" }), _jsx(FormErrors, { errors: slotForm.formState.errors })] }), _jsx(TxReceiptCard, { receipt: slotReceipt, title: "Latest Slot Buy", explorerBase: explorerBase })] }), _jsxs(SectionCard, { title: "Direct Commission", description: "Split sale proceeds between seller and platform/creator fees.", children: [_jsxs("form", { className: "space-y-3", onSubmit: directForm.handleSubmit((values) => directMutation.mutate(values)), children: [_jsx("input", { className: "w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none", placeholder: "Seller address", ...directForm.register("seller") }), _jsx("input", { className: "w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none", placeholder: "Amount", ...directForm.register("amount") }), _jsx("button", { type: "submit", className: clsx("w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400", directMutation.isPending && "opacity-70"), disabled: directMutation.isPending, children: directMutation.isPending ? "Submitting…" : "Execute direct commission" }), _jsx(FormErrors, { errors: directForm.formState.errors })] }), _jsx(TxReceiptCard, { receipt: directReceipt, title: "Latest Direct Commission", explorerBase: explorerBase })] }), _jsxs(SectionCard, { title: "Royalty Transfer", description: "Route secondary royalties with platform cut.", children: [_jsxs("form", { className: "space-y-3", onSubmit: royaltyForm.handleSubmit((values) => royaltyMutation.mutate(values)), children: [_jsx("input", { className: "w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none", placeholder: "Recipient", ...royaltyForm.register("recipient") }), _jsx("input", { className: "w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none", placeholder: "Amount", ...royaltyForm.register("amount") }), _jsx("button", { type: "submit", className: clsx("w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400", royaltyMutation.isPending && "opacity-70"), disabled: royaltyMutation.isPending, children: royaltyMutation.isPending ? "Submitting…" : "Execute royalty transfer" }), _jsx(FormErrors, { errors: royaltyForm.formState.errors })] }), _jsx(TxReceiptCard, { receipt: royaltyReceipt, title: "Latest Royalty Transfer", explorerBase: explorerBase })] }), _jsxs(SectionCard, { title: "Super Royalty Transfer", description: "Split payouts across multiple payees (comma separated addresses and BPS).", children: [_jsxs("form", { className: "space-y-3", onSubmit: superRoyaltyForm.handleSubmit((values) => superRoyaltyMutation.mutate(values)), children: [_jsx("input", { className: "w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none", placeholder: "Recipient", ...superRoyaltyForm.register("recipient") }), _jsx("input", { className: "w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none", placeholder: "Amount", ...superRoyaltyForm.register("amount") }), _jsx("textarea", { className: "h-20 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none", placeholder: "Payees (comma separated addresses)", ...superRoyaltyForm.register("payees") }), _jsx("textarea", { className: "h-20 w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none", placeholder: "BPS (comma separated numbers)", ...superRoyaltyForm.register("bps") }), _jsx("button", { type: "submit", className: clsx("w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400", superRoyaltyMutation.isPending && "opacity-70"), disabled: superRoyaltyMutation.isPending, children: superRoyaltyMutation.isPending ? "Submitting…" : "Execute super royalty transfer" }), _jsx(FormErrors, { errors: superRoyaltyForm.formState.errors })] }), _jsx(TxReceiptCard, { receipt: superRoyaltyReceipt, title: "Latest Super Royalty Transfer", explorerBase: explorerBase })] }), _jsxs(SectionCard, { title: "Creator Transfer", description: "Send token with creator fee split.", children: [_jsxs("form", { className: "space-y-3", onSubmit: creatorForm.handleSubmit((values) => creatorMutation.mutate(values)), children: [_jsx("input", { className: "w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none", placeholder: "Recipient", ...creatorForm.register("recipient") }), _jsx("input", { className: "w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none", placeholder: "Amount", ...creatorForm.register("amount") }), _jsx("button", { type: "submit", className: clsx("w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400", creatorMutation.isPending && "opacity-70"), disabled: creatorMutation.isPending, children: creatorMutation.isPending ? "Submitting…" : "Execute creator transfer" }), _jsx(FormErrors, { errors: creatorForm.formState.errors })] }), _jsx(TxReceiptCard, { receipt: creatorReceipt, title: "Latest Creator Transfer", explorerBase: explorerBase })] }), _jsxs(SectionCard, { title: "Flash Transfer", description: "Requires FLASH_ROLE and API key.", children: [_jsxs("form", { className: "space-y-3", onSubmit: flashForm.handleSubmit((values) => flashMutation.mutate(values)), children: [_jsx("input", { className: "w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none", placeholder: "Recipient", ...flashForm.register("to") }), _jsx("input", { className: "w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none", placeholder: "Amount", ...flashForm.register("amount") }), _jsx("button", { type: "submit", className: clsx("w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400", flashMutation.isPending && "opacity-70"), disabled: flashMutation.isPending, children: flashMutation.isPending ? "Submitting…" : "Execute flash transfer" }), _jsx(FormErrors, { errors: flashForm.formState.errors })] }), _jsx(TxReceiptCard, { receipt: flashReceipt, title: "Latest Flash Transfer", explorerBase: explorerBase })] })] }), isAdmin && (_jsx(SectionCard, { title: "Admin Panel", description: "Update fee wallets, fee schedules, and manage roles.", children: _jsxs("div", { className: "grid gap-6 lg:grid-cols-2", children: [_jsxs("div", { children: [_jsx("h4", { className: "text-sm font-semibold uppercase tracking-wide text-slate-400", children: "Set Fee Wallets" }), _jsxs("form", { className: "mt-3 space-y-3", onSubmit: setFeeWalletsForm.handleSubmit((values) => setFeeWalletsMutation.mutate(values)), children: [_jsx("input", { className: "w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none", placeholder: "Platform wallet", ...setFeeWalletsForm.register("platformWallet") }), _jsx("input", { className: "w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none", placeholder: "Creator wallet", ...setFeeWalletsForm.register("creatorWallet") }), _jsx("input", { className: "w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none", placeholder: "Royalty wallet", ...setFeeWalletsForm.register("royaltyWallet") }), _jsx("button", { type: "submit", className: clsx("w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400", setFeeWalletsMutation.isPending && "opacity-70"), disabled: setFeeWalletsMutation.isPending, children: setFeeWalletsMutation.isPending ? "Saving…" : "Update fee wallets" }), _jsx(FormErrors, { errors: setFeeWalletsForm.formState.errors })] }), _jsx(TxReceiptCard, { receipt: feeWalletReceipt, title: "Latest Fee Wallet Update", explorerBase: explorerBase })] }), _jsxs("div", { children: [_jsx("h4", { className: "text-sm font-semibold uppercase tracking-wide text-slate-400", children: "Set Fees" }), _jsxs("form", { className: "mt-3 space-y-3", onSubmit: setFeesForm.handleSubmit((values) => setFeesMutation.mutate(values)), children: [_jsxs("select", { className: "w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none", ...setFeesForm.register("feeType"), children: [_jsx("option", { value: "slotBuy", children: "Slot Buy" }), _jsx("option", { value: "directCommission", children: "Direct Commission" }), _jsx("option", { value: "royaltyTransfer", children: "Royalty Transfer" }), _jsx("option", { value: "superRoyaltyTransfer", children: "Super Royalty Transfer" }), _jsx("option", { value: "creatorTransfer", children: "Creator Transfer" }), _jsx("option", { value: "flashTransfer", children: "Flash Transfer" })] }), ["platformFeeBps", "creatorFeeBps", "royaltyFeeBps", "referrerFeeBps"].map((field) => (_jsx("input", { type: "number", className: "w-full rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none", placeholder: `${field} (bps)`, ...setFeesForm.register(field) }, field))), _jsx("button", { type: "submit", className: clsx("w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400", setFeesMutation.isPending && "opacity-70"), disabled: setFeesMutation.isPending, children: setFeesMutation.isPending ? "Saving…" : "Update fees" }), _jsx(FormErrors, { errors: setFeesForm.formState.errors })] }), _jsx(TxReceiptCard, { receipt: feesReceipt, title: "Latest Fee Update", explorerBase: explorerBase })] })] }) }))] }), _jsx("footer", { className: "border-t border-slate-900 bg-slate-950/70 py-6", children: _jsxs("div", { className: "mx-auto max-w-6xl px-6 text-sm text-slate-500", children: ["Connected contract:", " ", _jsx("span", { className: "font-mono text-emerald-200", children: configQuery.data?.contract.address ?? "—" })] }) })] }));
};
export default App;
