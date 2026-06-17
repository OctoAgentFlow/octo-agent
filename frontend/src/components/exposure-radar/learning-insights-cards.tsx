"use client";

import { LeaderboardPill } from "@/components/exposure-radar/list-support";
import { LearningBadge } from "@/components/exposure-radar/performance-panel";
import type { LearningImpactRow } from "@/components/exposure-radar/types";
import { useT } from "@/i18n/use-t";
import type { ExposureRadarItemApi, ExposureRadarLearningControlsApi, ExposureRadarPerformanceTopicApi } from "@/services/exposure-radar.service";

export function LearningFeedbackCard({
  effectiveCount,
  neutralCount,
  negativeCount,
}: {
  effectiveCount: number;
  neutralCount: number;
  negativeCount: number;
}) {
  const { t } = useT();
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
      <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.learningPanel.feedbackTitle")}</p>
      <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{negativeCount > 0 ? t("exposureRadar.learningPanel.feedbackMixed", { count: negativeCount }) : t("exposureRadar.learningPanel.feedbackHealthy")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <LeaderboardPill label={t("exposureRadar.learningPanel.outcome.effective")} value={effectiveCount} tone="border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" />
        <LeaderboardPill label={t("exposureRadar.learningPanel.outcome.neutral")} value={neutralCount} tone="border-[#2f3336] bg-[#16181c] text-[#8b98a5]" />
        <LeaderboardPill label={t("exposureRadar.learningPanel.outcome.negative")} value={negativeCount} tone="border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]" />
      </div>
    </div>
  );
}

export function BoostedSignalsCard({ items }: { items: ExposureRadarItemApi[] }) {
  const { t } = useT();
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
      <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.learningPanel.boostedTitle")}</p>
      <div className="mt-3 space-y-2">
        {items.length ? items.map((item) => (
          <div key={item.id} className="rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2">
            <p className="line-clamp-1 text-xs font-semibold text-[#e7e9ea]">{item.title}</p>
            <p className="mt-1 text-[11px] text-[#71767b]">{t("exposureRadar.learningPanel.boostedReason", { delta: item.ranking_delta || 0 })}</p>
          </div>
        )) : (
          <p className="rounded-xl border border-dashed border-[#2f3336] px-3 py-6 text-center text-xs text-[#71767b]">{t("exposureRadar.learningPanel.boostedEmpty")}</p>
        )}
      </div>
    </div>
  );
}

export function LearningControlsCard({
  controls,
  topTopics,
}: {
  controls?: ExposureRadarLearningControlsApi;
  topTopics: ExposureRadarPerformanceTopicApi[];
}) {
  const { t } = useT();
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
      <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.learningPanel.controlsTitle")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <LearningBadge label={t("exposureRadar.learning.ranking")} value={controls?.ranking_enabled ? t("exposureRadar.learning.on") : t("exposureRadar.learning.off")} active={Boolean(controls?.ranking_enabled)} />
        <LearningBadge label={t("exposureRadar.learning.collector")} value={controls?.collector_enabled ? t("exposureRadar.learning.on") : t("exposureRadar.learning.off")} active={Boolean(controls?.collector_enabled)} />
        <LearningBadge label={t("exposureRadar.learning.mode")} value={t(`exposureRadar.learningMode.${normalizeLearningMode(controls?.mode)}`)} />
        <LearningBadge label={t("exposureRadar.learning.window")} value={t("exposureRadar.learning.days", { days: controls?.window_days || 30 })} />
      </div>
      <div className="mt-3 rounded-xl border border-[#1d9bf0]/20 bg-[#08131f] px-3 py-2">
        <p className="text-xs leading-5 text-[#8ecdf8]">
          {controls?.ranking_enabled ? t("exposureRadar.learningPanel.rankingEnabled") : t("exposureRadar.learningPanel.rankingDisabled")}
        </p>
      </div>
      {topTopics.length ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.learningPanel.topicTitle")}</p>
          {topTopics.map((topic) => (
            <div key={`${topic.region}:${topic.topic_name}`} className="flex items-center justify-between gap-2 rounded-lg border border-[#2f3336] bg-[#0f1419] px-3 py-2 text-xs">
              <span className="truncate text-[#c9d1d9]">{topic.topic_name}</span>
              <span className="shrink-0 text-[#71767b]">{topic.success_count}/{topic.signal_count}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function LearningImpactCard({ rows }: { rows: LearningImpactRow[] }) {
  const { t } = useT();
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
      <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.learningPanel.impactTitle")}</p>
      <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("exposureRadar.learningPanel.impactDescription")}</p>
      <div className="mt-3 space-y-2">
        {rows.length ? rows.map((row) => (
          <div key={`${row.tone}:${row.label}`} className={`rounded-xl border px-3 py-2 ${learningImpactTone(row.tone)}`}>
            <p className="line-clamp-1 text-xs font-semibold">{row.label}</p>
            <p className="mt-1 text-[11px] leading-4 opacity-85">{row.detail}</p>
          </div>
        )) : (
          <p className="rounded-xl border border-dashed border-[#2f3336] px-3 py-6 text-center text-xs text-[#71767b]">{t("exposureRadar.learningPanel.impactEmpty")}</p>
        )}
      </div>
    </div>
  );
}

function learningImpactTone(tone: LearningImpactRow["tone"]) {
  if (tone === "positive") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  if (tone === "negative") return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
  return "border-[#2f3336] bg-[#0f1419] text-[#8b98a5]";
}

function normalizeLearningMode(value?: string) {
  if (value === "hybrid" || value === "workspace" || value === "scoped") return value;
  return "hybrid";
}
