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
  ExternalLink,
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
import { OperationalBlockersCard, type OperationalBlocker } from "@/components/operations/operational-blockers-card";
import { QuotaUpgradeCallout } from "@/components/automation/quota-upgrade-callout";
import { useConfirm } from "@/components/providers/confirm-provider";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { apiErrorCode, apiErrorMessage } from "@/lib/request";
import { formatDateTime, usePreferredTimeZone } from "@/lib/timezone";
import { accountService, type AccountListItem, type XSubscriptionTier } from "@/services/account.service";
import {
  contentDraftService,
  type ContentDraftApi,
  type ContentDraftHandlingMode,
  type ContentDraftGenerationRunApi,
  type ContentDraftLengthMode,
  type ExposureSourceTraceApi,
  type ContentDraftPlanApi,
  type TrendFeedbackApi,
  type TrendFeedbackListData,
  type TrendFeedbackRating,
  type TrendTopicApi,
} from "@/services/content-drafts.service";
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
type RunStatusFilter = "all" | ContentDraftGenerationRunApi["status"];
type RunAccountScope = "selected" | "all";
type RunRangeFilter = "all" | "24h" | "7d" | "30d";
type ContentExposureFilter = "all" | "exposure" | "radar" | "brief";
type ContentRegionFilter = "all" | "zh" | "en";
type ContentVelocityFilter = "all" | "rising" | "steady" | "cooling";
type ContentSortMode = "default" | "score_desc" | "newest" | "usage_desc";
type ExposureStrategyRecommendation = {
  items: ContentLibraryItemApi[];
  title: string;
  summary: string;
  direction: string;
  topics: string[];
  regions: string[];
  averageScore: number;
};

type PlannerForm = {
  enabled: boolean;
  executionMode: ContentDraftHandlingMode;
  minIntervalMinutes: number;
  postingWindows: string;
  timezone: string;
  contentLengthMode: ContentDraftLengthMode;
  excludedTrendNames: string[];
};

const timezones = ["UTC", "Asia/Shanghai", "America/New_York", "Europe/London"];
const executionModes: ContentDraftHandlingMode[] = ["manual", "review", "autopilot"];
const xSubscriptionTiers: XSubscriptionTier[] = ["unknown", "free", "premium", "premium_plus"];
const contentDraftLengthModes: ContentDraftLengthMode[] = ["standard", "long"];
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
  { id: "generate", labelKey: "contentDrafts.tabs.generate", descriptionKey: "contentDrafts.tabs.generateDesc" },
  { id: "planner", labelKey: "contentDrafts.tabs.planner", descriptionKey: "contentDrafts.tabs.plannerDesc" },
  { id: "content", labelKey: "contentDrafts.tabs.content", descriptionKey: "contentDrafts.tabs.contentDesc" },
  { id: "history", labelKey: "contentDrafts.tabs.history", descriptionKey: "contentDrafts.tabs.historyDesc" },
];
const runStatusFilters: RunStatusFilter[] = ["all", "completed", "skipped", "failed"];
const runAccountScopes: RunAccountScope[] = ["selected", "all"];
const runRangeFilters: RunRangeFilter[] = ["all", "24h", "7d", "30d"];
const contentExposureFilters: ContentExposureFilter[] = ["all", "exposure", "radar", "brief"];
const contentRegionFilters: ContentRegionFilter[] = ["all", "zh", "en"];
const contentVelocityFilters: ContentVelocityFilter[] = ["all", "rising", "steady", "cooling"];
const contentSortModes: ContentSortMode[] = ["default", "score_desc", "newest", "usage_desc"];
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

function readContentItemID(value: string | null) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function parseContentSourceTrace(item: ContentLibraryItemApi): ContentSourceTrace | null {
  if (!item.topics.some((topic) => topic.toLowerCase() === "exposure-radar")) return null;
  const lines = item.body.split("\n").map((line) => line.trim()).filter(Boolean);
  const metadata = parseRadarMetadata(readTraceLine(lines, "Radar metadata"));
  const kind = item.topics.some((topic) => topic.toLowerCase() === "hourly-brief") || Boolean(readTraceLine(lines, "Brief item")) ? "brief" : "radar";
  const signalTitle = readTraceLine(lines, kind === "brief" ? "Brief item" : "Signal") || item.title;
  const summary = readTraceLine(lines, "Summary") || readTraceLine(lines, "Context");
  const region = metadata.region || item.topics.find((topic) => ["zh", "en"].includes(topic.toLowerCase())) || "";
  return {
    kind,
    signalTitle,
    summary,
    whyItMatters: readTraceLine(lines, "Why it matters"),
    suggestedAction: readTraceLine(lines, "Suggested operator action"),
    bestUse: readTraceLine(lines, "Best use"),
    region,
    score: metadata.score || "",
    velocity: metadata.velocity || "",
    risk: metadata.risk || "",
    quality: metadata.quality || "",
    sourceURL: item.source_url || "",
  };
}

function readTraceLine(lines: string[], label: string) {
  const prefix = `${label}:`;
  const row = lines.find((line) => line.toLowerCase().startsWith(prefix.toLowerCase()));
  return row ? row.slice(prefix.length).trim() : "";
}

function parseRadarMetadata(value: string) {
  const out: Record<string, string> = {};
  value.split(";").forEach((part) => {
    const [rawKey, ...rawValue] = part.split("=");
    const key = rawKey?.trim().toLowerCase();
    const next = rawValue.join("=").trim().replace(/[.。]+$/, "");
    if (key && next) out[key] = next;
  });
  return out;
}

function contentItemMatchesExposureFilters(item: ContentLibraryItemApi, exposure: ContentExposureFilter, region: ContentRegionFilter, velocity: ContentVelocityFilter) {
  const trace = parseContentSourceTrace(item);
  if (exposure === "exposure" && !trace) return false;
  if (exposure === "radar" && trace?.kind !== "radar") return false;
  if (exposure === "brief" && trace?.kind !== "brief") return false;
  if (region !== "all" && trace?.region?.toLowerCase() !== region) return false;
  if (velocity !== "all" && normalizeContentVelocity(trace?.velocity || "") !== velocity) return false;
  return true;
}

function sortContentItems(items: ContentLibraryItemApi[], sortMode: ContentSortMode) {
  return [...items].sort((a, b) => {
    if (sortMode === "score_desc") return traceScore(b) - traceScore(a) || b.priority - a.priority || b.id - a.id;
    if (sortMode === "newest") return Date.parse(b.created_at || "") - Date.parse(a.created_at || "") || b.id - a.id;
    if (sortMode === "usage_desc") return b.usage_count - a.usage_count || b.id - a.id;
    return b.priority - a.priority || b.id - a.id;
  });
}

function traceScore(item: ContentLibraryItemApi) {
  const score = Number(parseContentSourceTrace(item)?.score || "");
  return Number.isFinite(score) ? score : -1;
}

function normalizeContentVelocity(value: string): ContentVelocityFilter {
  const next = value.trim().toLowerCase();
  if (next.includes("cool")) return "cooling";
  if (next.includes("steady") || next.includes("stable")) return "steady";
  if (next.includes("rising") || next.includes("hot") || next.includes("new")) return "rising";
  return "all";
}

