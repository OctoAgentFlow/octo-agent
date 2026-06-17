import type { ExposureRadarItemApi } from "@/services/exposure-radar.service";
import { replyAngleGenerationGuides } from "@/components/exposure-radar/constants";
import { uniqueList } from "@/components/exposure-radar/radar-signal-utils";
import {
  formatCompact,
  formatVelocityLabel,
  normalizeOpportunityTier,
  normalizeQualityStage,
  normalizeVelocityState,
  type TranslationFn,
} from "@/components/exposure-radar/radar-utils";
import type {
  OpportunityExplanation,
  ReplyAngleGenerationGuide,
  ReplyAngleID,
  ReplyAngleSuggestion,
  ReplyPlan,
  SafetyReview,
  SafetyReviewCheck,
} from "@/components/exposure-radar/types";

export function buildReplyAngleIDs(item: ExposureRadarItemApi): ReplyAngleID[] {
  const qualityStage = normalizeQualityStage(item.quality_stage, item);
  const tier = normalizeOpportunityTier(item.opportunity_tier);
  const risky = item.risk_level === "medium" || item.risk_level === "high";
  const lowFans = typeof item.followers_count === "number" && item.followers_count > 0 && item.followers_count <= 10000;
  const candidates: Array<ReplyAngleID | undefined> = [
    item.data_quality === "topic_level" ? "topicResearch" : undefined,
    risky ? "cautionNote" : undefined,
    qualityStage === "act_now" || tier === "hot_opportunity" ? "operatorObservation" : undefined,
    lowFans ? "peerExperience" : undefined,
    !risky ? "lightQuestion" : undefined,
    "operatorObservation",
    "lightQuestion",
    "peerExperience",
  ];
  const seen = new Set<ReplyAngleID>();
  const suggestions: ReplyAngleID[] = [];
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    suggestions.push(candidate);
    if (suggestions.length >= 3) break;
  }
  return suggestions;
}

export function buildMemoryOpportunityExplanation(item: ExposureRadarItemApi): OpportunityExplanation {
  const qualityStage = normalizeQualityStage(item.quality_stage, item);
  const velocityState = normalizeVelocityState(item.velocity_state, item.status);
  const reasons = uniqueList([
    item.quality_reason || memoryQualityReason(qualityStage),
    item.data_quality === "topic_level" ? "This is a topic-level signal, so a specific post should be selected before replying." : "",
    velocityState === "burst" ? "Velocity is in burst mode, so the operator should inspect it quickly." : "",
    velocityState === "rising" ? "Momentum is still rising, so a timely reply may land before the thread gets crowded." : "",
    velocityState === "new" ? "The signal is new, so the reply surface may still be open." : "",
    typeof item.views_per_min === "number" && item.views_per_min > 0 ? `Current velocity is about ${formatVelocityLabel(item.views_per_min, "0/min")}.` : "",
    typeof item.impression_count === "number" && item.impression_count > 0 ? `The post has about ${formatCompact(item.impression_count)} views, so it is not a cold-start signal.` : "",
    typeof item.followers_count === "number" && item.followers_count > 0 && item.followers_count <= 10000 ? `The author has about ${formatCompact(item.followers_count)} followers, which may make the reply surface friendlier.` : "",
    (item.ranking_delta || 0) > 0 ? "Historical feedback gives similar signals a positive ranking boost." : "",
  ]).slice(0, 3);
  const angleGuides = buildReplyAngleIDs(item).map((id) => {
    const guide = replyAngleGenerationGuides[id];
    return `${guide.label}: ${guide.instruction}`;
  });
  const avoid = uniqueList([
    qualityStage === "expired" ? "Do not force a late reply after the discussion has cooled." : "",
    item.data_quality === "topic_level" ? "Do not make claims from the topic alone; inspect the actual post first." : "",
    item.risk_level === "medium" || item.risk_level === "high" ? "Avoid sensitive judgments, exaggerated promises, and unverified facts." : "",
    "Do not directly pitch the product or drop links.",
    "Avoid generic replies; the response must fit the original context.",
  ]).slice(0, 3);
  return {
    fit: memoryOpportunityFitText(item),
    reasons: reasons.length ? reasons : [memoryQualityReason("watch")],
    angles: angleGuides.length ? angleGuides : [replyAngleGenerationGuides.lightQuestion.instruction],
    avoid: avoid.length ? avoid : ["Avoid generic replies; the response must fit the original context."],
  };
}

