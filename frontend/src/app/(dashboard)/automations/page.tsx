"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  FileText,
  ListChecks,
  Mail,
  MessageCircle,
  MessagesSquare,
  ShieldCheck,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

import { AutomationModuleCard } from "@/components/automation/automation-module-card";
import { AutomationStatusPanel } from "@/components/automation/automation-status-panel";
import { OperationalBlockersCard, type OperationalBlocker } from "@/components/operations/operational-blockers-card";
import { useToast } from "@/components/providers/toast-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import {
  broadcastDataSynced,
  broadcastPageRefreshComplete,
  subscribePageRefreshRequest,
} from "@/lib/app-page-refresh";
import { useT } from "@/i18n/use-t";
import { formatTimeOnly, usePreferredTimeZone } from "@/lib/timezone";
import { accountService, type AccountListItem } from "@/services/account.service";
import {
  automationService,
  type AutomationModuleApi,
  type AutomationRuntimeStatusApi,
} from "@/services/automation.service";
import type { AutomationModule, AutomationModuleType, AutomationRuntimeStatus } from "@/types/automation";

type LoadState = "loading" | "ready" | "error";
type OverallState = "Running" | "Paused" | "Needs Attention";
type RelativeTimeLabel = {
  key: string;
  params?: Record<string, string | number>;
};

const moduleOrder: AutomationModuleType[] = ["post", "reply", "comment", "dm"];

const workspaceHref: Record<AutomationModuleType, string> = {
  post: "/auto-post",
  reply: "/auto-replies",
  comment: "/auto-comments",
  dm: "/auto-dms",
};

const workspaceIcon: Record<AutomationModuleType, LucideIcon> = {
  post: FileText,
  reply: MessageCircle,
  comment: MessagesSquare,
  dm: Mail,
};

function mapTimeToKey(iso?: string, timeZone?: string): RelativeTimeLabel {
  if (!iso) return { key: "automation.time.paused" };
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { key: "automation.time.paused" };
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return { key: "automation.time.inMinutes", params: { minutes: Math.max(1, Math.ceil(Math.abs(diffMs) / 60000)) } };
  const diffMin = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMin > 24 * 60) return { key: "automation.time.yesterdayAt", params: { time: formatTimeOnly(date, timeZone) } };
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

function sortModules(items: AutomationModule[]) {
  return [...items].sort((a, b) => moduleOrder.indexOf(a.type) - moduleOrder.indexOf(b.type));
}

function computeOverallState(modules: AutomationModule[], runtimeStatus: AutomationRuntimeStatus): OverallState {
  if (runtimeStatus.needsReview > 0 || modules.some((module) => module.state === "Needs Review")) return "Needs Attention";
  if (modules.length > 0 && modules.every((module) => !module.config.enabled)) return "Paused";
  return "Running";
}

