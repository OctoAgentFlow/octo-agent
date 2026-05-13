"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";

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
  const [dmRecipients, setDMRecipients] = useState<AutoDMRecipientRuleApi[]>([]);
  const [dmImports, setDMImports] = useState<AutoDMRecipientImportApi[]>([]);
  const [dmImportCSV, setDMImportCSV] = useState("");
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
        const [mod, runtime, dmTaskData, dmRecipientData, dmImportData, accountData, postData, activityData] = await Promise.all([
          automationService.list(),
          automationService.runtimeStatus(),
          automationService.dmTasks(),
          automationService.dmRecipients(),
          automationService.dmRecipientImports(),
          accountService.list(),
          postService.list({ page: 1, page_size: 1 }),
          activityService.list({ page: 1, page_size: 1 }),
        ]);
        setModules(mod.modules.map(mapModule));
        setRuntimeStatus(mapRuntime(runtime));
        setDMTasks(dmTaskData.items);
        setDMRecipients(dmRecipientData.items);
        setDMImports(dmImportData.items);
        setAccountCount(accountData.items.length);
        setPostCount(postData.pagination.total);
        setActivityCount(activityData.pagination.total);
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
    Promise.all([
      automationService.list(),
      automationService.runtimeStatus(),
      automationService.dmTasks(),
      automationService.dmRecipients(),
      automationService.dmRecipientImports(),
      accountService.list(),
      postService.list({ page: 1, page_size: 1 }),
      activityService.list({ page: 1, page_size: 1 }),
    ])
      .then(([mod, runtime, dmTaskData, dmRecipientData, dmImportData, accountData, postData, activityData]) => {
        if (cancelled) return;
        setModules(mod.modules.map(mapModule));
        setRuntimeStatus(mapRuntime(runtime));
        setDMTasks(dmTaskData.items);
        setDMRecipients(dmRecipientData.items);
        setDMImports(dmImportData.items);
        setAccountCount(accountData.items.length);
        setPostCount(postData.pagination.total);
        setActivityCount(activityData.pagination.total);
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

  const setDMRecipientRule = async (id: number, status: AutoDMRecipientRuleApi["status"]) => {
    try {
      const rule = await automationService.setDMRecipientRule(id, status, `Marked ${status} from Auto DM queue.`);
      setDMRecipients((items) => [rule, ...items.filter((item) => item.id !== rule.id)]);
      if (status === "blocked" || status === "unsubscribed") {
        const dmTaskData = await automationService.dmTasks();
        setDMTasks(dmTaskData.items);
      }
      pushToast(`Auto DM recipient marked ${status}.`);
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || "Failed to update recipient rule." : "Failed to update recipient rule.");
    }
  };

  const updateDMRecipientRule = async (id: number, status: AutoDMRecipientRuleApi["status"]) => {
    try {
      const rule = await automationService.updateDMRecipientRule(id, status, `Marked ${status} from Auto DM recipient manager.`);
      setDMRecipients((items) => items.map((item) => (item.id === id ? rule : item)));
      pushToast(`Auto DM recipient marked ${status}.`);
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || "Failed to update recipient rule." : "Failed to update recipient rule.");
    }
  };

  const bulkUpdateDMRecipientRules = async (ids: number[], status: AutoDMRecipientRuleApi["status"]) => {
    try {
      const data = await automationService.bulkUpdateDMRecipientRules(ids, status, `Marked ${status} from Auto DM recipient manager bulk action.`);
      setDMRecipients((items) =>
        items.map((item) => data.items.find((next) => next.id === item.id) ?? item)
      );
      pushToast(`Updated ${data.updated} Auto DM recipients.`);
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || "Failed to bulk update recipient rules." : "Failed to bulk update recipient rules.");
    }
  };

  const importDMRecipients = async () => {
    try {
      const data = await automationService.importDMRecipients(dmImportCSV);
      setDMRecipients((items) => [...data.items, ...items.filter((item) => !data.items.some((next) => next.id === item.id))]);
      if (data.batch) {
        setDMImports((items) => [data.batch!, ...items.filter((item) => item.id !== data.batch!.id)]);
      }
      setDMImportCSV("");
      pushToast(`Imported ${data.imported} Auto DM recipients. Skipped ${data.skipped}.`);
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || "Failed to import recipients." : "Failed to import recipients.");
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

      <UserOnboardingCard
        accountConnected={accountCount > 0}
        automationEnabled={accountCount > 0 && modules.some((module) => module.config.enabled)}
        postCreated={postCount > 0}
        activityObserved={accountCount > 0 && activityCount > 0}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        {modules.map((module) => (
          <AutomationModuleCard key={module.type} module={module} onToggle={onToggle} onEdit={onEdit} />
        ))}
      </div>

      <AutomationStatusPanel status={runtimeStatus} />

      <AutoDMReviewPanel
        tasks={dmTasks}
        recipients={dmRecipients}
        imports={dmImports}
        onApprove={approveDMTask}
        onBlock={blockDMTask}
        onRetry={retryDMTask}
        onRule={setDMRecipientRule}
        onUpdateRule={updateDMRecipientRule}
        onBulkRule={bulkUpdateDMRecipientRules}
        importCSV={dmImportCSV}
        onImportCSVChange={setDMImportCSV}
        onImport={importDMRecipients}
      />

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
            placeholder="123456789,@username"
            className="min-h-20 w-full resize-y rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35"
          />
        </div>
      </div>
    </Card>
  );
}
