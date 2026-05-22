"use client";

import { ArrowUpRight, CheckCircle2, Clock3, ShieldCheck, WalletCards } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { PaymentMethodOption } from "@/types/billing";
import { SectionCard } from "@/components/dashboard/section-card";
import { useT } from "@/i18n/use-t";

function networkTone(networkCode: string) {
  if (networkCode === "BEP20") {
    return {
      border: "border-[#1d9bf0]/45",
      bg: "from-[#1d9bf0]/16 to-[#0f1419]",
      icon: "text-[#8ecdf8]",
      labelKey: "billing.payment.defaultBadge",
      descriptionKey: "billing.payment.networkSummary.bep20",
      settlementKey: "billing.payment.autoConfirm",
    };
  }
  if (networkCode === "ERC20") {
    return {
      border: "border-white/12",
      bg: "from-white/[0.04] to-[#0f1419]",
      icon: "text-white/70",
      labelKey: "billing.checkout.availableNetwork",
      descriptionKey: "billing.payment.networkSummary.erc20",
      settlementKey: "billing.payment.autoConfirm",
    };
  }
  return {
    border: "border-amber-300/25",
    bg: "from-amber-300/10 to-[#0f1419]",
    icon: "text-amber-200",
    labelKey: "billing.payment.hashAutoConfirm",
    descriptionKey: "billing.payment.networkSummary.trc20",
    settlementKey: "billing.payment.hashAutoConfirm",
  };
}

export function PaymentMethodPanel({
  paymentMethods,
  onUpgrade,
}: {
  paymentMethods: PaymentMethodOption[];
  onUpgrade: () => void;
}) {
  const { t } = useT();
  return (
    <SectionCard className="bg-[#0f1419]" title={t("billing.payment.title")} description={t("billing.payment.description")}>
      <div className="rounded-2xl border border-[#2f3336] bg-black p-4 sm:p-5">
        {paymentMethods.length > 0 ? (
          <ul className="grid gap-3 lg:grid-cols-3">
            {paymentMethods.map((pm) => (
              (() => {
                const tone = networkTone(pm.networkCode);
                return (
              <li
                key={`${pm.networkKey}-${pm.receiverMasked}`}
                className={`flex min-h-[230px] flex-col rounded-2xl border bg-gradient-to-br p-4 ${tone.border} ${tone.bg}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                      <WalletCards className={`size-5 ${tone.icon}`} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-white">{t(pm.networkKey)}</p>
                      <p className="mt-0.5 text-xs text-[#71767b]">{t("billing.payment.method.usdt")}</p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 text-xs text-white/75">
                    {t(tone.labelKey)}
                  </span>
                </div>
                <p className="mt-4 min-h-[40px] text-sm leading-relaxed text-[#71767b]">
                  {t(tone.descriptionKey)}
                </p>
                <div className="mt-4 space-y-3 rounded-2xl border border-white/10 bg-black/25 p-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-[#71767b]">{t("billing.payment.fields.chain")}</span>
                    <span className="font-medium text-white">{t(pm.networkKey)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-[#71767b]">{t("billing.payment.fields.settlement")}</span>
                    <span className="inline-flex items-center gap-1.5 font-medium text-white">
                      {pm.networkCode === "TRC20" ? <Clock3 className="size-3.5 text-amber-200" /> : <CheckCircle2 className="size-3.5 text-emerald-300" />}
                      {t(tone.settlementKey)}
                    </span>
                  </div>
                  <div className="space-y-1 text-xs">
                    <p className="text-[#71767b]">{t("billing.payment.fields.address")}</p>
                    <p className="break-all font-mono text-white">{pm.receiverMasked}</p>
                  </div>
                  <div className="space-y-1 text-xs">
                    <p className="text-[#71767b]">{t("billing.payment.fields.token")}</p>
                    <p className="break-all font-mono text-white">{pm.tokenMasked}</p>
                  </div>
                </div>
                <div className="mt-auto flex items-center gap-2 pt-4 text-xs text-[#71767b]">
                  <ShieldCheck className="size-4 shrink-0 text-[#1d9bf0]" />
                  <span>{t("billing.payment.safetyHint")}</span>
                </div>
              </li>
                );
              })()
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[#71767b]">{t("billing.payment.empty")}</p>
        )}
        <Button
          type="button"
          className="mt-4"
          disabled={paymentMethods.length === 0}
          onClick={onUpgrade}
        >
          {t("billing.payment.upgradeCta")}
          <ArrowUpRight className="size-4" />
        </Button>
      </div>
    </SectionCard>
  );
}
