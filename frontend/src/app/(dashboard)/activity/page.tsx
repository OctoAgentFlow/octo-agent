"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import axios from "axios";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock3, ListChecks } from "lucide-react";

import type { ActivityEventScope, ActivityRange, ActivityRecord, ActivityStatus, ActivityType } from "@/types/activity";
import { activityService } from "@/services/activity.service";
import { accountService, type AccountListItem } from "@/services/account.service";
import {
  broadcastDataSynced,
  broadcastPageRefreshComplete,
  subscribePageRefreshRequest,
} from "@/lib/app-page-refresh";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";

import { ActivityFilters } from "@/components/activity/activity-filters";
import { ActivityList } from "@/components/activity/activity-list";
import { ActivityLoading } from "@/components/activity/activity-loading";
import { ActivityEmptyState } from "@/components/activity/activity-empty-state";
import { ActivityPageHeader } from "@/components/activity/activity-page-header";

type Filters = {
  eventScope: ActivityEventScope;
  type: ActivityType | "all";
  status: ActivityStatus | "all";
  range: ActivityRange;
  accountID: string;
  errorReason: string;
};

function readType(value: string | null): Filters["type"] {
  return value === "post" || value === "reply" || value === "comment" || value === "dm" || value === "system" ? value : "all";
}

function readEventScope(value: string | null): ActivityEventScope {
  return value === "execution" || value === "system" || value === "all" ? value : "all";
}

function readStatus(value: string | null): Filters["status"] {
  return value === "success" || value === "review" || value === "failed" ? value : "all";
}

function readRange(value: string | null): ActivityRange {
  return value === "7d" || value === "30d" || value === "24h" ? value : "24h";
}

function readAccountID(value: string | null) {
  if (!value) return "all";
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? String(n) : "all";
}

function readPage(value: string | null) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

