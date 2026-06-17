"use client";

import { BarChart3, Bot } from "lucide-react";

import { Card, CardHeader } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";
import { formatDateTime } from "@/lib/timezone";
import type { ExposureRadarPerformanceData } from "@/services/exposure-radar.service";
import { formatCompact, formatPercent } from "@/components/exposure-radar/radar-utils";

export function PerformancePanel({ data, timeZone }: { data: ExposureRadarPerformanceData | null; timeZone: string }) {
  const { t } = useT();
  const topics = data?.top_topics || [];
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <CardHeader title={t("exposureRadar.performance.title")} description={t("exposureRadar.performance.description", { days: data?.range_days || 7 })} className="mb-0" />
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#2f3336] px-3 py-1 text-xs font-semibold text-[#8b98a5]">
            <Bot className="size-3.5" />
            {data?.bot_id || data?.x_account_id ? t("exposureRadar.performance.scopePersonalized") : t("exposureRadar.performance.scopeWorkspace")}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#2f3336] px-3 py-1 text-xs font-semibold text-[#8b98a5]">
            <BarChart3 className="size-3.5" />
            {data?.generated_at ? formatDateTime(data.generated_at, timeZone) : "-"}
          </span>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <PerformanceMetric label={t("exposureRadar.performance.signals")} value={formatCompact(data?.owned_signal_count || 0)} detail={t("exposureRadar.performance.signalsDetail")} />
        <PerformanceMetric label={t("exposureRadar.performance.drafts")} value={formatCompact(data?.draft_count || 0)} detail={t("exposureRadar.performance.draftsDetail", { count: data?.pending_review_count || 0 })} />
        <PerformanceMetric label={t("exposureRadar.performance.approval")} value={formatPercent(data?.approval_rate || 0)} detail={t("exposureRadar.performance.approvalDetail", { count: data?.approved_count || 0 })} />
        <PerformanceMetric label={t("exposureRadar.performance.completion")} value={formatPercent(data?.completion_rate || 0)} detail={t("exposureRadar.performance.completionDetail", { count: (data?.published_count || 0) + (data?.handled_count || 0) })} />
      </div>
      <LearningControlsStrip data={data} />
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.performance.regionTitle")}</p>
          <div className="mt-3 space-y-2">
            {(data?.regions || []).length ? data?.regions.map((row) => (
              <div key={row.region} className="flex items-center justify-between gap-3 rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="font-semibold text-[#e7e9ea]">{t(`exposureRadar.region.${row.region === "zh" ? "zh" : "en"}`)}</p>
                  <p className="mt-0.5 truncate text-[#71767b]">{row.latest_collected_at ? formatDateTime(row.latest_collected_at, timeZone) : t("exposureRadar.performance.noCollection")}</p>
                </div>
                <div className="shrink-0 text-right text-[#8b98a5]">
                  <p>{t("exposureRadar.performance.regionSignals", { count: row.owned_signal_count })}</p>
                  <p>{t("exposureRadar.performance.regionDrafts", { count: row.draft_count })}</p>
                </div>
              </div>
            )) : (
              <p className="rounded-xl border border-dashed border-[#2f3336] px-3 py-6 text-center text-xs text-[#71767b]">{t("exposureRadar.performance.empty")}</p>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.performance.topicTitle")}</p>
          <div className="mt-3 space-y-2">
            {topics.length ? topics.slice(0, 5).map((row) => (
              <div key={`${row.region}:${row.topic_name}`} className="rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <p className="min-w-0 truncate font-semibold text-[#e7e9ea]">{row.topic_name}</p>
                  <span className="shrink-0 rounded-full border border-[#2f3336] px-2 py-0.5 text-[#8b98a5]">{row.region}</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-[#71767b]">
                  <span>{t("exposureRadar.performance.topicSignals", { count: row.signal_count })}</span>
                  <span>{t("exposureRadar.performance.topicDrafts", { count: row.draft_count })}</span>
                  <span>{t("exposureRadar.performance.topicWins", { count: row.success_count })}</span>
                </div>
              </div>
            )) : (
              <p className="rounded-xl border border-dashed border-[#2f3336] px-3 py-6 text-center text-xs text-[#71767b]">{t("exposureRadar.performance.empty")}</p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function LearningControlsStrip({ data }: { data: ExposureRadarPerformanceData | null }) {
  const { t } = useT();
  const controls = data?.learning_controls;
  return (
    <div className="mt-4 grid gap-2 md:grid-cols-4">
      <LearningBadge label={t("exposureRadar.learning.ranking")} value={controls?.ranking_enabled ? t("exposureRadar.learning.on") : t("exposureRadar.learning.off")} active={Boolean(controls?.ranking_enabled)} />
      <LearningBadge label={t("exposureRadar.learning.collector")} value={controls?.collector_enabled ? t("exposureRadar.learning.on") : t("exposureRadar.learning.off")} active={Boolean(controls?.collector_enabled)} />
      <LearningBadge label={t("exposureRadar.learning.mode")} value={t(`exposureRadar.learningMode.${normalizeLearningMode(controls?.mode)}`)} />
      <LearningBadge label={t("exposureRadar.learning.window")} value={t("exposureRadar.learning.days", { days: controls?.window_days || 30 })} />
      <div className="md:col-span-4 rounded-xl border border-[#2f3336] bg-black px-3 py-2 text-xs leading-5 text-[#8b98a5]">
        {t("exposureRadar.learning.scope", { scope: t(`exposureRadar.learningScope.${normalizeLearningScope(controls?.ranking_scope)}`) })}
      </div>
    </div>
  );
}

export function LearningBadge({ label, value, active }: { label: string; value: string; active?: boolean }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-black px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-normal text-[#71767b]">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${active === undefined ? "text-[#e7e9ea]" : active ? "text-[#7ee0b5]" : "text-[#ff8a91]"}`}>{value}</p>
    </div>
  );
}

export function PerformanceMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
      <p className="text-xs font-semibold text-[#71767b]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-[#8b98a5]">{detail}</p>
    </div>
  );
}

function normalizeLearningMode(value?: string) {
  if (value === "hybrid" || value === "workspace" || value === "scoped") return value;
  return "hybrid";
}

function normalizeLearningScope(value?: string) {
  if (value === "selected_bot_account" || value === "workspace" || value === "disabled" || value === "no_memory") return value;
  return "no_memory";
}
