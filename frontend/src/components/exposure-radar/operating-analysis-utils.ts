import type { ExposureRadarData, ExposureRadarGrowthStrategyApi, ExposureRadarItemApi, ExposureRadarManualRecordApi, ExposureRadarSafetyCenterData } from "@/services/exposure-radar.service";
import { isRecentManualRecord } from "@/components/exposure-radar/growth-desk-utils";
import { topRecordLabels } from "@/components/exposure-radar/learning-report-utils";
import { type TranslationFn } from "@/components/exposure-radar/radar-utils";
import type { AccountHealthScore, DailyActionPlanItem, ExposureLearningProfile, GrowthExperiment, LoadState, WorkbenchStats } from "@/components/exposure-radar/types";

export function buildAccountHealthScore({
  selectedAccountID,
  selectedBotID,
  strategy,
  data,
  items,
  recentRecords,
  safety,
  stats,
  loadState,
  t,
}: {
  selectedAccountID: number;
  selectedBotID: number;
  strategy: ExposureRadarGrowthStrategyApi | null;
  data: ExposureRadarData | null;
  items: ExposureRadarItemApi[];
  recentRecords: ExposureRadarManualRecordApi[];
  safety: ExposureRadarSafetyCenterData | null;
  stats: WorkbenchStats;
  loadState: LoadState;
  t: TranslationFn;
}): AccountHealthScore {
  const strategyReady = Boolean(strategy?.target_audience || strategy?.core_topics?.length);
  const tweetLevelCount = items.filter((item) => item.data_quality === "tweet_level").length;
  const safetyWarnings = (safety?.watch_count || 0) + (safety?.block_count || 0);
  const recentHandled = recentRecords.filter((record) => isRecentManualRecord(record, 24) && (record.handled_at || record.task_status === "done")).length;
  const pendingBackfill = recentRecords.filter((record) => (record.handled_at || record.task_status === "done") && !record.result_checked_at && !record.result_score).length;
  const dailyLimit = Math.max(1, strategy?.daily_move_limit || 8);
  const checks = [
    { key: "setup", pass: selectedAccountID > 0 && selectedBotID > 0, value: selectedAccountID > 0 && selectedBotID > 0 ? t("exposureRadar.healthScore.value.ready") : t("exposureRadar.healthScore.value.missing") },
    { key: "strategy", pass: strategyReady, value: strategyReady ? strategy?.primary_goal || t("exposureRadar.healthScore.value.ready") : t("exposureRadar.healthScore.value.missing") },
    { key: "data", pass: loadState === "ready" && tweetLevelCount > 0, value: t("exposureRadar.healthScore.value.tweetLevel", { count: tweetLevelCount }) },
    { key: "pace", pass: recentHandled <= dailyLimit && stats.pending > 0, value: t("exposureRadar.healthScore.value.pace", { handled: recentHandled, limit: dailyLimit }) },
    { key: "safety", pass: safetyWarnings === 0, value: t("exposureRadar.healthScore.value.safety", { count: safetyWarnings }) },
    { key: "backfill", pass: pendingBackfill <= 3, value: t("exposureRadar.healthScore.value.backfill", { count: pendingBackfill }) },
  ];
  let score = 100;
  if (!checks[0].pass) score -= 20;
  if (!checks[1].pass) score -= 15;
  if (!checks[2].pass) score -= data?.diagnostics?.topic_level_count ? 10 : 18;
  if (!checks[3].pass) score -= 12;
  if (!checks[4].pass) score -= Math.min(25, 8 + safetyWarnings * 4);
  if (!checks[5].pass) score -= 10;
  score = Math.max(0, Math.min(100, score));
  return {
    score,
    status: score >= 82 ? "healthy" : score >= 60 ? "watch" : "risk",
    checks,
  };
}

export function buildGrowthExperiments({
  items,
  moves,
  recentRecords,
  learningProfile,
  safety,
  t,
}: {
  items: ExposureRadarItemApi[];
  moves: DailyActionPlanItem[];
  recentRecords: ExposureRadarManualRecordApi[];
  learningProfile: ExposureLearningProfile;
  safety: ExposureRadarSafetyCenterData | null;
  t: TranslationFn;
}): GrowthExperiment[] {
  const learnedTopic = Array.from(learningProfile.boostedTopics)[0] || topRecordLabels(recentRecords, "topic_name", 1)[0] || items[0]?.topic_name || t("exposureRadar.experimentPanel.fallback.topic");
  const preferredAngle = Array.from(learningProfile.preferredAngles)[0] || "operatorObservation";
  const readyMoves = moves.filter((entry) => entry.item.data_quality === "tweet_level").slice(0, 3);
  const safetyWarnings = (safety?.watch_count || 0) + (safety?.block_count || 0);
  return [
    {
      key: "angle",
      title: t("exposureRadar.experimentPanel.angle.title"),
      hypothesis: t("exposureRadar.experimentPanel.angle.hypothesis", { angle: preferredAngleLabel(preferredAngle, t) }),
      action: readyMoves.length
        ? t("exposureRadar.experimentPanel.angle.action", { count: readyMoves.length })
        : t("exposureRadar.experimentPanel.angle.actionEmpty"),
      metric: t("exposureRadar.experimentPanel.angle.metric"),
      tone: "blue",
    },
    {
      key: "topic",
      title: t("exposureRadar.experimentPanel.topic.title"),
      hypothesis: t("exposureRadar.experimentPanel.topic.hypothesis", { topic: learnedTopic }),
      action: t("exposureRadar.experimentPanel.topic.action"),
      metric: t("exposureRadar.experimentPanel.topic.metric"),
      tone: "green",
    },
    {
      key: "safety",
      title: t("exposureRadar.experimentPanel.safety.title"),
      hypothesis: safetyWarnings > 0
        ? t("exposureRadar.experimentPanel.safety.hypothesisWatch", { count: safetyWarnings })
        : t("exposureRadar.experimentPanel.safety.hypothesisClean"),
      action: t("exposureRadar.experimentPanel.safety.action"),
      metric: t("exposureRadar.experimentPanel.safety.metric"),
      tone: safetyWarnings > 0 ? "amber" : "green",
    },
  ];
}

export function preferredAngleLabel(angleID: string, t: TranslationFn) {
  if (["operatorObservation", "lightQuestion", "peerExperience", "cautionNote", "topicResearch"].includes(angleID)) {
    return t(`exposureRadar.replyAngles.${angleID}.title`);
  }
  return angleID;
}
