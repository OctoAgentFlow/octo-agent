"use client";

import { useMemo, useState } from "react";
import { Activity, Bot } from "lucide-react";

import { dashboardPreviewData } from "@/mocks/landing.mock";
import { useT } from "@/i18n/use-t";

import { SectionShell } from "./section-shell";

export function DashboardPreviewSection() {
  const [activeRange, setActiveRange] = useState<"today" | "week">("today");
  const { t } = useT();

  const kpis = useMemo(() => {
    if (activeRange === "today") {
      return dashboardPreviewData.kpis;
    }
    return dashboardPreviewData.kpis.map((item) => ({
      ...item,
      value: weeklyPreviewValue(item.value),
      delta: weeklyPreviewDelta(item.delta),
    }));
  }, [activeRange]);

  return (
    <SectionShell
      id="preview"
      badge={t("marketing.preview.badge")}
      title={t("marketing.preview.title")}
      description={t("marketing.preview.description")}
    >
      <div className="surface-card overflow-hidden rounded-2xl p-4 md:p-7">
        <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl border border-blue-300/20 bg-blue-500/12 text-blue-100 shadow-[0_0_24px_rgba(59,130,246,0.16)]">
              <Bot className="size-5" />
            </span>
            <div>
              <p className="text-base font-semibold text-white">{t("marketing.preview.console.title")}</p>
              <p className="mt-1 text-sm text-white/55">{t("marketing.preview.console.bot")}</p>
            </div>
          </div>
          <div className="flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] p-1">
            <button
              type="button"
              onClick={() => setActiveRange("today")}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${activeRange === "today" ? "bg-blue-500/30 text-blue-100" : "text-white/60 hover:text-white"}`}
            >
              {t("marketing.preview.range.today")}
            </button>
            <button
              type="button"
              onClick={() => setActiveRange("week")}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${activeRange === "week" ? "bg-violet-500/30 text-violet-100" : "text-white/60 hover:text-white"}`}
            >
              {t("marketing.preview.range.week")}
            </button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => (
            <div
              key={kpi.labelKey}
              className="flex min-h-[116px] flex-col rounded-xl border border-white/10 bg-white/5 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/10"
            >
              <p className="text-xs text-white/60">{t(kpi.labelKey)}</p>
              <div className="mt-auto flex items-end justify-between gap-3">
                <p className="text-2xl font-semibold text-white">{kpi.value}</p>
                <p className="pb-1 text-xs text-emerald-300">{kpi.delta}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-xl border border-white/10 bg-white/5">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-violet-200" />
              <p className="text-sm font-medium text-white">{t("marketing.preview.timeline.title")}</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/20 px-2 py-1 text-xs text-violet-200">
              <span className="size-1.5 animate-pulse rounded-full bg-violet-200" />
              {t("marketing.preview.timeline.live")}
            </span>
          </div>
          <div className="divide-y divide-white/10">
            {dashboardPreviewData.tasks.map((item) => (
              <div
                key={item.time + item.taskKey}
                className="grid gap-2 px-4 py-4 text-sm transition-colors hover:bg-white/5 md:grid-cols-[76px_1fr_92px] md:items-center"
              >
                <span className="text-white/60">{item.time}</span>
                <span className="leading-relaxed text-white/80">{t(item.taskKey)}</span>
                <span className="text-left text-white/60 md:text-right">{t(item.statusKey)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

function weeklyPreviewValue(value: string) {
  const normalized = value.trim();
  const numeric = Number(normalized.replace("%", ""));
  if (!Number.isFinite(numeric)) return value;
  if (normalized.endsWith("%")) return `${Math.min(99, Math.round(numeric + 2))}%`;
  return String(Math.round(numeric * 4.2));
}

function weeklyPreviewDelta(delta: string) {
  const numeric = Number(delta.replace(/[+%]/g, ""));
  if (!Number.isFinite(numeric)) return delta;
  return `+${Math.max(8, numeric + 6)}%`;
}
