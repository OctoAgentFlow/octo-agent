import { formatDateTime } from "@/lib/timezone";
import type { ExposureRadarData, ExposureRadarManualRecordApi, ExposureRadarSafetyCenterData, ExposureRadarWeeklyReviewData } from "@/services/exposure-radar.service";
import { bestExposureResultRecord } from "@/components/exposure-radar/growth-desk-utils";
import { compactTitle } from "@/components/exposure-radar/radar-signal-utils";
import { formatCompact, type TranslationFn } from "@/components/exposure-radar/radar-utils";
import type { DailyActionPlanItem, ExposureLearningProfile, ResultLearningMove, ResultLearningSummary } from "@/components/exposure-radar/types";

export function buildWeeklyOperatorReport({
  weeklyReview,
  recentRecords,
  moves,
  learningProfile,
  safety,
  timeZone,
  t,
}: {
  weeklyReview: ExposureRadarWeeklyReviewData | null;
  recentRecords: ExposureRadarManualRecordApi[];
  moves: DailyActionPlanItem[];
  learningProfile: ExposureLearningProfile;
  safety: ExposureRadarSafetyCenterData | null;
  timeZone: string;
  t: TranslationFn;
}) {
  const handled = weeklyReview?.handled_count || recentRecords.filter((record) => record.handled_at || record.task_status === "done").length;
  const effective = weeklyReview?.effective_count || recentRecords.filter((record) => record.outcome === "effective").length;
  const negative = weeklyReview?.negative_count || recentRecords.filter((record) => record.outcome === "ineffective" || record.outcome === "not_suitable").length;
  const recommendations = weeklyReview?.recommendations?.length ? weeklyReview.recommendations : buildWeeklyFallbackRecommendations(learningProfile, safety, t);
  return [
    t("exposureRadar.weeklyOps.report.title"),
    t("exposureRadar.weeklyOps.report.summary", { handled, effective, negative, ready: moves.length }),
    t("exposureRadar.weeklyOps.report.generated", { time: formatDateTime(new Date().toISOString(), timeZone) }),
    "",
    t("exposureRadar.weeklyOps.report.recommendations"),
    ...recommendations.map((item) => `- ${item}`),
  ].join("\n");
}

export function buildWeeklyFallbackRecommendations(learningProfile: ExposureLearningProfile, safety: ExposureRadarSafetyCenterData | null, t: TranslationFn) {
  const recommendations = [
    t("exposureRadar.weeklyOps.fallback.backfill"),
    t("exposureRadar.weeklyOps.fallback.smallBatch"),
  ];
  const topic = Array.from(learningProfile.boostedTopics)[0];
  if (topic) recommendations.unshift(t("exposureRadar.weeklyOps.fallback.topic", { topic }));
  if ((safety?.watch_count || 0) + (safety?.block_count || 0) > 0) recommendations.unshift(t("exposureRadar.weeklyOps.fallback.safety"));
  return recommendations.slice(0, 4);
}

