"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import type { PaymentMethodOption } from "@/types/billing";
import { SectionCard } from "@/components/dashboard/section-card";
import { useT } from "@/i18n/use-t";

import { BillingCheckoutDialog } from "./billing-checkout-dialog";

export function PaymentMethodPanel({
  paymentMethods,
  onPaid,
}: {
  paymentMethods: PaymentMethodOption[];
  /** Called after on-chain payment is confirmed (order status paid). */
  onPaid?: () => void;
}) {
  const { t } = useT();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  return (
    <SectionCard className="bg-[#0f1419]" title={t("billing.payment.title")} description={t("billing.payment.description")}>
      <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
        {paymentMethods.length > 0 ? (
          <ul className="space-y-4">
            {paymentMethods.map((pm) => (
              <li
                key={`${pm.networkKey}-${pm.receiverMasked}`}
                className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[#8ecdf8]">
                  {pm.isDefault ? (
                    <span className="rounded-full border border-[#1d9bf0]/35 bg-[#1d9bf0]/10 px-2 py-0.5">{t("billing.payment.defaultBadge")}</span>
                  ) : null}
                  {pm.chainId > 0 ? (
                    <span className="text-[#71767b]">
                      chain_id {pm.chainId}
                    </span>
                  ) : null}
                </div>
                <div className="grid gap-2 text-sm text-[#71767b] sm:grid-cols-2 lg:grid-cols-4">
                  <p>
                    {t("billing.payment.fields.method")}: <span className="text-white">{t(pm.methodKey)}</span>
                  </p>
                  <p>
                    {t("billing.payment.fields.network")}: <span className="text-white">{t(pm.networkKey)}</span>
                  </p>
                  <p className="sm:col-span-2">
                    {t("billing.payment.fields.token")}: <span className="break-all text-white">{pm.tokenMasked}</span>
                  </p>
                  <p className="sm:col-span-2 lg:col-span-4">
                    {t("billing.payment.fields.address")}: <span className="break-all text-white">{pm.receiverMasked}</span>
                  </p>
                </div>
                {pm.note ? <p className="mt-2 text-xs text-[#71767b]">{pm.note}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[#71767b]">{t("billing.payment.empty")}</p>
        )}
        <Button
          type="button"
          className="mt-4"
          disabled={paymentMethods.length === 0}
          onClick={() => setCheckoutOpen(true)}
        >
          {t("billing.payment.upgradeCta")}
        </Button>
      </div>
      <BillingCheckoutDialog
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        paymentMethods={paymentMethods}
        onPaid={onPaid}
      />
    </SectionCard>
  );
}
