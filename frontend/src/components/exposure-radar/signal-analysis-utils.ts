import type { ExposureRadarGrowthStrategyApi, ExposureRadarItemApi, ExposureRadarManualRecordApi } from "@/services/exposure-radar.service";
import { exposureLearningTopicKey } from "@/components/exposure-radar/daily-action-plan-utils";
import { hasPromotionalSmell, hasRiskyGrowthClaim } from "@/components/exposure-radar/opportunity-reply-utils";
import { publicEngagementCount } from "@/components/exposure-radar/people-radar-utils";
import { uniqueList } from "@/components/exposure-radar/radar-signal-utils";
import { formatCompact, formatVelocityLabel, normalizeDataConfidence, normalizeOpportunityTier, normalizeQualityStage, normalizeVelocityState, type TranslationFn } from "@/components/exposure-radar/radar-utils";
import type { AccountFitLabel, AccountFitSummary, ExposureLearningProfile, MemoryReplyCue, ReplyAngleSuggestion, ReplyQualityScore, SignalCredibility, SignalCredibilityStatus, SignalDecisionSummary } from "@/components/exposure-radar/types";

export function buildReplyQualityScore(item: ExposureRadarItemApi, replyAngle: ReplyAngleSuggestion | undefined, generated: string): ReplyQualityScore {
  const checks = [
    { key: "context", pass: item.data_quality === "tweet_level" },
    { key: "angle", pass: Boolean(replyAngle) },
    { key: "specificity", pass: !generated || generated.trim().length >= 24 },
    { key: "length", pass: !generated || generated.length <= 240 },
    { key: "noPitch", pass: !generated || !hasPromotionalSmell(generated) },
    { key: "claims", pass: !generated || !hasRiskyGrowthClaim(generated) },
  ];
  const score = Math.round((checks.filter((check) => check.pass).length / checks.length) * 100);
  const status = checks[0].pass ? (score >= 75 ? "ready" : "needs_edit") : "research";
  return { score, status, checks };
}

export function buildAccountFitSummary(item: ExposureRadarItemApi, strategy: ExposureRadarGrowthStrategyApi | null, t: TranslationFn): AccountFitSummary {
  const rawScore = typeof item.account_fit_score === "number" && Number.isFinite(item.account_fit_score) ? item.account_fit_score : undefined;
  const explicitLabel = normalizeAccountFitLabel(item.account_fit_label);
  const strategyKeywords = accountFitKeywordMatches(item, strategy?.core_topics || []);
  const avoidMatches = accountFitKeywordMatches(item, strategy?.avoid_topics || []);
  const guardrails = uniqueList([
    ...(item.guardrails || []),
    ...avoidMatches.map((topic) => t("exposureRadar.accountFit.guardrail.avoidTopic", { topic })),
    item.risk_level === "high" ? t("exposureRadar.accountFit.guardrail.highRisk") : "",
    item.risk_level === "medium" ? t("exposureRadar.accountFit.guardrail.mediumRisk") : "",
    item.data_quality !== "tweet_level" ? t("exposureRadar.accountFit.guardrail.topicLevel") : "",
  ]).slice(0, 4);
  const keywords = uniqueList([...(item.account_fit_keywords || []), ...strategyKeywords]).slice(0, 5);
  const inferredScore = inferAccountFitScore(item, keywords.length, avoidMatches.length);
  const score = Math.max(0, Math.min(100, Math.round(rawScore ?? inferredScore)));
  const label = explicitLabel || inferAccountFitLabel(score, item, avoidMatches.length);
  return {
    label,
    score,
    title: t(`exposureRadar.accountFit.label.${label}`),
    detail: item.account_fit_reason || t(`exposureRadar.accountFit.detail.${label}`),
    keywords,
    guardrails,
  };
}

