import type { ExposureRadarItemApi, ExposureRadarManualRecordApi } from "@/services/exposure-radar.service";
import { replyAngleGenerationGuides } from "@/components/exposure-radar/constants";
import { exposureLearningTopicKey } from "@/components/exposure-radar/daily-action-plan-utils";
import { compactTitle } from "@/components/exposure-radar/radar-signal-utils";
import type { TranslationFn } from "@/components/exposure-radar/radar-utils";
import type { ExposureLearningProfile, LearningImpactRow, ManualActionState, ReplyAngleID } from "@/components/exposure-radar/types";

export function buildExposureLearningProfile(records: ExposureRadarManualRecordApi[], states: Record<string, ManualActionState>): ExposureLearningProfile {
  const boostedTopics = new Set<string>();
  const cautiousTopics = new Set<string>();
  const preferredAngles = new Set<string>();
  const markTopic = (record: ExposureRadarManualRecordApi, positive: boolean) => {
    const key = exposureLearningTopicKey(record.topic_name || record.title);
    if (!key) return;
    if (positive) {
      boostedTopics.add(key);
      cautiousTopics.delete(key);
    } else if (!boostedTopics.has(key)) {
      cautiousTopics.add(key);
    }
  };
  records.forEach((record) => {
    const resultScore = record.result_score || 0;
    const positive = record.outcome === "effective" || resultScore >= 60 || (record.result_impression_count || 0) >= 500;
    const negative = record.outcome === "ineffective" || record.outcome === "not_suitable" || (resultScore > 0 && resultScore <= 20);
    if (positive) markTopic(record, true);
    if (negative) markTopic(record, false);
    if (positive && record.reply_angle_id) preferredAngles.add(record.reply_angle_id);
  });
  Object.values(states).forEach((state) => {
    if (state.outcome === "effective" && state.replyAngleID) preferredAngles.add(state.replyAngleID);
  });
  return { boostedTopics, cautiousTopics, preferredAngles };
}

export function buildLearningImpactRows(
  records: ExposureRadarManualRecordApi[],
  profile: ExposureLearningProfile,
  t: TranslationFn,
): LearningImpactRow[] {
  const topicLabels = new Map<string, string>();
  records.forEach((record) => {
    const label = record.topic_name || record.title;
    const key = exposureLearningTopicKey(label);
    if (key && label && !topicLabels.has(key)) topicLabels.set(key, label);
  });
  const boosted = Array.from(profile.boostedTopics).map((key) => ({
    label: compactTitle(topicLabels.get(key) || key),
    detail: t("exposureRadar.learningPanel.impact.boosted"),
    tone: "positive" as const,
  }));
  const cautious = Array.from(profile.cautiousTopics).map((key) => ({
    label: compactTitle(topicLabels.get(key) || key),
    detail: t("exposureRadar.learningPanel.impact.cautious"),
    tone: "negative" as const,
  }));
  const angles = Array.from(profile.preferredAngles).map((angleID) => {
    const guide = replyAngleGenerationGuides[angleID as ReplyAngleID];
    return {
      label: guide?.label || angleID,
      detail: t("exposureRadar.learningPanel.impact.angle"),
      tone: "neutral" as const,
    };
  });
  return [...boosted, ...cautious, ...angles];
}

