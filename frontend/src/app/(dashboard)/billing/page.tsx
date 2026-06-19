"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

import { BillingPageContent } from "@/components/billing/billing-page-content";
import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import {
  broadcastDataSynced,
  broadcastPageRefreshComplete,
  subscribePageRefreshRequest,
} from "@/lib/app-page-refresh";
import { mapPaymentMethods } from "@/lib/billing-payment-methods";
import { formatDateOnly, usePreferredTimeZone } from "@/lib/timezone";
import { billingService, type BillingOrderListItemApi } from "@/services/billing.service";
import { useT } from "@/i18n/use-t";
import type { BillingPlanApi, BillingSubscriptionApi, PlanLimitsApi, PlanUsageApi } from "@/services/billing.service";
import type {
  BillingOpsSummary,
  BillingOrderFilterState,
  BillingReconciliationStatus,
  BillingReviewStatus,
  CurrentSubscription,
  PaymentMethodOption,
  PaymentRecord,
  PaymentStatus,
  Plan,
  PlanLimits,
  PlanUsage,
} from "@/types/billing";

type LoadState = "loading" | "ready" | "error";

function mapPlanKey(code: string) {
  if (code === "free_trial") return "billing.plan.freeTrial";
  if (code === "basic_monthly" || code === "basic") return "billing.plan.basic";
  if (code === "plus") return "Growth";
  if (code === "pro") return "Operator";
  if (code === "pro_plus") return "Agency";
  return "billing.plan.basic";
}

function mapPlanName(code: string) {
  if (code === "free_trial") return "Free";
  if (code === "basic_monthly" || code === "basic") return "Starter";
  if (code === "plus") return "Growth";
  if (code === "pro") return "Operator";
  if (code === "pro_plus") return "Agency";
  return code || "Starter";
}

function mapSubscriptionStatusKey(status: string) {
  if (status === "active") return "billing.subscription.status.active";
  if (status === "expired") return "billing.subscription.status.expired";
  return "billing.subscription.status.active";
}

function mapOrderStatus(status: string): PaymentStatus {
  const s = status.trim().toLowerCase();
  if (s === "paid" || s === "pending" || s === "expired") return s;
  return "failed";
}

function mapReconciliationStatus(status: string): BillingReconciliationStatus {
  const s = status.trim().toLowerCase();
  if (s === "matched" || s === "mismatch" || s === "needs_review") return s;
  return "unchecked";
}

function mapReviewStatus(status: string): BillingReviewStatus {
  const s = status.trim().toLowerCase();
  if (s === "review_needed" || s === "reviewed") return s;
  return "unreviewed";
}

function orderQueryFromFilters(filters: BillingOrderFilterState) {
  return {
    status: filters.status === "all" ? undefined : filters.status,
    review_status: filters.reviewStatus === "all" ? undefined : filters.reviewStatus,
    scope: filters.scope,
    limit: 50,
  };
}

function formatOrderDate(order: BillingOrderListItemApi, timeZone: string) {
  const raw = order.paid_at || order.created_at;
  return formatDateOnly(raw, timeZone);
}

function mapPaymentRecord(order: BillingOrderListItemApi, timeZone: string): PaymentRecord {
  return {
    id: order.order_id,
    userId: order.user_id,
    date: formatOrderDate(order, timeZone),
    planKey: mapPlanKey(order.plan_code),
    amount: `${order.payable_amount || order.amount} ${order.currency}`,
    originalAmount: order.original_amount || "",
    creditAmount: order.credit_amount || "",
    pointDiscountAmount: order.point_discount_amount || "",
    pointsUsed: order.points_used || 0,
    payableAmount: order.payable_amount || order.amount,
    orderType: order.order_type || "new",
    currency: order.currency,
    methodKey: "billing.payment.method.usdt",
    network: order.network,
    status: mapOrderStatus(order.status),
    txHash: order.tx_hash || "",
    failureReason: order.failure_reason || "",
    lastCheckedAt: order.last_checked_at || "",
    autoScanStatus: order.auto_scan_status || "",
    autoScanSkipReason: order.auto_scan_skip_reason || "",
    autoScannedAt: order.auto_scanned_at || "",
    canRetry: Boolean(order.can_retry),
    nextAction: order.next_action || "",
    reconciliationStatus: mapReconciliationStatus(order.reconciliation_status || ""),
    reviewStatus: mapReviewStatus(order.review_status || ""),
    reviewedAt: order.reviewed_at || "",
    opsNote: order.ops_note || "",
    lastAuditAction: order.last_audit_action || "",
    lastAuditAt: order.last_audit_at || "",
    lastAuditOperatorId: order.last_audit_operator_id || 0,
  };
}

