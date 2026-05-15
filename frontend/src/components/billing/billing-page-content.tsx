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
    <section className="surface-card p-5 md:p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-white md:text-lg">{t("billing.usage.title")}</h3>
        <p className="text-sm text-white/60">{t("billing.usage.description")}</p>
      </div>

      <div
        className={`mb-4 rounded-xl border p-4 ${
          aiBlocked
            ? "border-red-300/25 bg-red-500/10"
            : aiWarning
              ? "border-amber-300/25 bg-amber-400/10"
              : "border-white/10 bg-white/[0.04]"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-white">{t("billing.usage.ai.title")}</p>
            <p className="mt-1 text-xs text-white/58">
              {t("billing.usage.ai.summary", {
                used: usedAI,
                limit: limitAI,
                remaining: remainingAI,
                percent: aiPct,
              })}
            </p>
          </div>
          <Button type="button" size="sm" variant={aiWarning ? "default" : "outline"} onClick={onUpgrade}>
            {t("actions.upgrade")}
          </Button>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
          <span
            className={`block h-full rounded-full ${
              aiBlocked ? "bg-red-300" : aiWarning ? "bg-amber-300" : "bg-gradient-to-r from-blue-400 to-violet-400"
            }`}
            style={{ width: `${aiPct}%` }}
          />
        </div>
        {aiWarning ? (
          <p className={`mt-3 text-sm ${aiBlocked ? "text-red-100" : "text-amber-100"}`}>
            {t(aiBlocked ? "billing.usage.ai.blocked" : "billing.usage.ai.warning")}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map(([labelKey, used, limit]) => {
          const pct = typeof used === "number" && typeof limit === "number" && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
          return (
            <div key={labelKey} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs text-white/55">{t(String(labelKey))}</p>
              <p className="mt-2 text-lg font-semibold text-white">
                {used} <span className="text-sm font-normal text-white/45">/ {limit}</span>
              </p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
                <span className="block h-full rounded-full bg-gradient-to-r from-blue-400 to-violet-400" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