export function buildSignalDecisionSummary(item: ExposureRadarItemApi, t: TranslationFn): SignalDecisionSummary {
  const qualityStage = normalizeQualityStage(item.quality_stage, item);
  const tier = normalizeOpportunityTier(item.opportunity_tier);
  const velocityState = normalizeVelocityState(item.velocity_state, item.status);
  const riskHigh = item.risk_level === "high";
  const riskMedium = item.risk_level === "medium";
  const topicLevel = item.data_quality === "topic_level";
  const proof = uniqueList([
    t("exposureRadar.decision.proof.score", { score: item.score || 0 }),
    typeof item.impression_count === "number" && item.impression_count > 0 ? t("exposureRadar.decision.proof.views", { views: formatCompact(item.impression_count) }) : "",
    typeof item.views_per_min === "number" && item.views_per_min > 0 ? t("exposureRadar.decision.proof.speed", { speed: formatVelocityLabel(item.views_per_min, "0/min") }) : "",
    typeof item.followers_count === "number" && item.followers_count > 0 ? t("exposureRadar.decision.proof.followers", { followers: formatCompact(item.followers_count) }) : "",
    item.ranking_delta ? t("exposureRadar.decision.proof.learning", { delta: item.ranking_delta }) : "",
  ]).slice(0, 3);
  if (topicLevel) {
    return {
      mode: "research",
      title: t("exposureRadar.decision.research.title"),
      detail: t("exposureRadar.decision.research.detail"),
      proof: proof.length ? proof : [t("exposureRadar.decision.proof.topicLevel")],
    };
  }
  if (riskHigh || qualityStage === "expired" || velocityState === "cooling") {
    return {
      mode: "skip",
      title: t(riskHigh ? "exposureRadar.decision.skipRisk.title" : "exposureRadar.decision.skipExpired.title"),
      detail: t(riskHigh ? "exposureRadar.decision.skipRisk.detail" : "exposureRadar.decision.skipExpired.detail"),
      proof: proof.length ? proof : [t("exposureRadar.decision.proof.risk")],
    };
  }
  if (qualityStage === "act_now" || tier === "hot_opportunity" || velocityState === "burst") {
    return {
      mode: "act_now",
      title: t("exposureRadar.decision.actNow.title"),
      detail: t("exposureRadar.decision.actNow.detail"),
      proof: proof.length ? proof : [t("exposureRadar.decision.proof.actNow")],
    };
  }
  return {
    mode: "watch",
    title: t(riskMedium ? "exposureRadar.decision.watchRisk.title" : "exposureRadar.decision.watch.title"),
    detail: t(riskMedium ? "exposureRadar.decision.watchRisk.detail" : "exposureRadar.decision.watch.detail"),
    proof: proof.length ? proof : [t("exposureRadar.decision.proof.watch")],
  };
}

export function buildSignalCredibility(item: ExposureRadarItemApi, t: TranslationFn): SignalCredibility {
  const hasViews = typeof item.impression_count === "number" && item.impression_count > 0;
  const hasVelocity = typeof item.views_per_min === "number" && item.views_per_min > 0;
  const hasAuthor = typeof item.followers_count === "number" && item.followers_count > 0;
  const hasEngagement = publicEngagementCount(item) > 0;
  const hasSecondSample = (item.velocity_history || []).filter((value) => Number.isFinite(value)).length >= 2;
  const realImpressions = normalizeDataConfidence(item.data_confidence, item.data_quality) === "real_impressions";
  let score = 0;
  if (item.data_quality === "tweet_level") score += 24;
  if (realImpressions || hasViews) score += 22;
  if (hasVelocity) score += 18;
  if (hasSecondSample) score += 12;
  if (hasAuthor) score += 10;
  if (hasEngagement) score += 8;
  if (item.quality_reason || item.ranking_reason) score += 6;
  if (item.data_quality === "topic_level") score = Math.min(score, 38);
  score = Math.max(0, Math.min(100, score));
  const status: SignalCredibilityStatus = score >= 78 ? "strong" : score >= 58 ? "usable" : score >= 38 ? "thin" : "weak";
  const proof = [
    item.data_quality === "tweet_level" ? t("exposureRadar.credibility.proof.tweet") : "",
    hasViews ? t("exposureRadar.credibility.proof.views", { views: formatCompact(item.impression_count || 0) }) : "",
    hasVelocity ? t("exposureRadar.credibility.proof.velocity", { speed: formatVelocityLabel(item.views_per_min, "0/min") }) : "",
    hasSecondSample ? t("exposureRadar.credibility.proof.resampled") : "",
    hasAuthor ? t("exposureRadar.credibility.proof.author", { followers: formatCompact(item.followers_count || 0) }) : "",
    hasEngagement ? t("exposureRadar.credibility.proof.engagement", { count: formatCompact(publicEngagementCount(item)) }) : "",
  ].filter(Boolean).slice(0, 4);
  const missing = [
    item.data_quality !== "tweet_level" ? t("exposureRadar.credibility.missing.tweet") : "",
    !hasViews ? t("exposureRadar.credibility.missing.views") : "",
    !hasVelocity ? t("exposureRadar.credibility.missing.velocity") : "",
    !hasSecondSample ? t("exposureRadar.credibility.missing.resample") : "",
    !hasAuthor ? t("exposureRadar.credibility.missing.author") : "",
  ].filter(Boolean).slice(0, 4);
  return {
    status,
    score,
    proof,
    missing,
    nextStep: t(`exposureRadar.credibility.next.${status}`),
  };
}

