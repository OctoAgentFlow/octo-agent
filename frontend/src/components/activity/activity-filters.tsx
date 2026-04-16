"use client";

import type { ActivityRange, ActivityStatus, ActivityType } from "@/types/activity";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";

type Filters = {
  type: ActivityType | "all";
  status: ActivityStatus | "all";
  range: ActivityRange;
};

type Props = {
  value: Filters;
  onChange: (next: Filters) => void;
};

export function ActivityFilters({ value, onChange }: Props) {
  const hasActive = value.type !== "all" || value.status !== "all" || value.range !== "24h";
  const { t } = useT();

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="form-input w-[180px]"
            value={value.type}
            onChange={(e) => onChange({ ...value, type: e.target.value as Filters["type"] })}
          >
            <option value="all">{t("activity.filters.allTypes")}</option>
            <option value="post">{t("activity.type.post")}</option>
            <option value="reply">{t("activity.type.reply")}</option>
            <option value="dm">{t("activity.type.dm")}</option>
          </select>
          <select
            className="form-input w-[160px]"
            value={value.status}
            onChange={(e) => onChange({ ...value, status: e.target.value as Filters["status"] })}
          >
            <option value="all">{t("activity.filters.allStatus")}</option>
            <option value="success">{t("activity.status.success")}</option>
            <option value="review">{t("activity.status.review")}</option>
            <option value="failed">{t("activity.status.failed")}</option>
          </select>
          <select
            className="form-input w-[160px]"
            value={value.range}
            onChange={(e) => onChange({ ...value, range: e.target.value as ActivityRange })}
          >
            <option value="24h">{t("activity.filters.range.24h")}</option>
            <option value="7d">{t("activity.filters.range.7d")}</option>
            <option value="30d">{t("activity.filters.range.30d")}</option>
          </select>
        </div>
        {hasActive ? (
          <Button
            variant="ghost"
            onClick={() => onChange({ type: "all", status: "all", range: "24h" })}
          >
            {t("activity.filters.clear")}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

