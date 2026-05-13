"use client";

import { useState } from "react";
import axios from "axios";
import { CheckCircle2 } from "lucide-react";

import { BillingCheckoutDialog } from "@/components/billing/billing-checkout-dialog";
import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { upgradePrompt } from "@/mocks/dashboard.mock";
import { useT } from "@/i18n/use-t";
import { mapPaymentMethods } from "@/lib/billing-payment-methods";
import { billingService } from "@/services/billing.service";
import type { DashboardOverview } from "@/services/dashboard.service";
import type { PaymentMethodOption } from "@/types/billing";

import { SectionCard } from "./section-card";

type TrialUpgradeBannerProps = {
  overview?: DashboardOverview | null;
};

function planKeyFromCode(plan: string) {
  if (plan === "free_trial") return "dashboard.membership.plan.freeTrial";
  if (plan === "basic_monthly") return "dashboard.membership.plan.basicMonthly";
  return "dashboard.membership.plan.freeTrial";
}

export function TrialUpgradeBanner({ overview }: TrialUpgradeBannerProps) {
  const { t } = useT();
  const { pushToast } = useToast();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(false);
  const plan = planKeyFromCode(overview?.plan || "free_trial");
  const trialDaysLeft = overview?.trial_days_left ?? 0;
  const expired = overview?.subscription_status === "expired";
  const alreadyBasic = overview?.plan === "basic_monthly" && !expired;

  const openCheckout = async () => {
    if (alreadyBasic) return;

    setLoadingMethods(true);
    try {
      const data = await billingService.paymentMethods();
      const methods = mapPaymentMethods(data.items);
      setPaymentMethods(methods);
      if (methods.length === 0) {
        pushToast(t("dashboard.upgrade.noPaymentMethod"));
        return;
      }
      setCheckoutOpen(true);
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || t("dashboard.upgrade.paymentMethodLoadFailed")
        : t("dashboard.upgrade.paymentMethodLoadFailed");
      pushToast(message);
    } finally {
      setLoadingMethods(false);
    }
  };

  return (
    <SectionCard
      title={t("dashboard.upgrade.section.title")}
      description={t("dashboard.upgrade.section.description")}
    >
      <div className="rounded-xl border border-blue-300/20 bg-blue-500/10 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="inline-flex items-center gap-2 text-sm text-blue-100">
              <CheckCircle2 className="size-4" />
              {expired
                ? t("dashboard.upgrade.expiredLine", { plan: t(plan) })
                : t("dashboard.upgrade.membershipLine", {
                    plan: t(plan),
                    days: trialDaysLeft,
                  })}
            </p>
            <h4 className="text-lg font-semibold text-white">{t(upgradePrompt.titleKey)}</h4>
            <p className="text-sm text-white/70">{t(upgradePrompt.descriptionKey)}</p>
          </div>
          <Button
            type="button"
            className="bg-gradient-to-r from-blue-500 to-violet-500 text-white hover:opacity-90"
            disabled={alreadyBasic || loadingMethods}
            onClick={() => void openCheckout()}
          >
            {loadingMethods ? t("dashboard.upgrade.loadingPayment") : t(upgradePrompt.ctaKey)}
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {upgradePrompt.perksKeys.map((perkKey) => (
            <span key={perkKey} className="rounded-full border border-white/15 px-2.5 py-1 text-xs text-white/70">
              {t(perkKey)}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-white/55">{t("dashboard.membership.billingHint.basic", { price: 10 })}</p>
      </div>
      <BillingCheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        paymentMethods={paymentMethods}
        planCode="basic_monthly"
      />
    </SectionCard>
  );
}
