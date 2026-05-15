"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { broadcastDataSynced, broadcastPageRefreshRequest } from "@/lib/app-page-refresh";
import { broadcastDashboardRefresh } from "@/lib/dashboard-refresh";
import { billingService, type BillingCreateOrderResponse } from "@/services/billing.service";
import type { BillingCycle, PaymentMethodOption } from "@/types/billing";

const POLL_MS = 3000;

type BillingCheckoutDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentMethods: PaymentMethodOption[];
  planCode?: string;
  billingCycle?: BillingCycle;
  onPaid?: () => void;
};

export function BillingCheckoutDialog({
  open,
  onOpenChange,
  paymentMethods,
  planCode = "basic",
  billingCycle = "monthly",
  onPaid,
}: BillingCheckoutDialogProps) {
  const { t } = useT();
  const { pushToast } = useToast();
  const defaultNetwork = useMemo(() => {
    const d = paymentMethods.find((m) => m.isDefault);
    return (d ?? paymentMethods[0])?.networkCode ?? "BEP20";
  }, [paymentMethods]);
  const [selectedNetwork, setSelectedNetwork] = useState("");
  const [phase, setPhase] = useState<"pick" | "pay">("pick");
  const [created, setCreated] = useState<BillingCreateOrderResponse | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  const options = useMemo(() => paymentMethods.filter((m) => m.networkCode !== "TRC20"), [paymentMethods]);
  const selectedNetworkValue = selectedNetwork || defaultNetwork;

  const reset = useCallback(() => {
    setSelectedNetwork("");
    setPhase("pick");
    setCreated(null);
    setOrderId(null);
  }, []);

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        reset();
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, reset]
  );

  useEffect(() => {
    if (!open || !orderId || phase !== "pay") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const o = await billingService.getOrder(orderId);
        if (cancelled) return;
        if (o.status === "paid") {
          pushToast(t("billing.payment.successToast"));
          broadcastDashboardRefresh();
          broadcastPageRefreshRequest();
          broadcastDataSynced(Date.now());
          onPaid?.();
          onOpenChange(false);
        }
      } catch {
        /* transient network errors — next tick retries */
      }
    };
    void poll();
    const id = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [open, orderId, phase, onOpenChange, onPaid, pushToast, t]);

  const startPay = async () => {
    try {
      const order = await billingService.createOrder({
        plan_code: planCode,
        billing_cycle: billingCycle,
        method: "USDT",
        network: selectedNetworkValue,
      });
      setCreated(order);
      setOrderId(order.order_id);
      setPhase("pay");
    } catch (e) {
      const msg = e instanceof Error ? e.message : t("billing.checkout.createOrderFailed");
      pushToast(msg);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={handleOpenChange}
      title={t("billing.checkout.title")}
      description={phase === "pick" ? t("billing.checkout.pickNetwork") : t("billing.checkout.sendUsdt")}
      className="max-w-lg"
    >
      {phase === "pick" ? (
        <div className="space-y-3">
          <label className="block text-xs text-white/60">{t("billing.checkout.networkLabel")}</label>
          <select
            className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white"
            value={selectedNetworkValue}
            onChange={(e) => setSelectedNetwork(e.target.value)}
          >
            {options.map((m) => (
              <option key={m.networkCode} value={m.networkCode}>
                {m.networkCode}
                {m.isDefault ? ` (${t("billing.payment.defaultBadge")})` : ""}
              </option>
            ))}
          </select>
          <Button
            type="button"
            className="w-full bg-gradient-to-r from-blue-500 to-violet-500 text-white hover:opacity-90"
            onClick={() => void startPay()}
          >
            {t("billing.checkout.continue")}
          </Button>
        </div>
      ) : created ? (
        <div className="space-y-3 text-sm text-white/80">
          <p>
            <span className="text-white/50">{t("billing.checkout.amount")}:</span>{" "}
            <span className="font-medium text-white">
              {created.amount} {created.currency}
            </span>
          </p>
          <p className="break-all">
            <span className="text-white/50">{t("billing.payment.fields.token")}:</span>{" "}
            <span className="text-white">{created.token_address}</span>
          </p>
          <p className="break-all">
            <span className="text-white/50">{t("billing.payment.fields.address")}:</span>{" "}
            <span className="text-white">{created.receiver_address}</span>
          </p>
          <p className="text-xs text-amber-200/90">{t("billing.checkout.pollingHint")}</p>
        </div>
      ) : null}
    </Dialog>
  );
}
