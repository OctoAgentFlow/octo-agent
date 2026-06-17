import { BookmarkPlus, CheckCircle2, MessageSquarePlus, Search, ShieldAlert } from "lucide-react";

import type { ExposureRadarItemApi } from "@/services/exposure-radar.service";
import type { DailyActionPlanItem, DailyActionReason, DailyActionType, ExposureLearningProfile, ManualActionState, RadarViewFilter } from "@/components/exposure-radar/types";
import { buildReplyAngleIDs } from "@/components/exposure-radar/opportunity-reply-utils";
import { hasManualBackfill, isManualActionHandled, isRadarItemSaved } from "@/components/exposure-radar/radar-signal-utils";
import { normalizeOpportunityTier, normalizeQualityStage, normalizeVelocityState } from "@/components/exposure-radar/radar-utils";

export function buildDailyActionPlan(items: ExposureRadarItemApi[], manualActionStates: Record<string, ManualActionState>, savedMemoryIDs: Set<string>, learningProfile: ExposureLearningProfile, limit = 6): DailyActionPlanItem[] {
  return items
    .filter((item) => !isManualActionHandled(item, manualActionStates[item.id]) && !isDeferredManualTask(manualActionStates[item.id]))
    .map((item) => ({
      item,
      action: dailyActionType(item, manualActionStates[item.id], savedMemoryIDs),
      reason: dailyActionReason(item, manualActionStates[item.id], learningProfile),
      priority: dailyActionPriority(item, manualActionStates[item.id], savedMemoryIDs, learningProfile),
    }))
    .filter((entry) => entry.priority > 0)
    .sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      if (a.item.score !== b.item.score) return b.item.score - a.item.score;
      return a.item.id.localeCompare(b.item.id);
    })
    .slice(0, limit);
}

export function dailyActionPriority(item: ExposureRadarItemApi, state: ManualActionState | undefined, savedMemoryIDs: Set<string>, learningProfile: ExposureLearningProfile) {
  const velocityState = normalizeVelocityState(item.velocity_state, item.status);
  const tier = normalizeOpportunityTier(item.opportunity_tier);
  const qualityStage = normalizeQualityStage(item.quality_stage, item);
  const topicKey = exposureLearningTopicKey(item.topic_name || item.title);
  let priority = item.score || 0;
  if (qualityStage === "act_now") priority += 18;
  if (qualityStage === "watch") priority += 3;
  if (qualityStage === "expired") priority -= 35;
  if (item.generated_comment || item.review_task_id) priority += 22;
  if (item.data_quality === "tweet_level") priority += 10;
  if (tier === "hot_opportunity") priority += 10;
  if (tier === "rising_opportunity") priority += 6;
  if (tier === "needs_sampling") priority -= 8;
  if (tier === "topic_lead") priority -= 6;
  if (velocityState === "burst") priority += 8;
  if (velocityState === "rising" || velocityState === "new") priority += 5;
  if ((item.views_per_min || 0) > 0) priority += Math.min(12, Math.round((item.views_per_min || 0) / 10));
  if ((item.followers_count || 0) > 0 && (item.followers_count || 0) <= 10000) priority += 5;
  if ((item.ranking_delta || 0) > 0) priority += Math.min(8, item.ranking_delta || 0);
  if (item.risk_level === "medium") priority -= 6;
  if (item.risk_level === "high") priority -= 18;
  if (velocityState === "cooling" || item.cooling) priority -= 10;
  if (isRadarItemSaved(item, savedMemoryIDs)) priority -= 4;
  if (state?.opened || state?.copied || state?.saved) priority -= 8;
  if (topicKey && learningProfile.boostedTopics.has(topicKey)) priority += 14;
  if (topicKey && learningProfile.cautiousTopics.has(topicKey)) priority -= 16;
  if (buildReplyAngleIDs(item).some((angleID) => learningProfile.preferredAngles.has(angleID))) priority += 4;
  return priority;
}

