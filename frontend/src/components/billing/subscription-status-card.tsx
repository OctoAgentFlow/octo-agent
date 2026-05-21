"use client";

import type { CurrentSubscription } from "@/types/billing";
import { SectionCard } from "@/components/dashboard/section-card";
import { Button } from "@/components/ui/button";
import { CardHeader } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";

export function SubscriptionStatusCard({ subscription }: { subscription: CurrentSubscription | null }) {
  const { t } = useT();
  if (!subscription) {
    return null;
  }
  return (
    <SectionCard className="bg-[#0f1419]">
      <CardHeader
        title={t("billing.subscription.title")}
        description={t("billing.subscription.description")}
        right={<Button variant="outline" className="w-full sm:w-auto">{t("billing.subscription.manage")}</Button>}
      />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-[#71767b]">{t("billing.subscription.fields.currentPlan")}</p>
            <p className="text-sm font-medium text-white">{subscription.planName}</p>
          </div>
          <div>
            <p className="text-xs text-[#71767b]">{t("billing.subscription.fields.billingCycle")}</p>
            <p className="text-sm font-medium text-white">
              {t(subscription.billingCycle === "yearly" ? "billing.billingCycle.yearly" : "billing.billingCycle.monthly")}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#71767b]">{t("billing.subscription.fields.expirationDate")}</p>
            <p className="text-sm font-medium text-white">{subscription.expirationDate}</p>
          </div>
          <div>
            <p className="text-xs text-[#71767b]">{t("billing.subscription.fields.remainingTrialDays")}</p>
            <p className="text-sm font-medium text-white">
              {t("billing.subscription.remainingTrialDays", { days: subscription.remainingTrialDays })}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#71767b]">{t("billing.subscription.fields.status")}</p>
            <span className="inline-flex rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-2.5 py-1 text-xs text-[#7ee0b5]">
              {t(subscription.statusKey)}
            </span>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
