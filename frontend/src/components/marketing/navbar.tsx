"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";

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
  const [mobileOpen, setMobileOpen] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setAuthed(isAuthed());
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!headerRef.current) return;
      if (event.target instanceof Node && headerRef.current.contains(event.target)) return;
      setMobileOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  const onLogout = () => {
    signOut();
    setAuthed(false);
    setMobileOpen(false);
    router.replace("/");
  };
  return (
    <header ref={headerRef} className="sticky top-0 z-40 border-b border-white/10 bg-[#070b17]/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 md:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-3 text-sm font-semibold text-white" onClick={() => setMobileOpen(false)}>
          <span className="relative block h-9 w-12 overflow-hidden rounded-md border border-white/10 bg-[#060915]">
            <Image
              src="/brand/oaf-logo.png"
              alt={t("common.brand")}
              fill
              sizes="48px"
              className="object-cover object-left"
              priority
            />
          </span>
          <span className="hidden truncate min-[420px]:inline">{t("common.brand")}</span>
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
                  "stable-cta-md hidden bg-gradient-to-r from-blue-500 to-violet-500 text-white hover:opacity-90 sm:inline-flex"
                )}
              >
                {t("common.startFreeTrial")}
              </Link>
            </>
          )}
          <Button
            type="button"
            variant="outline"
            className="size-10 px-0 text-white/85 md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label={mobileOpen ? t("marketing.nav.closeMenu") : t("marketing.nav.openMenu")}
            aria-expanded={mobileOpen}
            aria-controls="marketing-mobile-menu"
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>
      {mobileOpen ? (
        <div id="marketing-mobile-menu" className="border-t border-white/10 px-4 pb-4 md:hidden">
          <div className="mx-auto w-full max-w-6xl rounded-b-2xl border-x border-b border-white/10 bg-[#080d1b]/95 p-4 shadow-2xl shadow-black/35">
            <nav className="grid gap-1 text-sm text-white/80">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="rounded-lg px-3 py-2.5 transition-colors hover:bg-white/8 hover:text-white"
                  onClick={() => setMobileOpen(false)}
                >
                  {t(item.labelKey)}
                </a>
              ))}
            </nav>

            <div className="mt-4 grid gap-3 border-t border-white/10 pt-4">
              <LanguageSwitcher
                className="w-full"
                buttonClassName="h-10 w-full"
                menuClassName="left-0 right-auto w-full"
                showLabelOnMobile
              />
              <ConnectWalletButton className="w-full" connectLabel={t("auth.card.connectWallet")} />
              {authed ? (
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/dashboard"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(buttonVariants({ variant: "outline" }), "h-10 w-full")}
                    onClick={() => setMobileOpen(false)}
                  >
                    {t("common.dashboard")}
                  </Link>
                  <Button variant="ghost" className="h-10 w-full text-white/80" onClick={onLogout}>
                    {t("common.logout")}
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/login"
                    className={cn(buttonVariants({ variant: "ghost" }), "h-10 w-full text-white/80 hover:bg-white/10 hover:text-white")}
                    onClick={() => setMobileOpen(false)}
                  >
                    {t("common.login")}
                  </Link>
                  <Link
                    href="/login"
                    className={cn(buttonVariants({ variant: "default" }), "h-10 w-full bg-gradient-to-r from-blue-500 to-violet-500 text-white hover:opacity-90")}
                    onClick={() => setMobileOpen(false)}
                  >
                    {t("common.startFreeTrial")}
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
