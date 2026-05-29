"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
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
import { AutomationModulePausedNotice } from "@/components/automation/automation-module-paused-notice";
import { QuotaUpgradeCallout } from "@/components/automation/quota-upgrade-callout";
import { useConfirm } from "@/components/providers/confirm-provider";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { apiErrorCode, apiErrorMessage } from "@/lib/request";
import { formatDateTime, usePreferredTimeZone } from "@/lib/timezone";
import { accountService, type AccountListItem, type XSubscriptionTier } from "@/services/account.service";
import {
  autoPostService,
  type AutoPostDraftApi,
  type AutoPostExecutionMode,
  type AutoPostGenerationRunApi,
  type AutoPostLengthMode,
  type AutoPostPlanApi,
  type TrendFeedbackApi,
  type TrendFeedbackListData,
  type TrendFeedbackRating,
  type TrendTopicApi,
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
type RunStatusFilter = "all" | AutoPostGenerationRunApi["status"];
type RunAccountScope = "selected" | "all";
type RunRangeFilter = "all" | "24h" | "7d" | "30d";

type PlannerForm = {
  enabled: boolean;
  executionMode: AutoPostExecutionMode;
  minIntervalMinutes: number;
  postingWindows: string;
  timezone: string;
  contentLengthMode: AutoPostLengthMode;
  excludedTrendNames: string[];
};

const timezones = ["UTC", "Asia/Shanghai", "America/New_York", "Europe/London"];
const executionModes: AutoPostExecutionMode[] = ["manual", "review", "autopilot"];
const xSubscriptionTiers: XSubscriptionTier[] = ["unknown", "free", "premium", "premium_plus"];
const autoPostLengthModes: AutoPostLengthMode[] = ["standard", "long"];
const contentItemTypes: ContentLibraryItemType[] = [
  "idea",
  "feature_highlight",
  "pain_point",
  "product_update",
  "faq",
  "case_study",
  "comparison",
  "tutorial",
  "data_insight",
  "announcement",
  "campaign",
  "link",
  "thread_seed",
];
const workbenchPanels: Array<{ id: WorkbenchPanel; labelKey: string; descriptionKey: string }> = [
  { id: "generate", labelKey: "autoPost.tabs.generate", descriptionKey: "autoPost.tabs.generateDesc" },
  { id: "planner", labelKey: "autoPost.tabs.planner", descriptionKey: "autoPost.tabs.plannerDesc" },
  { id: "content", labelKey: "autoPost.tabs.content", descriptionKey: "autoPost.tabs.contentDesc" },
  { id: "history", labelKey: "autoPost.tabs.history", descriptionKey: "autoPost.tabs.historyDesc" },
];
const runStatusFilters: RunStatusFilter[] = ["all", "completed", "skipped", "failed"];
const runAccountScopes: RunAccountScope[] = ["selected", "all"];
const runRangeFilters: RunRangeFilter[] = ["all", "24h", "7d", "30d"];
const postingWindowHours = Array.from({ length: 24 }, (_, hour) => hour);
const postingWindowPresets = [
  { key: "business", hours: [9, 10, 11, 12, 13, 14, 15, 16, 17] },
  { key: "morning", hours: [8, 9, 10, 11] },
  { key: "afternoon", hours: [13, 14, 15, 16, 17] },
  { key: "evening", hours: [18, 19, 20, 21] },
  { key: "allDay", hours: postingWindowHours },
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

function defaultForm(): PlannerForm {
  return {
    enabled: false,
    executionMode: "review",
    minIntervalMinutes: 120,
    postingWindows: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    contentLengthMode: "standard",
    excludedTrendNames: [],
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

function readWorkbenchPanel(value: string | null): WorkbenchPanel {
  return value === "planner" || value === "content" || value === "history" || value === "generate" ? value : "generate";
}

function readRunStatus(value: string | null): RunStatusFilter {
  return value === "completed" || value === "skipped" || value === "failed" ? value : "all";
}

function readRunAccountScope(value: string | null): RunAccountScope {
  return value === "all" ? "all" : "selected";
}

function readRunRange(value: string | null): RunRangeFilter {
  return value === "24h" || value === "7d" || value === "30d" ? value : "all";
}

function hourLabel(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function parseClockMinutes(value: string) {
  const parts = value.trim().split(":");
  if (parts.length !== 2) return null;
  const hour = Number.parseInt(parts[0], 10);
  const minute = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function parsePostingWindowHours(value: string) {
  const selected = new Set<number>();
  value
    .replaceAll("，", ",")
    .replaceAll(";", ",")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const [startRaw, endRaw] = part.split("-").map((item) => item.trim());
      const start = parseClockMinutes(startRaw || "");
      const end = parseClockMinutes(endRaw || "");
      if (start === null || end === null) return;
      const addRange = (from: number, to: number) => {
        for (let hour = Math.floor(from / 60); hour <= Math.floor(to / 60); hour += 1) {
          if (hour >= 0 && hour <= 23) selected.add(hour);
        }
      };
      if (start <= end) {
        addRange(start, end);
      } else {
        addRange(start, 23 * 60 + 59);
        addRange(0, end);
      }
    });
  return selected;
}

function formatPostingWindowHours(hours: Set<number>) {
  const sorted = Array.from(hours)
    .filter((hour) => hour >= 0 && hour <= 23)
    .sort((a, b) => a - b);
  if (sorted.length === 0) return "";
  const ranges: Array<{ start: number; end: number }> = [];
  sorted.forEach((hour) => {
    const last = ranges[ranges.length - 1];
    if (last && hour === last.end + 1) {
      last.end = hour;
      return;
    }
    ranges.push({ start: hour, end: hour });
  });
  return ranges
    .map((range) => `${hourLabel(range.start)}-${String(range.end).padStart(2, "0")}:59`)
    .join(", ");
}

function readRunPage(value: string | null) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

function readAccountID(value: string | null) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export default function AutoPostPage() {
  const { t } = useT();
  const timeZone = usePreferredTimeZone();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { pushToast } = useToast();
  const { confirm } = useConfirm();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [bots, setBots] = useState<OAFBot[]>([]);
  const [plans, setPlans] = useState<AutoPostPlanApi[]>([]);
  const [drafts, setDrafts] = useState<AutoPostDraftApi[]>([]);
  const [runs, setRuns] = useState<AutoPostGenerationRunApi[]>([]);
  const [contentItems, setContentItems] = useState<ContentLibraryItemApi[]>([]);
  const [subscription, setSubscription] = useState<BillingSubscriptionApi | null>(null);
  const [selectedAccountID, setSelectedAccountID] = useState(() => readAccountID(searchParams.get("account")));
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
  const [savingAccountTier, setSavingAccountTier] = useState(false);
  const [syncingAccountTier, setSyncingAccountTier] = useState(false);
  const [selectedTrends, setSelectedTrends] = useState<TrendTopicApi[]>([]);
  const [loadingSelectedTrends, setLoadingSelectedTrends] = useState(false);
  const [trendFeedbackData, setTrendFeedbackData] = useState<TrendFeedbackListData | null>(null);
  const [trendFeedbackLoading, setTrendFeedbackLoading] = useState(false);
  const [clearingTrendFeedbackID, setClearingTrendFeedbackID] = useState(0);
  const [activePanel, setActivePanel] = useState<WorkbenchPanel>(() => readWorkbenchPanel(searchParams.get("panel")));
  const [runStatusFilter, setRunStatusFilter] = useState<RunStatusFilter>(() => readRunStatus(searchParams.get("run_status")));
  const [runAccountScope, setRunAccountScope] = useState<RunAccountScope>(() => readRunAccountScope(searchParams.get("account_scope")));
  const [runRangeFilter, setRunRangeFilter] = useState<RunRangeFilter>(() => readRunRange(searchParams.get("run_range")));
  const [runPage, setRunPage] = useState(() => readRunPage(searchParams.get("run_page")));
  const [runsLoading, setRunsLoading] = useState(false);
  const [runPagination, setRunPagination] = useState({ page: 1, pageSize: 12, total: 0 });
  const [latestRun, setLatestRun] = useState<AutoPostGenerationRunApi | null>(null);
  const [moduleEnabled, setModuleEnabled] = useState<boolean | null>(null);
  const [quotaUpgradeVisible, setQuotaUpgradeVisible] = useState(false);
  const workbenchPanelRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const [accountData, botData, planData, draftData, libraryData, subscriptionData] = await Promise.all([
        accountService.list(),
        oafBotService.list(),
        autoPostService.plans(),
        autoPostService.drafts(),
        contentLibraryService.list({ limit: 100 }),
        billingService.subscription(),
      ]);
      const connected = accountData.items.filter((account) => account.status !== "disconnected");
      setAccounts(connected);
      setBots(botData.items);
      setPlans(planData.items);
      setDrafts(draftData.items);
      setContentItems(libraryData.items);
      setSubscription(subscriptionData);
      setQuotaUpgradeVisible(false);
      const firstAccountID = selectedAccountID || readAccountID(searchParams.get("account")) || connected[0]?.id || 0;
      setSelectedAccountID(firstAccountID);
      const currentPlan = planData.items.find((item) => item.x_account_id === firstAccountID);
      setForm(currentPlan ? formFromPlan(currentPlan) : defaultForm());
      setLoadState("ready");
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoPost.errors.load") : t("autoPost.errors.load"));
      setLoadState("error");
    }
  }, [pushToast, searchParams, selectedAccountID, t]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedBot = useMemo(() => bots.find((bot) => bot.twitter_account_id === selectedAccountID) || null, [bots, selectedAccountID]);
  const selectedAccount = useMemo(() => accounts.find((account) => account.id === selectedAccountID) || null, [accounts, selectedAccountID]);
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
  const accountRuns = runs;
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
  const runTotalPages = Math.max(1, Math.ceil(runPagination.total / runPagination.pageSize));
  const canAutopilotPublish = (selectedPlan?.execution_mode || form.executionMode) === "autopilot";
  const selectedAccountTier = selectedAccount?.x_subscription_tier || "unknown";
  const selectedAccountIsPremium = selectedAccountTier === "premium" || selectedAccountTier === "premium_plus";
  const selectedPostingWindowHours = useMemo(() => parsePostingWindowHours(form.postingWindows), [form.postingWindows]);
  const modulePaused = moduleEnabled === false;
  const modulePausedActionTip = modulePaused
    ? t("automation.pausedNotice.actionDisabled", { module: t("automation.module.post.name") })
    : undefined;

  useEffect(() => {
    setActivePanel(readWorkbenchPanel(searchParams.get("panel")));
    setRunStatusFilter(readRunStatus(searchParams.get("run_status")));
    setRunAccountScope(readRunAccountScope(searchParams.get("account_scope")));
    setRunRangeFilter(readRunRange(searchParams.get("run_range")));
    setRunPage(readRunPage(searchParams.get("run_page")));
    const accountID = readAccountID(searchParams.get("account"));
    if (accountID) {
      setSelectedAccountID((current) => (current === accountID ? current : accountID));
    }
  }, [searchParams]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (selectedAccountID > 0) next.set("account", String(selectedAccountID));
    if (activePanel !== "generate") next.set("panel", activePanel);
    if (runStatusFilter !== "all") next.set("run_status", runStatusFilter);
    if (runAccountScope !== "selected") next.set("account_scope", runAccountScope);
    if (runRangeFilter !== "all") next.set("run_range", runRangeFilter);
    if (runPage > 1) next.set("run_page", String(runPage));
    const nextQuery = next.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery !== currentQuery) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }
  }, [activePanel, pathname, router, runAccountScope, runPage, runRangeFilter, runStatusFilter, searchParams, selectedAccountID]);

  const fetchRuns = useCallback(async () => {
    if (runAccountScope === "selected" && !selectedAccountID) {
      setRuns([]);
      setRunPagination({ page: 1, pageSize: 12, total: 0 });
      return;
    }
    setRunsLoading(true);
    try {
      const data = await autoPostService.runs({
        status: runStatusFilter,
        xAccountID: runAccountScope === "selected" ? selectedAccountID : undefined,
        range: runRangeFilter,
        page: runPage,
        pageSize: 12,
      });
      setRuns(data.items);
      setRunPagination({
        page: data.pagination?.page || runPage,
        pageSize: data.pagination?.page_size || 12,
        total: data.pagination?.total || data.items.length,
      });
    } catch (error) {
      setRuns([]);
      setRunPagination({ page: 1, pageSize: 12, total: 0 });
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoPost.runs.loadFailed") : t("autoPost.runs.loadFailed"));
    } finally {
      setRunsLoading(false);
    }
  }, [pushToast, runAccountScope, runPage, runRangeFilter, runStatusFilter, selectedAccountID, t]);

  useEffect(() => {
    void fetchRuns();
  }, [fetchRuns]);

  const fetchLatestRun = useCallback(async () => {
    if (!selectedAccountID) {
      setLatestRun(null);
      return;
    }
    try {
      const data = await autoPostService.runs({ xAccountID: selectedAccountID, page: 1, pageSize: 1 });
      setLatestRun(data.items[0] ?? null);
    } catch {
      setLatestRun(null);
    }
  }, [selectedAccountID]);

  useEffect(() => {
    void fetchLatestRun();
  }, [fetchLatestRun]);

  const openPanel = useCallback((panel: WorkbenchPanel) => {
    setActivePanel(panel);
    window.setTimeout(() => {
      workbenchPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }, []);

  const updatePostingWindowHours = useCallback((hours: Set<number>) => {
    setForm((current) => ({ ...current, postingWindows: formatPostingWindowHours(hours) }));
  }, []);

  const togglePostingWindowHour = useCallback((hour: number) => {
    const next = new Set(selectedPostingWindowHours);
    if (next.has(hour)) {
      next.delete(hour);
    } else {
      next.add(hour);
    }
    updatePostingWindowHours(next);
  }, [selectedPostingWindowHours, updatePostingWindowHours]);

  const applyPostingWindowPreset = useCallback((hours: number[]) => {
    updatePostingWindowHours(new Set(hours));
  }, [updatePostingWindowHours]);

  const excludeTrend = useCallback((trend: TrendTopicApi) => {
    const name = trend.trend_name.trim();
    if (!name) return;
    setForm((current) => {
      const next = new Set(current.excludedTrendNames);
      next.add(name);
      return { ...current, excludedTrendNames: Array.from(next) };
    });
    setSelectedTrends((current) => current.filter((item) => item.normalized_name !== trend.normalized_name));
  }, []);

  const restoreExcludedTrend = useCallback((name: string) => {
    setForm((current) => ({ ...current, excludedTrendNames: current.excludedTrendNames.filter((item) => item !== name) }));
  }, []);

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
    setRunPage(1);
    const plan = plans.find((item) => item.x_account_id === accountID);
    setForm(plan ? formFromPlan(plan) : defaultForm());
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
        min_interval_minutes: Number(form.minIntervalMinutes) || 1,
        posting_windows: form.postingWindows.trim(),
        timezone: form.timezone.trim() || "UTC",
        content_length_mode: selectedAccountIsPremium ? form.contentLengthMode : "standard",
        excluded_trend_names: form.excludedTrendNames,
      };
      const saved = selectedPlan ? await autoPostService.updatePlan(selectedPlan.id, payload) : await autoPostService.createPlan(payload);
      setPlans((current) => {
        const without = current.filter((item) => item.id !== saved.id && item.x_account_id !== saved.x_account_id);
        return [saved, ...without];
      });
      setForm(formFromPlan(saved));
      setQuotaUpgradeVisible(false);
      pushToast(t("autoPost.toast.saved"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoPost.errors.save") : t("autoPost.errors.save"));
    } finally {
      setSaving(false);
    }
  };

  const refreshSelectedTrends = useCallback(async () => {
    const planID = selectedPlan?.id || 0;
    const botID = selectedPlan?.bot_id || selectedBot?.id || 0;
    if (!planID && !botID) {
      setSelectedTrends([]);
      return;
    }
    setLoadingSelectedTrends(true);
    try {
      const data = await autoPostService.selectedTrends({ planID, botID, limit: 3, excludedTrendNames: form.excludedTrendNames });
      setSelectedTrends(data.items);
    } catch {
      setSelectedTrends([]);
    } finally {
      setLoadingSelectedTrends(false);
    }
  }, [form.excludedTrendNames, selectedBot?.id, selectedPlan?.bot_id, selectedPlan?.id]);

  useEffect(() => {
    void refreshSelectedTrends();
  }, [refreshSelectedTrends]);

  const refreshTrendFeedback = useCallback(async () => {
    const botID = selectedPlan?.bot_id || selectedBot?.id || 0;
    if (!botID) {
      setTrendFeedbackData(null);
      return;
    }
    setTrendFeedbackLoading(true);
    try {
      const data = await autoPostService.trendFeedback({ botID, onlyNegative: true, limit: 20 });
      setTrendFeedbackData(data);
    } catch {
      setTrendFeedbackData(null);
    } finally {
      setTrendFeedbackLoading(false);
    }
  }, [selectedBot?.id, selectedPlan?.bot_id]);

  useEffect(() => {
    void refreshTrendFeedback();
  }, [refreshTrendFeedback]);

  const clearTrendFeedback = useCallback(
    async (item: TrendFeedbackApi) => {
      setClearingTrendFeedbackID(item.id);
      try {
        await autoPostService.deleteTrendFeedback(item.id);
        pushToast(t("autoPost.trends.feedbackCleared"));
        await Promise.all([refreshTrendFeedback(), refreshSelectedTrends()]);
      } catch (error) {
        pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoPost.trends.feedbackClearFailed") : t("autoPost.trends.feedbackClearFailed"));
      } finally {
        setClearingTrendFeedbackID(0);
      }
    },
    [pushToast, refreshSelectedTrends, refreshTrendFeedback, t],
  );

  const updateAccountTier = async (tier: XSubscriptionTier) => {
    if (!selectedAccountID) return;
    setSavingAccountTier(true);
    try {
      const saved = await accountService.updateSettings(selectedAccountID, { x_subscription_tier: tier });
      setAccounts((current) =>
        current.map((account) =>
          account.id === selectedAccountID
            ? { ...account, x_subscription_tier: saved.x_subscription_tier, x_subscription_source: saved.x_subscription_source }
            : account
        )
      );
      if (tier !== "premium" && tier !== "premium_plus") {
        setForm((current) => ({ ...current, contentLengthMode: "standard" }));
      }
      pushToast(t("autoPost.account.tierSaved"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoPost.account.tierSaveFailed") : t("autoPost.account.tierSaveFailed"));
    } finally {
      setSavingAccountTier(false);
    }
  };

  const syncAccountTier = async () => {
    if (!selectedAccountID) return;
    setSyncingAccountTier(true);
    try {
      const saved = await accountService.syncXSubscription(selectedAccountID);
      setAccounts((current) =>
        current.map((account) =>
          account.id === selectedAccountID
            ? { ...account, x_subscription_tier: saved.x_subscription_tier, x_subscription_source: saved.x_subscription_source }
            : account
        )
      );
      setForm((current) => ({
        ...current,
        contentLengthMode: saved.x_subscription_tier === "premium" || saved.x_subscription_tier === "premium_plus" ? current.contentLengthMode : "standard",
      }));
      pushToast(t("autoPost.account.tierSynced"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoPost.account.tierSyncFailed") : t("autoPost.account.tierSyncFailed"));
    } finally {
      setSyncingAccountTier(false);
    }
  };

  const resetLibraryForm = () => {
    setEditingLibraryID(null);
    setLibraryForm(defaultLibraryForm());
    setLibraryOpen(false);
  };

  const startCreateLibraryItem = () => {
    setEditingLibraryID(null);
    setLibraryForm(defaultLibraryForm());
    setLibraryOpen(true);
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
    const confirmed = await confirm({
      description: t("autoPost.contentLibrary.confirmDelete"),
      confirmLabel: t("autoComment.review.delete"),
      tone: "destructive",
    });
    if (!confirmed) return;
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
          min_interval_minutes: Number(form.minIntervalMinutes) || 1,
          posting_windows: form.postingWindows.trim(),
          timezone: form.timezone.trim() || "UTC",
          content_length_mode: selectedAccountIsPremium ? form.contentLengthMode : "standard",
          excluded_trend_names: form.excludedTrendNames,
        });
        plan = saved;
        setPlans((current) => [saved, ...current.filter((item) => item.x_account_id !== saved.x_account_id)]);
      }
      const draft = await autoPostService.generateDraft(plan.id, contentDirection.trim(), selectedContentItem?.id, form.excludedTrendNames);
      setDrafts((current) => [draft, ...current.filter((item) => item.id !== draft.id)]);
      setContentDirection("");
      setQuotaUpgradeVisible(false);
      pushToast(t("autoPost.toast.generated"));
      setActivePanel("history");
      void load();
    } catch (error) {
      const code = axios.isAxiosError(error) ? error.response?.data?.error_code : "";
      if (code === "ai_generation_quota_exceeded") {
        setQuotaUpgradeVisible(true);
        pushToast(t("autoPost.errors.aiQuotaExceeded"));
      } else if (code === "auto_post_monthly_limit_exceeded" || code === "auto_post_daily_limit_exceeded") {
        setQuotaUpgradeVisible(true);
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
    const confirmed = await confirm({
      description: t("autoPost.runNow.confirm"),
      confirmLabel: t("autoPost.runNow.button"),
    });
    if (!confirmed) return;
    setRunningPlanner(true);
    try {
      const run = await autoPostService.runNow(selectedPlan.id);
      if (run.status === "completed") {
        pushToast(t("autoPost.runNow.toast.completed"));
      } else if (run.status === "skipped") {
        pushToast(t("autoPost.runNow.toast.skipped", { reason: skipReasonLabel(run.skip_reason) }));
      } else {
        pushToast(t("autoPost.runNow.toast.failed"));
      }
      setActivePanel("history");
      setRunPage(1);
      void fetchRuns();
      void fetchLatestRun();
      void load();
    } catch (error) {
      pushToast(apiErrorCode(error) === "automation_module_paused" ? t("automation.pausedNotice.toast") : apiErrorMessage(error) || t("autoPost.runNow.errors.failed"));
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

      <AutomationModulePausedNotice type="post" onEnabledChange={setModuleEnabled} />

      {quotaUpgradeVisible ? <QuotaUpgradeCallout /> : null}

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
              {selectedAccount ? (
                <div className="mt-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-[#71767b]">{t("autoPost.account.tierLabel")}</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => void syncAccountTier()} disabled={syncingAccountTier}>
                      {syncingAccountTier ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                      {t("autoPost.account.syncTier")}
                    </Button>
                  </div>
                  <select
                    value={selectedAccountTier}
                    onChange={(event) => void updateAccountTier(event.target.value as XSubscriptionTier)}
                    disabled={savingAccountTier}
                    className="h-11 w-full rounded-2xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none focus:border-[#1d9bf0] disabled:opacity-60"
                  >
                    {xSubscriptionTiers.map((tier) => (
                      <option key={tier} value={tier}>
                        {t(`autoPost.xTier.${tier}`)}
                      </option>
                    ))}
                  </select>
                  <span className="block text-xs leading-5 text-[#71767b]">
                    {t("autoPost.account.tierHelper")} {t(`autoPost.account.tierSource.${selectedAccount.x_subscription_source || "manual"}`)}
                  </span>
                </div>
              ) : null}
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
                  <Button
                    size="sm"
                    type="button"
                    onClick={() => void runPlannerNow()}
                    disabled={runningPlanner || !selectedAccountID || modulePaused}
                    title={modulePausedActionTip}
                  >
                    {runningPlanner ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
                    {t("autoPost.runNow.button")}
                  </Button>
                }
              />
              <div className="space-y-3 text-sm">
                {modulePaused ? (
                  <p className="rounded-xl border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100/80">
                    {modulePausedActionTip}
                  </p>
                ) : null}
                <StatusRow label={t("autoPost.status.plan")} value={selectedPlan ? t("autoPost.status.configured") : t("autoPost.status.notConfigured")} />
                <StatusRow label={t("autoPost.status.enabled")} value={selectedPlan?.enabled ? t("autoPost.status.enabledValue") : t("autoPost.status.pausedValue")} />
                <StatusRow label={t("autoPost.status.mode")} value={t(`autoPost.executionMode.${selectedPlan?.execution_mode || form.executionMode}`)} />
                <StatusRow label={t("autoPost.status.lastRun")} value={selectedPlan?.last_run_at ? formatDateTime(selectedPlan.last_run_at, timeZone) : t("autoPost.common.emptyValue")} />
                <StatusRow label={t("autoPost.status.nextRun")} value={selectedPlan?.next_run_at ? formatDateTime(selectedPlan.next_run_at, timeZone) : t("autoPost.common.emptyValue")} />
                <StatusRow label={t("autoPost.status.activeContent")} value={t("autoPost.status.activeContentValue", { count: activeContentCount })} />
                <StatusRow
                  label={t("autoPost.status.lastRunResult")}
                  value={latestRun ? t(`autoPost.runs.status.${latestRun.status}`) : t("autoPost.common.emptyValue")}
                />
                <StatusRow label={t("autoPost.status.minInterval")} value={t("autoPost.status.minIntervalValue", { minutes: selectedPlan?.min_interval_minutes || form.minIntervalMinutes })} />
                <StatusRow label={t("autoPost.status.timezone")} value={selectedPlan?.timezone || form.timezone || "UTC"} />
                <StatusRow label={t("autoPost.status.lengthMode")} value={t(`autoPost.lengthMode.${selectedPlan?.content_length_mode || form.contentLengthMode}`)} />
              </div>
            </Card>
          </div>

          <AutoPostSetupGuide
            hasAccount={Boolean(selectedAccountID)}
            hasActiveContent={activeContentCount > 0}
            plannerEnabled={Boolean(selectedPlan?.enabled || form.enabled)}
            autopilotEnabled={canAutopilotPublish}
            onOpenPanel={openPanel}
          />

          <AutoPostPipelineSummary
            activeContentCount={activeContentCount}
            selectedContentItem={selectedContentItem}
            selectedPlan={selectedPlan}
            queuedDraftCount={queuedDraftCount}
            publishReadyCount={publishReadyCount}
            latestRun={latestRun}
            onOpenPanel={openPanel}
          />

          <WorkbenchTabs activePanel={activePanel} onChange={openPanel} />

          <div ref={workbenchPanelRef} className="scroll-mt-4 space-y-5">
            {activePanel === "planner" ? (
              <Card>
                <CardHeader title={t("autoPost.planner.title")} description={t("autoPost.planner.description")} />
                <div className="space-y-4">
                {form.enabled && activeContentCount === 0 ? (
                  <div className="flex flex-col gap-3 rounded-xl border border-amber-300/20 bg-amber-500/10 p-3 text-sm leading-6 text-amber-50/85 sm:flex-row sm:items-center sm:justify-between">
                    <span>{t("autoPost.scheduler.noActiveContentHint")}</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => openPanel("content")}>
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

                <div className="grid gap-4">
                  <TextInput
                    type="number"
                    label={t("autoPost.fields.minInterval")}
                    value={String(form.minIntervalMinutes)}
                    onChange={(value) => setForm((current) => ({ ...current, minIntervalMinutes: Number(value) }))}
                    helper={t("autoPost.fields.minIntervalHelper")}
                  />
                </div>

                <PostingWindowPicker
                  value={form.postingWindows}
                  selectedHours={selectedPostingWindowHours}
                  onToggleHour={togglePostingWindowHour}
                  onApplyPreset={applyPostingWindowPreset}
                  onClear={() => updatePostingWindowHours(new Set())}
                />

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

                <div className="grid gap-3">
                  <div>
                    <p className="text-xs font-medium text-[#71767b]">{t("autoPost.fields.lengthMode")}</p>
                    <p className="mt-1 text-xs leading-5 text-[#71767b]">
                      {selectedAccountIsPremium ? t("autoPost.fields.lengthModeHelperPremium") : t("autoPost.fields.lengthModeHelperStandard")}
                    </p>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {autoPostLengthModes.map((mode) => {
                      const disabled = mode === "long" && !selectedAccountIsPremium;
                      return (
                        <button
                          key={mode}
                          type="button"
                          disabled={disabled}
                          onClick={() => setForm((current) => ({ ...current, contentLengthMode: mode }))}
                          className={`rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${
                            form.contentLengthMode === mode
                              ? "border-[#1d9bf0]/55 bg-[#1d9bf0]/12 text-[#e7e9ea]"
                              : "border-[#2f3336] bg-black text-[#71767b] hover:bg-[#16181c] hover:text-[#e7e9ea]"
                          }`}
                        >
                          <span className="block text-sm font-semibold">{t(`autoPost.lengthMode.${mode}`)}</span>
                          <span className="mt-1 block text-xs leading-5 text-[#71767b]">{t(`autoPost.lengthMode.${mode}Helper`)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-4 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
                  <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[#e7e9ea]">{t("autoPost.trends.title")}</p>
                      <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("autoPost.trends.description")}</p>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => void refreshSelectedTrends()} disabled={loadingSelectedTrends}>
                      {loadingSelectedTrends ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                      {t("autoPost.trends.refresh")}
                    </Button>
                  </div>

                  <div className="rounded-xl border border-[#2f3336] bg-black p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-xs font-medium text-[#71767b]">{t("autoPost.trends.inheritedTitle")}</p>
                        <p className="mt-1 text-sm font-semibold text-[#e7e9ea]">
                          {selectedBot ? t("autoPost.trends.inheritedFromBot", { bot: selectedBot.name }) : t("autoPost.trends.noBotInherited")}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("autoPost.trends.inheritedDescription")}</p>
                      </div>
                      <Link href="/oaf-bots" className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-[#2f3336] px-3 text-xs font-semibold text-white hover:bg-[#16181c]">
                        {t("autoPost.trends.editBotPreferences")}
                      </Link>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <TrendPreferenceSummary
                        label={t("autoPost.trends.regions")}
                        value={formatTrendRegions(selectedBot?.trend_regions || [], t)}
                      />
                      <TrendPreferenceSummary
                        label={t("autoPost.trends.categories")}
                        value={formatTrendCategories(selectedBot?.trend_categories || [], t)}
                      />
                      <TrendPreferenceSummary
                        label={t("autoPost.trends.sensitivePolicy")}
                        value={selectedBot ? t(`autoPost.trends.policy.${selectedBot.sensitive_trend_policy || "avoid"}`) : t("autoPost.trends.policy.avoid")}
                      />
                    </div>
                    <div className="mt-3 rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2 text-xs leading-5 text-[#71767b]">
                      {selectedBot?.allow_general_trends ? t("autoPost.trends.generalAllowed") : t("autoPost.trends.generalLimited")}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#2f3336] bg-black p-3">
                    <p className="text-xs font-medium text-[#71767b]">{t("autoPost.trends.selectedTitle")}</p>
                    {loadingSelectedTrends ? (
                      <p className="mt-2 text-sm text-[#71767b]">{t("autoPost.trends.loading")}</p>
                    ) : selectedTrends.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedTrends.map((trend) => (
                          <span key={trend.id} className="inline-flex items-center gap-2 rounded-full border border-[#1d9bf0]/35 bg-[#1d9bf0]/10 px-3 py-1 text-xs text-[#d7ebff]">
                            {trend.trend_name}
                            <span className="ml-2 text-[#71767b]">{t(`autoPost.trends.category.${trend.category}`)}</span>
                            <button
                              type="button"
                              onClick={() => excludeTrend(trend)}
                              className="rounded-full border border-[#2f3336] px-2 py-0.5 text-[11px] font-semibold text-[#8ecdf8] hover:border-[#1d9bf0]/60 hover:text-white"
                            >
                              {t("autoPost.trends.exclude")}
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-[#71767b]">{t("autoPost.trends.selectedEmpty")}</p>
                    )}
                    {form.excludedTrendNames.length ? (
                      <div className="mt-3 border-t border-[#2f3336] pt-3">
                        <p className="text-xs font-medium text-[#71767b]">{t("autoPost.trends.excludedTitle")}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {form.excludedTrendNames.map((name) => (
                            <span key={name} className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-500/10 px-3 py-1 text-xs text-amber-100">
                              {name}
                              <button
                                type="button"
                                onClick={() => restoreExcludedTrend(name)}
                                className="rounded-full border border-amber-300/20 px-2 py-0.5 text-[11px] font-semibold text-amber-100 hover:bg-amber-300/10"
                              >
                                {t("autoPost.trends.restore")}
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <TrendFeedbackPanel
                    data={trendFeedbackData}
                    loading={trendFeedbackLoading}
                    clearingID={clearingTrendFeedbackID}
                    onRefresh={refreshTrendFeedback}
                    onClear={clearTrendFeedback}
                  />
                </div>

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
                    <Button size="sm" variant="outline" onClick={libraryOpen ? resetLibraryForm : startCreateLibraryItem}>
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
                    <Button type="button" className="mt-4" size="sm" onClick={startCreateLibraryItem}>
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
                            {item.last_used_at ? <span>{t("autoPost.contentLibrary.lastUsed", { time: formatDateTime(item.last_used_at, timeZone) })}</span> : null}
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
                          <span className="text-xs text-[#71767b]">{formatDateTime(draft.created_at, timeZone)}</span>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-7 text-[#e7e9ea]">{draft.generated_content}</p>
                        {draft.selected_trends?.length ? (
                          <TrendSourceChips
                            trends={draft.selected_trends}
                            label={t("autoPost.trends.usedInDraft")}
                            feedback={{ sourceType: "auto_post_draft", sourceID: draft.id, botID: draft.bot_id, xAccountID: draft.x_account_id }}
                          />
                        ) : null}
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
                <CardHeader
                  title={t("autoPost.runs.title")}
                  description={t("autoPost.runs.description")}
                  right={
                    <div className="grid gap-2 sm:flex">
                      <select
                        value={runAccountScope}
                        onChange={(event) => {
                          setRunAccountScope(event.target.value as RunAccountScope);
                          setRunPage(1);
                        }}
                        className="h-9 rounded-full border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none focus:border-[#1d9bf0]"
                        aria-label={t("autoPost.runs.scopeLabel")}
                      >
                        {runAccountScopes.map((scope) => (
                          <option key={scope} value={scope}>
                            {t(`autoPost.runs.scope.${scope}`)}
                          </option>
                        ))}
                      </select>
                      <select
                        value={runStatusFilter}
                        onChange={(event) => {
                          setRunStatusFilter(event.target.value as RunStatusFilter);
                          setRunPage(1);
                        }}
                        className="h-9 rounded-full border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none focus:border-[#1d9bf0]"
                      >
                        {runStatusFilters.map((status) => (
                          <option key={status} value={status}>
                            {t(`autoPost.runs.filter.${status}`)}
                          </option>
                        ))}
                      </select>
                      <select
                        value={runRangeFilter}
                        onChange={(event) => {
                          setRunRangeFilter(event.target.value as RunRangeFilter);
                          setRunPage(1);
                        }}
                        className="h-9 rounded-full border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none focus:border-[#1d9bf0]"
                        aria-label={t("autoPost.runs.rangeLabel")}
                      >
                        {runRangeFilters.map((range) => (
                          <option key={range} value={range}>
                            {t(`autoPost.runs.range.${range}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                  }
                />
                {runsLoading ? (
                  <div className="flex items-center justify-center gap-2 rounded-2xl border border-[#2f3336] bg-black px-4 py-8 text-center text-sm text-[#71767b]">
                    <Loader2 className="size-4 animate-spin" />
                    {t("autoPost.runs.loading")}
                  </div>
                ) : accountRuns.length === 0 ? (
                  <div className="rounded-2xl border border-[#2f3336] bg-black px-4 py-8 text-center text-sm text-[#71767b]">
                    {runStatusFilter === "all" ? t("autoPost.runs.empty") : t("autoPost.runs.emptyFiltered")}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {accountRuns.map((run) => (
                      <div key={run.id} className="rounded-2xl border border-[#2f3336] bg-black p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-xs ${runTone(run.status)}`}>
                            {t(`autoPost.runs.status.${run.status}`)}
                          </span>
                          {runAccountScope === "all" ? (
                            <span className="rounded-full border border-[#2f3336] bg-[#0f1419] px-2.5 py-1 text-xs text-[#71767b]">
                              {run.account_handle ? `@${run.account_handle}` : t("autoPost.runs.accountFallback", { id: run.x_account_id })}
                            </span>
                          ) : null}
                          {run.content_title ? (
                            <span className="rounded-full border border-[#2f3336] bg-[#0f1419] px-2.5 py-1 text-xs text-[#71767b]">
                              {run.content_title}
                            </span>
                          ) : null}
                          <span className="text-xs text-[#71767b]">{formatDateTime(run.created_at, timeZone)}</span>
                        </div>
                        {run.skip_reason ? (
                          <p className="mt-2 text-sm leading-6 text-[#71767b]">
                            {skipReasonLabel(run.skip_reason)}
                          </p>
                        ) : null}
                        {run.error_message ? <p className="mt-2 break-words text-xs text-rose-100">{run.error_message}</p> : null}
                        {run.selected_trends?.length ? (
                          <TrendSourceChips
                            trends={run.selected_trends}
                            label={t("autoPost.trends.usedInRun")}
                            feedback={{ sourceType: "auto_post_run", sourceID: run.id, botID: run.bot_id, xAccountID: run.x_account_id }}
                          />
                        ) : null}
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
                    {runTotalPages > 1 ? (
                      <div className="flex flex-col gap-2 rounded-2xl border border-[#2f3336] bg-black p-3 text-sm text-[#71767b] sm:flex-row sm:items-center sm:justify-between">
                        <span>
                          {t("autoPost.runs.pagination", {
                            page: runPagination.page,
                            total: runTotalPages,
                            count: runPagination.total,
                          })}
                        </span>
                        <div className="grid gap-2 sm:flex">
                          <Button type="button" size="sm" variant="outline" disabled={runPagination.page <= 1 || runsLoading} onClick={() => setRunPage((current) => Math.max(1, current - 1))}>
                            {t("common.previous")}
                          </Button>
                          <Button type="button" size="sm" variant="outline" disabled={runPagination.page >= runTotalPages || runsLoading} onClick={() => setRunPage((current) => current + 1)}>
                            {t("common.next")}
                          </Button>
                        </div>
                      </div>
                    ) : null}
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
  latestRun?: AutoPostGenerationRunApi | null;
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

function PostingWindowPicker({
  value,
  selectedHours,
  onToggleHour,
  onApplyPreset,
  onClear,
}: {
  value: string;
  selectedHours: Set<number>;
  onToggleHour: (hour: number) => void;
  onApplyPreset: (hours: number[]) => void;
  onClear: () => void;
}) {
  const { t } = useT();
  return (
    <div className="space-y-3 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Clock3 className="size-4 text-[#1d9bf0]" />
            <p className="text-sm font-semibold text-[#e7e9ea]">{t("autoPost.fields.postingWindows")}</p>
          </div>
          <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("autoPost.fields.postingWindowsHelper")}</p>
        </div>
        <button type="button" onClick={onClear} className="text-xs font-semibold text-[#1d9bf0] hover:underline">
          {t("autoPost.fields.postingWindowsClear")}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {postingWindowPresets.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => onApplyPreset(preset.hours)}
            className="rounded-full border border-[#2f3336] bg-black px-3 py-1.5 text-xs font-semibold text-[#e7e9ea] transition hover:border-[#1d9bf0]/55 hover:bg-[#1d9bf0]/10"
          >
            {t(`autoPost.postingWindowPreset.${preset.key}`)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 xl:grid-cols-8">
        {postingWindowHours.map((hour) => {
          const selected = selectedHours.has(hour);
          return (
            <button
              key={hour}
              type="button"
              onClick={() => onToggleHour(hour)}
              className={`h-10 rounded-xl border text-xs font-semibold transition ${
                selected
                  ? "border-[#1d9bf0]/70 bg-[#1d9bf0]/18 text-white"
                  : "border-[#2f3336] bg-black text-[#71767b] hover:bg-[#16181c] hover:text-[#e7e9ea]"
              }`}
              aria-pressed={selected}
            >
              {hourLabel(hour)}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-[#2f3336] bg-black px-3 py-2">
        <p className="text-[11px] uppercase tracking-wide text-[#71767b]">{t("autoPost.fields.postingWindowsSelected")}</p>
        <p className="mt-1 break-words text-sm text-[#e7e9ea]">{value || t("autoPost.fields.postingWindowsNoLimit")}</p>
      </div>
    </div>
  );
}

function formFromPlan(plan: AutoPostPlanApi): PlannerForm {
  return {
    enabled: plan.enabled,
    executionMode: plan.execution_mode,
    minIntervalMinutes: plan.min_interval_minutes,
    postingWindows: plan.posting_windows || "",
    timezone: plan.timezone || "UTC",
    contentLengthMode: plan.content_length_mode || "standard",
    excludedTrendNames: plan.excluded_trend_names || [],
  };
}

function formatTrendRegions(regions: string[], t: (key: string, params?: Record<string, string | number>) => string) {
  const values = regions.length ? regions : ["1", "23424977"];
  return values.map((value) => t(`autoPost.trends.region.${value}`)).join(", ");
}

function formatTrendCategories(categories: string[], t: (key: string, params?: Record<string, string | number>) => string) {
  if (!categories.length) return t("autoPost.trends.allCategories");
  return categories.map((value) => t(`autoPost.trends.category.${value}`)).join(", ");
}

function TrendPreferenceSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
      <p className="text-xs text-[#71767b]">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-[#e7e9ea]">{value}</p>
    </div>
  );
}

function TrendFeedbackPanel({
  data,
  loading,
  clearingID,
  onRefresh,
  onClear,
}: {
  data: TrendFeedbackListData | null;
  loading: boolean;
  clearingID: number;
  onRefresh: () => void | Promise<void>;
  onClear: (item: TrendFeedbackApi) => void | Promise<void>;
}) {
  const { t } = useT();
  const timeZone = usePreferredTimeZone();
  const items = data?.items || [];
  const summary = data?.summary;
  return (
    <div className="rounded-xl border border-[#2f3336] bg-black p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-medium text-[#71767b]">{t("autoPost.trends.feedbackPanel.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("autoPost.trends.feedbackPanel.description")}</p>
        </div>
        <Button type="button" size="sm" variant="outline" className="h-8" disabled={loading} onClick={() => void onRefresh()}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {t("autoPost.trends.feedbackPanel.refresh")}
        </Button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <TrendFeedbackMetric label={t("autoPost.trends.feedbackPanel.total")} value={summary?.total || 0} />
        <TrendFeedbackMetric label={t("autoPost.trends.feedback.irrelevant")} value={summary?.irrelevant || 0} />
        <TrendFeedbackMetric label={t("autoPost.trends.feedback.tooForced")} value={summary?.too_forced || 0} />
      </div>
      {loading ? (
        <p className="mt-3 text-sm text-[#71767b]">{t("autoPost.trends.feedbackPanel.loading")}</p>
      ) : items.length ? (
        <div className="mt-3 grid gap-2">
          {items.slice(0, 8).map((item) => (
            <div key={item.id} className="flex flex-col gap-2 rounded-xl border border-[#2f3336] bg-[#0f1419] p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[#e7e9ea]">{item.trend_name}</span>
                  <span className="rounded-full border border-amber-300/25 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-100">
                    {t(`autoPost.trends.feedback.${item.rating === "too_forced" ? "tooForced" : "irrelevant"}`)}
                  </span>
                  {item.category ? (
                    <span className="rounded-full border border-[#2f3336] bg-black px-2 py-0.5 text-[11px] text-[#71767b]">
                      {t(`autoPost.trends.category.${item.category}`)}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-[#71767b]">{formatDateTime(item.created_at, timeZone)}</p>
              </div>
              <button
                type="button"
                disabled={Boolean(clearingID)}
                onClick={() => void onClear(item)}
                className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-[#2f3336] px-3 text-xs font-semibold text-[#8ecdf8] hover:border-[#1d9bf0]/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {clearingID === item.id ? t("autoPost.trends.feedbackPanel.clearing") : t("autoPost.trends.feedbackPanel.clear")}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2 text-sm text-[#71767b]">
          {t("autoPost.trends.feedbackPanel.empty")}
        </p>
      )}
    </div>
  );
}

function TrendFeedbackMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
      <p className="text-[11px] text-[#71767b]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-[#e7e9ea]">{value}</p>
    </div>
  );
}

type TrendFeedbackContext = {
  sourceType: string;
  sourceID?: number;
  botID?: number;
  xAccountID?: number;
};

function TrendSourceChips({ trends, label, feedback }: { trends: TrendTopicApi[]; label: string; feedback?: TrendFeedbackContext }) {
  const { t } = useT();
  const { pushToast } = useToast();
  const [pendingKey, setPendingKey] = useState("");
  if (!trends.length) return null;
  async function submitFeedback(trend: TrendTopicApi, rating: TrendFeedbackRating) {
    const key = `${trend.woeid}-${trend.normalized_name || trend.trend_name}-${rating}`;
    setPendingKey(key);
    try {
      await autoPostService.submitTrendFeedback({
        bot_id: feedback?.botID || 0,
        x_account_id: feedback?.xAccountID || 0,
        trend_name: trend.trend_name,
        normalized_name: trend.normalized_name,
        woeid: trend.woeid,
        category: trend.category,
        rating,
        source_type: feedback?.sourceType || "auto_post",
        source_id: feedback?.sourceID || 0,
      });
      pushToast(t("autoPost.trends.feedbackSaved"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoPost.trends.feedbackFailed") : t("autoPost.trends.feedbackFailed"));
    } finally {
      setPendingKey("");
    }
  }
  return (
    <div className="mt-3 rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
      <p className="text-xs font-medium text-[#71767b]">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {trends.slice(0, 3).map((trend) => (
          <div key={`${trend.woeid}-${trend.normalized_name || trend.trend_name}`} className="min-w-0 rounded-xl border border-[#1d9bf0]/30 bg-[#1d9bf0]/10 px-3 py-2 text-xs text-[#d7ebff]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{trend.trend_name}</span>
              <span className="text-[#71767b]">{t(`autoPost.trends.category.${trend.category}`)}</span>
            </div>
            {trend.relevance_reason ? (
              <p className="mt-1 break-words leading-5 text-[#8b98a5]">
                {t("autoPost.trends.reasonPrefix")} {trend.relevance_reason}
              </p>
            ) : null}
            {trend.matched_keywords?.length ? (
              <p className="mt-1 break-words leading-5 text-[#71767b]">
                {t("autoPost.trends.keywordsPrefix")} {trend.matched_keywords.join(", ")}
              </p>
            ) : null}
            {feedback ? (
              <TrendFeedbackButtons
                trend={trend}
                pendingKey={pendingKey}
                onSubmit={(rating) => void submitFeedback(trend, rating)}
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendFeedbackButtons({ trend, pendingKey, onSubmit }: { trend: TrendTopicApi; pendingKey: string; onSubmit: (rating: TrendFeedbackRating) => void }) {
  const { t } = useT();
  const baseKey = `${trend.woeid}-${trend.normalized_name || trend.trend_name}`;
  const options: Array<{ rating: TrendFeedbackRating; label: string }> = [
    { rating: "relevant", label: t("autoPost.trends.feedback.relevant") },
    { rating: "irrelevant", label: t("autoPost.trends.feedback.irrelevant") },
    { rating: "too_forced", label: t("autoPost.trends.feedback.tooForced") },
  ];
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {options.map((option) => {
        const loading = pendingKey === `${baseKey}-${option.rating}`;
        return (
          <button
            key={option.rating}
            type="button"
            onClick={() => onSubmit(option.rating)}
            disabled={Boolean(pendingKey)}
            className="rounded-full border border-[#2f3336] bg-black px-2.5 py-1 text-[11px] font-medium text-[#8b98a5] transition hover:border-[#1d9bf0]/50 hover:text-[#d7ebff] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? t("autoPost.trends.feedback.saving") : option.label}
          </button>
        );
      })}
    </div>
  );
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
