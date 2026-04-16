"use client";

import { RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { useT } from "@/i18n/use-t";

export function AppHeader() {
  const { t } = useT();
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-white/10 bg-[#070b17]/80 px-4 backdrop-blur md:px-6">
      <div>
        <h1 className="text-sm font-semibold text-white md:text-base">{t("dashboard.header.title")}</h1>
        <p className="hidden text-xs text-white/55 md:block">{t("dashboard.header.subtitle")}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <LanguageSwitcher className="hidden sm:block" />
        <span className="stable-meta-chip hidden rounded-full border border-white/15 bg-white/6 px-2 py-1 text-xs text-white/60 sm:inline-flex">
          {t("dashboard.header.synced", { minutes: 2 })}
        </span>
        <Button variant="outline" className="stable-cta-sm h-8">
          <RefreshCcw className="size-3.5" />
          {t("dashboard.header.refresh")}
        </Button>
      </div>
    </header>
  );
}
