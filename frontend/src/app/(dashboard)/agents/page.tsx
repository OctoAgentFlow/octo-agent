"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { ArrowRight, FileText, ListChecks, Mail, MessageCircle, MessagesSquare, ShieldCheck } from "lucide-react";

import { useToast } from "@/components/providers/toast-provider";
import { UserOnboardingCard } from "@/components/onboarding/user-onboarding-card";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import {
  broadcastDataSynced,
  broadcastPageRefreshComplete,
  subscribePageRefreshRequest,
} from "@/lib/app-page-refresh";
import { useT } from "@/i18n/use-t";
import { accountService } from "@/services/account.service";
import { activityService } from "@/services/activity.service";
import {
  automationService,
  type AutoCommentTargetApi,
  type AutoCommentTaskApi,
  type AutoDMRecipientImportApi,
  type AutoDMRecipientRuleApi,
  type AutoDMTaskApi,
  type AutomationModuleApi,
  type AutomationRuntimeStatusApi,
} from "@/services/automation.service";
import { postService } from "@/services/post.service";
import type { AutomationModule, AutomationModuleConfig, AutomationRuntimeStatus } from "@/types/automation";

import { AutomationEditDialog } from "@/components/automation/automation-edit-dialog";
import { AutomationModuleCard } from "@/components/automation/automation-module-card";
import { AutomationPageHeader } from "@/components/automation/automation-page-header";
import { AutomationStatusPanel } from "@/components/automation/automation-status-panel";

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
  if (diffMin > 24*60) return { key: "automation.time.yesterdayAt", params: { time: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) } };
  if (diffMin > 60) return { key: "automation.time.todayAt", params: { time: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) } };
  return { key: "automation.time.minutesAgo", params: { minutes: diffMin } };
}

