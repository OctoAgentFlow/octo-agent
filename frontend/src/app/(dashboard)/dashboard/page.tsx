"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { AlertTriangle, Bot, CheckCircle2, ChevronRight, Coins, Copy, ExternalLink, Gift, PlayCircle, ShieldAlert } from "lucide-react";

import { AutomationOverview } from "@/components/dashboard/automation-overview";
import { RecentActivityList } from "@/components/dashboard/recent-activity-list";
import { StatusOverviewCards } from "@/components/dashboard/status-overview-cards";
import { TrialUpgradeBanner } from "@/components/dashboard/trial-upgrade-banner";
import { XAccountStatus } from "@/components/dashboard/x-account-status";
import { UserOnboardingCard } from "@/components/onboarding/user-onboarding-card";
import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import {
  broadcastDataSynced,
  broadcastPageRefreshComplete,
  subscribePageRefreshRequest,
} from "@/lib/app-page-refresh";
import { subscribeDashboardRefresh } from "@/lib/dashboard-refresh";
import { formatTimeOnly, usePreferredTimeZone } from "@/lib/timezone";
import { activityService } from "@/services/activity.service";
import { automationService, type AutomationModuleApi } from "@/services/automation.service";
import { dashboardService, type DashboardOverview } from "@/services/dashboard.service";
import { oafBotService } from "@/services/oaf-bot.service";
import { pointService, type PointCenterApi } from "@/services/point.service";
import { referralService, type ReferralInfoApi } from "@/services/referral.service";
import { reviewQueueService, type ReviewQueueStatsApi } from "@/services/review-queue.service";
import { useT } from "@/i18n/use-t";
import type { ActivityRecord } from "@/types/activity";
import type { AutomationModule } from "@/types/automation";
import type { PlanLimits, PlanUsage } from "@/types/billing";
import type { OAFBot, OAFBotMatrixInspectionSummary } from "@/types/oaf-bot";

type LoadState = "loading" | "ready" | "error";
type RelativeTimeLabel = {
  key: string;
  params?: Record<string, string | number>;
};

type OAFBotDashboardData = {
  bots: OAFBot[];
  usage: PlanUsage | null;
  limits: PlanLimits | null;
  inspectionSummary: OAFBotMatrixInspectionSummary | null;
};

type PointsDashboardData = {
  points: PointCenterApi;
  referral: ReferralInfoApi | null;
};

function mapTimeToKey(iso?: string, timeZone?: string): RelativeTimeLabel {
  if (!iso) return { key: "automation.time.paused" };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { key: "automation.time.paused" };
  const diffMin = Math.max(1, Math.floor((Date.now() - date.getTime()) / 60000));
  if (diffMin > 24 * 60) {
    return { key: "automation.time.yesterdayAt", params: { time: formatTimeOnly(date, timeZone) } };
  }
  if (diffMin > 60) {
    return { key: "automation.time.todayAt", params: { time: formatTimeOnly(date, timeZone) } };
  }
  return { key: "automation.time.minutesAgo", params: { minutes: diffMin } };
}

function mapAutomation(item: AutomationModuleApi, timeZone: string): AutomationModule {
  const last = mapTimeToKey(item.last_run_at, timeZone);
  const next = item.config.enabled ? mapTimeToKey(item.next_run_at, timeZone) : { key: "automation.time.paused" };
  const replyUsage = item.reply_usage
    ? {
        todayCount: item.reply_usage.today_count,
        dailyLimit: item.reply_usage.daily_limit,
        remainingToday: item.reply_usage.remaining_today,
        lastExecutedAt: item.reply_usage.last_executed_at,
      }
    : undefined;
  const lastReply =
    item.type === "reply" && item.reply_usage?.last_executed_at
      ? mapTimeToKey(item.reply_usage.last_executed_at, timeZone)
      : null;
  return {
    type: item.type,
    nameKey: `automation.module.${item.type}.name`,
    descriptionKey: `automation.module.${item.type}.description`,
    state: item.state,
    config: {
      enabled: item.config.enabled,
      frequency: {
        intervalMinutes: item.config.frequency.interval_minutes,
        dailyLimit: item.config.frequency.daily_limit ?? 0,
      },
      tone: item.config.tone,
      executionMode: item.config.execution_mode || "review",
      safety: {
        requireApproval: item.config.safety.require_approval,
        maxPerHour: item.config.safety.max_per_hour ?? 0,
        blockedKeywords: item.config.safety.blocked_keywords || [],
      },
    },
    lastRunKey: last.key,
    lastRunParams: last.params,
    nextRunKey: next.key,
    nextRunParams: next.params,
    executedToday: item.executed_today ?? 0,
    replyUsage,
    replyLastRelativeKey: lastReply?.key,
    replyLastRelativeParams: lastReply?.params,
  };
}

