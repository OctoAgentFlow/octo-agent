import type {
  BillingOpsAction,
  BillingCycle,
  BillingOpsSummary,
  BillingOrderFilterState,
  CurrentSubscription,
  PaymentMethodOption,
  PaymentRecord,
  Plan,
} from "@/types/billing";

import { PaymentHistoryTable } from "./payment-history-table";
import { PaymentMethodPanel } from "./payment-method-panel";
import { PlanComparison } from "./plan-comparison";
import { SubscriptionStatusCard } from "./subscription-status-card";
import { BillingCheckoutDialog } from "./billing-checkout-dialog";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";

type BillingPageContentProps = {
  subscription: CurrentSubscription | null;
  plans: Plan[];
  paymentMethods: PaymentMethodOption[];
  paymentRecords: PaymentRecord[];
  opsSummary: BillingOpsSummary;
  canOperateBilling: boolean;
  filters: BillingOrderFilterState;
  onFiltersChange: (filters: BillingOrderFilterState) => void;
  onConfirmTx?: (orderId: string, txHash: string) => Promise<void>;
  onOpsAction?: (
    orderId: string,
    action: BillingOpsAction,
    payload?: { opsNote?: string }
  ) => Promise<void>;
  onPaymentConfirmed?: () => void;
};

export function BillingPageContent({
  subscription,
  plans,
  paymentMethods,
  paymentRecords,
  opsSummary,
  canOperateBilling,
  filters,
  onFiltersChange,
  onConfirmTx,
  onOpsAction,
  onPaymentConfirmed,
}: BillingPageContentProps) {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [checkoutPlanCode, setCheckoutPlanCode] = useState<string | null>(null);
  const upgradePlanCode = nextUpgradePlan(subscription?.plan || "basic");

  return (
    <div className="space-y-4 md:space-y-5">
      <SubscriptionStatusCard subscription={subscription} />
      <PlanUsagePanel subscription={subscription} onUpgrade={() => setCheckoutPlanCode(upgradePlanCode)} />
      <PlanComparison
        plans={plans}
        billingCycle={billingCycle}
        onBillingCycleChange={setBillingCycle}
        currentPlan={subscription?.plan}
        onUpgrade={(planCode) => setCheckoutPlanCode(planCode)}
      />
      <PaymentMethodPanel paymentMethods={paymentMethods} onPaid={onPaymentConfirmed} />
      <BillingCheckoutDialog
        open={Boolean(checkoutPlanCode)}
        onOpenChange={(open) => {
          if (!open) setCheckoutPlanCode(null);
        }}
        paymentMethods={paymentMethods}
        planCode={checkoutPlanCode || "basic"}
        billingCycle={billingCycle}
        onPaid={onPaymentConfirmed}
      />
      <PaymentHistoryTable
        paymentRecords={paymentRecords}
        opsSummary={opsSummary}
        canOperateBilling={canOperateBilling}
        filters={filters}
        onFiltersChange={onFiltersChange}
        onConfirmTx={onConfirmTx}
        onOpsAction={onOpsAction}
      />
    </div>
  );
}

function nextUpgradePlan(plan: string) {
  const order = ["basic", "plus", "pro", "pro_plus"];
  const idx = order.indexOf(plan);
  if (idx < 0) return "basic";
  return order[Math.min(idx + 1, order.length - 1)];
}

function PlanUsagePanel({ subscription, onUpgrade }: { subscription: CurrentSubscription | null; onUpgrade: () => void }) {
  const { t } = useT();
  if (!subscription) return null;
  const usedAI = subscription.usage.aiGenerationsMonth;
  const limitAI = subscription.limits.aiGenerationsMonthly;
  const remainingAI = Math.max(0, limitAI - usedAI);
  const aiPct = limitAI > 0 ? Math.min(100, Math.round((usedAI / limitAI) * 100)) : 0;
  const aiBlocked = aiPct >= 100;
  const aiWarning = aiPct >= 80;
  const items: Array<[string, number, number]> = [
    ["billing.usage.items.oafBots", subscription.usage.oafBots, subscription.limits.maxBots],
    ["billing.usage.items.xAccounts", subscription.usage.twitterAccounts, subscription.limits.maxTwitterAccounts],
    ["billing.usage.items.aiGenerations", subscription.usage.aiGenerationsMonth, subscription.limits.aiGenerationsMonthly],
    ["billing.usage.items.autoPosts", subscription.usage.autoPostsToday, subscription.limits.dailyAutoPosts],
    ["billing.usage.items.autoReplies", subscription.usage.autoRepliesToday, subscription.limits.dailyAutoReplies],
    ["billing.usage.items.autoComments", subscription.usage.autoCommentsToday, subscription.limits.dailyAutoComments],
    ["billing.usage.items.autoDMs", subscription.usage.autoDMsToday, subscription.limits.dailyAutoDMs],
  ];
  return (
    <section className="surface-card bg-[#0f1419] p-5 md:p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-white md:text-lg">{t("billing.usage.title")}</h3>
        <p className="text-sm text-[#71767b]">{t("billing.usage.description")}</p>
      </div>

      <div
        className={`mb-4 rounded-2xl border p-4 ${
          aiBlocked
            ? "border-[#f4212e]/25 bg-[#f4212e]/10"
            : aiWarning
              ? "border-[#ffd400]/25 bg-[#ffd400]/10"
              : "border-[#2f3336] bg-black"
        }`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-white">{t("billing.usage.ai.title")}</p>
            <p className="mt-1 break-words text-xs text-[#71767b]">
              {t("billing.usage.ai.summary", {
                used: usedAI,
                limit: limitAI,
                remaining: remainingAI,
                percent: aiPct,
              })}
            </p>
          </div>
          <Button type="button" size="sm" className="w-full sm:w-auto" variant={aiWarning ? "default" : "outline"} onClick={onUpgrade}>
            {t("actions.upgrade")}
          </Button>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#2f3336]">
          <span
            className={`block h-full rounded-full ${
              aiBlocked ? "bg-[#f4212e]" : aiWarning ? "bg-[#ffd400]" : "bg-[#1d9bf0]"
            }`}
            style={{ width: `${aiPct}%` }}
          />
        </div>
        {aiWarning ? (
          <p className={`mt-3 text-sm ${aiBlocked ? "text-[#ff8a91]" : "text-[#f6d96b]"}`}>
            {t(aiBlocked ? "billing.usage.ai.blocked" : "billing.usage.ai.warning")}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map(([labelKey, used, limit]) => {
          const pct = typeof used === "number" && typeof limit === "number" && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
          return (
            <div key={labelKey} className="rounded-2xl border border-[#2f3336] bg-black p-4 transition-colors hover:bg-[#080808]">
              <p className="text-xs text-[#71767b]">{t(String(labelKey))}</p>
              <p className="mt-2 text-lg font-semibold text-white">
                {used} <span className="text-sm font-normal text-[#71767b]">/ {limit}</span>
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#2f3336]">
                <span className="block h-full rounded-full bg-[#1d9bf0]" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