function mapLimits(item: PlanLimitsApi): PlanLimits {
  const monthlyContentDrafts = item.monthly_content_drafts ?? item.monthly_auto_posts;
  const monthlyReplyDrafts = item.monthly_reply_drafts ?? item.monthly_auto_replies;
  const monthlyOpportunityDrafts = item.monthly_opportunity_drafts ?? item.monthly_auto_comments;
  const monthlyReviewCapacity = item.monthly_review_capacity ?? item.monthly_auto_dms;
  const contentMemorySources = item.content_memory_sources ?? item.auto_comment_targets;
  const monthlyRadarRefreshes = item.monthly_radar_refreshes ?? item.monthly_auto_comment_scans;
  const dailyContentDrafts = item.daily_content_drafts ?? item.daily_auto_posts;
  const dailyReplyDrafts = item.daily_reply_drafts ?? item.daily_auto_replies;
  const dailyOpportunityDrafts = item.daily_opportunity_drafts ?? item.daily_auto_comments;
  const dailyReviewCapacity = item.daily_review_capacity ?? item.daily_auto_dms;

  return {
    maxBots: item.max_bots,
    maxTwitterAccounts: item.max_twitter_accounts,
    aiGenerationsMonthly: item.ai_generations_monthly,
    monthlyXWrites: item.monthly_x_writes,
    monthlyXUrlPosts: item.monthly_x_url_posts,
    monthlyCostCapCents: item.monthly_cost_cap_cents,
    monthlyContentDrafts,
    monthlyReplyDrafts,
    monthlyOpportunityDrafts,
    monthlyReviewCapacity,
    contentMemorySources,
    monthlyRadarRefreshes,
    dailyContentDrafts,
    dailyReplyDrafts,
    dailyOpportunityDrafts,
    dailyReviewCapacity,
    monthlyAutoPosts: monthlyContentDrafts,
    monthlyAutoReplies: monthlyReplyDrafts,
    monthlyAutoComments: monthlyOpportunityDrafts,
    monthlyAutoDMs: monthlyReviewCapacity,
    autoCommentTargets: contentMemorySources,
    monthlyAutoCommentScans: monthlyRadarRefreshes,
    dailyAutoPosts: dailyContentDrafts,
    dailyAutoReplies: dailyReplyDrafts,
    dailyAutoComments: dailyOpportunityDrafts,
    dailyAutoDMs: dailyReviewCapacity,
    analyticsDays: item.analytics_days,
    teamSeats: item.team_seats,
    fullPersonaFields: item.full_persona_fields,
    autoDMImport: item.auto_dm_import,
    advancedBotStrategy: item.advanced_bot_strategy,
    bulkReview: item.bulk_review,
    botPerformance: item.bot_performance,
    dataExport: item.data_export,
    multiBotMatrix: item.multi_bot_matrix,
    abTesting: item.ab_testing,
    advancedFlowBuilder: item.advanced_flow_builder,
    advancedRiskRules: item.advanced_risk_rules,
    prioritySupport: item.priority_support,
  };
}

function mapUsage(item: PlanUsageApi): PlanUsage {
  const contentDraftsMonth = item.content_drafts_month ?? item.auto_posts_month;
  const replyDraftsMonth = item.reply_drafts_month ?? item.auto_replies_month;
  const opportunityDraftsMonth = item.opportunity_drafts_month ?? item.auto_comments_month;
  const reviewCapacityMonth = item.review_capacity_month ?? item.auto_dms_month;
  const contentDraftsToday = item.content_drafts_today ?? item.auto_posts_today;
  const replyDraftsToday = item.reply_drafts_today ?? item.auto_replies_today;
  const opportunityDraftsToday = item.opportunity_drafts_today ?? item.auto_comments_today;
  const reviewCapacityToday = item.review_capacity_today ?? item.auto_dms_today;

  return {
    oafBots: item.oaf_bots,
    twitterAccounts: item.twitter_accounts,
    aiGenerationsMonth: item.ai_generations_month,
    contentDraftsMonth,
    replyDraftsMonth,
    opportunityDraftsMonth,
    reviewCapacityMonth,
    autoPostsMonth: contentDraftsMonth,
    autoRepliesMonth: replyDraftsMonth,
    autoCommentsMonth: opportunityDraftsMonth,
    autoDMsMonth: reviewCapacityMonth,
    contentDraftsToday,
    replyDraftsToday,
    opportunityDraftsToday,
    reviewCapacityToday,
    autoPostsToday: contentDraftsToday,
    autoRepliesToday: replyDraftsToday,
    autoCommentsToday: opportunityDraftsToday,
    autoDMsToday: reviewCapacityToday,
  };
}

