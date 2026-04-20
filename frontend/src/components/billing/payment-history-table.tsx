"use client";

import { SectionCard } from "@/components/dashboard/section-card";
import { Badge } from "@/components/ui/badge";
import { useT } from "@/i18n/use-t";
import type { PaymentRecord, PaymentStatus } from "@/types/billing";

function statusVariant(status: PaymentStatus) {
  if (status === "paid") return "success";
  if (status === "pending") return "warning";
  return "danger";
}

export function PaymentHistoryTable({ paymentRecords }: { paymentRecords: PaymentRecord[] }) {
  const { t } = useT();
  return (
    <SectionCard title={t("billing.history.title")} description={t("billing.history.description")}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="text-white/55">
            <tr className="border-b border-white/10">
              <th className="px-3 py-2 font-medium">{t("billing.history.columns.date")}</th>
              <th className="px-3 py-2 font-medium">{t("billing.history.columns.plan")}</th>
              <th className="px-3 py-2 font-medium">{t("billing.history.columns.amount")}</th>
              <th className="px-3 py-2 font-medium">{t("billing.history.columns.method")}</th>
              <th className="px-3 py-2 font-medium">{t("billing.history.columns.status")}</th>
              <th className="px-3 py-2 font-medium">{t("billing.history.columns.txHash")}</th>
            </tr>
          </thead>
          <tbody className="text-white/80">
            {paymentRecords.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-sm text-white/60" colSpan={6}>
                  No payment history yet.
                </td>
              </tr>
            ) : paymentRecords.map((record) => (
              <tr key={record.txHash} className="border-b border-white/8 hover:bg-white/5">
                <td className="px-3 py-3">{record.date}</td>
                <td className="px-3 py-3">{t(record.planKey)}</td>
                <td className="px-3 py-3">{record.amount}</td>
                <td className="px-3 py-3">{t(record.methodKey)}</td>
                <td className="px-3 py-3">
                  <Badge variant={statusVariant(record.status)}>{t(`billing.history.status.${record.status}`)}</Badge>
                </td>
                <td className="px-3 py-3 font-mono text-xs text-white/65">{record.txHash}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