export default function ActivityPage() {
  const { t } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recordsRaw, setRecordsRaw] = useState<ActivityRecord[]>([]);
  const [page, setPage] = useState(() => readPage(searchParams.get("page")));
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [filters, setFilters] = useState<Filters>(() => ({
    eventScope: readEventScope(searchParams.get("event_scope")),
    type: readType(searchParams.get("type")),
    status: readStatus(searchParams.get("status")),
    range: readRange(searchParams.get("range")),
    accountID: readAccountID(searchParams.get("account_id")),
    errorReason: searchParams.get("error_reason")?.trim() ?? "",
  }));

  const selectedAccountID = useMemo(() => {
    if (filters.accountID === "all") return undefined;
    const n = Number(filters.accountID);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [filters.accountID]);

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const data = await activityService.list({
        page,
        page_size: pageSize,
        event_scope: filters.eventScope === "all" ? undefined : filters.eventScope,
        type: filters.type === "all" ? undefined : filters.type,
        status: filters.status === "all" ? undefined : filters.status,
        range: filters.range,
        account_id: selectedAccountID,
        error_reason: filters.errorReason || undefined,
      });
      setRecordsRaw(
        data.items.map((item) => ({
          id: String(item.id),
          xAccountId: item.x_account_id,
          type: item.type,
          status: item.status,
          previewKey: item.preview_key,
          accountHandle: item.account_handle,
          sourceModule: item.source_module,
          executedAt: item.executed_at,
          errorMessage: item.error_message,
          replyCommentTweetId: item.reply_comment_tweet_id,
          replyToUsername: item.reply_to_username,
          replyToTextPreview: item.reply_to_text_preview,
          replyTextPreview: item.reply_text_preview,
        }))
      );
      setTotal(data.pagination.total);
      broadcastDataSynced(Date.now());
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setErrorMessage(error.response?.data?.message || t("activity.errors.load"));
      } else {
        setErrorMessage(t("activity.errors.load"));
      }
    } finally {
      setLoading(false);
    }
  }, [filters.errorReason, filters.eventScope, filters.range, filters.status, filters.type, page, pageSize, selectedAccountID, t]);

  useEffect(() => {
    void fetchActivities();
  }, [fetchActivities]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const data = await accountService.list();
        if (active) {
          setAccounts(data.items);
        }
      } catch {
        if (active) {
          setAccounts([]);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const next = new URLSearchParams();
    if (filters.eventScope !== "all") next.set("event_scope", filters.eventScope);
    if (filters.type !== "all") next.set("type", filters.type);
    if (filters.status !== "all") next.set("status", filters.status);
    if (filters.range !== "24h") next.set("range", filters.range);
    if (selectedAccountID) next.set("account_id", String(selectedAccountID));
    if (filters.errorReason) next.set("error_reason", filters.errorReason);
    if (page > 1) next.set("page", String(page));
    const nextQuery = next.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery !== currentQuery) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }
  }, [filters.accountID, filters.errorReason, filters.eventScope, filters.range, filters.status, filters.type, page, pathname, router, searchParams, selectedAccountID]);

  useEffect(() => {
    return subscribePageRefreshRequest(() => {
      void (async () => {
        try {
          await fetchActivities();
        } finally {
          broadcastPageRefreshComplete();
        }
      })();
    });
  }, [fetchActivities]);

  useEffect(() => {
    setPage(1);
  }, [filters.accountID, filters.errorReason, filters.eventScope, filters.range, filters.type, filters.status]);

  const records = useMemo(() => {
    return [...recordsRaw].sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());
  }, [recordsRaw]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageSuccessCount = records.filter((record) => record.status === "success").length;
  const pageReviewCount = records.filter((record) => record.status === "review").length;
  const pageFailedCount = records.filter((record) => record.status === "failed").length;
  const latestRecord = records[0];

  return (
    <div className="space-y-4 md:space-y-5">
      <ActivityPageHeader count={total} />
      <div className="grid gap-3 md:grid-cols-4">
        <ActivitySummaryCard
          icon={<ListChecks className="size-4" />}
          label={t("activity.summary.matched")}
          value={String(total)}
          description={t("activity.summary.matchedDesc")}
        />
        <ActivitySummaryCard
          icon={<CheckCircle2 className="size-4" />}
          label={t("activity.summary.success")}
          value={String(pageSuccessCount)}
          description={t("activity.summary.currentPage")}
          tone="success"
        />
        <ActivitySummaryCard
          icon={<Clock3 className="size-4" />}
          label={t("activity.summary.review")}
          value={String(pageReviewCount)}
          description={t("activity.summary.currentPage")}
          tone={pageReviewCount > 0 ? "warning" : "default"}
        />
        <ActivitySummaryCard
          icon={<AlertTriangle className="size-4" />}
          label={t("activity.summary.failed")}
          value={String(pageFailedCount)}
          description={latestRecord ? t("activity.summary.latest", { time: new Date(latestRecord.executedAt).toLocaleString() }) : t("activity.summary.noLatest")}
          tone={pageFailedCount > 0 ? "danger" : "default"}
        />
      </div>
      <ActivityFilters value={filters} onChange={setFilters} accounts={accounts} />
      {loading ? (
        <ActivityLoading />
      ) : errorMessage ? (
        <Card>
          <CardHeader title={t("activity.error.title")} description={errorMessage} />
          <div className="flex justify-end">
            <Button onClick={() => void fetchActivities()}>{t("common.retry")}</Button>
          </div>
        </Card>
      ) : records.length === 0 ? (
        <ActivityEmptyState />
      ) : (
        <div className="space-y-3">
          <ActivityList records={records as ActivityRecord[]} />
          <Card className="bg-[#0f1419] p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-[#71767b]">
                {t("activity.pagination.page", { page, total: totalPages })}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  {t("activity.pagination.previous")}
                </Button>
                <Button variant="outline" disabled={page >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
                  {t("activity.pagination.next")}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function ActivitySummaryCard({
  icon,
  label,
  value,
  description,
  tone = "default",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  description: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass = {
    default: "border-[#2f3336] bg-[#16181c] text-[#e7e9ea]",
    success: "border-emerald-300/20 bg-emerald-400/5 text-emerald-200",
    warning: "border-amber-300/20 bg-amber-400/5 text-amber-200",
    danger: "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]",
  }[tone];

  return (
    <Card className="bg-[#0f1419] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-[#71767b]">{label}</p>
          <p className="mt-2 text-2xl font-bold text-[#e7e9ea]">{value}</p>
        </div>
        <span className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full border ${toneClass}`}>{icon}</span>
      </div>
      <p className="mt-3 truncate text-xs text-[#71767b]">{description}</p>
    </Card>
  );
}
