"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Database,
  ListChecks,
  Loader2,
  Pencil,
  PlayCircle,
  Power,
  Send,
  Sparkles,
  Trash2,
  Wand2,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { accountService, type AccountListItem } from "@/services/account.service";
import {
  autoPostService,
  type AutoPostDraftApi,
  type AutoPostExecutionMode,
  type AutoPostGenerationRunApi,
  type AutoPostPlanApi,
} from "@/services/auto-post.service";
import { billingService, type BillingSubscriptionApi } from "@/services/billing.service";
import {
  contentLibraryService,
  type ContentLibraryItemApi,
  type ContentLibraryItemPayload,
  type ContentLibraryItemType,
  type ContentLibraryStatus,
} from "@/services/content-library.service";
import { oafBotService } from "@/services/oaf-bot.service";
import type { OAFBot } from "@/types/oaf-bot";

type LoadState = "loading" | "ready" | "error";
type WorkbenchPanel = "generate" | "planner" | "content" | "history";

type PlannerForm = {
  enabled: boolean;
  executionMode: AutoPostExecutionMode;
  dailyLimit: number;
  minIntervalMinutes: number;
  postingWindows: string;
  timezone: string;
};

const timezones = ["UTC", "Asia/Shanghai", "America/New_York", "Europe/London"];
const executionModes: AutoPostExecutionMode[] = ["manual", "review", "autopilot"];
const contentItemTypes: ContentLibraryItemType[] = ["idea", "product_update", "faq", "case_study", "announcement", "link", "thread_seed"];
const workbenchPanels: Array<{ id: WorkbenchPanel; labelKey: string; descriptionKey: string }> = [
  { id: "generate", labelKey: "autoPost.tabs.generate", descriptionKey: "autoPost.tabs.generateDesc" },
  { id: "planner", labelKey: "autoPost.tabs.planner", descriptionKey: "autoPost.tabs.plannerDesc" },
  { id: "content", labelKey: "autoPost.tabs.content", descriptionKey: "autoPost.tabs.contentDesc" },
  { id: "history", labelKey: "autoPost.tabs.history", descriptionKey: "autoPost.tabs.historyDesc" },
];

type LibraryForm = {
  title: string;
  itemType: ContentLibraryItemType;
  body: string;
  sourceURL: string;
  topics: string;
  growthGoal: string;
  ctaPreference: string;
  priority: number;
  status: ContentLibraryStatus;
};

function defaultForm(limit?: number): PlannerForm {
  return {
    enabled: false,
    executionMode: "review",
    dailyLimit: limit && limit > 0 ? limit : 3,
    minIntervalMinutes: 120,
    postingWindows: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  };
}

function defaultLibraryForm(): LibraryForm {
  return {
    title: "",
    itemType: "idea",
    body: "",
    sourceURL: "",
    topics: "",
    growthGoal: "",
    ctaPreference: "",
    priority: 50,
    status: "active",
  };
}

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusTone(status: string) {
  if (status === "ready_to_publish") return "border-emerald-300/25 bg-emerald-500/10 text-emerald-100";
  if (status === "pending_review" || status === "draft") return "border-amber-300/25 bg-amber-500/10 text-amber-100";
  if (status === "approved" || status === "published") return "border-blue-300/25 bg-blue-500/10 text-blue-100";
  if (status === "rejected" || status === "failed") return "border-rose-300/25 bg-rose-500/10 text-rose-100";
  return "border-white/10 bg-white/[0.05] text-white/65";
}

function runTone(status: string) {
  if (status === "completed") return "border-emerald-300/25 bg-emerald-500/10 text-emerald-100";
  if (status === "skipped") return "border-amber-300/25 bg-amber-500/10 text-amber-100";
  if (status === "failed") return "border-rose-300/25 bg-rose-500/10 text-rose-100";
  return "border-white/10 bg-white/[0.05] text-white/65";
}

