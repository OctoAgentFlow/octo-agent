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
    <SectionCard title={t("billing.payment.title")} description={t("billing.payment.description")}>
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        {paymentMethods.length > 0 ? (
          <ul className="space-y-4">
            {paymentMethods.map((pm) => (
              <li
                key={`${pm.networkKey}-${pm.receiverMasked}`}
                className="rounded-lg border border-white/10 bg-black/20 p-3"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-violet-200/90">
                  {pm.isDefault ? (
                    <span className="rounded-full bg-violet-500/25 px-2 py-0.5">{t("billing.payment.defaultBadge")}</span>
                  ) : null}
                  {pm.chainId > 0 ? (
                    <span className="text-white/50">
                      chain_id {pm.chainId}
                    </span>
                  ) : null}
                </div>
                <div className="grid gap-2 text-sm text-white/75 sm:grid-cols-2 lg:grid-cols-4">
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
                {pm.note ? <p className="mt-2 text-xs text-white/60">{pm.note}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-white/70">{t("billing.payment.empty")}</p>
        )}
        <Button
          type="button"
          className="mt-4 bg-gradient-to-r from-blue-500 to-violet-500 text-white hover:opacity-90"
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
