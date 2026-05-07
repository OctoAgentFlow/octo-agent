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
import { billingService, type BillingOrderListItemApi, type BillingPaymentMethodApi } from "@/services/billing.service";
import type {
  BillingOpsAction,
  BillingOpsSummary,
  BillingOrderFilterState,
  BillingReconciliationStatus,
  BillingRefundStatus,
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

function maskAddr(addr: string) {
  const s = addr.trim();
  if (s.length <= 14) return s;
  return `${s.slice(0, 8)}…${s.slice(-6)}`;
}

function networkKeyForApi(network: string) {
  const n = network.trim().toUpperCase();
  if (n === "BEP20") return "billing.payment.network.bep20";
  if (n === "ERC20") return "billing.payment.network.erc20";
  return "billing.payment.network.trc20";
}

function mapPaymentMethods(items: BillingPaymentMethodApi[]): PaymentMethodOption[] {
  return items.map((m) => ({
    methodKey: "billing.payment.method.usdt",
    networkKey: networkKeyForApi(m.network),
    networkCode: m.network.trim().toUpperCase(),
    receiverMasked: maskAddr(m.receiver_address),
    tokenMasked: maskAddr(m.token_address),
    chainId: m.chain_id,
    note: m.note,
    isDefault: m.is_default,
  }));
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

function mapRefundStatus(status: string): BillingRefundStatus {
  const s = status.trim().toLowerCase();
  if (s === "requested" || s === "refunded" || s === "rejected") return s;
  return "none";
}

function orderQueryFromFilters(filters: BillingOrderFilterState) {
  return {
    status: filters.status === "all" ? undefined : filters.status,
    review_status: filters.reviewStatus === "all" ? undefined : filters.reviewStatus,
    refund_status: filters.refundStatus === "all" ? undefined : filters.refundStatus,
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
    refundStatus: mapRefundStatus(order.refund_status || ""),
    refundReason: order.refund_reason || "",
    reviewedAt: order.reviewed_at || "",
    refundMarkedAt: order.refund_marked_at || "",
    opsNote: order.ops_note || "",
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
  refund_none: 0,
  refund_requested: 0,
  refunded: 0,
  refund_rejected: 0,
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
  const [paymentFilters, setPaymentFilters] = useState<BillingOrderFilterState>({
    status: "all",
    reviewStatus: "all",
    refundStatus: "all",
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
            periodKey: item.period === "7 days" ? "billing.plan.period.sevenDays" : "billing.plan.period.month",
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
    async (orderId: string, action: BillingOpsAction, payload?: { refundReason?: string; opsNote?: string }) => {
      try {
        await billingService.orderOpsAction(orderId, {
          action,
          refund_reason: payload?.refundReason,
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
      filters={paymentFilters}
      onFiltersChange={setPaymentFilters}
      onConfirmTx={confirmOrderTx}
      onOpsAction={updateBillingOps}
      onPaymentConfirmed={() => void fetchBilling({ quiet: true })}
    />
  );
}
