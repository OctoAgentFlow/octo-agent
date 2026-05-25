"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, QrCode, WalletCards } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { broadcastDataSynced, broadcastPageRefreshRequest } from "@/lib/app-page-refresh";
import { broadcastDashboardRefresh } from "@/lib/dashboard-refresh";
import { billingService, type BillingCreateOrderResponse, type BillingUpgradeQuoteApi } from "@/services/billing.service";
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

function methodDescriptionKey(networkCode: string) {
  if (networkCode === "BEP20") return "billing.payment.networkSummary.bep20";
  if (networkCode === "ERC20") return "billing.payment.networkSummary.erc20";
  return "billing.payment.networkSummary.trc20";
}

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
  const [quote, setQuote] = useState<BillingUpgradeQuoteApi | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [confirmTxHash, setConfirmTxHash] = useState("");
  const [confirmingTx, setConfirmingTx] = useState(false);
  const [confirmTxError, setConfirmTxError] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState("");

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
    setQuote(null);
    setQuoteError("");
    setConfirmTxHash("");
    setConfirmTxError("");
    setConfirmingTx(false);
    setIdempotencyKey("");
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
    if (!open || phase !== "pick") return;
    let cancelled = false;
    const loadQuote = async () => {
      setQuoteLoading(true);
      setQuoteError("");
      try {
        const nextQuote = await billingService.quote({
          plan_code: planCode,
          billing_cycle: billingCycle,
        });
        if (!cancelled) {
          setQuote(nextQuote);
        }
      } catch (error) {
        if (!cancelled) {
          setQuote(null);
          setQuoteError(error instanceof Error ? error.message : t("billing.checkout.quoteFailed"));
        }
      } finally {
        if (!cancelled) {
          setQuoteLoading(false);
        }
      }
    };
    void loadQuote();
    return () => {
      cancelled = true;
    };
  }, [billingCycle, open, phase, planCode, t]);

  const handlePaid = useCallback(() => {
    pushToast(t("billing.payment.successToast"));
    broadcastDashboardRefresh();
    broadcastPageRefreshRequest();
    broadcastDataSynced(Date.now());
    onPaid?.();
    onOpenChange(false);
  }, [onOpenChange, onPaid, pushToast, t]);

  useEffect(() => {
    if (!open || !orderId || phase !== "pay") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const o = await billingService.getOrder(orderId);
        if (cancelled) return;
        if (o.status === "paid") {
          handlePaid();
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
  }, [handlePaid, open, orderId, phase]);

  const startPay = async () => {
    try {
      const nextIdempotencyKey =
        idempotencyKey ||
        `checkout:${planCode}:${billingCycle}:${selectedNetworkValue}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      setIdempotencyKey(nextIdempotencyKey);
      const order = await billingService.createOrder({
        plan_code: planCode,
        billing_cycle: billingCycle,
        method: "USDT",
        network: selectedNetworkValue,
        idempotency_key: nextIdempotencyKey,
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

  const submitTxHash = async () => {
    if (!created?.order_id || !confirmTxHash.trim()) return;
    setConfirmingTx(true);
    setConfirmTxError("");
    try {
      const order = await billingService.confirmOrder(created.order_id, confirmTxHash.trim());
      if (order.status === "paid") {
        handlePaid();
      }
    } catch (error) {
      setConfirmTxError(error instanceof Error ? error.message : t("billing.checkout.submitTxFailed"));
    } finally {
      setConfirmingTx(false);
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
      className="max-w-3xl"
    >
      {phase === "pick" ? (
        <div className="space-y-4">
          <CheckoutSteps phase={phase} />
          <div className="space-y-2">
            <label className="block text-xs font-medium uppercase tracking-[0.18em] text-white/45">{t("billing.checkout.networkLabel")}</label>
            <div className="grid gap-3 sm:grid-cols-3">
            {options.map((m) => (
              <button
                key={m.networkCode}
                type="button"
                className={`min-h-[118px] rounded-2xl border p-4 text-left transition ${
                  selectedNetworkValue === m.networkCode
                    ? "border-[#1d9bf0] bg-[#1d9bf0]/12 shadow-[0_0_0_1px_rgba(29,155,240,0.35)]"
                    : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]"
                }`}
                onClick={() => setSelectedNetwork(m.networkCode)}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-base font-semibold text-white">{t(m.networkKey)}</span>
                  {selectedNetworkValue === m.networkCode ? <CheckCircle2 className="size-4 text-[#8ecdf8]" /> : null}
                </span>
                <span className="mt-1 block text-xs text-white/50">{m.isDefault ? t("billing.payment.defaultBadge") : t("billing.checkout.availableNetwork")}</span>
                <span className="mt-3 block text-xs leading-relaxed text-white/55">{t(methodDescriptionKey(m.networkCode))}</span>
              </button>
            ))}
            </div>
          </div>
          {selectedMethod ? (
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-xs text-white/65">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-white">
                <WalletCards className="size-4 text-[#8ecdf8]" />
                <span>{t("billing.checkout.receiverPreview")}</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <AddressPreview label={t("billing.payment.fields.address")} value={selectedMethod.receiverAddress} />
                <AddressPreview label={t("billing.payment.fields.token")} value={selectedMethod.tokenAddress} />
              </div>
            </div>
          ) : null}
          <PriceSummary quote={quote} loading={quoteLoading} error={quoteError} />
          <Button
            type="button"
            className="h-11 w-full bg-gradient-to-r from-[#1d9bf0] to-violet-500 text-white hover:opacity-90"
            disabled={quoteLoading || Boolean(quoteError)}
            onClick={() => void startPay()}
          >
            <QrCode className="size-4" />
            {t("billing.checkout.continue")}
          </Button>
        </div>
      ) : created ? (
        <div className="space-y-4 text-sm text-white/80">
          <CheckoutSteps phase={phase} />
          <div className="rounded-2xl border border-amber-300/15 bg-amber-300/10 p-3 text-xs leading-relaxed text-amber-100/90">
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-200" />
              <p>{t("billing.checkout.networkWarning")}</p>
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
            <div className="rounded-3xl border border-white/10 bg-white p-4">
              <div className="rounded-2xl bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrURL}
                  alt={t("billing.checkout.qrAlt")}
                  className="aspect-square w-full rounded-2xl object-contain"
                />
              </div>
              <p className="mt-3 text-center text-xs leading-relaxed text-black/55">{t("billing.checkout.qrShortHint")}</p>
            </div>
            <div className="space-y-3 rounded-3xl border border-white/10 bg-black/20 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoPill label={t("billing.checkout.amount")} value={`${created.amount} ${created.currency}`} />
                <InfoPill label={t("billing.payment.fields.network")} value={createdMethod ? t(createdMethod.networkKey) : created.network} />
              </div>
              <PriceSummary quote={created.quote || quote} compact />
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
          <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs leading-relaxed text-white/55">{t("billing.checkout.qrHint")}</p>
          <p className="text-xs leading-relaxed text-amber-200/90">
            {created.network === "TRC20" ? t("billing.checkout.tronPollingHint") : t("billing.checkout.pollingHint")}
          </p>
          <div className="rounded-3xl border border-[#1d9bf0]/20 bg-[#1d9bf0]/10 p-4">
            <div className="mb-3">
              <p className="text-sm font-semibold text-white">{t("billing.checkout.txHashTitle")}</p>
              <p className="mt-1 text-xs leading-relaxed text-white/55">{t("billing.checkout.txHashHint")}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <input
                className="form-input w-full font-mono text-xs"
                value={confirmTxHash}
                placeholder={t("billing.checkout.txHashPlaceholder")}
                onChange={(event) => setConfirmTxHash(event.target.value)}
              />
              <Button
                type="button"
                className="h-10 bg-gradient-to-r from-[#1d9bf0] to-violet-500 text-white hover:opacity-90"
                disabled={confirmingTx || !confirmTxHash.trim()}
                onClick={() => void submitTxHash()}
              >
                {confirmingTx ? t("billing.checkout.submittingTx") : t("billing.checkout.submitTx")}
              </Button>
            </div>
            {confirmTxError ? <p className="mt-2 text-xs text-rose-200">{confirmTxError}</p> : null}
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}

function CheckoutSteps({ phase }: { phase: "pick" | "pay" }) {
  const { t } = useT();
  const steps = [
    { id: "pick", label: t("billing.checkout.step.pick") },
    { id: "pay", label: t("billing.checkout.step.pay") },
  ] as const;

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {steps.map((step, index) => {
        const active = step.id === phase;
        const done = phase === "pay" && step.id === "pick";
        return (
          <div
            key={step.id}
            className={`flex items-center gap-3 rounded-2xl border px-3 py-2 ${
              active || done ? "border-[#1d9bf0]/35 bg-[#1d9bf0]/10 text-white" : "border-white/10 bg-white/[0.03] text-white/45"
            }`}
          >
            <span className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${active || done ? "bg-[#1d9bf0] text-white" : "bg-white/10"}`}>
              {done ? <CheckCircle2 className="size-3.5" /> : index + 1}
            </span>
            <span className="text-sm font-medium">{step.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function PriceSummary({
  quote,
  loading,
  error,
  compact = false,
}: {
  quote: BillingUpgradeQuoteApi | null;
  loading?: boolean;
  error?: string;
  compact?: boolean;
}) {
  const { t } = useT();
  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs text-white/55">
        {t("billing.checkout.priceSummary.loading")}
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-xs text-rose-100">
        {error}
      </div>
    );
  }
  if (!quote) return null;

  const hasCredit = quote.is_upgrade && Number.parseFloat(quote.credit_amount || "0") > 0;
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.03] ${compact ? "p-3" : "p-4"}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">{t("billing.checkout.priceSummary.title")}</p>
        {hasCredit ? (
          <span className="rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-2 py-1 text-xs text-[#7ee0b5]">
            {t("billing.checkout.priceSummary.upgradeApplied")}
          </span>
        ) : null}
      </div>
      <div className="space-y-2 text-xs">
        <PriceRow
          label={t("billing.checkout.priceSummary.original")}
          value={`${quote.original_amount} ${quote.currency}`}
        />
        {hasCredit ? (
          <PriceRow
            label={t("billing.checkout.priceSummary.credit")}
            value={`-${quote.credit_amount} ${quote.currency}`}
            valueClassName="text-[#7ee0b5]"
          />
        ) : null}
        <div className="border-t border-white/10 pt-2">
          <PriceRow
            label={t("billing.checkout.priceSummary.payable")}
            value={`${quote.payable_amount} ${quote.currency}`}
            valueClassName="text-base font-semibold text-white"
          />
        </div>
      </div>
    </div>
  );
}

function PriceRow({ label, value, valueClassName = "text-white" }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-white/50">{label}</span>
      <span className={`shrink-0 whitespace-nowrap font-medium ${valueClassName}`}>{value}</span>
    </div>
  );
}

function AddressPreview({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <p className="text-xs text-white/45">{label}</p>
      <p className="mt-1 break-all font-mono text-xs leading-relaxed text-white">{value}</p>
    </div>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <p className="text-xs text-white/45">{label}</p>
      <p className="mt-1 font-semibold text-white">{value}</p>
    </div>
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
