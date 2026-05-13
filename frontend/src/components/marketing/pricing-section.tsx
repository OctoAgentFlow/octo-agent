"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";
import { pricingPlans } from "@/mocks/landing.mock";

import { SectionShell } from "./section-shell";

export function PricingSection() {
  const { t } = useT();
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  return (
    <SectionShell
      id="pricing"
      badge={t("marketing.pricing.badge")}
      title={t("marketing.pricing.title")}
      description={t("marketing.pricing.description")}
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
              {item === "monthly" ? "Monthly" : "Yearly"}
            </button>
          ))}
        </div>
        <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100">
          Yearly Save 20%
        </span>
      </div>
      <div className="grid gap-4 lg:grid-cols-4">
        {pricingPlans.map((plan) => (
          <article
            key={plan.code}
            className={`rounded-2xl p-6 ${plan.highlight ? "surface-card border border-violet-400/35" : "surface-card border border-white/15 bg-white/[0.03]"}`}
          >
            {plan.badge ? (
              <span className="mb-3 inline-flex rounded-full border border-violet-300/25 bg-violet-400/12 px-2.5 py-1 text-xs text-violet-100">
                {plan.badge}
              </span>
            ) : null}
            <p className="text-sm font-medium text-white/75">{plan.name}</p>
            <div className="mt-2 flex items-end gap-1">
              <span className="text-4xl font-semibold text-white">
                {cycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice}
              </span>
              <span className="pb-1 text-sm text-white/70">{plan.unit}</span>
              <span className="pb-1 text-sm text-white/50">/{cycle === "yearly" ? "year" : "month"}</span>
            </div>
            <p className="mt-3 min-h-10 text-sm text-white/65">{plan.audience}</p>
            <ul className="mt-4 space-y-2 text-sm text-white/75">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                  <span className="inline-block size-1.5 rounded-full bg-violet-300/80" />
                  {feature}
                </li>
              ))}
            </ul>
            <Button
              className={`mt-6 w-full ${plan.highlight ? "bg-gradient-to-r from-blue-500 to-violet-500 text-white hover:opacity-90" : "bg-white/10 text-white hover:bg-white/15"}`}
            >
              {t("common.startFreeTrial")}
            </Button>
          </article>
        ))}
      </div>
    </SectionShell>
  );
}
