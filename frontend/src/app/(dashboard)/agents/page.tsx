"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import axios from "axios";
import { FileText, ListChecks, ShieldCheck } from "lucide-react";

import { useToast } from "@/components/providers/toast-provider";
import { UserOnboardingCard } from "@/components/onboarding/user-onboarding-card";
import { OperationalBlockersCard, type OperationalBlocker } from "@/components/operations/operational-blockers-card";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import {
  broadcastDataSynced,
  broadcastPageRefreshComplete,
  subscribePageRefreshRequest,
} from "@/lib/app-page-refresh";
import { useT } from "@/i18n/use-t";
import { formatTimeOnly, usePreferredTimeZone } from "@/lib/timezone";
import { accountService } from "@/services/account.service";
import { activityService } from "@/services/activity.service";
import {
  automationService,
  type AutomationModuleApi,
  type AutomationRuntimeStatusApi,
} from "@/services/automation.service";
import { postService } from "@/services/post.service";
import type { AutomationModule, AutomationRuntimeStatus } from "@/types/automation";

import { AutomationModuleCard } from "@/components/automation/automation-module-card";
import { AutomationPageHeader } from "@/components/automation/automation-page-header";
import { AutomationStatusPanel } from "@/components/automation/automation-status-panel";

type LoadState = "loading" | "ready" | "error";
type RelativeTimeLabel = {
  key: string;
  params?: Record<string, string | number>;
};

function mapTimeToKey(iso?: string, timeZone?: string): RelativeTimeLabel {
  if (!iso) return { key: "automation.time.paused" };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { key: "automation.time.paused" };
  const diffMin = Math.max(1, Math.floor((Date.now() - date.getTime()) / 60000));
  if (diffMin > 24*60) return { key: "automation.time.yesterdayAt", params: { time: formatTimeOnly(date, timeZone) } };
  if (diffMin > 60) return { key: "automation.time.todayAt", params: { time: formatTimeOnly(date, timeZone) } };
  return { key: "automation.time.minutesAgo", params: { minutes: diffMin } };
}

