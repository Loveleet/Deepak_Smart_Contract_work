import { jsx as _jsx } from "react/jsx-runtime";
import { useMemo } from "react";
import { RainbowKitProvider, darkTheme, getDefaultWallets } from "@rainbow-me/rainbowkit";
import { WagmiConfig, configureChains, createConfig } from "wagmi";
import { jsonRpcProvider } from "wagmi/providers/jsonRpc";
import { publicProvider } from "wagmi/providers/public";
import { bscTestnet, sepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "demo";
const chainId = Number(import.meta.env.VITE_CHAIN_ID || 97);
const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";
const supportedChains = [bscTestnet, sepolia];
const activeChain = supportedChains.find((chain) => chain.id === chainId) ?? bscTestnet;
const { chains, publicClient, webSocketPublicClient } = configureChains(supportedChains, [
    jsonRpcProvider({
        rpc: (chain) => ({ http: chain.rpcUrls.default.http[0] })
    }),
    publicProvider()
]);
const { connectors } = getDefaultWallets({
    appName: "LAB Token Dashboard",
    projectId,
    chains
});
const wagmiConfig = createConfig({
    autoConnect: true,
    connectors,
    publicClient,
    webSocketPublicClient
});
const queryClient = new QueryClient();
export const WalletProvider = ({ children }) => {
    const theme = useMemo(() => darkTheme({
        accentColor: "#10b981",
        accentColorForeground: "#0f172a",
        borderRadius: "medium"
    }), []);
    return (_jsx(WagmiConfig, { config: wagmiConfig, children: _jsx(QueryClientProvider, { client: queryClient, children: _jsx(RainbowKitProvider, { chains: chains, theme: theme, modalSize: "compact", initialChain: activeChain, children: children }) }) }));
};
export const env = {
    chainId,
    backendUrl
};
