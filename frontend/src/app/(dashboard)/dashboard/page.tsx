 "use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";

import { AutomationOverview } from "@/components/dashboard/automation-overview";
import { RecentActivityList } from "@/components/dashboard/recent-activity-list";
import { StatusOverviewCards } from "@/components/dashboard/status-overview-cards";
import { TrialUpgradeBanner } from "@/components/dashboard/trial-upgrade-banner";
import { XAccountStatus } from "@/components/dashboard/x-account-status";
import { UserOnboardingCard } from "@/components/onboarding/user-onboarding-card";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import {
  broadcastDataSynced,
  broadcastPageRefreshComplete,
  subscribePageRefreshRequest,
} from "@/lib/app-page-refresh";
import { subscribeDashboardRefresh } from "@/lib/dashboard-refresh";
import { activityService } from "@/services/activity.service";
import { automationService, type AutomationModuleApi } from "@/services/automation.service";
import { dashboardService, type DashboardOverview } from "@/services/dashboard.service";
import { postService } from "@/services/post.service";
import { useT } from "@/i18n/use-t";
import type { ActivityRecord } from "@/types/activity";
import type { AutomationModule } from "@/types/automation";

type LoadState = "loading" | "ready" | "error";
type RelativeTimeLabel = {
  key: string;
  params?: Record<string, string | number>;
};

function mapTimeToKey(iso?: string): RelativeTimeLabel {
  if (!iso) return { key: "automation.time.paused" };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { key: "automation.time.paused" };
  const diffMin = Math.max(1, Math.floor((Date.now() - date.getTime()) / 60000));
  if (diffMin > 24 * 60) {
    return { key: "automation.time.yesterdayAt", params: { time: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) } };
  }
  if (diffMin > 60) {
    return { key: "automation.time.todayAt", params: { time: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) } };
  }
  return { key: "automation.time.minutesAgo", params: { minutes: diffMin } };
}

function mapAutomation(item: AutomationModuleApi): AutomationModule {
  const last = mapTimeToKey(item.last_run_at);
  const next = item.config.enabled ? mapTimeToKey(item.next_run_at) : { key: "automation.time.paused" };
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
      ? mapTimeToKey(item.reply_usage.last_executed_at)
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
        dailyLimit: item.config.frequency.daily_limit,
      },
      tone: item.config.tone,
      executionMode: item.config.execution_mode || "review",
      safety: {
        requireApproval: item.config.safety.require_approval,
        maxPerHour: item.config.safety.max_per_hour,
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

export default function DashboardPage() {
  const { t } = useT();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [automations, setAutomations] = useState<AutomationModule[]>([]);
  const [automationLoading, setAutomationLoading] = useState<boolean>(true);
  const [automationError, setAutomationError] = useState<string | null>(null);
  const [recentRecords, setRecentRecords] = useState<ActivityRecord[]>([]);
  const [recentLoading, setRecentLoading] = useState(true);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [postCount, setPostCount] = useState(0);

  const fetchOverview = useCallback(async () => {
    setLoadState("loading");
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
      setLoadState("error");
    }
  }, [t]);

  const fetchAutomations = useCallback(async () => {
    setAutomationLoading(true);
    setAutomationError(null);
    try {
      const data = await automationService.list();
      setAutomations(data.modules.map(mapAutomation));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setAutomationError(error.response?.data?.message || t("dashboard.errors.loadAutomations"));
      } else {
        setAutomationError(t("dashboard.errors.loadAutomations"));
      }
    } finally {
      setAutomationLoading(false);
    }
  }, [t]);

  const fetchRecentActivities = useCallback(async () => {
    setRecentLoading(true);
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
      setRecentLoading(false);
    }
  }, [t]);

  const fetchPostCount = useCallback(async () => {
    try {
      const data = await postService.list({ page: 1, page_size: 1 });
      setPostCount(data.pagination.total);
    } catch {
      setPostCount(0);
    }
  }, []);

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
        setAutomations(data.modules.map(mapAutomation));
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
  }, [t]);

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
    let cancelled = false;
    postService
      .list({ page: 1, page_size: 1 })
      .then((data) => {
        if (cancelled) return;
        setPostCount(data.pagination.total);
      })
      .catch(() => {
        if (cancelled) return;
        setPostCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return subscribeDashboardRefresh(() => {
      void fetchOverview();
      void fetchAutomations();
      void fetchRecentActivities();
      void fetchPostCount();
    });
  }, [fetchAutomations, fetchOverview, fetchPostCount, fetchRecentActivities]);

  useEffect(() => {
    return subscribePageRefreshRequest(() => {
      void (async () => {
        let overviewOk = false;
        try {
          const data = await dashboardService.overview();
          setOverview(data);
          setLoadState("ready");
          setErrorMessage(null);
          overviewOk = true;
        } catch (error) {
          if (axios.isAxiosError(error)) {
            setErrorMessage(error.response?.data?.message || t("dashboard.errors.loadOverview"));
          } else {
            setErrorMessage(t("dashboard.errors.loadOverview"));
          }
          setLoadState((prev) => (prev === "loading" ? "error" : prev));
        }

        setAutomationLoading(true);
        setAutomationError(null);
        try {
          const data = await automationService.list();
          setAutomations(data.modules.map(mapAutomation));
        } catch (error) {
          if (axios.isAxiosError(error)) {
            setAutomationError(error.response?.data?.message || t("dashboard.errors.loadAutomations"));
          } else {
            setAutomationError(t("dashboard.errors.loadAutomations"));
          }
        } finally {
          setAutomationLoading(false);
        }

        setRecentLoading(true);
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
          setRecentLoading(false);
        }

        try {
          const data = await postService.list({ page: 1, page_size: 1 });
          setPostCount(data.pagination.total);
        } catch {
          setPostCount(0);
        }

        if (overviewOk) {
          broadcastDataSynced(Date.now());
        }
        broadcastPageRefreshComplete();
      })();
    });
  }, [t]);

  return (
    <div className="space-y-4 md:space-y-5">
      {loadState === "loading" ? (
        <Card>
          <CardHeader title={t("dashboard.loading.title")} description={t("dashboard.loading.description")} />
        </Card>
      ) : null}

      {loadState === "error" ? (
        <Card>
          <CardHeader title={t("dashboard.error.title")} description={errorMessage || t("common.retryHint")} />
          <div className="flex justify-end">
            <Button onClick={() => void fetchOverview()}>{t("common.retry")}</Button>
          </div>
        </Card>
      ) : null}

      <StatusOverviewCards overview={overview} />
      <UserOnboardingCard
        accountConnected={(overview?.connected_x_count ?? 0) > 0}
        automationEnabled={(overview?.connected_x_count ?? 0) > 0 && automations.some((module) => module.config.enabled)}
        postCreated={postCount > 0}
        activityObserved={(overview?.connected_x_count ?? 0) > 0 && (recentRecords.length > 0 || (overview?.activity_count_24h ?? 0) > 0)}
      />
      <XAccountStatus overview={overview} />
      <AutomationOverview
        modules={automations}
        loading={automationLoading}
        errorMessage={automationError}
        onRetry={() => void fetchAutomations()}
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