function mapModule(item: AutomationModuleApi, timeZone: string): AutomationModule {
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

function mapRuntime(data: AutomationRuntimeStatusApi, timeZone: string): AutomationRuntimeStatus {
  const last = mapTimeToKey(data.last_success_at, timeZone);
  return {
    queueDepth: data.queue_depth,
    lastSuccessKey: last.key,
    lastSuccessParams: last.params,
    retriesLast24h: data.retries_last_24h,
    needsReview: data.needs_review,
  };
}

export default function AgentsPage() {
  const { t } = useT();
  const timeZone = usePreferredTimeZone();
  const searchParams = useSearchParams();
  const focusedModule = searchParams.get("module");
  const { pushToast } = useToast();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [modules, setModules] = useState<AutomationModule[]>([]);
  const [accountCount, setAccountCount] = useState(0);
  const [postCount, setPostCount] = useState(0);
  const [activityCount, setActivityCount] = useState(0);
  const [runtimeStatus, setRuntimeStatus] = useState<AutomationRuntimeStatus>({
    queueDepth: 0,
    lastSuccessKey: "automation.time.paused",
    retriesLast24h: 0,
    needsReview: 0,
  });
  const [modulesHighlighted, setModulesHighlighted] = useState(false);
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const overallState = useMemo(() => {
    if (modules.some((m) => m.state === "Needs Review")) return "Needs Attention" as const;
    if (modules.every((m) => !m.config.enabled)) return "Paused" as const;
    return "Running" as const;
  }, [modules]);
  const operationalBlockers = useMemo<OperationalBlocker[]>(() => {
    const pausedModules = modules.filter((module) => !module.config.enabled);
    const blockers: OperationalBlocker[] = [];
    if (accountCount === 0) {
      blockers.push({
        id: "no_account",
        title: t("automation.blockers.noAccount.title"),
        description: t("automation.blockers.noAccount.description"),
        href: "/accounts",
        actionLabel: t("automation.blockers.noAccount.action"),
        severity: "danger",
      });
    }
    if (pausedModules.length > 0) {
      blockers.push({
        id: "paused_modules",
        title: t("automation.blockers.pausedModules.title", { count: pausedModules.length }),
        description: t("automation.blockers.pausedModules.description", {
          modules: pausedModules.map((module) => t(`automation.module.${module.type}.name`)).join(" / "),
        }),
        href: "/automations#automation-modules",
        actionLabel: t("automation.blockers.pausedModules.action"),
        severity: pausedModules.length === modules.length ? "danger" : "warning",
        countLabel: String(pausedModules.length),
      });
    }
    if (runtimeStatus.needsReview > 0) {
      blockers.push({
        id: "needs_review",
        title: t("automation.blockers.needsReview.title", { count: runtimeStatus.needsReview }),
        description: t("automation.blockers.needsReview.description"),
        href: "/execution-queue?status=pending_review",
        actionLabel: t("automation.blockers.needsReview.action"),
        severity: "warning",
        countLabel: String(runtimeStatus.needsReview),
      });
    }
    if (runtimeStatus.queueDepth > 50) {
      blockers.push({
        id: "queue_depth",
        title: t("automation.blockers.queueDepth.title", { count: runtimeStatus.queueDepth }),
        description: t("automation.blockers.queueDepth.description"),
        href: "/execution-queue",
        actionLabel: t("automation.blockers.queueDepth.action"),
        severity: "info",
        countLabel: String(runtimeStatus.queueDepth),
      });
    }
    return blockers;
  }, [accountCount, modules, runtimeStatus.needsReview, runtimeStatus.queueDepth, t]);

  const fetchAll = useCallback(
    async (options?: { quiet?: boolean }) => {
      const quiet = Boolean(options?.quiet);
      if (!quiet) {
        setLoadState("loading");
      }
      setErrorMessage(null);
      try {
        const [mod, runtime, accountData, postData, activityData] = await Promise.all([
          automationService.list(),
          automationService.runtimeStatus(),
          accountService.list(),
          postService.list({ page: 1, page_size: 1 }),
          activityService.list({ page: 1, page_size: 1 }),
        ]);
        setModules(mod.modules.filter((item) => item.type === "post").map((item) => mapModule(item, timeZone)));
        setRuntimeStatus(mapRuntime(runtime, timeZone));
        setAccountCount(accountData.items.length);
        setPostCount(postData.pagination.total);
        setActivityCount(activityData.pagination.total);
        setLoadState("ready");
        broadcastDataSynced(Date.now());
      } catch (error) {
        const msg = axios.isAxiosError(error)
          ? error.response?.data?.message || t("dashboard.errors.loadAutomations")
          : t("dashboard.errors.loadAutomations");
        setErrorMessage(msg);
        if (!quiet) {
          setLoadState("error");
        } else {
          pushToast(msg);
        }
      }
    },
    [pushToast, t, timeZone]
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      automationService.list(),
      automationService.runtimeStatus(),
      accountService.list(),
      postService.list({ page: 1, page_size: 1 }),
      activityService.list({ page: 1, page_size: 1 }),
    ])
      .then(([mod, runtime, accountData, postData, activityData]) => {
        if (cancelled) return;
        setModules(mod.modules.filter((item) => item.type === "post").map((item) => mapModule(item, timeZone)));
        setRuntimeStatus(mapRuntime(runtime, timeZone));
        setAccountCount(accountData.items.length);
        setPostCount(postData.pagination.total);
        setActivityCount(activityData.pagination.total);
        setLoadState("ready");
        broadcastDataSynced(Date.now());
      })
      .catch((error) => {
        if (cancelled) return;
        if (axios.isAxiosError(error)) {
          setErrorMessage(error.response?.data?.message || t("dashboard.errors.loadAutomations"));
        } else {
          setErrorMessage(t("dashboard.errors.loadAutomations"));
        }
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [t, timeZone]);

  useEffect(() => {
    return subscribePageRefreshRequest(() => {
      void (async () => {
        try {
          await fetchAll({ quiet: true });
        } finally {
          broadcastPageRefreshComplete();
        }
      })();
    });
  }, [fetchAll]);

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (loadState !== "ready" || !focusedModule) return;
    const target = document.getElementById(`automation-module-${focusedModule}`) || document.getElementById("automation-modules");
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    setModulesHighlighted(true);
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = setTimeout(() => {
      setModulesHighlighted(false);
      highlightTimeoutRef.current = null;
    }, 1800);
  }, [focusedModule, loadState]);

  const onConfigureAutomation = useCallback(() => {
    document.getElementById("automation-modules")?.scrollIntoView({ behavior: "smooth", block: "start" });
    setModulesHighlighted(true);
    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current);
    }
    highlightTimeoutRef.current = setTimeout(() => {
      setModulesHighlighted(false);
      highlightTimeoutRef.current = null;
    }, 1800);
  }, []);

  const onToggle = async (type: AutomationModule["type"], enabled: boolean) => {
    try {
      const updated = await automationService.toggle(type, enabled);
      setModules((prev) => prev.map((m) => (m.type === type ? mapModule(updated, timeZone) : m)));
      const runtime = await automationService.runtimeStatus();
      setRuntimeStatus(mapRuntime(runtime, timeZone));
      pushToast(t(enabled ? "automation.toast.enabled" : "automation.toast.disabled", { module: t(`automation.module.${type}.name`) }));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        pushToast(error.response?.data?.message || t("automation.toast.toggleFailed"));
      } else {
        pushToast(t("automation.toast.toggleFailed"));
      }
    }
  };

  return (
    <div className="space-y-4 md:space-y-5">
      <AutomationPageHeader overallState={overallState} />
      <AutomationTabs />

      {loadState === "loading" ? (
        <Card>
          <CardHeader title={t("automation.loading.title")} description={t("automation.loading.description")} />
        </Card>
      ) : null}

      {loadState === "error" ? (
        <Card>
          <CardHeader title={t("automation.error.title")} description={errorMessage || t("common.retryHint")} />
          <div className="flex justify-end">
            <Button onClick={() => void fetchAll()}>{t("common.retry")}</Button>
          </div>
        </Card>
      ) : null}

      <UserOnboardingCard
        accountConnected={accountCount > 0}
        automationEnabled={accountCount > 0 && modules.some((module) => module.config.enabled)}
        postCreated={postCount > 0}
        activityObserved={accountCount > 0 && activityCount > 0}
        onConfigureAutomation={onConfigureAutomation}
      />

      <OperationalBlockersCard
        title={t("automation.blockers.title")}
        description={t("automation.blockers.description")}
        loading={loadState === "loading"}
        blockers={operationalBlockers}
        emptyTitle={t("automation.blockers.emptyTitle")}
        emptyDescription={t("automation.blockers.emptyDescription")}
      />

      <div
        id="automation-modules"
        className={`scroll-mt-24 grid gap-4 rounded-2xl transition-shadow duration-300 xl:grid-cols-2 ${
          modulesHighlighted ? "ring-2 ring-blue-300/70 ring-offset-4 ring-offset-[#070b17]" : ""
        }`}
      >
        {modules.map((module) => (
          <div key={module.type} id={`automation-module-${module.type}`} className="scroll-mt-24">
            <AutomationModuleCard module={module} onToggle={onToggle} />
          </div>
        ))}
      </div>

      <AutomationStatusPanel status={runtimeStatus} />
    </div>
  );
}

function AutomationTabs() {
  const { t } = useT();
  const tabs = [
    { href: "/automations", label: t("automation.tabs.overview"), icon: ListChecks },
    { href: "/auto-post", label: t("automation.tabs.autoPost"), icon: FileText },
    { href: "/execution-queue", label: t("automation.tabs.executionQueue"), icon: ShieldCheck },
  ];
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="flex min-w-max gap-2">
        {tabs.map((tab, index) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
              index === 0
                ? "border-blue-300/30 bg-blue-500/15 text-white"
                : "border-white/10 bg-white/[0.035] text-white/65 hover:border-blue-300/20 hover:text-white"
            }`}
          >
            <tab.icon className="size-4" />
            {tab.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
