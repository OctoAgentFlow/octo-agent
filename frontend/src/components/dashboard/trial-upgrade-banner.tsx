"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { BillingCheckoutDialog } from "@/components/billing/billing-checkout-dialog";
import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";
import { broadcastDataSynced, subscribePageRefreshRequest } from "@/lib/app-page-refresh";
import { mapPaymentMethods } from "@/lib/billing-payment-methods";
import { formatDateOnly, usePreferredTimeZone } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { billingService, type BillingSubscriptionApi } from "@/services/billing.service";
import type { DashboardOverview } from "@/services/dashboard.service";
import type { PaymentMethodOption } from "@/types/billing";

import { SectionCard } from "./section-card";

type TrialUpgradeBannerProps = {
  overview?: DashboardOverview | null;
};

type PlanCode = "free_trial" | "basic" | "plus" | "pro" | "pro_plus";

const planOrder: PlanCode[] = ["free_trial", "basic", "plus", "pro", "pro_plus"];

function normalizePlan(plan?: string): PlanCode {
  const p = (plan || "free_trial").trim().toLowerCase();
  if (p === "basic" || p === "basic_monthly" || p === "basic_yearly") return "basic";
  if (p === "plus" || p === "plus_monthly" || p === "plus_yearly") return "plus";
  if (p === "pro" || p === "pro_monthly" || p === "pro_yearly") return "pro";
  if (p === "pro_plus" || p === "pro+" || p === "pro_plus_monthly" || p === "pro_plus_yearly") return "pro_plus";
  return "free_trial";
}

function nextPlan(plan: PlanCode): PlanCode | null {
  const idx = planOrder.indexOf(plan);
  if (idx < 0 || idx >= planOrder.length - 1) return null;
  return planOrder[idx + 1];
}

function planLabel(plan: PlanCode) {
  if (plan === "free_trial") return "dashboard.subscription.plan.freeTrial";
  if (plan === "pro_plus") return "dashboard.subscription.plan.proPlus";
  return `dashboard.subscription.plan.${plan}`;
}

function recommendationKey(plan: PlanCode) {
  if (plan === "free_trial") return "dashboard.subscription.recommendBasic";
  if (plan === "basic") return "dashboard.subscription.recommendPlus";
  if (plan === "plus") return "dashboard.subscription.recommendPro";
  if (plan === "pro") return "dashboard.subscription.recommendProPlus";
  return "dashboard.subscription.highestPlan";
}

function formatDate(raw: string | undefined, timeZone: string) {
  if (!raw) return "";
  return formatDateOnly(raw, timeZone, { year: "numeric", month: "short", day: "numeric" });
}

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value);
}

function usagePct(used: number, limit: number) {
  if (limit <= 0) return 0;
  return Math.min(100, Math.round((used / limit) * 100));
}

function UsageRow({ label, used, limit, locale }: { label: string; used: number; limit: number; locale: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#2f3336] bg-black px-3 py-2.5">
      <span className="text-sm text-[#71767b]">{label}</span>
      <span className="shrink-0 text-sm font-semibold text-[#e7e9ea]">
        {formatNumber(used, locale)} / {formatNumber(limit, locale)}
      </span>
    </div>
  );
}

