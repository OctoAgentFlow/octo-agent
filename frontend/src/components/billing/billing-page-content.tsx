import type {
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
import { BillingCheckoutDialog } from "./billing-checkout-dialog";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";
import {
  AlertTriangle,
  ArrowUpRight,
  Bot,
  CalendarClock,
  CheckCircle2,
  Crown,
  ListChecks,
  type LucideIcon,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";

type BillingPageContentProps = {
  subscription: CurrentSubscription | null;
  plans: Plan[];
  paymentMethods: PaymentMethodOption[];
  paymentRecords: PaymentRecord[];
  opsSummary: BillingOpsSummary;
  filters: BillingOrderFilterState;
  onFiltersChange: (filters: BillingOrderFilterState) => void;
  onConfirmTx?: (orderId: string, txHash: string) => Promise<void>;
  onPaymentConfirmed?: () => void;
};

export function BillingPageContent({
  subscription,
  plans,
  paymentMethods,
  paymentRecords,
  opsSummary,
  filters,
  onFiltersChange,
  onConfirmTx,
  onPaymentConfirmed,
}: BillingPageContentProps) {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [checkoutPlanCode, setCheckoutPlanCode] = useState<string | null>(null);
  const upgradePlanCode = nextUpgradePlan(subscription?.plan || "basic");
  const openUpgrade = (planCode = upgradePlanCode) => setCheckoutPlanCode(planCode);

  return (
    <div className="space-y-5 md:space-y-6">
      <BillingCommandCenter
        subscription={subscription}
        nextPlanCode={upgradePlanCode}
        onUpgrade={() => openUpgrade()}
      />
      <PlanUsagePanel subscription={subscription} onUpgrade={() => openUpgrade()} />
      <PlanComparison
        plans={plans}
        billingCycle={billingCycle}
        onBillingCycleChange={setBillingCycle}
        currentPlan={subscription?.plan}
        onUpgrade={(planCode) => openUpgrade(planCode)}
      />
      <PaymentMethodPanel paymentMethods={paymentMethods} onUpgrade={() => openUpgrade()} />
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
        canOperateBilling={false}
        filters={filters}
        onFiltersChange={onFiltersChange}
        onConfirmTx={onConfirmTx}
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

function displayPlanName(plan: string, fallback: string, t: (key: string, params?: Record<string, string | number>) => string) {
  if (plan === "free_trial") return t("billing.plan.freeTrial");
  if (plan === "pro_plus") return "Pro+";
  if (plan === "plus") return "Plus";
  if (plan === "pro") return "Pro";
  if (plan === "basic" || plan === "basic_monthly") return "Basic";
  return fallback;
}

function planUpgradeCopyKey(planCode: string) {
  if (planCode === "plus") return "billing.commandCenter.recommend.plus";
  if (planCode === "pro") return "billing.commandCenter.recommend.pro";
  if (planCode === "pro_plus") return "billing.commandCenter.recommend.proPlus";
  return "billing.commandCenter.recommend.basic";
}

function usagePercent(used: number, limit: number) {
  return limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
}

function formatUsage(value: number) {
  return new Intl.NumberFormat().format(value);
}

function BillingCommandCenter({
  subscription,
  nextPlanCode,
  onUpgrade,
}: {
  subscription: CurrentSubscription | null;
  nextPlanCode: string;
  onUpgrade: () => void;
}) {
  const { t } = useT();
  if (!subscription) return null;

  const usedAI = subscription.usage.aiGenerationsMonth;
  const limitAI = subscription.limits.aiGenerationsMonthly;
  const remainingAI = Math.max(0, limitAI - usedAI);
  const aiPct = usagePercent(usedAI, limitAI);
  const aiBlocked = aiPct >= 100;
  const aiWarning = aiPct >= 80;
  const currentPlanName = displayPlanName(subscription.plan, subscription.planName, t);
  const nextPlanName = displayPlanName(nextPlanCode, nextPlanCode, t);
  const isHighestPlan = subscription.plan === "pro_plus";
  const heroMetrics = [
    {
      labelKey: "billing.commandCenter.metrics.oafBots",
      used: subscription.usage.oafBots,
      limit: subscription.limits.maxBots,
      icon: Bot,
    },
    {
      labelKey: "billing.commandCenter.metrics.xAccounts",
      used: subscription.usage.twitterAccounts,
      limit: subscription.limits.maxTwitterAccounts,
      icon: Users,
    },
    {
      labelKey: "billing.commandCenter.metrics.aiGenerations",
      used: subscription.usage.aiGenerationsMonth,
      limit: subscription.limits.aiGenerationsMonthly,
      icon: Sparkles,
    },
  ];

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-[#2f3336] bg-black p-5 md:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(29,155,240,0.18),transparent_32%),radial-gradient(circle_at_bottom_left,rgba(120,86,255,0.14),transparent_28%)]" />
      <div className="relative grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <div className="min-w-0 space-y-5">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#1d9bf0]/30 bg-[#1d9bf0]/10 px-3 py-1 text-xs font-medium text-[#8ecdf8]">
                <Crown className="size-3.5" />
                {t("billing.commandCenter.eyebrow")}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-3 py-1 text-xs font-medium text-[#7ee0b5]">
                <CheckCircle2 className="size-3.5" />
                {t(subscription.statusKey)}
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#e7e9ea] md:text-3xl">
              {t("billing.commandCenter.title")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#71767b] md:text-[15px]">
              {t("billing.commandCenter.description")}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <StatusTile
              label={t("billing.subscription.fields.currentPlan")}
              value={currentPlanName}
              helper={t(
                subscription.billingCycle === "yearly"
                  ? "billing.billingCycle.yearly"
                  : "billing.billingCycle.monthly"
              )}
            />
            <StatusTile
              label={t("billing.subscription.fields.expirationDate")}
              value={subscription.expirationDate || "—"}
              helper={t("billing.commandCenter.expirationHelper")}
            />
            <StatusTile
              label={t("billing.subscription.fields.remainingTrialDays")}
              value={t("billing.subscription.remainingTrialDays", { days: subscription.remainingTrialDays })}
              helper={t("billing.commandCenter.trialHelper")}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {heroMetrics.map((metric) => {
              const pct = usagePercent(metric.used, metric.limit);
              const Icon = metric.icon;
              return (
                <div key={metric.labelKey} className="rounded-3xl border border-[#2f3336] bg-[#0f1419]/82 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-[#e7e9ea]">{t(metric.labelKey)}</p>
                    <span className="flex size-8 items-center justify-center rounded-full bg-[#1d9bf0]/10 text-[#1d9bf0]">
                      <Icon className="size-4" />
                    </span>
                  </div>
                  <p className="mt-3 text-2xl font-bold text-white">
                    {formatUsage(metric.used)}
                    <span className="text-sm font-normal text-[#71767b]"> / {formatUsage(metric.limit)}</span>
                  </p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#2f3336]">
                    <span className="block h-full rounded-full bg-[#1d9bf0]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="min-w-0 rounded-[24px] border border-[#2f3336] bg-[#0f1419]/88 p-4 md:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#e7e9ea]">{t("billing.commandCenter.aiTitle")}</p>
              <p className="mt-1 text-xs leading-relaxed text-[#71767b]">
                {t("billing.usage.ai.summary", {
                  used: usedAI,
                  limit: limitAI,
                  remaining: remainingAI,
                  percent: aiPct,
                })}
              </p>
            </div>
            <span
              className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                aiBlocked
                  ? "bg-[#f4212e]/12 text-[#ff8a91]"
                  : aiWarning
                    ? "bg-[#ffd400]/12 text-[#f6d96b]"
                    : "bg-[#00ba7c]/12 text-[#7ee0b5]"
              }`}
            >
              {aiWarning ? <AlertTriangle className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
              {t(aiBlocked ? "billing.commandCenter.aiBlockedBadge" : aiWarning ? "billing.commandCenter.aiWarningBadge" : "billing.commandCenter.aiHealthyBadge")}
            </span>
          </div>
          <div className="mt-5 h-3 overflow-hidden rounded-full bg-[#2f3336]">
            <span
              className={`block h-full rounded-full ${
                aiBlocked ? "bg-[#f4212e]" : aiWarning ? "bg-[#ffd400]" : "bg-[#1d9bf0]"
              }`}
              style={{ width: `${aiPct}%` }}
            />
          </div>
          <div className="mt-5 rounded-2xl border border-[#2f3336] bg-black/60 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#71767b]">
              {t(isHighestPlan ? "billing.commandCenter.highestPlanLabel" : "billing.commandCenter.recommendLabel")}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-[#e7e9ea]">
              {isHighestPlan
                ? t("billing.commandCenter.highestPlan")
                : t(planUpgradeCopyKey(nextPlanCode), { plan: nextPlanName })}
            </p>
            <Button
              type="button"
              className="mt-4 w-full"
              variant={isHighestPlan ? "outline" : "default"}
              onClick={onUpgrade}
            >
              {isHighestPlan ? t("billing.commandCenter.viewPlans") : t("actions.upgradeTo", { plan: nextPlanName })}
              <ArrowUpRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatusTile({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-3xl border border-[#2f3336] bg-[#0f1419]/82 p-4">
      <p className="text-xs text-[#71767b]">{label}</p>
      <p className="mt-2 truncate text-base font-semibold text-[#e7e9ea]">{value}</p>
      <p className="mt-1 text-xs text-[#71767b]">{helper}</p>
    </div>
  );
}

function PlanUsagePanel({ subscription, onUpgrade }: { subscription: CurrentSubscription | null; onUpgrade: () => void }) {
  const { t } = useT();
  if (!subscription) return null;

  const monthlyItems: Array<[string, number, number, LucideIcon]> = [
    ["billing.usage.items.aiGenerations", subscription.usage.aiGenerationsMonth, subscription.limits.aiGenerationsMonthly, Sparkles],
    ["billing.usage.items.autoPosts", subscription.usage.autoPostsMonth, subscription.limits.monthlyAutoPosts, Zap],
    ["billing.usage.items.autoReplies", subscription.usage.autoRepliesMonth, subscription.limits.monthlyAutoReplies, Zap],
    ["billing.usage.items.autoComments", subscription.usage.autoCommentsMonth, subscription.limits.monthlyAutoComments, Zap],
    ["billing.usage.items.reviewCapacity", subscription.usage.autoDMsMonth, subscription.limits.monthlyAutoDMs, ListChecks],
  ];
  const capabilityItems: Array<[string, string, LucideIcon]> = [
    ["billing.usage.capabilities.analytics", t("billing.usage.capabilities.analyticsValue", { days: subscription.limits.analyticsDays }), CalendarClock],
    ["billing.usage.capabilities.teamSeats", t("billing.usage.capabilities.teamSeatsValue", { count: subscription.limits.teamSeats }), Users],
    [
      "billing.usage.capabilities.contentMemory",
      t(subscription.limits.autoDMImport ? "billing.usage.capabilities.available" : "billing.usage.capabilities.locked"),
      Sparkles,
    ],
    [
      "billing.usage.capabilities.advanced",
      t(subscription.limits.advancedBotStrategy ? "billing.usage.capabilities.available" : "billing.usage.capabilities.locked"),
      Sparkles,
    ],
  ];

  return (
    <section className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
      <div className="surface-card bg-[#0f1419] p-5 md:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-white md:text-lg">{t("billing.usage.title")}</h3>
            <p className="text-sm text-[#71767b]">{t("billing.usage.description")}</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={onUpgrade}>
            {t("billing.usage.comparePlans")}
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {monthlyItems.map(([labelKey, used, limit, Icon]) => {
            const pct = usagePercent(used, limit);
            const isHot = pct >= 80;
            return (
              <div
                key={labelKey}
                className={`rounded-3xl border p-4 transition-colors ${
                  isHot ? "border-[#ffd400]/25 bg-[#ffd400]/10" : "border-[#2f3336] bg-black hover:bg-[#080808]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs text-[#71767b]">{t(labelKey)}</p>
                  <Icon className={`size-4 ${isHot ? "text-[#f6d96b]" : "text-[#1d9bf0]"}`} />
                </div>
                <p className="mt-2 text-lg font-semibold text-white">
                  {formatUsage(used)} <span className="text-sm font-normal text-[#71767b]">/ {formatUsage(limit)}</span>
                </p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#2f3336]">
                  <span className={`block h-full rounded-full ${isHot ? "bg-[#ffd400]" : "bg-[#1d9bf0]"}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="surface-card bg-[#0f1419] p-5 md:p-6">
        <h3 className="text-base font-semibold text-white md:text-lg">{t("billing.usage.capabilities.title")}</h3>
        <p className="mt-1 text-sm text-[#71767b]">{t("billing.usage.capabilities.description")}</p>
        <div className="mt-4 space-y-3">
          {capabilityItems.map(([labelKey, value, Icon]) => (
            <div key={labelKey} className="flex items-center gap-3 rounded-2xl border border-[#2f3336] bg-black p-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#1d9bf0]/10 text-[#1d9bf0]">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-xs text-[#71767b]">{t(labelKey)}</p>
                <p className="truncate text-sm font-medium text-[#e7e9ea]">{value}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 rounded-2xl border border-[#2f3336] bg-black/60 p-3 text-xs leading-relaxed text-[#71767b]">
          {t("billing.usage.capabilities.hint")}
        </p>
      </div>
    </section>
  );
}
