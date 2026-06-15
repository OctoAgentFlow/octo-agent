import type { Language, TranslateParams } from "@/i18n/types";
import type { BillingCycle, PlanFeature, PlanLimits } from "@/types/billing";

type TranslateFn = (key: string, params?: TranslateParams) => string;

export type DisplayPlan = {
  code: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  currency?: string;
  limits: PlanLimits;
  featureFlags?: PlanFeature[];
  highlight?: boolean;
};

export function planCopyKey(code: string) {
  if (code === "pro_plus") return "proPlus";
  if (code === "free_trial") return "freeTrial";
  return code;
}

export function planBadgeKey(code: string) {
  if (code === "plus") return "plans.plus.badge";
  if (code === "pro") return "plans.pro.badge";
  return "";
}

export function planAudienceKey(code: string) {
  return `plans.${planCopyKey(code)}.audience`;
}

export function planDescriptionKey(code: string) {
  return `plans.${planCopyKey(code)}.description`;
}

export function planUnitKey(cycle: BillingCycle) {
  return cycle === "yearly" ? "planUnits.usdtPerYear" : "planUnits.usdtPerMonth";
}

export function formatPlanNumber(value: number, locale: Language) {
  return new Intl.NumberFormat(locale).format(value);
}

export function getPlanBenefits(plan: DisplayPlan, t: TranslateFn, lang: Language, options?: { includeTeamSeats?: boolean }) {
  const limits = plan.limits;
  const count = (value: number) => formatPlanNumber(value, lang);
  const contentDrafts = limits.monthlyContentDrafts ?? limits.monthlyAutoPosts;
  const replyDrafts = limits.monthlyReplyDrafts ?? limits.monthlyAutoReplies;
  const opportunityDrafts = limits.monthlyOpportunityDrafts ?? limits.monthlyAutoComments;
  const reviewCapacity = limits.monthlyReviewCapacity ?? limits.monthlyAutoDMs;
  const contentMemory = limits.contentMemorySources ?? limits.autoCommentTargets;
  const radarRefreshes = limits.monthlyRadarRefreshes ?? limits.monthlyAutoCommentScans;
  const benefits = [
    t("planBenefits.oafBots", { count: count(limits.maxBots) }),
    t("planBenefits.xAccounts", { count: count(limits.maxTwitterAccounts) }),
    t("planBenefits.monthlyOpportunityDraft", { count: count(opportunityDrafts) }),
    t("planBenefits.contentMemory", { count: count(contentMemory) }),
    t("planBenefits.monthlyReplyDraft", { count: count(replyDrafts) }),
    t("planBenefits.monthlyContentDraft", { count: count(contentDrafts) }),
    t("planBenefits.reviewCapacity", { count: count(reviewCapacity) }),
    t("planBenefits.monthlyRadarRefreshes", { count: count(radarRefreshes) }),
    t("planBenefits.aiGenerationsMonthly", { count: count(limits.aiGenerationsMonthly) }),
    t("planBenefits.analyticsDays", { days: count(limits.analyticsDays) }),
  ];

  if (options?.includeTeamSeats && limits.teamSeats > 0) {
    benefits.push(t("planBenefits.teamSeats", { count: count(limits.teamSeats) }));
  }

  return benefits;
}

export function planFeatureKey(key: string) {
  const map: Record<string, string> = {
    full_persona_fields: "planFeatures.fullPersonaFields",
    auto_dm_import: "planFeatures.contentMemory",
    advanced_bot_strategy: "planFeatures.advancedBotStrategy",
    bulk_review: "planFeatures.bulkReview",
    bot_performance: "planFeatures.botPerformanceAnalytics",
    bot_performance_analytics: "planFeatures.botPerformanceAnalytics",
    data_export: "planFeatures.dataExport",
    multi_bot_matrix: "planFeatures.multiBotMatrix",
    ab_testing: "planFeatures.abTesting",
    advanced_flow_builder: "planFeatures.advancedFlowBuilder",
    advanced_risk_rules: "planFeatures.advancedRiskRules",
    priority_support: "planFeatures.prioritySupport",
  };
  return map[key] || "planFeatures.additionalCapability";
}
