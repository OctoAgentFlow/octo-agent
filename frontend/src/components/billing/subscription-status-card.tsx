"use client";

import { currentSubscription } from "@/mocks/billing.mock";
import { SectionCard } from "@/components/dashboard/section-card";
import { Button } from "@/components/ui/button";
import { CardHeader } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";

export function SubscriptionStatusCard() {
  const { t } = useT();
  return (
    <SectionCard>
      <CardHeader
        title={t("billing.subscription.title")}
        description={t("billing.subscription.description")}
        right={<Button variant="outline">{t("billing.subscription.manage")}</Button>}
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-white/55">{t("billing.subscription.fields.currentPlan")}</p>
            <p className="text-sm font-medium text-white">{t(currentSubscription.planKey)}</p>
          </div>
          <div>
            <p className="text-xs text-white/55">{t("billing.subscription.fields.expirationDate")}</p>
            <p className="text-sm font-medium text-white">{currentSubscription.expirationDate}</p>
          </div>
          <div>
            <p className="text-xs text-white/55">{t("billing.subscription.fields.remainingTrialDays")}</p>
            <p className="text-sm font-medium text-white">
              {t("billing.subscription.remainingTrialDays", { days: currentSubscription.remainingTrialDays })}
            </p>
          </div>
          <div>
            <p className="text-xs text-white/55">{t("billing.subscription.fields.status")}</p>
            <span className="inline-flex rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-200">
              {t(currentSubscription.statusKey)}
            </span>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
