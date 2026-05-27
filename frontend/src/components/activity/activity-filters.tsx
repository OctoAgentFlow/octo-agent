"use client";

import type { ActivityEventScope, ActivityFailureCategory, ActivityRange, ActivityStatus, ActivityType } from "@/types/activity";
import type { AccountListItem } from "@/services/account.service";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";

type Filters = {
  eventScope: ActivityEventScope;
  type: ActivityType | "all";
  status: ActivityStatus | "all";
  range: ActivityRange;
  accountID: string;
  errorReason: string;
  failureCategory: ActivityFailureCategory | "all";
};

type Props = {
  value: Filters;
  onChange: (next: Filters) => void;
  accounts: AccountListItem[];
};

export function ActivityFilters({ value, onChange, accounts }: Props) {
  const hasActive =
    value.eventScope !== "all" ||
    value.type !== "all" ||
    value.status !== "all" ||
    value.range !== "24h" ||
    value.accountID !== "all" ||
    value.errorReason !== "" ||
    value.failureCategory !== "all";
  const { t } = useT();
  const quickViews: Array<{ value: ActivityEventScope; labelKey: string; descriptionKey: string }> = [
    { value: "all", labelKey: "activity.quickView.all", descriptionKey: "activity.quickView.allDesc" },
    { value: "execution", labelKey: "activity.quickView.execution", descriptionKey: "activity.quickView.executionDesc" },
    { value: "system", labelKey: "activity.quickView.system", descriptionKey: "activity.quickView.systemDesc" },
  ];

  const updateEventScope = (eventScope: ActivityEventScope) => {
    onChange({ ...value, eventScope, type: "all", errorReason: "" });
  };

  return (
    <Card className="bg-[#0f1419] p-4">
      <div className="space-y-4">
        <div className="grid gap-2 md:grid-cols-3">
          {quickViews.map((item) => {
            const active = value.eventScope === item.value;
            return (
              <button
                key={item.value}
                type="button"
                className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                  active
                    ? "border-[#1d9bf0] bg-[#1d9bf0]/12 text-white"
                    : "border-[#2f3336] bg-black text-[#71767b] hover:border-[#536471] hover:text-[#e7e9ea]"
                }`}
                aria-pressed={active}
                onClick={() => updateEventScope(item.value)}
              >
                <span className="block text-sm font-semibold">{t(item.labelKey)}</span>
                <span className="mt-1 block text-xs leading-5 text-[#71767b]">{t(item.descriptionKey)}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-6">
            <label className="space-y-1">
              <span className="text-xs text-[#71767b]">{t("activity.filters.typeLabel")}</span>
              <select
                className="form-input w-full"
                value={value.type}
                onChange={(e) => onChange({ ...value, eventScope: "all", type: e.target.value as Filters["type"], errorReason: "" })}
              >
                <option value="all">{t("activity.filters.allTypes")}</option>
                <option value="post">{t("activity.type.post")}</option>
                <option value="reply">{t("activity.type.reply")}</option>
                <option value="comment">{t("activity.type.comment")}</option>
                <option value="dm">{t("activity.type.dm")}</option>
                <option value="system">{t("activity.type.system")}</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-[#71767b]">{t("activity.filters.statusLabel")}</span>
              <select
                className="form-input w-full"
                value={value.status}
                onChange={(e) => {
                  const status = e.target.value as Filters["status"];
                  onChange({ ...value, status, failureCategory: status === "failed" ? value.failureCategory : "all", errorReason: "" });
                }}
              >
                <option value="all">{t("activity.filters.allStatus")}</option>
                <option value="success">{t("activity.status.success")}</option>
                <option value="review">{t("activity.status.review")}</option>
                <option value="failed">{t("activity.status.failed")}</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-[#71767b]">{t("activity.filters.rangeLabel")}</span>
              <select
                className="form-input w-full"
                value={value.range}
                onChange={(e) => onChange({ ...value, range: e.target.value as ActivityRange, errorReason: "" })}
              >
                <option value="24h">{t("activity.filters.range.24h")}</option>
                <option value="7d">{t("activity.filters.range.7d")}</option>
                <option value="30d">{t("activity.filters.range.30d")}</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-[#71767b]">{t("activity.filters.accountLabel")}</span>
              <select
                className="form-input w-full"
                value={value.accountID}
                onChange={(e) => onChange({ ...value, accountID: e.target.value, errorReason: "" })}
              >
                <option value="all">{t("activity.filters.allAccounts")}</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    @{account.username || account.display_name || account.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 sm:col-span-2 xl:col-span-1">
              <span className="text-xs text-[#71767b]">{t("activity.filters.failureCategoryLabel")}</span>
              <select
                className="form-input w-full"
                value={value.failureCategory}
                onChange={(e) => {
                  const failureCategory = e.target.value as Filters["failureCategory"];
                  onChange({ ...value, status: failureCategory === "all" ? value.status : "failed", failureCategory, errorReason: "" });
                }}
              >
                <option value="all">{t("activity.failureCategory.all")}</option>
                <option value="x_auth">{t("activity.failureCategory.x_auth")}</option>
                <option value="rate_limit">{t("activity.failureCategory.rate_limit")}</option>
                <option value="safety">{t("activity.failureCategory.safety")}</option>
                <option value="configuration">{t("activity.failureCategory.configuration")}</option>
                <option value="network">{t("activity.failureCategory.network")}</option>
                <option value="system">{t("activity.failureCategory.system")}</option>
                <option value="unknown">{t("activity.failureCategory.unknown")}</option>
              </select>
            </label>
            <label className="space-y-1 sm:col-span-2 xl:col-span-1">
              <span className="text-xs text-[#71767b]">{t("activity.filters.errorReasonLabel")}</span>
              <input
                className="form-input w-full"
                value={value.errorReason}
                placeholder={t("activity.filters.errorReasonPlaceholder")}
                onChange={(event) => onChange({ ...value, failureCategory: "all", errorReason: event.target.value })}
              />
            </label>
          </div>
          {hasActive ? (
            <Button
              variant="ghost"
              className="h-10"
              onClick={() => onChange({ eventScope: "all", type: "all", status: "all", range: "24h", accountID: "all", errorReason: "", failureCategory: "all" })}
            >
              {t("activity.filters.clear")}
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