export function dailyActionType(item: ExposureRadarItemApi, state: ManualActionState | undefined, savedMemoryIDs: Set<string>): DailyActionType {
  if (normalizeQualityStage(item.quality_stage, item) === "expired" && !item.generated_comment && !item.review_task_id) return "inspect";
  if (item.generated_comment || item.review_task_id) return "publish_reply";
  if (item.risk_level === "medium" || item.risk_level === "high") return "review_fit";
  if (item.data_quality === "tweet_level") return "generate_reply";
  if (!isRadarItemSaved(item, savedMemoryIDs) && !state?.saved) return "save_memory";
  return "inspect";
}

export function dailyActionReason(item: ExposureRadarItemApi, state: ManualActionState | undefined, learningProfile: ExposureLearningProfile): DailyActionReason {
  const velocityState = normalizeVelocityState(item.velocity_state, item.status);
  const qualityStage = normalizeQualityStage(item.quality_stage, item);
  const topicKey = exposureLearningTopicKey(item.topic_name || item.title);
  if (topicKey && learningProfile.boostedTopics.has(topicKey)) return "learned";
  if (item.generated_comment || item.review_task_id) return "generated";
  if (qualityStage === "expired") return "expired";
  if (item.risk_level === "medium" || item.risk_level === "high") return "risk";
  if (qualityStage === "act_now") return "quality";
  if ((item.ranking_delta || 0) > 0) return "learned";
  if (normalizeOpportunityTier(item.opportunity_tier) === "needs_sampling") return "score";
  if (velocityState === "burst" || velocityState === "rising" || velocityState === "new") return "velocity";
  if ((item.followers_count || 0) > 0 && (item.followers_count || 0) <= 10000) return "low_fans";
  if (item.data_quality !== "tweet_level") return "topic";
  if (state?.opened || state?.copied) return "score";
  return "score";
}

export function radarItemMatchesFilter(item: ExposureRadarItemApi, filter: RadarViewFilter, savedMemoryIDs: Set<string>, manualActionStates: Record<string, ManualActionState>) {
  const tier = normalizeOpportunityTier(item.opportunity_tier);
  const qualityStage = normalizeQualityStage(item.quality_stage, item);
  switch (filter) {
    case "priority":
      return qualityStage === "act_now" || ((tier === "hot_opportunity" || tier === "rising_opportunity") && qualityStage !== "expired");
    case "act_now":
      return qualityStage === "act_now";
    case "watch":
      return qualityStage === "watch";
    case "expired":
      return qualityStage === "expired";
    case "tweet":
      return item.data_quality === "tweet_level";
    case "hot":
      return tier === "hot_opportunity";
    case "rising":
      return tier === "rising_opportunity";
    case "sampling":
      return tier === "needs_sampling";
    case "topic":
      return tier === "topic_lead";
    case "high_score":
      return item.score >= 75;
    case "needs_review":
      return item.risk_level === "medium" || item.risk_level === "high";
    case "saved":
      return isRadarItemSaved(item, savedMemoryIDs);
    case "drafted":
      return Boolean(item.generated_comment || item.review_task_id);
    case "pending_handling":
      return Boolean(item.generated_comment || item.review_task_id) && !isManualActionHandled(item, manualActionStates[item.id]);
    case "handled":
      return isManualActionHandled(item, manualActionStates[item.id]);
    case "backfilled":
      return hasManualBackfill(item, manualActionStates[item.id]);
    default:
      return true;
  }
}

export function isDeferredManualTask(state?: ManualActionState) {
  return state?.taskStatus === "skipped" || state?.taskStatus === "later";
}

export function actionPlanTone(action: DailyActionType) {
  switch (action) {
    case "publish_reply":
      return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
    case "generate_reply":
      return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
    case "save_memory":
      return "border-[#7856ff]/25 bg-[#7856ff]/10 text-[#c4b5fd]";
    case "review_fit":
      return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
    default:
      return "border-[#2f3336] bg-[#16181c] text-[#8b98a5]";
  }
}

export function actionPlanIcon(action: DailyActionType) {
  switch (action) {
    case "publish_reply":
      return <CheckCircle2 className="size-3.5" />;
    case "generate_reply":
      return <MessageSquarePlus className="size-3.5" />;
    case "save_memory":
      return <BookmarkPlus className="size-3.5" />;
    case "review_fit":
      return <ShieldAlert className="size-3.5" />;
    default:
      return <Search className="size-3.5" />;
  }
}

export function exposureLearningTopicKey(value?: string) {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120);
}
