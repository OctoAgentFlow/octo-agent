import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "@/i18n/context";
import { Web3Provider } from "@/components/providers/web3-provider";
import { ToastProvider } from "@/components/providers/toast-provider";
import { ConfirmProvider } from "@/components/providers/confirm-provider";

export const metadata: Metadata = {
  title: "Octo-Agent Flow | Daily Growth Desk for X Operators",
  description:
    "AI social operations workbench for safe manual X growth with account intelligence, Exposure Radar, persona-aware drafts, content memory, and result learning.",
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
            <I18nProvider>
              <ConfirmProvider>{children}</ConfirmProvider>
            </I18nProvider>
          </ToastProvider>
        </Web3Provider>
      </body>
    </html>
  );
}