export function buildLearningChangeRows(
  records: ExposureRadarManualRecordApi[],
  states: Record<string, ManualActionState>,
  profile: ExposureLearningProfile,
  t: TranslationFn,
): LearningImpactRow[] {
  const rows: LearningImpactRow[] = [];
  const boostedCount = profile.boostedTopics.size;
  const cautiousCount = profile.cautiousTopics.size;
  const preferredAngleCount = profile.preferredAngles.size;
  const resultRecordCount = records.filter(hasManualResultMetrics).length;
  const pendingBackfillCount = Math.max(
    records.filter((record) => Boolean(record.published_url || record.handled_at || record.task_status === "done") && !hasManualResultMetrics(record)).length,
    Object.values(states).filter((state) => Boolean(state.handled || state.taskStatus === "done") && !hasManualStateResultMetrics(state)).length,
  );
  if (boostedCount > 0) {
    rows.push({
      label: t("exposureRadar.learningPanel.change.boosted.label", { count: boostedCount }),
      detail: t("exposureRadar.learningPanel.change.boosted.detail"),
      tone: "positive",
    });
  }
  if (cautiousCount > 0) {
    rows.push({
      label: t("exposureRadar.learningPanel.change.cautious.label", { count: cautiousCount }),
      detail: t("exposureRadar.learningPanel.change.cautious.detail"),
      tone: "negative",
    });
  }
  if (preferredAngleCount > 0) {
    rows.push({
      label: t("exposureRadar.learningPanel.change.angle.label", { count: preferredAngleCount }),
      detail: t("exposureRadar.learningPanel.change.angle.detail"),
      tone: "neutral",
    });
  }
  if (resultRecordCount > 0) {
    rows.push({
      label: t("exposureRadar.learningPanel.change.metrics.label", { count: resultRecordCount }),
      detail: t("exposureRadar.learningPanel.change.metrics.detail"),
      tone: "positive",
    });
  }
  if (pendingBackfillCount > 0) {
    rows.push({
      label: t("exposureRadar.learningPanel.change.pending.label", { count: pendingBackfillCount }),
      detail: t("exposureRadar.learningPanel.change.pending.detail"),
      tone: "negative",
    });
  }
  return rows;
}

export function buildExposureLearningTopics(records: ExposureRadarManualRecordApi[], items: ExposureRadarItemApi[]) {
  const scores = new Map<string, { count: number; score: number }>();
  const add = (topic: string | undefined, score: number) => {
    const key = (topic || "").trim();
    if (!key) return;
    const existing = scores.get(key) || { count: 0, score: 0 };
    existing.count += 1;
    existing.score += score;
    scores.set(key, existing);
  };
  records.forEach((record) => add(record.topic_name || record.title, Math.max(record.result_score || 0, record.score || 0)));
  items.forEach((item) => add(item.topic_name || item.title, item.score || 0));
  return Array.from(scores.entries())
    .sort((a, b) => (b[1].score + b[1].count * 10) - (a[1].score + a[1].count * 10))
    .map(([topic, value]) => `${topic} · ${value.count}`);
}

function hasManualResultMetrics(record: ExposureRadarManualRecordApi) {
  return Boolean(
    record.result_checked_at
      || (record.result_score || 0) > 0
      || (record.result_impression_count || 0) > 0
      || (record.result_like_count || 0) > 0
      || (record.result_reply_count || 0) > 0
      || (record.result_retweet_count || 0) > 0
      || (record.result_quote_count || 0) > 0
      || (record.result_bookmark_count || 0) > 0,
  );
}

function hasManualStateResultMetrics(state: ManualActionState) {
  return Boolean(
    state.resultCheckedAt
      || (state.resultScore || 0) > 0
      || (state.resultImpressionCount || 0) > 0
      || (state.resultLikeCount || 0) > 0
      || (state.resultReplyCount || 0) > 0
      || (state.resultRetweetCount || 0) > 0
      || (state.resultQuoteCount || 0) > 0
      || (state.resultBookmarkCount || 0) > 0,
  );
}

export function buildExposureLearningAngles(records: ExposureRadarManualRecordApi[], states: Record<string, ManualActionState>) {
  const counts = new Map<string, number>();
  const add = (value?: string) => {
    const key = (value || "").trim();
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  };
  records.forEach((record) => add(record.reply_angle_title || record.reply_angle_id));
  Object.values(states).forEach((state) => add(state.replyAngleTitle || state.replyAngleID));
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([angle, count]) => `${angle} · ${count}`);
}