function botPersonaScore(bot: OAFBot) {
  let score = 0;
  if (bot.name?.trim()) score += 15;
  if (bot.twitter_account_id) score += 15;
  if (bot.occupation?.trim() || bot.industry?.trim()) score += 12;
  if (bot.project_one_liner?.trim() || bot.core_value_props?.trim()) score += 12;
  if (bot.identity_summary?.trim()) score += 15;
  if ((bot.topics || []).length > 0) score += 12;
  if (bot.growth_goal?.trim()) score += 10;
  if ((bot.forbidden_topics || []).length > 0 || (bot.avoid_claims || []).length > 0 || bot.compliance_notes?.trim()) score += 9;
  return Math.min(score, 100);
}

function isBotReady(bot: OAFBot) {
  return Boolean(bot.twitter_account_id) && botPersonaScore(bot) >= 60;
}

function automationMonthlyUsage(data: OAFBotDashboardData | null): Partial<Record<AutomationModule["type"], { used: number; limit: number }>> {
  if (!data?.usage || !data.limits) return {};
  return {
    post: { used: data.usage.autoPostsMonth, limit: data.limits.monthlyAutoPosts },
    reply: { used: data.usage.autoRepliesMonth, limit: data.limits.monthlyAutoReplies },
    comment: { used: data.usage.autoCommentsMonth, limit: data.limits.monthlyAutoComments },
    dm: { used: data.usage.autoDMsMonth, limit: data.limits.monthlyAutoDMs },
  };
}

function quotaExhausted(data: OAFBotDashboardData | null) {
  if (!data?.usage || !data.limits) return false;
  const pairs = [
    [data.usage.aiGenerationsMonth, data.limits.aiGenerationsMonthly],
    [data.usage.autoPostsMonth, data.limits.monthlyAutoPosts],
    [data.usage.autoRepliesMonth, data.limits.monthlyAutoReplies],
    [data.usage.autoCommentsMonth, data.limits.monthlyAutoComments],
    [data.usage.autoDMsMonth, data.limits.monthlyAutoDMs],
  ];
  return pairs.some(([used, limit]) => limit > 0 && used >= limit);
}

function SkeletonLine({ className }: { className: string }) {
  return <span className={`block animate-pulse rounded-full bg-[#2f3336] ${className}`} />;
}

