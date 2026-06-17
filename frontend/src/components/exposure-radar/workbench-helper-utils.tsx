import { BarChart3, BookmarkPlus, Gauge, MessageCircle, Search, Target, Users } from "lucide-react";

import type { ExposureRadarData, ExposureRadarGrowthStrategyApi, ExposureRadarItemApi, ExposureRadarManualRecordApi } from "@/services/exposure-radar.service";
import { isDeferredManualTask } from "@/components/exposure-radar/daily-action-plan-utils";
import { isRecentManualRecord } from "@/components/exposure-radar/growth-desk-utils";
import { hasPromotionalSmell, hasRiskyGrowthClaim } from "@/components/exposure-radar/opportunity-reply-utils";
import { isManualActionHandled, isRadarItemSaved } from "@/components/exposure-radar/radar-signal-utils";
import { normalizeOpportunityTier, normalizeQualityStage, type TranslationFn } from "@/components/exposure-radar/radar-utils";
import type { ManualActionState, PublishGateKey, SafetyReviewStatus, WorkbenchStats } from "@/components/exposure-radar/types";

export function buildWorkbenchStats(items: ExposureRadarItemApi[], manualActionStates: Record<string, ManualActionState>): WorkbenchStats {
  return items.reduce((acc, item) => {
    const handled = isManualActionHandled(item, manualActionStates[item.id]);
    if (isDeferredManualTask(manualActionStates[item.id])) return acc;
    const qualityStage = normalizeQualityStage(item.quality_stage, item);
    const tier = normalizeOpportunityTier(item.opportunity_tier);
    if (handled) {
      acc.handled += 1;
      return acc;
    }
    if (qualityStage === "act_now") acc.actNow += 1;
    if (qualityStage === "act_now" || tier === "hot_opportunity" || tier === "rising_opportunity" || item.generated_comment || item.review_task_id) {
      acc.pending += 1;
    }
    return acc;
  }, { pending: 0, actNow: 0, handled: 0 });
}

export function buildDailyOperatingGoals(
  strategy: ExposureRadarGrowthStrategyApi | null,
  stats: WorkbenchStats,
  items: ExposureRadarItemApi[],
  manualActionStates: Record<string, ManualActionState>,
  savedMemoryIDs: Set<string>,
  recentRecords: ExposureRadarManualRecordApi[],
  t: TranslationFn,
) {
  const dailyLimit = Math.max(4, Math.min(20, strategy?.daily_move_limit || 8));
  const reviewTarget = Math.max(3, Math.min(6, Math.ceil(dailyLimit / 2)));
  const handleTarget = Math.max(1, Math.min(3, Math.ceil(dailyLimit / 4)));
  const saveTarget = 1;
  const backfillTarget = 1;
  const reviewedCount = items.filter((item) => {
    const state = manualActionStates[item.id];
    return Boolean(state?.opened || state?.copied || state?.saved || state?.handled || item.generated_comment || item.review_task_id);
  }).length;
  const handledCount = Math.max(stats.handled, items.filter((item) => isManualActionHandled(item, manualActionStates[item.id])).length);
  const savedCount = items.filter((item) => isRadarItemSaved(item, savedMemoryIDs) || manualActionStates[item.id]?.saved).length;
  const backfilledCount = items.filter((item) => manualActionStates[item.id]?.resultCheckedAt).length + recentRecords.filter((record) => record.result_checked_at || record.result_score).length;
  return [
    {
      key: "review",
      icon: <Search className="size-4" />,
      title: t("exposureRadar.dailyGoals.review.title"),
      description: t("exposureRadar.dailyGoals.review.description"),
      done: Math.min(reviewedCount, reviewTarget),
      target: reviewTarget,
    },
    {
      key: "handle",
      icon: <MessageCircle className="size-4" />,
      title: t("exposureRadar.dailyGoals.handle.title"),
      description: t("exposureRadar.dailyGoals.handle.description"),
      done: Math.min(handledCount, handleTarget),
      target: handleTarget,
    },
    {
      key: "save",
      icon: <BookmarkPlus className="size-4" />,
      title: t("exposureRadar.dailyGoals.save.title"),
      description: t("exposureRadar.dailyGoals.save.description"),
      done: Math.min(savedCount, saveTarget),
      target: saveTarget,
    },
    {
      key: "backfill",
      icon: <BarChart3 className="size-4" />,
      title: t("exposureRadar.dailyGoals.backfill.title"),
      description: t("exposureRadar.dailyGoals.backfill.description"),
      done: Math.min(backfilledCount, backfillTarget),
      target: backfillTarget,
    },
  ];
}

