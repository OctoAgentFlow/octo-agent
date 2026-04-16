"use client";

import { plans } from "@/mocks/billing.mock";
import { SectionCard } from "@/components/dashboard/section-card";
import { useT } from "@/i18n/use-t";

export function PlanComparison() {
  const { t } = useT();
  return (
    <SectionCard title={t("billing.plans.title")} description={t("billing.plans.description")}>
      <div className="grid gap-3 md:grid-cols-2">
        {plans.map((plan) => (
          <article
            key={plan.nameKey}
            className={`rounded-xl border p-4 ${
              plan.highlight
                ? "border-violet-400/35 bg-violet-500/10"
                : "border-white/10 bg-white/5"
            }`}
          >
            <div className="flex items-end justify-between gap-3">
              <h4 className="text-base font-semibold text-white">{t(plan.nameKey)}</h4>
              <p className="text-sm text-white/75">
                <span className="text-xl font-semibold text-white">{plan.price}</span> {t(plan.periodKey)}
              </p>
            </div>
            <p className="mt-2 text-sm text-white/60">{t(plan.descriptionKey)}</p>
            <ul className="mt-4 space-y-2">
              {plan.featureKeys.map((featureKey) => (
                <li key={featureKey} className="text-sm text-white/75">
                  • {t(featureKey)}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </SectionCard>
  );
}