export default function DashboardPage() {
  const { t } = useT();
  const { pushToast } = useToast();
  const timeZone = usePreferredTimeZone();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [automations, setAutomations] = useState<AutomationModule[]>([]);
  const [automationLoading, setAutomationLoading] = useState<boolean>(true);
  const [automationError, setAutomationError] = useState<string | null>(null);
  const [recentRecords, setRecentRecords] = useState<ActivityRecord[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [oafBotDashboard, setOAFBotDashboard] = useState<OAFBotDashboardData | null>(null);
  const [oafBotDashboardLoading, setOAFBotDashboardLoading] = useState(true);
  const [oafBotDashboardError, setOAFBotDashboardError] = useState<string | null>(null);
  const [reviewStats, setReviewStats] = useState<ReviewQueueStatsApi | null>(null);
  const [pointsDashboard, setPointsDashboard] = useState<PointsDashboardData | null>(null);
  const [pointsDashboardLoading, setPointsDashboardLoading] = useState(true);
  const [pointsDashboardError, setPointsDashboardError] = useState<string | null>(null);
  const [dashboardRefreshing, setDashboardRefreshing] = useState(false);

  const fetchOverview = useCallback(async (preserveData = false) => {
    if (!preserveData) setLoadState("loading");
    setErrorMessage(null);
    try {
      const data = await dashboardService.overview();
      setOverview(data);
      setLoadState("ready");
      broadcastDataSynced(Date.now());
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setErrorMessage(error.response?.data?.message || t("dashboard.errors.loadOverview"));
      } else {
        setErrorMessage(t("dashboard.errors.loadOverview"));
      }
      setLoadState((prev) => (preserveData && prev === "ready" ? prev : "error"));
    }
  }, [t]);

  const fetchAutomations = useCallback(async (preserveData = false) => {
    if (!preserveData) setAutomationLoading(true);
    setAutomationError(null);
    try {
      const data = await automationService.list();
      setAutomations(data.modules.map((item) => mapAutomation(item, timeZone)));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setAutomationError(error.response?.data?.message || t("dashboard.errors.loadAutomations"));
      } else {
        setAutomationError(t("dashboard.errors.loadAutomations"));
      }
    } finally {
      if (!preserveData) setAutomationLoading(false);
    }
  }, [t, timeZone]);

  const fetchRecentActivities = useCallback(async (preserveData = false) => {
    if (!preserveData) setRecentLoading(true);
    setRecentError(null);
    try {
      const data = await activityService.list({ page: 1, page_size: 5 });
      setRecentRecords(
        data.items.map((item) => ({
          id: String(item.id),
          type: item.type,
          status: item.status,
          previewKey: item.preview_key,
          accountHandle: item.account_handle,
          sourceModule: item.source_module,
          executedAt: item.executed_at,
          errorMessage: item.error_message,
          failureCategory: item.failure_category,
          replyCommentTweetId: item.reply_comment_tweet_id,
          replyToUsername: item.reply_to_username,
          replyToTextPreview: item.reply_to_text_preview,
          replyTextPreview: item.reply_text_preview,
        }))
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setRecentError(error.response?.data?.message || t("dashboard.errors.loadRecentActivity"));
      } else {
        setRecentError(t("dashboard.errors.loadRecentActivity"));
      }
    } finally {
      if (!preserveData) setRecentLoading(false);
    }
  }, [t]);

  const fetchOAFBotDashboard = useCallback(async (preserveData = false) => {
    if (!preserveData) setOAFBotDashboardLoading(true);
    setOAFBotDashboardError(null);
    try {
      const [botData, matrixData, queueData] = await Promise.all([
        oafBotService.list(),
        oafBotService.matrixSignals(),
        reviewQueueService.list({ pageSize: 1 }),
      ]);
      setOAFBotDashboard({
        bots: botData.items,
        usage: botData.usage,
        limits: botData.limits,
        inspectionSummary: matrixData.summary || null,
      });
      setReviewStats(queueData.stats);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setOAFBotDashboardError(error.response?.data?.message || t("dashboard.errors.loadOAFBots"));
      } else {
        setOAFBotDashboardError(t("dashboard.errors.loadOAFBots"));
      }
      if (!preserveData) {
        setOAFBotDashboard(null);
        setReviewStats(null);
      }
    } finally {
      if (!preserveData) setOAFBotDashboardLoading(false);
    }
  }, [t]);

  const fetchPointsDashboard = useCallback(async (preserveData = false) => {
    if (!preserveData) setPointsDashboardLoading(true);
    setPointsDashboardError(null);
    try {
      const [points, referral] = await Promise.all([
        pointService.center(),
        referralService.info().catch(() => null),
      ]);
      setPointsDashboard({ points, referral });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setPointsDashboardError(error.response?.data?.message || t("dashboard.points.loadFailed"));
      } else {
        setPointsDashboardError(t("dashboard.points.loadFailed"));
      }
      if (!preserveData) setPointsDashboard(null);
    } finally {
      if (!preserveData) setPointsDashboardLoading(false);
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    dashboardService
      .overview()
      .then((data) => {
        if (cancelled) return;
        setOverview(data);
        setLoadState("ready");
        broadcastDataSynced(Date.now());
      })
      .catch((error) => {
        if (cancelled) return;
        if (axios.isAxiosError(error)) {
          setErrorMessage(error.response?.data?.message || t("dashboard.errors.loadOverview"));
        } else {
          setErrorMessage(t("dashboard.errors.loadOverview"));
        }
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    setAutomationLoading(true);
    setAutomationError(null);
    automationService
      .list()
      .then((data) => {
        if (cancelled) return;
        setAutomations(data.modules.map((item) => mapAutomation(item, timeZone)));
      })
      .catch((error) => {
        if (cancelled) return;
        if (axios.isAxiosError(error)) {
          setAutomationError(error.response?.data?.message || t("dashboard.errors.loadAutomations"));
        } else {
          setAutomationError(t("dashboard.errors.loadAutomations"));
        }
      })
      .finally(() => {
        if (cancelled) return;
        setAutomationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t, timeZone]);

  useEffect(() => {
    let cancelled = false;
    setRecentLoading(true);
    setRecentError(null);
    activityService
      .list({ page: 1, page_size: 5 })
      .then((data) => {
        if (cancelled) return;
        setRecentRecords(
          data.items.map((item) => ({
            id: String(item.id),
            type: item.type,
            status: item.status,
            previewKey: item.preview_key,
            accountHandle: item.account_handle,
            sourceModule: item.source_module,
            executedAt: item.executed_at,
            errorMessage: item.error_message,
            failureCategory: item.failure_category,
            replyCommentTweetId: item.reply_comment_tweet_id,
            replyToUsername: item.reply_to_username,
            replyToTextPreview: item.reply_to_text_preview,
            replyTextPreview: item.reply_text_preview,
          }))
        );
      })
      .catch((error) => {
        if (cancelled) return;
        if (axios.isAxiosError(error)) {
          setRecentError(error.response?.data?.message || t("dashboard.errors.loadRecentActivity"));
        } else {
          setRecentError(t("dashboard.errors.loadRecentActivity"));
        }
      })
      .finally(() => {
        if (!cancelled) setRecentLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    return subscribeDashboardRefresh(() => {
      void fetchOverview(true);
      void fetchAutomations(true);
      void fetchRecentActivities(true);
      void fetchOAFBotDashboard(true);
      void fetchPointsDashboard(true);
    });
  }, [fetchAutomations, fetchOAFBotDashboard, fetchOverview, fetchPointsDashboard, fetchRecentActivities]);

  useEffect(() => {
    void fetchOAFBotDashboard();
  }, [fetchOAFBotDashboard]);

  useEffect(() => {
    void fetchPointsDashboard();
  }, [fetchPointsDashboard]);

  useEffect(() => {
    return subscribePageRefreshRequest(() => {
      void (async () => {
        try {
          setDashboardRefreshing(true);
          await Promise.all([
            fetchOverview(true),
            fetchAutomations(true),
            fetchRecentActivities(true),
            fetchOAFBotDashboard(true),
            fetchPointsDashboard(true),
          ]);
          broadcastDataSynced(Date.now());
        } finally {
          setDashboardRefreshing(false);
          broadcastPageRefreshComplete();
        }
      })();
    });
  }, [fetchAutomations, fetchOAFBotDashboard, fetchOverview, fetchPointsDashboard, fetchRecentActivities]);

  const copyInviteLink = useCallback(async () => {
    const link = pointsDashboard?.referral?.invite_link;
    if (!link) {
      pushToast(t("dashboard.points.copyUnavailable"));
      return;
    }
    try {
      await navigator.clipboard.writeText(link);
      pushToast(t("dashboard.points.copied"));
    } catch {
      pushToast(t("dashboard.points.copyFailed"));
    }
  }, [pointsDashboard?.referral?.invite_link, pushToast, t]);

  const botCount = oafBotDashboard?.bots.length ?? 0;
  const boundBotCount = oafBotDashboard?.bots.filter((bot) => Boolean(bot.twitter_account_id)).length ?? 0;
  const readyBotCount = oafBotDashboard?.bots.filter(isBotReady).length ?? 0;
  const notReadyBotCount = Math.max(0, botCount - readyBotCount);
  const autoPostNotReadyCount = oafBotDashboard?.inspectionSummary?.auto_post_not_ready_count ?? 0;
  const autoPostConfigured = botCount > 0 && autoPostNotReadyCount < botCount;
  const pendingReviewCount = (reviewStats?.pending_review ?? 0) + (reviewStats?.ready_to_publish ?? 0);
  const failedQueueCount = reviewStats?.failed ?? 0;
  const queueHasSignal = pendingReviewCount > 0 || failedQueueCount > 0 || recentRecords.length > 0 || (overview?.activity_count_24h ?? 0) > 0;
  const xAccountConnected = (overview?.connected_x_count ?? 0) > 0;
  const automationEnabled = xAccountConnected && automations.some((module) => module.config.enabled);
  const xAuthIssueCount = recentRecords.filter((record) => record.failureCategory === "x_auth").length;
  const attentionItems = [
    {
      key: "x_auth",
      count: xAuthIssueCount,
      labelKey: "dashboard.attention.xAuth",
      href: "/accounts",
      tone: "danger" as const,
    },
    {
      key: "review",
      count: pendingReviewCount,
      labelKey: "dashboard.attention.reviewBacklog",
      href: "/review-queue",
      tone: "warning" as const,
    },
    {
      key: "failed",
      count: failedQueueCount,
      labelKey: "dashboard.attention.failedQueue",
      href: "/execution-queue",
      tone: "danger" as const,
    },
    {
      key: "auto_post",
      count: oafBotDashboard?.inspectionSummary?.auto_post_not_ready_count ?? 0,
      labelKey: "dashboard.attention.autoPostNotReady",
      href: "/oaf-bots",
      tone: "warning" as const,
    },
    {
      key: "quota",
      count: quotaExhausted(oafBotDashboard) ? 1 : 0,
      labelKey: "dashboard.attention.quotaExhausted",
      href: "/billing",
      tone: "warning" as const,
    },
  ].filter((item) => item.count > 0);

  return (
    <div className="space-y-4 md:space-y-5">
      {loadState === "error" ? (
        <Card>
          <CardHeader title={t("dashboard.error.title")} description={errorMessage || t("common.retryHint")} />
          <div className="flex justify-end">
            <Button onClick={() => void fetchOverview()}>{t("common.retry")}</Button>
          </div>
        </Card>
      ) : null}

      {dashboardRefreshing ? (
        <div className="flex justify-end">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#1d9bf0]/30 bg-[#1d9bf0]/10 px-3 py-1.5 text-xs font-semibold text-[#8ecdf8]">
            <span className="size-1.5 animate-pulse rounded-full bg-[#1d9bf0]" />
            {t("dashboard.refreshingInline")}
          </span>
        </div>
      ) : null}

      <StatusOverviewCards overview={overview} loading={loadState === "loading"} />
      <UserOnboardingCard
        accountConnected={xAccountConnected}
        oafBotCreated={botCount > 0}
        autoPostConfigured={autoPostConfigured}
        automationEnabled={automationEnabled}
        executionQueueChecked={queueHasSignal}
      />
      <FirstUseGuideCard
        loading={loadState === "loading" || oafBotDashboardLoading || automationLoading || recentLoading}
        accountConnected={xAccountConnected}
        hasBot={botCount > 0}
        autoPostConfigured={autoPostConfigured}
        automationEnabled={automationEnabled}
        hasExecutionSignal={queueHasSignal}
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <OAFBotReadinessCard
          loading={oafBotDashboardLoading}
          errorMessage={oafBotDashboardError}
          total={botCount}
          bound={boundBotCount}
          ready={readyBotCount}
          notReady={notReadyBotCount}
          autoPostNotReady={autoPostNotReadyCount}
          onRetry={() => void fetchOAFBotDashboard()}
        />
        <AttentionCard
          loading={oafBotDashboardLoading || recentLoading}
          items={attentionItems}
        />
      </div>
      <PointsEntryCard
        loading={pointsDashboardLoading}
        errorMessage={pointsDashboardError}
        data={pointsDashboard}
        onRetry={() => void fetchPointsDashboard()}
        onCopyInvite={copyInviteLink}
      />
      <XAccountStatus overview={overview} />
      <AutomationOverview
        modules={automations}
        loading={automationLoading}
        errorMessage={automationError}
        onRetry={() => void fetchAutomations()}
        monthlyUsage={automationMonthlyUsage(oafBotDashboard)}
      />
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <RecentActivityList
          records={recentRecords}
          loading={recentLoading}
          errorMessage={recentError}
          onRetry={() => void fetchRecentActivities()}
        />
        <TrialUpgradeBanner overview={overview} />
      </div>
    </div>
  );
}

function FirstUseGuideCard({
  loading,
  accountConnected,
  hasBot,
  autoPostConfigured,
  automationEnabled,
  hasExecutionSignal,
}: {
  loading: boolean;
  accountConnected: boolean;
  hasBot: boolean;
  autoPostConfigured: boolean;
  automationEnabled: boolean;
  hasExecutionSignal: boolean;
}) {
  const { t } = useT();
  if (loading || (accountConnected && hasBot && autoPostConfigured && automationEnabled && hasExecutionSignal)) {
    return null;
  }
  const items = [
    {
      key: "account",
      done: accountConnected,
      title: t("dashboard.firstUse.account.title"),
      description: t("dashboard.firstUse.account.description"),
      href: "/accounts",
      cta: t("dashboard.firstUse.account.cta"),
    },
    {
      key: "bot",
      done: hasBot,
      title: t("dashboard.firstUse.bot.title"),
      description: t("dashboard.firstUse.bot.description"),
      href: "/oaf-bots",
      cta: t("dashboard.firstUse.bot.cta"),
    },
    {
      key: "autoPost",
      done: autoPostConfigured,
      title: t("dashboard.firstUse.autoPost.title"),
      description: t("dashboard.firstUse.autoPost.description"),
      href: "/auto-post",
      cta: t("dashboard.firstUse.autoPost.cta"),
    },
    {
      key: "automation",
      done: automationEnabled,
      title: t("dashboard.firstUse.automation.title"),
      description: t("dashboard.firstUse.automation.description"),
      href: "/automations",
      cta: t("dashboard.firstUse.automation.cta"),
    },
    {
      key: "queue",
      done: hasExecutionSignal,
      title: t("dashboard.firstUse.queue.title"),
      description: t("dashboard.firstUse.queue.description"),
      href: "/execution-queue",
      cta: t("dashboard.firstUse.queue.cta"),
    },
  ];
  const nextItem = items.find((item) => !item.done) ?? items[items.length - 1];
  return (
    <Card className="border-[#1d9bf0]/30 bg-[#06111d]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#1d9bf0]/12 text-[#1d9bf0]">
              <PlayCircle className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-[#e7e9ea]">{t("dashboard.firstUse.title")}</h2>
              <p className="mt-1 text-sm leading-6 text-[#8b98a5]">{t("dashboard.firstUse.description")}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            {items.map((item, index) => (
              <Link
                key={item.key}
                href={item.href}
                className={`rounded-2xl border p-3 transition hover:bg-[#16181c] ${
                  item.done ? "border-emerald-300/20 bg-emerald-400/8" : "border-[#2f3336] bg-black"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-[#71767b]">{t("dashboard.firstUse.step", { number: index + 1 })}</span>
                  <span className={`grid size-6 place-items-center rounded-full ${item.done ? "bg-emerald-400/10 text-emerald-200" : "bg-[#1d9bf0]/10 text-[#1d9bf0]"}`}>
                    {item.done ? <CheckCircle2 className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-[#e7e9ea]">{item.title}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#71767b]">{item.description}</p>
              </Link>
            ))}
          </div>
        </div>
        <Link href={nextItem.href} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-[#1d9bf0] px-4 text-sm font-semibold text-white transition hover:bg-[#1a8cd8]">
          {nextItem.cta}
          <ChevronRight className="size-4" />
        </Link>
      </div>
    </Card>
  );
}

function PointsEntryCard({
  loading,
  errorMessage,
  data,
  onRetry,
  onCopyInvite,
}: {
  loading: boolean;
  errorMessage: string | null;
  data: PointsDashboardData | null;
  onRetry: () => void;
  onCopyInvite: () => void;
}) {
  const { t } = useT();
  const balance = data?.points.account.balance ?? 0;
  const frozen = data?.points.account.frozen ?? 0;
  const rate = Number.parseFloat(data?.points.account.exchange_rate || "10") || 10;
  const discount = balance / rate;
  const inviteUses = data?.referral?.use_count ?? 0;
  return (
    <Card>
      <CardHeader title={t("dashboard.points.title")} description={t("dashboard.points.description")} />
      {loading ? (
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-stretch">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <SkeletonLine className="h-3 w-20" />
                  <SkeletonLine className="mt-4 h-8 w-24" />
                </div>
                <span className="size-10 animate-pulse rounded-full bg-[#1d9bf0]/10" />
              </div>
              <SkeletonLine className="mt-4 h-4 w-36" />
            </div>
          ))}
          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-[#2f3336] bg-black p-4 lg:min-w-64">
            <div>
              <SkeletonLine className="h-4 w-32" />
              <SkeletonLine className="mt-3 h-3 w-44" />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <SkeletonLine className="h-10 w-full" />
              <SkeletonLine className="h-10 w-full" />
            </div>
          </div>
        </div>
      ) : errorMessage ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-300/25 bg-rose-500/10 p-3">
          <p className="text-sm text-rose-100">{errorMessage}</p>
          <button className="text-xs text-white underline underline-offset-2" onClick={onRetry} type="button">
            {t("common.retry")}
          </button>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[1fr_1fr_auto] lg:items-stretch">
          <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-[#71767b]">{t("dashboard.points.balance")}</p>
                <p className="mt-2 text-3xl font-bold text-[#e7e9ea]">{balance}</p>
              </div>
              <span className="grid size-10 place-items-center rounded-full bg-[#1d9bf0]/10 text-[#1d9bf0]">
                <Coins className="size-5" />
              </span>
            </div>
            <p className="mt-3 text-sm text-[#71767b]">{t("dashboard.points.frozen", { count: frozen })}</p>
          </div>
          <div className="rounded-2xl border border-[#00ba7c]/20 bg-[#00ba7c]/10 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-[#7ee0b5]">{t("dashboard.points.discountLabel")}</p>
                <p className="mt-2 text-3xl font-bold text-white">{discount.toFixed(1).replace(/\.0$/, "")} USDT</p>
              </div>
              <span className="grid size-10 place-items-center rounded-full bg-[#00ba7c]/10 text-[#7ee0b5]">
                <Gift className="size-5" />
              </span>
            </div>
            <p className="mt-3 text-sm text-[#7ee0b5]/80">{t("dashboard.points.rate", { points: rate })}</p>
          </div>
          <div className="flex flex-col justify-between gap-3 rounded-2xl border border-[#2f3336] bg-black p-4 lg:min-w-64">
            <div>
              <p className="text-sm font-semibold text-[#e7e9ea]">{t("dashboard.points.referralTitle")}</p>
              <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("dashboard.points.referralUses", { count: inviteUses })}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              <Button type="button" onClick={onCopyInvite} disabled={!data?.referral?.invite_link}>
                <Copy className="size-4" />
                {t("dashboard.points.copyInvite")}
              </Button>
              <Link href="/points" className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[#2f3336] px-4 text-sm font-semibold text-[#e7e9ea] transition hover:bg-[#16181c]">
                {t("dashboard.points.openCenter")}
                <ChevronRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function OAFBotReadinessCard({
  loading,
  errorMessage,
  total,
  bound,
  ready,
  notReady,
  autoPostNotReady,
  onRetry,
}: {
  loading: boolean;
  errorMessage: string | null;
  total: number;
  bound: number;
  ready: number;
  notReady: number;
  autoPostNotReady: number;
  onRetry: () => void;
}) {
  const { t } = useT();
  const readyPct = total > 0 ? Math.round((ready / total) * 100) : 0;
  return (
    <Card>
      <CardHeader title={t("dashboard.oafBots.title")} description={t("dashboard.oafBots.description")} />
      {loading ? (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SkeletonLine className="h-8 w-20" />
              <SkeletonLine className="mt-3 h-3 w-32" />
            </div>
            <span className="size-10 animate-pulse rounded-full bg-[#1d9bf0]/10" />
          </div>
          <SkeletonLine className="h-2 w-full" />
          <div className="grid gap-2 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="rounded-2xl border border-[#2f3336] bg-black px-3 py-2">
                <SkeletonLine className="h-3 w-20" />
                <SkeletonLine className="mt-3 h-6 w-8" />
              </div>
            ))}
          </div>
          <SkeletonLine className="h-4 w-32" />
        </div>
      ) : errorMessage ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-300/25 bg-rose-500/10 p-3">
          <p className="text-sm text-rose-100">{errorMessage}</p>
          <button className="text-xs text-white underline underline-offset-2" onClick={onRetry} type="button">
            {t("common.retry")}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-3xl font-bold text-[#e7e9ea]">{ready}/{total}</p>
              <p className="mt-1 text-xs text-[#71767b]">{t("dashboard.oafBots.readyRatio")}</p>
            </div>
            <span className="grid size-10 place-items-center rounded-full bg-[#1d9bf0]/10 text-[#1d9bf0]">
              <Bot className="size-5" />
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#2f3336]">
            <span className="block h-full rounded-full bg-[#1d9bf0]" style={{ width: `${readyPct}%` }} />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <MiniMetric label={t("dashboard.oafBots.metric.bound")} value={bound} />
            <MiniMetric label={t("dashboard.oafBots.metric.notReady")} value={notReady} />
            <MiniMetric label={t("dashboard.oafBots.metric.autoPost")} value={autoPostNotReady} />
          </div>
          <Link href="/oaf-bots" className="inline-flex items-center gap-2 text-sm font-semibold text-[#1d9bf0] hover:underline">
            {t(total > 0 ? "dashboard.oafBots.ctaManage" : "dashboard.oafBots.ctaCreate")}
            <ExternalLink className="size-4" />
          </Link>
        </div>
      )}
    </Card>
  );
}

function AttentionCard({
  loading,
  items,
}: {
  loading: boolean;
  items: Array<{ key: string; count: number; labelKey: string; href: string; tone: "warning" | "danger" }>;
}) {
  const { t } = useT();
  return (
    <Card>
      <CardHeader title={t("dashboard.attention.title")} description={t("dashboard.attention.description")} />
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex items-center justify-between gap-3 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3">
              <span className="flex min-w-0 items-center gap-3">
                <span className="size-8 animate-pulse rounded-full bg-[#1d9bf0]/10" />
                <SkeletonLine className="h-4 w-40" />
              </span>
              <SkeletonLine className="h-4 w-4" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4">
          <div className="flex gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-200" />
            <div>
              <p className="font-semibold text-emerald-100">{t("dashboard.attention.emptyTitle")}</p>
              <p className="mt-1 text-sm leading-6 text-emerald-100/70">{t("dashboard.attention.emptyDescription")}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const Icon = item.tone === "danger" ? ShieldAlert : AlertTriangle;
            return (
              <Link
                key={item.key}
                href={item.href}
                className="flex items-center justify-between gap-3 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3 transition hover:bg-[#16181c]"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className={`grid size-8 shrink-0 place-items-center rounded-full ${item.tone === "danger" ? "bg-rose-500/10 text-rose-200" : "bg-amber-400/10 text-amber-100"}`}>
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 text-sm font-semibold text-[#e7e9ea]">{t(item.labelKey, { count: item.count })}</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-[#71767b]" />
              </Link>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function MiniMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black px-3 py-2">
      <p className="text-xs text-[#71767b]">{label}</p>
      <p className="mt-1 text-lg font-bold text-[#e7e9ea]">{value}</p>
    </div>
  );
}
