"use client";

import { Button } from "@/components/ui/button";
import { paymentMethod } from "@/mocks/billing.mock";
import { SectionCard } from "@/components/dashboard/section-card";
import { useT } from "@/i18n/use-t";

export function PaymentMethodPanel() {
  const { t } = useT();
  return (
    <SectionCard title={t("billing.payment.title")} description={t("billing.payment.description")}>
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="grid gap-2 text-sm text-white/75 sm:grid-cols-3">
          <p>
            {t("billing.payment.fields.method")}: <span className="text-white">{t(paymentMethod.methodKey)}</span>
          </p>
          <p>
            {t("billing.payment.fields.network")}: <span className="text-white">{t(paymentMethod.networkKey)}</span>
          </p>
          <p>
            {t("billing.payment.fields.address")}: <span className="text-white">{paymentMethod.addressMask}</span>
          </p>
        </div>
        <p className="mt-3 text-xs text-white/60">{t(paymentMethod.noteKey)}</p>
        <Button className="mt-4 bg-gradient-to-r from-blue-500 to-violet-500 text-white hover:opacity-90">
          {t("billing.payment.upgradeCta")}
        </Button>
      </div>
    </SectionCard>
  );
}
