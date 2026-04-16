import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/i18n/context";
import { Web3Provider } from "@/components/providers/web3-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Octo-Agent | AI Social Operations",
  description: "Auto Post, Auto Reply, and Auto DM for Web3 projects, creators, and lean growth teams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Web3Provider>
          <I18nProvider>{children}</I18nProvider>
        </Web3Provider>
      </body>
    </html>
  );
}
