"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";

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

  const options = paymentMethods;
  const selectedNetworkValue = selectedNetwork || defaultNetwork;
  const selectedMethod = useMemo(
    () => paymentMethods.find((m) => m.networkCode === selectedNetworkValue) ?? paymentMethods[0],
    [paymentMethods, selectedNetworkValue]
  );
  const createdMethod = useMemo(
    () => paymentMethods.find((m) => m.networkCode === created?.network) ?? selectedMethod,
    [created?.network, paymentMethods, selectedMethod]
  );

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

  const copyText = async (value: string, toastKey = "billing.checkout.copied") => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      pushToast(t(toastKey));
    } catch {
      pushToast(t("billing.checkout.copyFailed"));
    }
  };

  const qrURL = created?.receiver_address
    ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(created.receiver_address)}`
    : "";

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
          <div className="grid gap-2 sm:grid-cols-3">
            {options.map((m) => (
              <button
                key={m.networkCode}
                type="button"
                className={`rounded-2xl border p-3 text-left transition ${
                  selectedNetworkValue === m.networkCode
                    ? "border-[#1d9bf0] bg-[#1d9bf0]/12"
                    : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
                }`}
                onClick={() => setSelectedNetwork(m.networkCode)}
              >
                <span className="block text-sm font-semibold text-white">{t(m.networkKey)}</span>
                <span className="mt-1 block text-xs text-white/50">
                  {m.isDefault ? t("billing.payment.defaultBadge") : t("billing.checkout.availableNetwork")}
                </span>
              </button>
            ))}
          </div>
          {selectedMethod ? (
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-white/65">
              <p className="break-all">
                <span className="text-white/45">{t("billing.payment.fields.address")}:</span>{" "}
                <span className="text-white">{selectedMethod.receiverAddress}</span>
              </p>
              <p className="mt-1 break-all">
                <span className="text-white/45">{t("billing.payment.fields.token")}:</span>{" "}
                <span className="text-white">{selectedMethod.tokenAddress}</span>
              </p>
              {selectedMethod.networkCode === "TRC20" ? (
                <p className="mt-2 text-amber-200/90">{t("billing.checkout.tronReviewHint")}</p>
              ) : null}
            </div>
          ) : null}
          <Button
            type="button"
            className="w-full bg-gradient-to-r from-blue-500 to-violet-500 text-white hover:opacity-90"
            onClick={() => void startPay()}
          >
            {t("billing.checkout.continue")}
          </Button>
        </div>
      ) : created ? (
        <div className="space-y-4 text-sm text-white/80">
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <div className="rounded-2xl border border-white/10 bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrURL}
                alt={t("billing.checkout.qrAlt")}
                className="aspect-square w-full rounded-xl object-contain"
              />
            </div>
            <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-3">
              <p>
                <span className="text-white/50">{t("billing.checkout.amount")}:</span>{" "}
                <span className="font-medium text-white">
                  {created.amount} {created.currency}
                </span>
              </p>
              <p>
                <span className="text-white/50">{t("billing.payment.fields.network")}:</span>{" "}
                <span className="font-medium text-white">{createdMethod ? t(createdMethod.networkKey) : created.network}</span>
              </p>
              <CopyField
                label={t("billing.payment.fields.address")}
                value={created.receiver_address}
                copyLabel={t("billing.checkout.copy")}
                onCopy={() => void copyText(created.receiver_address)}
              />
              <CopyField
                label={t("billing.payment.fields.token")}
                value={created.token_address}
                copyLabel={t("billing.checkout.copy")}
                onCopy={() => void copyText(created.token_address)}
              />
            </div>
          </div>
          <p className="text-xs text-white/55">{t("billing.checkout.qrHint")}</p>
          <p className="text-xs text-amber-200/90">
            {created.network === "TRC20" ? t("billing.checkout.tronPollingHint") : t("billing.checkout.pollingHint")}
          </p>
        </div>
      ) : null}
    </Dialog>
  );
}

function CopyField({ label, value, copyLabel, onCopy }: { label: string; value: string; copyLabel: string; onCopy: () => void }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-white/50">{label}</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-1 text-xs text-white/65 hover:bg-white/10 hover:text-white"
          onClick={onCopy}
        >
          <Copy className="size-3" />
          <span>{copyLabel}</span>
        </button>
      </div>
      <p className="break-all font-mono text-xs leading-relaxed text-white">{value}</p>
    </div>
  );
}
