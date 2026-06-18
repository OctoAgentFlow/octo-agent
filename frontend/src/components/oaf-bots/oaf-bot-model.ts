"use client";

import type { ContentLibraryItemApi } from "@/services/content-library.service";
import type { ReviewQueueItemApi } from "@/services/review-queue.service";
import type { OAFBot, OAFBotGenerationUsage, OAFBotPayload } from "@/types/oaf-bot";

export type QueueSummary = {
  total: number;
  pendingReview: number;
  readyToPublish: number;
  failed: number;
  published: number;
};

export const usageSceneOrder = ["oaf_bot_test_generate", "auto_post", "auto_comment", "auto_reply"] as const;

export function createEmptyForm(defaultPrimaryLanguage: string): OAFBotPayload {
  return {
    name: "",
    twitter_account_id: 0,
    occupation: "",
    industry: "",
    age_range: "",
    gender: "",
    education: "",
    mbti: "",
    personality_tags: [],
    identity_summary: "",
    voice_tone: "",
    topics: [],
    forbidden_topics: [],
    growth_goal: "",
    project_one_liner: "",
    target_audience: "",
    core_value_props: "",
    product_features: "",
    differentiators: "",
    content_pillars: [],
    content_objectives: "",
    preferred_cta: "",
    website_url: "",
    telegram_url: "",
    discord_url: "",
    docs_url: "",
    cta_policy: "",
    hashtags: [],
    keywords: [],
    compliance_notes: "",
    avoid_claims: [],
    safety_mode: "balanced",
    primary_language: defaultPrimaryLanguage,
    language_strategy: "follow_context",
    trend_regions: ["1", "23424977"],
    trend_categories: [],
    allow_general_trends: false,
    sensitive_trend_policy: "avoid",
  };
}

export function botToPayload(bot: OAFBot, defaultPrimaryLanguage = "zh-CN"): OAFBotPayload {
  return {
    name: bot.name,
    twitter_account_id: bot.twitter_account_id,
    occupation: bot.occupation,
    industry: bot.industry,
    age_range: bot.age_range,
    gender: bot.gender,
    education: bot.education,
    mbti: bot.mbti,
    personality_tags: bot.personality_tags || [],
    identity_summary: bot.identity_summary,
    voice_tone: bot.voice_tone,
    topics: bot.topics || [],
    forbidden_topics: bot.forbidden_topics || [],
    growth_goal: bot.growth_goal,
    project_one_liner: bot.project_one_liner || "",
    target_audience: bot.target_audience || "",
    core_value_props: bot.core_value_props || "",
    product_features: bot.product_features || "",
    differentiators: bot.differentiators || "",
    content_pillars: bot.content_pillars || [],
    content_objectives: bot.content_objectives || "",
    preferred_cta: bot.preferred_cta || "",
    website_url: bot.website_url || "",
    telegram_url: bot.telegram_url || "",
    discord_url: bot.discord_url || "",
    docs_url: bot.docs_url || "",
    cta_policy: bot.cta_policy || "",
    hashtags: bot.hashtags || [],
    keywords: bot.keywords || [],
    compliance_notes: bot.compliance_notes || "",
    avoid_claims: bot.avoid_claims || [],
    safety_mode: bot.safety_mode || "balanced",
    primary_language: bot.primary_language || defaultPrimaryLanguage,
    language_strategy: bot.language_strategy || "follow_context",
    trend_regions: bot.trend_regions?.length ? bot.trend_regions : ["1", "23424977"],
    trend_categories: bot.trend_categories || [],
    allow_general_trends: Boolean(bot.allow_general_trends),
    sensitive_trend_policy: bot.sensitive_trend_policy || "avoid",
  };
}

export function calculatePersonaCompleteness(form: OAFBotPayload) {
  let score = 0;
  if (form.name.trim()) score += 10;
  if (form.twitter_account_id) score += 10;
  if (form.occupation.trim() || form.industry.trim()) score += 10;
  if (form.project_one_liner.trim()) score += 10;
  if (form.target_audience.trim() || form.core_value_props.trim()) score += 10;
  if (form.website_url.trim() || form.telegram_url.trim() || form.discord_url.trim() || form.docs_url.trim()) score += 4;
  if (form.primary_language.trim() && form.language_strategy.trim()) score += 8;
  if (form.personality_tags.length > 0) score += 8;
  if (form.topics.length > 0) score += 10;
  if (form.content_pillars.length > 0 || form.content_objectives.trim()) score += 8;
  if (form.forbidden_topics.length > 0 || form.avoid_claims.length > 0 || form.compliance_notes.trim()) score += 8;
  if (form.identity_summary.trim()) score += 10;
  if (form.growth_goal.trim()) score += 8;
  return Math.min(score, 100);
}

export function validateBeforeGenerate(form: OAFBotPayload, t: (key: string) => string) {
  if (!form.name.trim()) return t("oafBots.test.needName");
  if (form.topics.length === 0) return t("oafBots.test.needTopic");
  if (!form.identity_summary.trim() && !form.voice_tone.trim()) return t("oafBots.test.needPersona");
  return "";
}

export function hasProfileAssistSeed(form: OAFBotPayload) {
  return Boolean(
    form.name.trim() ||
      form.occupation.trim() ||
      form.industry.trim() ||
      form.project_one_liner.trim() ||
      form.target_audience.trim() ||
      form.core_value_props.trim() ||
      form.product_features.trim() ||
      form.topics.length > 0,
  );
}

export function summarizeQueue(items: ReviewQueueItemApi[]): QueueSummary {
  return items.reduce<QueueSummary>(
    (summary, item) => {
      summary.total += 1;
      if (item.status === "pending_review") summary.pendingReview += 1;
      if (item.status === "ready_to_publish") summary.readyToPublish += 1;
      if (item.status === "failed") summary.failed += 1;
      if (item.status === "published") summary.published += 1;
      return summary;
    },
    { total: 0, pendingReview: 0, readyToPublish: 0, failed: 0, published: 0 },
  );
}

export function contentItemMatchesBot(item: ContentLibraryItemApi, bot: OAFBot) {
  const accountID = bot.twitter_account_id || 0;
  if (item.twitter_account_id && item.twitter_account_id !== accountID) return false;
  if (item.bot_id && item.bot_id !== bot.id) return false;
  return true;
}

export function normalizeUsageScene(scene: string) {
  return scene === "test_generate" ? "oaf_bot_test_generate" : scene;
}

export function aggregateMonthlyUsage(items: OAFBotGenerationUsage[], currentMonth: string) {
  const usageByScene = new Map<string, OAFBotGenerationUsage>();
  items.forEach((item) => {
    const scene = normalizeUsageScene(item.scene);
    if (item.month !== currentMonth) return;
    const existing = usageByScene.get(scene);
    usageByScene.set(scene, {
      ...item,
      scene,
      count: (existing?.count ?? 0) + item.count,
    });
  });
  return usageByScene;
}