export function buildPublishGateItems(
  item: ExposureRadarItemApi,
  generatedComment: string,
  t: TranslationFn,
): Array<{ key: PublishGateKey; title: string; detail: string }> {
  return [
    {
      key: "context",
      title: t("exposureRadar.publishGate.context.title"),
      detail: item.author_handle ? t("exposureRadar.publishGate.context.detailWithAuthor", { author: `@${item.author_handle}` }) : t("exposureRadar.publishGate.context.detail"),
    },
    {
      key: "persona",
      title: t("exposureRadar.publishGate.persona.title"),
      detail: t("exposureRadar.publishGate.persona.detail"),
    },
    {
      key: "nonPromo",
      title: t("exposureRadar.publishGate.nonPromo.title"),
      detail: hasPromotionalSmell(generatedComment) ? t("exposureRadar.publishGate.nonPromo.warning") : t("exposureRadar.publishGate.nonPromo.detail"),
    },
    {
      key: "claim",
      title: t("exposureRadar.publishGate.claim.title"),
      detail: hasRiskyGrowthClaim(generatedComment) ? t("exposureRadar.publishGate.claim.warning") : t("exposureRadar.publishGate.claim.detail"),
    },
  ];
}

export function buildPreflightChecks({
  selectedAccountID,
  selectedBotID,
  strategy,
  data,
  items,
  stats,
  recentRecords,
  usingSampleMode,
  t,
}: {
  selectedAccountID: number;
  selectedBotID: number;
  strategy: ExposureRadarGrowthStrategyApi | null;
  data: ExposureRadarData | null;
  items: ExposureRadarItemApi[];
  stats: WorkbenchStats;
  recentRecords: ExposureRadarManualRecordApi[];
  usingSampleMode: boolean;
  t: TranslationFn;
}) {
  const strategyReady = Boolean(strategy?.target_audience || strategy?.core_topics?.length);
  const dailyLimit = Math.max(4, Math.min(20, strategy?.daily_move_limit || 8));
  const handledToday = recentRecords.filter((record) => isRecentManualRecord(record, 24) && (record.handled_at || record.task_status === "done")).length;
  const dataStatus = data?.diagnostics?.status || data?.source_status || "";
  const accountStatus: SafetyReviewStatus = selectedAccountID && selectedBotID ? "pass" : "block";
  const strategyStatus: SafetyReviewStatus = strategyReady ? "pass" : "watch";
  const signalStatus: SafetyReviewStatus = usingSampleMode || items.length > 0 ? "pass" : dataStatus === "blocked" ? "block" : "watch";
  const volumeStatus: SafetyReviewStatus = handledToday > dailyLimit ? "block" : stats.pending > dailyLimit * 2 ? "watch" : "pass";
  return [
    {
      key: "context",
      status: accountStatus,
      icon: <Users className="size-4" />,
      title: t("exposureRadar.preflight.context.title"),
      detail: t(`exposureRadar.preflight.context.${accountStatus}`),
    },
    {
      key: "strategy",
      status: strategyStatus,
      icon: <Target className="size-4" />,
      title: t("exposureRadar.preflight.strategy.title"),
      detail: t(`exposureRadar.preflight.strategy.${strategyStatus}`),
    },
    {
      key: "signals",
      status: signalStatus,
      icon: <Search className="size-4" />,
      title: t("exposureRadar.preflight.signals.title"),
      detail: usingSampleMode ? t("exposureRadar.preflight.signals.sample") : t(`exposureRadar.preflight.signals.${signalStatus}`, { count: items.length }),
    },
    {
      key: "volume",
      status: volumeStatus,
      icon: <Gauge className="size-4" />,
      title: t("exposureRadar.preflight.volume.title"),
      detail: t(`exposureRadar.preflight.volume.${volumeStatus}`, { handled: handledToday, limit: dailyLimit }),
    },
  ];
}