export function formatMemoryOpportunityExplanation(explanation: OpportunityExplanation, selectedReplyGuide: ReplyAngleGenerationGuide | undefined, replyAngleIDs: ReplyAngleID[]) {
  const suggestedAngles = replyAngleIDs
    .map((id) => replyAngleGenerationGuides[id])
    .map((guide) => `${guide.label} (${guide.tone})`)
    .join(", ");
  return [
    "Operator explanation:",
    `Fit: ${explanation.fit}`,
    `Why handle: ${explanation.reasons.join(" | ")}`,
    `Reply angles: ${explanation.angles.join(" | ")}`,
    selectedReplyGuide ? `Selected reply angle: ${selectedReplyGuide.label} (${selectedReplyGuide.tone}) - ${selectedReplyGuide.instruction}` : "",
    suggestedAngles ? `Suggested angle tags: ${suggestedAngles}` : "",
    `Avoid: ${explanation.avoid.join(" | ")}`,
  ].filter(Boolean).join("\n");
}

export function buildOpportunityExplanation(item: ExposureRadarItemApi, t: TranslationFn): OpportunityExplanation {
  const qualityStage = normalizeQualityStage(item.quality_stage, item);
  const tier = normalizeOpportunityTier(item.opportunity_tier);
  const velocityState = normalizeVelocityState(item.velocity_state, item.status);
  const reasons = uniqueList([
    item.quality_reason || t(`exposureRadar.explanation.reason.${qualityStage}`),
    item.data_quality === "topic_level" ? t("exposureRadar.explanation.reason.topicLevel") : "",
    velocityState === "burst" || velocityState === "rising" || velocityState === "new" ? t(`exposureRadar.explanation.reason.velocity.${velocityState}`) : "",
    typeof item.views_per_min === "number" && item.views_per_min > 0 ? t("exposureRadar.explanation.reason.speed", { speed: formatVelocityLabel(item.views_per_min, "0/min") }) : "",
    typeof item.impression_count === "number" && item.impression_count > 0 ? t("exposureRadar.explanation.reason.views", { count: formatCompact(item.impression_count) }) : "",
    typeof item.followers_count === "number" && item.followers_count > 0 && item.followers_count <= 10000 ? t("exposureRadar.explanation.reason.lowFans", { count: formatCompact(item.followers_count) }) : "",
    (item.ranking_delta || 0) > 0 ? t("exposureRadar.explanation.reason.learned") : "",
  ]).slice(0, 3);
  const angles = uniqueList([
    item.generated_comment ? t("exposureRadar.explanation.angle.generated") : "",
    item.data_quality === "topic_level" ? t("exposureRadar.explanation.angle.topicResearch") : "",
    item.risk_level === "medium" || item.risk_level === "high" ? t("exposureRadar.explanation.angle.lowRiskQuestion") : "",
    tier === "hot_opportunity" || qualityStage === "act_now" ? t("exposureRadar.explanation.angle.operatorInsight") : "",
    typeof item.followers_count === "number" && item.followers_count > 0 && item.followers_count <= 10000 ? t("exposureRadar.explanation.angle.peerReply") : "",
    item.topic_name ? t("exposureRadar.explanation.angle.topic", { topic: item.topic_name }) : "",
    t("exposureRadar.explanation.angle.default"),
  ]).slice(0, 3);
  const avoid = uniqueList([
    qualityStage === "expired" ? t("exposureRadar.explanation.avoid.expired") : "",
    item.data_quality === "topic_level" ? t("exposureRadar.explanation.avoid.topicLevel") : "",
    item.risk_level === "medium" || item.risk_level === "high" ? t("exposureRadar.explanation.avoid.risk") : "",
    t("exposureRadar.explanation.avoid.promotion"),
    t("exposureRadar.explanation.avoid.generic"),
  ]).slice(0, 3);
  return {
    fit: opportunityFitText(item, t),
    reasons: reasons.length ? reasons : [t("exposureRadar.explanation.reason.watch")],
    angles: angles.length ? angles : [t("exposureRadar.explanation.angle.default")],
    avoid: avoid.length ? avoid : [t("exposureRadar.explanation.avoid.generic")],
  };
}

