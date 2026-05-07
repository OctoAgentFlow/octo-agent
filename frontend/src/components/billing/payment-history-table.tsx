"use client";

import { Fragment, useState } from "react";

import { SectionCard } from "@/components/dashboard/section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";
import type { PaymentRecord, PaymentStatus } from "@/types/billing";

function statusVariant(status: PaymentStatus) {
  if (status === "paid") return "success";
  if (status === "pending") return "warning";
  if (status === "expired") return "default";
  return "danger";
}

function maskHash(hash: string) {
  const s = hash.trim();
  if (!s) return "—";
  if (s.length <= 18) return s;
  return `${s.slice(0, 10)}…${s.slice(-8)}`;
}

function formatCheckedAt(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function PaymentHistoryTable({
  paymentRecords,
  onConfirmTx,
}: {
  paymentRecords: PaymentRecord[];
  onConfirmTx?: (orderId: string, txHash: string) => Promise<void>;
}) {
  const { t } = useT();
  const [txInputs, setTxInputs] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const submitTx = async (record: PaymentRecord) => {
    const txHash = (txInputs[record.id] || record.txHash).trim();
    if (!txHash || !onConfirmTx) return;
    setSubmittingId(record.id);
    setRowErrors((prev) => ({ ...prev, [record.id]: "" }));
    try {
      await onConfirmTx(record.id, txHash);
      setTxInputs((prev) => ({ ...prev, [record.id]: "" }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("billing.history.confirm.failed");
      setRowErrors((prev) => ({ ...prev, [record.id]: msg }));
    } finally {
      setSubmittingId(null);
    }
  };

  return (
    <SectionCard title={t("billing.history.title")} description={t("billing.history.description")}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="text-white/55">
            <tr className="border-b border-white/10">
              <th className="px-3 py-2 font-medium">{t("billing.history.columns.date")}</th>
              <th className="px-3 py-2 font-medium">{t("billing.history.columns.plan")}</th>
              <th className="px-3 py-2 font-medium">{t("billing.history.columns.amount")}</th>
              <th className="px-3 py-2 font-medium">{t("billing.history.columns.method")}</th>
              <th className="px-3 py-2 font-medium">{t("billing.history.columns.status")}</th>
              <th className="px-3 py-2 font-medium">{t("billing.history.columns.txHash")}</th>
              <th className="px-3 py-2 font-medium">{t("billing.history.columns.action")}</th>
            </tr>
          </thead>
          <tbody className="text-white/80">
            {paymentRecords.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-sm text-white/60" colSpan={7}>
                  {t("billing.history.empty")}
                </td>
              </tr>
            ) : paymentRecords.map((record) => (
              <Fragment key={record.id}>
                <tr className="border-b border-white/8 hover:bg-white/5">
                  <td className="px-3 py-3">{record.date}</td>
                  <td className="px-3 py-3">{t(record.planKey)}</td>
                  <td className="px-3 py-3">{record.amount}</td>
                  <td className="px-3 py-3">{t(record.methodKey)} / {record.network}</td>
                  <td className="px-3 py-3">
                    <Badge variant={statusVariant(record.status)}>{t(`billing.history.status.${record.status}`)}</Badge>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-white/65">{maskHash(record.txHash)}</td>
                  <td className="px-3 py-3 text-xs text-white/65">
                    {record.canRetry ? t("billing.history.action.submitTx") : t(`billing.history.nextAction.${record.nextAction}`)}
                  </td>
                </tr>
                {record.canRetry || record.failureReason ? (
                  <tr className="border-b border-white/8 bg-white/[0.025]">
                    <td className="px-3 py-3" colSpan={7}>
                      <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
                        <div className="space-y-2">
                          {record.failureReason ? (
                            <p className="text-xs text-amber-100/85">
                              {t("billing.history.failureReason")}: {record.failureReason}
                            </p>
                          ) : null}
                          {record.lastCheckedAt ? (
                            <p className="text-xs text-white/45">
                              {t("billing.history.lastCheckedAt")}: {formatCheckedAt(record.lastCheckedAt)}
                            </p>
                          ) : null}
                          {record.canRetry ? (
                            <input
                              className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 font-mono text-xs text-white outline-none transition-colors placeholder:text-white/30 focus:border-cyan-300/55"
                              placeholder={t("billing.history.confirm.placeholder")}
                              value={txInputs[record.id] ?? record.txHash}
                              onChange={(event) => setTxInputs((prev) => ({ ...prev, [record.id]: event.target.value }))}
                            />
                          ) : null}
                          {rowErrors[record.id] ? <p className="text-xs text-rose-200">{rowErrors[record.id]}</p> : null}
                        </div>
                        {record.canRetry ? (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={submittingId === record.id || !onConfirmTx}
                            onClick={() => void submitTx(record)}
                          >
                            {submittingId === record.id ? t("billing.history.confirm.checking") : t("billing.history.confirm.cta")}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
