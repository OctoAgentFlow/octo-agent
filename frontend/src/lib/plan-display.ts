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
  const benefits = [
    t("planBenefits.oafBots", { count: count(limits.maxBots) }),
    t("planBenefits.xAccounts", { count: count(limits.maxTwitterAccounts) }),
    t("planBenefits.aiGenerationsMonthly", { count: count(limits.aiGenerationsMonthly) }),
    t("planBenefits.monthlyXWrites", { count: count(limits.monthlyXWrites) }),
    t("planBenefits.monthlyAutoPost", { count: count(limits.monthlyAutoPosts) }),
    t("planBenefits.monthlyAutoReply", { count: count(limits.monthlyAutoReplies) }),
    t("planBenefits.monthlyAutoComment", { count: count(limits.monthlyAutoComments) }),
    t("planBenefits.autoCommentTargets", { count: count(limits.autoCommentTargets) }),
    t("planBenefits.monthlyAutoCommentScans", { count: count(limits.monthlyAutoCommentScans) }),
    t("planBenefits.monthlyAutoDm", { count: count(limits.monthlyAutoDMs) }),
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
    auto_dm_import: "planFeatures.autoDmImport",
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
