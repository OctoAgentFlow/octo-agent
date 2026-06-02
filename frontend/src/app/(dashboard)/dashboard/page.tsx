"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import axios from "axios";
import { AlertTriangle, Bot, CheckCircle2, ChevronDown, ChevronRight, Coins, Copy, ExternalLink, Gift, Inbox, MessageCircle, PlayCircle, Reply, Send, ShieldAlert, Sparkles, type LucideIcon } from "lucide-react";

import { AutomationOverview } from "@/components/dashboard/automation-overview";
import { RecentActivityList } from "@/components/dashboard/recent-activity-list";
import { StatusOverviewCards } from "@/components/dashboard/status-overview-cards";
import { TrialUpgradeBanner } from "@/components/dashboard/trial-upgrade-banner";
import { XAccountStatus } from "@/components/dashboard/x-account-status";
import { OperationalBlockersCard, type OperationalBlocker } from "@/components/operations/operational-blockers-card";
import { UserOnboardingCard } from "@/components/onboarding/user-onboarding-card";
import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import {
  broadcastDataSynced,
  broadcastPageRefreshComplete,
  subscribePageRefreshRequest,
} from "@/lib/app-page-refresh";
import { subscribeDashboardRefresh } from "@/lib/dashboard-refresh";
import { formatDateTime, formatTimeOnly, usePreferredTimeZone } from "@/lib/timezone";
import { activityService } from "@/services/activity.service";
import { automationService, type AutomationModuleApi } from "@/services/automation.service";
import { dashboardService, type DashboardOverview, type DashboardWorkbench, type DashboardWorkbenchItem } from "@/services/dashboard.service";
import { oafBotService } from "@/services/oaf-bot.service";
import { pointService, type PointCenterApi } from "@/services/point.service";
import { publishingService, type PublishJobApi } from "@/services/publishing.service";
import { referralService, type ReferralInfoApi } from "@/services/referral.service";
import { reviewQueueService, type ReviewQueueFeedbackIssueVerdictDetailApi, type ReviewQueueFeedbackIssueVerdictStatApi, type ReviewQueueStatsApi } from "@/services/review-queue.service";
import { useT } from "@/i18n/use-t";
import type { ActivityRecord } from "@/types/activity";
import type { AutomationModule } from "@/types/automation";
import type { PlanLimits, PlanUsage } from "@/types/billing";
import type { OAFBot, OAFBotFeedbackSummary, OAFBotLearningRulePreference, OAFBotMatrixInspectionSummary } from "@/types/oaf-bot";

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
  feedbackSummary: OAFBotFeedbackSummary | null;
  learningRulePreferences: OAFBotLearningRulePreference[];
};

type PointsDashboardData = {
  points: PointCenterApi;
  referral: ReferralInfoApi | null;
};

type TodayOpsItem = {
  id: string;
  icon: LucideIcon;
  title: string;
  meta: string;
  href: string;
  tone: "blue" | "green" | "amber" | "rose";
  score?: number;
};

type DeferredDashboardSectionKey = "points" | "automation" | "recent";

function percentLabel(value: number) {
  return `${Math.round(value * 100)}%`;
}

function dashboardLearningPreferenceStatus(preferences: OAFBotLearningRulePreference[], botID: number | undefined, issue: string) {
  if (!botID || !issue) return "enabled";
  return preferences.find((item) => item.bot_id === botID && item.feedback_issue === issue)?.status || "enabled";
}

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