export default function AutomationsPage() {
  const { t } = useT();
  const timeZone = usePreferredTimeZone();
  const { pushToast } = useToast();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [modules, setModules] = useState<AutomationModule[]>([]);
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [runtimeStatus, setRuntimeStatus] = useState<AutomationRuntimeStatus>({
    queueDepth: 0,
    lastSuccessKey: "automation.time.paused",
    retriesLast24h: 0,
    needsReview: 0,
  });

  const load = useCallback(
    async (options?: { quiet?: boolean }) => {
      const quiet = Boolean(options?.quiet);
      if (!quiet) setLoadState("loading");
      setErrorMessage(null);

      try {
        const [automationData, runtimeData, accountData] = await Promise.all([
          automationService.list(),
          automationService.runtimeStatus(),
          accountService.list(),
        ]);
        setModules(sortModules(automationData.modules.map((item) => mapModule(item, timeZone))));
        setRuntimeStatus(mapRuntime(runtimeData, timeZone));
        setAccounts(accountData.items);
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
    void load();
  }, [load]);

  useEffect(() => {
    return subscribePageRefreshRequest(() => {
      void (async () => {
        try {
          await load({ quiet: true });
        } finally {
          broadcastPageRefreshComplete();
        }
      })();
    });
  }, [load]);

  const overallState = useMemo(() => computeOverallState(modules, runtimeStatus), [modules, runtimeStatus]);
  const enabledCount = modules.filter((module) => module.config.enabled).length;
  const pausedCount = modules.filter((module) => !module.config.enabled).length;
  const publishBlockedCount = accounts.filter((account) => account.status !== "connected" || account.publish_reauth_required).length;
  const operationalBlockers = useMemo<OperationalBlocker[]>(() => {
    const pausedModules = modules.filter((module) => !module.config.enabled);
    const blockers: OperationalBlocker[] = [];
    if (accounts.length === 0) {
      blockers.push({
        id: "no_account",
        title: t("automation.blockers.noAccount.title"),
        description: t("automation.blockers.noAccount.description"),
        href: "/accounts",
        actionLabel: t("automation.blockers.noAccount.action"),
        severity: "danger",
      });
    } else if (publishBlockedCount > 0) {
      blockers.push({
        id: "publish_auth",
        title: t("automation.blockers.publishAuth.title", { count: publishBlockedCount }),
        description: t("automation.blockers.publishAuth.description"),
        href: "/accounts?filter=needs_reauth",
        actionLabel: t("automation.blockers.publishAuth.action"),
        severity: "danger",
        countLabel: String(publishBlockedCount),
        icon: ShieldCheck,
      });
    }
    if (pausedModules.length > 0) {
      blockers.push({
        id: "paused_modules",
        title: t("automation.blockers.pausedModules.title", { count: pausedModules.length }),
        description: t("automation.blockers.pausedModules.description", {
          modules: pausedModules.map((module) => t(`automation.module.${module.type}.name`)).join(" / "),
        }),
        href: "#automation-modules",
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
  }, [accounts.length, modules, publishBlockedCount, runtimeStatus.needsReview, runtimeStatus.queueDepth, t]);

  const onToggle = async (type: AutomationModule["type"], enabled: boolean) => {
    try {
      const updated = await automationService.toggle(type, enabled);
      setModules((prev) => sortModules(prev.map((module) => (module.type === type ? mapModule(updated, timeZone) : module))));
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
      <AutomationControlHero
        overallState={overallState}
        enabledCount={enabledCount}
        pausedCount={pausedCount}
        needsReview={runtimeStatus.needsReview}
        queueDepth={runtimeStatus.queueDepth}
      />
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
            <Button onClick={() => void load()}>{t("common.retry")}</Button>
          </div>
        </Card>
      ) : null}

      <OperationalBlockersCard
        title={t("automation.blockers.title")}
        description={t("automation.blockers.description")}
        loading={loadState === "loading"}
        blockers={operationalBlockers}
        emptyTitle={t("automation.blockers.emptyTitle")}
        emptyDescription={t("automation.blockers.emptyDescription")}
      />

      <AutomationWorkflows modules={modules} loading={loadState === "loading"} />

      <div id="automation-modules" className="scroll-mt-24 grid gap-4 xl:grid-cols-2">
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

function AutomationControlHero({
  overallState,
  enabledCount,
  pausedCount,
  needsReview,
  queueDepth,
}: {
  overallState: OverallState;
  enabledCount: number;
  pausedCount: number;
  needsReview: number;
  queueDepth: number;
}) {
  const { t } = useT();
  const badgeVariant = overallState === "Running" ? "success" : overallState === "Paused" ? "default" : "warning";
  const metrics = [
    { label: t("automation.control.metrics.enabled"), value: enabledCount },
    { label: t("automation.control.metrics.paused"), value: pausedCount },
    { label: t("automation.control.metrics.needsReview"), value: needsReview },
    { label: t("automation.control.metrics.queueDepth"), value: queueDepth },
  ];

  return (
    <section className="rounded-2xl border border-[#1d9bf0]/20 bg-[#06111d] p-5 md:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-[#1d9bf0]">{t("automation.control.eyebrow")}</span>
            <Badge variant={badgeVariant}>{t(`automation.overallState.${overallState}`)}</Badge>
          </div>
          <h2 className="mt-2 text-2xl font-bold tracking-normal text-[#e7e9ea] md:text-3xl">
            {t("automation.control.title")}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#8b98a5]">
            {t("automation.control.description")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="#automation-modules" className="inline-flex">
              <Button type="button">
                <SlidersHorizontal className="size-4" />
                {t("automation.control.primaryCta")}
              </Button>
            </Link>
            <Link href="/execution-queue" className="inline-flex">
              <Button type="button" variant="outline">
                <ShieldCheck className="size-4" />
                {t("automation.control.queueCta")}
              </Button>
            </Link>
          </div>
        </div>
        <div className="grid min-w-full gap-2 sm:grid-cols-4 lg:min-w-[420px]">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
              <p className="text-xs text-[#71767b]">{metric.label}</p>
              <p className="mt-1 text-xl font-semibold text-[#e7e9ea]">{metric.value}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AutomationTabs() {
  const { t } = useT();
  const tabs = [
    { href: "/automations", label: t("automation.tabs.overview"), icon: ListChecks, active: true },
    { href: "/auto-post", label: t("automation.tabs.autoPost"), icon: FileText },
    { href: "/auto-replies", label: t("automation.tabs.autoReply"), icon: MessageCircle },
    { href: "/auto-comments", label: t("automation.tabs.autoComment"), icon: MessagesSquare },
    { href: "/auto-dms", label: t("automation.tabs.autoDm"), icon: Mail },
    { href: "/execution-queue", label: t("automation.tabs.executionQueue"), icon: ShieldCheck },
  ];
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="flex min-w-max gap-2">
        {tabs.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
              tab.active
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

function AutomationWorkflows({ modules, loading }: { modules: AutomationModule[]; loading: boolean }) {
  const { t } = useT();

  return (
    <Card>
      <CardHeader
        title={t("automation.control.workflowTitle")}
        description={t("automation.control.workflowDescription")}
        right={
          <Link href="/oaf-bots" className="inline-flex">
            <Button type="button" variant="outline">
              <Bot className="size-4" />
              {t("automation.control.botCta")}
            </Button>
          </Link>
        }
      />
      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="min-h-36 rounded-xl border border-white/10 bg-white/[0.035] p-4">
              <span className="block h-4 w-24 animate-pulse rounded-full bg-[#2f3336]" />
              <span className="mt-6 block h-3 w-full animate-pulse rounded-full bg-[#2f3336]" />
              <span className="mt-2 block h-3 w-2/3 animate-pulse rounded-full bg-[#2f3336]" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {modules.map((module) => {
            const Icon = workspaceIcon[module.type];
            return (
              <Link
                key={module.type}
                href={workspaceHref[module.type]}
                className="group rounded-xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-blue-300/25 hover:bg-white/[0.065]"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <span className="grid size-9 place-items-center rounded-full bg-[#1d9bf0]/10 text-[#1d9bf0]">
                      <Icon className="size-4" />
                    </span>
                    <span className="text-sm font-semibold text-[#e7e9ea]">{t(module.nameKey)}</span>
                  </span>
                  <Badge variant={module.config.enabled ? "success" : "default"}>
                    {t(module.config.enabled ? "automation.summary.enabled" : "automation.summary.disabled")}
                  </Badge>
                </div>
                <p className="mt-3 min-h-10 text-sm leading-5 text-[#8b98a5]">{t(`automation.control.workflow.${module.type}`)}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-100 transition group-hover:text-white">
                  {t("automation.control.openWorkspace")}
                  <ArrowRight className="size-4" />
                </span>
              </Link>
            );
          })}
        </div>
      )}
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm leading-6 text-amber-50/80">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-100" />
        <p>{t("automation.control.guardrailNote")}</p>
      </div>
    </Card>
  );
}
