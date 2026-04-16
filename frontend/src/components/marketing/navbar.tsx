"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, buttonVariants } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { useT } from "@/i18n/use-t";
import { isAuthed, signOut } from "@/lib/auth-session";
import { ConnectWalletButton } from "@/components/web3/connect-wallet-button";
import { cn } from "@/lib/utils";
import { navItems } from "@/mocks/landing.mock";

export function MarketingNavbar() {
  const router = useRouter();
  const { t } = useT();
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setAuthed(isAuthed());
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const onLogout = () => {
    signOut();
    setAuthed(false);
    router.replace("/");
  };
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070b17]/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6 md:px-8">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-white">
          <span className="inline-block size-2 rounded-full bg-gradient-to-r from-blue-400 to-violet-400" />
          {t("common.brand")}
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-white/70 md:flex">
          {navItems.map((item) => (
            <a key={item.href} href={item.href} className="transition-colors hover:text-white">
              {t(item.labelKey)}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <LanguageSwitcher className="hidden sm:block" />
          <ConnectWalletButton className="hidden sm:inline-flex" connectLabel={t("auth.card.connectWallet")} />
          {authed ? (
            <>
              <Link
                href="/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "stable-cta-md hidden sm:inline-flex"
                )}
              >
                {t("common.dashboard")}
              </Link>
              <Button variant="ghost" className="stable-cta-sm hidden sm:inline-flex" onClick={onLogout}>
                {t("common.logout")}
              </Button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ variant: "ghost" }),
                  "stable-cta-sm hidden text-white/80 hover:bg-white/10 hover:text-white sm:inline-flex"
                )}
              >
                {t("common.login")}
              </Link>
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ variant: "default" }),
                  "stable-cta-md bg-gradient-to-r from-blue-500 to-violet-500 text-white hover:opacity-90"
                )}
              >
                {t("common.startFreeTrial")}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