function buildExposureStrategyRecommendation(items: ContentLibraryItemApi[]): ExposureStrategyRecommendation | null {
  const ranked = sortContentItems(
    items.filter((item) => item.status === "active" && parseContentSourceTrace(item)),
    "score_desc"
  ).slice(0, 3);
  if (ranked.length === 0) return null;
  const traces = ranked.map((item) => parseContentSourceTrace(item)).filter((trace): trace is ContentSourceTrace => Boolean(trace));
  const topics = uniqueStrings(ranked.flatMap((item) => item.topics.filter((topic) => !["exposure-radar", "hourly-brief", "zh", "en"].includes(topic.toLowerCase())))).slice(0, 5);
  const regions = uniqueStrings(traces.map((trace) => trace.region).filter(Boolean));
  const averageScore = Math.round(traces.reduce((sum, trace) => sum + (Number(trace.score) || 0), 0) / Math.max(traces.length, 1));
  const primary = traces[0];
  const actions = uniqueStrings(traces.map((trace) => trace.suggestedAction || trace.bestUse).filter(Boolean)).slice(0, 3);
  const directionLines = [
    `Use today as a controlled Exposure memory sprint.`,
    `Primary signal: ${primary.signalTitle}.`,
    topics.length ? `Focus topics: ${topics.join(", ")}.` : "",
    regions.length ? `Region context: ${regions.join(", ")}.` : "",
    `Recommended workflow: create 1 high-context post or reply angle from the primary signal, then queue 2 review-first follow-up drafts from related memories.`,
    actions.length ? `Operator angles: ${actions.join(" | ")}` : "",
    `Guardrail: keep the post practical, avoid broad growth promises, and route output through the review queue before publishing.`,
  ].filter(Boolean);
  return {
    items: ranked,
    title: primary.signalTitle,
    summary: actions[0] || primary.whyItMatters || primary.summary,
    direction: directionLines.join("\n"),
    topics,
    regions,
    averageScore,
  };
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const next = value.trim();
    const key = next.toLowerCase();
    if (!next || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function ContentDraftsPage() {
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
  const [plans, setPlans] = useState<ContentDraftPlanApi[]>([]);
  const [drafts, setDrafts] = useState<ContentDraftApi[]>([]);
  const [runs, setRuns] = useState<ContentDraftGenerationRunApi[]>([]);
  const [contentItems, setContentItems] = useState<ContentLibraryItemApi[]>([]);
  const [subscription, setSubscription] = useState<BillingSubscriptionApi | null>(null);
  const [selectedAccountID, setSelectedAccountID] = useState(() => readAccountID(searchParams.get("account")));
  const [selectedContentItemID, setSelectedContentItemID] = useState(() => readContentItemID(searchParams.get("content_item_id")));
  const [form, setForm] = useState<PlannerForm>(() => defaultForm());
  const [libraryForm, setLibraryForm] = useState<LibraryForm>(() => defaultLibraryForm());
  const [editingLibraryID, setEditingLibraryID] = useState<number | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [contentExposureFilter, setContentExposureFilter] = useState<ContentExposureFilter>("all");
  const [contentRegionFilter, setContentRegionFilter] = useState<ContentRegionFilter>("all");
  const [contentVelocityFilter, setContentVelocityFilter] = useState<ContentVelocityFilter>("all");
  const [contentSortMode, setContentSortMode] = useState<ContentSortMode>("default");
  const [contentDirection, setContentDirection] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingLibrary, setSavingLibrary] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingExposureStrategy, setGeneratingExposureStrategy] = useState(false);
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
  const [latestRun, setLatestRun] = useState<ContentDraftGenerationRunApi | null>(null);
  const [moduleEnabled, setModuleEnabled] = useState<boolean | null>(null);
  const [quotaUpgradeVisible, setQuotaUpgradeVisible] = useState(false);
  const workbenchPanelRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const [accountData, botData, planData, draftData, libraryData, subscriptionData] = await Promise.all([
        accountService.list(),
        oafBotService.list(),
        contentDraftService.plans(),
        contentDraftService.drafts(),
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
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("contentDrafts.errors.load") : t("contentDrafts.errors.load"));
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
  const exposureContentCount = useMemo(() => availableContentItems.filter((item) => Boolean(parseContentSourceTrace(item))).length, [availableContentItems]);
  const filteredContentItems = useMemo(
    () =>
      sortContentItems(
        availableContentItems.filter((item) => contentItemMatchesExposureFilters(item, contentExposureFilter, contentRegionFilter, contentVelocityFilter)),
        contentSortMode
      ),
    [availableContentItems, contentExposureFilter, contentRegionFilter, contentSortMode, contentVelocityFilter]
  );
  const exposureStrategyRecommendation = useMemo(() => buildExposureStrategyRecommendation(availableContentItems), [availableContentItems]);
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
  const handlingModeReady = Boolean(selectedPlan?.execution_mode || form.executionMode);
  const selectedAccountTier = selectedAccount?.x_subscription_tier || "unknown";
  const selectedAccountIsPremium = selectedAccountTier === "premium" || selectedAccountTier === "premium_plus";
  const selectedPostingWindowHours = useMemo(() => parsePostingWindowHours(form.postingWindows), [form.postingWindows]);
  const modulePaused = moduleEnabled === false;
  const modulePausedActionTip = modulePaused
    ? t("automation.pausedNotice.actionDisabled", { module: t("automation.module.post.name") })
    : undefined;
  const operationalBlockers = useMemo<OperationalBlocker[]>(() => {
    const blockers: OperationalBlocker[] = [];
    const accountNeedsReauth = selectedAccount ? selectedAccount.status !== "connected" || selectedAccount.publish_reauth_required : false;
    if (!selectedAccountID) {
      blockers.push({
        id: "account_missing",
        title: t("contentDrafts.blockers.accountMissing.title"),
        description: t("contentDrafts.blockers.accountMissing.description"),
        href: "/accounts",
        actionLabel: t("contentDrafts.blockers.accountMissing.action"),
        severity: "danger",
      });
    } else if (accountNeedsReauth) {
      blockers.push({
        id: "account_reauth",
        title: t("contentDrafts.blockers.accountReauth.title"),
        description: t("contentDrafts.blockers.accountReauth.description"),
        href: "/accounts?filter=needs_reauth",
        actionLabel: t("contentDrafts.blockers.accountReauth.action"),
        severity: "danger",
      });
    }
    if (modulePaused) {
      blockers.push({
        id: "module_paused",
        title: t("contentDrafts.blockers.modulePaused.title"),
        description: t("contentDrafts.blockers.modulePaused.description"),
        href: "/content-drafts?panel=planner",
        actionLabel: t("contentDrafts.blockers.modulePaused.action"),
        severity: "danger",
      });
    }
    if (!selectedBot) {
      blockers.push({
        id: "bot_missing",
        title: t("contentDrafts.blockers.botMissing.title"),
        description: t("contentDrafts.blockers.botMissing.description"),
        href: "/oaf-bots",
        actionLabel: t("contentDrafts.blockers.botMissing.action"),
        severity: "warning",
      });
    }
    if (activeContentCount === 0) {
      blockers.push({
        id: "content_missing",
        title: t("contentDrafts.blockers.contentMissing.title"),
        description: t("contentDrafts.blockers.contentMissing.description"),
        href: selectedAccountID ? `/content-drafts?account=${selectedAccountID}&panel=content` : "/content-drafts?panel=content",
        actionLabel: t("contentDrafts.blockers.contentMissing.action"),
        severity: "warning",
      });
    }
    if (!selectedPlan?.enabled) {
      blockers.push({
        id: "planner_disabled",
        title: t("contentDrafts.blockers.plannerDisabled.title"),
        description: t("contentDrafts.blockers.plannerDisabled.description"),
        href: selectedAccountID ? `/content-drafts?account=${selectedAccountID}&panel=planner` : "/content-drafts?panel=planner",
        actionLabel: t("contentDrafts.blockers.plannerDisabled.action"),
        severity: "warning",
      });
    }
    if (aiLimit > 0 && aiRemaining <= 0) {
      blockers.push({
        id: "quota",
        title: t("contentDrafts.blockers.quota.title"),
        description: t("contentDrafts.blockers.quota.description"),
        href: "/billing",
        actionLabel: t("contentDrafts.blockers.quota.action"),
        severity: "danger",
      });
    }
    if (queuedDraftCount > 0) {
      blockers.push({
        id: "queue",
        title: t("contentDrafts.blockers.queue.title", { count: queuedDraftCount }),
        description: t("contentDrafts.blockers.queue.description"),
        href: "/handling-list?type=post",
        actionLabel: t("contentDrafts.blockers.queue.action"),
        severity: "info",
        countLabel: String(queuedDraftCount),
      });
    }
    return blockers;
  }, [activeContentCount, aiLimit, aiRemaining, modulePaused, queuedDraftCount, selectedAccount, selectedAccountID, selectedBot, selectedPlan?.enabled, t]);

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
    const contentItemID = readContentItemID(searchParams.get("content_item_id"));
    setSelectedContentItemID((current) => (current === contentItemID ? current : contentItemID));
  }, [searchParams]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (selectedAccountID > 0) next.set("account", String(selectedAccountID));
    if (activePanel !== "generate") next.set("panel", activePanel);
    if (runStatusFilter !== "all") next.set("run_status", runStatusFilter);
    if (runAccountScope !== "selected") next.set("account_scope", runAccountScope);
    if (runRangeFilter !== "all") next.set("run_range", runRangeFilter);
    if (runPage > 1) next.set("run_page", String(runPage));
    if (activePanel === "content" && selectedContentItemID > 0) next.set("content_item_id", String(selectedContentItemID));
    const nextQuery = next.toString();
    const currentQuery = searchParams.toString();
    if (nextQuery !== currentQuery) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    }
  }, [activePanel, pathname, router, runAccountScope, runPage, runRangeFilter, runStatusFilter, searchParams, selectedAccountID, selectedContentItemID]);

  const fetchRuns = useCallback(async () => {
    if (runAccountScope === "selected" && !selectedAccountID) {
      setRuns([]);
      setRunPagination({ page: 1, pageSize: 12, total: 0 });
      return;
    }
    setRunsLoading(true);
    try {
      const data = await contentDraftService.runs({
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
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("contentDrafts.runs.loadFailed") : t("contentDrafts.runs.loadFailed"));
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
      const data = await contentDraftService.runs({ xAccountID: selectedAccountID, page: 1, pageSize: 1 });
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
      if (!reason) return t("contentDrafts.runs.skipReason.unknown");
      const key = `contentDrafts.runs.skipReason.${reason}`;
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
      pushToast(t("contentDrafts.errors.needAccount"));
      return;
    }
    if (selectedContentItem && selectedContentItem.status !== "active") {
      pushToast(t("contentDrafts.contentLibrary.errors.inactiveSelected"));
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
      const saved = selectedPlan ? await contentDraftService.updatePlan(selectedPlan.id, payload) : await contentDraftService.createPlan(payload);
      setPlans((current) => {
        const without = current.filter((item) => item.id !== saved.id && item.x_account_id !== saved.x_account_id);
        return [saved, ...without];
      });
      setForm(formFromPlan(saved));
      setQuotaUpgradeVisible(false);
      pushToast(t("contentDrafts.toast.saved"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("contentDrafts.errors.save") : t("contentDrafts.errors.save"));
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
      const data = await contentDraftService.selectedTrends({ planID, botID, limit: 3, excludedTrendNames: form.excludedTrendNames });
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
      const data = await contentDraftService.trendFeedback({ botID, onlyNegative: true, limit: 20 });
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
        await contentDraftService.deleteTrendFeedback(item.id);
        pushToast(t("contentDrafts.trends.feedbackCleared"));
        await Promise.all([refreshTrendFeedback(), refreshSelectedTrends()]);
      } catch (error) {
        pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("contentDrafts.trends.feedbackClearFailed") : t("contentDrafts.trends.feedbackClearFailed"));
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
      pushToast(t("contentDrafts.account.tierSaved"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("contentDrafts.account.tierSaveFailed") : t("contentDrafts.account.tierSaveFailed"));
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
      pushToast(t("contentDrafts.account.tierSynced"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("contentDrafts.account.tierSyncFailed") : t("contentDrafts.account.tierSyncFailed"));
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
      pushToast(t("contentDrafts.errors.needAccount"));
      return;
    }
    if (!libraryForm.title.trim() || !libraryForm.body.trim()) {
      pushToast(t("contentDrafts.contentLibrary.errors.required"));
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
      pushToast(t(wasEditing ? "contentDrafts.contentLibrary.toast.updated" : "contentDrafts.contentLibrary.toast.created"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("contentDrafts.contentLibrary.errors.save") : t("contentDrafts.contentLibrary.errors.save"));
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
      pushToast(t("contentDrafts.contentLibrary.toast.updated"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("contentDrafts.contentLibrary.errors.save") : t("contentDrafts.contentLibrary.errors.save"));
    }
  };

  const deleteLibraryItem = async (item: ContentLibraryItemApi) => {
    const confirmed = await confirm({
      description: t("contentDrafts.contentLibrary.confirmDelete"),
      confirmLabel: t("handlingList.actions.delete"),
      tone: "destructive",
    });
    if (!confirmed) return;
    try {
      await contentLibraryService.delete(item.id);
      setContentItems((current) => current.filter((row) => row.id !== item.id));
      if (selectedContentItemID === item.id) setSelectedContentItemID(0);
      pushToast(t("contentDrafts.contentLibrary.toast.deleted"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("contentDrafts.contentLibrary.errors.delete") : t("contentDrafts.contentLibrary.errors.delete"));
    }
  };

  const ensureContentDraftPlan = async () => {
    const plan = selectedPlan;
    if (!selectedAccountID) {
      pushToast(t("contentDrafts.errors.needAccount"));
      return null;
    }
    if (plan) return plan;
    const saved = await contentDraftService.createPlan({
      x_account_id: selectedAccountID,
      enabled: form.enabled,
      execution_mode: form.executionMode,
      min_interval_minutes: Number(form.minIntervalMinutes) || 1,
      posting_windows: form.postingWindows.trim(),
      timezone: form.timezone.trim() || "UTC",
      content_length_mode: selectedAccountIsPremium ? form.contentLengthMode : "standard",
      excluded_trend_names: form.excludedTrendNames,
    });
    setPlans((current) => [saved, ...current.filter((item) => item.x_account_id !== saved.x_account_id)]);
    return saved;
  };

  const handleGenerateError = (error: unknown) => {
    const code = axios.isAxiosError(error) ? error.response?.data?.error_code : "";
    if (code === "ai_generation_quota_exceeded") {
      setQuotaUpgradeVisible(true);
      pushToast(t("contentDrafts.errors.aiQuotaExceeded"));
    } else if (code === "auto_post_monthly_limit_exceeded" || code === "auto_post_daily_limit_exceeded") {
      setQuotaUpgradeVisible(true);
      pushToast(t("contentDrafts.errors.dailyLimitExceeded"));
    } else if (code === "auto_post_duplicate_content") {
      pushToast(t("contentDrafts.errors.duplicateContent"));
    } else {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("contentDrafts.errors.generate") : t("contentDrafts.errors.generate"));
    }
  };

  const createContentDraft = async (options: { direction: string; contentItemID?: number; successToast?: string }) => {
    const plan = await ensureContentDraftPlan();
    if (!plan) return null;
    const draft = await contentDraftService.generateDraft(plan.id, options.direction.trim(), options.contentItemID, form.excludedTrendNames);
    setDrafts((current) => [draft, ...current.filter((item) => item.id !== draft.id)]);
    setQuotaUpgradeVisible(false);
    pushToast(options.successToast || t("contentDrafts.toast.generated"));
    setActivePanel("history");
    void load();
    return draft;
  };

  const generateDraft = async () => {
    if (!selectedAccountID) {
      pushToast(t("contentDrafts.errors.needAccount"));
      return;
    }
    setGenerating(true);
    try {
      await createContentDraft({ direction: contentDirection, contentItemID: selectedContentItem?.id });
      setContentDirection("");
    } catch (error) {
      handleGenerateError(error);
    } finally {
      setGenerating(false);
    }
  };

  const applyExposureStrategyRecommendation = useCallback(() => {
    if (!exposureStrategyRecommendation) return;
    setContentDirection(exposureStrategyRecommendation.direction);
    const primary = exposureStrategyRecommendation.items[0];
    if (primary) setSelectedContentItemID(primary.id);
    pushToast(t("contentDrafts.generate.strategy.toastApplied"));
  }, [exposureStrategyRecommendation, pushToast, t]);

  const generateExposureStrategyDraft = async () => {
    if (!exposureStrategyRecommendation) return;
    if (!selectedAccountID) {
      pushToast(t("contentDrafts.errors.needAccount"));
      return;
    }
    const primary = exposureStrategyRecommendation.items[0];
    setGeneratingExposureStrategy(true);
    try {
      await createContentDraft({
        direction: exposureStrategyRecommendation.direction,
        contentItemID: primary?.id,
        successToast: t("contentDrafts.generate.strategy.toastQueued"),
      });
      setContentDirection(exposureStrategyRecommendation.direction);
      if (primary) setSelectedContentItemID(primary.id);
    } catch (error) {
      handleGenerateError(error);
    } finally {
      setGeneratingExposureStrategy(false);
    }
  };

  const runPlannerNow = async () => {
    if (!selectedPlan) {
      pushToast(t("contentDrafts.runNow.needPlanner"));
      return;
    }
    const confirmed = await confirm({
      description: t("contentDrafts.runNow.confirm"),
      confirmLabel: t("contentDrafts.runNow.button"),
    });
    if (!confirmed) return;
    setRunningPlanner(true);
    try {
      const run = await contentDraftService.runNow(selectedPlan.id);
      if (run.status === "completed") {
        pushToast(t("contentDrafts.runNow.toast.completed"));
      } else if (run.status === "skipped") {
        pushToast(t("contentDrafts.runNow.toast.skipped", { reason: skipReasonLabel(run.skip_reason) }));
      } else {
        pushToast(t("contentDrafts.runNow.toast.failed"));
      }
      setActivePanel("history");
      setRunPage(1);
      void fetchRuns();
      void fetchLatestRun();
      void load();
    } catch (error) {
      pushToast(apiErrorCode(error) === "automation_module_paused" ? t("automation.pausedNotice.toast") : apiErrorMessage(error) || t("contentDrafts.runNow.errors.failed"));
    } finally {
      setRunningPlanner(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-medium text-[#1d9bf0]">{t("contentDrafts.kicker")}</p>
          <h1 className="mt-2 text-3xl font-bold text-[#e7e9ea]">{t("contentDrafts.title")}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#71767b]">{t("contentDrafts.subtitle")}</p>
        </div>
        <Link href="/handling-list?type=post" className="inline-flex">
          <Button variant="outline">
            {t("contentDrafts.actions.openQueue")}
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
          <CardHeader title={t("automation.error.title")} description={t("contentDrafts.errors.load")} />
          <Button type="button" variant="outline" onClick={() => void load()}>
            {t("common.retry")}
          </Button>
        </Card>
      ) : null}

      <AutomationModulePausedNotice type="post" onEnabledChange={setModuleEnabled} />

      {quotaUpgradeVisible ? <QuotaUpgradeCallout /> : null}

      {loadState === "ready" ? (
        <>
          <OperationalBlockersCard
            title={t("contentDrafts.blockers.title")}
            description={t("contentDrafts.blockers.description")}
            blockers={operationalBlockers}
            emptyTitle={t("contentDrafts.blockers.emptyTitle")}
            emptyDescription={t("contentDrafts.blockers.emptyDescription")}
          />
          <ContentDraftControlSummary
            selectedAccount={selectedAccount}
            selectedBot={selectedBot}
            selectedPlan={selectedPlan}
            activeContentCount={activeContentCount}
            queuedDraftCount={queuedDraftCount}
            publishReadyCount={publishReadyCount}
            latestRun={latestRun}
            aiRemaining={aiRemaining}
            nextRunLabel={selectedPlan?.next_run_at ? formatDateTime(selectedPlan.next_run_at, timeZone) : t("contentDrafts.common.emptyValue")}
            onOpenPanel={openPanel}
          />
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr_0.9fr]">
            <Card>
              <CardHeader title={t("contentDrafts.account.title")} description={t("contentDrafts.account.description")} />
              {accounts.length > 0 ? (
                <label className="block space-y-2">
                  <span className="text-xs font-medium text-[#71767b]">{t("contentDrafts.account.label")}</span>
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
                  {t("contentDrafts.account.empty")}
                </div>
              )}
              {selectedAccount ? (
                <div className="mt-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-[#71767b]">{t("contentDrafts.account.tierLabel")}</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => void syncAccountTier()} disabled={syncingAccountTier}>
                      {syncingAccountTier ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                      {t("contentDrafts.account.syncTier")}
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
                        {t(`contentDrafts.xTier.${tier}`)}
                      </option>
                    ))}
                  </select>
                  <span className="block text-xs leading-5 text-[#71767b]">
                    {t("contentDrafts.account.tierHelper")} {t(`contentDrafts.account.tierSource.${selectedAccount.x_subscription_source || "manual"}`)}
                  </span>
                </div>
              ) : null}
              <div className="mt-4 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[#2f3336] bg-black">
                    <Bot className="size-5 text-[#1d9bf0]" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#e7e9ea]">{selectedBot ? selectedBot.name : t("contentDrafts.bot.defaultTitle")}</p>
                    <p className="mt-1 text-sm leading-6 text-[#71767b]">
                      {selectedBot ? t("contentDrafts.bot.boundHint", { tone: selectedBot.voice_tone || t("contentDrafts.bot.noTone") }) : t("contentDrafts.bot.unboundHint")}
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title={t("contentDrafts.ai.title")} description={t("contentDrafts.ai.description")} />
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-2xl font-bold text-[#e7e9ea]">{aiRemaining.toLocaleString()}</p>
                  <p className="mt-1 text-xs text-[#71767b]">{t("contentDrafts.ai.remaining")}</p>
                </div>
                <div className="text-right text-xs text-[#71767b]">
                  <p>{t("contentDrafts.ai.used", { used: aiUsed.toLocaleString(), limit: aiLimit.toLocaleString() })}</p>
                  <p>{t("contentDrafts.ai.percent", { percent: aiPercent })}</p>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#2f3336]">
                <div className="h-full rounded-full bg-[#1d9bf0]" style={{ width: `${aiPercent}%` }} />
              </div>
            </Card>

            <Card>
              <CardHeader
                title={t("contentDrafts.status.title")}
                description={t("contentDrafts.status.description")}
                right={
                  <Button
                    size="sm"
                    type="button"
                    onClick={() => void runPlannerNow()}
                    disabled={runningPlanner || !selectedAccountID || modulePaused}
                    title={modulePausedActionTip}
                  >
                    {runningPlanner ? <Loader2 className="size-4 animate-spin" /> : <PlayCircle className="size-4" />}
                    {t("contentDrafts.runNow.button")}
                  </Button>
                }
              />
              <div className="space-y-3 text-sm">
                {modulePaused ? (
                  <p className="rounded-xl border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100/80">
                    {modulePausedActionTip}
                  </p>
                ) : null}
                <StatusRow label={t("contentDrafts.status.plan")} value={selectedPlan ? t("contentDrafts.status.configured") : t("contentDrafts.status.notConfigured")} />
                <StatusRow label={t("contentDrafts.status.enabled")} value={selectedPlan?.enabled ? t("contentDrafts.status.enabledValue") : t("contentDrafts.status.pausedValue")} />
                <StatusRow label={t("contentDrafts.status.mode")} value={t(`contentDrafts.executionMode.${selectedPlan?.execution_mode || form.executionMode}`)} />
                <StatusRow label={t("contentDrafts.status.lastRun")} value={selectedPlan?.last_run_at ? formatDateTime(selectedPlan.last_run_at, timeZone) : t("contentDrafts.common.emptyValue")} />
                <StatusRow label={t("contentDrafts.status.nextRun")} value={selectedPlan?.next_run_at ? formatDateTime(selectedPlan.next_run_at, timeZone) : t("contentDrafts.common.emptyValue")} />
                <StatusRow label={t("contentDrafts.status.activeContent")} value={t("contentDrafts.status.activeContentValue", { count: activeContentCount })} />
                <StatusRow
                  label={t("contentDrafts.status.lastRunResult")}
                  value={latestRun ? t(`contentDrafts.runs.status.${latestRun.status}`) : t("contentDrafts.common.emptyValue")}
                />
                <StatusRow label={t("contentDrafts.status.minInterval")} value={t("contentDrafts.status.minIntervalValue", { minutes: selectedPlan?.min_interval_minutes || form.minIntervalMinutes })} />
                <StatusRow label={t("contentDrafts.status.timezone")} value={selectedPlan?.timezone || form.timezone || "UTC"} />
                <StatusRow label={t("contentDrafts.status.lengthMode")} value={t(`contentDrafts.lengthMode.${selectedPlan?.content_length_mode || form.contentLengthMode}`)} />
              </div>
            </Card>
          </div>

          <ContentDraftSetupGuide
            hasAccount={Boolean(selectedAccountID)}
            hasActiveContent={activeContentCount > 0}
            plannerEnabled={Boolean(selectedPlan?.enabled || form.enabled)}
            handlingModeReady={handlingModeReady}
            onOpenPanel={openPanel}
          />

          <ContentDraftTodayDraftsBridge />

          <ContentDraftPipelineSummary
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
                <CardHeader title={t("contentDrafts.planner.title")} description={t("contentDrafts.planner.description")} />
                <div className="space-y-4">
                {form.enabled && activeContentCount === 0 ? (
                  <div className="flex flex-col gap-3 rounded-xl border border-amber-300/20 bg-amber-500/10 p-3 text-sm leading-6 text-amber-50/85 sm:flex-row sm:items-center sm:justify-between">
                    <span>{t("contentDrafts.scheduler.noActiveContentHint")}</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => openPanel("content")}>
                      {t("contentDrafts.setup.actions.addContent")}
                    </Button>
                  </div>
                ) : null}
                {form.enabled && selectedPlan && !selectedPlan.next_run_at ? (
                  <div className="rounded-xl border border-blue-300/20 bg-blue-500/10 p-3 text-sm leading-6 text-blue-50/85">
                    {t("contentDrafts.scheduler.noNextRunHint")}
                  </div>
                ) : null}
                {aiRemaining <= 0 ? (
                  <div className="rounded-xl border border-rose-300/20 bg-rose-500/10 p-3 text-sm leading-6 text-rose-50/85">
                    {t("contentDrafts.scheduler.aiQuotaHint")}
                  </div>
                ) : null}
                <label className="flex flex-col gap-4 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4 sm:flex-row sm:items-center sm:justify-between">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-[#e7e9ea]">{t("contentDrafts.fields.enabled")}</span>
                    <span className="mt-1 block text-xs leading-5 text-[#71767b]">{t("contentDrafts.fields.enabledHelper")}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
                    className="size-5 accent-blue-500"
                  />
                </label>

                <div className="grid gap-3">
                  <p className="text-xs font-medium text-[#71767b]">{t("contentDrafts.fields.executionMode")}</p>
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
                        <span className="block text-sm font-semibold">{t(`contentDrafts.executionMode.${mode}`)}</span>
                        <span className="mt-1 block text-xs leading-5 text-[#71767b]">{t(`contentDrafts.executionMode.${mode}Helper`)}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4">
                  <TextInput
                    type="number"
                    label={t("contentDrafts.fields.minInterval")}
                    value={String(form.minIntervalMinutes)}
                    onChange={(value) => setForm((current) => ({ ...current, minIntervalMinutes: Number(value) }))}
                    helper={t("contentDrafts.fields.minIntervalHelper")}
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
                  <span className="text-xs font-medium text-[#71767b]">{t("contentDrafts.fields.timezone")}</span>
                  <select
                    value={form.timezone}
                    onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}
                    className="h-11 w-full rounded-2xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none focus:border-[#1d9bf0]"
                  >
                    {timezones.map((timezone) => (
                      <option key={timezone} value={timezone}>
                        {t(`contentDrafts.timezone.${timezone.replaceAll("/", "_")}`)}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid gap-3">
                  <div>
                    <p className="text-xs font-medium text-[#71767b]">{t("contentDrafts.fields.lengthMode")}</p>
                    <p className="mt-1 text-xs leading-5 text-[#71767b]">
                      {selectedAccountIsPremium ? t("contentDrafts.fields.lengthModeHelperPremium") : t("contentDrafts.fields.lengthModeHelperStandard")}
                    </p>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    {contentDraftLengthModes.map((mode) => {
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
                          <span className="block text-sm font-semibold">{t(`contentDrafts.lengthMode.${mode}`)}</span>
                          <span className="mt-1 block text-xs leading-5 text-[#71767b]">{t(`contentDrafts.lengthMode.${mode}Helper`)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <details className="rounded-2xl border border-[#2f3336] bg-[#0f1419]">
                  <summary className="flex cursor-pointer list-none flex-col gap-2 p-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[#e7e9ea]">{t("contentDrafts.trends.title")}</p>
                      <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("contentDrafts.trends.description")}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void refreshSelectedTrends();
                      }}
                      disabled={loadingSelectedTrends}
                    >
                      {loadingSelectedTrends ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                      {t("contentDrafts.trends.refresh")}
                    </Button>
                  </summary>
                  <div className="grid gap-4 border-t border-[#2f3336] p-4">

                  <div className="rounded-xl border border-[#2f3336] bg-black p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-xs font-medium text-[#71767b]">{t("contentDrafts.trends.inheritedTitle")}</p>
                        <p className="mt-1 text-sm font-semibold text-[#e7e9ea]">
                          {selectedBot ? t("contentDrafts.trends.inheritedFromBot", { bot: selectedBot.name }) : t("contentDrafts.trends.noBotInherited")}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("contentDrafts.trends.inheritedDescription")}</p>
                      </div>
                      <Link href="/oaf-bots" className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-[#2f3336] px-3 text-xs font-semibold text-white hover:bg-[#16181c]">
                        {t("contentDrafts.trends.editBotPreferences")}
                      </Link>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <TrendPreferenceSummary
                        label={t("contentDrafts.trends.regions")}
                        value={formatTrendRegions(selectedBot?.trend_regions || [], t)}
                      />
                      <TrendPreferenceSummary
                        label={t("contentDrafts.trends.categories")}
                        value={formatTrendCategories(selectedBot?.trend_categories || [], t)}
                      />
                      <TrendPreferenceSummary
                        label={t("contentDrafts.trends.sensitivePolicy")}
                        value={selectedBot ? t(`contentDrafts.trends.policy.${selectedBot.sensitive_trend_policy || "avoid"}`) : t("contentDrafts.trends.policy.avoid")}
                      />
                    </div>
                    <div className="mt-3 rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2 text-xs leading-5 text-[#71767b]">
                      {selectedBot?.allow_general_trends ? t("contentDrafts.trends.generalAllowed") : t("contentDrafts.trends.generalLimited")}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#2f3336] bg-black p-3">
                    <p className="text-xs font-medium text-[#71767b]">{t("contentDrafts.trends.selectedTitle")}</p>
                    {loadingSelectedTrends ? (
                      <p className="mt-2 text-sm text-[#71767b]">{t("contentDrafts.trends.loading")}</p>
                    ) : selectedTrends.length ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {selectedTrends.map((trend) => (
                          <span key={trend.id} className="inline-flex items-center gap-2 rounded-full border border-[#1d9bf0]/35 bg-[#1d9bf0]/10 px-3 py-1 text-xs text-[#d7ebff]">
                            {trend.trend_name}
                            <span className="ml-2 text-[#71767b]">{t(`contentDrafts.trends.category.${trend.category}`)}</span>
                            <button
                              type="button"
                              onClick={() => excludeTrend(trend)}
                              className="rounded-full border border-[#2f3336] px-2 py-0.5 text-[11px] font-semibold text-[#8ecdf8] hover:border-[#1d9bf0]/60 hover:text-white"
                            >
                              {t("contentDrafts.trends.exclude")}
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-[#71767b]">{t("contentDrafts.trends.selectedEmpty")}</p>
                    )}
                    {form.excludedTrendNames.length ? (
                      <div className="mt-3 border-t border-[#2f3336] pt-3">
                        <p className="text-xs font-medium text-[#71767b]">{t("contentDrafts.trends.excludedTitle")}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {form.excludedTrendNames.map((name) => (
                            <span key={name} className="inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-500/10 px-3 py-1 text-xs text-amber-100">
                              {name}
                              <button
                                type="button"
                                onClick={() => restoreExcludedTrend(name)}
                                className="rounded-full border border-amber-300/20 px-2 py-0.5 text-[11px] font-semibold text-amber-100 hover:bg-amber-300/10"
                              >
                                {t("contentDrafts.trends.restore")}
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
                </details>

                <Button type="button" onClick={() => void savePlan()} disabled={saving || !selectedAccountID}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  {t("contentDrafts.actions.savePlanner")}
                </Button>
              </div>
              </Card>
            ) : null}

            {activePanel === "content" ? (
              <div id="content-library" className="scroll-mt-24">
              <Card>
                <CardHeader
                  title={t("contentDrafts.contentLibrary.title")}
                  description={t("contentDrafts.contentLibrary.description")}
                  right={
                    <Button size="sm" variant="outline" onClick={libraryOpen ? resetLibraryForm : startCreateLibraryItem}>
                      {libraryOpen ? t("contentDrafts.contentLibrary.closeForm") : t("contentDrafts.contentLibrary.add")}
                    </Button>
                  }
                />
                <div className="mb-4 grid gap-3 md:grid-cols-4">
                  <LibraryMetric label={t("contentDrafts.contentLibrary.metrics.active")} value={activeContentCount} />
                  <LibraryMetric label={t("contentDrafts.contentLibrary.metrics.total")} value={availableContentItems.length} />
                  <LibraryMetric label={t("contentDrafts.contentLibrary.metrics.exposure")} value={exposureContentCount} />
                  <LibraryMetric
                    label={t("contentDrafts.contentLibrary.metrics.selected")}
                    value={selectedContentItem ? t("contentDrafts.contentLibrary.metrics.selectedYes") : t("contentDrafts.contentLibrary.metrics.selectedNo")}
                  />
                </div>

                {libraryOpen ? (
                  <div className="mb-4 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <label className="block space-y-2">
                        <span className="text-xs font-medium text-[#71767b]">{t("contentDrafts.contentLibrary.fields.title")}</span>
                        <input
                          value={libraryForm.title}
                          onChange={(event) => setLibraryForm((current) => ({ ...current, title: event.target.value }))}
                          placeholder={t("contentDrafts.contentLibrary.fields.titlePlaceholder")}
                          className="h-10 w-full rounded-2xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none placeholder:text-[#71767b] focus:border-[#1d9bf0]"
                        />
                      </label>
                      <label className="block space-y-2">
                        <span className="text-xs font-medium text-[#71767b]">{t("contentDrafts.contentLibrary.fields.itemType")}</span>
                        <select
                          value={libraryForm.itemType}
                          onChange={(event) => setLibraryForm((current) => ({ ...current, itemType: event.target.value as ContentLibraryItemType }))}
                          className="h-10 w-full rounded-2xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none focus:border-[#1d9bf0]"
                        >
                          {contentItemTypes.map((type) => (
                            <option key={type} value={type}>
                              {t(`contentDrafts.contentLibrary.itemType.${type}`)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="mt-3 block space-y-2">
                      <span className="text-xs font-medium text-[#71767b]">{t("contentDrafts.contentLibrary.fields.body")}</span>
                      <textarea
                        value={libraryForm.body}
                        onChange={(event) => setLibraryForm((current) => ({ ...current, body: event.target.value }))}
                        rows={4}
                        placeholder={t("contentDrafts.contentLibrary.fields.bodyPlaceholder")}
                        className="w-full resize-y rounded-2xl border border-[#2f3336] bg-black px-3 py-3 text-sm leading-6 text-[#e7e9ea] outline-none placeholder:text-[#71767b] focus:border-[#1d9bf0]"
                      />
                    </label>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <label className="block space-y-2">
                        <span className="text-xs font-medium text-white/60">{t("contentDrafts.contentLibrary.fields.topics")}</span>
                        <input
                          value={libraryForm.topics}
                          onChange={(event) => setLibraryForm((current) => ({ ...current, topics: event.target.value }))}
                          placeholder={t("contentDrafts.contentLibrary.fields.topicsPlaceholder")}
                          className="h-10 w-full rounded-2xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none placeholder:text-[#71767b] focus:border-[#1d9bf0]"
                        />
                      </label>
                      <label className="block space-y-2">
                        <span className="text-xs font-medium text-white/60">{t("contentDrafts.contentLibrary.fields.sourceUrl")}</span>
                        <input
                          value={libraryForm.sourceURL}
                          onChange={(event) => setLibraryForm((current) => ({ ...current, sourceURL: event.target.value }))}
                          placeholder={t("contentDrafts.contentLibrary.fields.sourceUrlPlaceholder")}
                          className="h-10 w-full rounded-2xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none placeholder:text-[#71767b] focus:border-[#1d9bf0]"
                        />
                      </label>
                      <label className="block space-y-2">
                        <span className="text-xs font-medium text-white/60">{t("contentDrafts.contentLibrary.fields.growthGoal")}</span>
                        <input
                          value={libraryForm.growthGoal}
                          onChange={(event) => setLibraryForm((current) => ({ ...current, growthGoal: event.target.value }))}
                          placeholder={t("contentDrafts.contentLibrary.fields.growthGoalPlaceholder")}
                          className="h-10 w-full rounded-2xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none placeholder:text-[#71767b] focus:border-[#1d9bf0]"
                        />
                      </label>
                      <label className="block space-y-2">
                        <span className="text-xs font-medium text-white/60">{t("contentDrafts.contentLibrary.fields.ctaPreference")}</span>
                        <input
                          value={libraryForm.ctaPreference}
                          onChange={(event) => setLibraryForm((current) => ({ ...current, ctaPreference: event.target.value }))}
                          placeholder={t("contentDrafts.contentLibrary.fields.ctaPreferencePlaceholder")}
                          className="h-10 w-full rounded-2xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none placeholder:text-[#71767b] focus:border-[#1d9bf0]"
                        />
                      </label>
                    </div>
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                      <label className="flex items-center gap-2 text-xs text-[#71767b]">
                        {t("contentDrafts.contentLibrary.fields.status")}
                        <select
                          value={libraryForm.status}
                          onChange={(event) => setLibraryForm((current) => ({ ...current, status: event.target.value as ContentLibraryStatus }))}
                          className="h-9 rounded-full border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none focus:border-[#1d9bf0]"
                        >
                          <option value="active">{t("contentDrafts.contentLibrary.status.active")}</option>
                          <option value="paused">{t("contentDrafts.contentLibrary.status.paused")}</option>
                        </select>
                      </label>
                      <div className="grid gap-2 sm:flex">
                        <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={resetLibraryForm}>
                          {t("common.cancel")}
                        </Button>
                        <Button type="button" className="w-full sm:w-auto" onClick={() => void saveLibraryItem()} disabled={savingLibrary}>
                          {savingLibrary ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                          {editingLibraryID ? t("contentDrafts.contentLibrary.saveEdit") : t("contentDrafts.contentLibrary.saveNew")}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {availableContentItems.length === 0 ? (
                  <div className="rounded-2xl border border-[#2f3336] bg-black px-4 py-8 text-center text-sm leading-6 text-[#71767b]">
                    <p>{t("contentDrafts.contentLibrary.empty")}</p>
                    <Button type="button" className="mt-4" size="sm" onClick={startCreateLibraryItem}>
                      {t("contentDrafts.contentLibrary.addFirst")}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <ContentLibraryExposureFilters
                      exposureFilter={contentExposureFilter}
                      regionFilter={contentRegionFilter}
                      velocityFilter={contentVelocityFilter}
                      sortMode={contentSortMode}
                      resultCount={filteredContentItems.length}
                      totalCount={availableContentItems.length}
                      onExposureFilterChange={setContentExposureFilter}
                      onRegionFilterChange={setContentRegionFilter}
                      onVelocityFilterChange={setContentVelocityFilter}
                      onSortModeChange={setContentSortMode}
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedContentItemID(0)}
                      className={`w-full rounded-xl border p-3 text-left text-sm transition ${
                        selectedContentItemID === 0 ? "border-[#1d9bf0]/55 bg-[#1d9bf0]/12 text-[#e7e9ea]" : "border-[#2f3336] bg-black text-[#71767b] hover:bg-[#16181c] hover:text-[#e7e9ea]"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span>{t("contentDrafts.contentLibrary.noSelection")}</span>
                        {selectedContentItemID === 0 ? (
                          <span className="rounded-full border border-[#1d9bf0]/35 bg-[#1d9bf0]/10 px-2 py-0.5 text-xs text-[#8ecdf8]">
                            {t("contentDrafts.contentLibrary.selectedForGenerate")}
                          </span>
                        ) : null}
                      </span>
                    </button>
                    {filteredContentItems.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-[#2f3336] bg-black px-4 py-8 text-center text-sm leading-6 text-[#71767b]">
                        {t("contentDrafts.contentLibrary.filters.empty")}
                      </div>
                    ) : null}
                    {filteredContentItems.map((item) => (
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
                                {t("contentDrafts.contentLibrary.selectedForGenerate")}
                              </span>
                            ) : null}
                            <span className="rounded-full border border-[#2f3336] bg-[#0f1419] px-2 py-0.5 text-xs text-[#71767b]">
                              {t(`contentDrafts.contentLibrary.itemType.${item.item_type}`)}
                            </span>
                            <span className={`rounded-full border px-2 py-0.5 text-xs ${item.status === "active" ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100" : "border-amber-300/20 bg-amber-500/10 text-amber-100"}`}>
                              {t(`contentDrafts.contentLibrary.status.${item.status}`)}
                            </span>
                          </div>
                          <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#e7e9ea]/70">{item.body}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#71767b]">
                            {item.topics.slice(0, 4).map((topic) => (
                              <span key={topic} className="rounded-full bg-[#0f1419] px-2 py-0.5">{topic}</span>
                            ))}
                            <span>{t("contentDrafts.contentLibrary.usageCount", { count: item.usage_count })}</span>
                            {item.last_used_at ? <span>{t("contentDrafts.contentLibrary.lastUsed", { time: formatDateTime(item.last_used_at, timeZone) })}</span> : null}
                          </div>
                        </button>
                        {selectedContentItemID === item.id ? <ContentSourceTracePanel item={item} /> : null}
                        <div className="mt-3 grid gap-2 sm:flex sm:flex-wrap sm:justify-end">
                          <Button
                            size="sm"
                            className="w-full sm:w-auto"
                            type="button"
                            onClick={() => {
                              setSelectedContentItemID(item.id);
                              openPanel("generate");
                            }}
                            disabled={item.status !== "active"}
                          >
                            <Wand2 className="size-4" />
                            {t("contentDrafts.contentLibrary.useForGenerate")}
                          </Button>
                          <Button size="sm" className="w-full sm:w-auto" variant="outline" type="button" onClick={() => editLibraryItem(item)}>
                            <Pencil className="size-4" />
                            {t("contentDrafts.contentLibrary.edit")}
                          </Button>
                          <Button size="sm" className="w-full sm:w-auto" variant="outline" type="button" onClick={() => void updateLibraryStatus(item, item.status === "active" ? "paused" : "active")}>
                            <Power className="size-4" />
                            {item.status === "active" ? t("contentDrafts.contentLibrary.pause") : t("contentDrafts.contentLibrary.activate")}
                          </Button>
                          <Button size="sm" className="w-full sm:w-auto" variant="outline" type="button" onClick={() => void deleteLibraryItem(item)}>
                            <Trash2 className="size-4" />
                            {t("contentDrafts.contentLibrary.delete")}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
              </div>
            ) : null}

            {activePanel === "generate" ? (
              <Card>
                <CardHeader title={t("contentDrafts.generate.title")} description={t("contentDrafts.generate.description")} />
                <div className="mb-4 grid gap-3 lg:grid-cols-3">
                  <WorkbenchSignal
                    icon={Database}
                    label={t("contentDrafts.generate.signal.source")}
                    title={selectedContentItem ? selectedContentItem.title : t("contentDrafts.generate.signal.manualDirection")}
                    description={selectedContentItem ? t("contentDrafts.generate.signal.sourceSelected") : t("contentDrafts.generate.signal.sourceFallback")}
                    tone="blue"
                  />
                  <WorkbenchSignal
                    icon={Bot}
                    label={t("contentDrafts.generate.signal.persona")}
                    title={selectedBot ? selectedBot.name : t("contentDrafts.bot.defaultTitle")}
                    description={selectedBot ? t("contentDrafts.generate.signal.oafBotSource") : t("contentDrafts.bot.unboundHint")}
                    tone="green"
                  />
                  <WorkbenchSignal
                    icon={ListChecks}
                    label={t("contentDrafts.generate.signal.destination")}
                    title={t("contentDrafts.generate.signal.executionQueue")}
                    description={t("contentDrafts.generate.signal.destinationDesc", { mode: t(`contentDrafts.executionMode.${selectedPlan?.execution_mode || form.executionMode}`) })}
                    tone="violet"
                  />
                </div>
                <label className="mb-4 block space-y-2">
                  <span className="text-xs font-medium text-[#71767b]">{t("contentDrafts.generate.contentItemLabel")}</span>
                  <select
                    value={selectedContentItemID}
                    onChange={(event) => setSelectedContentItemID(Number(event.target.value))}
                    className="h-11 w-full rounded-2xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none focus:border-[#1d9bf0]"
                  >
                    <option value={0}>{t("contentDrafts.generate.noContentItem")}</option>
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
                        {t("contentDrafts.generate.selectedMaterial")}
                      </span>
                      <span className="rounded-full border border-[#2f3336] bg-[#0f1419] px-2.5 py-1 text-xs text-[#71767b]">
                        {t(`contentDrafts.contentLibrary.itemType.${selectedContentItem.item_type}`)}
                      </span>
                      <span className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-100">
                        {t("contentDrafts.contentLibrary.usageCount", { count: selectedContentItem.usage_count })}
                      </span>
                    </div>
                    <p className="mt-3 line-clamp-3 break-words text-sm leading-6 text-[#e7e9ea]/78 [overflow-wrap:anywhere]">{selectedContentItem.body}</p>
                    <ContentSourceTracePanel item={selectedContentItem} compact />
                  </div>
                ) : null}
                <ExposureStrategyPanel
                  recommendation={exposureStrategyRecommendation}
                  onApply={applyExposureStrategyRecommendation}
                  onGenerate={() => void generateExposureStrategyDraft()}
                  generating={generatingExposureStrategy}
                  generateDisabled={!selectedAccountID || aiRemaining <= 0 || generating}
                />
                <label className="block space-y-2">
                  <span className="text-xs font-medium text-[#71767b]">{t("contentDrafts.generate.directionLabel")}</span>
                  <textarea
                    value={contentDirection}
                    onChange={(event) => setContentDirection(event.target.value)}
                    rows={4}
                    placeholder={t("contentDrafts.generate.directionPlaceholder")}
                    className="w-full resize-y rounded-2xl border border-[#2f3336] bg-black px-3 py-3 text-sm leading-6 text-[#e7e9ea] outline-none placeholder:text-[#71767b] focus:border-[#1d9bf0]"
                  />
                </label>
                <div className="mt-4 rounded-2xl border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 p-3 text-sm leading-6 text-[#e7e9ea]/78">
                  {selectedBot ? t("contentDrafts.generate.botHint", { bot: selectedBot.name }) : t("contentDrafts.generate.defaultHint")}
                </div>
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <p className="text-xs text-[#71767b]">{t("contentDrafts.generate.quotaHint")}</p>
                  <Button type="button" className="w-full sm:w-auto" onClick={() => void generateDraft()} disabled={generating || !selectedAccountID || aiRemaining <= 0}>
                    {generating ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                    {t("contentDrafts.actions.generateNow")}
                  </Button>
                </div>
              </Card>
            ) : null}

            {activePanel === "history" ? (
              <div className="grid gap-5 xl:grid-cols-2">
                <Card>
                <CardHeader
                  title={t("contentDrafts.drafts.title")}
                  description={t("contentDrafts.drafts.description")}
                  right={<Sparkles className="size-4 text-blue-100/70" />}
                />
                {accountDrafts.length === 0 ? (
                  <div className="rounded-2xl border border-[#2f3336] bg-black px-4 py-8 text-center text-sm text-[#71767b]">
                    {t("contentDrafts.drafts.empty")}
                  </div>
                ) : (
                  <div className="-mx-5 divide-y divide-[#2f3336] md:-mx-6">
                    {accountDrafts.map((draft) => (
                      <div key={draft.id} className="px-5 py-4 transition-colors hover:bg-[#080808] md:px-6">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-xs ${statusTone(draft.status)}`}>{t(`handlingList.status.${draft.status}`)}</span>
                          {draft.content_title ? (
                            <span className="rounded-full border border-[#2f3336] bg-[#0f1419] px-2.5 py-1 text-xs text-[#71767b]">
                              {draft.content_title}
                            </span>
                          ) : null}
                          <span className="rounded-full border border-[#2f3336] bg-[#0f1419] px-2.5 py-1 text-xs text-[#71767b]">
                            {t(`contentDrafts.executionMode.${selectedPlan?.execution_mode || form.executionMode}`)}
                          </span>
                          <span className="text-xs text-[#71767b]">{formatDateTime(draft.created_at, timeZone)}</span>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap break-words text-[15px] leading-7 text-[#e7e9ea]">{draft.generated_content}</p>
                        {draft.exposure_source_trace ? <ExposureSourceTraceBadgePanel trace={draft.exposure_source_trace} /> : null}
                        {draft.selected_trends?.length ? (
                          <TrendSourceChips
                            trends={draft.selected_trends}
                            label={t("contentDrafts.trends.usedInDraft")}
                            feedback={{ sourceType: "auto_post_draft", sourceID: draft.id, botID: draft.bot_id, xAccountID: draft.x_account_id }}
                          />
                        ) : null}
                        {draft.failure_reason ? <p className="mt-2 text-xs text-amber-100">{draft.failure_reason}</p> : null}
                        <div className="mt-3 grid gap-2 text-xs text-[#71767b] sm:grid-cols-3">
                          <DraftRouteStep label={t("contentDrafts.pipeline.material")} value={draft.content_title || t("contentDrafts.runs.noContentItem")} />
                          <DraftRouteStep label={t("contentDrafts.pipeline.queue")} value={t(`handlingList.status.${draft.status}`)} />
                          <DraftRouteStep label={t("contentDrafts.pipeline.publish")} value={draft.status === "published" ? t("contentDrafts.pipeline.published") : t("contentDrafts.pipeline.waiting")} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                </Card>

                <Card>
                <CardHeader
                  title={t("contentDrafts.runs.title")}
                  description={t("contentDrafts.runs.description")}
                  right={
                    <div className="grid gap-2 sm:flex">
                      <select
                        value={runAccountScope}
                        onChange={(event) => {
                          setRunAccountScope(event.target.value as RunAccountScope);
                          setRunPage(1);
                        }}
                        className="h-9 rounded-full border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none focus:border-[#1d9bf0]"
                        aria-label={t("contentDrafts.runs.scopeLabel")}
                      >
                        {runAccountScopes.map((scope) => (
                          <option key={scope} value={scope}>
                            {t(`contentDrafts.runs.scope.${scope}`)}
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
                            {t(`contentDrafts.runs.filter.${status}`)}
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
                        aria-label={t("contentDrafts.runs.rangeLabel")}
                      >
                        {runRangeFilters.map((range) => (
                          <option key={range} value={range}>
                            {t(`contentDrafts.runs.range.${range}`)}
                          </option>
                        ))}
                      </select>
                    </div>
                  }
                />
                {runsLoading ? (
                  <div className="flex items-center justify-center gap-2 rounded-2xl border border-[#2f3336] bg-black px-4 py-8 text-center text-sm text-[#71767b]">
                    <Loader2 className="size-4 animate-spin" />
                    {t("contentDrafts.runs.loading")}
                  </div>
                ) : accountRuns.length === 0 ? (
                  <div className="rounded-2xl border border-[#2f3336] bg-black px-4 py-8 text-center text-sm text-[#71767b]">
                    {runStatusFilter === "all" ? t("contentDrafts.runs.empty") : t("contentDrafts.runs.emptyFiltered")}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {accountRuns.map((run) => (
                      <div key={run.id} className="rounded-2xl border border-[#2f3336] bg-black p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-xs ${runTone(run.status)}`}>
                            {t(`contentDrafts.runs.status.${run.status}`)}
                          </span>
                          {runAccountScope === "all" ? (
                            <span className="rounded-full border border-[#2f3336] bg-[#0f1419] px-2.5 py-1 text-xs text-[#71767b]">
                              {run.account_handle ? `@${run.account_handle}` : t("contentDrafts.runs.accountFallback", { id: run.x_account_id })}
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
                            label={t("contentDrafts.trends.usedInRun")}
                            feedback={{ sourceType: "auto_post_run", sourceID: run.id, botID: run.bot_id, xAccountID: run.x_account_id }}
                          />
                        ) : null}
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#71767b]">
                          <span>
                            {run.content_library_item_title || run.content_title
                              ? t("contentDrafts.runs.contentItem", { title: run.content_library_item_title || run.content_title || "" })
                              : t("contentDrafts.runs.noContentItem")}
                          </span>
                          {run.generated_draft_id ? (
                            <Link href="/handling-list?type=post" className="font-semibold text-[#1d9bf0] hover:text-[#8ecdf8]">
                              {t("contentDrafts.runs.openQueue")}
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    {runTotalPages > 1 ? (
                      <div className="flex flex-col gap-2 rounded-2xl border border-[#2f3336] bg-black p-3 text-sm text-[#71767b] sm:flex-row sm:items-center sm:justify-between">
                        <span>
                          {t("contentDrafts.runs.pagination", {
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

function ContentDraftControlSummary({
  selectedAccount,
  selectedBot,
  selectedPlan,
  activeContentCount,
  queuedDraftCount,
  publishReadyCount,
  latestRun,
  aiRemaining,
  nextRunLabel,
  onOpenPanel,
}: {
  selectedAccount: AccountListItem | null;
  selectedBot: OAFBot | null;
  selectedPlan: ContentDraftPlanApi | null;
  activeContentCount: number;
  queuedDraftCount: number;
  publishReadyCount: number;
  latestRun: ContentDraftGenerationRunApi | null;
  aiRemaining: number;
  nextRunLabel: string;
  onOpenPanel: (panel: WorkbenchPanel) => void;
}) {
  const { t } = useT();
  const accountReady = Boolean(selectedAccount?.publish_ready);
  const plannerReady = Boolean(selectedPlan?.enabled);
  const needsContent = activeContentCount === 0;
  const needsPlanner = !plannerReady;
  const primaryAction = needsContent
    ? { label: t("contentDrafts.control.addContent"), panel: "content" as WorkbenchPanel }
    : needsPlanner
      ? { label: t("contentDrafts.control.configurePlanner"), panel: "planner" as WorkbenchPanel }
      : { label: t("contentDrafts.control.generateDraft"), panel: "generate" as WorkbenchPanel };
  const metrics = [
    {
      label: t("contentDrafts.control.account"),
      value: selectedAccount ? `@${selectedAccount.username || selectedAccount.display_name}` : t("contentDrafts.common.emptyValue"),
      helper: accountReady ? t("contentDrafts.control.accountReady") : t("contentDrafts.control.accountBlocked"),
    },
    {
      label: t("contentDrafts.control.bot"),
      value: selectedBot?.name || t("contentDrafts.bot.defaultTitle"),
      helper: selectedBot ? t("contentDrafts.control.botReady") : t("contentDrafts.control.botMissing"),
    },
    {
      label: t("contentDrafts.control.content"),
      value: t("contentDrafts.control.contentValue", { count: activeContentCount }),
      helper: activeContentCount > 0 ? t("contentDrafts.control.contentReady") : t("contentDrafts.control.contentMissing"),
    },
    {
      label: t("contentDrafts.control.queue"),
      value: t("contentDrafts.control.queueValue", { review: queuedDraftCount, publish: publishReadyCount }),
      helper: t("contentDrafts.control.queueHelper"),
    },
    {
      label: t("contentDrafts.control.planner"),
      value: plannerReady ? t("contentDrafts.status.enabledValue") : t("contentDrafts.status.pausedValue"),
      helper: t("contentDrafts.control.nextRun", { time: nextRunLabel }),
    },
    {
      label: t("contentDrafts.control.latestRun"),
      value: latestRun ? t(`contentDrafts.runs.status.${latestRun.status}`) : t("contentDrafts.common.emptyValue"),
      helper: t("contentDrafts.control.aiRemaining", { count: aiRemaining }),
    },
  ];

  return (
    <Card className="border-[#1d9bf0]/20 bg-[#06111d]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#d7ebff]">{t("contentDrafts.control.title")}</p>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-[#8b98a5]">{t("contentDrafts.control.description")}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => onOpenPanel(primaryAction.panel)}>
            {primaryAction.label}
          </Button>
          <Link href="/handling-list?type=post" className="inline-flex h-8 items-center justify-center rounded-full border border-[#2f3336] px-3 text-xs font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
            {t("contentDrafts.actions.openQueue")}
          </Link>
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-6">
        {metrics.map((metric) => (
          <div key={metric.label} className="min-w-0 rounded-2xl border border-[#1d9bf0]/15 bg-black/35 p-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#71767b]">{metric.label}</p>
            <p className="mt-1 truncate text-sm font-semibold text-[#e7e9ea]">{metric.value}</p>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#8b98a5]">{metric.helper}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ContentDraftTodayDraftsBridge() {
  const { t } = useT();
  return (
    <Card className="border-[#7856ff]/25 bg-[#7856ff]/10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#7856ff]/30 bg-black px-3 py-1 text-xs font-semibold text-[#b8a7ff]">
            <Sparkles className="size-3.5" />
            {t("contentDrafts.todayDrafts.kicker")}
          </div>
          <p className="mt-3 text-base font-semibold text-[#e7e9ea]">{t("contentDrafts.todayDrafts.title")}</p>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#b8a7ff]/80">{t("contentDrafts.todayDrafts.description")}</p>
        </div>
        <div className="grid gap-2 sm:flex sm:shrink-0">
          <Link href="/content-drafts?panel=generate" className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-[#1d9bf0] px-4 text-sm font-semibold text-white hover:bg-[#1a8cd8]">
            <Wand2 className="size-4" />
            {t("contentDrafts.todayDrafts.open")}
          </Link>
          <Link href="/handling-list?type=post" className="inline-flex h-9 items-center justify-center rounded-full border border-[#2f3336] px-4 text-sm font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
            {t("contentDrafts.actions.openQueue")}
          </Link>
        </div>
      </div>
    </Card>
  );
}

function ContentDraftSetupGuide({
  hasAccount,
  hasActiveContent,
  plannerEnabled,
  handlingModeReady,
  onOpenPanel,
}: {
  hasAccount: boolean;
  hasActiveContent: boolean;
  plannerEnabled: boolean;
  handlingModeReady: boolean;
  onOpenPanel: (panel: WorkbenchPanel) => void;
}) {
  const { t } = useT();
  const checks = [
    {
      done: hasAccount,
      title: t("contentDrafts.setup.account.title"),
      description: t("contentDrafts.setup.account.description"),
      action: null,
    },
    {
      done: hasActiveContent,
      title: t("contentDrafts.setup.content.title"),
      description: t("contentDrafts.setup.content.description"),
      action: { label: t("contentDrafts.setup.actions.addContent"), panel: "content" as WorkbenchPanel },
    },
    {
      done: plannerEnabled,
      title: t("contentDrafts.setup.planner.title"),
      description: t("contentDrafts.setup.planner.description"),
      action: { label: t("contentDrafts.setup.actions.openPlanner"), panel: "planner" as WorkbenchPanel },
    },
    {
      done: handlingModeReady,
      title: t("contentDrafts.setup.autopilot.title"),
      description: t("contentDrafts.setup.autopilot.description"),
      action: { label: t("contentDrafts.setup.actions.setAutopilot"), panel: "planner" as WorkbenchPanel },
    },
  ];
  const missing = checks.filter((item) => !item.done);
  const primaryAction = missing.find((item) => item.action)?.action;

  return (
    <Card className={missing.length === 0 ? "border-[#00ba7c]/25 bg-[#00ba7c]/10" : "border-amber-300/20 bg-amber-500/10"}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#e7e9ea]">
            {missing.length === 0 ? t("contentDrafts.setup.readyTitle") : t("contentDrafts.setup.title")}
          </p>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#71767b]">
            {missing.length === 0 ? t("contentDrafts.setup.readyDescription") : t("contentDrafts.setup.description")}
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

function ContentDraftPipelineSummary({
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
  selectedPlan: ContentDraftPlanApi | null;
  queuedDraftCount: number;
  publishReadyCount: number;
  latestRun?: ContentDraftGenerationRunApi | null;
  onOpenPanel: (panel: WorkbenchPanel) => void;
}) {
  const { t } = useT();
  const steps = [
    {
      id: "material" as const,
      icon: Database,
      title: t("contentDrafts.pipeline.material"),
      value: selectedContentItem ? selectedContentItem.title : t("contentDrafts.pipeline.materialValue", { count: activeContentCount }),
      description: t("contentDrafts.pipeline.materialDesc"),
      panel: "content" as WorkbenchPanel,
      tone: "border-[#1d9bf0]/35 bg-[#1d9bf0]/10 text-[#8ecdf8]",
    },
    {
      id: "generate" as const,
      icon: Wand2,
      title: t("contentDrafts.pipeline.generate"),
      value: latestRun ? t(`contentDrafts.runs.status.${latestRun.status}`) : t("contentDrafts.pipeline.generateValue"),
      description: t("contentDrafts.pipeline.generateDesc"),
      panel: "generate" as WorkbenchPanel,
      tone: "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]",
    },
    {
      id: "queue" as const,
      icon: ListChecks,
      title: t("contentDrafts.pipeline.queue"),
      value: t("contentDrafts.pipeline.queueValue", { count: queuedDraftCount }),
      description: t("contentDrafts.pipeline.queueDesc"),
      panel: "history" as WorkbenchPanel,
      tone: "border-[#7856ff]/30 bg-[#7856ff]/12 text-[#b8a7ff]",
    },
    {
      id: "publish" as const,
      icon: Send,
      title: t("contentDrafts.pipeline.publish"),
      value: selectedPlan ? t("contentDrafts.pipeline.publishValue", { count: publishReadyCount }) : t("contentDrafts.status.notConfigured"),
      description: t("contentDrafts.pipeline.publishDesc"),
      panel: "planner" as WorkbenchPanel,
      tone: "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]",
    },
  ];

  return (
    <Card className="bg-[#0f1419]">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("contentDrafts.pipeline.title")}</p>
          <p className="mt-1 text-sm leading-6 text-[#71767b]">{t("contentDrafts.pipeline.description")}</p>
        </div>
        <Link href="/handling-list?type=post" className="text-sm font-semibold text-[#1d9bf0] hover:text-[#8ecdf8]">
          {t("contentDrafts.actions.openQueue")}
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

function ContentLibraryExposureFilters({
  exposureFilter,
  regionFilter,
  velocityFilter,
  sortMode,
  resultCount,
  totalCount,
  onExposureFilterChange,
  onRegionFilterChange,
  onVelocityFilterChange,
  onSortModeChange,
}: {
  exposureFilter: ContentExposureFilter;
  regionFilter: ContentRegionFilter;
  velocityFilter: ContentVelocityFilter;
  sortMode: ContentSortMode;
  resultCount: number;
  totalCount: number;
  onExposureFilterChange: (value: ContentExposureFilter) => void;
  onRegionFilterChange: (value: ContentRegionFilter) => void;
  onVelocityFilterChange: (value: ContentVelocityFilter) => void;
  onSortModeChange: (value: ContentSortMode) => void;
}) {
  const { t } = useT();
  const resetDisabled = exposureFilter === "all" && regionFilter === "all" && velocityFilter === "all" && sortMode === "default";
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("contentDrafts.contentLibrary.filters.title")}</p>
          <p className="mt-1 text-xs text-[#71767b]">{t("contentDrafts.contentLibrary.filters.result", { count: resultCount, total: totalCount })}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={resetDisabled}
          onClick={() => {
            onExposureFilterChange("all");
            onRegionFilterChange("all");
            onVelocityFilterChange("all");
            onSortModeChange("default");
          }}
        >
          {t("contentDrafts.contentLibrary.filters.reset")}
        </Button>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <ContentLibraryFilterSelect
          label={t("contentDrafts.contentLibrary.filters.source")}
          value={exposureFilter}
          options={contentExposureFilters}
          labelFor={(value) => t(`contentDrafts.contentLibrary.filters.source.${value}`)}
          onChange={(value) => onExposureFilterChange(value as ContentExposureFilter)}
        />
        <ContentLibraryFilterSelect
          label={t("contentDrafts.contentLibrary.filters.region")}
          value={regionFilter}
          options={contentRegionFilters}
          labelFor={(value) => t(`contentDrafts.contentLibrary.filters.region.${value}`)}
          onChange={(value) => onRegionFilterChange(value as ContentRegionFilter)}
        />
        <ContentLibraryFilterSelect
          label={t("contentDrafts.contentLibrary.filters.velocity")}
          value={velocityFilter}
          options={contentVelocityFilters}
          labelFor={(value) => t(`contentDrafts.contentLibrary.filters.velocity.${value}`)}
          onChange={(value) => onVelocityFilterChange(value as ContentVelocityFilter)}
        />
        <ContentLibraryFilterSelect
          label={t("contentDrafts.contentLibrary.filters.sort")}
          value={sortMode}
          options={contentSortModes}
          labelFor={(value) => t(`contentDrafts.contentLibrary.filters.sort.${value}`)}
          onChange={(value) => onSortModeChange(value as ContentSortMode)}
        />
      </div>
    </div>
  );
}

function ContentLibraryFilterSelect<T extends string>({
  label,
  value,
  options,
  labelFor,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  labelFor: (value: T) => string;
  onChange: (value: T) => void;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-[#71767b]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="h-10 w-full rounded-2xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none focus:border-[#1d9bf0]"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labelFor(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function ExposureStrategyPanel({
  recommendation,
  onApply,
  onGenerate,
  generating,
  generateDisabled,
}: {
  recommendation: ExposureStrategyRecommendation | null;
  onApply: () => void;
  onGenerate: () => void;
  generating: boolean;
  generateDisabled: boolean;
}) {
  const { t } = useT();
  if (!recommendation) {
    return (
      <div className="mb-4 rounded-2xl border border-dashed border-[#2f3336] bg-black px-4 py-5 text-sm leading-6 text-[#71767b]">
        <p className="font-semibold text-[#e7e9ea]">{t("contentDrafts.generate.strategy.title")}</p>
        <p className="mt-1">{t("contentDrafts.generate.strategy.empty")}</p>
      </div>
    );
  }
  return (
    <div className="mb-4 rounded-2xl border border-[#00ba7c]/25 bg-[#00ba7c]/10 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#00ba7c]/30 bg-black px-2.5 py-1 text-xs font-semibold text-[#7ee0b5]">
              <Sparkles className="size-3.5" />
              {t("contentDrafts.generate.strategy.title")}
            </span>
            <span className="rounded-full border border-[#2f3336] bg-black px-2.5 py-1 text-xs text-[#8b98a5]">
              {t("contentDrafts.generate.strategy.score", { score: recommendation.averageScore })}
            </span>
          </div>
          <h3 className="mt-3 break-words text-sm font-semibold text-[#e7e9ea] [overflow-wrap:anywhere]">{recommendation.title}</h3>
          <p className="mt-2 text-sm leading-6 text-[#c9d1d9]">{recommendation.summary || t("contentDrafts.generate.strategy.summaryFallback")}</p>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:flex-row lg:w-auto lg:flex-col">
          <Button type="button" className="w-full" onClick={onGenerate} disabled={generateDisabled || generating}>
            {generating ? <Loader2 className="size-4 animate-spin" /> : <ListChecks className="size-4" />}
            {t("contentDrafts.generate.strategy.queueDraft")}
          </Button>
          <Button type="button" className="w-full" variant="outline" onClick={onApply} disabled={generating}>
            <Wand2 className="size-4" />
            {t("contentDrafts.generate.strategy.apply")}
          </Button>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {recommendation.regions.map((region) => (
          <span key={region} className="rounded-full border border-[#2f3336] bg-black px-2.5 py-1 text-xs text-[#8b98a5]">
            {t("contentDrafts.generate.strategy.region", { region })}
          </span>
        ))}
        {recommendation.topics.map((topic) => (
          <span key={topic} className="rounded-full border border-[#2f3336] bg-black px-2.5 py-1 text-xs text-[#8b98a5]">
            {topic}
          </span>
        ))}
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-3">
        {recommendation.items.map((item, index) => {
          const trace = parseContentSourceTrace(item);
          return (
            <div key={item.id} className="rounded-xl border border-[#2f3336] bg-black px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-normal text-[#71767b]">{t("contentDrafts.generate.strategy.memoryRank", { rank: index + 1 })}</p>
              <p className="mt-1 line-clamp-2 text-sm font-semibold text-[#e7e9ea]">{trace?.signalTitle || item.title}</p>
              <p className="mt-1 text-xs text-[#71767b]">
                {t("contentDrafts.generate.strategy.memoryMeta", { score: trace?.score || "-", velocity: trace?.velocity || "-" })}
              </p>
            </div>
          );
        })}
      </div>
      <div className="mt-3 rounded-xl border border-[#2f3336] bg-black px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-normal text-[#71767b]">{t("contentDrafts.generate.strategy.directionPreview")}</p>
        <p className="mt-1 whitespace-pre-line text-sm leading-6 text-[#c9d1d9]">{recommendation.direction}</p>
      </div>
    </div>
  );
}

type ContentSourceTrace = {
  kind: "radar" | "brief";
  signalTitle: string;
  summary: string;
  whyItMatters: string;
  suggestedAction: string;
  bestUse: string;
  region: string;
  score: string;
  velocity: string;
  risk: string;
  quality: string;
  sourceURL: string;
};

function ContentSourceTracePanel({ item, compact = false }: { item: ContentLibraryItemApi; compact?: boolean }) {
  const { t } = useT();
  const trace = parseContentSourceTrace(item);
  if (!trace) return null;
  const metrics = [
    { label: t("contentDrafts.contentLibrary.sourceTrace.region"), value: trace.region },
    { label: t("contentDrafts.contentLibrary.sourceTrace.score"), value: trace.score },
    { label: t("contentDrafts.contentLibrary.sourceTrace.velocity"), value: trace.velocity },
    { label: t("contentDrafts.contentLibrary.sourceTrace.risk"), value: trace.risk },
    { label: t("contentDrafts.contentLibrary.sourceTrace.quality"), value: trace.quality },
  ].filter((metric) => metric.value);

  return (
    <div className={`${compact ? "mt-3" : "mt-4"} rounded-2xl border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 p-3`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#1d9bf0]/35 bg-[#1d9bf0]/10 px-2.5 py-1 text-xs font-semibold text-[#8ecdf8]">
              {t("contentDrafts.contentLibrary.sourceTrace.title")}
            </span>
            <span className="rounded-full border border-[#2f3336] bg-black px-2.5 py-1 text-xs text-[#8b98a5]">
              {t(`contentDrafts.contentLibrary.sourceTrace.kind.${trace.kind}`)}
            </span>
          </div>
          <p className="mt-2 break-words text-sm font-semibold text-[#e7e9ea] [overflow-wrap:anywhere]">{trace.signalTitle || item.title}</p>
        </div>
        {trace.sourceURL ? (
          <a href={trace.sourceURL} target="_blank" rel="noreferrer" className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-[#2f3336] bg-black px-3 text-xs font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
            {t("contentDrafts.contentLibrary.sourceTrace.openSource")}
            <ExternalLink className="size-3.5" />
          </a>
        ) : null}
      </div>
      {metrics.length ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-xl border border-[#2f3336] bg-black px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-normal text-[#71767b]">{metric.label}</p>
              <p className="mt-1 break-words text-sm font-semibold text-[#e7e9ea] [overflow-wrap:anywhere]">{metric.value}</p>
            </div>
          ))}
        </div>
      ) : null}
      {trace.summary ? (
        <div className="mt-3 rounded-xl border border-[#2f3336] bg-black px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-normal text-[#71767b]">{t("contentDrafts.contentLibrary.sourceTrace.summary")}</p>
          <p className="mt-1 text-sm leading-6 text-[#c9d1d9]">{trace.summary}</p>
        </div>
      ) : null}
      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        {trace.whyItMatters ? (
          <div className="rounded-xl border border-[#2f3336] bg-black px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-normal text-[#71767b]">{t("contentDrafts.contentLibrary.sourceTrace.why")}</p>
            <p className="mt-1 text-sm leading-6 text-[#c9d1d9]">{trace.whyItMatters}</p>
          </div>
        ) : null}
        {trace.suggestedAction ? (
          <div className="rounded-xl border border-[#2f3336] bg-black px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-normal text-[#71767b]">{t("contentDrafts.contentLibrary.sourceTrace.action")}</p>
            <p className="mt-1 text-sm leading-6 text-[#c9d1d9]">{trace.suggestedAction}</p>
          </div>
        ) : null}
        {trace.bestUse ? (
          <div className="rounded-xl border border-[#2f3336] bg-black px-3 py-2 lg:col-span-2">
            <p className="text-[11px] font-semibold uppercase tracking-normal text-[#71767b]">{t("contentDrafts.contentLibrary.sourceTrace.bestUse")}</p>
            <p className="mt-1 text-sm leading-6 text-[#c9d1d9]">{trace.bestUse}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ExposureSourceTraceBadgePanel({ trace }: { trace: ExposureSourceTraceApi }) {
  const { t } = useT();
  const metrics = [
    { label: t("contentDrafts.contentLibrary.sourceTrace.region"), value: trace.region },
    { label: t("contentDrafts.contentLibrary.sourceTrace.score"), value: trace.score },
    { label: t("contentDrafts.contentLibrary.sourceTrace.velocity"), value: trace.velocity },
    { label: t("contentDrafts.contentLibrary.sourceTrace.risk"), value: trace.risk },
  ].filter((metric) => metric.value);
  return (
    <div className="mt-3 rounded-2xl border border-[#1d9bf0]/25 bg-[#06111d] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#1d9bf0]/35 bg-[#1d9bf0]/10 px-2.5 py-1 text-xs font-semibold text-[#8ecdf8]">
              {t("contentDrafts.contentLibrary.sourceTrace.title")}
            </span>
            <span className="rounded-full border border-[#2f3336] bg-black px-2.5 py-1 text-xs text-[#8b98a5]">
              {t(`contentDrafts.contentLibrary.sourceTrace.kind.${trace.kind === "brief" ? "brief" : "radar"}`)}
            </span>
          </div>
          <p className="mt-2 break-words text-sm font-semibold text-[#e7e9ea] [overflow-wrap:anywhere]">{trace.signal_title}</p>
        </div>
        {trace.source_url ? (
          <a href={trace.source_url} target="_blank" rel="noreferrer" className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-[#2f3336] bg-black px-3 text-xs font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
            {t("contentDrafts.contentLibrary.sourceTrace.openSource")}
            <ExternalLink className="size-3.5" />
          </a>
        ) : null}
      </div>
      {metrics.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {metrics.map((metric) => (
            <span key={metric.label} className="rounded-full border border-[#2f3336] bg-black px-2.5 py-1 text-xs text-[#8b98a5]">
              <span className="text-[#71767b]">{metric.label}: </span>
              <span className="text-[#cfd9e2]">{metric.value}</span>
            </span>
          ))}
        </div>
      ) : null}
      {trace.suggested_action ? (
        <p className="mt-2 text-xs leading-5 text-[#8b98a5]">
          <span className="font-semibold text-[#cfd9e2]">{t("contentDrafts.contentLibrary.sourceTrace.action")}:</span> {trace.suggested_action}
        </p>
      ) : null}
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
            <p className="text-sm font-semibold text-[#e7e9ea]">{t("contentDrafts.fields.postingWindows")}</p>
          </div>
          <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("contentDrafts.fields.postingWindowsHelper")}</p>
        </div>
        <button type="button" onClick={onClear} className="text-xs font-semibold text-[#1d9bf0] hover:underline">
          {t("contentDrafts.fields.postingWindowsClear")}
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
            {t(`contentDrafts.postingWindowPreset.${preset.key}`)}
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
        <p className="text-[11px] uppercase tracking-wide text-[#71767b]">{t("contentDrafts.fields.postingWindowsSelected")}</p>
        <p className="mt-1 break-words text-sm text-[#e7e9ea]">{value || t("contentDrafts.fields.postingWindowsNoLimit")}</p>
      </div>
    </div>
  );
}

function formFromPlan(plan: ContentDraftPlanApi): PlannerForm {
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
  return values.map((value) => t(`contentDrafts.trends.region.${value}`)).join(", ");
}

function formatTrendCategories(categories: string[], t: (key: string, params?: Record<string, string | number>) => string) {
  if (!categories.length) return t("contentDrafts.trends.allCategories");
  return categories.map((value) => t(`contentDrafts.trends.category.${value}`)).join(", ");
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
          <p className="text-xs font-medium text-[#71767b]">{t("contentDrafts.trends.feedbackPanel.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("contentDrafts.trends.feedbackPanel.description")}</p>
        </div>
        <Button type="button" size="sm" variant="outline" className="h-8" disabled={loading} onClick={() => void onRefresh()}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {t("contentDrafts.trends.feedbackPanel.refresh")}
        </Button>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <TrendFeedbackMetric label={t("contentDrafts.trends.feedbackPanel.total")} value={summary?.total || 0} />
        <TrendFeedbackMetric label={t("contentDrafts.trends.feedback.irrelevant")} value={summary?.irrelevant || 0} />
        <TrendFeedbackMetric label={t("contentDrafts.trends.feedback.tooForced")} value={summary?.too_forced || 0} />
      </div>
      {loading ? (
        <p className="mt-3 text-sm text-[#71767b]">{t("contentDrafts.trends.feedbackPanel.loading")}</p>
      ) : items.length ? (
        <div className="mt-3 grid gap-2">
          {items.slice(0, 8).map((item) => (
            <div key={item.id} className="flex flex-col gap-2 rounded-xl border border-[#2f3336] bg-[#0f1419] p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-[#e7e9ea]">{item.trend_name}</span>
                  <span className="rounded-full border border-amber-300/25 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-100">
                    {t(`contentDrafts.trends.feedback.${item.rating === "too_forced" ? "tooForced" : "irrelevant"}`)}
                  </span>
                  {item.category ? (
                    <span className="rounded-full border border-[#2f3336] bg-black px-2 py-0.5 text-[11px] text-[#71767b]">
                      {t(`contentDrafts.trends.category.${item.category}`)}
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
                {clearingID === item.id ? t("contentDrafts.trends.feedbackPanel.clearing") : t("contentDrafts.trends.feedbackPanel.clear")}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2 text-sm text-[#71767b]">
          {t("contentDrafts.trends.feedbackPanel.empty")}
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
      await contentDraftService.submitTrendFeedback({
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
      pushToast(t("contentDrafts.trends.feedbackSaved"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("contentDrafts.trends.feedbackFailed") : t("contentDrafts.trends.feedbackFailed"));
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
              <span className="text-[#71767b]">{t(`contentDrafts.trends.category.${trend.category}`)}</span>
            </div>
            {trend.relevance_reason ? (
              <p className="mt-1 break-words leading-5 text-[#8b98a5]">
                {t("contentDrafts.trends.reasonPrefix")} {trend.relevance_reason}
              </p>
            ) : null}
            {trend.matched_keywords?.length ? (
              <p className="mt-1 break-words leading-5 text-[#71767b]">
                {t("contentDrafts.trends.keywordsPrefix")} {trend.matched_keywords.join(", ")}
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
    { rating: "relevant", label: t("contentDrafts.trends.feedback.relevant") },
    { rating: "irrelevant", label: t("contentDrafts.trends.feedback.irrelevant") },
    { rating: "too_forced", label: t("contentDrafts.trends.feedback.tooForced") },
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
            {loading ? t("contentDrafts.trends.feedback.saving") : option.label}
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
