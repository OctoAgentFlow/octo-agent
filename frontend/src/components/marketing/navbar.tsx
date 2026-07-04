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
import { publicAssetPath } from "@/lib/public-assets";
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
    <header
      ref={headerRef}
      className="sticky top-0 z-40 border-b border-white/10 bg-[#070b17]/82 shadow-[0_14px_42px_rgba(38,78,255,0.10)] backdrop-blur-2xl"
    >
      <div className="mx-auto flex h-[68px] w-full max-w-7xl items-center justify-between gap-5 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-3 text-sm font-semibold text-white"
          onClick={() => setMobileOpen(false)}
        >
          <span className="relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg border border-blue-300/20 bg-white/[0.055] shadow-[0_0_22px_rgba(80,132,255,0.18)]">
            <Image
              src={publicAssetPath("/brand/oaf-octopus-icon.png")}
              alt={t("common.brand")}
              fill
              sizes="36px"
              className="object-contain p-1"
              priority
            />
          </span>
          <span className="whitespace-nowrap text-[15px] font-semibold tracking-wide text-white">{t("common.brand")}</span>
        </Link>
        <nav className="hidden items-center gap-6 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.035] px-4 py-2 text-sm text-white/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] xl:flex">
          {navItems.map((item) => (
            <a key={item.href} href={item.href} className="whitespace-nowrap transition-colors hover:text-white">
              {t(item.labelKey)}
            </a>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <LanguageSwitcher className="hidden md:block" buttonClassName="h-9" />
          <ConnectWalletButton className="hidden md:inline-flex" connectLabel={t("auth.card.connectWallet")} />
          {authed ? (
            <>
              <Link
                href="/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "stable-cta-md hidden h-9 border-blue-300/25 bg-blue-500/10 text-white shadow-[0_0_18px_rgba(80,132,255,0.12)] hover:bg-blue-500/16 md:inline-flex"
                )}
              >
                {t("common.dashboard")}
              </Link>
              <Button variant="ghost" className="stable-cta-sm hidden h-9 text-white/76 hover:bg-white/10 hover:text-white md:inline-flex" onClick={onLogout}>
                {t("common.logout")}
              </Button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ variant: "ghost" }),
                  "stable-cta-sm hidden h-9 text-white/80 hover:bg-white/10 hover:text-white md:inline-flex"
                )}
              >
                {t("common.login")}
              </Link>
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ variant: "default" }),
                  "stable-cta-md hidden h-9 border border-blue-300/20 bg-gradient-to-r from-blue-500/85 to-violet-500/85 text-white shadow-[0_0_20px_rgba(91,125,255,0.20)] hover:opacity-95 md:inline-flex"
                )}
              >
                {t("common.startFreeTrial")}
              </Link>
            </>
          )}
          <Button
            type="button"
            variant="outline"
            className="size-10 px-0 text-white/85 xl:hidden"
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
        <div id="marketing-mobile-menu" className="border-t border-white/10 px-4 pb-4 xl:hidden">
          <div className="mx-auto w-full max-w-7xl rounded-b-2xl border-x border-b border-white/10 bg-[#080d1b]/95 p-4 shadow-2xl shadow-black/35">
            <nav className="grid gap-1 text-sm text-white/80">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="whitespace-nowrap rounded-lg px-3 py-2.5 transition-colors hover:bg-white/8 hover:text-white"
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
