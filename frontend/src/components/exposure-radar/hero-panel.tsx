"use client";

import { Flame, Gauge, Search, ShieldAlert, Sparkles, Zap } from "lucide-react";

import { useT } from "@/i18n/use-t";
import { LightMetric } from "@/components/exposure-radar/panel-primitives";

export type ExposureRadarHeroMetrics = {
  highScore: number;
  avgVelocity: number;
  risky: number;
};

export function ExposureRadarHeroPanel({ itemCount, metrics }: { itemCount: number; metrics: ExposureRadarHeroMetrics }) {
  const { t } = useT();
  return (
    <section className="overflow-hidden rounded-2xl border border-[#2f3336] bg-[#0f1419]">
      <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="p-5 md:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#1d9bf0]/30 bg-[#1d9bf0]/10 px-3 py-1 text-xs font-semibold text-[#8ecdf8]">
              <Zap className="size-3.5" />
              {t("exposureRadar.hero.kicker")}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-3 py-1 text-xs font-semibold text-[#7ee0b5]">
              <Sparkles className="size-3.5" />
              {t("exposureRadar.hero.free")}
            </span>
          </div>
          <h1 className="mt-5 max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-[#e7e9ea] md:text-4xl">{t("exposureRadar.hero.title")}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#8b98a5] md:text-base">{t("exposureRadar.hero.subtitle")}</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            <LightMetric icon={<Search className="size-4" />} label={t("exposureRadar.metrics.items")} value={String(itemCount)} />
            <LightMetric icon={<Flame className="size-4" />} label={t("exposureRadar.metrics.highScore")} value={String(metrics.highScore)} />
            <LightMetric icon={<Gauge className="size-4" />} label={t("exposureRadar.metrics.velocity")} value={metrics.avgVelocity ? `${metrics.avgVelocity}/min` : "-"} />
            <LightMetric icon={<ShieldAlert className="size-4" />} label={t("exposureRadar.metrics.risky")} value={String(metrics.risky)} />
          </div>
        </div>
        <div className="border-t border-[#2f3336] bg-black/30 p-5 md:p-6 xl:border-l xl:border-t-0">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.playbook.title")}</p>
          <div className="mt-4 space-y-2">
            {["velocity", "lowFans", "review", "memory"].map((key, index) => (
              <div key={key} className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
                <div className="flex items-start gap-3">
                  <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-[#2f3336] bg-black text-[11px] font-semibold text-[#8ecdf8]">0{index + 1}</span>
                  <div>
                    <p className="text-sm font-semibold text-[#e7e9ea]">{t(`exposureRadar.playbook.${key}.title`)}</p>
                    <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t(`exposureRadar.playbook.${key}.description`)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