export default function AutoPostPage() {
  const { t } = useT();
  const { pushToast } = useToast();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [bots, setBots] = useState<OAFBot[]>([]);
  const [plans, setPlans] = useState<AutoPostPlanApi[]>([]);
  const [drafts, setDrafts] = useState<AutoPostDraftApi[]>([]);
  const [runs, setRuns] = useState<AutoPostGenerationRunApi[]>([]);
  const [contentItems, setContentItems] = useState<ContentLibraryItemApi[]>([]);
  const [subscription, setSubscription] = useState<BillingSubscriptionApi | null>(null);
  const [selectedAccountID, setSelectedAccountID] = useState(0);
  const [selectedContentItemID, setSelectedContentItemID] = useState(0);
  const [form, setForm] = useState<PlannerForm>(() => defaultForm());
  const [libraryForm, setLibraryForm] = useState<LibraryForm>(() => defaultLibraryForm());
  const [editingLibraryID, setEditingLibraryID] = useState<number | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [contentDirection, setContentDirection] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingLibrary, setSavingLibrary] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [runningPlanner, setRunningPlanner] = useState(false);
  const [activePanel, setActivePanel] = useState<WorkbenchPanel>("generate");

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const [accountData, botData, planData, draftData, runData, libraryData, subscriptionData] = await Promise.all([
        accountService.list(),
        oafBotService.list(),
        autoPostService.plans(),
        autoPostService.drafts(),
        autoPostService.runs(),
        contentLibraryService.list({ limit: 100 }),
        billingService.subscription(),
      ]);
      const connected = accountData.items.filter((account) => account.status !== "disconnected");
      setAccounts(connected);
      setBots(botData.items);
      setPlans(planData.items);
      setDrafts(draftData.items);
      setRuns(runData.items);
      setContentItems(libraryData.items);
      setSubscription(subscriptionData);
      const firstAccountID = selectedAccountID || connected[0]?.id || 0;
      setSelectedAccountID(firstAccountID);
      const currentPlan = planData.items.find((item) => item.x_account_id === firstAccountID);
      setForm(currentPlan ? formFromPlan(currentPlan) : defaultForm(subscriptionData.limits.daily_auto_posts));
      setLoadState("ready");
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoPost.errors.load") : t("autoPost.errors.load"));
      setLoadState("error");
    }
  }, [pushToast, selectedAccountID, t]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedBot = useMemo(() => bots.find((bot) => bot.twitter_account_id === selectedAccountID) || null, [bots, selectedAccountID]);
  const selectedPlan = useMemo(() => plans.find((plan) => plan.x_account_id === selectedAccountID) || null, [plans, selectedAccountID]);
  const availableContentItems = useMemo(
    () =>
      contentItems.filter((item) => {
        if (item.status === "archived") return false;
        if (item.twitter_account_id && item.twitter_account_id !== selectedAccountID) return false;
        if (item.bot_id && item.bot_id !== selectedBot?.id) return false;
        return true;
      }),
    [contentItems, selectedAccountID, selectedBot?.id]
  );
  const selectedContentItem = useMemo(
    () => availableContentItems.find((item) => item.id === selectedContentItemID) || null,
    [availableContentItems, selectedContentItemID]
  );
  const accountDraftsAll = useMemo(() => drafts.filter((draft) => draft.x_account_id === selectedAccountID), [drafts, selectedAccountID]);
  const accountDrafts = useMemo(() => accountDraftsAll.slice(0, 5), [accountDraftsAll]);
  const accountRuns = useMemo(() => runs.filter((run) => run.x_account_id === selectedAccountID).slice(0, 5), [runs, selectedAccountID]);
  const activeContentCount = useMemo(() => availableContentItems.filter((item) => item.status === "active").length, [availableContentItems]);
  const queuedDraftCount = useMemo(
    () => accountDraftsAll.filter((draft) => ["draft", "pending_review", "approved", "ready_to_publish"].includes(draft.status)).length,
    [accountDraftsAll]
  );
  const publishReadyCount = useMemo(
    () => accountDraftsAll.filter((draft) => ["approved", "ready_to_publish", "published"].includes(draft.status)).length,
    [accountDraftsAll]
  );
  const aiLimit = subscription?.limits.ai_generations_monthly || 0;
  const aiUsed = subscription?.usage.ai_generations_month || 0;
  const aiRemaining = Math.max(aiLimit - aiUsed, 0);
  const aiPercent = aiLimit > 0 ? Math.min(100, Math.round((aiUsed / aiLimit) * 100)) : 0;
  const latestRun = accountRuns[0];
  const canAutopilotPublish = (selectedPlan?.execution_mode || form.executionMode) === "autopilot";

  const skipReasonLabel = useCallback(
    (reason?: string) => {
      if (!reason) return t("autoPost.runs.skipReason.unknown");
      const key = `autoPost.runs.skipReason.${reason}`;
      const translated = t(key);
      return translated === key ? reason : translated;
    },
    [t]
  );

  const onAccountChange = (accountID: number) => {
    setSelectedAccountID(accountID);
    setSelectedContentItemID(0);
    const plan = plans.find((item) => item.x_account_id === accountID);
    setForm(plan ? formFromPlan(plan) : defaultForm(subscription?.limits.daily_auto_posts));
  };

  const savePlan = async () => {
    if (!selectedAccountID) {
      pushToast(t("autoPost.errors.needAccount"));
      return;
    }
    if (selectedContentItem && selectedContentItem.status !== "active") {
      pushToast(t("autoPost.contentLibrary.errors.inactiveSelected"));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        x_account_id: selectedAccountID,
        enabled: form.enabled,
        execution_mode: form.executionMode,
        daily_limit: Number(form.dailyLimit) || 1,
        min_interval_minutes: Number(form.minIntervalMinutes) || 1,
        posting_windows: form.postingWindows.trim(),
        timezone: form.timezone.trim() || "UTC",
      };
      const saved = selectedPlan ? await autoPostService.updatePlan(selectedPlan.id, payload) : await autoPostService.createPlan(payload);
      setPlans((current) => {
        const without = current.filter((item) => item.id !== saved.id && item.x_account_id !== saved.x_account_id);
        return [saved, ...without];
      });
      setForm(formFromPlan(saved));
      pushToast(t("autoPost.toast.saved"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoPost.errors.save") : t("autoPost.errors.save"));
    } finally {
      setSaving(false);
    }
  };

  const resetLibraryForm = () => {
    setEditingLibraryID(null);
    setLibraryForm(defaultLibraryForm());
    setLibraryOpen(false);
  };

  const editLibraryItem = (item: ContentLibraryItemApi) => {
    setEditingLibraryID(item.id);
    setLibraryForm({
      title: item.title,
      itemType: item.item_type,
      body: item.body,
      sourceURL: item.source_url || "",
      topics: item.topics.join(", "),
      growthGoal: item.growth_goal || "",
      ctaPreference: item.cta_preference || "",
      priority: item.priority || 50,
      status: item.status,
    });
    setLibraryOpen(true);
  };

  const saveLibraryItem = async () => {
    if (!selectedAccountID) {
      pushToast(t("autoPost.errors.needAccount"));
      return;
    }
    if (!libraryForm.title.trim() || !libraryForm.body.trim()) {
      pushToast(t("autoPost.contentLibrary.errors.required"));
      return;
    }
    setSavingLibrary(true);
    try {
      const payload: ContentLibraryItemPayload = {
        twitter_account_id: selectedAccountID,
        title: libraryForm.title.trim(),
        item_type: libraryForm.itemType,
        body: libraryForm.body.trim(),
        source_url: libraryForm.sourceURL.trim() || undefined,
        topics: splitTopics(libraryForm.topics),
        growth_goal: libraryForm.growthGoal.trim() || undefined,
        cta_preference: libraryForm.ctaPreference.trim() || undefined,
        priority: Number(libraryForm.priority) || 50,
        status: libraryForm.status,
      };
      const wasEditing = Boolean(editingLibraryID);
      const saved = editingLibraryID
        ? await contentLibraryService.update(editingLibraryID, payload)
        : await contentLibraryService.create(payload);
      setContentItems((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setSelectedContentItemID(saved.id);
      resetLibraryForm();
      pushToast(t(wasEditing ? "autoPost.contentLibrary.toast.updated" : "autoPost.contentLibrary.toast.created"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoPost.contentLibrary.errors.save") : t("autoPost.contentLibrary.errors.save"));
    } finally {
      setSavingLibrary(false);
    }
  };

  const updateLibraryStatus = async (item: ContentLibraryItemApi, status: ContentLibraryStatus) => {
    try {
      const saved = await contentLibraryService.update(item.id, {
        twitter_account_id: item.twitter_account_id,
        bot_id: item.bot_id,
        title: item.title,
        item_type: item.item_type,
        body: item.body,
        source_url: item.source_url,
        topics: item.topics,
        growth_goal: item.growth_goal,
        cta_preference: item.cta_preference,
        priority: item.priority,
        status,
      });
      setContentItems((current) => current.map((row) => (row.id === saved.id ? saved : row)));
      pushToast(t("autoPost.contentLibrary.toast.updated"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoPost.contentLibrary.errors.save") : t("autoPost.contentLibrary.errors.save"));
    }
  };

  const deleteLibraryItem = async (item: ContentLibraryItemApi) => {
    if (!window.confirm(t("autoPost.contentLibrary.confirmDelete"))) return;
    try {
      await contentLibraryService.delete(item.id);
      setContentItems((current) => current.filter((row) => row.id !== item.id));
      if (selectedContentItemID === item.id) setSelectedContentItemID(0);
      pushToast(t("autoPost.contentLibrary.toast.deleted"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoPost.contentLibrary.errors.delete") : t("autoPost.contentLibrary.errors.delete"));
    }
  };

  const generateDraft = async () => {
    let plan = selectedPlan;
    if (!selectedAccountID) {
      pushToast(t("autoPost.errors.needAccount"));
      return;
    }
    setGenerating(true);
    try {
      if (!plan) {
        const saved = await autoPostService.createPlan({
          x_account_id: selectedAccountID,
          enabled: form.enabled,
          execution_mode: form.executionMode,
          daily_limit: Number(form.dailyLimit) || 1,
          min_interval_minutes: Number(form.minIntervalMinutes) || 1,
          posting_windows: form.postingWindows.trim(),
          timezone: form.timezone.trim() || "UTC",
        });
        plan = saved;
        setPlans((current) => [saved, ...current.filter((item) => item.x_account_id !== saved.x_account_id)]);
      }
      const draft = await autoPostService.generateDraft(plan.id, contentDirection.trim(), selectedContentItem?.id);
      setDrafts((current) => [draft, ...current.filter((item) => item.id !== draft.id)]);
      setContentDirection("");
      pushToast(t("autoPost.toast.generated"));
      setActivePanel("history");
      void load();
    } catch (error) {
      const code = axios.isAxiosError(error) ? error.response?.data?.error_code : "";
      if (code === "ai_generation_quota_exceeded") {
        pushToast(t("autoPost.errors.aiQuotaExceeded"));
      } else if (code === "auto_post_daily_limit_exceeded") {
        pushToast(t("autoPost.errors.dailyLimitExceeded"));
      } else if (code === "auto_post_duplicate_content") {
        pushToast(t("autoPost.errors.duplicateContent"));
      } else {
        pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoPost.errors.generate") : t("autoPost.errors.generate"));
      }
    } finally {
      setGenerating(false);
    }
  };

  const runPlannerNow = async () => {
    if (!selectedPlan) {
      pushToast(t("autoPost.runNow.needPlanner"));
      return;
    }
    if (!window.confirm(t("autoPost.runNow.confirm"))) return;
    setRunningPlanner(true);
    try {
      const run = await autoPostService.runNow(selectedPlan.id);
      setRuns((current) => [run, ...current.filter((item) => item.id !== run.id)]);
      if (run.status === "completed") {
        pushToast(t("autoPost.runNow.toast.completed"));
      } else if (run.status === "skipped") {
        pushToast(t("autoPost.runNow.toast.skipped", { reason: skipReasonLabel(run.skip_reason) }));
      } else {
        pushToast(t("autoPost.runNow.toast.failed"));
      }
      setActivePanel("history");
      void load();
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoPost.runNow.errors.failed") : t("autoPost.runNow.errors.failed"));
    } finally {
      setRunningPlanner(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium text-[#1d9bf0]">{t("autoPost.kicker")}</p>
          <h1 className="mt-2 text-3xl font-bold text-[#e7e9ea]">{t("autoPost.title")}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#71767b]">{t("autoPost.subtitle")}</p>
        </div>
        <Link href="/execution-queue?type=post" className="inline-flex">
          <Button variant="outline">
            {t("autoPost.actions.openQueue")}
            <ArrowRight className="size-4" />
          </Button>
        </Link>
      </div>

      {loadState === "loading" ? (
        <Card className="flex items-center gap-3 text-sm text-[#71767b]">
          <Loader2 className="size-4 animate-spin" />
          {t("common.loading")}
        </Card>
      ) : null}

      {loadState === "error" ? (
        <Card className="space-y-3 bg-[#0f1419]">
          <CardHeader title={t("automation.error.title")} description={t("autoPost.errors.load")} />
          <Button type="button" variant="outline" onClick={() => void load()}>
            {t("common.retry")}
          </Button>
        </Card>
      ) : null}

      {loadState === "ready" ? (
        <>
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr_0.9fr]">
            <Card>
              <CardHeader title={t("autoPost.account.title")} description={t("autoPost.account.description")} />
              {accounts.length > 0 ? (
                <label className="block space-y-2">
                  <span className="text-xs font-medium text-[#71767b]">{t("autoPost.account.label")}</span>
                  <select
                    value={selectedAccountID}
                    onChange={(event) => onAccountChange(Number(event.target.value))}
                    className="h-11 w-full rounded-2xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none focus:border-[#1d9bf0]"
                  >
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        @{account.username || account.display_name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="rounded-xl border border-amber-300/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                  {t("autoPost.account.empty")}
                </div>
              )}
              <div className="mt-4 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[#2f3336] bg-black">
                    <Bot className="size-5 text-[#1d9bf0]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#e7e9ea]">{selectedBot ? selectedBot.name : t("autoPost.bot.defaultTitle")}</p>
                    <p className="mt-1 text-sm leading-6 text-[#71767b]">
                      {selectedBot ? t("autoPost.bot.boundHint", { tone: selectedBot.voice_tone || t("autoPost.bot.noTone") }) : t("autoPost.bot.unboundHint")}
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title={t("autoPost.ai.title")} description={t("autoPost.ai.description")} />
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-2xl font-bold text-[#e7e9ea]">{aiRemaining.toLocaleString()}</p>
                  <p className="mt-1 text-xs text-[#71767b]">{t("autoPost.ai.remaining")}</p>
                </div>
                <div className="text-right text-xs text-[#71767b]">
                  <p>{t("autoPost.ai.used", { used: aiUsed.toLocaleString(), limit: aiLimit.toLocaleString() })}</p>
                  <p>{t("autoPost.ai.percent", { percent: aiPercent })}</p>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#2f3336]">
                <div className="h-full rounded-full bg-[#1d9bf0]" style={{ width: `${aiPercent}%` }} />
              </div>
            </Card>

            <Card>
              <CardHeader
                title={t("autoPost.status.title")}
                description={t("autoPost.status.description")}
                right={
                  <Button size="sm" type="button" onClick={() => void runPlannerNow()} disabled={runningPlanner || !selectedAccountID}>
                    {runningPlanner ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
                    {t("autoPost.runNow.button")}
                  </Button>
                }
              />
              <div className="space-y-3 text-sm">
                <StatusRow label={t("autoPost.status.plan")} value={selectedPlan ? t("autoPost.status.configured") : t("autoPost.status.notConfigured")} />
                <StatusRow label={t("autoPost.status.enabled")} value={selectedPlan?.enabled ? t("autoPost.status.enabledValue") : t("autoPost.status.pausedValue")} />
                <StatusRow label={t("autoPost.status.mode")} value={t(`autoPost.executionMode.${selectedPlan?.execution_mode || form.executionMode}`)} />
                <StatusRow label={t("autoPost.status.lastRun")} value={selectedPlan?.last_run_at ? formatDate(selectedPlan.last_run_at) : t("autoPost.common.emptyValue")} />
                <StatusRow label={t("autoPost.status.nextRun")} value={selectedPlan?.next_run_at ? formatDate(selectedPlan.next_run_at) : t("autoPost.common.emptyValue")} />
                <StatusRow label={t("autoPost.status.activeContent")} value={t("autoPost.status.activeContentValue", { count: activeContentCount })} />
                <StatusRow
                  label={t("autoPost.status.lastRunResult")}
                  value={latestRun ? t(`autoPost.runs.status.${latestRun.status}`) : t("autoPost.common.emptyValue")}
                />
                <StatusRow label={t("autoPost.status.dailyLimit")} value={String(selectedPlan?.daily_limit || form.dailyLimit)} />
                <StatusRow label={t("autoPost.status.minInterval")} value={t("autoPost.status.minIntervalValue", { minutes: selectedPlan?.min_interval_minutes || form.minIntervalMinutes })} />
                <StatusRow label={t("autoPost.status.timezone")} value={selectedPlan?.timezone || form.timezone || "UTC"} />
              </div>
            </Card>
          </div>

          <AutoPostSetupGuide
            hasAccount={Boolean(selectedAccountID)}
            hasActiveContent={activeContentCount > 0}
            plannerEnabled={Boolean(selectedPlan?.enabled || form.enabled)}
            autopilotEnabled={canAutopilotPublish}
            onOpenPanel={setActivePanel}
          />

          <AutoPostPipelineSummary
            activeContentCount={activeContentCount}
            selectedContentItem={selectedContentItem}
            selectedPlan={selectedPlan}
            queuedDraftCount={queuedDraftCount}
            publishReadyCount={publishReadyCount}
            latestRun={latestRun}
            onOpenPanel={setActivePanel}
          />

          <WorkbenchTabs activePanel={activePanel} onChange={setActivePanel} />

          <div className="space-y-5">
            {activePanel === "planner" ? (
              <Card>
                <CardHeader title={t("autoPost.planner.title")} description={t("autoPost.planner.description")} />
                <div className="space-y-4">
                {form.enabled && activeContentCount === 0 ? (
                  <div className="flex flex-col gap-3 rounded-xl border border-amber-300/20 bg-amber-500/10 p-3 text-sm leading-6 text-amber-50/85 sm:flex-row sm:items-center sm:justify-between">
                    <span>{t("autoPost.scheduler.noActiveContentHint")}</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => setActivePanel("content")}>
                      {t("autoPost.setup.actions.addContent")}
                    </Button>
                  </div>
                ) : null}
                {form.enabled && selectedPlan && !selectedPlan.next_run_at ? (
                  <div className="rounded-xl border border-blue-300/20 bg-blue-500/10 p-3 text-sm leading-6 text-blue-50/85">
                    {t("autoPost.scheduler.noNextRunHint")}
                  </div>
                ) : null}
                {aiRemaining <= 0 ? (
                  <div className="rounded-xl border border-rose-300/20 bg-rose-500/10 p-3 text-sm leading-6 text-rose-50/85">
                    {t("autoPost.scheduler.aiQuotaHint")}
                  </div>
                ) : null}
                <label className="flex flex-col gap-4 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[#e7e9ea]">{t("autoPost.fields.enabled")}</span>
                    <span className="mt-1 block text-xs leading-5 text-[#71767b]">{t("autoPost.fields.enabledHelper")}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
                    className="size-5 accent-blue-500"
                  />
                </label>

                <div className="grid gap-3">
                  <p className="text-xs font-medium text-[#71767b]">{t("autoPost.fields.executionMode")}</p>
                  <div className="grid gap-2 md:grid-cols-3">
                    {executionModes.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setForm((current) => ({ ...current, executionMode: mode }))}
                        className={`rounded-xl border p-3 text-left transition ${
                          form.executionMode === mode
                            ? "border-[#1d9bf0]/55 bg-[#1d9bf0]/12 text-[#e7e9ea]"
                            : "border-[#2f3336] bg-black text-[#71767b] hover:bg-[#16181c] hover:text-[#e7e9ea]"
                        }`}
                      >
                        <span className="block text-sm font-semibold">{t(`autoPost.executionMode.${mode}`)}</span>
                        <span className="mt-1 block text-xs leading-5 text-[#71767b]">{t(`autoPost.executionMode.${mode}Helper`)}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <TextInput
                    type="number"
                    label={t("autoPost.fields.dailyLimit")}
                    value={String(form.dailyLimit)}
                    onChange={(value) => setForm((current) => ({ ...current, dailyLimit: Number(value) }))}
                    helper={t("autoPost.fields.dailyLimitHelper")}
                  />
                  <TextInput
                    type="number"
                    label={t("autoPost.fields.minInterval")}
                    value={String(form.minIntervalMinutes)}
                    onChange={(value) => setForm((current) => ({ ...current, minIntervalMinutes: Number(value) }))}
                    helper={t("autoPost.fields.minIntervalHelper")}
                  />
                </div>

                <label className="block space-y-2">
                  <span className="text-xs font-medium text-[#71767b]">{t("autoPost.fields.postingWindows")}</span>
                  <input
                    value={form.postingWindows}
                    onChange={(event) => setForm((current) => ({ ...current, postingWindows: event.target.value }))}
                    placeholder={t("autoPost.fields.postingWindowsPlaceholder")}
                    className="h-11 w-full rounded-2xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none placeholder:text-[#71767b] focus:border-[#1d9bf0]"
                  />
                  <span className="text-xs leading-5 text-[#71767b]">{t("autoPost.fields.postingWindowsHelper")}</span>
                </label>

                <label className="block space-y-2">
                  <span className="text-xs font-medium text-[#71767b]">{t("autoPost.fields.timezone")}</span>
                  <select
                    value={form.timezone}
                    onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}
                    className="h-11 w-full rounded-2xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none focus:border-[#1d9bf0]"
                  >
                    {timezones.map((timezone) => (
                      <option key={timezone} value={timezone}>
                        {t(`autoPost.timezone.${timezone.replaceAll("/", "_")}`)}
                      </option>
                    ))}
                  </select>
                </label>

                <Button type="button" onClick={() => void savePlan()} disabled={saving || !selectedAccountID}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  {t("autoPost.actions.savePlanner")}
                </Button>
              </div>
              </Card>
            ) : null}

            {activePanel === "content" ? (
              <Card>
                <CardHeader
                  title={t("autoPost.contentLibrary.title")}
                  description={t("autoPost.contentLibrary.description")}
                  right={
                    <Button size="sm" variant="outline" onClick={() => setLibraryOpen((open) => !open)}>
                      {libraryOpen ? t("autoPost.contentLibrary.closeForm") : t("autoPost.contentLibrary.add")}
                    </Button>
                  }
                />
                <div className="mb-4 grid gap-3 md:grid-cols-3">
                  <LibraryMetric label={t("autoPost.contentLibrary.metrics.active")} value={activeContentCount} />
                  <LibraryMetric label={t("autoPost.contentLibrary.metrics.total")} value={availableContentItems.length} />
                  <LibraryMetric
                    label={t("autoPost.contentLibrary.metrics.selected")}
                    value={selectedContentItem ? t("autoPost.contentLibrary.metrics.selectedYes") : t("autoPost.contentLibrary.metrics.selectedNo")}
                  />
                </div>

                {libraryOpen ? (
                  <div className="mb-4 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block space-y-2">
                        <span className="text-xs font-medium text-[#71767b]">{t("autoPost.contentLibrary.fields.title")}</span>
                        <input
                          value={libraryForm.title}
                          onChange={(event) => setLibraryForm((current) => ({ ...current, title: event.target.value }))}
                          placeholder={t("autoPost.contentLibrary.fields.titlePlaceholder")}
                          className="h-10 w-full rounded-2xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none placeholder:text-[#71767b] focus:border-[#1d9bf0]"
                        />
                      </label>
                      <label className="block space-y-2">
                        <span className="text-xs font-medium text-[#71767b]">{t("autoPost.contentLibrary.fields.itemType")}</span>
                        <select
                          value={libraryForm.itemType}
                          onChange={(event) => setLibraryForm((current) => ({ ...current, itemType: event.target.value as ContentLibraryItemType }))}
                          className="h-10 w-full rounded-2xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none focus:border-[#1d9bf0]"
                        >
                          {contentItemTypes.map((type) => (
                            <option key={type} value={type}>
                              {t(`autoPost.contentLibrary.itemType.${type}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="mt-3 block space-y-2">
                      <span className="text-xs font-medium text-[#71767b]">{t("autoPost.contentLibrary.fields.body")}</span>
                      <textarea
                        value={libraryForm.body}
                        onChange={(event) => setLibraryForm((current) => ({ ...current, body: event.target.value }))}
                        rows={4}
                        placeholder={t("autoPost.contentLibrary.fields.bodyPlaceholder")}
                        className="w-full resize-y rounded-2xl border border-[#2f3336] bg-black px-3 py-3 text-sm leading-6 text-[#e7e9ea] outline-none placeholder:text-[#71767b] focus:border-[#1d9bf0]"
                      />
                    </label>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="block space-y-2">
                        <span className="text-xs font-medium text-white/60">{t("autoPost.contentLibrary.fields.topics")}</span>
                        <input
                          value={libraryForm.topics}
                          onChange={(event) => setLibraryForm((current) => ({ ...current, topics: event.target.value }))}
                          placeholder={t("autoPost.contentLibrary.fields.topicsPlaceholder")}
                          className="h-10 w-full rounded-2xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none placeholder:text-[#71767b] focus:border-[#1d9bf0]"
                        />
                      </label>
                      <label className="block space-y-2">
                        <span className="text-xs font-medium text-white/60">{t("autoPost.contentLibrary.fields.sourceUrl")}</span>
                        <input
                          value={libraryForm.sourceURL}
                          onChange={(event) => setLibraryForm((current) => ({ ...current, sourceURL: event.target.value }))}
                          placeholder={t("autoPost.contentLibrary.fields.sourceUrlPlaceholder")}
                          className="h-10 w-full rounded-2xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none placeholder:text-[#71767b] focus:border-[#1d9bf0]"
                        />
                      </label>
                      <label className="block space-y-2">
                        <span className="text-xs font-medium text-white/60">{t("autoPost.contentLibrary.fields.growthGoal")}</span>
                        <input
                          value={libraryForm.growthGoal}
                          onChange={(event) => setLibraryForm((current) => ({ ...current, growthGoal: event.target.value }))}
                          placeholder={t("autoPost.contentLibrary.fields.growthGoalPlaceholder")}
                          className="h-10 w-full rounded-2xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none placeholder:text-[#71767b] focus:border-[#1d9bf0]"
                        />
                      </label>
                      <label className="block space-y-2">
                        <span className="text-xs font-medium text-white/60">{t("autoPost.contentLibrary.fields.ctaPreference")}</span>
                        <input
                          value={libraryForm.ctaPreference}
                          onChange={(event) => setLibraryForm((current) => ({ ...current, ctaPreference: event.target.value }))}
                          placeholder={t("autoPost.contentLibrary.fields.ctaPreferencePlaceholder")}
                          className="h-10 w-full rounded-2xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none placeholder:text-[#71767b] focus:border-[#1d9bf0]"
                        />
                      </label>
                    </div>
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                      <label className="flex items-center gap-2 text-xs text-[#71767b]">
                        {t("autoPost.contentLibrary.fields.status")}
                        <select
                          value={libraryForm.status}
                          onChange={(event) => setLibraryForm((current) => ({ ...current, status: event.target.value as ContentLibraryStatus }))}
                          className="h-9 rounded-full border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none focus:border-[#1d9bf0]"
                        >
                          <option value="active">{t("autoPost.contentLibrary.status.active")}</option>
                          <option value="paused">{t("autoPost.contentLibrary.status.paused")}</option>
                        </select>
                      </label>
                      <div className="grid gap-2 sm:flex">
                        <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={resetLibraryForm}>
                          {t("common.cancel")}
                        </Button>
                        <Button type="button" className="w-full sm:w-auto" onClick={() => void saveLibraryItem()} disabled={savingLibrary}>
                          {savingLibrary ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                          {editingLibraryID ? t("autoPost.contentLibrary.saveEdit") : t("autoPost.contentLibrary.saveNew")}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {availableContentItems.length === 0 ? (
                  <div className="rounded-2xl border border-[#2f3336] bg-black px-4 py-8 text-center text-sm leading-6 text-[#71767b]">
                    <p>{t("autoPost.contentLibrary.empty")}</p>
                    <Button type="button" className="mt-4" size="sm" onClick={() => setLibraryOpen(true)}>
                      {t("autoPost.contentLibrary.addFirst")}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => setSelectedContentItemID(0)}
                      className={`w-full rounded-xl border p-3 text-left text-sm transition ${
                        selectedContentItemID === 0 ? "border-[#1d9bf0]/55 bg-[#1d9bf0]/12 text-[#e7e9ea]" : "border-[#2f3336] bg-black text-[#71767b] hover:bg-[#16181c] hover:text-[#e7e9ea]"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span>{t("autoPost.contentLibrary.noSelection")}</span>
                        {selectedContentItemID === 0 ? (
                          <span className="rounded-full border border-[#1d9bf0]/35 bg-[#1d9bf0]/10 px-2 py-0.5 text-xs text-[#8ecdf8]">
                            {t("autoPost.contentLibrary.selectedForGenerate")}
                          </span>
                        ) : null}
                      </span>
                    </button>
                    {availableContentItems.map((item) => (
                      <div
                        key={item.id}
                        className={`rounded-xl border p-4 transition ${
                          selectedContentItemID === item.id ? "border-[#1d9bf0]/55 bg-[#1d9bf0]/12" : "border-[#2f3336] bg-black hover:bg-[#16181c]"
                        }`}
                      >
                        <button type="button" className="w-full text-left" onClick={() => setSelectedContentItemID(item.id)}>
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className="min-w-0 break-words text-sm font-semibold text-[#e7e9ea] [overflow-wrap:anywhere]">{item.title}</span>
                            {selectedContentItemID === item.id ? (
                              <span className="rounded-full border border-[#1d9bf0]/35 bg-[#1d9bf0]/10 px-2 py-0.5 text-xs text-[#8ecdf8]">
                                {t("autoPost.contentLibrary.selectedForGenerate")}
                              </span>
                            ) : null}
                            <span className="rounded-full border border-[#2f3336] bg-[#0f1419] px-2 py-0.5 text-xs text-[#71767b]">
                              {t(`autoPost.contentLibrary.itemType.${item.item_type}`)}
                            </span>
                            <span className={`rounded-full border px-2 py-0.5 text-xs ${item.status === "active" ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100" : "border-amber-300/20 bg-amber-500/10 text-amber-100"}`}>
                              {t(`autoPost.contentLibrary.status.${item.status}`)}
                            </span>
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#e7e9ea]/70">{item.body}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#71767b]">
                            {item.topics.slice(0, 4).map((topic) => (
                              <span key={topic} className="rounded-full bg-[#0f1419] px-2 py-0.5">{topic}</span>
                            ))}
                            <span>{t("autoPost.contentLibrary.usageCount", { count: item.usage_count })}</span>
                            {item.last_used_at ? <span>{t("autoPost.contentLibrary.lastUsed", { time: formatDate(item.last_used_at) })}</span> : null}
                          </div>
                        </button>
                        <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap sm:justify-end">
                          <Button size="sm" className="w-full sm:w-auto" variant="outline" type="button" onClick={() => editLibraryItem(item)}>
                            <Pencil className="size-4" />
                            {t("autoPost.contentLibrary.edit")}
                          </Button>
                          <Button size="sm" className="w-full sm:w-auto" variant="outline" type="button" onClick={() => void updateLibraryStatus(item, item.status === "active" ? "paused" : "active")}>
                            <Power className="size-4" />
                            {item.status === "active" ? t("autoPost.contentLibrary.pause") : t("autoPost.contentLibrary.activate")}
                          </Button>
                          <Button size="sm" className="w-full sm:w-auto" variant="outline" type="button" onClick={() => void deleteLibraryItem(item)}>
                            <Trash2 className="size-4" />
                            {t("autoPost.contentLibrary.delete")}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            ) : null}

            {activePanel === "generate" ? (
              <Card>
                <CardHeader title={t("autoPost.generate.title")} description={t("autoPost.generate.description")} />
                <div className="mb-4 grid gap-3 lg:grid-cols-3">
                  <WorkbenchSignal
                    icon={Database}
                    label={t("autoPost.generate.signal.source")}
                    title={selectedContentItem ? selectedContentItem.title : t("autoPost.generate.signal.manualDirection")}
                    description={selectedContentItem ? t("autoPost.generate.signal.sourceSelected") : t("autoPost.generate.signal.sourceFallback")}
                    tone="blue"
                  />
                  <WorkbenchSignal
                    icon={Bot}
                    label={t("autoPost.generate.signal.persona")}
                    title={selectedBot ? selectedBot.name : t("autoPost.bot.defaultTitle")}
                    description={selectedBot ? t("autoPost.generate.signal.oafBotSource") : t("autoPost.bot.unboundHint")}
                    tone="green"
                  />
                  <WorkbenchSignal
                    icon={ListChecks}
                    label={t("autoPost.generate.signal.destination")}
                    title={t("autoPost.generate.signal.executionQueue")}
                    description={t("autoPost.generate.signal.destinationDesc", { mode: t(`autoPost.executionMode.${selectedPlan?.execution_mode || form.executionMode}`) })}
                    tone="violet"
                  />
                </div>
                <label className="mb-4 block space-y-2">
                  <span className="text-xs font-medium text-[#71767b]">{t("autoPost.generate.contentItemLabel")}</span>
                  <select
                    value={selectedContentItemID}
                    onChange={(event) => setSelectedContentItemID(Number(event.target.value))}
                    className="h-11 w-full rounded-2xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none focus:border-[#1d9bf0]"
                  >
                    <option value={0}>{t("autoPost.generate.noContentItem")}</option>
                    {availableContentItems
                      .filter((item) => item.status === "active")
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                        </option>
                    ))}
                  </select>
                </label>
                {selectedContentItem ? (
                  <div className="mb-4 rounded-2xl border border-[#2f3336] bg-black p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[#1d9bf0]/35 bg-[#1d9bf0]/10 px-2.5 py-1 text-xs text-[#8ecdf8]">
                        {t("autoPost.generate.selectedMaterial")}
                      </span>
                      <span className="rounded-full border border-[#2f3336] bg-[#0f1419] px-2.5 py-1 text-xs text-[#71767b]">
                        {t(`autoPost.contentLibrary.itemType.${selectedContentItem.item_type}`)}
                      </span>
                      <span className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-100">
                        {t("autoPost.contentLibrary.usageCount", { count: selectedContentItem.usage_count })}
                      </span>
                    </div>
                    <p className="mt-3 line-clamp-3 break-words text-sm leading-6 text-[#e7e9ea]/78 [overflow-wrap:anywhere]">{selectedContentItem.body}</p>
                  </div>
                ) : null}
                <label className="block space-y-2">
                  <span className="text-xs font-medium text-[#71767b]">{t("autoPost.generate.directionLabel")}</span>
                  <textarea
                    value={contentDirection}
                    onChange={(event) => setContentDirection(event.target.value)}
                    rows={4}
                    placeholder={t("autoPost.generate.directionPlaceholder")}
                    className="w-full resize-y rounded-2xl border border-[#2f3336] bg-black px-3 py-3 text-sm leading-6 text-[#e7e9ea] outline-none placeholder:text-[#71767b] focus:border-[#1d9bf0]"
                  />
                </label>
                <div className="mt-4 rounded-2xl border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 p-3 text-sm leading-6 text-[#e7e9ea]/78">
                  {selectedBot ? t("autoPost.generate.botHint", { bot: selectedBot.name }) : t("autoPost.generate.defaultHint")}
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <p className="text-xs text-[#71767b]">{t("autoPost.generate.quotaHint")}</p>
                  <Button type="button" className="w-full sm:w-auto" onClick={() => void generateDraft()} disabled={generating || !selectedAccountID || aiRemaining <= 0}>
                    {generating ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                    {t("autoPost.actions.generateNow")}
                  </Button>
                </div>
              </Card>
            ) : null}

            {activePanel === "history" ? (
              <div className="grid gap-5 xl:grid-cols-2">
                <Card>
                <CardHeader
                  title={t("autoPost.drafts.title")}
                  description={t("autoPost.drafts.description")}
                  right={<Sparkles className="size-4 text-blue-100/70" />}
                />
                {accountDrafts.length === 0 ? (
                  <div className="rounded-2xl border border-[#2f3336] bg-black px-4 py-8 text-center text-sm text-[#71767b]">
                    {t("autoPost.drafts.empty")}
                  </div>
                ) : (
                  <div className="-mx-5 divide-y divide-[#2f3336] md:-mx-6">
                    {accountDrafts.map((draft) => (
                      <div key={draft.id} className="px-5 py-4 transition-colors hover:bg-[#080808] md:px-6">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-xs ${statusTone(draft.status)}`}>{t(`executionQueue.status.${draft.status}`)}</span>
                          {draft.content_title ? (
                            <span className="rounded-full border border-[#2f3336] bg-[#0f1419] px-2.5 py-1 text-xs text-[#71767b]">
                              {draft.content_title}
                            </span>
                          ) : null}
                          <span className="rounded-full border border-[#2f3336] bg-[#0f1419] px-2.5 py-1 text-xs text-[#71767b]">
                            {t(`autoPost.executionMode.${selectedPlan?.execution_mode || form.executionMode}`)}
                          </span>
                          <span className="text-xs text-[#71767b]">{formatDate(draft.created_at)}</span>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-7 text-[#e7e9ea]">{draft.generated_content}</p>
                        {draft.failure_reason ? <p className="mt-2 text-xs text-amber-100">{draft.failure_reason}</p> : null}
                        <div className="mt-3 grid gap-2 text-xs text-[#71767b] sm:grid-cols-3">
                          <DraftRouteStep label={t("autoPost.pipeline.material")} value={draft.content_title || t("autoPost.runs.noContentItem")} />
                          <DraftRouteStep label={t("autoPost.pipeline.queue")} value={t(`executionQueue.status.${draft.status}`)} />
                          <DraftRouteStep label={t("autoPost.pipeline.publish")} value={draft.status === "published" ? t("autoPost.pipeline.published") : t("autoPost.pipeline.waiting")} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                </Card>

                <Card>
                <CardHeader title={t("autoPost.runs.title")} description={t("autoPost.runs.description")} />
                {accountRuns.length === 0 ? (
                  <div className="rounded-2xl border border-[#2f3336] bg-black px-4 py-8 text-center text-sm text-[#71767b]">
                    {t("autoPost.runs.empty")}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {accountRuns.map((run) => (
                      <div key={run.id} className="rounded-2xl border border-[#2f3336] bg-black p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-xs ${runTone(run.status)}`}>
                            {t(`autoPost.runs.status.${run.status}`)}
                          </span>
                          {run.content_title ? (
                            <span className="rounded-full border border-[#2f3336] bg-[#0f1419] px-2.5 py-1 text-xs text-[#71767b]">
                              {run.content_title}
                            </span>
                          ) : null}
                          <span className="text-xs text-[#71767b]">{formatDate(run.created_at)}</span>
                        </div>
                        {run.skip_reason ? (
                          <p className="mt-2 text-sm leading-6 text-[#71767b]">
                            {skipReasonLabel(run.skip_reason)}
                          </p>
                        ) : null}
                        {run.error_message ? <p className="mt-2 break-words text-xs text-rose-100">{run.error_message}</p> : null}
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#71767b]">
                          <span>
                            {run.content_library_item_title || run.content_title
                              ? t("autoPost.runs.contentItem", { title: run.content_library_item_title || run.content_title || "" })
                              : t("autoPost.runs.noContentItem")}
                          </span>
                          {run.generated_draft_id ? (
                            <Link href="/execution-queue?type=post" className="font-semibold text-[#1d9bf0] hover:text-[#8ecdf8]">
                              {t("autoPost.runs.openQueue")}
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                </Card>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function AutoPostSetupGuide({
  hasAccount,
  hasActiveContent,
  plannerEnabled,
  autopilotEnabled,
  onOpenPanel,
}: {
  hasAccount: boolean;
  hasActiveContent: boolean;
  plannerEnabled: boolean;
  autopilotEnabled: boolean;
  onOpenPanel: (panel: WorkbenchPanel) => void;
}) {
  const { t } = useT();
  const checks = [
    {
      done: hasAccount,
      title: t("autoPost.setup.account.title"),
      description: t("autoPost.setup.account.description"),
      action: null,
    },
    {
      done: hasActiveContent,
      title: t("autoPost.setup.content.title"),
      description: t("autoPost.setup.content.description"),
      action: { label: t("autoPost.setup.actions.addContent"), panel: "content" as WorkbenchPanel },
    },
    {
      done: plannerEnabled,
      title: t("autoPost.setup.planner.title"),
      description: t("autoPost.setup.planner.description"),
      action: { label: t("autoPost.setup.actions.openPlanner"), panel: "planner" as WorkbenchPanel },
    },
    {
      done: autopilotEnabled,
      title: t("autoPost.setup.autopilot.title"),
      description: t("autoPost.setup.autopilot.description"),
      action: { label: t("autoPost.setup.actions.setAutopilot"), panel: "planner" as WorkbenchPanel },
    },
  ];
  const missing = checks.filter((item) => !item.done);
  const primaryAction = missing.find((item) => item.action)?.action;

  return (
    <Card className={missing.length === 0 ? "border-[#00ba7c]/25 bg-[#00ba7c]/10" : "border-amber-300/20 bg-amber-500/10"}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#e7e9ea]">
            {missing.length === 0 ? t("autoPost.setup.readyTitle") : t("autoPost.setup.title")}
          </p>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#71767b]">
            {missing.length === 0 ? t("autoPost.setup.readyDescription") : t("autoPost.setup.description")}
          </p>
        </div>
        {primaryAction ? (
          <Button type="button" size="sm" onClick={() => onOpenPanel(primaryAction.panel)}>
            {primaryAction.label}
          </Button>
        ) : null}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {checks.map((item) => (
          <div key={item.title} className="rounded-xl border border-[#2f3336] bg-black p-3">
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border ${item.done ? "border-[#00ba7c]/30 bg-[#00ba7c]/10 text-[#7ee0b5]" : "border-amber-300/25 bg-amber-500/10 text-amber-100"}`}>
                {item.done ? <CheckCircle2 className="size-4" /> : <span className="size-2 rounded-full bg-current" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#e7e9ea]">{item.title}</span>
                <span className="mt-1 block text-xs leading-5 text-[#71767b]">{item.description}</span>
                {!item.done && item.action ? (
                  <button type="button" className="mt-2 text-xs font-semibold text-[#1d9bf0] hover:text-[#8ecdf8]" onClick={() => onOpenPanel(item.action.panel)}>
                    {item.action.label}
                  </button>
                ) : null}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function AutoPostPipelineSummary({
  activeContentCount,
  selectedContentItem,
  selectedPlan,
  queuedDraftCount,
  publishReadyCount,
  latestRun,
  onOpenPanel,
}: {
  activeContentCount: number;
  selectedContentItem: ContentLibraryItemApi | null;
  selectedPlan: AutoPostPlanApi | null;
  queuedDraftCount: number;
  publishReadyCount: number;
  latestRun?: AutoPostGenerationRunApi;
  onOpenPanel: (panel: WorkbenchPanel) => void;
}) {
  const { t } = useT();
  const steps = [
    {
      id: "material" as const,
      icon: Database,
      title: t("autoPost.pipeline.material"),
      value: selectedContentItem ? selectedContentItem.title : t("autoPost.pipeline.materialValue", { count: activeContentCount }),
      description: t("autoPost.pipeline.materialDesc"),
      panel: "content" as WorkbenchPanel,
      tone: "border-[#1d9bf0]/35 bg-[#1d9bf0]/10 text-[#8ecdf8]",
    },
    {
      id: "generate" as const,
      icon: Wand2,
      title: t("autoPost.pipeline.generate"),
      value: latestRun ? t(`autoPost.runs.status.${latestRun.status}`) : t("autoPost.pipeline.generateValue"),
      description: t("autoPost.pipeline.generateDesc"),
      panel: "generate" as WorkbenchPanel,
      tone: "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]",
    },
    {
      id: "queue" as const,
      icon: ListChecks,
      title: t("autoPost.pipeline.queue"),
      value: t("autoPost.pipeline.queueValue", { count: queuedDraftCount }),
      description: t("autoPost.pipeline.queueDesc"),
      panel: "history" as WorkbenchPanel,
      tone: "border-[#7856ff]/30 bg-[#7856ff]/12 text-[#b8a7ff]",
    },
    {
      id: "publish" as const,
      icon: Send,
      title: t("autoPost.pipeline.publish"),
      value: selectedPlan ? t("autoPost.pipeline.publishValue", { count: publishReadyCount }) : t("autoPost.status.notConfigured"),
      description: t("autoPost.pipeline.publishDesc"),
      panel: "planner" as WorkbenchPanel,
      tone: "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]",
    },
  ];

  return (
    <Card className="bg-[#0f1419]">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("autoPost.pipeline.title")}</p>
          <p className="mt-1 text-sm leading-6 text-[#71767b]">{t("autoPost.pipeline.description")}</p>
        </div>
        <Link href="/execution-queue?type=post" className="text-sm font-semibold text-[#1d9bf0] hover:text-[#8ecdf8]">
          {t("autoPost.actions.openQueue")}
        </Link>
      </div>
      <div className="grid gap-3 lg:grid-cols-4">
        {steps.map((step, index) => (
          <button
            key={step.id}
            type="button"
            onClick={() => onOpenPanel(step.panel)}
            className="group relative min-w-0 rounded-2xl border border-[#2f3336] bg-black p-4 text-left transition hover:border-[#1d9bf0]/45 hover:bg-[#080808]"
          >
            <div className="flex min-w-0 items-start gap-3">
              <span className={`inline-flex size-10 shrink-0 items-center justify-center rounded-2xl border ${step.tone}`}>
                <step.icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#e7e9ea]">{step.title}</span>
                <span className="mt-1 block truncate text-sm text-[#8ecdf8]">{step.value}</span>
                <span className="mt-2 block line-clamp-2 text-xs leading-5 text-[#71767b]">{step.description}</span>
              </span>
            </div>
            {index < steps.length - 1 ? (
              <ArrowRight className="absolute -right-2 top-1/2 hidden size-4 -translate-y-1/2 text-[#2f3336] lg:block" />
            ) : null}
          </button>
        ))}
      </div>
    </Card>
  );
}

function WorkbenchSignal({
  icon: Icon,
  label,
  title,
  description,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  title: string;
  description: string;
  tone: "blue" | "green" | "violet";
}) {
  const toneClass =
    tone === "green"
      ? "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]"
      : tone === "violet"
        ? "border-[#7856ff]/30 bg-[#7856ff]/12 text-[#b8a7ff]"
        : "border-[#1d9bf0]/35 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  return (
    <div className="min-w-0 rounded-2xl border border-[#2f3336] bg-black p-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className={`inline-flex size-9 shrink-0 items-center justify-center rounded-2xl border ${toneClass}`}>
          <Icon className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-[#71767b]">{label}</span>
          <span className="mt-1 block truncate text-sm font-semibold text-[#e7e9ea]">{title}</span>
          <span className="mt-1 block line-clamp-2 text-xs leading-5 text-[#71767b]">{description}</span>
        </span>
      </div>
    </div>
  );
}

function LibraryMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black px-4 py-3">
      <p className="text-xs text-[#71767b]">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold text-[#e7e9ea]">{value}</p>
    </div>
  );
}

function DraftRouteStep({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-[#2f3336] bg-[#0f1419] px-3 py-2">
      <p className="text-[11px] text-[#71767b]">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-[#e7e9ea]">{value}</p>
    </div>
  );
}

function formFromPlan(plan: AutoPostPlanApi): PlannerForm {
  return {
    enabled: plan.enabled,
    executionMode: plan.execution_mode,
    dailyLimit: plan.daily_limit,
    minIntervalMinutes: plan.min_interval_minutes,
    postingWindows: plan.posting_windows || "",
    timezone: plan.timezone || "UTC",
  };
}

function splitTopics(value: string) {
  return value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function TextInput({
  label,
  value,
  onChange,
  helper,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper: string;
  type?: "text" | "number";
}) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-medium text-[#71767b]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-2xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none focus:border-[#1d9bf0]"
      />
      <span className="text-xs leading-5 text-[#71767b]">{helper}</span>
    </label>
  );
}

function WorkbenchTabs({ activePanel, onChange }: { activePanel: WorkbenchPanel; onChange: (panel: WorkbenchPanel) => void }) {
  const { t } = useT();
  return (
    <div className="grid gap-2 md:grid-cols-4">
      {workbenchPanels.map((panel) => {
        const active = activePanel === panel.id;
        return (
          <button
            key={panel.id}
            type="button"
            onClick={() => onChange(panel.id)}
            className={`min-w-0 rounded-2xl border p-4 text-left transition ${
              active
                ? "border-[#1d9bf0]/55 bg-[#1d9bf0]/12 text-[#e7e9ea]"
                : "border-[#2f3336] bg-[#0f1419] text-[#71767b] hover:bg-[#16181c] hover:text-[#e7e9ea]"
            }`}
          >
            <span className="block truncate text-sm font-semibold">{t(panel.labelKey)}</span>
            <span className="mt-1 line-clamp-2 text-xs leading-5 text-[#71767b]">{t(panel.descriptionKey)}</span>
          </button>
        );
      })}
    </div>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#2f3336] bg-black px-3 py-2">
      <span className="min-w-0 text-[#71767b]">{label}</span>
      <span className="min-w-0 max-w-[62%] break-words text-right font-medium text-[#e7e9ea] [overflow-wrap:anywhere]">{value}</span>
    </div>
  );
}