export function buildReplyAngleSuggestions(item: ExposureRadarItemApi, t: TranslationFn): ReplyAngleSuggestion[] {
  return buildReplyAngleIDs(item).map((id) => replyAngle(id, t));
}

export function selectedReplyAngleForItem(item: ExposureRadarItemApi, selectedReplyAngleIDs: Record<string, string>, t: TranslationFn) {
  const suggestions = buildReplyAngleSuggestions(item, t);
  return suggestions.find((angle) => angle.id === selectedReplyAngleIDs[item.id]) || suggestions[0];
}

export function buildSampleReplyDraft(item: ExposureRadarItemApi, replyAngle: ReplyAngleSuggestion | undefined, t: TranslationFn) {
  const angleTitle = replyAngle?.title || t("exposureRadar.replyAngles.operatorObservation.title");
  if (item.region === "zh") {
    return t("exposureRadar.sample.reply.zh", { angle: angleTitle });
  }
  return t("exposureRadar.sample.reply.en", { angle: angleTitle });
}

export function buildReplyPlan(item: ExposureRadarItemApi, replyAngle: ReplyAngleSuggestion, t: TranslationFn): ReplyPlan {
  const risky = item.risk_level === "medium" || item.risk_level === "high";
  const topic = item.topic_name || item.title || t("exposureRadar.replyPlan.topicFallback");
  const baseSafety = uniqueList([
    t("exposureRadar.replyPlan.safety.noPitch"),
    t("exposureRadar.replyPlan.safety.noClaims"),
    item.data_quality === "topic_level" ? t("exposureRadar.replyPlan.safety.topicResearch") : "",
    risky ? t("exposureRadar.replyPlan.safety.riskCheck") : "",
    normalizeQualityStage(item.quality_stage, item) === "expired" ? t("exposureRadar.replyPlan.safety.windowCheck") : "",
  ]).slice(0, 3);
  const angleSteps: Record<ReplyAngleID, string[]> = {
    operatorObservation: [
      t("exposureRadar.replyPlan.step.anchorSpecific"),
      t("exposureRadar.replyPlan.step.addObservation"),
      t("exposureRadar.replyPlan.step.keepShort"),
    ],
    lightQuestion: [
      t("exposureRadar.replyPlan.step.anchorSpecific"),
      t("exposureRadar.replyPlan.step.askQuestion"),
      t("exposureRadar.replyPlan.step.keepShort"),
    ],
    peerExperience: [
      t("exposureRadar.replyPlan.step.respondFirst"),
      t("exposureRadar.replyPlan.step.shareExperience"),
      t("exposureRadar.replyPlan.step.closeSoftly"),
    ],
    cautionNote: [
      t("exposureRadar.replyPlan.step.acknowledgeContext"),
      t("exposureRadar.replyPlan.step.addBoundary"),
      t("exposureRadar.replyPlan.step.noStrongJudgment"),
    ],
    topicResearch: [
      t("exposureRadar.replyPlan.step.findSpecificPost"),
      t("exposureRadar.replyPlan.step.anchorSpecific"),
      t("exposureRadar.replyPlan.step.keepShort"),
    ],
  };
  return {
    bestFor: t(`exposureRadar.replyPlan.bestFor.${replyAngle.id}`, { topic }),
    steps: angleSteps[replyAngle.id],
    safety: baseSafety.length ? baseSafety : [t("exposureRadar.replyPlan.safety.noPitch")],
    readyNote: item.generated_comment ? t("exposureRadar.replyPlan.ready.copy") : item.data_quality === "tweet_level" ? t("exposureRadar.replyPlan.ready.generate") : t("exposureRadar.replyPlan.ready.research"),
  };
}

