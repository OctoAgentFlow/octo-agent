"use client";

import type { ReactNode } from "react";

import { formatCompact } from "@/components/exposure-radar/radar-utils";
import { useT } from "@/i18n/use-t";

export function MetricPill({ icon, label, value }: { icon: ReactNode; label: string; value?: number }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#2f3336] bg-black px-3 py-2">
      <p className="flex items-center gap-1 text-[11px] text-[#71767b]">{icon}{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[#e7e9ea]">{typeof value === "number" ? formatCompact(value) : "-"}</p>
    </div>
  );
}

export function VelocitySparkline({ values }: { values: number[] }) {
  const { t } = useT();
  const normalized = values.filter((value) => Number.isFinite(value) && value >= 0).slice(-12);
  if (normalized.length < 4) return null;
  const min = Math.min(...normalized);
  const max = Math.max(...normalized);
  if (max <= 0 || max - min < 1) return null;
  const width = 160;
  const height = 34;
  const points = normalized.map((value, index) => {
    const x = normalized.length === 1 ? 0 : (index / (normalized.length - 1)) * width;
    const y = height - ((value - min) / (max - min)) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <div className="mt-3 rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2">
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-[#71767b]">
        <span>{t("exposureRadar.card.velocityTrend")}</span>
        <span>{formatCompact(Math.round(max))}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-9 w-full overflow-visible" role="img" aria-label={t("exposureRadar.card.velocityTrend")}>
        <polyline points={points} fill="none" stroke="#1d9bf0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
