"use client";

import { Lock, Star } from "lucide-react";

import type { BillingCycle, Plan } from "@/types/billing";
import { SectionCard } from "@/components/dashboard/section-card";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";

function planKey(code: string) {
  if (code === "pro_plus") return "proPlus";
  if (code === "free_trial") return "freeTrial";
  return code;
}

function planBadgeKey(code: string) {
  if (code === "plus") return "billing.plans.plus.badge";
  if (code === "pro") return "billing.plans.pro.badge";
  return "";
}

function planTextKey(code: string, field: "audience" | "description") {
  return `billing.plans.${planKey(code)}.${field}`;
}

function featureLabelKey(key: string) {
  const map: Record<string, string> = {
    full_persona_fields: "billing.features.fullPersonaFields",
    auto_dm_import: "billing.features.autoDmImport",
    advanced_bot_strategy: "billing.features.advancedBotStrategy",
    bulk_review: "billing.features.bulkReview",
    bot_performance: "billing.features.botPerformanceAnalytics",
    bot_performance_analytics: "billing.features.botPerformanceAnalytics",
    data_export: "billing.features.dataExport",
    multi_bot_matrix: "billing.features.multiBotMatrix",
    ab_testing: "billing.features.abTesting",
    advanced_flow_builder: "billing.features.advancedFlowBuilder",
    advanced_risk_rules: "billing.features.advancedRiskRules",
    priority_support: "billing.features.prioritySupport",
  };
  return map[key] || "billing.features.additionalCapability";
}

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value);
}

export function PlanComparison({
  plans,
  billingCycle,
  onBillingCycleChange,
  currentPlan,
  onUpgrade,
}: {
  plans: Plan[];
  billingCycle: BillingCycle;
  onBillingCycleChange: (cycle: BillingCycle) => void;
  currentPlan?: string;
  onUpgrade: (planCode: string) => void;
}) {
  const { t, lang } = useT();

  const buildBenefits = (plan: Plan) => {
    const benefits = [
      t(plan.limits.maxBots === 1 ? "billing.benefits.oafBots.one" : "billing.benefits.oafBots.other", {
        count: formatNumber(plan.limits.maxBots, lang),
      }),
      t(
        plan.limits.maxTwitterAccounts === 1
          ? "billing.benefits.xAccounts.one"
          : "billing.benefits.xAccounts.other",
        { count: formatNumber(plan.limits.maxTwitterAccounts, lang) }
      ),
      t("billing.benefits.aiGenerationsMonthly", {
        count: formatNumber(plan.limits.aiGenerationsMonthly, lang),
      }),
      t("billing.benefits.dailyAutomation", {
        posts: formatNumber(plan.limits.dailyAutoPosts, lang),
        replies: formatNumber(plan.limits.dailyAutoReplies, lang),
        comments: formatNumber(plan.limits.dailyAutoComments, lang),
        dms: formatNumber(plan.limits.dailyAutoDMs, lang),
      }),
      t("billing.benefits.analyticsDays", { days: formatNumber(plan.limits.analyticsDays, lang) }),
      plan.limits.teamSeats > 0
        ? t(plan.limits.teamSeats === 1 ? "billing.benefits.teamSeats.one" : "billing.benefits.teamSeats.other", {
            count: formatNumber(plan.limits.teamSeats, lang),
          })
        : "",
    ];
    return benefits.filter((benefit): benefit is string => Boolean(benefit));
  };

  return (
    <SectionCard title={t("billing.planComparison.title")} description={t("billing.planComparison.subtitle")}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-white/10 bg-black/20 p-1">
          {(["monthly", "yearly"] as const).map((cycle) => (
            <button
              key={cycle}
              type="button"
              className={`rounded-full px-4 py-1.5 text-sm transition ${
                billingCycle === cycle ? "bg-white/14 text-white" : "text-white/60 hover:text-white"
              }`}
              onClick={() => onBillingCycleChange(cycle)}
            >
              {t(cycle === "monthly" ? "billing.billingCycle.monthly" : "billing.billingCycle.yearly")}
            </button>
          ))}
        </div>
        <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100">
          {t("billing.billingCycle.yearlySave")}
        </span>
      </div>
      <div className="grid gap-3 xl:grid-cols-4">
        {plans.map((plan) => {
          const badgeKey = planBadgeKey(plan.code);
          const benefits = buildBenefits(plan);
          return (
            <article
              key={plan.code}
              className={`relative flex h-full flex-col rounded-xl border p-4 ${
                plan.highlight
                  ? "border-violet-300/55 bg-violet-500/12 shadow-[0_0_28px_rgba(124,58,237,0.18)]"
                  : "border-white/10 bg-white/5"
              }`}
            >
              <div className="mb-3 h-7">
                {badgeKey ? (
                  <span className="inline-flex h-7 items-center gap-1 rounded-full border border-violet-300/25 bg-violet-400/12 px-2.5 text-xs text-violet-100">
                    <Star className="size-3" />
                    {t(badgeKey)}
                  </span>
                ) : null}
              </div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-base font-semibold text-white">{plan.name}</h4>
                  <p className="mt-1 min-h-10 text-xs leading-relaxed text-white/55">{t(planTextKey(plan.code, "audience"))}</p>
                </div>
                <p className="text-right text-sm text-white/75">
                  <span className="text-xl font-semibold text-white">
                    {billingCycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice}
                  </span>
                  <span className="block text-xs text-white/50">
                    {t(billingCycle === "yearly" ? "billing.units.usdtPerYear" : "billing.units.usdtPerMonth")}
                  </span>
                </p>
              </div>
              <p className="mt-2 min-h-12 text-sm leading-relaxed text-white/60">{t(planTextKey(plan.code, "description"))}</p>
              <ul className="mt-4 space-y-2">
                {benefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-2 text-sm text-white/75">
                    <span className="mt-2 inline-block size-1.5 shrink-0 rounded-full bg-blue-300/80" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
                {plan.featureFlags.slice(0, 5).map((feature) => (
                  <div
                    key={feature.key}
                    className={`flex items-center gap-2 text-xs ${feature.available ? "text-white/65" : "text-white/35"}`}
                  >
                    {feature.available ? <span className="size-1.5 rounded-full bg-emerald-300" /> : <Lock className="size-3" />}
                    <span>{t(featureLabelKey(feature.key))}</span>
                    {!feature.available && feature.minPlan ? (
                      <span className="ml-auto text-violet-200/70">{t("billing.actions.upgrade")}</span>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="mt-auto pt-5">
                <Button
                  type="button"
                  className={`w-full ${
                    plan.highlight
                      ? "bg-gradient-to-r from-blue-500 to-violet-500 text-white hover:opacity-90"
                      : "bg-white/10 text-white hover:bg-white/15"
                  }`}
                  disabled={currentPlan === plan.code}
                  onClick={() => onUpgrade(plan.code)}
                >
                  {currentPlan === plan.code ? t("billing.actions.currentPlan") : t("billing.actions.upgradeTo", { plan: plan.name })}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </SectionCard>
  );
}
