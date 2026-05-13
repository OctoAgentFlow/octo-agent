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
import { billingService, type BillingOrderListItemApi } from "@/services/billing.service";
import type {
  BillingOpsAction,
  BillingOpsSummary,
  BillingOrderFilterState,
  BillingReconciliationStatus,
  BillingReviewStatus,
  CurrentSubscription,
  PaymentMethodOption,
  PaymentRecord,
  PaymentStatus,
  Plan,
} from "@/types/billing";

type LoadState = "loading" | "ready" | "error";

function mapPlanKey(code: string) {
  if (code === "free_trial") return "billing.plan.freeTrial";
  if (code === "basic_monthly" || code === "basic") return "billing.plan.basic";
  return "billing.plan.basic";
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

function formatOrderDate(order: BillingOrderListItemApi) {
  const raw = order.paid_at || order.created_at;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw || "—";
  return date.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
}

function mapPaymentRecord(order: BillingOrderListItemApi): PaymentRecord {
  return {
    id: order.order_id,
    userId: order.user_id,
    date: formatOrderDate(order),
    planKey: mapPlanKey(order.plan_code),
    amount: `${order.amount} ${order.currency}`,
    methodKey: "billing.payment.method.usdt",
    network: order.network,
    status: mapOrderStatus(order.status),
    txHash: order.tx_hash || "",
    failureReason: order.failure_reason || "",
    lastCheckedAt: order.last_checked_at || "",
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
  const { pushToast } = useToast();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<CurrentSubscription | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodOption[]>([]);
  const [paymentRecords, setPaymentRecords] = useState<PaymentRecord[]>([]);
  const [opsSummary, setOpsSummary] = useState<BillingOpsSummary>(emptyOpsSummary);
  const [canOperateBilling, setCanOperateBilling] = useState(false);
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

        setSubscription({
          planKey: mapPlanKey(subscriptionData.plan),
          expirationDate: subscriptionData.expiration_date,
          remainingTrialDays: subscriptionData.trial_days_left,
          statusKey: mapSubscriptionStatusKey(subscriptionData.status),
        });
        setPlans(
          plansData.items.map((item) => ({
            nameKey: mapPlanKey(item.code),
            price: item.price,
            periodKey: item.period === "14 days" ? "billing.plan.period.fourteenDays" : "billing.plan.period.month",
            descriptionKey:
              item.code === "free_trial" ? "billing.plan.freeTrial.description" : "billing.plan.basic.description",
            featureKeys:
              item.code === "free_trial"
                ? [
                    "billing.plan.features.autoPost",
                    "billing.plan.features.autoReply",
                    "billing.plan.features.basicAutoDm",
                    "billing.plan.features.communitySupport",
                  ]
                : [
                    "billing.plan.features.allAutomations",
                    "billing.plan.features.unlimitedRuns",
                    "billing.plan.features.priorityQueue",
                    "billing.plan.features.advancedAnalytics",
                  ],
            highlight: item.highlight,
          }))
        );
        setPaymentMethods(mapPaymentMethods(methodsData.items));
        setPaymentRecords(ordersData.items.map(mapPaymentRecord));
        setOpsSummary(ordersData.ops_summary || emptyOpsSummary);
        setCanOperateBilling(Boolean(ordersData.can_operate_billing));
        setLoadState("ready");
        broadcastDataSynced(Date.now());
      } catch (error) {
        const msg = axios.isAxiosError(error)
          ? error.response?.data?.message || "Failed to load billing data."
          : "Failed to load billing data.";
        setErrorMessage(msg);
        if (!quiet) {
          setLoadState("error");
        } else {
          pushToast(msg);
        }
      }
    },
    [paymentFilters, pushToast]
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
          pushToast("Payment confirmed. Subscription is active.");
        } else {
          pushToast("Order check completed.");
        }
        await fetchBilling({ quiet: true });
      } catch (error) {
        const msg = axios.isAxiosError(error)
          ? error.response?.data?.message || "Failed to confirm this transaction."
          : "Failed to confirm this transaction.";
        pushToast(msg);
        await fetchBilling({ quiet: true });
        throw new Error(msg);
      }
    },
    [fetchBilling, pushToast]
  );

  const updateBillingOps = useCallback(
    async (orderId: string, action: BillingOpsAction, payload?: { opsNote?: string }) => {
      try {
        await billingService.orderOpsAction(orderId, {
          action,
          ops_note: payload?.opsNote,
        });
        pushToast("Billing order updated.");
        await fetchBilling({ quiet: true });
      } catch (error) {
        const msg = axios.isAxiosError(error)
          ? error.response?.data?.message || "Failed to update billing order."
          : "Failed to update billing order.";
        pushToast(msg);
        throw new Error(msg);
      }
    },
    [fetchBilling, pushToast]
  );

  if (loadState === "loading") {
    return (
      <Card>
        <CardHeader title="Loading billing data..." description="Fetching subscription, plans and payment methods." />
      </Card>
    );
  }

  if (loadState === "error") {
    return (
      <Card>
        <CardHeader title="Failed to load billing data" description={errorMessage || "Please retry."} />
        <div className="flex justify-end">
          <Button onClick={() => void fetchBilling()}>Retry</Button>
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
      canOperateBilling={canOperateBilling}
      filters={paymentFilters}
      onFiltersChange={setPaymentFilters}
      onConfirmTx={confirmOrderTx}
      onOpsAction={updateBillingOps}
      onPaymentConfirmed={() => void fetchBilling({ quiet: true })}
    />
  );
}