export function topRecordLabels(records: ExposureRadarManualRecordApi[], field: "topic_name" | "reply_angle_title" | "author_handle", limit: number) {
  const counts = new Map<string, number>();
  records.forEach((record) => {
    const label = record[field];
    if (!label) return;
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => `${label} · ${count}`);
}

export function buildResultLearningMoves({
  data,
  moves,
  recentRecords,
  weeklyReview,
  safety,
  learningProfile,
  t,
}: {
  data: ExposureRadarData | null;
  moves: DailyActionPlanItem[];
  recentRecords: ExposureRadarManualRecordApi[];
  weeklyReview: ExposureRadarWeeklyReviewData | null;
  safety: ExposureRadarSafetyCenterData | null;
  learningProfile: ExposureLearningProfile;
  t: TranslationFn;
}): ResultLearningMove[] {
  const pendingBackfill = recentRecords.filter((record) => (record.handled_at || record.task_status === "done" || record.published_url) && !record.result_checked_at && !record.result_score).length;
  const best = bestExposureResultRecord(recentRecords);
  const boostedTopic = Array.from(learningProfile.boostedTopics)[0];
  const cautiousTopic = Array.from(learningProfile.cautiousTopics)[0];
  const warnings = (safety?.watch_count || 0) + (safety?.block_count || 0);
  const nextMove = moves[0]?.item;
  const actions: ResultLearningMove[] = [];
  if (pendingBackfill > 0) {
    actions.push({
      key: "backfill",
      title: t("exposureRadar.learningLoop.action.backfill.title"),
      detail: t("exposureRadar.learningLoop.action.backfill.detail", { count: pendingBackfill }),
      tone: "warning",
    });
  }
  if (best) {
    actions.push({
      key: "best",
      title: t("exposureRadar.learningLoop.action.best.title"),
      detail: t("exposureRadar.learningLoop.action.best.detail", { title: compactTitle(best.title || best.topic_name || best.signal_id), score: best.result_score || 0, views: formatCompact(best.result_impression_count || 0) }),
      tone: "positive",
    });
  }
  if (boostedTopic) {
    actions.push({
      key: "boosted",
      title: t("exposureRadar.learningLoop.action.boosted.title"),
      detail: t("exposureRadar.learningLoop.action.boosted.detail", { topic: boostedTopic }),
      tone: "positive",
    });
  }
  if (cautiousTopic || warnings > 0) {
    actions.push({
      key: "caution",
      title: t("exposureRadar.learningLoop.action.caution.title"),
      detail: cautiousTopic ? t("exposureRadar.learningLoop.action.caution.topic", { topic: cautiousTopic }) : t("exposureRadar.learningLoop.action.caution.safety", { count: warnings }),
      tone: "warning",
    });
  }
  if (nextMove) {
    actions.push({
      key: "next",
      title: t("exposureRadar.learningLoop.action.next.title"),
      detail: t("exposureRadar.learningLoop.action.next.detail", { title: compactTitle(nextMove.title), score: nextMove.score }),
      tone: "neutral",
    });
  }
  if (data?.diagnostics?.top_missing_reason && actions.length < 3) {
    actions.push({
      key: "diagnostic",
      title: t("exposureRadar.learningLoop.action.diagnostic.title"),
      detail: t("exposureRadar.learningLoop.action.diagnostic.detail", { reason: data.diagnostics.top_missing_reason }),
      tone: "neutral",
    });
  }
  if (!actions.length) {
    actions.push({
      key: "default",
      title: t("exposureRadar.learningLoop.action.default.title"),
      detail: weeklyReview ? t("exposureRadar.learningLoop.action.default.review", { rate: Math.round((weeklyReview.effective_rate || 0) * 100) }) : t("exposureRadar.learningLoop.action.default.detail"),
      tone: "neutral",
    });
  }
  return actions.slice(0, 3);
}

export function buildResultLearningSummary({
  moves,
  recentRecords,
  weeklyReview,
  safety,
  learningProfile,
  pendingBackfill,
  t,
}: {
  moves: DailyActionPlanItem[];
  recentRecords: ExposureRadarManualRecordApi[];
  weeklyReview: ExposureRadarWeeklyReviewData | null;
  safety: ExposureRadarSafetyCenterData | null;
  learningProfile: ExposureLearningProfile;
  pendingBackfill: number;
  t: TranslationFn;
}): ResultLearningSummary {
  const best = bestExposureResultRecord(recentRecords);
  const boostedTopic = Array.from(learningProfile.boostedTopics)[0];
  const cautiousTopic = Array.from(learningProfile.cautiousTopics)[0];
  const warnings = (safety?.watch_count || 0) + (safety?.block_count || 0);
  const effectiveRate = weeklyReview ? Math.round((weeklyReview.effective_rate || 0) * 100) : 0;

  if (pendingBackfill > 0) {
    return {
      key: "summary-backfill",
      title: t("exposureRadar.learningLoop.summary.backfill.title"),
      detail: t("exposureRadar.learningLoop.summary.backfill.detail", { count: pendingBackfill }),
      tone: "warning",
    };
  }
  if (best || boostedTopic) {
    return {
      key: "summary-repeat",
      title: t("exposureRadar.learningLoop.summary.repeat.title"),
      detail: best
        ? t("exposureRadar.learningLoop.summary.repeat.best", { title: compactTitle(best.title || best.topic_name || best.signal_id), score: best.result_score || 0 })
        : t("exposureRadar.learningLoop.summary.repeat.topic", { topic: boostedTopic || "" }),
      tone: "positive",
    };
  }
  if (cautiousTopic || warnings > 0) {
    return {
      key: "summary-caution",
      title: t("exposureRadar.learningLoop.summary.caution.title"),
      detail: cautiousTopic
        ? t("exposureRadar.learningLoop.summary.caution.topic", { topic: cautiousTopic })
        : t("exposureRadar.learningLoop.summary.caution.safety", { count: warnings }),
      tone: "warning",
    };
  }
  return {
    key: "summary-default",
    title: t("exposureRadar.learningLoop.summary.default.title"),
    detail: weeklyReview
      ? t("exposureRadar.learningLoop.summary.default.rate", { rate: effectiveRate, count: moves.length })
      : t("exposureRadar.learningLoop.summary.default.detail", { count: moves.length }),
    tone: "neutral",
  };
}
