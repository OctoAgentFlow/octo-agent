"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Activity, AlertTriangle, CheckCircle2, Clock3, FileText, ListChecks, RefreshCw, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";
import { activityNarrativeLine } from "@/lib/activity-narrative";
import {
  broadcastDataSynced,
  broadcastPageRefreshComplete,
  subscribePageRefreshRequest,
} from "@/lib/app-page-refresh";
import {
  analyticsService,
  type AnalyticsAutomationType,
  type AnalyticsOverview,
  type AnalyticsRange,
} from "@/services/analytics.service";
import { accountService, type AccountListItem } from "@/services/account.service";
import type { ActivityRecord } from "@/types/activity";

type LoadState = "loading" | "ready" | "error";

const automationIcon = {
  post: FileText,
  reply: RefreshCw,
  dm: Send,
} satisfies Record<AnalyticsAutomationType, typeof FileText>;

const analyticsRanges: AnalyticsRange[] = ["7d", "30d"];

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatDateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function compactText(value: string, max = 130) {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function attentionRecord(item: AnalyticsOverview["attention_items"][number]): ActivityRecord {
  return {
    id: String(item.id),
    type: item.type,
    status: item.status,
    previewKey: item.preview_key,
    accountHandle: item.account_handle,
    executedAt: item.executed_at,
    errorMessage: item.error_message,
  };
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof Activity;
}) {
  return (
    <Card className="min-h-[140px]">
      <div className="flex h-full items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-white/58">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-normal text-white">{value}</p>
          <p className="mt-2 text-xs text-white/52">{detail}</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/[0.06] text-cyan-200">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </Card>
  );
}

