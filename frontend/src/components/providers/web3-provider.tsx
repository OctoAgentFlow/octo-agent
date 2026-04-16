"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppKitProvider } from "@reown/appkit/react";
import { WagmiProvider } from "wagmi";
import { metadata, networks, projectId, wagmiAdapter } from "@/lib/web3/appkit-config";

const Web3ReadyContext = createContext(false);

export function useWeb3Ready() {
  return useContext(Web3ReadyContext);
}

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(id);
  }, []);

  if (!mounted) {
    return <Web3ReadyContext.Provider value={false}>{children}</Web3ReadyContext.Provider>;
  }

  return (
    <Web3ReadyContext.Provider value>
      <WagmiProvider config={wagmiAdapter.wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <AppKitProvider
            adapters={[wagmiAdapter]}
            projectId={projectId}
            networks={networks}
            metadata={metadata}
            themeMode="dark"
            features={{ analytics: false }}
          >
            {children}
          </AppKitProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </Web3ReadyContext.Provider>
  );
}

