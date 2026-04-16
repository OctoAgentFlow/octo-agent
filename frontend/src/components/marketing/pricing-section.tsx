"use client";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";
import { pricingPlans } from "@/mocks/landing.mock";

import { SectionShell } from "./section-shell";

export function PricingSection() {
  const { t } = useT();
  return (
    <SectionShell
      id="pricing"
      badge={t("marketing.pricing.badge")}
      title={t("marketing.pricing.title")}
      description={t("marketing.pricing.description")}
    >
      <div className="grid gap-4 md:grid-cols-2">
        {pricingPlans.map((plan) => (
          <article
            key={plan.nameKey}
            className={`rounded-2xl p-6 ${plan.highlight ? "surface-card border border-violet-400/35" : "surface-card border border-white/15 bg-white/[0.03]"}`}
          >
            <p className="text-sm font-medium text-white/75">{t(plan.nameKey)}</p>
            <div className="mt-2 flex items-end gap-1">
              <span className="text-4xl font-semibold text-white">{plan.price}</span>
              <span className="pb-1 text-sm text-white/70">{plan.unit}</span>
              <span className="pb-1 text-sm text-white/50">{plan.period}</span>
            </div>
            <p className="mt-3 text-sm text-white/65">{t(plan.descriptionKey)}</p>
            <ul className="mt-4 space-y-2 text-sm text-white/75">
              {plan.featureKeys.map((featureKey) => (
                <li key={featureKey} className="flex items-center gap-2">
                  <span className="inline-block size-1.5 rounded-full bg-violet-300/80" />
                  {t(featureKey)}
                </li>
              ))}
            </ul>
            <Button
              className={`mt-6 w-full ${plan.highlight ? "bg-gradient-to-r from-blue-500 to-violet-500 text-white hover:opacity-90" : "bg-white/10 text-white hover:bg-white/15"}`}
            >
              {t(plan.ctaKey)}
            </Button>
          </article>
        ))}
      </div>
    </SectionShell>
  );
}