export default function AnalyticsPage() {
  const { t } = useT();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [range, setRange] = useState<AnalyticsRange>("7d");
  const [accountID, setAccountID] = useState<string>("all");
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);

  const selectedAccountID = useMemo(() => {
    if (accountID === "all") return undefined;
    const n = Number(accountID);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }, [accountID]);

  const fetchAnalytics = useCallback(async () => {
    setLoadState("loading");
    setErrorMessage(null);
    try {
      const data = await analyticsService.overview({ range, accountId: selectedAccountID });
      setOverview(data);
      setLoadState("ready");
      broadcastDataSynced(Date.now());
    } catch (error) {
      const msg = axios.isAxiosError(error)
        ? error.response?.data?.message || t("analytics.error.description")
        : t("analytics.error.description");
      setErrorMessage(msg);
      setLoadState("error");
    }
  }, [range, selectedAccountID, t]);

  useEffect(() => {
    void fetchAnalytics();
  }, [fetchAnalytics]);

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
    return subscribePageRefreshRequest(() => {
      void (async () => {
        try {
          await fetchAnalytics();
        } finally {
          broadcastPageRefreshComplete();
        }
      })();
    });
  }, [fetchAnalytics]);

  const maxDailyTotal = useMemo(() => {
    return Math.max(1, ...(overview?.daily_activity.map((item) => item.total) ?? [0]));
  }, [overview]);

  if (loadState === "loading") {
    return (
      <div className="space-y-4 md:space-y-5">
        <section>
          <h2 className="text-title">{t("analytics.page.title")}</h2>
          <p className="text-subtitle mt-2">{t("analytics.page.subtitle")}</p>
        </section>
        <Card>
          <CardHeader title={t("analytics.loading.title")} description={t("analytics.loading.description")} />
        </Card>
      </div>
    );
  }

  if (loadState === "error" || !overview) {
    return (
      <div className="space-y-4 md:space-y-5">
        <section>
          <h2 className="text-title">{t("analytics.page.title")}</h2>
          <p className="text-subtitle mt-2">{t("analytics.page.subtitle")}</p>
        </section>
        <Card>
          <CardHeader title={t("analytics.error.title")} description={errorMessage || t("analytics.error.description")} />
          <div className="flex justify-end">
            <Button onClick={() => void fetchAnalytics()}>{t("analytics.retry")}</Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-5">
      <section className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-title">{t("analytics.page.title")}</h2>
          <p className="text-subtitle mt-2">{t("analytics.page.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <label className="sr-only" htmlFor="analytics-account-filter">
            {t("analytics.accountFilter.label")}
          </label>
          <select
            id="analytics-account-filter"
            className="h-10 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm font-medium text-white outline-none transition-colors hover:bg-white/[0.08] focus:border-cyan-300/50"
            value={accountID}
            onChange={(event) => setAccountID(event.target.value)}
          >
            <option className="bg-[#0b1020] text-white" value="all">
              {t("analytics.accountFilter.all")}
            </option>
            {accounts.map((account) => (
              <option className="bg-[#0b1020] text-white" key={account.id} value={account.id}>
                @{account.username || account.display_name || account.id}
              </option>
            ))}
          </select>
          <div className="inline-flex rounded-lg border border-white/10 bg-white/[0.04] p-1">
            {analyticsRanges.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={range === item}
                className={`h-8 rounded-md px-3 text-sm font-medium transition-colors ${
                  range === item
                    ? "bg-white/14 text-white"
                    : "text-white/58 hover:bg-white/[0.08] hover:text-white"
                }`}
                onClick={() => setRange(item)}
              >
                {t(`analytics.range.${item}`)}
              </button>
            ))}
          </div>
          <p className="text-sm text-white/55">
            {t("analytics.generatedAt", { time: formatDateTime(overview.generated_at) })}
          </p>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={t("analytics.metric.activity")}
          value={overview.activity_summary.total}
          detail={t("analytics.metric.activityDetail", { days: overview.range_days })}
          icon={Activity}
        />
        <MetricCard
          label={t("analytics.metric.successRate")}
          value={`${overview.activity_summary.success_rate_pct}%`}
          detail={t("analytics.metric.successRateDetail", {
            success: overview.activity_summary.success,
            failed: overview.activity_summary.failed,
          })}
          icon={CheckCircle2}
        />
        <MetricCard
          label={t("analytics.metric.posts")}
          value={overview.post_summary.total}
          detail={t("analytics.metric.postsDetail", {
            scheduled: overview.post_summary.scheduled,
            published: overview.post_summary.published,
          })}
          icon={FileText}
        />
        <MetricCard
          label={t("analytics.metric.lastActivity")}
          value={formatDateTime(overview.activity_summary.last_activity_at)}
          detail={t("analytics.metric.lastActivityDetail")}
          icon={Clock3}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <Card>
          <CardHeader
            title={t("analytics.trend.title")}
            description={t("analytics.trend.description", { days: overview.range_days })}
          />
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <div
              className="grid min-w-[520px] items-end gap-2"
              style={{ gridTemplateColumns: `repeat(${overview.daily_activity.length}, minmax(0, 1fr))` }}
            >
              {overview.daily_activity.map((item) => {
                const height = Math.max(8, Math.round((item.total / maxDailyTotal) * 132));
                return (
                  <div key={item.date} className="min-w-0">
                    <div className="flex h-36 items-end rounded-md border border-white/8 bg-white/[0.025] px-1.5 py-2">
                      <div
                        className="w-full rounded-sm bg-cyan-300/75"
                        style={{ height }}
                        title={`${formatDate(item.date)}: ${item.total}`}
                      />
                    </div>
                    <p className="mt-2 truncate text-center text-xs text-white/55">{formatDate(item.date)}</p>
                    <p className="text-center text-xs font-semibold text-white">{item.total}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title={t("analytics.posts.title")} description={t("analytics.posts.description")} />
          <div className="space-y-3">
            {[
              ["draft", overview.post_summary.draft],
              ["scheduled", overview.post_summary.scheduled],
              ["processing", overview.post_summary.processing],
              ["published", overview.post_summary.published],
              ["failed", overview.post_summary.failed],
            ].map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-3 rounded-md border border-white/8 bg-white/[0.03] px-3 py-2">
                <span className="text-sm text-white/68">{t(`analytics.posts.${key}`)}</span>
                <span className="text-sm font-semibold text-white">{value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title={t("analytics.automation.title")} description={t("analytics.automation.description")} />
        <div className="grid gap-3 md:grid-cols-3">
          {overview.automation_breakdown.map((item) => {
            const Icon = automationIcon[item.type] ?? Activity;
            return (
              <div key={item.type} className="rounded-md border border-white/8 bg-white/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-md bg-white/[0.06] text-cyan-200">
                      <Icon className="h-4 w-4" />
                    </span>
                    <p className="font-semibold text-white">{t(`automation.module.${item.type}.name`)}</p>
                  </div>
                  <p className="text-2xl font-semibold text-white">{item.total}</p>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md bg-emerald-400/10 px-2 py-2">
                    <p className="text-xs text-emerald-100/70">{t("analytics.status.success")}</p>
                    <p className="font-semibold text-emerald-100">{item.success}</p>
                  </div>
                  <div className="rounded-md bg-rose-400/10 px-2 py-2">
                    <p className="text-xs text-rose-100/70">{t("analytics.status.failed")}</p>
                    <p className="font-semibold text-rose-100">{item.failed}</p>
                  </div>
                  <div className="rounded-md bg-amber-400/10 px-2 py-2">
                    <p className="text-xs text-amber-100/70">{t("analytics.status.review")}</p>
                    <p className="font-semibold text-amber-100">{item.review}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <Card>
          <CardHeader
            title={t("analytics.failureReasons.title")}
            description={t("analytics.failureReasons.description")}
            right={
              <span className="grid h-9 w-9 place-items-center rounded-md bg-rose-400/10 text-rose-100">
                <AlertTriangle className="h-4 w-4" />
              </span>
            }
          />
          {overview.failure_reasons.length === 0 ? (
            <div className="rounded-md border border-white/8 bg-white/[0.03] px-3 py-5 text-sm text-white/55">
              {t("analytics.failureReasons.empty")}
            </div>
          ) : (
            <div className="space-y-3">
              {overview.failure_reasons.map((item) => (
                <div key={`${item.reason}-${item.last_at ?? ""}`} className="rounded-md border border-white/8 bg-white/[0.03] px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="min-w-0 break-words text-sm font-medium text-white">
                      {compactText(item.reason || t("analytics.failureReasons.unknown"))}
                    </p>
                    <span className="shrink-0 rounded-md bg-rose-400/10 px-2 py-1 text-xs font-semibold text-rose-100">
                      {t("analytics.failureReasons.count", { count: item.count })}
                    </span>
                  </div>
                  {item.last_at ? (
                    <p className="mt-2 text-xs text-white/45">
                      {t("analytics.failureReasons.lastAt", { time: formatDateTime(item.last_at) })}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title={t("analytics.attention.title")}
            description={t("analytics.attention.description")}
            right={
              <span className="grid h-9 w-9 place-items-center rounded-md bg-amber-400/10 text-amber-100">
                <ListChecks className="h-4 w-4" />
              </span>
            }
          />
          {overview.attention_items.length === 0 ? (
            <div className="rounded-md border border-white/8 bg-white/[0.03] px-3 py-5 text-sm text-white/55">
              {t("analytics.attention.empty")}
            </div>
          ) : (
            <div className="space-y-3">
              {overview.attention_items.map((item) => {
                const record = attentionRecord(item);
                return (
                  <div key={item.id} className="rounded-md border border-white/8 bg-white/[0.03] px-3 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-white">
                            {t(`automation.module.${item.type}.name`)}
                          </span>
                          <span
                            className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                              item.status === "failed"
                                ? "bg-rose-400/10 text-rose-100"
                                : "bg-amber-400/10 text-amber-100"
                            }`}
                          >
                            {t(`analytics.status.${item.status}`)}
                          </span>
                        </div>
                        <p className="line-clamp-2 break-words text-sm text-white/72">{activityNarrativeLine(record, t)}</p>
                        {item.error_message ? (
                          <p className="line-clamp-2 break-words text-xs text-rose-100/80">{compactText(item.error_message, 160)}</p>
                        ) : null}
                        <div className="flex flex-wrap gap-3 text-xs text-white/45">
                          <span>{item.account_handle}</span>
                          <span>{formatDateTime(item.executed_at)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