export function buildMemoryReplyCues(
  item: ExposureRadarItemApi,
  strategy: ExposureRadarGrowthStrategyApi | null,
  learningProfile: ExposureLearningProfile,
  recentRecords: ExposureRadarManualRecordApi[],
  selectedReplyAngle: ReplyAngleSuggestion | undefined,
  t: TranslationFn,
): MemoryReplyCue[] {
  const topicKey = exposureLearningTopicKey(item.topic_name || item.title);
  const coreTopics = (strategy?.core_topics || []).slice(0, 3);
  const avoidTopics = (strategy?.avoid_topics || []).slice(0, 3);
  const learnedAngle = selectedReplyAngle && learningProfile.preferredAngles.has(selectedReplyAngle.id);
  const similarRecord = recentRecords.find((record) => exposureLearningTopicKey(record.topic_name || record.title) === topicKey && (record.result_score || 0) >= 40);
  return [
    {
      key: "persona",
      title: t("exposureRadar.memoryReply.cue.persona.title"),
      detail: strategy?.target_audience
        ? t("exposureRadar.memoryReply.cue.persona.detail", { audience: strategy.target_audience })
        : t("exposureRadar.memoryReply.cue.persona.empty"),
      tone: strategy?.target_audience ? "blue" : "amber",
    },
    {
      key: "topics",
      title: t("exposureRadar.memoryReply.cue.topics.title"),
      detail: coreTopics.length
        ? t("exposureRadar.memoryReply.cue.topics.detail", { topics: coreTopics.join(", ") })
        : t("exposureRadar.memoryReply.cue.topics.empty"),
      tone: coreTopics.length ? "green" : "neutral",
    },
    {
      key: "angle",
      title: t("exposureRadar.memoryReply.cue.angle.title"),
      detail: selectedReplyAngle
        ? t(learnedAngle ? "exposureRadar.memoryReply.cue.angle.learned" : "exposureRadar.memoryReply.cue.angle.detail", { angle: selectedReplyAngle.title })
        : t("exposureRadar.memoryReply.cue.angle.empty"),
      tone: learnedAngle ? "green" : "blue",
    },
    {
      key: "boundary",
      title: t("exposureRadar.memoryReply.cue.boundary.title"),
      detail: avoidTopics.length
        ? t("exposureRadar.memoryReply.cue.boundary.detail", { topics: avoidTopics.join(", ") })
        : t("exposureRadar.memoryReply.cue.boundary.empty"),
      tone: avoidTopics.length || item.risk_level === "medium" || item.risk_level === "high" ? "amber" : "neutral",
    },
    {
      key: "history",
      title: t("exposureRadar.memoryReply.cue.history.title"),
      detail: similarRecord
        ? t("exposureRadar.memoryReply.cue.history.detail", { score: similarRecord.result_score || 0, views: formatCompact(similarRecord.result_impression_count || 0) })
        : t("exposureRadar.memoryReply.cue.history.empty"),
      tone: similarRecord ? "green" : "neutral",
    },
  ];
}

function normalizeAccountFitLabel(value?: string): AccountFitLabel | undefined {
  if (value === "strong" || value === "good" || value === "weak" || value === "avoid") return value;
  return undefined;
}

function inferAccountFitLabel(score: number, item: ExposureRadarItemApi, avoidMatches: number): AccountFitLabel {
  if (item.risk_level === "high" || avoidMatches > 0) return "avoid";
  if (score >= 78) return "strong";
  if (score >= 58) return "good";
  return "weak";
}

function inferAccountFitScore(item: ExposureRadarItemApi, keywordMatches: number, avoidMatches: number) {
  let score = 38;
  if (item.data_quality === "tweet_level") score += 14;
  if ((item.score || 0) >= 70) score += 12;
  if ((item.impression_count || 0) >= 1000) score += 8;
  if ((item.views_per_min || 0) >= 5) score += 8;
  score += Math.min(20, keywordMatches * 8);
  if (item.risk_level === "medium") score -= 12;
  if (item.risk_level === "high") score -= 28;
  score -= Math.min(24, avoidMatches * 12);
  return score;
}

function accountFitKeywordMatches(item: ExposureRadarItemApi, topics: string[]) {
  const haystack = `${item.title || ""} ${item.content || ""} ${item.topic_name || ""}`.toLowerCase();
  return uniqueList(topics.filter((topic) => topic && haystack.includes(topic.toLowerCase())));
}
