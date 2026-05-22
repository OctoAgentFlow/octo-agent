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

function hasUpgradeCredit(record: PaymentRecord) {
  return record.orderType === "upgrade" && Number.parseFloat(record.creditAmount || "0") > 0;
}

type OpsInputState = {
  opsNote: string;
};

const defaultOpsInput: OpsInputState = { opsNote: "" };

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
  onOpsAction?: (orderId: string, action: BillingOpsAction, payload?: { opsNote?: string }) => Promise<void>;
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
    ...(canOperateBilling
      ? [
          { key: "billing.history.summary.failed", value: opsSummary.failed },
          { key: "billing.history.summary.reviewNeeded", value: opsSummary.review_needed },
          { key: "billing.history.summary.mismatch", value: opsSummary.mismatch },
        ]
      : [
          { key: "billing.history.summary.paid", value: opsSummary.paid },
          { key: "billing.history.summary.failed", value: opsSummary.failed },
          { key: "billing.history.summary.expired", value: opsSummary.expired },
        ]),
  ];
  const colSpan = canOperateBilling ? 8 : 7;

  return (
    <SectionCard
      className="bg-[#0f1419]"
      title={t("billing.history.title")}
      description={t(canOperateBilling ? "billing.history.adminDescription" : "billing.history.userDescription")}
    >
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {summaryItems.map((item) => (
          <div key={item.key} className="rounded-2xl border border-[#2f3336] bg-black px-3 py-2">
            <div className="text-[11px] uppercase tracking-[0.08em] text-[#71767b]">{t(item.key)}</div>
            <div className="mt-1 text-lg font-semibold text-white">{item.value}</div>
          </div>
        ))}
      </div>

      {canOperateBilling ? (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-xs text-[#71767b]">
            <span>{t("billing.history.filters.scope")}</span>
            <select
              className="form-input h-9 py-0"
              value={filters.scope}
              onChange={(event) => updateFilter({ scope: event.target.value as BillingOrderFilterState["scope"] })}
            >
              <option value="own">{t("billing.history.scope.own")}</option>
              <option value="all">{t("billing.history.scope.all")}</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-[#71767b]">
            <span>{t("billing.history.filters.status")}</span>
            <select
              className="form-input h-9 py-0"
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
          <label className="space-y-1 text-xs text-[#71767b]">
            <span>{t("billing.history.filters.review")}</span>
            <select
              className="form-input h-9 py-0"
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
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className={`w-full text-left text-sm ${canOperateBilling ? "min-w-[980px]" : "min-w-[820px]"}`}>
          <thead className="text-[#71767b]">
            <tr className="border-b border-[#2f3336]">
              <th className="px-3 py-2 font-medium">{t("billing.history.columns.date")}</th>
              <th className="px-3 py-2 font-medium">{t("billing.history.columns.plan")}</th>
              <th className="px-3 py-2 font-medium">{t("billing.history.columns.amount")}</th>
              <th className="px-3 py-2 font-medium">{t("billing.history.columns.method")}</th>
              <th className="px-3 py-2 font-medium">{t("billing.history.columns.status")}</th>
              {canOperateBilling ? <th className="px-3 py-2 font-medium">{t("billing.history.columns.ops")}</th> : null}
              <th className="px-3 py-2 font-medium">{t("billing.history.columns.txHash")}</th>
              <th className="px-3 py-2 font-medium">{t("billing.history.columns.action")}</th>
            </tr>
          </thead>
          <tbody className="text-[#e7e9ea]">
            {paymentRecords.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-sm text-[#71767b]" colSpan={colSpan}>
                  {t("billing.history.empty")}
                </td>
              </tr>
            ) : (
              paymentRecords.map((record) => {
                const opsInput = opsInputs[record.id] || defaultOpsInput;
                return (
                  <Fragment key={record.id}>
                    <tr className="border-b border-[#2f3336] hover:bg-[#080808]">
                      <td className="px-3 py-3">{record.date}</td>
                      <td className="px-3 py-3">
                        <div>{t(record.planKey)}</div>
                        {canOperateBilling && filters.scope === "all" ? (
                          <div className="mt-1 text-xs text-[#71767b]">
                            {t("billing.history.userId")}: {record.userId}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-white">{record.amount}</div>
                        {hasUpgradeCredit(record) ? (
                          <div className="mt-1 text-xs text-[#00ba7c]">{t("billing.history.proration.applied")}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-3">
                        {t(record.methodKey)} / {record.network}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={statusVariant(record.status)}>{t(`billing.history.status.${record.status}`)}</Badge>
                      </td>
                      {canOperateBilling ? (
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant={record.reconciliationStatus === "mismatch" ? "danger" : "info"}>
                              {t(`billing.history.reconciliation.${record.reconciliationStatus}`)}
                            </Badge>
                            <Badge variant={reviewVariant(record.reviewStatus)}>
                              {t(`billing.history.review.${record.reviewStatus}`)}
                            </Badge>
                          </div>
                        </td>
                      ) : null}
                      <td className="px-3 py-3 font-mono text-xs text-[#71767b]">{maskHash(record.txHash)}</td>
                      <td className="px-3 py-3 text-xs text-[#71767b]">
                        {record.canRetry ? t("billing.history.action.submitTx") : t(`billing.history.nextAction.${record.nextAction}`)}
                      </td>
                    </tr>
                    <tr className="border-b border-[#2f3336] bg-black">
                      <td className="px-3 py-3" colSpan={colSpan}>
                        <div className="grid gap-3 xl:grid-cols-[1fr_auto] xl:items-end">
                          <div className="space-y-2">
                            {hasUpgradeCredit(record) ? <ProrationBreakdown record={record} /> : null}
                            {canOperateBilling && record.failureReason ? (
                              <p className="text-xs text-[#f6d96b]">
                                {t("billing.history.failureReason")}: {record.failureReason}
                              </p>
                            ) : null}
                            {canOperateBilling && record.opsNote ? (
                              <p className="text-xs text-[#71767b]">
                                {t("billing.history.opsNote")}: {record.opsNote}
                              </p>
                            ) : null}
                            {record.lastCheckedAt ? (
                              <p className="text-xs text-[#71767b]">
                                {t("billing.history.lastCheckedAt")}: {formatCheckedAt(record.lastCheckedAt)}
                              </p>
                            ) : null}
                            {canOperateBilling && record.lastAuditAction ? (
                              <p className="text-xs text-[#71767b]">
                                {t("billing.history.audit.last")}: {t(`billing.history.audit.action.${record.lastAuditAction}`)}
                                {record.lastAuditOperatorId ? ` · ${t("billing.history.audit.operator")} #${record.lastAuditOperatorId}` : ""}
                                {record.lastAuditAt ? ` · ${formatCheckedAt(record.lastAuditAt)}` : ""}
                              </p>
                            ) : null}
                            <div className="grid gap-2 md:grid-cols-3">
                              {record.canRetry ? (
                                <div className="space-y-1 md:col-span-2">
                                  <input
                                    className="form-input w-full font-mono text-xs"
                                    placeholder={t("billing.history.confirm.placeholder")}
                                    value={txInputs[record.id] ?? record.txHash}
                                    onChange={(event) =>
                                      setTxInputs((prev) => ({ ...prev, [record.id]: event.target.value }))
                                    }
                                  />
                                  <p className="text-xs text-[#71767b]">{t("billing.history.confirm.hint")}</p>
                                </div>
                              ) : null}
                              {canOperateBilling ? (
                                <>
                                  <input
                                    className="form-input w-full text-xs"
                                    placeholder={t("billing.history.ops.notePlaceholder")}
                                    value={opsInput.opsNote}
                                    onChange={(event) => updateOpsInput(record.id, { opsNote: event.target.value })}
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

function ProrationBreakdown({ record }: { record: PaymentRecord }) {
  const { t } = useT();
  return (
    <div className="grid gap-2 rounded-2xl border border-[#00ba7c]/20 bg-[#00ba7c]/5 p-3 text-xs sm:grid-cols-3">
      <AmountLine label={t("billing.history.proration.original")} value={`${record.originalAmount} ${record.currency}`} />
      <AmountLine
        label={t("billing.history.proration.credit")}
        value={`-${record.creditAmount} ${record.currency}`}
        valueClassName="text-[#7ee0b5]"
      />
      <AmountLine
        label={t("billing.history.proration.payable")}
        value={`${record.payableAmount} ${record.currency}`}
        valueClassName="text-white"
      />
    </div>
  );
}

function AmountLine({ label, value, valueClassName = "text-[#e7e9ea]" }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[#71767b]">{label}</div>
      <div className={`mt-1 whitespace-nowrap font-semibold ${valueClassName}`}>{value}</div>
    </div>
  );
}
