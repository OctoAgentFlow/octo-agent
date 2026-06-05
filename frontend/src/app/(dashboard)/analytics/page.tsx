"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Activity, AlertTriangle, ArrowUpRight, CheckCircle2, Clock3, FileText, ListChecks, MessageSquareText, RefreshCw, Send, TrendingUp, Users } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";
import { activityNarrativeLine } from "@/lib/activity-narrative";
import { formatDateOnly, formatDateTime as formatDateTimeForZone, usePreferredTimeZone } from "@/lib/timezone";
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
import type { ActivityFailureCategory } from "@/types/activity";

type LoadState = "loading" | "ready" | "error";

const automationIcon = {
  post: FileText,
  reply: RefreshCw,
  dm: Send,
  comment: MessageSquareText,
} satisfies Record<AnalyticsAutomationType, typeof FileText>;

const automationWorkbenchHref = {
  post: "/auto-post",
  reply: "/auto-replies",
  comment: "/auto-comments",
  dm: "/auto-dms",
} satisfies Record<AnalyticsAutomationType, string>;

const moduleHealthOrder: AnalyticsAutomationType[] = ["post", "reply", "comment", "dm"];

const analyticsRanges: AnalyticsRange[] = ["7d", "30d"];

function formatDate(value: string, timeZone: string) {
  return formatDateOnly(value, timeZone, { year: undefined, month: "short", day: "numeric" });
}

function formatDateTime(value: string | undefined, timeZone: string) {
  return formatDateTimeForZone(value, timeZone, { year: undefined });
}

function compactText(value: string, max = 130) {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function healthKey(successRate: number, attentionCount: number) {
  if (successRate >= 90 && attentionCount === 0) return "analytics.insights.health.healthy";
  if (successRate >= 70) return "analytics.insights.health.watch";
  return "analytics.insights.health.risk";
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

function activityHref(params: {
  range: AnalyticsRange;
  status?: string;
  type?: string;
  accountID?: number;
  errorReason?: string;
  failureCategory?: string;
}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.type) query.set("type", params.type);
  query.set("range", params.range);
  if (params.accountID) query.set("account_id", String(params.accountID));
  if (params.errorReason) query.set("error_reason", params.errorReason);
  if (params.failureCategory) query.set("failure_category", params.failureCategory);
  return `/activity?${query.toString()}`;
}

function failureCategoryLabelKey(category?: string) {
  if (category === "x_auth") return "activity.failureCategory.x_auth";
  if (category === "rate_limit") return "activity.failureCategory.rate_limit";
  if (category === "safety") return "activity.failureCategory.safety";
  if (category === "configuration") return "activity.failureCategory.configuration";
  if (category === "network") return "activity.failureCategory.network";
  if (category === "system") return "activity.failureCategory.system";
  if (category === "unknown") return "activity.failureCategory.unknown";
  return "analytics.failureReasons.unknown";
}

function failureCategoryAdviceKey(category?: string) {
  if (category === "x_auth") return "activity.failureAdvice.x_auth";
  if (category === "rate_limit") return "activity.failureAdvice.rate_limit";
  if (category === "safety") return "activity.failureAdvice.safety";
  if (category === "configuration") return "activity.failureAdvice.configuration";
  if (category === "network") return "activity.failureAdvice.network";
  if (category === "system") return "activity.failureAdvice.system";
  if (category === "unknown") return "activity.failureAdvice.unknown";
  return "activity.failureAdvice.unknown";
}

function normalizedFailureCategory(item: AnalyticsOverview["failure_reasons"][number]): ActivityFailureCategory | undefined {
  const category = item.category || item.reason;
  return category === "x_auth" ||
    category === "rate_limit" ||
    category === "safety" ||
    category === "configuration" ||
    category === "network" ||
    category === "system" ||
    category === "unknown"
    ? category
    : undefined;
}

function moduleHealthItems(overview: AnalyticsOverview): AnalyticsOverview["automation_breakdown"] {
  const known = new Map<string, AnalyticsOverview["automation_breakdown"][number]>();
  for (const item of overview.automation_breakdown) {
    if (moduleHealthOrder.includes(item.type)) {
      known.set(item.type, item);
    }
  }
  return moduleHealthOrder.map((type) => {
    const item = known.get(type);
    return {
      type,
      total: item?.total ?? 0,
      success: item?.success ?? 0,
      failed: item?.failed ?? 0,
      review: item?.review ?? 0,
    };
  });
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
    <Card className="min-h-[140px] bg-[#0f1419] transition-colors hover:bg-[#16181c]">
      <div className="flex h-full items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-[#71767b]">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-normal text-white">{value}</p>
          <p className="mt-2 text-xs text-[#71767b]">{detail}</p>
        </div>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#2f3336] bg-[#16181c] text-[#1d9bf0]">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </Card>
  );
}

