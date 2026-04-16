"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { useT } from "@/i18n/use-t";
import { navItems } from "@/mocks/landing.mock";

export function MarketingNavbar() {
  const { t } = useT();
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
          <Button
            variant="ghost"
            className="stable-cta-sm hidden text-white/80 hover:bg-white/10 hover:text-white sm:inline-flex"
            asChild
          >
            <Link href="/login">{t("common.login")}</Link>
          </Button>
          <Button className="stable-cta-md bg-gradient-to-r from-blue-500 to-violet-500 text-white hover:opacity-90">
            {t("common.startFreeTrial")}
          </Button>
        </div>
      </div>
    </header>
  );
}
