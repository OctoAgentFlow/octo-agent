"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import {
  broadcastDataSynced,
  broadcastPageRefreshComplete,
  subscribePageRefreshRequest,
} from "@/lib/app-page-refresh";
import { useT } from "@/i18n/use-t";
import {
  automationService,
  type AutoDMTaskApi,
  type AutomationModuleApi,
  type AutomationRuntimeStatusApi,
} from "@/services/automation.service";
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
  const { pushToast } = useToast();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [modules, setModules] = useState<AutomationModule[]>([]);
  const [dmTasks, setDMTasks] = useState<AutoDMTaskApi[]>([]);
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
        const [mod, runtime, dmTaskData] = await Promise.all([
          automationService.list(),
          automationService.runtimeStatus(),
          automationService.dmTasks(),
        ]);
        setModules(mod.modules.map(mapModule));
        setRuntimeStatus(mapRuntime(runtime));
        setDMTasks(dmTaskData.items);
        setLoadState("ready");
        broadcastDataSynced(Date.now());
      } catch (error) {
        const msg = axios.isAxiosError(error)
          ? error.response?.data?.message || "Failed to load automations."
          : "Failed to load automations.";
        setErrorMessage(msg);
        if (!quiet) {
          setLoadState("error");
        } else {
          pushToast(msg);
        }
      }
    },
    [pushToast]
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([automationService.list(), automationService.runtimeStatus(), automationService.dmTasks()])
      .then(([mod, runtime, dmTaskData]) => {
        if (cancelled) return;
        setModules(mod.modules.map(mapModule));
        setRuntimeStatus(mapRuntime(runtime));
        setDMTasks(dmTaskData.items);
        setLoadState("ready");
        broadcastDataSynced(Date.now());
      })
      .catch((error) => {
        if (cancelled) return;
        if (axios.isAxiosError(error)) {
          setErrorMessage(error.response?.data?.message || "Failed to load automations.");
        } else {
          setErrorMessage("Failed to load automations.");
        }
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
      pushToast(`Automation ${type} ${enabled ? "enabled" : "disabled"} successfully.`);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        pushToast(error.response?.data?.message || "Failed to toggle automation.");
      } else {
        pushToast("Failed to toggle automation.");
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
        safety: {
          require_approval: config.safety.requireApproval,
          max_per_hour: config.safety.maxPerHour,
          blocked_keywords: config.safety.blockedKeywords,
        },
      });
      setModules((prev) => prev.map((m) => (m.type === type ? mapModule(updated) : m)));
      const runtime = await automationService.runtimeStatus();
      setRuntimeStatus(mapRuntime(runtime));
      pushToast(`Automation ${type} config saved.`);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        pushToast(error.response?.data?.message || "Failed to save automation config.");
      } else {
        pushToast("Failed to save automation config.");
      }
      throw error;
    }
  };

  const approveDMTask = async (id: number) => {
    try {
      const updated = await automationService.approveDMTask(id);
      setDMTasks((items) => items.map((item) => (item.id === id ? updated : item)));
      pushToast("Auto DM task approved.");
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || "Failed to approve DM task." : "Failed to approve DM task.");
    }
  };

  const blockDMTask = async (id: number) => {
    try {
      const updated = await automationService.blockDMTask(id, "Blocked from Auto DM review queue.");
      setDMTasks((items) => items.map((item) => (item.id === id ? updated : item)));
      pushToast("Auto DM task blocked.");
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || "Failed to block DM task." : "Failed to block DM task.");
    }
  };

  const retryDMTask = async (id: number) => {
    try {
      const updated = await automationService.retryDMTask(id);
      setDMTasks((items) => items.map((item) => (item.id === id ? updated : item)));
      pushToast("Auto DM task queued for retry.");
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || "Failed to retry DM task." : "Failed to retry DM task.");
    }
  };

  return (
    <div className="space-y-4 md:space-y-5">
      <AutomationPageHeader overallState={overallState} />

      {loadState === "loading" ? (
        <Card>
          <CardHeader title="Loading automations..." description="Fetching modules and runtime status." />
        </Card>
      ) : null}

      {loadState === "error" ? (
        <Card>
          <CardHeader title="Failed to load automations" description={errorMessage || "Please retry."} />
          <div className="flex justify-end">
            <Button onClick={() => void fetchAll()}>Retry</Button>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        {modules.map((module) => (
          <AutomationModuleCard key={module.type} module={module} onToggle={onToggle} onEdit={onEdit} />
        ))}
      </div>

      <AutomationStatusPanel status={runtimeStatus} />

      <AutoDMReviewPanel tasks={dmTasks} onApprove={approveDMTask} onBlock={blockDMTask} onRetry={retryDMTask} />

      <AutomationEditDialog
        module={editing}
        open={editOpen}
        onOpenChange={(open) => setEditOpen(open)}
        onSave={onSave}
      />
    </div>
  );
}

function AutoDMReviewPanel({
  tasks,
  onApprove,
  onBlock,
  onRetry,
}: {
  tasks: AutoDMTaskApi[];
  onApprove: (id: number) => void;
  onBlock: (id: number) => void;
  onRetry: (id: number) => void;
}) {
  const { t } = useT();
  return (
    <Card>
      <CardHeader title={t("automation.dmReview.title")} description={t("automation.dmReview.description")} />
      {tasks.length === 0 ? (
        <p className="rounded-md border border-white/8 bg-white/[0.03] px-3 py-5 text-sm text-white/55">
          {t("automation.dmReview.empty")}
        </p>
      ) : (
        <div className="space-y-2">
          {tasks.slice(0, 5).map((task) => {
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
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