function compactDashboardText(value: string | undefined, maxLength = 120) {
  const normalized = (value || "")
    .replace(/https?:\/\/\S+/g, "link")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function dashboardWorkbenchIcon(type: string) {
  if (type === "reply") return Reply;
  if (type === "comment") return MessageCircle;
  return Inbox;
}

function dashboardWorkbenchTone(tone: string): TodayOpsItem["tone"] {
  if (tone === "rose" || tone === "green" || tone === "amber" || tone === "blue") return tone;
  return "amber";
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
  const [automationLoading, setAutomationLoading] = useState<boolean>(false);
  const [automationError, setAutomationError] = useState<string | null>(null);
  const [automationRequested, setAutomationRequested] = useState(false);
  const [recentRecords, setRecentRecords] = useState<ActivityRecord[]>([]);
  const [recentLoading, setRecentLoading] = useState(false);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [recentRequested, setRecentRequested] = useState(false);
  const [oafBotDashboard, setOAFBotDashboard] = useState<OAFBotDashboardData | null>(null);
  const [oafBotDashboardLoading, setOAFBotDashboardLoading] = useState(true);
  const [oafBotDashboardError, setOAFBotDashboardError] = useState<string | null>(null);
  const [reviewStats, setReviewStats] = useState<ReviewQueueStatsApi | null>(null);
  const [feedbackIssueVerdictStats, setFeedbackIssueVerdictStats] = useState<ReviewQueueFeedbackIssueVerdictStatApi[]>([]);
  const [feedbackIssueVerdictDetails, setFeedbackIssueVerdictDetails] = useState<ReviewQueueFeedbackIssueVerdictDetailApi[]>([]);
  const [feedbackIssueVerdictDetailsLoading, setFeedbackIssueVerdictDetailsLoading] = useState(false);
  const [feedbackIssueVerdictDetailsRequested, setFeedbackIssueVerdictDetailsRequested] = useState(false);
  const [pointsDashboard, setPointsDashboard] = useState<PointsDashboardData | null>(null);
  const [pointsDashboardLoading, setPointsDashboardLoading] = useState(false);
  const [pointsDashboardError, setPointsDashboardError] = useState<string | null>(null);
  const [pointsDashboardRequested, setPointsDashboardRequested] = useState(false);
  const [todayOps, setTodayOps] = useState<DashboardWorkbench | null>(null);
  const [todayOpsLoading, setTodayOpsLoading] = useState(true);
  const [todayOpsError, setTodayOpsError] = useState<string | null>(null);
  const [publishJobs, setPublishJobs] = useState<PublishJobApi[]>([]);
  const [publishJobsLoading, setPublishJobsLoading] = useState(true);
  const [publishJobsError, setPublishJobsError] = useState<string | null>(null);
  const [dashboardRefreshing, setDashboardRefreshing] = useState(false);
  const [deferredSectionsOpen, setDeferredSectionsOpen] = useState<Record<DeferredDashboardSectionKey, boolean>>({
    points: false,
    automation: false,
    recent: false,
  });

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
    setAutomationRequested(true);
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
    setRecentRequested(true);
    if (!preserveData) setRecentLoading(true);
    setRecentError(null);
    try {
      const data = await activityService.list({ page: 1, page_size: 4 });
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
          reviewQueueBulk: item.review_queue_bulk,
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
      const data = await oafBotService.dashboardSummary(7);
      setOAFBotDashboard({
        bots: data.bots,
        usage: data.usage,
        limits: data.limits,
        inspectionSummary: data.inspection_summary || null,
        feedbackSummary: data.feedback_summary || null,
        learningRulePreferences: data.learning_rule_preferences || [],
      });
      setFeedbackIssueVerdictStats(data.verdict_stats || []);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setOAFBotDashboardError(error.response?.data?.message || t("dashboard.errors.loadOAFBots"));
      } else {
        setOAFBotDashboardError(t("dashboard.errors.loadOAFBots"));
      }
      if (!preserveData) {
        setOAFBotDashboard(null);
        setReviewStats(null);
        setFeedbackIssueVerdictStats([]);
        setFeedbackIssueVerdictDetails([]);
        setFeedbackIssueVerdictDetailsRequested(false);
      }
    } finally {
      if (!preserveData) setOAFBotDashboardLoading(false);
    }
  }, [t]);

  const fetchFeedbackIssueVerdictDetails = useCallback(async () => {
    if (feedbackIssueVerdictDetailsLoading) return;
    setFeedbackIssueVerdictDetailsLoading(true);
    setFeedbackIssueVerdictDetailsRequested(true);
    try {
      const data = await reviewQueueService.feedbackIssueVerdictDetails({ limit: 20 });
      setFeedbackIssueVerdictDetails(data.items || []);
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("dashboard.feedbackLearning.details.loadFailed") : t("dashboard.feedbackLearning.details.loadFailed"));
    } finally {
      setFeedbackIssueVerdictDetailsLoading(false);
    }
  }, [feedbackIssueVerdictDetailsLoading, pushToast, t]);

  const fetchPointsDashboard = useCallback(async (preserveData = false) => {
    setPointsDashboardRequested(true);
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

  const fetchTodayOps = useCallback(async (preserveData = false) => {
    if (!preserveData) setTodayOpsLoading(true);
    setTodayOpsError(null);
    try {
      const data = await dashboardService.workbench();
      setTodayOps(data);
      setReviewStats(data.stats);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setTodayOpsError(error.response?.data?.message || t("dashboard.todayOps.loadFailed"));
      } else {
        setTodayOpsError(t("dashboard.todayOps.loadFailed"));
      }
      if (!preserveData) setTodayOps(null);
    } finally {
      if (!preserveData) setTodayOpsLoading(false);
    }
  }, [t]);

  const fetchPublishJobs = useCallback(async (preserveData = false) => {
    if (!preserveData) setPublishJobsLoading(true);
    setPublishJobsError(null);
    try {
      const data = await publishingService.jobs();
      setPublishJobs(data.items || []);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setPublishJobsError(error.response?.data?.message || t("dashboard.publishReview.loadFailed"));
      } else {
        setPublishJobsError(t("dashboard.publishReview.loadFailed"));
      }
      if (!preserveData) setPublishJobs([]);
    } finally {
      if (!preserveData) setPublishJobsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    return subscribeDashboardRefresh(() => {
      void fetchOverview(true);
      void fetchAutomations(true);
      void fetchRecentActivities(true);
      void fetchOAFBotDashboard(true);
      void fetchPointsDashboard(true);
      void fetchTodayOps(true);
      void fetchPublishJobs(true);
    });
  }, [fetchAutomations, fetchOAFBotDashboard, fetchOverview, fetchPointsDashboard, fetchPublishJobs, fetchRecentActivities, fetchTodayOps]);

  useEffect(() => {
    void fetchOAFBotDashboard();
  }, [fetchOAFBotDashboard]);

  useEffect(() => {
    void fetchTodayOps();
  }, [fetchTodayOps]);

  useEffect(() => {
    void fetchPublishJobs();
  }, [fetchPublishJobs]);

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
            fetchTodayOps(true),
            fetchPublishJobs(true),
          ]);
          broadcastDataSynced(Date.now());
        } finally {
          setDashboardRefreshing(false);
          broadcastPageRefreshComplete();
        }
      })();
    });
  }, [fetchAutomations, fetchOAFBotDashboard, fetchOverview, fetchPointsDashboard, fetchPublishJobs, fetchRecentActivities, fetchTodayOps]);

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

  const updateLearningRulePreference = useCallback(async (botID: number, feedbackIssue: string, status: "enabled" | "disabled") => {
    const saved = await oafBotService.saveLearningRulePreference(botID, feedbackIssue, status);
    setOAFBotDashboard((current) => {
      if (!current) return current;
      const existing = current.learningRulePreferences || [];
      const next = existing.some((item) => item.bot_id === botID && item.feedback_issue === feedbackIssue)
        ? existing.map((item) => (item.bot_id === botID && item.feedback_issue === feedbackIssue ? saved : item))
        : [...existing, saved];
      return { ...current, learningRulePreferences: next };
    });
    pushToast(t(status === "disabled" ? "dashboard.feedbackLearning.ruleSavedDisabled" : "dashboard.feedbackLearning.ruleSavedEnabled"));
  }, [pushToast, t]);

  const openDeferredSection = useCallback((section: DeferredDashboardSectionKey) => {
    setDeferredSectionsOpen((current) => ({ ...current, [section]: !current[section] }));
    if (section === "points" && !pointsDashboardRequested) {
      void fetchPointsDashboard();
    }
    if (section === "automation" && !automationRequested) {
      void fetchAutomations();
    }
    if (section === "recent" && !recentRequested) {
      void fetchRecentActivities();
    }
  }, [automationRequested, fetchAutomations, fetchPointsDashboard, fetchRecentActivities, pointsDashboardRequested, recentRequested]);

  const botCount = oafBotDashboard?.bots.length ?? 0;
  const boundBotCount = oafBotDashboard?.bots.filter((bot) => Boolean(bot.twitter_account_id)).length ?? 0;
  const readyBotCount = oafBotDashboard?.bots.filter(isBotReady).length ?? 0;
  const notReadyBotCount = Math.max(0, botCount - readyBotCount);
  const autoPostNotReadyCount = oafBotDashboard?.inspectionSummary?.auto_post_not_ready_count ?? 0;
  const autoPostConfigured = botCount > 0 && autoPostNotReadyCount < botCount;
  const pendingReviewCount = (reviewStats?.pending_review ?? 0) + (reviewStats?.ready_to_publish ?? 0);
  const failedQueueCount = reviewStats?.failed ?? 0;
  const approvedQueueCount = reviewStats?.approved ?? 0;
  const rejectedQueueCount = reviewStats?.rejected ?? 0;
  const pausedAutomationCount = automations.filter((module) => !module.config.enabled).length;
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
      href: "/execution-queue?status=pending_review",
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

  const mapWorkbenchItem = (item: DashboardWorkbenchItem): TodayOpsItem => {
    const typeLabel = t(`executionQueue.type.${item.type}`);
    const statusLabel = item.status ? t(`executionQueue.status.${item.status}`) : "";
    const score = item.score || 0;
    const isOpportunity = score > 0;
    return {
      id: item.id,
      icon: dashboardWorkbenchIcon(item.type),
      title: isOpportunity ? compactDashboardText(item.title || typeLabel || t("dashboard.todayOps.noContext"), 28) : typeLabel,
      meta: isOpportunity ? t("dashboard.todayOps.meta.score", { score }) : statusLabel,
      href: item.href,
      tone: dashboardWorkbenchTone(item.tone),
      score: isOpportunity ? score : undefined,
    };
  };

  const todayOpportunityItems: TodayOpsItem[] = (todayOps?.opportunities || []).map(mapWorkbenchItem);
  const todayReviewItems: TodayOpsItem[] = (todayOps?.reviews || []).map(mapWorkbenchItem);
  const operationalBlockers: OperationalBlocker[] = attentionItems.map((item) => ({
    id: item.key,
    title: t(item.labelKey, { count: item.count }),
    description: t(`dashboard.operationalBlockers.${item.key}.description`),
    href: item.href,
    actionLabel: t(`dashboard.operationalBlockers.${item.key}.action`),
    severity: item.tone === "danger" ? "danger" : "warning",
    countLabel: item.key === "quota" ? undefined : String(item.count),
  }));

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
      <TodayOpsWorkbench
        loading={todayOpsLoading}
        errorMessage={todayOpsError}
        opportunities={todayOpportunityItems}
        reviews={todayReviewItems}
        alerts={attentionItems.slice(0, 4)}
        onRetry={() => void fetchTodayOps()}
      />
      <OperationalBlockersCard
        title={t("dashboard.operationalBlockers.title")}
        description={t("dashboard.operationalBlockers.description")}
        loading={oafBotDashboardLoading || todayOpsLoading}
        blockers={operationalBlockers}
        emptyTitle={t("dashboard.operationalBlockers.emptyTitle")}
        emptyDescription={t("dashboard.operationalBlockers.emptyDescription")}
      />
      <WorkflowProgressCard
        loading={oafBotDashboardLoading}
        pending={pendingReviewCount}
        approved={approvedQueueCount}
        rejected={rejectedQueueCount}
        failed={failedQueueCount}
        paused={automationRequested ? pausedAutomationCount : null}
      />
      <PublishReviewCard
        loading={publishJobsLoading}
        errorMessage={publishJobsError}
        jobs={publishJobs}
        timeZone={timeZone}
        onRetry={() => void fetchPublishJobs()}
      />
      <FeedbackLearningCard
        loading={oafBotDashboardLoading}
        summary={oafBotDashboard?.feedbackSummary || null}
        verdictStats={feedbackIssueVerdictStats}
        verdictDetails={feedbackIssueVerdictDetails}
        verdictDetailsLoading={feedbackIssueVerdictDetailsLoading}
        verdictDetailsRequested={feedbackIssueVerdictDetailsRequested}
        bot={oafBotDashboard?.bots[0] || null}
        learningRulePreferences={oafBotDashboard?.learningRulePreferences || []}
        timeZone={timeZone}
        onLoadVerdictDetails={fetchFeedbackIssueVerdictDetails}
        onUpdateLearningRulePreference={updateLearningRulePreference}
      />
      <FirstUseGuideCard
        loading={loadState === "loading" || oafBotDashboardLoading}
        accountConnected={xAccountConnected}
        hasBot={botCount > 0}
        autoPostConfigured={autoPostConfigured}
        automationEnabled={automationRequested ? automationEnabled : true}
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
      <XAccountStatus overview={overview} />
      <DeferredDashboardSection
        open={deferredSectionsOpen.points}
        title={t("dashboard.points.title")}
        description={t("dashboard.points.description")}
        summary={pointsDashboardRequested ? t("dashboard.deferred.loaded") : t("dashboard.deferred.pointsSummary")}
        onToggle={() => openDeferredSection("points")}
      >
        <PointsEntryCard
          loading={pointsDashboardLoading}
          errorMessage={pointsDashboardError}
          data={pointsDashboard}
          onRetry={() => void fetchPointsDashboard()}
          onCopyInvite={copyInviteLink}
        />
      </DeferredDashboardSection>
      <DeferredDashboardSection
        open={deferredSectionsOpen.automation}
        title={t("dashboard.automation.section.title")}
        description={t("dashboard.automation.section.description")}
        summary={automationRequested ? t("dashboard.deferred.loaded") : t("dashboard.deferred.automationSummary")}
        onToggle={() => openDeferredSection("automation")}
      >
        <AutomationOverview
          modules={automations}
          loading={automationLoading}
          errorMessage={automationError}
          onRetry={() => void fetchAutomations()}
          monthlyUsage={automationMonthlyUsage(oafBotDashboard)}
        />
      </DeferredDashboardSection>
      <DeferredDashboardSection
        open={deferredSectionsOpen.recent}
        title={t("dashboard.activity.section.title")}
        description={t("dashboard.activity.section.description")}
        summary={recentRequested ? t("dashboard.deferred.loaded") : t("dashboard.deferred.recentSummary")}
        onToggle={() => openDeferredSection("recent")}
      >
        <RecentActivityList
          records={recentRecords}
          loading={recentLoading}
          errorMessage={recentError}
          onRetry={() => void fetchRecentActivities()}
        />
      </DeferredDashboardSection>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
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
      title: t("dashboard.firstUse.dailyXQueue.title"),
      description: t("dashboard.firstUse.dailyXQueue.description"),
      href: "/daily-x-queue",
      cta: t("dashboard.firstUse.dailyXQueue.cta"),
    },
    {
      key: "bot",
      done: hasBot,
      title: t("dashboard.firstUse.dailyXQueue.title"),
      description: t("dashboard.firstUse.dailyXQueue.description"),
      href: "/daily-x-queue",
      cta: t("dashboard.firstUse.dailyXQueue.cta"),
    },
    {
      key: "autoPost",
      done: autoPostConfigured,
      title: t("dashboard.firstUse.dailyXQueue.title"),
      description: t("dashboard.firstUse.dailyXQueue.description"),
      href: "/daily-x-queue",
      cta: t("dashboard.firstUse.dailyXQueue.cta"),
    },
    {
      key: "automation",
      done: automationEnabled,
      title: t("dashboard.firstUse.dailyXQueue.title"),
      description: t("dashboard.firstUse.dailyXQueue.description"),
      href: "/daily-x-queue",
      cta: t("dashboard.firstUse.dailyXQueue.cta"),
    },
    {
      key: "queue",
      done: hasExecutionSignal,
      title: t("dashboard.firstUse.dailyXQueue.title"),
      description: t("dashboard.firstUse.dailyXQueue.description"),
      href: "/daily-x-queue",
      cta: t("dashboard.firstUse.dailyXQueue.cta"),
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

function TodayOpsWorkbench({
  loading,
  errorMessage,
  opportunities,
  reviews,
  alerts,
  onRetry,
}: {
  loading: boolean;
  errorMessage: string | null;
  opportunities: TodayOpsItem[];
  reviews: TodayOpsItem[];
  alerts: Array<{ key: string; count: number; labelKey: string; href: string; tone: "warning" | "danger" }>;
  onRetry: () => void;
}) {
  const { t } = useT();
  const hasWork = opportunities.length > 0 || reviews.length > 0 || alerts.length > 0;
  return (
    <Card className="border-[#1d9bf0]/25 bg-[#06111d]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#1d9bf0]/12 text-[#1d9bf0]">
              <Sparkles className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-[#e7e9ea]">{t("dashboard.todayOps.title")}</h2>
              <p className="mt-1 text-sm leading-6 text-[#8b98a5]">{t("dashboard.todayOps.description")}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/opportunities" className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-[#2f3336] px-3 text-sm font-semibold text-[#e7e9ea] transition hover:bg-[#16181c]">
            <MessageCircle className="size-4" />
            {t("dashboard.todayOps.openOpportunities")}
          </Link>
          <Link href="/execution-queue" className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-[#1d9bf0] px-3 text-sm font-semibold text-white transition hover:bg-[#1a8cd8]">
            <Inbox className="size-4" />
            {t("dashboard.todayOps.openQueue")}
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 grid gap-3 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, groupIndex) => (
            <div key={groupIndex} className="rounded-2xl border border-[#2f3336] bg-black p-3">
              <SkeletonLine className="h-4 w-28" />
              <div className="mt-3 space-y-2">
                {Array.from({ length: 3 }).map((__, itemIndex) => (
                  <div key={itemIndex} className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
                    <SkeletonLine className="h-3 w-16" />
                    <SkeletonLine className="mt-3 h-4 w-36" />
                    <SkeletonLine className="mt-2 h-3 w-full" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : errorMessage ? (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-rose-300/25 bg-rose-500/10 p-3">
          <p className="text-sm text-rose-100">{errorMessage}</p>
          <button className="text-xs text-white underline underline-offset-2" onClick={onRetry} type="button">
            {t("common.retry")}
          </button>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 xl:grid-cols-3">
          <TodayOpsColumn
            title={t("dashboard.todayOps.column.opportunities")}
            description={t("dashboard.todayOps.column.opportunitiesDesc")}
            empty={t("dashboard.todayOps.empty.opportunities")}
            items={opportunities}
          />
          <TodayOpsColumn
            title={t("dashboard.todayOps.column.reviews")}
            description={t("dashboard.todayOps.column.reviewsDesc")}
            empty={t("dashboard.todayOps.empty.reviews")}
            items={reviews}
          />
          <div className="rounded-2xl border border-[#2f3336] bg-black p-3">
            <p className="text-sm font-semibold text-[#e7e9ea]">{t("dashboard.todayOps.column.alerts")}</p>
            <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("dashboard.todayOps.column.alertsDesc")}</p>
            <div className="mt-3 space-y-2">
              {alerts.length > 0 ? alerts.map((item) => {
                const Icon = item.tone === "danger" ? ShieldAlert : AlertTriangle;
                return (
                  <Link key={item.key} href={item.href} className="flex items-center justify-between gap-3 rounded-xl border border-[#2f3336] bg-[#0f1419] p-3 transition hover:border-[#1d9bf0]/60">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className={`grid size-8 shrink-0 place-items-center rounded-full ${item.tone === "danger" ? "bg-rose-500/10 text-rose-200" : "bg-amber-400/10 text-amber-100"}`}>
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 text-sm font-semibold text-[#e7e9ea]">{t(item.labelKey, { count: item.count })}</span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-[#71767b]" />
                  </Link>
                );
              }) : (
                <TodayOpsEmpty text={hasWork ? t("dashboard.todayOps.empty.alerts") : t("dashboard.todayOps.empty.all")} />
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function TodayOpsColumn({ title, description, empty, items }: { title: string; description: string; empty: string; items: TodayOpsItem[] }) {
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-3">
      <p className="text-sm font-semibold text-[#e7e9ea]">{title}</p>
      <p className="mt-1 text-xs leading-5 text-[#71767b]">{description}</p>
      <div className="mt-3 space-y-2">
        {items.length > 0 ? items.map((item) => <TodayOpsItemRow key={item.id} item={item} />) : <TodayOpsEmpty text={empty} />}
      </div>
    </div>
  );
}

function TodayOpsItemRow({ item }: { item: TodayOpsItem }) {
  const Icon = item.icon;
  const tone = item.tone === "rose"
    ? "border-rose-300/20 bg-rose-500/10 text-rose-100"
    : item.tone === "amber"
      ? "border-amber-300/20 bg-amber-400/10 text-amber-100"
      : item.tone === "green"
        ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
        : "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
	  return (
	    <Link href={item.href} className="block rounded-xl border border-[#2f3336] bg-[#0f1419] p-3 transition hover:border-[#1d9bf0]/60">
	      <div className="flex items-start justify-between gap-3">
	        <span className="flex min-w-0 items-center gap-2">
	          <span className={`grid size-7 shrink-0 place-items-center rounded-full border ${tone}`}>
	            <Icon className="size-3.5" />
	          </span>
	          <span className="min-w-0 truncate text-sm font-semibold text-[#e7e9ea]">{item.title}</span>
	        </span>
	        <span className="shrink-0 text-xs font-semibold text-[#8ecdf8]">{item.score ?? item.meta}</span>
	      </div>
	      {item.score ? <p className="mt-2 text-xs text-[#71767b]">{item.meta}</p> : null}
	    </Link>
	  );
}

function TodayOpsEmpty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-[#2f3336] px-3 py-5 text-center text-xs leading-5 text-[#71767b]">
      {text}
    </div>
  );
}

function DeferredDashboardSection({
  open,
  title,
  description,
  summary,
  onToggle,
  children,
}: {
  open: boolean;
  title: string;
  description: string;
  summary: string;
  onToggle: () => void;
  children: ReactNode;
}) {
  const { t } = useT();
  return (
    <section className="rounded-2xl border border-[#2f3336] bg-black">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full flex-col gap-3 p-4 text-left transition hover:bg-[#080808] sm:flex-row sm:items-center sm:justify-between md:p-5"
      >
        <span className="min-w-0">
          <span className="block text-base font-semibold text-[#e7e9ea]">{title}</span>
          <span className="mt-1 block text-sm leading-6 text-[#8b98a5]">{description}</span>
          <span className="mt-2 block text-xs text-[#71767b]">{summary}</span>
        </span>
        <span className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full border border-[#2f3336] px-3 text-sm font-semibold text-[#e7e9ea]">
          {open ? t("dashboard.deferred.collapse") : t("dashboard.deferred.expand")}
          <ChevronDown className={`size-4 transition ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open ? <div className="border-t border-[#2f3336] p-4 md:p-5">{children}</div> : null}
    </section>
  );
}

function WorkflowProgressCard({
  loading,
  pending,
  approved,
  rejected,
  failed,
  paused,
}: {
  loading: boolean;
  pending: number;
  approved: number;
  rejected: number;
  failed: number;
  paused: number | null;
}) {
  const { t } = useT();
  const completed = approved + rejected;
  const total = pending + completed + failed;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 100;
  const items = [
    { key: "pending", value: pending, tone: "text-amber-100", href: "/execution-queue?status=pending_review" },
    { key: "completed", value: completed, tone: "text-emerald-100", href: "/execution-queue?status=approved" },
    { key: "failed", value: failed, tone: "text-rose-100", href: "/execution-queue?status=failed" },
    { key: "paused", value: paused, tone: "text-[#8ecdf8]", href: "/automations#automation-modules" },
  ];
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-400/10 text-emerald-100">
              <CheckCircle2 className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-[#e7e9ea]">{t("dashboard.workflow.title")}</h2>
              <p className="mt-1 text-sm leading-6 text-[#8b98a5]">{t("dashboard.workflow.description")}</p>
            </div>
          </div>
        </div>
        <div className="min-w-56">
          <div className="flex items-center justify-between gap-3 text-xs text-[#71767b]">
            <span>{t("dashboard.workflow.progress")}</span>
            <span className="font-semibold text-white">{loading ? "—" : `${progress}%`}</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#2f3336]">
            <div className="h-full rounded-full bg-[#00ba7c]" style={{ width: loading ? "18%" : `${progress}%` }} />
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {items.map((item) => (
          <Link key={item.key} href={item.href} className="rounded-2xl border border-[#2f3336] bg-black p-4 transition hover:border-[#1d9bf0]/60">
            <p className="text-xs text-[#71767b]">{t(`dashboard.workflow.metric.${item.key}`)}</p>
            <p className={`mt-2 text-2xl font-semibold ${item.tone}`}>{loading || item.value === null ? "—" : item.value}</p>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function PublishReviewCard({
  loading,
  errorMessage,
  jobs,
  timeZone,
  onRetry,
}: {
  loading: boolean;
  errorMessage: string | null;
  jobs: PublishJobApi[];
  timeZone: string;
  onRetry: () => void;
}) {
  const { t } = useT();
  const recentJobs = jobs.slice(0, 4);
  const published = jobs.filter((job) => job.status === "published").length;
  const failed = jobs.filter((job) => job.status === "failed").length;
  const real = jobs.filter((job) => job.publish_mode === "real").length;
  const dryRun = jobs.filter((job) => job.publish_mode === "dry_run").length;
  const nextActions = [
    failed > 0
      ? {
          key: "fixFailed",
          href: "/execution-queue?status=failed",
          icon: AlertTriangle,
          count: failed,
          tone: "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]",
        }
      : null,
    dryRun > 0
      ? {
          key: "reviewDryRun",
          href: "/execution-queue?publish_outcome=dry_run",
          icon: Send,
          count: dryRun,
          tone: "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]",
        }
      : null,
    published > 0
      ? {
          key: "growFromPublished",
          href: "/opportunities?urgency=high_score",
          icon: Sparkles,
          count: published,
          tone: "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]",
        }
      : null,
    jobs.length === 0
      ? {
          key: "startQueue",
          href: "/execution-queue",
          icon: Inbox,
          count: 0,
          tone: "border-[#2f3336] bg-black text-[#8b98a5]",
        }
      : null,
  ].filter(Boolean).slice(0, 3) as { key: string; href: string; icon: LucideIcon; count: number; tone: string }[];
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#1d9bf0]/12 text-[#8ecdf8]">
              <Send className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-[#e7e9ea]">{t("dashboard.publishReview.title")}</h2>
              <p className="mt-1 text-sm leading-6 text-[#8b98a5]">{t("dashboard.publishReview.description")}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/execution-queue?status=failed" className="inline-flex h-9 items-center justify-center rounded-full border border-[#f4212e]/25 bg-[#f4212e]/10 px-3 text-sm font-semibold text-[#ff8a91] hover:bg-[#f4212e]/15">
            {t("dashboard.publishReview.openFailed")}
          </Link>
          <Link href="/execution-queue?status=published" className="inline-flex h-9 items-center justify-center rounded-full border border-[#2f3336] px-3 text-sm font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
            {t("dashboard.publishReview.openPublished")}
          </Link>
        </div>
      </div>
      {errorMessage ? (
        <div className="mt-4 rounded-xl border border-[#f4212e]/25 bg-[#f4212e]/10 p-3 text-sm text-[#ff8a91]">
          <p>{errorMessage}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={onRetry}>{t("common.retry")}</Button>
        </div>
      ) : null}
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {[
          { key: "published", value: published, tone: "text-[#7ee0b5]" },
          { key: "failed", value: failed, tone: "text-[#ff8a91]" },
          { key: "real", value: real, tone: "text-[#d7ebff]" },
          { key: "dryRun", value: dryRun, tone: "text-[#8ecdf8]" },
        ].map((item) => (
          <div key={item.key} className="rounded-2xl border border-[#2f3336] bg-black p-4">
            <p className="text-xs text-[#71767b]">{t(`dashboard.publishReview.metric.${item.key}`)}</p>
            <p className={`mt-2 text-2xl font-semibold ${item.tone}`}>{loading ? "—" : item.value}</p>
          </div>
        ))}
      </div>
      {!loading && !errorMessage && nextActions.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-[#2f3336] bg-black p-4">
          <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#e7e9ea]">{t("dashboard.publishReview.next.title")}</p>
              <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("dashboard.publishReview.next.description")}</p>
            </div>
            <Link href="/opportunities" className="inline-flex h-8 w-fit items-center gap-1 rounded-full border border-[#2f3336] px-3 text-xs font-semibold text-[#8ecdf8] hover:bg-[#16181c]">
              {t("dashboard.publishReview.next.openGrowth")}
              <ChevronRight className="size-4" />
            </Link>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {nextActions.map((item) => (
              <Link key={item.key} href={item.href} className="group rounded-xl border border-[#2f3336] bg-[#0f1419] p-3 transition hover:border-[#1d9bf0]/45">
                <div className="flex items-start justify-between gap-3">
                  <span className={`grid size-8 shrink-0 place-items-center rounded-full border ${item.tone}`}>
                    <item.icon className="size-4" />
                  </span>
                  {item.count > 0 ? (
                    <span className="rounded-full border border-[#2f3336] px-2 py-0.5 text-xs font-semibold text-[#8b98a5]">{item.count}</span>
                  ) : null}
                </div>
                <p className="mt-3 text-sm font-semibold text-[#e7e9ea]">{t(`dashboard.publishReview.next.${item.key}.title`)}</p>
                <p className="mt-1 line-clamp-2 min-h-10 text-xs leading-5 text-[#71767b]">{t(`dashboard.publishReview.next.${item.key}.description`)}</p>
                <p className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#8ecdf8]">
                  {t(`dashboard.publishReview.next.${item.key}.cta`)}
                  <ChevronRight className="size-4 transition group-hover:translate-x-0.5" />
                </p>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      <div className="mt-4 overflow-hidden rounded-2xl border border-[#2f3336] bg-black">
        {loading ? (
          <div className="space-y-3 p-4">
            <SkeletonLine className="h-4 w-40" />
            <SkeletonLine className="h-3 w-full" />
            <SkeletonLine className="h-3 w-2/3" />
          </div>
        ) : recentJobs.length > 0 ? (
          recentJobs.map((job) => (
            <div key={job.id} className="flex flex-col gap-2 border-b border-[#2f3336] p-4 last:border-b-0 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-xs ${job.status === "published" ? "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" : job.status === "failed" ? "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]" : "border-[#2f3336] bg-[#16181c] text-[#8b98a5]"}`}>
                    {t(`dashboard.publishReview.status.${job.status}`)}
                  </span>
                  <span className="rounded-full border border-[#2f3336] px-2.5 py-1 text-xs text-[#8b98a5]">{t(`executionQueue.publishMode.${job.publish_mode || "simulated"}`)}</span>
                  <span className="text-xs text-[#71767b]">{formatDateTime(job.published_at || job.updated_at || job.created_at, timeZone)}</span>
                </div>
                <p className="mt-2 line-clamp-1 text-sm font-semibold text-[#e7e9ea]">{job.content || `#${job.id}`}</p>
                {job.last_error ? <p className="mt-1 line-clamp-1 text-xs text-[#ff8a91]">{job.last_error}</p> : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {job.external_url ? (
                  <a href={job.external_url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center justify-center rounded-full border border-[#2f3336] px-3 text-xs font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
                    {t("dashboard.publishReview.openExternal")}
                  </a>
                ) : null}
                {job.status === "failed" ? (
                  <Link href="/execution-queue?status=failed" className="inline-flex h-8 items-center justify-center rounded-full bg-[#1d9bf0] px-3 text-xs font-semibold text-white hover:bg-[#1a8cd8]">
                    {t("dashboard.publishReview.fixFailed")}
                  </Link>
                ) : null}
              </div>
            </div>
          ))
        ) : (
          <div className="p-4 text-sm text-[#71767b]">{t("dashboard.publishReview.empty")}</div>
        )}
      </div>
    </Card>
  );
}

function FeedbackLearningCard({
  loading,
  summary,
  verdictStats,
  verdictDetails,
  verdictDetailsLoading,
  verdictDetailsRequested,
  bot,
  learningRulePreferences,
  timeZone,
  onLoadVerdictDetails,
  onUpdateLearningRulePreference,
}: {
  loading: boolean;
  summary: OAFBotFeedbackSummary | null;
  verdictStats: ReviewQueueFeedbackIssueVerdictStatApi[];
  verdictDetails: ReviewQueueFeedbackIssueVerdictDetailApi[];
  verdictDetailsLoading: boolean;
  verdictDetailsRequested: boolean;
  bot: OAFBot | null;
  learningRulePreferences: OAFBotLearningRulePreference[];
  timeZone: string;
  onLoadVerdictDetails: () => Promise<void>;
  onUpdateLearningRulePreference: (botID: number, feedbackIssue: string, status: "enabled" | "disabled") => Promise<void>;
}) {
  const { t } = useT();
  const { pushToast } = useToast();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [savingRule, setSavingRule] = useState("");
  const topIssues = summary?.top_issues || [];
  const topVerdictStats = [...verdictStats].sort((a, b) => b.total - a.total).slice(0, 3);
  const learnedRules = [...verdictStats].filter((stat) => stat.accurate > 0 && stat.accuracy_rate >= 0.66).sort((a, b) => b.accuracy_rate - a.accuracy_rate || b.accurate - a.accurate).slice(0, 5);
  const disabledRuleCount = learnedRules.filter((stat) => dashboardLearningPreferenceStatus(learningRulePreferences, bot?.id, stat.feedback_issue) === "disabled").length;
  const enabledRuleCount = Math.max(0, learnedRules.length - disabledRuleCount);
  const primaryVerdictIssue = topVerdictStats[0]?.feedback_issue || "";
  const hasFeedback = (summary?.negative_count || 0) > 0;
  const hasVerdictLearning = topVerdictStats.length > 0;
  const hasLearning = hasFeedback || hasVerdictLearning;
  const primaryIssue = topIssues[0]?.tag || primaryVerdictIssue || "";
  const queueHref = primaryIssue ? `/execution-queue?status=pending_review&feedback_issue=${encodeURIComponent(primaryIssue)}` : "/execution-queue?status=pending_review";
  const reasonLabel = (reason: string) => (reason.startsWith("executionQueue.") ? t(reason) : reason);
  useEffect(() => {
    if (detailsOpen && !verdictDetailsRequested && !verdictDetailsLoading) {
      void onLoadVerdictDetails();
    }
  }, [detailsOpen, onLoadVerdictDetails, verdictDetailsLoading, verdictDetailsRequested]);
  const toggleRule = async (issue: string) => {
    if (!bot?.id) {
      pushToast(t("dashboard.feedbackLearning.noBotForRules"));
      return;
    }
    const currentStatus = dashboardLearningPreferenceStatus(learningRulePreferences, bot.id, issue);
    const nextStatus = currentStatus === "disabled" ? "enabled" : "disabled";
    setSavingRule(issue);
    try {
      await onUpdateLearningRulePreference(bot.id, issue, nextStatus);
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("dashboard.feedbackLearning.ruleSaveFailed") : t("dashboard.feedbackLearning.ruleSaveFailed"));
    } finally {
      setSavingRule("");
    }
  };
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#1d9bf0]/12 text-[#1d9bf0]">
              <Sparkles className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-[#e7e9ea]">{t("dashboard.feedbackLearning.title")}</h2>
              <p className="mt-1 text-sm leading-6 text-[#8b98a5]">{t("dashboard.feedbackLearning.description")}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/oaf-bots" className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-[#2f3336] px-3 text-sm font-semibold text-[#e7e9ea] transition hover:bg-[#16181c]">
            {t("dashboard.feedbackLearning.openBots")}
            <ChevronRight className="size-4" />
          </Link>
          <Link href={queueHref} className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-[#1d9bf0] px-3 text-sm font-semibold text-white transition hover:bg-[#1a8cd8]">
            {t("dashboard.feedbackLearning.openQueue")}
            <ChevronRight className="size-4" />
          </Link>
        </div>
      </div>
      {loading ? (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-2xl border border-[#2f3336] bg-black p-4">
              <SkeletonLine className="h-4 w-24" />
              <SkeletonLine className="mt-4 h-8 w-16" />
              <SkeletonLine className="mt-3 h-3 w-full" />
            </div>
          ))}
        </div>
      ) : hasLearning ? (
        <>
          <div className="mt-4 grid gap-3 lg:grid-cols-4">
            <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
              <p className="text-xs text-[#71767b]">{t("dashboard.feedbackLearning.negativeCount", { days: summary?.days || 7 })}</p>
              <p className="mt-2 text-3xl font-semibold text-white">{summary?.negative_count || 0}</p>
              <p className="mt-2 text-xs leading-5 text-[#71767b]">
                {summary?.last_feedback_at ? t("dashboard.feedbackLearning.lastAt", { time: formatDateTime(summary.last_feedback_at, timeZone) }) : t("dashboard.feedbackLearning.noLastAt")}
              </p>
            </div>
            <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
              <p className="text-xs text-[#71767b]">{t("dashboard.feedbackLearning.ruleStatus")}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-[#00ba7c]/25 bg-[#00ba7c]/10 p-3">
                  <p className="text-2xl font-semibold text-[#7ee0b5]">{enabledRuleCount}</p>
                  <p className="mt-1 text-xs text-[#8b98a5]">{t("dashboard.feedbackLearning.rulesEnabled")}</p>
                </div>
                <div className="rounded-xl border border-[#f59e0b]/25 bg-[#f59e0b]/10 p-3">
                  <p className="text-2xl font-semibold text-[#facc15]">{disabledRuleCount}</p>
                  <p className="mt-1 text-xs text-[#8b98a5]">{t("dashboard.feedbackLearning.rulesDisabled")}</p>
                </div>
              </div>
              <p className="mt-2 line-clamp-1 text-xs text-[#71767b]">{bot?.name ? t("dashboard.feedbackLearning.ruleBot", { name: bot.name }) : t("dashboard.feedbackLearning.noBotForRules")}</p>
            </div>
            <div className="rounded-2xl border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 p-4">
              <p className="text-sm font-semibold text-[#d7ebff]">{t("dashboard.feedbackLearning.verdictAccuracy")}</p>
              <div className="mt-3 space-y-2">
                {topVerdictStats.length > 0 ? (
                  topVerdictStats.map((stat) => (
                    <button key={stat.feedback_issue} type="button" onClick={() => setDetailsOpen(true)} className="block w-full rounded-lg border border-[#1d9bf0]/20 bg-black/30 px-3 py-2 text-left text-xs text-[#8ecdf8] transition hover:border-[#1d9bf0]/45">
                      <span className="block font-semibold text-[#d7ebff]">{t(`dashboard.feedbackLearning.issue.${stat.feedback_issue}`)}</span>
                      <span className="mt-1 block">
                        {t("dashboard.feedbackLearning.verdictMeta", {
                          rate: percentLabel(stat.accuracy_rate),
                          total: stat.total,
                        })}
                      </span>
                    </button>
                  ))
                ) : (
                  <p className="text-xs leading-5 text-[#71767b]">{t("dashboard.feedbackLearning.noVerdictStats")}</p>
                )}
              </div>
            </div>
            <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
              <p className="text-sm font-semibold text-[#e7e9ea]">{t("dashboard.feedbackLearning.topIssues")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {topIssues.length > 0
                  ? topIssues.slice(0, 3).map((issue) => (
                      <Link key={issue.tag} href={`/execution-queue?status=pending_review&feedback_issue=${encodeURIComponent(issue.tag)}`} className="rounded-full border border-rose-300/20 bg-rose-500/10 px-3 py-1 text-xs font-medium text-rose-100 transition hover:border-rose-200/40 hover:bg-rose-500/20">
                        {t(`dashboard.feedbackLearning.issue.${issue.tag}`)} · {issue.count}
                      </Link>
                    ))
                  : topVerdictStats.slice(0, 3).map((stat) => (
                      <Link key={stat.feedback_issue} href={`/execution-queue?status=pending_review&feedback_issue=${encodeURIComponent(stat.feedback_issue)}`} className="rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-3 py-1 text-xs font-medium text-[#8ecdf8] transition hover:border-[#1d9bf0]/45">
                        {t(`dashboard.feedbackLearning.issue.${stat.feedback_issue}`)} · {stat.total}
                      </Link>
                    ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-[#71767b]">{t("dashboard.feedbackLearning.issueActionHint")}</p>
            </div>
          </div>
          {learnedRules.length > 0 ? (
            <div className="mt-3 rounded-2xl border border-[#2f3336] bg-black p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#e7e9ea]">{t("dashboard.feedbackLearning.ruleManagement")}</p>
                  <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("dashboard.feedbackLearning.ruleManagementHint")}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setDetailsOpen(true)}>{t("dashboard.feedbackLearning.details.title")}</Button>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {learnedRules.map((rule) => {
                  const status = dashboardLearningPreferenceStatus(learningRulePreferences, bot?.id, rule.feedback_issue);
                  const disabled = status === "disabled";
                  return (
                    <div key={rule.feedback_issue} className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[#e7e9ea]">{t(`dashboard.feedbackLearning.issue.${rule.feedback_issue}`)}</p>
                          <p className="mt-1 text-xs text-[#8b98a5]">{t("dashboard.feedbackLearning.verdictMeta", { rate: percentLabel(rule.accuracy_rate), total: rule.total })}</p>
                        </div>
                        <button type="button" disabled={savingRule === rule.feedback_issue || !bot?.id} onClick={() => void toggleRule(rule.feedback_issue)} className={`h-8 shrink-0 rounded-full border px-3 text-xs font-semibold transition disabled:opacity-60 ${disabled ? "border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#facc15]" : "border-[#00ba7c]/40 bg-[#00ba7c]/10 text-[#9ff2c9]"}`}>
                          {disabled ? t("dashboard.feedbackLearning.ruleDisabled") : t("dashboard.feedbackLearning.ruleEnabled")}
                        </button>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {rule.reasons.slice(0, 3).map((reason) => (
                          <span key={reason.reason} className="rounded-full border border-[#2f3336] px-2 py-0.5 text-xs text-[#8b98a5]">{reasonLabel(reason.reason)}</span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-[#2f3336] bg-black px-4 py-6 text-sm leading-6 text-[#71767b]">
          {t("dashboard.feedbackLearning.empty")}
        </div>
      )}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen} className="max-h-[90vh] max-w-4xl overflow-y-auto border border-[#2f3336] bg-[#0f1419]" title={t("dashboard.feedbackLearning.details.title")} description={t("dashboard.feedbackLearning.details.description")} closeLabel={t("common.close")}>
        <div className="space-y-3">
          {verdictDetailsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="rounded-xl border border-[#2f3336] bg-black p-4">
                  <SkeletonLine className="h-4 w-36" />
                  <SkeletonLine className="mt-4 h-4 w-full" />
                  <SkeletonLine className="mt-3 h-3 w-2/3" />
                </div>
              ))}
            </div>
          ) : verdictDetails.length > 0 ? (
            verdictDetails.slice(0, 8).map((item) => (
              <div key={item.id} className="rounded-xl border border-[#2f3336] bg-black p-4">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-2.5 py-1 text-xs text-[#8ecdf8]">{t(`executionQueue.type.${item.queue_type}`)}</span>
                    <span className="rounded-full border border-[#2f3336] px-2.5 py-1 text-xs text-[#e7e9ea]">{t(`dashboard.feedbackLearning.issue.${item.feedback_issue}`)}</span>
                    <span className={`rounded-full border px-2.5 py-1 text-xs ${item.verdict === "accurate" ? "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" : "border-rose-300/20 bg-rose-500/10 text-rose-100"}`}>
                      {t(`dashboard.feedbackLearning.verdict.${item.verdict}`)}
                    </span>
                    {bot?.id ? (
                      <button
                        type="button"
                        disabled={savingRule === item.feedback_issue}
                        onClick={() => void toggleRule(item.feedback_issue)}
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition disabled:opacity-60 ${
                          dashboardLearningPreferenceStatus(learningRulePreferences, bot.id, item.feedback_issue) === "disabled"
                            ? "border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#facc15]"
                            : "border-[#00ba7c]/40 bg-[#00ba7c]/10 text-[#9ff2c9]"
                        }`}
                      >
                        {dashboardLearningPreferenceStatus(learningRulePreferences, bot.id, item.feedback_issue) === "disabled" ? t("dashboard.feedbackLearning.ruleDisabled") : t("dashboard.feedbackLearning.ruleEnabled")}
                      </button>
                    ) : null}
                  </div>
                  <span className="text-xs text-[#71767b]">{formatDateTime(item.created_at, timeZone)}</span>
                </div>
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-[#e7e9ea]">{item.content_preview || item.target_summary || t("dashboard.feedbackLearning.details.noPreview")}</p>
                {item.target_summary ? <p className="mt-2 line-clamp-1 text-xs text-[#71767b]">{item.target_summary}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.reasons.map((reason) => (
                    <span key={reason} className="rounded-full border border-[#2f3336] bg-[#16181c] px-2.5 py-1 text-xs text-[#8b98a5]">{reasonLabel(reason)}</span>
                  ))}
                </div>
                <div className="mt-3 flex justify-end">
                  <Link href={item.execution_queue_url} className="inline-flex h-8 items-center justify-center gap-2 rounded-full border border-[#1d9bf0]/30 px-3 text-xs font-semibold text-[#8ecdf8] transition hover:bg-[#1d9bf0]/10" onClick={() => setDetailsOpen(false)}>
                    {t("dashboard.feedbackLearning.details.openItem")}
                    <ChevronRight className="size-3.5" />
                  </Link>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-[#2f3336] bg-black px-4 py-6 text-sm leading-6 text-[#71767b]">
              {t("dashboard.feedbackLearning.details.empty")}
            </div>
          )}
        </div>
      </Dialog>
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