export function buildSafetyReview(item: ExposureRadarItemApi, replyAngle: ReplyAngleSuggestion | undefined, t: TranslationFn): SafetyReview {
  const generated = item.generated_comment || "";
  const checks: SafetyReviewCheck[] = [
    {
      key: "context",
      status: item.data_quality === "tweet_level" ? "pass" : "block",
      title: t("exposureRadar.safetyReview.check.context.title"),
      detail: item.data_quality === "tweet_level" ? t("exposureRadar.safetyReview.check.context.pass") : t("exposureRadar.safetyReview.check.context.block"),
    },
    {
      key: "risk",
      status: item.risk_level === "high" ? "block" : item.risk_level === "medium" ? "watch" : "pass",
      title: t("exposureRadar.safetyReview.check.risk.title"),
      detail: item.risk_level === "high" ? t("exposureRadar.safetyReview.check.risk.high") : item.risk_level === "medium" ? t("exposureRadar.safetyReview.check.risk.medium") : t("exposureRadar.safetyReview.check.risk.pass"),
    },
    {
      key: "window",
      status: normalizeQualityStage(item.quality_stage, item) === "expired" ? "watch" : "pass",
      title: t("exposureRadar.safetyReview.check.window.title"),
      detail: normalizeQualityStage(item.quality_stage, item) === "expired" ? t("exposureRadar.safetyReview.check.window.watch") : t("exposureRadar.safetyReview.check.window.pass"),
    },
    {
      key: "angle",
      status: replyAngle?.id === "cautionNote" || replyAngle?.id === "topicResearch" ? "watch" : "pass",
      title: t("exposureRadar.safetyReview.check.angle.title"),
      detail: replyAngle ? t(`exposureRadar.safetyReview.check.angle.${replyAngle.id}`) : t("exposureRadar.safetyReview.check.angle.none"),
    },
    {
      key: "promotion",
      status: hasPromotionalSmell(generated) ? "watch" : "pass",
      title: t("exposureRadar.safetyReview.check.promotion.title"),
      detail: hasPromotionalSmell(generated) ? t("exposureRadar.safetyReview.check.promotion.watch") : t("exposureRadar.safetyReview.check.promotion.pass"),
    },
    {
      key: "claims",
      status: hasRiskyGrowthClaim(generated) ? "block" : "pass",
      title: t("exposureRadar.safetyReview.check.claims.title"),
      detail: hasRiskyGrowthClaim(generated) ? t("exposureRadar.safetyReview.check.claims.block") : t("exposureRadar.safetyReview.check.claims.pass"),
    },
  ];
  const status = checks.some((check) => check.status === "block") ? "block" : checks.some((check) => check.status === "watch") ? "watch" : "pass";
  return {
    status,
    summary: t(`exposureRadar.safetyReview.summary.${status}`),
    checks,
  };
}

export function hasPromotionalSmell(value: string) {
  if (!value) return false;
  return /octoagent|octo agent|oaf bot|try our|sign up|join us|https?:\/\//i.test(value);
}

export function hasRiskyGrowthClaim(value: string) {
  if (!value) return false;
  return /guarantee|guaranteed|5m|5M|fully automated|passive income|spam at scale/i.test(value);
}

