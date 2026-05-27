"use client";

import Link from "next/link";
import { ArrowRight, BadgeDollarSign } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";

export function QuotaUpgradeCallout() {
  const { t } = useT();
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#1d9bf0]/35 bg-[#061826] p-4 text-sm text-[#e7e9ea] sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <BadgeDollarSign className="size-4 shrink-0 text-[#1d9bf0]" />
          <p className="font-semibold">{t("automation.quotaUpgrade.title")}</p>
        </div>
        <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("automation.quotaUpgrade.description")}</p>
      </div>
      <Link href="/billing" className="inline-flex shrink-0">
        <Button type="button" size="sm">
          {t("automation.quotaUpgrade.cta")}
          <ArrowRight className="size-4" />
        </Button>
      </Link>
    </div>
  );
}
