"use client";

import { Activity, CalendarClock } from "lucide-react";

import { PerformanceMetric } from "@/components/exposure-radar/performance-panel";
import { CardHeader } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";
import { formatDateTime } from "@/lib/timezone";
import type { ExposureRadarArchiveDayApi } from "@/services/exposure-radar.service";

export type ArchiveTotals = {
  signals: number;
  drafts: number;
  positives: number;
  memories: number;
};

export function ArchivePanelHeader({ rangeDays, generatedAt, region, timeZone }: { rangeDays: number; generatedAt?: string; region?: string; timeZone: string }) {
  const { t } = useT();
  const regionLabel = region && region !== "all" ? t(`exposureRadar.region.${region === "zh" ? "zh" : "en"}`) : t("common.all");
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
      <CardHeader title={t("exposureRadar.archive.title")} description={t("exposureRadar.archive.description", { days: rangeDays })} className="mb-0" />
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#2f3336] px-3 py-1 text-xs font-semibold text-[#8b98a5]">
          <CalendarClock className="size-3.5" />
          {generatedAt ? formatDateTime(generatedAt, timeZone) : "-"}
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-[#2f3336] px-3 py-1 text-xs font-semibold text-[#8b98a5]">
          <Activity className="size-3.5" />
          {regionLabel}
        </span>
      </div>
    </div>
  );
}

export function ArchiveTotalsMetrics({ totals }: { totals: ArchiveTotals }) {
  const { t } = useT();
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-4">
      <PerformanceMetric label={t("exposureRadar.archive.totalSignals")} value={formatCompact(totals.signals)} detail={t("exposureRadar.archive.totalSignalsDetail")} />
      <PerformanceMetric label={t("exposureRadar.archive.totalDrafts")} value={formatCompact(totals.drafts)} detail={t("exposureRadar.archive.totalDraftsDetail")} />
      <PerformanceMetric label={t("exposureRadar.archive.totalPositive")} value={formatCompact(totals.positives)} detail={t("exposureRadar.archive.totalPositiveDetail")} />
      <PerformanceMetric label={t("exposureRadar.archive.totalMemory")} value={formatCompact(totals.memories)} detail={t("exposureRadar.archive.totalMemoryDetail")} />
    </div>
  );
}

export function ArchiveDayRow({ day, dateLabel }: { day: ExposureRadarArchiveDayApi; dateLabel: string }) {
  const { t } = useT();
  const total = day.signal_count + day.draft_count + day.saved_memory_count;
  const positiveRate = day.draft_count > 0 ? Math.round((day.positive_count / day.draft_count) * 100) : 0;
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#2f3336] px-2.5 py-1 text-xs font-semibold text-[#e7e9ea]">
              <CalendarClock className="size-3.5 text-[#8ecdf8]" />
              {dateLabel}
            </span>
            <span className="rounded-full border border-[#2f3336] px-2.5 py-1 text-xs font-semibold text-[#8b98a5]">
              {t(`exposureRadar.region.${day.region === "zh" ? "zh" : "en"}`)}
            </span>
            {total === 0 ? <span className="rounded-full border border-[#2f3336] px-2.5 py-1 text-xs font-semibold text-[#71767b]">{t("exposureRadar.archive.noActivity")}</span> : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#8b98a5]">
            <span>{t("exposureRadar.archive.signals", { count: day.signal_count })}</span>
            <span>{t("exposureRadar.archive.drafts", { count: day.draft_count })}</span>
            <span>{t("exposureRadar.archive.positive", { count: day.positive_count })}</span>
            <span>{t("exposureRadar.archive.memory", { count: day.saved_memory_count })}</span>
            {day.draft_count ? <span>{t("exposureRadar.archive.positiveRate", { rate: positiveRate })}</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 lg:justify-end">
          {day.top_topics.length ? day.top_topics.map((topic) => (
            <span key={`${day.date_key}:${topic.region}:${topic.topic_name}`} className="rounded-full border border-[#2f3336] bg-[#0f1419] px-2.5 py-1 text-xs font-semibold text-[#c9d1d9]">
              {topic.topic_name}
            </span>
          )) : (
            <span className="text-xs text-[#71767b]">{t("exposureRadar.archive.noTopics")}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function formatCompact(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(value >= 10000000 ? 0 : 1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
  return String(value);
}
