"use client";

import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { bsc, mainnet } from "@reown/appkit/networks";
import type { AppKitNetwork } from "@reown/appkit-common";

export const projectId = "87b3b2eaece1b7480ed12ffb82f7018b";

const networkList: AppKitNetwork[] = [mainnet, bsc];
export const networks = networkList as [AppKitNetwork, ...AppKitNetwork[]];

export const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks: networkList,
});

export const metadata = {
  name: "Octo-Agent",
  description: "AI Social Operations Platform",
  url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  icons: [`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/favicon.ico`],
};

