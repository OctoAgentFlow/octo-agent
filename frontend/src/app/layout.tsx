import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "@/i18n/context";
import { Web3Provider } from "@/components/providers/web3-provider";
import { ToastProvider } from "@/components/providers/toast-provider";

export const metadata: Metadata = {
  title: "Octo-Agent Flow | AI Social Operations",
  description: "AI workflow for X posting, replies, DMs, and growth analytics for Web3 projects and lean teams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <Web3Provider>
          <ToastProvider>
            <I18nProvider>{children}</I18nProvider>
          </ToastProvider>
        </Web3Provider>
      </body>
    </html>
  );
}