export default function AnalyticsPage() {
  const { t } = useT();
  const timeZone = usePreferredTimeZone();
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

  const maxContentDailyTotal = useMemo(() => {
    return Math.max(1, ...(overview?.content_effect.daily.map((item) => item.total) ?? [0]));
  }, [overview]);

  if (loadState === "loading") {
    return (
      <div className="space-y-4 md:space-y-5">
        <section>
          <h2 className="text-title">{t("analytics.page.title")}</h2>
          <p className="text-subtitle mt-2">{t("analytics.page.subtitle")}</p>
        </section>
        <Card className="bg-[#0f1419]">
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
            className="form-input h-10 py-0"
            value={accountID}
            onChange={(event) => setAccountID(event.target.value)}
          >
            <option className="bg-black text-white" value="all">
              {t("analytics.accountFilter.all")}
            </option>
            {accounts.map((account) => (
              <option className="bg-black text-white" key={account.id} value={account.id}>
                @{account.username || account.display_name || account.id}
              </option>
            ))}
          </select>
          <div className="inline-flex rounded-full border border-[#2f3336] bg-black p-1">
            {analyticsRanges.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={range === item}
                className={`h-8 rounded-full px-3 text-sm font-medium transition-colors ${
                  range === item
                    ? "bg-[#1d9bf0] text-white"
                    : "text-[#71767b] hover:bg-[#16181c] hover:text-white"
                }`}
                onClick={() => setRange(item)}
              >
                {t(`analytics.range.${item}`)}
              </button>
            ))}
          </div>
          <p className="text-sm text-[#71767b]">
            {t("analytics.generatedAt", { time: formatDateTime(overview.generated_at, timeZone) })}
          </p>
        </div>
      </section>

      <AnalyticsInsightPanel overview={overview} range={range} selectedAccountID={selectedAccountID} />

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
          value={formatDateTime(overview.activity_summary.last_activity_at, timeZone)}
          detail={t("analytics.metric.lastActivityDetail")}
          icon={Clock3}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
        <FailureReasonsCard
          overview={overview}
          range={range}
          selectedAccountID={selectedAccountID}
          timeZone={timeZone}
        />
        <AttentionItemsCard
          overview={overview}
          range={range}
          selectedAccountID={selectedAccountID}
          timeZone={timeZone}
        />
      </div>

      <ModuleHealthSection overview={overview} />

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
                    <div className="flex h-36 items-end rounded-xl border border-[#2f3336] bg-black px-1.5 py-2">
                      <div className="flex w-full flex-col justify-end overflow-hidden rounded-sm" style={{ height }} title={`${formatDate(item.date, timeZone)}: ${item.total}`}>
                        <div className="bg-[#00ba7c]" style={{ height: `${percent(item.success, item.total)}%` }} />
                        <div className="bg-[#ffd400]" style={{ height: `${percent(item.review, item.total)}%` }} />
                        <div className="bg-[#f4212e]" style={{ height: `${percent(item.failed, item.total)}%` }} />
                      </div>
                    </div>
                    <p className="mt-2 truncate text-center text-xs text-[#71767b]">{formatDate(item.date, timeZone)}</p>
                    <p className="text-center text-xs font-semibold text-white">{item.total}</p>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-xs text-[#71767b]">
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#00ba7c]" />{t("analytics.status.success")}</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#ffd400]" />{t("analytics.status.review")}</span>
            <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#f4212e]" />{t("analytics.status.failed")}</span>
          </div>
        </Card>

        <Card className="bg-[#0f1419]">
          <CardHeader title={t("analytics.posts.title")} description={t("analytics.posts.description")} />
          <div className="space-y-3">
            {[
              ["draft", overview.post_summary.draft],
              ["scheduled", overview.post_summary.scheduled],
              ["processing", overview.post_summary.processing],
              ["published", overview.post_summary.published],
              ["failed", overview.post_summary.failed],
            ].map(([key, value]) => (
              <div key={key} className="flex items-center justify-between gap-3 rounded-xl border border-[#2f3336] bg-black px-3 py-2">
                <span className="text-sm text-[#b6bec5]">{t(`analytics.posts.${key}`)}</span>
                <span className="text-sm font-semibold text-white">{value}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="bg-[#0f1419]">
        <CardHeader
          title={t("analytics.contentEffect.title")}
          description={t("analytics.contentEffect.description")}
          right={
            <Link
              className="rounded-full border border-[#2f3336] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#16181c]"
              href="/execution-queue?type=post"
            >
              {t("analytics.contentEffect.manage")}
            </Link>
          }
        />
        <div className="grid gap-3 xl:grid-cols-[1.05fr_1.2fr]">
          <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{t("analytics.contentEffect.conversion")}</p>
                <p className="mt-1 text-xs text-[#71767b]">{t("analytics.contentEffect.conversionDetail")}</p>
              </div>
              <p className="text-2xl font-semibold text-white">{overview.content_effect.conversion.publish_rate_pct}%</p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3">
              <AccountMetric label={t("analytics.contentEffect.ready")} value={overview.content_effect.conversion.ready} />
              <AccountMetric label={t("analytics.contentEffect.active")} value={overview.content_effect.conversion.active} tone="amber" />
              <AccountMetric label={t("analytics.posts.published")} value={overview.content_effect.conversion.published} />
              <AccountMetric label={t("analytics.posts.failed")} value={overview.content_effect.conversion.failed} tone="rose" />
              <AccountMetric label={t("analytics.contentEffect.postSuccess")} value={overview.content_effect.post_activity.success} />
              <AccountMetric label={t("analytics.contentEffect.postFailed")} value={overview.content_effect.post_activity.failed} tone="rose" />
            </div>
          </div>

          <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
            <p className="mb-3 text-sm font-semibold text-white">{t("analytics.contentEffect.dailyTitle")}</p>
            <div className="-mx-1 overflow-x-auto px-1 pb-1">
              <div
                className="grid min-w-[520px] items-end gap-2"
                style={{ gridTemplateColumns: `repeat(${overview.content_effect.daily.length}, minmax(0, 1fr))` }}
              >
                {overview.content_effect.daily.map((item) => {
                  const publishedHeight = Math.max(2, Math.round((item.published / maxContentDailyTotal) * 120));
                  const scheduledHeight = Math.max(2, Math.round((item.scheduled / maxContentDailyTotal) * 120));
                  const failedHeight = Math.max(2, Math.round((item.failed / maxContentDailyTotal) * 120));
                  return (
                    <div key={item.date} className="min-w-0">
                      <div className="flex h-32 items-end gap-0.5 rounded-xl border border-[#2f3336] bg-[#0f1419] px-1 py-2">
                        <div className="w-full rounded-sm bg-[#00ba7c]" style={{ height: item.published ? publishedHeight : 0 }} title={`${formatDate(item.date, timeZone)} published: ${item.published}`} />
                        <div className="w-full rounded-sm bg-[#1d9bf0]" style={{ height: item.scheduled ? scheduledHeight : 0 }} title={`${formatDate(item.date, timeZone)} scheduled: ${item.scheduled}`} />
                        <div className="w-full rounded-sm bg-[#f4212e]" style={{ height: item.failed ? failedHeight : 0 }} title={`${formatDate(item.date, timeZone)} failed: ${item.failed}`} />
                      </div>
                      <p className="mt-2 truncate text-center text-xs text-[#71767b]">{formatDate(item.date, timeZone)}</p>
                      <p className="text-center text-xs font-semibold text-white">{item.total}</p>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-[#71767b]">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#00ba7c]" />{t("analytics.posts.published")}</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#1d9bf0]" />{t("analytics.posts.scheduled")}</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#f4212e]" />{t("analytics.posts.failed")}</span>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-[#2f3336] bg-black p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-white">{t("analytics.contentEffect.recentPosts")}</p>
            <Link
              className="rounded-full border border-[#2f3336] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#16181c]"
              href={activityHref({ range, type: "post", accountID: selectedAccountID })}
            >
              {t("analytics.viewInActivity")}
            </Link>
          </div>
          {overview.content_effect.recent_posts.length === 0 ? (
            <p className="text-sm text-[#71767b]">{t("analytics.contentEffect.noRecentPosts")}</p>
          ) : (
            <div className="grid gap-2 lg:grid-cols-2">
              {overview.content_effect.recent_posts.map((post) => (
                <Link key={post.id} href={`/posts/${post.id}`} className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3 transition-colors hover:bg-[#16181c]">
                  <div className="flex items-start justify-between gap-3">
                    <p className="line-clamp-2 min-w-0 break-words text-sm text-[#e7e9ea]">{post.content}</p>
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ${
                        post.status === "failed"
                          ? "border border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]"
                          : post.status === "published"
                            ? "border border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]"
                            : "border border-[#2f3336] bg-[#16181c] text-[#71767b]"
                      }`}
                    >
                      {t(`analytics.posts.${post.status}`)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-[#71767b]">
                    {t("analytics.contentEffect.updatedAt", { time: formatDateTime(post.updated_at, timeZone) })}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card className="bg-[#0f1419]">
        <CardHeader
          title={t("analytics.autoDMOps.title")}
          description={t("analytics.autoDMOps.description")}
          right={
            <Link
              className="rounded-full border border-[#2f3336] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#16181c]"
              href="/auto-dms"
            >
              {t("analytics.autoDMOps.manage")}
            </Link>
          }
        />
        <div className="grid gap-3 xl:grid-cols-3">
          <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{t("analytics.autoDMOps.recipients")}</p>
                <p className="mt-1 text-xs text-[#71767b]">{t("analytics.autoDMOps.recipientsDetail")}</p>
              </div>
              <p className="text-2xl font-semibold text-white">{overview.auto_dm_operations.recipients.total}</p>
            </div>
            <div className="mt-4 space-y-3">
              {[
                ["allowlisted", overview.auto_dm_operations.recipients.allowlisted, "bg-emerald-300/80"],
                ["blocked", overview.auto_dm_operations.recipients.blocked, "bg-rose-300/80"],
                ["unsubscribed", overview.auto_dm_operations.recipients.unsubscribed, "bg-amber-300/80"],
              ].map(([key, value, color]) => {
                const n = Number(value);
                return (
                  <div key={key}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <span className="text-[#b6bec5]">{t(`analytics.autoDMOps.${key}`)}</span>
                      <span className="font-semibold text-white">{n}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#2f3336]">
                      <div className={`h-full rounded-full ${color}`} style={{ width: `${percent(n, overview.auto_dm_operations.recipients.total)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{t("analytics.autoDMOps.taskRisk")}</p>
                <p className="mt-1 text-xs text-[#71767b]">{t("analytics.autoDMOps.taskRiskDetail")}</p>
              </div>
              <p className="text-2xl font-semibold text-[#f6d96b]">{overview.auto_dm_operations.tasks.needs_attention}</p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <AccountMetric label={t("analytics.status.review")} value={overview.auto_dm_operations.tasks.review} tone="amber" />
              <AccountMetric label={t("analytics.status.failed")} value={overview.auto_dm_operations.tasks.failed} tone="rose" />
              <AccountMetric label={t("analytics.autoDMOps.retryable")} value={overview.auto_dm_operations.tasks.retryable} tone="amber" />
              <AccountMetric label={t("analytics.autoDMOps.sent")} value={overview.auto_dm_operations.tasks.sent} />
            </div>
          </div>

          <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{t("analytics.autoDMOps.importQuality")}</p>
                <p className="mt-1 text-xs text-[#71767b]">{t("analytics.autoDMOps.importQualityDetail")}</p>
              </div>
              <p className="text-2xl font-semibold text-white">{overview.auto_dm_operations.imports.batches}</p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <AccountMetric label={t("analytics.autoDMOps.imported")} value={overview.auto_dm_operations.imports.imported} />
              <AccountMetric label={t("analytics.autoDMOps.skipped")} value={overview.auto_dm_operations.imports.skipped} tone="amber" />
              <AccountMetric label={t("analytics.autoDMOps.errorBatches")} value={overview.auto_dm_operations.imports.error_batches} tone="rose" />
              <AccountMetric label={t("analytics.autoDMOps.batches")} value={overview.auto_dm_operations.imports.batches} />
            </div>
          </div>
        </div>

        <details className="mt-4 rounded-2xl border border-[#2f3336] bg-black p-4">
          <summary className="cursor-pointer text-sm font-semibold text-white marker:text-[#1d9bf0]">
            {t("analytics.autoDMOps.advancedDetails")}
          </summary>
          <div className="mt-4 grid gap-3 xl:grid-cols-2">
            <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
              <p className="mb-3 text-sm font-semibold text-white">{t("analytics.autoDMOps.failureCategories")}</p>
              {overview.auto_dm_operations.failure_categories.length === 0 ? (
                <p className="text-sm text-[#71767b]">{t("analytics.autoDMOps.noFailures")}</p>
              ) : (
                <div className="space-y-2">
                  {overview.auto_dm_operations.failure_categories.map((item) => (
                    <div key={`${item.category}-${item.last_at ?? ""}`} className="flex items-start justify-between gap-3 rounded-xl border border-[#2f3336] bg-black px-3 py-2">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-medium text-white">{item.category || t("analytics.failureReasons.unknown")}</p>
                        {item.last_at ? <p className="mt-1 text-xs text-[#71767b]">{formatDateTime(item.last_at, timeZone)}</p> : null}
                      </div>
                      <span className="shrink-0 rounded-full border border-[#f4212e]/25 bg-[#f4212e]/10 px-2 py-1 text-xs font-semibold text-[#ff8a91]">{item.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
              <p className="mb-3 text-sm font-semibold text-white">{t("analytics.autoDMOps.recentEvents")}</p>
              {overview.auto_dm_operations.recent_events.length === 0 ? (
                <p className="text-sm text-[#71767b]">{t("analytics.autoDMOps.noEvents")}</p>
              ) : (
                <div className="space-y-2">
                  {overview.auto_dm_operations.recent_events.map((item) => (
                    <div key={item.id} className="rounded-xl border border-[#2f3336] bg-black px-3 py-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium text-white">{t(item.preview_key)}</p>
                        <span className="text-xs text-[#71767b]">{formatDateTime(item.executed_at, timeZone)}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 break-words text-xs text-[#71767b]">{item.message || item.account_handle || "—"}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {overview.auto_dm_operations.imports.recent_errors.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-[#ffd400]/20 bg-[#ffd400]/10 p-4">
              <p className="mb-3 text-sm font-semibold text-[#f6d96b]">{t("analytics.autoDMOps.recentImportErrors")}</p>
              <div className="space-y-2">
                {overview.auto_dm_operations.imports.recent_errors.map((item) => (
                  <div key={item.id} className="text-xs text-[#f6d96b]">
                    {formatDateTime(item.imported_at, timeZone)} · {compactText(item.errors.join(" · "), 180)}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </details>
      </Card>

      <Card className="bg-[#0f1419]">
        <CardHeader
          title={t("analytics.accounts.title")}
          description={t("analytics.accounts.description")}
          right={
            <span className="grid h-9 w-9 place-items-center rounded-full border border-[#2f3336] bg-[#16181c] text-[#1d9bf0]">
              <Users className="h-4 w-4" />
            </span>
          }
        />
        {overview.account_breakdown.length === 0 ? (
          <div className="rounded-2xl border border-[#2f3336] bg-black px-3 py-5 text-sm text-[#71767b]">
            {t("analytics.accounts.empty")}
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {overview.account_breakdown.map((account) => (
              <div key={account.account_id} className="rounded-2xl border border-[#2f3336] bg-black p-4 transition-colors hover:bg-[#080808]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">
                      {account.display_name || account.username || `#${account.account_id}`}
                    </p>
                    <p className="mt-1 text-xs text-[#71767b]">@{account.username || account.account_id}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-semibold text-white">{account.success_rate_pct}%</p>
                    <p className="text-xs text-[#71767b]">{t("analytics.accounts.successRate")}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                  <AccountMetric label={t("analytics.accounts.activity")} value={account.activity_total} />
                  <AccountMetric label={t("analytics.status.failed")} value={account.failed} tone="rose" />
                  <AccountMetric label={t("analytics.status.review")} value={account.review} tone="amber" />
                  <AccountMetric label={t("analytics.accounts.posts")} value={account.post_total} />
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-[#71767b]">
                    {t("analytics.accounts.lastActivity", { time: formatDateTime(account.last_activity_at, timeZone) })}
                  </p>
                  <Link
                    className="rounded-full border border-[#2f3336] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#16181c]"
                    href={activityHref({ range, accountID: account.account_id })}
                  >
                    {t("analytics.viewInActivity")}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

    </div>
  );
}

function FailureReasonsCard({
  overview,
  range,
  selectedAccountID,
  timeZone,
}: {
  overview: AnalyticsOverview;
  range: AnalyticsRange;
  selectedAccountID?: number;
  timeZone: string;
}) {
  const { t } = useT();
  return (
    <Card className="bg-[#0f1419]">
      <CardHeader
        title={t("analytics.failureReasons.title")}
        description={t("analytics.failureReasons.description")}
        right={
          <span className="grid h-9 w-9 place-items-center rounded-full border border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]">
            <AlertTriangle className="h-4 w-4" />
          </span>
        }
      />
      {overview.failure_reasons.length === 0 ? (
        <div className="rounded-2xl border border-[#2f3336] bg-black px-3 py-5 text-sm text-[#71767b]">
          {t("analytics.failureReasons.empty")}
        </div>
      ) : (
        <div className="space-y-3">
          {overview.failure_reasons.map((item) => {
            const category = normalizedFailureCategory(item);
            return (
              <div key={`${item.category || item.reason}-${item.last_at ?? ""}`} className="rounded-2xl border border-[#2f3336] bg-black px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-white">
                      {t(failureCategoryLabelKey(category))}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#71767b]">
                      {t(failureCategoryAdviceKey(category))}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-[#f4212e]/25 bg-[#f4212e]/10 px-2 py-1 text-xs font-semibold text-[#ff8a91]">
                    {t("analytics.failureReasons.count", { count: item.count })}
                  </span>
                </div>
                {item.last_at ? (
                  <p className="mt-2 text-xs text-[#71767b]">
                    {t("analytics.failureReasons.lastAt", { time: formatDateTime(item.last_at, timeZone) })}
                  </p>
                ) : null}
                <div className="mt-3 flex justify-end">
                  <Link
                    className="rounded-full border border-[#2f3336] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#16181c]"
                    href={activityHref({
                      range,
                      status: "failed",
                      accountID: selectedAccountID,
                      failureCategory: category,
                    })}
                  >
                    {t("analytics.viewInActivity")}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function AttentionItemsCard({
  overview,
  range,
  selectedAccountID,
  timeZone,
}: {
  overview: AnalyticsOverview;
  range: AnalyticsRange;
  selectedAccountID?: number;
  timeZone: string;
}) {
  const { t } = useT();
  return (
    <Card className="bg-[#0f1419]">
      <CardHeader
        title={t("analytics.attention.title")}
        description={t("analytics.attention.description")}
        right={
          <span className="grid h-9 w-9 place-items-center rounded-full border border-[#ffd400]/20 bg-[#ffd400]/10 text-[#f6d96b]">
            <ListChecks className="h-4 w-4" />
          </span>
        }
      />
      {overview.attention_items.length === 0 ? (
        <div className="rounded-2xl border border-[#2f3336] bg-black px-3 py-5 text-sm text-[#71767b]">
          {t("analytics.attention.empty")}
        </div>
      ) : (
        <div className="space-y-3">
          {overview.attention_items.map((item) => {
            const record = attentionRecord(item);
            return (
              <div key={item.id} className="rounded-2xl border border-[#2f3336] bg-black px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-white">
                        {t(`automation.module.${item.type}.name`)}
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                          item.status === "failed"
                            ? "border border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]"
                            : "border border-[#ffd400]/20 bg-[#ffd400]/10 text-[#f6d96b]"
                        }`}
                      >
                        {t(`analytics.status.${item.status}`)}
                      </span>
                    </div>
                    <p className="line-clamp-2 break-words text-sm text-[#b6bec5]">{activityNarrativeLine(record, t)}</p>
                    {item.error_message ? (
                      <p className="line-clamp-2 break-words text-xs text-[#ff8a91]">{compactText(item.error_message, 160)}</p>
                    ) : null}
                    <div className="flex flex-wrap gap-3 text-xs text-[#71767b]">
                      <span>{item.account_handle}</span>
                      <span>{formatDateTime(item.executed_at, timeZone)}</span>
                    </div>
                  </div>
                  <Link
                    className="shrink-0 rounded-full border border-[#2f3336] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#16181c]"
                    href={activityHref({
                      range,
                      status: item.status,
                      type: item.type,
                      accountID: item.x_account_id || selectedAccountID,
                    })}
                  >
                    {t("analytics.viewInActivity")}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function ModuleHealthSection({ overview }: { overview: AnalyticsOverview }) {
  const { t } = useT();
  return (
    <Card className="bg-[#0f1419]">
      <CardHeader title={t("analytics.modules.title")} description={t("analytics.modules.description")} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {moduleHealthItems(overview).map((item) => {
          const Icon = automationIcon[item.type];
          const moduleSuccessRate = percent(item.success, item.total);
          const needsAttention = item.failed + item.review;
          return (
            <div key={item.type} className="rounded-2xl border border-[#2f3336] bg-black p-4 transition-colors hover:bg-[#080808]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#2f3336] bg-[#16181c] text-[#1d9bf0]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{t(`automation.module.${item.type}.name`)}</p>
                    <p className="mt-0.5 text-xs text-[#71767b]">{t("analytics.modules.total", { count: item.total })}</p>
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-1 text-xs font-semibold ${
                    needsAttention > 0
                      ? "border-[#ffd400]/20 bg-[#ffd400]/10 text-[#f6d96b]"
                      : "border-[#00ba7c]/20 bg-[#00ba7c]/10 text-[#7ee0b5]"
                  }`}
                >
                  {needsAttention > 0 ? t("analytics.modules.needsWork") : t("analytics.modules.stable")}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                <AccountMetric label={t("analytics.status.success")} value={item.success} />
                <AccountMetric label={t("analytics.status.failed")} value={item.failed} tone="rose" />
                <AccountMetric label={t("analytics.status.review")} value={item.review} tone="amber" />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-[#71767b]">
                  {t("analytics.modules.successRate", { rate: moduleSuccessRate })}
                </p>
                <Link
                  href={automationWorkbenchHref[item.type]}
                  className="inline-flex items-center gap-1 rounded-full border border-[#2f3336] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#16181c]"
                >
                  {t("analytics.modules.open")}
                  <ArrowUpRight className="size-3.5" />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function AnalyticsInsightPanel({
  overview,
  range,
  selectedAccountID,
}: {
  overview: AnalyticsOverview;
  range: AnalyticsRange;
  selectedAccountID?: number;
}) {
  const { t } = useT();
  const attentionCount = overview.activity_summary.failed + overview.activity_summary.review;
  const topFailure = overview.failure_reasons[0];
  const healthLabel = t(healthKey(overview.activity_summary.success_rate_pct, attentionCount));

  return (
    <Card className="overflow-hidden border-[#2f3336] bg-[radial-gradient(circle_at_top_right,rgba(29,155,240,0.16),transparent_36%),#0f1419] p-0">
      <div className="grid gap-0 lg:grid-cols-[1.25fr_1fr]">
        <div className="border-b border-[#2f3336] p-5 md:p-6 lg:border-b-0 lg:border-r">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex size-9 items-center justify-center rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#1d9bf0]">
              <TrendingUp className="size-4" />
            </span>
            <p className="text-sm font-semibold text-[#e7e9ea]">{t("analytics.insights.title")}</p>
          </div>
          <h3 className="mt-4 max-w-3xl text-2xl font-bold leading-tight text-white md:text-3xl">
            {t("analytics.insights.headline", {
              health: healthLabel,
              rate: overview.activity_summary.success_rate_pct,
              attention: attentionCount,
            })}
          </h3>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#8b98a5]">
            {topFailure
              ? t("analytics.insights.failureHint", {
                  reason: t(failureCategoryLabelKey(normalizedFailureCategory(topFailure))),
                  count: topFailure.count,
                })
              : t("analytics.insights.noFailureHint")}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href={activityHref({ range, status: "failed", accountID: selectedAccountID })} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#1d9bf0] px-4 text-sm font-semibold text-white hover:bg-[#1a8cd8]">
              {t("analytics.insights.ctaFailures")}
              <ArrowUpRight className="size-3.5" />
            </Link>
            <Link href="/execution-queue" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#2f3336] px-4 text-sm font-semibold text-white hover:bg-[#16181c]">
              {t("analytics.insights.ctaQueue")}
              <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2 md:p-6">
          <InsightPill label={t("analytics.insights.successRate")} value={`${overview.activity_summary.success_rate_pct}%`} detail={t("analytics.metric.successRateDetail", { success: overview.activity_summary.success, failed: overview.activity_summary.failed })} tone="success" />
          <InsightPill label={t("analytics.insights.needsAttention")} value={attentionCount} detail={t("analytics.insights.needsAttentionDetail", { failed: overview.activity_summary.failed, review: overview.activity_summary.review })} tone={attentionCount > 0 ? "warning" : "default"} />
          <InsightPill label={t("analytics.insights.publishRate")} value={`${overview.content_effect.conversion.publish_rate_pct}%`} detail={t("analytics.contentEffect.conversionDetail")} tone="info" />
          <InsightPill label={t("analytics.insights.autoPostActivity")} value={overview.content_effect.post_activity.total} detail={t("analytics.insights.autoPostActivityDetail", { success: overview.content_effect.post_activity.success, failed: overview.content_effect.post_activity.failed })} />
        </div>
      </div>
    </Card>
  );
}

function InsightPill({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: "default" | "success" | "warning" | "info";
}) {
  const toneClass = {
    default: "border-[#2f3336] bg-black text-white",
    success: "border-emerald-300/20 bg-emerald-400/5 text-emerald-200",
    warning: "border-amber-300/20 bg-amber-400/5 text-amber-200",
    info: "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-blue-200",
  }[tone];

  return (
    <div className={`rounded-2xl border p-4 ${toneClass}`}>
      <p className="text-xs opacity-75">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      <p className="mt-2 line-clamp-2 text-xs leading-5 opacity-75">{detail}</p>
    </div>
  );
}

function AccountMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "rose" | "amber";
}) {
  const toneClass =
    tone === "rose"
      ? "border-[#f4212e]/20 bg-[#f4212e]/10 text-[#ff8a91]"
      : tone === "amber"
        ? "border-[#ffd400]/20 bg-[#ffd400]/10 text-[#f6d96b]"
        : "border-[#2f3336] bg-[#0f1419] text-white";
  return (
    <div className={`rounded-xl border px-3 py-2 ${toneClass}`}>
      <p className="text-xs opacity-70">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
