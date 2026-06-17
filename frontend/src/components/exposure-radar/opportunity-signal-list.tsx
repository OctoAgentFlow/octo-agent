"use client";

import type { ReactNode } from "react";
import { Activity } from "lucide-react";

import { Card, CardHeader } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";
import type { ExposureRadarRegion } from "@/services/exposure-radar.service";
import type { LoadState } from "@/components/exposure-radar/types";

type OpportunitySignalListProps = {
  region: ExposureRadarRegion;
  dataQuality?: string;
  loadState: LoadState;
  realItemCount: number;
  totalItemCount: number;
  displayedItemCount: number;
  usingSampleMode: boolean;
  viewTabs: ReactNode;
  leaderboard: ReactNode;
  emptyState: ReactNode;
  children: ReactNode;
};

export function OpportunitySignalList({
  region,
  dataQuality,
  loadState,
  realItemCount,
  totalItemCount,
  displayedItemCount,
  usingSampleMode,
  viewTabs,
  leaderboard,
  emptyState,
  children,
}: OpportunitySignalListProps) {
  const { t } = useT();
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <CardHeader title={t("exposureRadar.list.title")} description={t(region === "zh" ? "exposureRadar.list.descriptionZh" : "exposureRadar.list.descriptionEn")} />
        <span className="inline-flex items-center gap-2 rounded-full border border-[#2f3336] px-3 py-1 text-xs font-semibold text-[#8b98a5]">
          <Activity className="size-3.5" />
          {dataQuality || "-"}
        </span>
      </div>
      {viewTabs}
      {leaderboard}
      {loadState === "loading" ? (
        <div className="rounded-2xl border border-[#2f3336] bg-black px-4 py-10 text-center text-sm text-[#71767b]">{t("exposureRadar.loading")}</div>
      ) : null}
      {loadState === "error" ? (
        <div className="rounded-2xl border border-[#f4212e]/25 bg-[#f4212e]/10 px-4 py-10 text-center text-sm text-[#ff8a91]">{t("exposureRadar.toast.loadFailed")}</div>
      ) : null}
      {loadState === "ready" && realItemCount === 0 && !usingSampleMode ? emptyState : null}
      {loadState === "ready" && totalItemCount > 0 && displayedItemCount === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#2f3336] bg-black px-4 py-10 text-center text-sm text-[#71767b]">{t("exposureRadar.list.filteredEmpty")}</div>
      ) : null}
      {loadState === "ready" && displayedItemCount > 0 ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {children}
        </div>
      ) : null}
    </Card>
  );
}
