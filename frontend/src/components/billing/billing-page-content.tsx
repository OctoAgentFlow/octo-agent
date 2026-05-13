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

  return (
    <div className="space-y-4 md:space-y-5">
      <SubscriptionStatusCard subscription={subscription} />
      <PlanUsagePanel subscription={subscription} />
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

function PlanUsagePanel({ subscription }: { subscription: CurrentSubscription | null }) {
  if (!subscription) return null;
  const items = [
    ["OAF Bots", subscription.usage.oafBots, subscription.limits.maxBots],
    ["X Accounts", subscription.usage.twitterAccounts, subscription.limits.maxTwitterAccounts],
    ["AI 生成次数", subscription.usage.aiGenerationsMonth, subscription.limits.aiGenerationsMonthly],
    ["自动发推/日", subscription.usage.autoPostsToday, subscription.limits.dailyAutoPosts],
    ["自动回复/日", subscription.usage.autoRepliesToday, subscription.limits.dailyAutoReplies],
    ["自动评论/日", subscription.usage.autoCommentsToday, subscription.limits.dailyAutoComments],
    ["自动私信/日", subscription.usage.autoDMsToday, subscription.limits.dailyAutoDMs],
  ];
  return (
    <section className="surface-card p-5 md:p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-white md:text-lg">当前用量</h3>
        <p className="text-sm text-white/60">按当前套餐展示 OAF Bot、账号和自动化额度使用情况。</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {items.map(([label, used, limit]) => {
          const pct = typeof used === "number" && typeof limit === "number" && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
          return (
            <div key={label} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs text-white/55">{label}</p>
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
