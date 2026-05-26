"use client";

import type { ActivityRange, ActivityStatus, ActivityType } from "@/types/activity";
import type { AccountListItem } from "@/services/account.service";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";

type Filters = {
  type: ActivityType | "all";
  status: ActivityStatus | "all";
  range: ActivityRange;
  accountID: string;
  errorReason: string;
};

type Props = {
  value: Filters;
  onChange: (next: Filters) => void;
  accounts: AccountListItem[];
};

export function ActivityFilters({ value, onChange, accounts }: Props) {
  const hasActive =
    value.type !== "all" ||
    value.status !== "all" ||
    value.range !== "24h" ||
    value.accountID !== "all" ||
    value.errorReason !== "";
  const { t } = useT();

  return (
    <Card className="bg-[#0f1419] p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <label className="space-y-1">
            <span className="text-xs text-[#71767b]">{t("activity.filters.typeLabel")}</span>
          <select
              className="form-input w-full"
            value={value.type}
            onChange={(e) => onChange({ ...value, type: e.target.value as Filters["type"], errorReason: "" })}
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
            onChange={(e) => onChange({ ...value, status: e.target.value as Filters["status"], errorReason: "" })}
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
            <span className="text-xs text-[#71767b]">{t("activity.filters.errorReasonLabel")}</span>
            <input
              className="form-input w-full"
              value={value.errorReason}
              placeholder={t("activity.filters.errorReasonPlaceholder")}
              onChange={(event) => onChange({ ...value, errorReason: event.target.value })}
            />
          </label>
        </div>
        {hasActive ? (
          <Button
            variant="ghost"
            className="h-10"
            onClick={() => onChange({ type: "all", status: "all", range: "24h", accountID: "all", errorReason: "" })}
          >
            {t("activity.filters.clear")}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