function mapModule(item: AutomationModuleApi): AutomationModule {
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

function mapRuntime(data: AutomationRuntimeStatusApi): AutomationRuntimeStatus {
  const last = mapTimeToKey(data.last_success_at);
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
  const { pushToast } = useToast();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [modules, setModules] = useState<AutomationModule[]>([]);
  const [dmTasks, setDMTasks] = useState<AutoDMTaskApi[]>([]);
  const [dmRecipients, setDMRecipients] = useState<AutoDMRecipientRuleApi[]>([]);
  const [dmImports, setDMImports] = useState<AutoDMRecipientImportApi[]>([]);
  const [commentTargets, setCommentTargets] = useState<AutoCommentTargetApi[]>([]);
  const [commentTasks, setCommentTasks] = useState<AutoCommentTaskApi[]>([]);
  const [accountCount, setAccountCount] = useState(0);
  const [postCount, setPostCount] = useState(0);
  const [activityCount, setActivityCount] = useState(0);
  const [runtimeStatus, setRuntimeStatus] = useState<AutomationRuntimeStatus>({
    queueDepth: 0,
    lastSuccessKey: "automation.time.paused",
    retriesLast24h: 0,
    needsReview: 0,
  });
  const [editType, setEditType] = useState<AutomationModule["type"] | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const editing = useMemo(
    () => (editType ? modules.find((m) => m.type === editType) ?? null : null),
    [editType, modules]
  );

  const overallState = useMemo(() => {
    if (modules.some((m) => m.state === "Needs Review")) return "Needs Attention" as const;
    if (modules.every((m) => !m.config.enabled)) return "Paused" as const;
    return "Running" as const;
  }, [modules]);

  const fetchAll = useCallback(
    async (options?: { quiet?: boolean }) => {
      const quiet = Boolean(options?.quiet);
      if (!quiet) {
        setLoadState("loading");
      }
      setErrorMessage(null);
      try {
        const [mod, runtime, dmTaskData, dmRecipientData, dmImportData, commentTargetData, commentTaskData, accountData, postData, activityData] = await Promise.all([
          automationService.list(),
          automationService.runtimeStatus(),
          automationService.dmTasks(),
          automationService.dmRecipients(),
          automationService.dmRecipientImports(),
          automationService.commentTargets(),
          automationService.commentTasks(),
          accountService.list(),
          postService.list({ page: 1, page_size: 1 }),
          activityService.list({ page: 1, page_size: 1 }),
        ]);
        setModules(mod.modules.map(mapModule));
        setRuntimeStatus(mapRuntime(runtime));
        setDMTasks(dmTaskData.items);
        setDMRecipients(dmRecipientData.items);
        setDMImports(dmImportData.items);
        setCommentTargets(commentTargetData.items);
        setCommentTasks(commentTaskData.items);
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
    [pushToast, t]
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      automationService.list(),
      automationService.runtimeStatus(),
      automationService.dmTasks(),
      automationService.dmRecipients(),
      automationService.dmRecipientImports(),
      automationService.commentTargets(),
      automationService.commentTasks(),
      accountService.list(),
      postService.list({ page: 1, page_size: 1 }),
      activityService.list({ page: 1, page_size: 1 }),
    ])
      .then(([mod, runtime, dmTaskData, dmRecipientData, dmImportData, commentTargetData, commentTaskData, accountData, postData, activityData]) => {
        if (cancelled) return;
        setModules(mod.modules.map(mapModule));
        setRuntimeStatus(mapRuntime(runtime));
        setDMTasks(dmTaskData.items);
        setDMRecipients(dmRecipientData.items);
        setDMImports(dmImportData.items);
        setCommentTargets(commentTargetData.items);
        setCommentTasks(commentTaskData.items);
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
  }, [t]);

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

  const onToggle = async (type: AutomationModule["type"], enabled: boolean) => {
    try {
      const updated = await automationService.toggle(type, enabled);
      setModules((prev) => prev.map((m) => (m.type === type ? mapModule(updated) : m)));
      const runtime = await automationService.runtimeStatus();
      setRuntimeStatus(mapRuntime(runtime));
      pushToast(t(enabled ? "automation.toast.enabled" : "automation.toast.disabled", { module: t(`automation.module.${type}.name`) }));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        pushToast(error.response?.data?.message || t("automation.toast.toggleFailed"));
      } else {
        pushToast(t("automation.toast.toggleFailed"));
      }
    }
  };

  const onEdit = (type: AutomationModule["type"]) => {
    setEditType(type);
    setEditOpen(true);
  };

  const onSave = async (type: AutomationModule["type"], config: AutomationModuleConfig) => {
    try {
      const updated = await automationService.update(type, {
        enabled: config.enabled,
        frequency: {
          interval_minutes: config.frequency.intervalMinutes,
          daily_limit: config.frequency.dailyLimit,
        },
        tone: config.tone,
        execution_mode: config.executionMode,
        safety: {
          require_approval: config.safety.requireApproval,
          max_per_hour: config.safety.maxPerHour,
          blocked_keywords: config.safety.blockedKeywords,
        },
      });
      setModules((prev) => prev.map((m) => (m.type === type ? mapModule(updated) : m)));
      const runtime = await automationService.runtimeStatus();
      setRuntimeStatus(mapRuntime(runtime));
      pushToast(t("automation.toast.configSaved", { module: t(`automation.module.${type}.name`) }));
    } catch (error) {
      if (axios.isAxiosError(error)) {
        pushToast(error.response?.data?.message || t("automation.toast.configFailed"));
      } else {
        pushToast(t("automation.toast.configFailed"));
      }
      throw error;
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
      />

      <AutomationEntryGrid
        commentTargetCount={commentTargets.length}
        commentTaskCount={commentTasks.length}
        dmTaskCount={dmTasks.length}
        dmRecipientCount={dmRecipients.length}
        dmImportCount={dmImports.length}
      />

      <div id="automation-modules" className="grid gap-4 xl:grid-cols-2">
        {modules.map((module) => (
          <AutomationModuleCard key={module.type} module={module} onToggle={onToggle} onEdit={onEdit} />
        ))}
      </div>

      <AutomationStatusPanel status={runtimeStatus} />

      <AutomationEditDialog
        module={editing}
        open={editOpen}
        onOpenChange={(open) => setEditOpen(open)}
        onSave={onSave}
      />
    </div>
  );
}

function AutomationTabs() {
  const { t } = useT();
  const tabs = [
    { href: "/automations", label: t("automation.tabs.overview"), icon: ListChecks },
    { href: "/auto-post", label: t("automation.tabs.autoPost"), icon: FileText },
    { href: "/auto-replies", label: t("automation.tabs.autoReply"), icon: MessageCircle },
    { href: "/auto-comments", label: t("automation.tabs.autoComment"), icon: MessagesSquare },
    { href: "/auto-dms", label: t("automation.tabs.autoDm"), icon: Mail },
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

function AutomationEntryGrid({
  commentTargetCount,
  commentTaskCount,
  dmTaskCount,
  dmRecipientCount,
  dmImportCount,
}: {
  commentTargetCount: number;
  commentTaskCount: number;
  dmTaskCount: number;
  dmRecipientCount: number;
  dmImportCount: number;
}) {
  const { t } = useT();
  const entries = [
    {
      title: t("automation.entry.autoPost.title"),
      description: t("automation.entry.autoPost.description"),
      href: "/auto-post",
      cta: t("automation.entry.autoPost.cta"),
      icon: FileText,
      stats: t("automation.entry.autoPost.stats"),
    },
    {
      title: t("automation.entry.autoReply.title"),
      description: t("automation.entry.autoReply.description"),
      href: "/auto-replies",
      cta: t("automation.entry.autoReply.cta"),
      icon: MessageCircle,
      stats: t("automation.entry.autoReply.stats"),
    },
    {
      title: t("automation.entry.autoComment.title"),
      description: t("automation.entry.autoComment.description"),
      href: "/auto-comments",
      cta: t("automation.entry.autoComment.cta"),
      icon: MessagesSquare,
      stats: t("automation.entry.autoComment.stats", { targets: commentTargetCount, tasks: commentTaskCount }),
    },
    {
      title: t("automation.entry.autoDm.title"),
      description: t("automation.entry.autoDm.description"),
      href: "/auto-dms",
      cta: t("automation.entry.autoDm.cta"),
      icon: Mail,
      stats: t("automation.entry.autoDm.stats", { tasks: dmTaskCount, rules: dmRecipientCount, imports: dmImportCount }),
    },
  ];

  return (
    <Card className="p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">{t("automation.entry.title")}</h3>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-white/55">{t("automation.entry.description")}</p>
        </div>
        <Link href="/execution-queue" className="inline-flex">
          <Button type="button" variant="outline">
            {t("automation.entry.queueCta")}
            <ArrowRight className="size-4" />
          </Button>
        </Link>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {entries.map((entry) => (
          <Link
            key={entry.title}
            href={entry.href}
            className="group rounded-2xl border border-white/10 bg-white/[0.035] p-4 transition hover:border-blue-300/25 hover:bg-white/[0.065]"
          >
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-gradient-to-br from-blue-500/15 to-violet-500/15 text-blue-100">
                <entry.icon className="size-5" />
              </span>
              <h4 className="font-semibold text-white">{entry.title}</h4>
            </div>
            <p className="mt-3 min-h-12 text-sm leading-relaxed text-white/55">{entry.description}</p>
            <p className="mt-3 rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-xs text-white/50">{entry.stats}</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-100 transition group-hover:text-white">
              {entry.cta}
              <ArrowRight className="size-4" />
            </span>
          </Link>
        ))}
      </div>
    </Card>
  );
}

// Kept as a legacy reference while Auto DM moves to /auto-dms.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function AutoDMReviewPanel({
  tasks,
  recipients,
  imports,
  onApprove,
  onBlock,
  onRetry,
  onRule,
  onUpdateRule,
  onBulkRule,
  importCSV,
  onImportCSVChange,
  onImport,
}: {
  tasks: AutoDMTaskApi[];
  recipients: AutoDMRecipientRuleApi[];
  imports: AutoDMRecipientImportApi[];
  onApprove: (id: number) => void;
  onBlock: (id: number) => void;
  onRetry: (id: number) => void;
  onRule: (id: number, status: AutoDMRecipientRuleApi["status"]) => void;
  onUpdateRule: (id: number, status: AutoDMRecipientRuleApi["status"]) => void;
  onBulkRule: (ids: number[], status: AutoDMRecipientRuleApi["status"]) => void;
  importCSV: string;
  onImportCSVChange: (value: string) => void;
  onImport: () => void;
}) {
  const { t } = useT();
  const [recipientSearch, setRecipientSearch] = useState("");
  const [recipientStatus, setRecipientStatus] = useState<AutoDMRecipientRuleApi["status"] | "">("");
  const [selectedRecipientIDs, setSelectedRecipientIDs] = useState<number[]>([]);
  const filteredRecipients = useMemo(() => {
    const needle = recipientSearch.trim().toLowerCase();
    return recipients.filter((rule) => {
      if (recipientStatus && rule.status !== recipientStatus) return false;
      if (!needle) return true;
      return [rule.recipient_user_id, rule.recipient_username, rule.reason, rule.source]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle));
    });
  }, [recipientSearch, recipientStatus, recipients]);
  const visibleRecipients = filteredRecipients.slice(0, 50);
  const visibleIDs = useMemo(() => new Set(visibleRecipients.map((rule) => rule.id)), [visibleRecipients]);
  const visibleSelectedCount = selectedRecipientIDs.filter((id) => visibleIDs.has(id)).length;
  const allVisibleSelected = visibleRecipients.length > 0 && visibleSelectedCount === visibleRecipients.length;

  const toggleRecipient = (id: number) => {
    setSelectedRecipientIDs((items) => (items.includes(id) ? items.filter((item) => item !== id) : [...items, id]));
  };

  const toggleVisibleRecipients = () => {
    if (allVisibleSelected) {
      setSelectedRecipientIDs((items) => items.filter((id) => !visibleIDs.has(id)));
      return;
    }
    setSelectedRecipientIDs((items) => Array.from(new Set([...items, ...visibleRecipients.map((rule) => rule.id)])));
  };

  const bulkRule = (status: AutoDMRecipientRuleApi["status"]) => {
    const ids = selectedRecipientIDs.filter((id) => visibleIDs.has(id));
    if (ids.length === 0) return;
    onBulkRule(ids, status);
    setSelectedRecipientIDs((items) => items.filter((id) => !visibleIDs.has(id)));
  };

  return (
    <div id="auto-dm-review">
    <Card>
      <CardHeader title={t("automation.dmReview.title")} description={t("automation.dmReview.description")} />
      <div className="space-y-2">
        {tasks.length === 0 ? (
          <p className="rounded-md border border-white/8 bg-white/[0.03] px-3 py-5 text-sm text-white/55">
            {t("automation.dmReview.empty")}
          </p>
        ) : (
          tasks.slice(0, 5).map((task) => {
            const canAct = task.status === "review";
            const canRetry = task.status === "failed" && task.retryable && (task.attempt_count ?? 0) < 3;
            const canBlock = canAct || canRetry;
            return (
              <div key={task.id} className="rounded-md border border-white/8 bg-white/[0.03] p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-white">{task.account_handle || "—"}</p>
                    <p className="text-xs text-white/55">
                      {t("automation.dmReview.source")}: {task.recipient_source} · {t("automation.dmReview.capability")}: {task.capability_status}
                    </p>
                    {task.recipient_username || task.recipient_user_id ? (
                      <p className="text-xs text-white/55">
                        {t("automation.dmReview.recipient")}: {task.recipient_username || task.recipient_user_id}
                      </p>
                    ) : null}
                    <p className="line-clamp-2 text-sm text-white/72">{task.message_preview || "—"}</p>
                    {task.dm_event_id ? (
                      <p className="text-xs text-emerald-100/80">
                        {t("automation.dmReview.sentEvent")}: {task.dm_event_id}
                      </p>
                    ) : null}
                    {task.failure_category || task.retry_after_at ? (
                      <p className="text-xs text-white/55">
                        {task.failure_category ? `${t("automation.dmReview.failure")}: ${task.failure_category}` : ""}
                        {task.failure_category && task.retry_after_at ? " · " : ""}
                        {task.retry_after_at ? `${t("automation.dmReview.retryAfter")}: ${new Date(task.retry_after_at).toLocaleString()}` : ""}
                      </p>
                    ) : null}
                    <p className="text-xs text-white/45">
                      {t("automation.dmReview.attempts")}: {task.attempt_count ?? 0}
                    </p>
                    {task.failure_reason ? (
                      <p className="line-clamp-2 text-xs text-amber-100/85">{task.failure_reason}</p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/65">
                      {task.status}
                    </span>
                    {canBlock ? (
                      <Button size="sm" variant="outline" onClick={() => onBlock(task.id)}>
                        {t("automation.dmReview.block")}
                      </Button>
                    ) : null}
                    {canAct ? (
                      <>
                        <Button size="sm" onClick={() => onApprove(task.id)}>
                          {t("automation.dmReview.approve")}
                        </Button>
                      </>
                    ) : null}
                    {canRetry ? (
                      <Button size="sm" onClick={() => onRetry(task.id)}>
                        {t("automation.dmReview.retry")}
                      </Button>
                    ) : null}
                    {task.recipient_user_id ? (
                      <>
                        <Button size="sm" variant="outline" onClick={() => onRule(task.id, "allowlisted")}>
                          {t("automation.dmReview.allowlist")}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onRule(task.id, "blocked")}>
                          {t("automation.dmReview.blacklist")}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onRule(task.id, "unsubscribed")}>
                          {t("automation.dmReview.unsubscribe")}
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div className="rounded-md border border-white/8 bg-white/[0.02] p-3">
          <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-xs font-semibold text-white/70">{t("automation.dmReview.rules")}</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                value={recipientSearch}
                onChange={(event) => setRecipientSearch(event.target.value)}
                placeholder={t("automation.dmReview.searchPlaceholder")}
                className="h-8 w-full rounded-md border border-white/10 bg-black/20 px-3 text-xs text-white outline-none placeholder:text-white/35 sm:w-56"
              />
              <select
                value={recipientStatus}
                onChange={(event) => setRecipientStatus(event.target.value as AutoDMRecipientRuleApi["status"] | "")}
                className="h-8 rounded-md border border-white/10 bg-black/20 px-2 text-xs text-white outline-none"
              >
                <option value="">{t("automation.dmReview.statusAll")}</option>
                <option value="allowlisted">{t("automation.dmReview.allowlist")}</option>
                <option value="blocked">{t("automation.dmReview.blacklist")}</option>
                <option value="unsubscribed">{t("automation.dmReview.unsubscribe")}</option>
              </select>
            </div>
          </div>
          {visibleRecipients.length > 0 ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <label className="flex h-7 items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2.5 text-xs text-white/65">
                  <input type="checkbox" className="accent-blue-400" checked={allVisibleSelected} onChange={toggleVisibleRecipients} />
                  {t("automation.dmReview.selectVisible")}
                </label>
                <span className="text-xs text-white/45">{t("automation.dmReview.selectedCount", { count: visibleSelectedCount })}</span>
                <Button size="sm" variant="outline" disabled={visibleSelectedCount === 0} onClick={() => bulkRule("allowlisted")}>
                  {t("automation.dmReview.bulkAllowlist")}
                </Button>
                <Button size="sm" variant="outline" disabled={visibleSelectedCount === 0} onClick={() => bulkRule("blocked")}>
                  {t("automation.dmReview.bulkBlock")}
                </Button>
                <Button size="sm" variant="outline" disabled={visibleSelectedCount === 0} onClick={() => bulkRule("unsubscribed")}>
                  {t("automation.dmReview.bulkUnsubscribe")}
                </Button>
              </div>
              <div className="max-h-[420px] overflow-y-auto rounded-md border border-white/8">
                {visibleRecipients.map((rule) => (
                  <div key={rule.id} className="grid gap-3 border-b border-white/8 bg-black/10 p-3 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="flex min-w-0 gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 accent-blue-400"
                        checked={selectedRecipientIDs.includes(rule.id)}
                        onChange={() => toggleRecipient(rule.id)}
                        aria-label={rule.recipient_username || rule.recipient_user_id}
                      />
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="break-all text-sm font-semibold text-white">{rule.recipient_username || rule.recipient_user_id}</p>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-xs text-white/65">{rule.status}</span>
                        </div>
                        <p className="break-all text-xs text-white/50">{rule.recipient_user_id}</p>
                        <p className="text-xs text-white/45">
                          {t("automation.dmReview.source")}: {rule.source || "—"} · {t("automation.dmReview.updatedAt")}: {rule.updated_at ? new Date(rule.updated_at).toLocaleString() : "—"}
                        </p>
                        {rule.reason ? <p className="line-clamp-2 text-xs text-white/55">{rule.reason}</p> : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <Button size="sm" variant="outline" onClick={() => onUpdateRule(rule.id, "allowlisted")} disabled={rule.status === "allowlisted"}>
                        {t("automation.dmReview.allowlist")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onUpdateRule(rule.id, "blocked")} disabled={rule.status === "blocked"}>
                        {t("automation.dmReview.blacklist")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onUpdateRule(rule.id, "unsubscribed")} disabled={rule.status === "unsubscribed"}>
                        {t("automation.dmReview.unsubscribe")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="rounded-md border border-white/8 bg-white/[0.03] px-3 py-5 text-sm text-white/55">
              {t("automation.dmReview.emptyRules")}
            </p>
          )}
        </div>
        {imports.length > 0 ? (
          <div className="rounded-md border border-white/8 bg-white/[0.02] p-3">
            <p className="mb-2 text-xs font-semibold text-white/70">{t("automation.dmReview.importHistory")}</p>
            <div className="space-y-1.5">
              {imports.slice(0, 5).map((item) => (
                <div key={item.id} className="text-xs text-white/60">
                  {new Date(item.imported_at).toLocaleString()} · {item.imported} {t("automation.dmReview.imported")} · {item.skipped} {t("automation.dmReview.skipped")}
                  {item.errors?.length ? <span className="text-amber-100/80"> · {item.errors[0]}</span> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <div className="rounded-md border border-white/8 bg-white/[0.02] p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-white/70">{t("automation.dmReview.import")}</p>
            <Button size="sm" onClick={onImport} disabled={!importCSV.trim()}>
              {t("automation.dmReview.importCta")}
            </Button>
          </div>
          <textarea
            value={importCSV}
            onChange={(event) => onImportCSVChange(event.target.value)}
            rows={3}
            placeholder={t("automation.dmReview.importExample")}
            className="min-h-20 w-full resize-y rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35"
          />
        </div>
      </div>
    </Card>
    </div>
  );
}

// Kept as a legacy reference while Auto Comment moves to /auto-comments.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function AutoCommentPanel({
  targets,
  tasks,
  targetInput,
  onTargetInputChange,
  onAddTarget,
  onTargetStatus,
  onDeleteTarget,
  onApproveTask,
  onBlockTask,
  onRetryTask,
}: {
  targets: AutoCommentTargetApi[];
  tasks: AutoCommentTaskApi[];
  targetInput: string;
  onTargetInputChange: (value: string) => void;
  onAddTarget: () => void;
  onTargetStatus: (id: number, status: AutoCommentTargetApi["status"]) => void;
  onDeleteTarget: (id: number) => void;
  onApproveTask: (id: number) => void;
  onBlockTask: (id: number) => void;
  onRetryTask: (id: number) => void;
}) {
  const { t } = useT();
  return (
    <Card>
      <CardHeader title={t("automation.comment.title")} description={t("automation.comment.description")} />
      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-3">
          <div className="flex gap-2">
            <input
              value={targetInput}
              onChange={(event) => onTargetInputChange(event.target.value)}
              placeholder={t("automation.comment.targetInput")}
              className="h-9 min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-white/35"
            />
            <Button type="button" disabled={!targetInput.trim()} onClick={onAddTarget}>
              {t("automation.comment.addTarget")}
            </Button>
          </div>
          <div className="rounded-md border border-white/8 bg-white/[0.02] p-3">
            <p className="mb-3 text-xs font-semibold text-white/70">{t("automation.comment.targets")}</p>
            {targets.length === 0 ? (
              <p className="rounded-md border border-white/8 bg-white/[0.03] px-3 py-5 text-sm text-white/55">
                {t("automation.comment.emptyTargets")}
              </p>
            ) : (
              <div className="space-y-2">
                {targets.map((target) => (
                  <div key={target.id} className="rounded-md border border-white/8 bg-black/10 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1">
                        <p className="break-all text-sm font-semibold text-white">@{target.target_username}</p>
                        <p className="text-xs text-white/55">
                          {t(`automation.comment.status.${target.status}`)}
                          {target.last_checked_at ? ` · ${t("automation.comment.lastChecked")}: ${new Date(target.last_checked_at).toLocaleString()}` : ""}
                        </p>
                        {target.last_commented_at ? (
                          <p className="text-xs text-emerald-100/80">
                            {t("automation.comment.lastCommented")}: {new Date(target.last_commented_at).toLocaleString()}
                          </p>
                        ) : null}
                        {target.last_failure_reason ? (
                          <p className="line-clamp-2 text-xs text-amber-100/85">
                            {t("automation.comment.failure")}: {target.last_failure_reason}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onTargetStatus(target.id, target.status === "active" ? "paused" : "active")}
                        >
                          {target.status === "active" ? t("automation.comment.pause") : t("automation.comment.resume")}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => onDeleteTarget(target.id)}>
                          {t("automation.comment.delete")}
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-md border border-white/8 bg-white/[0.02] p-3">
          <p className="mb-3 text-xs font-semibold text-white/70">{t("automation.comment.tasks")}</p>
          {tasks.length === 0 ? (
            <p className="rounded-md border border-white/8 bg-white/[0.03] px-3 py-5 text-sm text-white/55">
              {t("automation.comment.emptyTasks")}
            </p>
          ) : (
            <div className="max-h-[560px] space-y-2 overflow-y-auto">
              {tasks.slice(0, 8).map((task) => {
                const canApprove = task.status === "review" || task.status === "pending_review";
                const canRetry = task.status === "failed" && task.retryable;
                return (
                  <div key={task.id} className="rounded-md border border-white/8 bg-black/10 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-white">@{task.target_username}</p>
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/65">
                            {task.status}
                          </span>
                        </div>
                        <div className="rounded-md border border-white/8 bg-white/[0.03] p-2">
                          <p className="mb-1 text-xs text-white/45">{t("automation.comment.targetTweet")}</p>
                          <p className="line-clamp-3 text-sm text-white/70">{task.target_tweet_text || task.target_tweet_id}</p>
                        </div>
                        <div className="rounded-md border border-blue-300/15 bg-blue-500/8 p-2">
                          <p className="mb-1 text-xs text-blue-100/70">{t("automation.comment.generated")}</p>
                          <p className="line-clamp-3 text-sm text-white/82">{task.generated_comment || "—"}</p>
                        </div>
                        {task.comment_tweet_id ? (
                          <p className="text-xs text-emerald-100/80">Comment Tweet ID: {task.comment_tweet_id}</p>
                        ) : null}
                        {task.failure_reason ? (
                          <p className="line-clamp-2 text-xs text-amber-100/85">
                            {t("automation.comment.failure")}: {task.failure_reason}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-2">
                        {canApprove ? (
                          <Button size="sm" onClick={() => onApproveTask(task.id)}>
                            {t("automation.comment.approve")}
                          </Button>
                        ) : null}
                        {canRetry ? (
                          <Button size="sm" onClick={() => onRetryTask(task.id)}>
                            {t("automation.comment.retry")}
                          </Button>
                        ) : null}
                        {task.status !== "blocked" && task.status !== "sent" ? (
                          <Button size="sm" variant="outline" onClick={() => onBlockTask(task.id)}>
                            {t("automation.comment.block")}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
