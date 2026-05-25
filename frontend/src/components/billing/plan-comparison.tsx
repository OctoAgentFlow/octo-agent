"use client";

import { Lock, Star } from "lucide-react";

import type { BillingCycle, Plan } from "@/types/billing";
import { SectionCard } from "@/components/dashboard/section-card";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";
import {
  getPlanBenefits,
  planAudienceKey,
  planBadgeKey,
  planDescriptionKey,
  planFeatureKey,
  planUnitKey,
} from "@/lib/plan-display";

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

  return (
    <SectionCard className="bg-[#0f1419]" title={t("billing.planComparison.title")} description={t("billing.planComparison.subtitle")}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="grid grid-cols-2 rounded-full border border-[#2f3336] bg-black p-1 sm:inline-flex">
          {(["monthly", "yearly"] as const).map((cycle) => (
            <button
              key={cycle}
              type="button"
              className={`rounded-full px-4 py-1.5 text-sm transition ${
                billingCycle === cycle ? "bg-[#1d9bf0] text-white" : "text-[#71767b] hover:text-white"
              }`}
              onClick={() => onBillingCycleChange(cycle)}
            >
              {t(cycle === "monthly" ? "billing.billingCycle.monthly" : "billing.billingCycle.yearly")}
            </button>
          ))}
        </div>
        <span className="w-fit rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-3 py-1 text-xs text-[#7ee0b5]">
          {t("billing.billingCycle.yearlySave")}
        </span>
      </div>
      <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => {
          const badgeKey = planBadgeKey(plan.code);
          const benefits = getPlanBenefits(plan, t, lang, { includeTeamSeats: true });
          const isCurrentPlan = currentPlan === plan.code;
          return (
            <article
              key={plan.code}
              className={`relative flex h-full min-h-[560px] flex-col rounded-[26px] border p-5 transition-colors ${
                plan.highlight
                  ? "border-[#1d9bf0]/55 bg-[#1d9bf0]/10 shadow-[0_0_24px_rgba(29,155,240,0.12)]"
                  : "border-[#2f3336] bg-black hover:bg-[#080808]"
              }`}
            >
              <div className="mb-3 flex h-7 items-center justify-between gap-2">
                {badgeKey ? (
                  <span className="inline-flex h-7 items-center gap-1 rounded-full border border-[#1d9bf0]/35 bg-[#1d9bf0]/10 px-2.5 text-xs text-[#8ecdf8]">
                    <Star className="size-3" />
                    {t(badgeKey)}
                  </span>
                ) : (
                  <span />
                )}
                {isCurrentPlan ? (
                  <span className="inline-flex h-7 items-center rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-2.5 text-xs text-[#7ee0b5]">
                    {t("actions.currentPlan")}
                  </span>
                ) : null}
              </div>
              <div className="flex min-h-[128px] flex-col justify-between gap-4">
                <div className="min-w-0">
                  <h4 className="text-base font-semibold text-white">{plan.name}</h4>
                  <p className="mt-1 min-h-10 text-xs leading-relaxed text-[#71767b]">{t(planAudienceKey(plan.code))}</p>
                </div>
                <p className="shrink-0 text-left text-sm text-[#71767b]">
                  <span className="text-4xl font-bold tracking-[-0.03em] text-white">
                    {billingCycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice}
                  </span>
                  <span className="ml-2 whitespace-nowrap text-xs text-[#71767b]">
                    {t(planUnitKey(billingCycle))}
                  </span>
                </p>
              </div>
              <p className="mt-2 min-h-12 text-sm leading-relaxed text-[#71767b]">{t(planDescriptionKey(plan.code))}</p>
              <ul className="mt-4 flex-1 space-y-2">
                {benefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-2 text-sm text-[#d5d9dc]">
                    <span className="mt-[0.55em] inline-block size-1.5 shrink-0 rounded-full bg-[#1d9bf0]" />
                    <span className="leading-relaxed">{benefit}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 space-y-2 border-t border-[#2f3336] pt-4">
                {plan.featureFlags.slice(0, 5).map((feature) => (
                  <div
                    key={feature.key}
                    className={`flex items-center gap-2 text-xs ${feature.available ? "text-[#b6bec5]" : "text-[#71767b]/65"}`}
                  >
                    {feature.available ? <span className="size-1.5 rounded-full bg-[#00ba7c]" /> : <Lock className="size-3" />}
                    <span className="min-w-0 leading-relaxed">{t(planFeatureKey(feature.key))}</span>
                    {!feature.available && feature.minPlan ? (
                      <span className="ml-auto shrink-0 text-[#1d9bf0]">{t("actions.upgrade")}</span>
                    ) : null}
                  </div>
                ))}
              </div>
              <div className="mt-auto pt-5">
                <Button
                  type="button"
                  className={`w-full ${
                    plan.highlight
                      ? ""
                      : "border border-[#2f3336] bg-transparent text-white hover:bg-[#16181c]"
                  }`}
                  disabled={isCurrentPlan}
                  onClick={() => onUpgrade(plan.code)}
                >
                  {isCurrentPlan ? t("actions.currentPlan") : t("actions.upgradeTo", { plan: plan.name })}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </SectionCard>
  );
}
