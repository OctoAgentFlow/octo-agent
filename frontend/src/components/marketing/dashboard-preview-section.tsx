"use client";

import { useMemo, useState } from "react";

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
      value: `${Math.round(Number(item.value) * 4.2)}`,
      delta: `+${Math.max(8, Number(item.delta.replace(/[+%]/g, "")) + 6)}%`,
    }));
  }, [activeRange]);

  return (
    <SectionShell
      badge={t("marketing.preview.badge")}
      title={t("marketing.preview.title")}
      description={t("marketing.preview.description")}
    >
      <div className="surface-card overflow-hidden rounded-2xl p-5 md:p-7">
        <div className="mb-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setActiveRange("today")}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${activeRange === "today" ? "bg-blue-500/30 text-blue-100" : "bg-white/5 text-white/60 hover:text-white"}`}
          >
            {t("marketing.preview.range.today")}
          </button>
          <button
            type="button"
            onClick={() => setActiveRange("week")}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${activeRange === "week" ? "bg-violet-500/30 text-violet-100" : "bg-white/5 text-white/60 hover:text-white"}`}
          >
            {t("marketing.preview.range.week")}
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {kpis.map((kpi) => (
            <div
              key={kpi.labelKey}
              className="rounded-xl border border-white/10 bg-white/5 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/10"
            >
              <p className="text-xs text-white/60">{t(kpi.labelKey)}</p>
              <p className="mt-2 text-2xl font-semibold text-white">{kpi.value}</p>
              <p className="mt-1 text-xs text-emerald-300">{kpi.delta}</p>
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-xl border border-white/10 bg-white/5">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <p className="text-sm font-medium text-white">{t("marketing.preview.timeline.title")}</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/20 px-2 py-1 text-xs text-violet-200">
              <span className="size-1.5 animate-pulse rounded-full bg-violet-200" />
              {t("marketing.preview.timeline.live")}
            </span>
          </div>
          <div className="divide-y divide-white/10">
            {dashboardPreviewData.tasks.map((item) => (
              <div
                key={item.time + item.taskKey}
                className="grid gap-2 px-4 py-3 text-sm transition-colors hover:bg-white/5 md:grid-cols-[80px_1fr_90px]"
              >
                <span className="text-white/60">{item.time}</span>
                <span className="text-white/80">{t(item.taskKey)}</span>
                <span className="text-right text-white/60">{t(item.statusKey)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SectionShell>
  );
}
