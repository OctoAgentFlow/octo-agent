"use client";

import { Clock3, RefreshCw, TrendingUp } from "lucide-react";

import { radarViewFilters } from "@/components/exposure-radar/constants";
import type { LeaderboardStats, RadarViewFilter } from "@/components/exposure-radar/types";
import { useT } from "@/i18n/use-t";

export function RadarViewTabs({
  value,
  counts,
  onChange,
}: {
  value: RadarViewFilter;
  counts: Record<RadarViewFilter, number>;
  onChange: (value: RadarViewFilter) => void;
}) {
  const { t } = useT();
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {radarViewFilters.map((filter) => (
        <button
          key={filter}
          type="button"
          onClick={() => onChange(filter)}
          className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition ${value === filter ? "border-[#1d9bf0] bg-[#1d9bf0]/15 text-[#8ecdf8]" : "border-[#2f3336] bg-black text-[#8b98a5] hover:border-[#1d9bf0]/45 hover:text-[#e7e9ea]"}`}
        >
          {t(`exposureRadar.list.filter.${filter}`)}
          <span className="rounded-full bg-[#16181c] px-1.5 py-0.5 text-[10px] text-[#71767b]">{counts[filter] || 0}</span>
        </button>
      ))}
    </div>
  );
}

export function LeaderboardStatusStrip({ stats, freshnessLabel }: { stats: LeaderboardStats; freshnessLabel: string }) {
  const { t } = useT();
  return (
    <div className="mb-4 rounded-2xl border border-[#2f3336] bg-black p-3">
      <div className="grid gap-2 md:grid-cols-[1.1fr_0.9fr] md:items-center">
        <div className="flex flex-wrap gap-2">
          <LeaderboardPill label={t("exposureRadar.leaderboard.status.new")} value={stats.newCount} tone="border-[#f59e0b]/25 bg-[#f59e0b]/10 text-[#f6d96b]" />
          <LeaderboardPill label={t("exposureRadar.leaderboard.status.burst")} value={stats.burst} tone="border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]" />
          <LeaderboardPill label={t("exposureRadar.leaderboard.status.rising")} value={stats.rising} tone="border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" />
          <LeaderboardPill label={t("exposureRadar.leaderboard.status.cooling")} value={stats.cooling} tone="border-[#64748b]/30 bg-[#64748b]/10 text-[#94a3b8]" />
        </div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2f3336] bg-[#0f1419] px-3 py-1 text-xs font-semibold text-[#8b98a5]">
            <RefreshCw className="size-3.5" />
            {t("exposureRadar.leaderboard.manualRefresh")}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2f3336] bg-[#0f1419] px-3 py-1 text-xs font-semibold text-[#8b98a5]">
            <Clock3 className="size-3.5" />
            {t("exposureRadar.leaderboard.freshness", { value: freshnessLabel })}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2f3336] bg-[#0f1419] px-3 py-1 text-xs font-semibold text-[#8b98a5]">
            <TrendingUp className="size-3.5" />
            {t("exposureRadar.leaderboard.movers", { count: stats.movers })}
          </span>
        </div>
      </div>
    </div>
  );
}

export function LeaderboardPill({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>
      <span>{label}</span>
      <span className="rounded-full bg-black/25 px-1.5 py-0.5 text-[10px]">{value}</span>
    </span>
  );
}

export function DiagnosticMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-normal text-[#71767b]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
      <p className="mt-1 truncate text-[11px] text-[#71767b]" title={detail}>{detail}</p>
    </div>
  );
}
