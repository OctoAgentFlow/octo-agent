"use client";

import { Fragment, useState } from "react";

import { SectionCard } from "@/components/dashboard/section-card";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";
import type {
  BillingOpsAction,
  BillingOpsSummary,
  BillingOrderFilterState,
  BillingRefundStatus,
  BillingReviewStatus,
  PaymentRecord,
  PaymentStatus,
} from "@/types/billing";

function statusVariant(status: PaymentStatus): BadgeVariant {
  if (status === "paid") return "success";
  if (status === "pending") return "warning";
  if (status === "expired") return "default";
  return "danger";
}

function reviewVariant(status: BillingReviewStatus): BadgeVariant {
  if (status === "reviewed") return "success";
  if (status === "review_needed") return "warning";
  return "default";
}

function refundVariant(status: BillingRefundStatus): BadgeVariant {
  if (status === "refunded") return "success";
  if (status === "requested") return "warning";
  if (status === "rejected") return "danger";
  return "default";
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

type OpsInputState = {
  opsNote: string;
  refundReason: string;
};

const defaultOpsInput: OpsInputState = { opsNote: "", refundReason: "" };

export function PaymentHistoryTable({
  paymentRecords,
  opsSummary,
  canOperateBilling,
  filters,
  onFiltersChange,
  onConfirmTx,
  onOpsAction,
}: {
  paymentRecords: PaymentRecord[];
  opsSummary: BillingOpsSummary;
  canOperateBilling: boolean;
  filters: BillingOrderFilterState;
  onFiltersChange: (filters: BillingOrderFilterState) => void;
  onConfirmTx?: (orderId: string, txHash: string) => Promise<void>;
  onOpsAction?: (
    orderId: string,
    action: BillingOpsAction,
    payload?: { refundReason?: string; opsNote?: string }
  ) => Promise<void>;
}) {
  const { t } = useT();
  const [txInputs, setTxInputs] = useState<Record<string, string>>({});
  const [opsInputs, setOpsInputs] = useState<Record<string, OpsInputState>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [opsSubmittingKey, setOpsSubmittingKey] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  const updateFilter = (patch: Partial<BillingOrderFilterState>) => onFiltersChange({ ...filters, ...patch });

  const updateOpsInput = (orderId: string, patch: Partial<OpsInputState>) => {
    setOpsInputs((prev) => ({ ...prev, [orderId]: { ...(prev[orderId] || defaultOpsInput), ...patch } }));
  };

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

  const submitOpsAction = async (record: PaymentRecord, action: BillingOpsAction) => {
    if (!onOpsAction) return;
    const key = `${record.id}:${action}`;
    const input = opsInputs[record.id] || defaultOpsInput;
    setOpsSubmittingKey(key);
    setRowErrors((prev) => ({ ...prev, [record.id]: "" }));
    try {
      await onOpsAction(record.id, action, {
        refundReason: input.refundReason || record.refundReason,
        opsNote: input.opsNote || record.opsNote,
      });
      setOpsInputs((prev) => ({ ...prev, [record.id]: defaultOpsInput }));
    } catch (error) {
      const msg = error instanceof Error ? error.message : t("billing.history.ops.failed");
      setRowErrors((prev) => ({ ...prev, [record.id]: msg }));
    } finally {
      setOpsSubmittingKey(null);
    }
  };

  const summaryItems = [
    { key: "billing.history.summary.total", value: opsSummary.total },
    { key: "billing.history.summary.pending", value: opsSummary.pending },
    { key: "billing.history.summary.failed", value: opsSummary.failed },
    { key: "billing.history.summary.reviewNeeded", value: opsSummary.review_needed },
    { key: "billing.history.summary.refundRequested", value: opsSummary.refund_requested },
    { key: "billing.history.summary.mismatch", value: opsSummary.mismatch },
  ];

  return (
    <SectionCard title={t("billing.history.title")} description={t("billing.history.description")}>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        {summaryItems.map((item) => (
          <div key={item.key} className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2">
            <div className="text-[11px] uppercase tracking-[0.08em] text-white/45">{t(item.key)}</div>
            <div className="mt-1 text-lg font-semibold text-white">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {canOperateBilling ? (
          <label className="space-y-1 text-xs text-white/55">
            <span>{t("billing.history.filters.scope")}</span>
            <select
              className="h-9 w-full rounded-lg border border-white/15 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-300/55"
              value={filters.scope}
              onChange={(event) => updateFilter({ scope: event.target.value as BillingOrderFilterState["scope"] })}
            >
              <option value="own">{t("billing.history.scope.own")}</option>
              <option value="all">{t("billing.history.scope.all")}</option>
            </select>
          </label>
        ) : null}
        <label className="space-y-1 text-xs text-white/55">
          <span>{t("billing.history.filters.status")}</span>
          <select
            className="h-9 w-full rounded-lg border border-white/15 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-300/55"
            value={filters.status}
            onChange={(event) => updateFilter({ status: event.target.value as BillingOrderFilterState["status"] })}
          >
            <option value="all">{t("billing.history.filters.all")}</option>
            <option value="pending">{t("billing.history.status.pending")}</option>
            <option value="paid">{t("billing.history.status.paid")}</option>
            <option value="failed">{t("billing.history.status.failed")}</option>
            <option value="expired">{t("billing.history.status.expired")}</option>
          </select>
        </label>
        <label className="space-y-1 text-xs text-white/55">
          <span>{t("billing.history.filters.review")}</span>
          <select
            className="h-9 w-full rounded-lg border border-white/15 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-300/55"
            value={filters.reviewStatus}
            onChange={(event) =>
              updateFilter({ reviewStatus: event.target.value as BillingOrderFilterState["reviewStatus"] })
            }
          >
            <option value="all">{t("billing.history.filters.all")}</option>
            <option value="unreviewed">{t("billing.history.review.unreviewed")}</option>
            <option value="review_needed">{t("billing.history.review.review_needed")}</option>
            <option value="reviewed">{t("billing.history.review.reviewed")}</option>
          </select>
        </label>
        <label className="space-y-1 text-xs text-white/55">
          <span>{t("billing.history.filters.refund")}</span>
          <select
            className="h-9 w-full rounded-lg border border-white/15 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-300/55"
            value={filters.refundStatus}
            onChange={(event) =>
              updateFilter({ refundStatus: event.target.value as BillingOrderFilterState["refundStatus"] })
            }
          >
            <option value="all">{t("billing.history.filters.all")}</option>
            <option value="none">{t("billing.history.refund.none")}</option>
            <option value="requested">{t("billing.history.refund.requested")}</option>
            <option value="refunded">{t("billing.history.refund.refunded")}</option>
            <option value="rejected">{t("billing.history.refund.rejected")}</option>
          </select>
        </label>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="text-white/55">
            <tr className="border-b border-white/10">
              <th className="px-3 py-2 font-medium">{t("billing.history.columns.date")}</th>
              <th className="px-3 py-2 font-medium">{t("billing.history.columns.plan")}</th>
              <th className="px-3 py-2 font-medium">{t("billing.history.columns.amount")}</th>
              <th className="px-3 py-2 font-medium">{t("billing.history.columns.method")}</th>
              <th className="px-3 py-2 font-medium">{t("billing.history.columns.status")}</th>
              <th className="px-3 py-2 font-medium">{t("billing.history.columns.ops")}</th>
              <th className="px-3 py-2 font-medium">{t("billing.history.columns.txHash")}</th>
              <th className="px-3 py-2 font-medium">{t("billing.history.columns.action")}</th>
            </tr>
          </thead>
          <tbody className="text-white/80">
            {paymentRecords.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-sm text-white/60" colSpan={8}>
                  {t("billing.history.empty")}
                </td>
              </tr>
            ) : (
              paymentRecords.map((record) => {
                const opsInput = opsInputs[record.id] || defaultOpsInput;
                return (
                  <Fragment key={record.id}>
                    <tr className="border-b border-white/8 hover:bg-white/5">
                      <td className="px-3 py-3">{record.date}</td>
                      <td className="px-3 py-3">
                        <div>{t(record.planKey)}</div>
                        {canOperateBilling && filters.scope === "all" ? (
                          <div className="mt-1 text-xs text-white/40">
                            {t("billing.history.userId")}: {record.userId}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">{record.amount}</td>
                      <td className="px-3 py-3">
                        {t(record.methodKey)} / {record.network}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={statusVariant(record.status)}>{t(`billing.history.status.${record.status}`)}</Badge>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant={record.reconciliationStatus === "mismatch" ? "danger" : "info"}>
                            {t(`billing.history.reconciliation.${record.reconciliationStatus}`)}
                          </Badge>
                          <Badge variant={reviewVariant(record.reviewStatus)}>
                            {t(`billing.history.review.${record.reviewStatus}`)}
                          </Badge>
                          <Badge variant={refundVariant(record.refundStatus)}>
                            {t(`billing.history.refund.${record.refundStatus}`)}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-white/65">{maskHash(record.txHash)}</td>
                      <td className="px-3 py-3 text-xs text-white/65">
                        {record.canRetry ? t("billing.history.action.submitTx") : t(`billing.history.nextAction.${record.nextAction}`)}
                      </td>
                    </tr>
                    <tr className="border-b border-white/8 bg-white/[0.025]">
                      <td className="px-3 py-3" colSpan={8}>
                        <div className="grid gap-3 xl:grid-cols-[1fr_auto] xl:items-end">
                          <div className="space-y-2">
                            {record.failureReason ? (
                              <p className="text-xs text-amber-100/85">
                                {t("billing.history.failureReason")}: {record.failureReason}
                              </p>
                            ) : null}
                            {record.refundReason ? (
                              <p className="text-xs text-cyan-100/80">
                                {t("billing.history.refundReason")}: {record.refundReason}
                              </p>
                            ) : null}
                            {record.opsNote ? (
                              <p className="text-xs text-white/55">
                                {t("billing.history.opsNote")}: {record.opsNote}
                              </p>
                            ) : null}
                            {record.lastCheckedAt ? (
                              <p className="text-xs text-white/45">
                                {t("billing.history.lastCheckedAt")}: {formatCheckedAt(record.lastCheckedAt)}
                              </p>
                            ) : null}
                            {record.lastAuditAction ? (
                              <p className="text-xs text-white/45">
                                {t("billing.history.audit.last")}: {t(`billing.history.audit.action.${record.lastAuditAction}`)}
                                {record.lastAuditOperatorId ? ` · ${t("billing.history.audit.operator")} #${record.lastAuditOperatorId}` : ""}
                                {record.lastAuditAt ? ` · ${formatCheckedAt(record.lastAuditAt)}` : ""}
                              </p>
                            ) : null}
                            <div className="grid gap-2 md:grid-cols-3">
                              {record.canRetry ? (
                                <input
                                  className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 font-mono text-xs text-white outline-none transition-colors placeholder:text-white/30 focus:border-cyan-300/55"
                                  placeholder={t("billing.history.confirm.placeholder")}
                                  value={txInputs[record.id] ?? record.txHash}
                                  onChange={(event) =>
                                    setTxInputs((prev) => ({ ...prev, [record.id]: event.target.value }))
                                  }
                                />
                              ) : null}
                              {canOperateBilling ? (
                                <>
                                  <input
                                    className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-xs text-white outline-none transition-colors placeholder:text-white/30 focus:border-cyan-300/55"
                                    placeholder={t("billing.history.ops.notePlaceholder")}
                                    value={opsInput.opsNote}
                                    onChange={(event) => updateOpsInput(record.id, { opsNote: event.target.value })}
                                  />
                                  <input
                                    className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-xs text-white outline-none transition-colors placeholder:text-white/30 focus:border-cyan-300/55"
                                    placeholder={t("billing.history.ops.refundPlaceholder")}
                                    value={opsInput.refundReason}
                                    onChange={(event) => updateOpsInput(record.id, { refundReason: event.target.value })}
                                  />
                                </>
                              ) : null}
                            </div>
                            {rowErrors[record.id] ? <p className="text-xs text-rose-200">{rowErrors[record.id]}</p> : null}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {record.canRetry ? (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                disabled={submittingId === record.id || !onConfirmTx}
                                onClick={() => void submitTx(record)}
                              >
                                {submittingId === record.id
                                  ? t("billing.history.confirm.checking")
                                  : t("billing.history.confirm.cta")}
                              </Button>
                            ) : null}
                            {canOperateBilling ? (
                              <>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={!onOpsAction || opsSubmittingKey === `${record.id}:mark_review_needed`}
                                  onClick={() => void submitOpsAction(record, "mark_review_needed")}
                                >
                                  {t("billing.history.ops.markReviewNeeded")}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={!onOpsAction || opsSubmittingKey === `${record.id}:mark_reviewed`}
                                  onClick={() => void submitOpsAction(record, "mark_reviewed")}
                                >
                                  {t("billing.history.ops.markReviewed")}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={!onOpsAction || opsSubmittingKey === `${record.id}:request_refund`}
                                  onClick={() => void submitOpsAction(record, "request_refund")}
                                >
                                  {t("billing.history.ops.requestRefund")}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={!onOpsAction || opsSubmittingKey === `${record.id}:mark_refunded`}
                                  onClick={() => void submitOpsAction(record, "mark_refunded")}
                                >
                                  {t("billing.history.ops.markRefunded")}
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={!onOpsAction || opsSubmittingKey === `${record.id}:reject_refund`}
                                  onClick={() => void submitOpsAction(record, "reject_refund")}
                                >
                                  {t("billing.history.ops.rejectRefund")}
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}