export function buildDraftRecommendedUse(item: ExposureRadarItemApi, replyAngle?: ReplyAngleSuggestion) {
  if (!replyAngle) return item.recommended_use;
  const generationGuide = replyAngleGenerationGuides[replyAngle.id];
  return [
    item.recommended_use,
    `Selected reply angle: ${generationGuide.label}`,
    `Angle tone: ${generationGuide.tone}`,
    `Angle instruction: ${generationGuide.instruction}`,
    `Reply plan: ${replyPlanGenerationInstruction(replyAngle.id)}`,
  ].filter(Boolean).join("\n\n");
}

export function buildDraftReason(item: ExposureRadarItemApi, replyAngle?: ReplyAngleSuggestion) {
  if (!replyAngle) return item.reason;
  const generationGuide = replyAngleGenerationGuides[replyAngle.id];
  return [
    item.reason,
    `Operator selected reply angle: ${generationGuide.label} - ${generationGuide.instruction}`,
  ].filter(Boolean).join("\n\n");
}

function memoryQualityReason(qualityStage: string) {
  if (qualityStage === "act_now") return "Still inside the handling window, so a reply is less likely to miss the conversation rhythm.";
  if (qualityStage === "expired") return "May be past the best window, so confirm the post is still active before acting.";
  return "Worth watching until velocity or context becomes clearer.";
}

function memoryOpportunityFitText(item: ExposureRadarItemApi) {
  if (item.risk_level === "medium" || item.risk_level === "high") {
    return "This opportunity needs a brand-fit check first. Use a conservative, factual reply if you engage.";
  }
  if (item.data_quality === "topic_level") {
    return "This is a topic-level lead. Open live search first, then choose a specific post manually.";
  }
  if (typeof item.followers_count === "number" && item.followers_count > 0 && item.followers_count <= 10000) {
    return "The author is still relatively small, so the reply surface may be easier to enter with a useful point.";
  }
  if (normalizeQualityStage(item.quality_stage, item) === "act_now") {
    return "This opportunity is still inside the useful window, so it is worth checking and handling first.";
  }
  return "Treat this as a candidate signal. Confirm context and persona fit before replying.";
}

function opportunityFitText(item: ExposureRadarItemApi, t: TranslationFn) {
  if (item.risk_level === "medium" || item.risk_level === "high") {
    return t("exposureRadar.explanation.fit.risk");
  }
  if (item.data_quality === "topic_level") {
    return t("exposureRadar.explanation.fit.topic");
  }
  if (typeof item.followers_count === "number" && item.followers_count > 0 && item.followers_count <= 10000) {
    return t("exposureRadar.explanation.fit.lowFans");
  }
  if (normalizeQualityStage(item.quality_stage, item) === "act_now") {
    return t("exposureRadar.explanation.fit.actNow");
  }
  return t("exposureRadar.explanation.fit.default");
}

function replyAngle(id: ReplyAngleID, t: TranslationFn): ReplyAngleSuggestion {
  return {
    id,
    title: t(`exposureRadar.replyAngles.${id}.title`),
    description: t(`exposureRadar.replyAngles.${id}.description`),
    prompt: t(`exposureRadar.replyAngles.${id}.prompt`),
    tone: t(`exposureRadar.replyAngles.${id}.tone`),
  };
}

function replyPlanGenerationInstruction(angleID: ReplyAngleID) {
  switch (angleID) {
    case "lightQuestion":
      return "Anchor on one concrete post detail, ask one low-pressure question, and stop.";
    case "peerExperience":
      return "Respond to the author's point first, add one short peer experience, and avoid centering the product.";
    case "cautionNote":
      return "Acknowledge the context, add one conservative boundary or condition, and avoid strong judgments.";
    case "topicResearch":
      return "Treat this as research-only until a specific post is found; do not reply from topic context alone.";
    default:
      return "Anchor on one concrete post detail, add one practical operator observation, and avoid product promotion.";
  }
}