export function TrialUpgradeBanner({ overview }: TrialUpgradeBannerProps) {
  const { t, lang } = useT();
  const timeZone = usePreferredTimeZone();
  const router = useRouter();
  const { pushToast } = useToast();
  const [subscription, setSubscription] = useState<BillingSubscriptionApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(false);

  const loadSubscription = useCallback(async () => {
    setLoading(true);
    try {
      const data = await billingService.subscription();
      setSubscription(data);
      broadcastDataSynced(Date.now());
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || t("dashboard.subscription.loadFailed")
        : t("dashboard.subscription.loadFailed");
      pushToast(message);
    } finally {
      setLoading(false);
    }
  }, [pushToast, t]);

  useEffect(() => {
    void loadSubscription();
  }, [loadSubscription]);

  useEffect(() => {
    return subscribePageRefreshRequest(() => {
      void loadSubscription();
    });
  }, [loadSubscription]);

  const plan = normalizePlan(subscription?.plan || overview?.plan);
  const targetPlan = nextPlan(plan);
  const isHighestPlan = !targetPlan;
  const usedBots = subscription?.usage.oaf_bots ?? 0;
  const maxBots = subscription?.limits.max_bots ?? 1;
  const usedAccounts = subscription?.usage.twitter_accounts ?? overview?.connected_x_count ?? 0;
  const maxAccounts = subscription?.limits.max_twitter_accounts ?? 1;
  const usedAI = subscription?.usage.ai_generations_month ?? 0;
  const maxAI = subscription?.limits.ai_generations_monthly ?? 1000;
  const aiPct = usagePct(usedAI, maxAI);
  const aiBlocked = aiPct >= 100;
  const aiWarning = aiPct >= 80;
  const remainingAI = Math.max(0, maxAI - usedAI);
  const cycleKey = subscription?.billing_cycle === "yearly" ? "dashboard.subscription.yearly" : "dashboard.subscription.monthly";
  const trialDaysLeft = subscription?.trial_days_left ?? overview?.trial_days_left ?? 0;

  const openCheckout = async () => {
    if (isHighestPlan || !targetPlan) {
      router.push("/billing");
      return;
    }

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

  const planLine = useMemo(() => {
    if (plan === "free_trial") {
      return `${t("dashboard.subscription.trial")} · ${t("dashboard.subscription.daysLeft", { days: trialDaysLeft })}`;
    }
    const expiry = formatDate(subscription?.expiration_date, timeZone);
    const suffix = expiry ? ` · ${t("dashboard.subscription.expiresAt", { date: expiry })}` : "";
    return `${t("dashboard.subscription.currentPlan")}: ${t(planLabel(plan))} · ${t(cycleKey)}${suffix}`;
  }, [cycleKey, plan, subscription?.expiration_date, t, timeZone, trialDaysLeft]);

  return (
    <SectionCard title={t("dashboard.subscription.title")} description={t("dashboard.subscription.subtitle")}>
      <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="inline-flex items-center gap-2 text-sm text-[#1d9bf0]">
              <CheckCircle2 className="size-4" />
              {loading ? t("dashboard.subscription.loading") : planLine}
            </p>
            <h4 className="text-lg font-bold text-[#e7e9ea]">{t("dashboard.subscription.quotaTitle")}</h4>
          </div>
          <Button
            type="button"
            disabled={loading || loadingMethods}
            onClick={() => void openCheckout()}
          >
            {loadingMethods
              ? t("dashboard.upgrade.loadingPayment")
              : isHighestPlan
                ? t("dashboard.subscription.viewBilling")
                : t("dashboard.subscription.upgradeTo", { plan: t(planLabel(targetPlan ?? "basic")) })}
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          <UsageRow label={t("dashboard.subscription.oafBots")} used={usedBots} limit={maxBots} locale={lang} />
          <UsageRow label={t("dashboard.subscription.xAccounts")} used={usedAccounts} limit={maxAccounts} locale={lang} />
          <UsageRow label={t("dashboard.subscription.aiGenerations")} used={usedAI} limit={maxAI} locale={lang} />
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-xs text-[#71767b]">
            <span>{t("dashboard.subscription.aiGenerations")}</span>
            <span>{t("dashboard.subscription.remaining", { count: formatNumber(remainingAI, lang) })}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#2f3336]">
            <span
              className={cn(
                "block h-full rounded-full",
                aiBlocked ? "bg-red-300" : aiWarning ? "bg-amber-300" : "bg-[#1d9bf0]"
              )}
              style={{ width: `${aiPct}%` }}
            />
          </div>
        </div>

        {aiWarning ? (
          <div
            className={cn(
              "mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
              aiBlocked
                ? "border-red-300/25 bg-red-500/10 text-red-100"
                : "border-amber-300/25 bg-amber-400/10 text-amber-100"
            )}
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{t(aiBlocked ? "dashboard.subscription.quotaExceeded" : "dashboard.subscription.usageWarning")}</span>
          </div>
        ) : null}

        <div className="mt-4 rounded-2xl border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 p-3">
          <p className="text-sm font-semibold text-[#e7e9ea]">
            {isHighestPlan ? t("dashboard.subscription.highestPlan") : t("dashboard.subscription.recommendTitle", { plan: t(planLabel(targetPlan ?? "basic")) })}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[#e7e9ea]/70">{t(recommendationKey(plan))}</p>
        </div>
      </div>

      <BillingCheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        paymentMethods={paymentMethods}
        planCode={targetPlan || "basic"}
      />
    </SectionCard>
  );
}