function mapPlan(item: BillingPlanApi): Plan {
  return {
    code: item.code,
    name: item.name,
    monthlyPrice: item.monthly_price,
    yearlyPrice: item.yearly_price,
    currency: item.currency,
    audience: item.audience,
    badge: item.badge,
    description: item.description,
    features: item.features,
    featureFlags: (item.feature_flags || []).map((feature) => ({
      key: feature.key,
      label: feature.label,
      available: feature.available,
      minPlan: feature.min_plan,
    })),
    limits: mapLimits(item.limits),
    highlight: item.highlight,
  };
}

function mapSubscription(item: BillingSubscriptionApi): CurrentSubscription {
  return {
    plan: item.plan,
    planName: mapPlanName(item.plan),
    billingCycle: item.billing_cycle === "yearly" ? "yearly" : "monthly",
    expirationDate: item.expiration_date,
    remainingTrialDays: item.trial_days_left,
    statusKey: mapSubscriptionStatusKey(item.status),
    limits: mapLimits(item.limits),
    usage: mapUsage(item.usage),
  };
}

const emptyOpsSummary: BillingOpsSummary = {
  total: 0,
  pending: 0,
  paid: 0,
  failed: 0,
  expired: 0,
  unchecked: 0,
  matched: 0,
  mismatch: 0,
  needs_review: 0,
  review_needed: 0,
  reviewed: 0,
};

export default function BillingPage() {
  const { t } = useT();
  const timeZone = usePreferredTimeZone();
  const { pushToast } = useToast();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<CurrentSubscription | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
  const [opsSummary, setOpsSummary] = useState<BillingOpsSummary>(emptyOpsSummary);
  const [paymentFilters, setPaymentFilters] = useState<BillingOrderFilterState>({
    status: "all",
    reviewStatus: "all",
    scope: "own",
  });

  const fetchBilling = useCallback(
    async (options?: { quiet?: boolean }) => {
      const quiet = Boolean(options?.quiet);
      if (!quiet) {
        setLoadState("loading");
      }
      setErrorMessage(null);
      try {
        const [subscriptionData, plansData, methodsData, ordersData] = await Promise.all([
          billingService.subscription(),
          billingService.plans(),
          billingService.paymentMethods(),
          billingService.orders(orderQueryFromFilters(paymentFilters)),
        ]);

        setSubscription(mapSubscription(subscriptionData));
        setPlans(plansData.items.map(mapPlan));
        setPaymentMethods(mapPaymentMethods(methodsData.items));
        setPaymentRecords(ordersData.items.map((item) => mapPaymentRecord(item, timeZone)));
        setOpsSummary(ordersData.ops_summary || emptyOpsSummary);
        setLoadState("ready");
        broadcastDataSynced(Date.now());
      } catch (error) {
        const msg = axios.isAxiosError(error)
          ? error.response?.data?.message || t("billing.errors.load")
          : t("billing.errors.load");
        setErrorMessage(msg);
        if (!quiet) {
          setLoadState("error");
        } else {
          pushToast(msg);
        }
      }
    },
    [paymentFilters, pushToast, t, timeZone]
  );

  useEffect(() => {
    void fetchBilling();
  }, [fetchBilling]);

  useEffect(() => {
    return subscribePageRefreshRequest(() => {
      void (async () => {
        try {
          await fetchBilling({ quiet: true });
        } finally {
          broadcastPageRefreshComplete();
        }
      })();
    });
  }, [fetchBilling]);

  const confirmOrderTx = useCallback(
    async (orderId: string, txHash: string) => {
      try {
        const updated = await billingService.confirmOrder(orderId, txHash);
        if (updated.status === "paid") {
          pushToast(t("billing.toast.paymentConfirmed"));
        } else {
          pushToast(t("billing.toast.orderChecked"));
        }
        await fetchBilling({ quiet: true });
      } catch (error) {
        const msg = axios.isAxiosError(error)
          ? error.response?.data?.message || t("billing.errors.confirmTx")
          : t("billing.errors.confirmTx");
        pushToast(msg);
        await fetchBilling({ quiet: true });
        throw new Error(msg);
      }
    },
    [fetchBilling, pushToast, t]
  );

  if (loadState === "loading") {
    return (
      <Card>
        <CardHeader title={t("billing.loading.title")} description={t("billing.loading.description")} />
      </Card>
    );
  }

  if (loadState === "error") {
    return (
      <Card>
        <CardHeader title={t("billing.error.title")} description={errorMessage || t("common.retryHint")} />
        <div className="flex justify-end">
          <Button onClick={() => void fetchBilling()}>{t("common.retry")}</Button>
        </div>
      </Card>
    );
  }

  return (
    <BillingPageContent
      subscription={subscription}
      plans={plans}
      paymentMethods={paymentMethods}
      paymentRecords={paymentRecords}
      opsSummary={opsSummary}
      filters={paymentFilters}
      onFiltersChange={setPaymentFilters}
      onConfirmTx={confirmOrderTx}
      onPaymentConfirmed={() => void fetchBilling({ quiet: true })}
    />
  );
}
