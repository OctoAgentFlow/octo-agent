"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";
import { getPlanBenefits, planAudienceKey, planBadgeKey, planDescriptionKey, planUnitKey } from "@/lib/plan-display";
import { pricingPlans } from "@/mocks/landing.mock";

import { SectionShell } from "./section-shell";

export function PricingSection() {
  const { t, lang } = useT();
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  return (
    <SectionShell
      id="pricing"
      badge={t("marketing.pricing.badge")}
      title={t("pricing.title")}
      description={t("pricing.subtitle")}
    >
      <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
        <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-1">
          {(["monthly", "yearly"] as const).map((item) => (
            <button
              key={item}
              type="button"
              className={`rounded-full px-4 py-1.5 text-sm transition ${
                cycle === item ? "bg-white/14 text-white" : "text-white/60 hover:text-white"
              }`}
              onClick={() => setCycle(item)}
            >
              {t(item === "monthly" ? "pricing.monthly" : "pricing.yearly")}
            </button>
          ))}
        </div>
        <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100">
          {t("pricing.yearlySave")}
        </span>
      </div>
      <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-2 xl:grid-cols-4">
        {pricingPlans.map((plan) => {
          const badgeKey = planBadgeKey(plan.code);
          const benefits = getPlanBenefits(plan, t, lang, { includeTeamSeats: true });
          return (
            <article
              key={plan.code}
              className={`flex h-full min-h-[560px] flex-col rounded-2xl p-6 ${
                plan.highlight
                  ? "surface-card border border-violet-400/35 shadow-[0_0_32px_rgba(124,58,237,0.18)]"
                  : "surface-card border border-white/15 bg-white/[0.03]"
              }`}
            >
              <div className="mb-4 h-7">
                {badgeKey ? (
                  <span className="inline-flex h-7 items-center rounded-full border border-violet-300/25 bg-violet-400/12 px-2.5 text-xs text-violet-100">
                    {t(badgeKey)}
                  </span>
                ) : null}
              </div>
              <p className="text-sm font-medium text-white/75">{plan.name}</p>
              <div className="mt-2 flex min-h-[64px] items-baseline gap-2 whitespace-nowrap">
                <span className="text-4xl font-semibold text-white">
                  {cycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice}
                </span>
                <span className="shrink-0 whitespace-nowrap text-sm text-white/60">{t(planUnitKey(cycle))}</span>
              </div>
              <p className="mt-3 min-h-[48px] text-sm leading-relaxed text-white/65">{t(planAudienceKey(plan.code))}</p>
              <p className="mt-2 min-h-[44px] text-sm leading-relaxed text-white/55">{t(planDescriptionKey(plan.code))}</p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm leading-relaxed text-white/75">
                {benefits.map((benefit) => (
                  <li key={benefit} className="flex items-start gap-2">
                    <span className="mt-[0.55em] inline-block size-1.5 shrink-0 rounded-full bg-violet-300/80" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-6">
                <Button
                  className={`w-full ${
                    plan.highlight
                      ? "bg-gradient-to-r from-blue-500 to-violet-500 text-white hover:opacity-90"
                      : "bg-white/10 text-white hover:bg-white/15"
                  }`}
                >
                  {t("actions.startTrial")}
                </Button>
              </div>
            </article>
          );
        })}
      </div>
    </SectionShell>
  );
}
