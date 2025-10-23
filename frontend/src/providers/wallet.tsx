import { ReactNode, useMemo } from "react";
import { RainbowKitProvider, darkTheme, getDefaultWallets } from "@rainbow-me/rainbowkit";
import { WagmiConfig, configureChains, createConfig } from "wagmi";
import { jsonRpcProvider } from "wagmi/providers/jsonRpc";
import { publicProvider } from "wagmi/providers/public";
import { bscTestnet, sepolia } from "wagmi/chains";
import type { Chain } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || "demo";
const chainId = Number(import.meta.env.VITE_CHAIN_ID || 97);
const backendUrl = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

const hardhatChain: Chain = {
  id: 31337,
  name: "Hardhat",
  network: "hardhat",
  nativeCurrency: { name: "Hardhat ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [import.meta.env.VITE_HARDHAT_RPC_URL || "http://127.0.0.1:8545"]
    },
    public: {
      http: [import.meta.env.VITE_HARDHAT_RPC_URL || "http://127.0.0.1:8545"]
    }
  },
  blockExplorers: {
    default: {
      name: "Hardhat",
      url: import.meta.env.VITE_HARDHAT_EXPLORER || "http://127.0.0.1:8545"
    }
  },
  testnet: true
};

const baseChains = [bscTestnet, sepolia];
const supportedChains = chainId === hardhatChain.id ? [hardhatChain] : baseChains;
const activeChain =
  supportedChains.find((chain) => chain.id === chainId) ??
  (chainId === hardhatChain.id ? hardhatChain : bscTestnet);

const { chains, publicClient, webSocketPublicClient } = configureChains(supportedChains, [
  jsonRpcProvider({
    rpc: (chain) => ({ http: chain.rpcUrls.default.http[0]! })
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

type WalletProviderProps = {
  children: ReactNode;
};

export const WalletProvider = ({ children }: WalletProviderProps) => {
  const theme = useMemo(
    () =>
      darkTheme({
        accentColor: "#10b981",
        accentColorForeground: "#0f172a",
        borderRadius: "medium"
      }),
    []
  );

  return (
    <WagmiConfig config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider chains={chains} theme={theme} modalSize="compact" initialChain={activeChain}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiConfig>
  );
};

export const env = {
  chainId,
  backendUrl
};
