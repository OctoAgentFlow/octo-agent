"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import axios from "axios";
import Link from "next/link";
import { Activity, ArrowRight, BarChart3, Bookmark, BookmarkPlus, Bot, CalendarClock, CheckCircle2, Clipboard, Clock3, Database, ExternalLink, Eye, FileText, Flame, Gauge, Heart, Info, MessageCircle, MessageSquarePlus, Quote, RefreshCw, Repeat2, Search, ShieldAlert, SlidersHorizontal, Sparkles, Target, TrendingUp, Users, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { broadcastPageRefreshComplete, subscribePageRefreshRequest } from "@/lib/app-page-refresh";
import { formatDateTime, usePreferredTimeZone } from "@/lib/timezone";
import { accountService, type AccountListItem } from "@/services/account.service";
import { contentDraftService, type ContentDraftApi, type ContentDraftPlanApi } from "@/services/content-draft.service";
import { contentLibraryService, type ContentLibraryItemPayload } from "@/services/content-library.service";
import { exposureRadarService, type ExposureRadarArchiveData, type ExposureRadarData, type ExposureRadarDiagnosticIssueApi, type ExposureRadarDiagnosticsApi, type ExposureRadarGrowthStrategyApi, type ExposureRadarItemApi, type ExposureRadarManualRecordApi, type ExposureRadarManualRecordPayload, type ExposureRadarPeopleItemApi, type ExposureRadarPerformanceData, type ExposureRadarRegion, type ExposureRadarResultRefreshApi, type ExposureRadarSafetyCenterData, type ExposureRadarSafetyCheckApi, type ExposureRadarWeeklyReviewData } from "@/services/exposure-radar.service";
import { oafBotService } from "@/services/oaf-bot.service";
import type { OAFBot } from "@/types/oaf-bot";

type LoadState = "loading" | "ready" | "error";
type MaybePromise<T> = T | Promise<T>;
type RankChange = { kind: "new" | "up" | "down"; delta?: number };
type RadarViewFilter = "priority" | "all" | "act_now" | "watch" | "expired" | "hot" | "rising" | "sampling" | "topic" | "tweet" | "high_score" | "needs_review" | "saved" | "drafted" | "pending_handling" | "handled" | "backfilled";
type ManualOutcome = "effective" | "neutral" | "ineffective" | "not_suitable";
type LeaderboardStatus = "new" | "burst" | "rising" | "steady" | "cooling" | "unknown";
type LeaderboardStats = Record<LeaderboardStatus, number> & { newCount: number; movers: number };
type WorkbenchStats = { pending: number; actNow: number; handled: number };
type DailyDeskFocusKey = "setup" | "strategy" | "handle" | "backfill" | "review";
type SignalQualityStatus = "ready" | "warming" | "empty" | "limited";
type DailyActionType = "publish_reply" | "generate_reply" | "save_memory" | "inspect" | "review_fit";
type DailyActionReason = "generated" | "quality" | "expired" | "velocity" | "low_fans" | "learned" | "risk" | "topic" | "score";
type DailyActionPlanItem = {
  item: ExposureRadarItemApi;
  action: DailyActionType;
  reason: DailyActionReason;
  priority: number;
};
type ExposureLearningProfile = {
  boostedTopics: Set<string>;
  cautiousTopics: Set<string>;
  preferredAngles: Set<string>;
};
type ContentDraftBridgeData = {
  plans: ContentDraftPlanApi[];
  drafts: ContentDraftApi[];
};
type LearningImpactRow = {
  label: string;
  detail: string;
  tone: "positive" | "negative" | "neutral";
};
type DailyTaskStatus = "todo" | "in_progress" | "done" | "skipped" | "later";
type FirstDayStepKey = "account" | "strategy" | "queue" | "result";
type PeopleRadarStage = "priority" | "repeat" | "engaged" | "watch" | "avoid" | "new";
type PeopleRadarEntry = {
  key: string;
  name: string;
  handle?: string;
  count: number;
  handled: number;
  drafted: number;
  saved: number;
  maxScore: number;
  totalEngagement: number;
  followers?: number;
  stage: PeopleRadarStage;
  latestItem: ExposureRadarItemApi;
  persisted?: boolean;
  feedback?: number;
  crmStage?: string;
  notes?: string;
  tags?: string[];
  lastInteractionAt?: string;
};
type OpportunityExplanation = {
  fit: string;
  reasons: string[];
  angles: string[];
  avoid: string[];
};
type SignalDecisionSummary = {
  mode: "act_now" | "watch" | "research" | "skip";
  title: string;
  detail: string;
  proof: string[];
};
type ReplyAngleID = "operatorObservation" | "lightQuestion" | "peerExperience" | "cautionNote" | "topicResearch";
type ReplyAngleSuggestion = {
  id: ReplyAngleID;
  title: string;
  description: string;
  prompt: string;
  tone: string;
};
type ReplyPlan = {
  bestFor: string;
  steps: string[];
  safety: string[];
  readyNote: string;
};
type SafetyReviewStatus = "pass" | "watch" | "block";
type SafetyReviewCheck = {
  key: string;
  status: SafetyReviewStatus;
  title: string;
  detail: string;
};
type SafetyReview = {
  status: SafetyReviewStatus;
  summary: string;
  checks: SafetyReviewCheck[];
};
type ReplyAngleGenerationGuide = { label: string; tone: string; instruction: string };
type ManualActionState = {
  copied?: boolean;
  opened?: boolean;
  saved?: boolean;
  handled?: boolean;
  persisted?: boolean;
  publishedUrl?: string;
  outcome?: ManualOutcome;
  feedbackComment?: string;
  feedbackAt?: string;
  taskStatus?: DailyTaskStatus;
  safetyStatus?: SafetyReviewStatus;
  safetySummary?: string;
  replyAngleID?: string;
  replyAngleTitle?: string;
  resultImpressionCount?: number;
  resultLikeCount?: number;
  resultReplyCount?: number;
  resultRetweetCount?: number;
  resultQuoteCount?: number;
  resultBookmarkCount?: number;
  resultNotes?: string;
  resultScore?: number;
  resultCheckedAt?: string;
  updatedAt?: string;
};

type StrategyFormState = {
  targetAudience: string;
  primaryGoal: string;
  coreTopics: string;
  avoidTopics: string;
  competitors: string;
  replyStyle: string;
  dailyMoveLimit: number;
  safetyMode: string;
  operatorNotes: string;
};
type StarterStrategyTemplate = {
  key: string;
  form: StrategyFormState;
};

const hourOptions = [1, 2, 4, 8];
const fanOptions = [5000, 10000, 20000, 50000, 100000];
const hotCountOptions = [0, 2, 3, 5, 10];
const radarViewFilters: RadarViewFilter[] = ["priority", "all", "act_now", "watch", "expired", "hot", "rising", "sampling", "topic", "tweet", "high_score", "needs_review", "saved", "drafted", "pending_handling", "handled", "backfilled"];
const manualOutcomeOptions: ManualOutcome[] = ["effective", "neutral", "ineffective", "not_suitable"];
const manualOutcomeFeedbackMeta: Record<ManualOutcome, { rating: "positive" | "negative"; issueTags: string[] }> = {
  effective: { rating: "positive", issueTags: ["effective", "good"] },
  neutral: { rating: "negative", issueTags: ["neutral"] },
  ineffective: { rating: "negative", issueTags: ["ineffective", "irrelevant"] },
  not_suitable: { rating: "negative", issueTags: ["not_suitable", "irrelevant"] },
};
const replyAngleGenerationGuides: Record<ReplyAngleID, ReplyAngleGenerationGuide> = {
  operatorObservation: {
    label: "Operator observation",
    tone: "concrete viewpoint",
    instruction: "Anchor on one specific detail from the post, then add one short, verifiable operator or builder observation. Do not turn it into a product pitch.",
  },
  lightQuestion: {
    label: "Light question",
    tone: "low-pressure question",
    instruction: "Ask one natural question about a detail in the post. Keep it light, not interrogative, and do not steer the thread into the product.",
  },
  peerExperience: {
    label: "Peer experience",
    tone: "peer-to-peer experience",
    instruction: "Respond to the author's point first, then add one short experience or caution that fits their context. Talk less about yourself.",
  },
  cautionNote: {
    label: "Caution note",
    tone: "careful boundary",
    instruction: "Add one conservative reminder, condition, or boundary. Avoid exaggerated claims, sensitive judgments, and unverified facts.",
  },
  topicResearch: {
    label: "Find a specific post first",
    tone: "research first",
    instruction: "This is a topic-level lead. Do not conclude from the topic alone; find a specific post first, then write a short contextual reply.",
  },
};
const radarRankStorageKeyPrefix = "oaf:exposure-radar:ranks";
const radarManualActionStorageKey = "oaf:exposure-radar:manual-actions:v1";

export default function ExposureRadarPage() {
  const { t } = useT();
  const { pushToast } = useToast();
  const timeZone = usePreferredTimeZone();
  const [region, setRegion] = useState<ExposureRadarRegion>("zh");
  const [hours, setHours] = useState(4);
  const [maxFans, setMaxFans] = useState(10000);
  const [minHotCount, setMinHotCount] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [data, setData] = useState<ExposureRadarData | null>(null);
  const [performance, setPerformance] = useState<ExposureRadarPerformanceData | null>(null);
  const [archive, setArchive] = useState<ExposureRadarArchiveData | null>(null);
  const [growthStrategy, setGrowthStrategy] = useState<ExposureRadarGrowthStrategyApi | null>(null);
  const [weeklyReview, setWeeklyReview] = useState<ExposureRadarWeeklyReviewData | null>(null);
  const [safetyCenter, setSafetyCenter] = useState<ExposureRadarSafetyCenterData | null>(null);
  const [recentManualRecords, setRecentManualRecords] = useState<ExposureRadarManualRecordApi[]>([]);
  const [contentDraftBridge, setContentDraftBridge] = useState<ContentDraftBridgeData>({ plans: [], drafts: [] });
  const [contentDraftBridgeLoading, setContentDraftBridgeLoading] = useState(false);
  const [resultRefreshing, setResultRefreshing] = useState(false);
  const [resultRefreshSummary, setResultRefreshSummary] = useState<ExposureRadarResultRefreshApi | null>(null);
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [bots, setBots] = useState<OAFBot[]>([]);
  const [selectedAccountID, setSelectedAccountID] = useState(0);
  const [selectedBotID, setSelectedBotID] = useState(0);
  const [draftingID, setDraftingID] = useState<string | null>(null);
  const [handlingID, setHandlingID] = useState<string | null>(null);
  const [feedbackSavingID, setFeedbackSavingID] = useState<string | null>(null);
  const [savingMemoryID, setSavingMemoryID] = useState<string | null>(null);
  const [savingSeedID, setSavingSeedID] = useState<string | null>(null);
  const [generatingSeedDraftID, setGeneratingSeedDraftID] = useState<string | null>(null);
  const [radarView, setRadarView] = useState<RadarViewFilter>("priority");
  const [savedMemoryIDs, setSavedMemoryIDs] = useState<Set<string>>(() => new Set());
  const [manualActionStates, setManualActionStates] = useState<Record<string, ManualActionState>>({});
  const [manualActionsHydrated, setManualActionsHydrated] = useState(false);
  const [persistedPeople, setPersistedPeople] = useState<ExposureRadarPeopleItemApi[]>([]);
  const [activeWorkbenchID, setActiveWorkbenchID] = useState("");
  const [selectedReplyAngleIDs, setSelectedReplyAngleIDs] = useState<Record<string, string>>({});
  const [strategySaving, setStrategySaving] = useState(false);
  const [peopleNoteSavingKey, setPeopleNoteSavingKey] = useState("");
  const previousRanksRef = useRef<Map<string, number>>(new Map());
  const [rankChanges, setRankChanges] = useState<Map<string, RankChange>>(new Map());
  const [lastRefreshedAt, setLastRefreshedAt] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const nextRegion = params.get("region");
    if (nextRegion === "zh" || nextRegion === "en") setRegion(nextRegion);
    setHours((current) => getPositiveParam(params, "hours", current));
    setMaxFans((current) => getPositiveParam(params, "max_fans", getPositiveParam(params, "maxFans", current)));
    setMinHotCount((current) => getNonNegativeParam(params, "min_hot_count", getNonNegativeParam(params, "minHotCount", current)));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("region", region);
    params.set("hours", String(hours));
    params.set("max_fans", String(maxFans));
    params.set("min_hot_count", String(minHotCount));
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [hours, maxFans, minHotCount, region]);

  useEffect(() => {
    setManualActionStates(readManualActionStates());
    setManualActionsHydrated(true);
  }, []);

  useEffect(() => {
    if (!manualActionsHydrated) return;
    writeManualActionStates(manualActionStates);
  }, [manualActionStates, manualActionsHydrated]);

  const updateManualActionState = useCallback((itemID: string, patch: Partial<ManualActionState>) => {
    setManualActionStates((current) => ({
      ...current,
      [itemID]: {
        ...(current[itemID] || {}),
        ...patch,
        updatedAt: new Date().toISOString(),
      },
    }));
  }, []);
  const updateSelectedReplyAngle = useCallback((itemID: string, angleID: string) => {
    setSelectedReplyAngleIDs((current) => ({ ...current, [itemID]: angleID }));
  }, []);

  const recordManualAction = useCallback((item: ExposureRadarItemApi, patch: Partial<ManualActionState>, replyAngle?: ReplyAngleSuggestion) => {
    const selectedReplyAngle = replyAngle || selectedReplyAngleForItem(item, selectedReplyAngleIDs, t);
    const safetyReview = buildSafetyReview(item, selectedReplyAngle, t);
    const nextPatch: Partial<ManualActionState> = {
      ...patch,
      safetyStatus: safetyReview.status,
      safetySummary: safetyReview.summary,
      replyAngleID: selectedReplyAngle?.id,
      replyAngleTitle: selectedReplyAngle?.title,
    };
    updateManualActionState(item.id, nextPatch);
    void exposureRadarService.upsertManualRecord(buildManualRecordPayload(item, {
      selectedAccountID,
      selectedBotID,
      patch: nextPatch,
      safetyReview,
      replyAngle: selectedReplyAngle,
    })).then((record) => {
      setManualActionStates((current) => mergeManualRecordStates(current, [record]));
    }).catch(() => {
      updateManualActionState(item.id, { persisted: false });
      pushToast(t("exposureRadar.manualAction.persistFailed"));
    });
  }, [pushToast, selectedAccountID, selectedBotID, selectedReplyAngleIDs, t, updateManualActionState]);

  const hydrateManualWorkspace = useCallback(async (nextItems: ExposureRadarItemApi[]) => {
    try {
      const [records, people] = await Promise.all([
        exposureRadarService.listManualRecords(nextItems.map((item) => item.id)),
        exposureRadarService.people({ region, days: 30, limit: 30 }),
      ]);
      setManualActionStates((current) => mergeManualRecordStates(current, records.items));
      setPersistedPeople(people.items || []);
    } catch {
      setPersistedPeople([]);
    }
  }, [region]);

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const [next, perf, dailyArchive, strategy, review, safety, recentRecords] = await Promise.all([
        exposureRadarService.list({ region, botId: selectedBotID, xAccountId: selectedAccountID, hours, maxFans, minHotCount, limit: 60 }),
        exposureRadarService.performance({ region, botId: selectedBotID, xAccountId: selectedAccountID, days: 7 }),
        exposureRadarService.archive({ region, botId: selectedBotID, xAccountId: selectedAccountID, days: 7 }),
        exposureRadarService.growthStrategy({ region, botId: selectedBotID, xAccountId: selectedAccountID }),
        exposureRadarService.weeklyReview({ region, days: 7 }),
        exposureRadarService.safetyCenter({ region, days: 7 }),
        exposureRadarService.recentManualRecords({ region, days: 7, limit: 100 }),
      ]);
      const nextRanks = new Map(next.items.map((item, index) => [item.id, index + 1]));
      const rankStorageKey = radarRankStorageKey(region, hours, maxFans, minHotCount);
      const previousRanks = previousRanksRef.current.size > 0 ? previousRanksRef.current : readStoredRadarRanks(rankStorageKey);
      const changes = new Map<string, RankChange>();
      if (previousRanks.size > 0) {
        next.items.forEach((item, index) => {
          const nextRank = index + 1;
          const previousRank = previousRanks.get(item.id);
          if (!previousRank) {
            changes.set(item.id, { kind: "new" });
            return;
          }
          const delta = previousRank - nextRank;
          if (delta > 0) changes.set(item.id, { kind: "up", delta });
          if (delta < 0) changes.set(item.id, { kind: "down", delta: Math.abs(delta) });
        });
      }
      previousRanksRef.current = nextRanks;
      writeStoredRadarRanks(rankStorageKey, nextRanks);
      setRankChanges(changes);
      setData(next);
      setPerformance(perf);
      setArchive(dailyArchive);
      setGrowthStrategy(strategy);
      setWeeklyReview(review);
      setSafetyCenter(safety);
      setRecentManualRecords(recentRecords.items || []);
      setLastRefreshedAt(new Date().toISOString());
      setLoadState("ready");
      void hydrateManualWorkspace(next.items);
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("exposureRadar.toast.loadFailed") : t("exposureRadar.toast.loadFailed"));
      setLoadState("error");
    }
  }, [hours, hydrateManualWorkspace, maxFans, minHotCount, pushToast, region, selectedAccountID, selectedBotID, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const [accountData, botData] = await Promise.all([accountService.list(), oafBotService.list()]);
        const connectedAccounts = accountData.items.filter((account) => account.status !== "disconnected");
        setAccounts(connectedAccounts);
        setBots(botData.items);
        setSelectedAccountID((current) => current || connectedAccounts[0]?.id || 0);
        setSelectedBotID((current) => current || botData.items[0]?.id || 0);
      } catch (error) {
        pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("exposureRadar.toast.configLoadFailed") : t("exposureRadar.toast.configLoadFailed"));
      }
    })();
  }, [pushToast, t]);

  const loadContentDraftBridge = useCallback(async () => {
    setContentDraftBridgeLoading(true);
    try {
      const [plans, drafts] = await Promise.all([
        contentDraftService.plans(),
        contentDraftService.drafts(),
      ]);
      setContentDraftBridge({ plans: plans.items || [], drafts: drafts.items || [] });
    } catch {
      setContentDraftBridge({ plans: [], drafts: [] });
    } finally {
      setContentDraftBridgeLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadContentDraftBridge();
  }, [loadContentDraftBridge]);

  useEffect(() => {
    return subscribePageRefreshRequest(() => {
      void (async () => {
        try {
          await load();
        } finally {
          broadcastPageRefreshComplete();
        }
      })();
    });
  }, [load]);

  const saveGrowthStrategy = useCallback(async (form: StrategyFormState) => {
    setStrategySaving(true);
    try {
      const saved = await exposureRadarService.saveGrowthStrategy({
        bot_id: selectedBotID || undefined,
        x_account_id: selectedAccountID || undefined,
        region,
        target_audience: form.targetAudience,
        primary_goal: form.primaryGoal,
        core_topics: parseCommaList(form.coreTopics),
        avoid_topics: parseCommaList(form.avoidTopics),
        competitors: parseCommaList(form.competitors).map((value) => value.replace(/^@/, "")),
        reply_style: form.replyStyle,
        daily_move_limit: form.dailyMoveLimit,
        safety_mode: form.safetyMode,
        operator_notes: form.operatorNotes,
      });
      setGrowthStrategy(saved);
      pushToast(t("exposureRadar.strategy.saved"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("exposureRadar.strategy.saveFailed") : t("exposureRadar.strategy.saveFailed"));
    } finally {
      setStrategySaving(false);
    }
  }, [pushToast, region, selectedAccountID, selectedBotID, t]);

  const savePeopleNote = useCallback(async (person: PeopleRadarEntry, stage: string, notes: string, tags: string) => {
    if (!person.handle) return;
    setPeopleNoteSavingKey(person.key);
    try {
      await exposureRadarService.savePeopleNote({
        region,
        author_handle: person.handle,
        author_name: person.name,
        stage,
        tags: parseCommaList(tags),
        notes,
        last_signal_id: person.latestItem.id,
      });
      pushToast(t("exposureRadar.peopleRadar.noteSaved"));
      void hydrateManualWorkspace(data?.items || []);
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("exposureRadar.peopleRadar.noteSaveFailed") : t("exposureRadar.peopleRadar.noteSaveFailed"));
    } finally {
      setPeopleNoteSavingKey("");
    }
  }, [data?.items, hydrateManualWorkspace, pushToast, region, t]);

  const items = useMemo(() => data?.items || [], [data?.items]);
  const metrics = useMemo(() => {
    const tweetLevel = items.filter((item) => item.data_quality === "tweet_level").length;
    const highScore = items.filter((item) => item.score >= 75).length;
    const risky = items.filter((item) => item.risk_level === "medium" || item.risk_level === "high").length;
    const avgVelocity = items.length ? Math.round(items.reduce((sum, item) => sum + (item.views_per_min || 0), 0) / items.length) : 0;
    return { tweetLevel, highScore, risky, avgVelocity };
  }, [items]);
  const leaderboardStats = useMemo(() => buildLeaderboardStats(items, rankChanges), [items, rankChanges]);
  const radarViewCounts = useMemo(() => {
    return radarViewFilters.reduce<Record<RadarViewFilter, number>>((acc, filter) => {
      acc[filter] = filter === "all" ? items.length : items.filter((item) => radarItemMatchesFilter(item, filter, savedMemoryIDs, manualActionStates)).length;
      return acc;
    }, { priority: 0, all: 0, act_now: 0, watch: 0, expired: 0, hot: 0, rising: 0, sampling: 0, topic: 0, tweet: 0, high_score: 0, needs_review: 0, saved: 0, drafted: 0, pending_handling: 0, handled: 0, backfilled: 0 });
  }, [items, manualActionStates, savedMemoryIDs]);
  const displayedItems = useMemo(() => {
    return radarView === "all" ? items : items.filter((item) => radarItemMatchesFilter(item, radarView, savedMemoryIDs, manualActionStates));
  }, [items, manualActionStates, radarView, savedMemoryIDs]);
  const exposureLearningProfile = useMemo(() => buildExposureLearningProfile(recentManualRecords, manualActionStates), [manualActionStates, recentManualRecords]);
  const handlingQueue = useMemo(() => buildDailyActionPlan(items, manualActionStates, savedMemoryIDs, exposureLearningProfile, 12), [exposureLearningProfile, items, manualActionStates, savedMemoryIDs]);
  const todayMoves = useMemo(() => handlingQueue.slice(0, 10), [handlingQueue]);
  const workbenchStats = useMemo(() => buildWorkbenchStats(items, manualActionStates), [items, manualActionStates]);
  const peopleRadar = useMemo(() => mergePeopleRadar(buildPeopleRadar(items, manualActionStates, savedMemoryIDs), persistedPeople), [items, manualActionStates, persistedPeople, savedMemoryIDs]);

  useEffect(() => {
    if (handlingQueue.length === 0) {
      setActiveWorkbenchID("");
      return;
    }
    if (!activeWorkbenchID || !handlingQueue.some((entry) => entry.item.id === activeWorkbenchID)) {
      setActiveWorkbenchID(handlingQueue[0].item.id);
    }
  }, [activeWorkbenchID, handlingQueue]);

  const createDraft = useCallback(async (item: ExposureRadarItemApi, replyAngle?: ReplyAngleSuggestion) => {
    if (!selectedAccountID || !selectedBotID) {
      pushToast(t("exposureRadar.toast.selectBotAccount"));
      return;
    }
    if (item.data_quality !== "tweet_level") {
      pushToast(t("exposureRadar.toast.tweetLevelRequired"));
      return;
    }
    setDraftingID(item.id);
    try {
      const task = await exposureRadarService.createCommentDraft({
        bot_id: selectedBotID,
        x_account_id: selectedAccountID,
        signal_id: item.id,
        region: item.region,
        data_source: item.data_source,
        data_quality: item.data_quality,
        tweet_id: extractTweetID(item.url || item.id),
        url: item.url,
        title: item.title,
        author_handle: item.author_handle,
        author_name: item.author_name,
        content: item.content,
        topic_name: item.topic_name,
        score: item.score,
        risk_level: item.risk_level,
        opportunity_type: item.opportunity_type,
        recommended_use: buildDraftRecommendedUse(item, replyAngle),
        reason: buildDraftReason(item, replyAngle),
      });
      setData((current) => current ? {
        ...current,
        items: current.items.map((row) => row.id === item.id ? {
          ...row,
          review_task_id: task.id,
          review_status: task.status,
          review_queue_url: `/handling-list?type=comment&status=${encodeURIComponent(task.status === "review" ? "pending_review" : task.status)}&focus_type=comment&focus_source_id=${task.id}`,
          generated_comment: task.generated_comment,
          manual_action_url: task.manual_action_url,
          comment_tweet_id: task.comment_tweet_id,
          comment_url: task.comment_url,
        } : row),
      } : current);
      recordManualAction({
        ...item,
        review_task_id: task.id,
        review_status: task.status,
        generated_comment: task.generated_comment,
        manual_action_url: task.manual_action_url,
        comment_tweet_id: task.comment_tweet_id,
        comment_url: task.comment_url,
      }, { taskStatus: "in_progress" }, replyAngle);
      pushToast(task.status === "pending_review" ? t("exposureRadar.toast.draftQueued") : t("exposureRadar.toast.draftCreated"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("exposureRadar.toast.draftFailed") : t("exposureRadar.toast.draftFailed"));
    } finally {
      setDraftingID(null);
    }
  }, [pushToast, recordManualAction, selectedAccountID, selectedBotID, t]);

  const saveRadarMemory = useCallback(async (item: ExposureRadarItemApi, replyAngle?: ReplyAngleSuggestion) => {
    if (!selectedAccountID || !selectedBotID) {
      pushToast(t("exposureRadar.toast.selectBotAccountForMemory"));
      return;
    }
    setSavingMemoryID(item.id);
    try {
      const memory = await contentLibraryService.create(buildRadarMemoryPayload(item, selectedAccountID, selectedBotID, replyAngle));
      setData((current) => current ? {
        ...current,
        items: current.items.map((row) => row.id === item.id ? { ...row, saved_memory_id: memory.id } : row),
      } : current);
      setSavedMemoryIDs((current) => new Set(current).add(item.id));
      recordManualAction({ ...item, saved_memory_id: memory.id }, { saved: true, taskStatus: "in_progress" }, replyAngle);
      pushToast(t("exposureRadar.toast.memorySaved"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("exposureRadar.toast.memoryFailed") : t("exposureRadar.toast.memoryFailed"));
    } finally {
      setSavingMemoryID(null);
    }
  }, [pushToast, recordManualAction, selectedAccountID, selectedBotID, t]);

  const saveRadarContentSeed = useCallback(async (item: ExposureRadarItemApi) => {
    if (!selectedAccountID || !selectedBotID) {
      pushToast(t("exposureRadar.toast.selectBotAccountForMemory"));
      return;
    }
    setSavingSeedID(item.id);
    try {
      await contentLibraryService.create(buildRadarContentSeedPayload(item, selectedAccountID, selectedBotID));
      recordManualAction(item, { saved: true, taskStatus: "in_progress" });
      void loadContentDraftBridge();
      pushToast(t("exposureRadar.toast.contentSeedSaved"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("exposureRadar.toast.contentSeedFailed") : t("exposureRadar.toast.contentSeedFailed"));
    } finally {
      setSavingSeedID(null);
    }
  }, [loadContentDraftBridge, pushToast, recordManualAction, selectedAccountID, selectedBotID, t]);

  const generateContentDraftFromRadarSeed = useCallback(async (item: ExposureRadarItemApi) => {
    if (!selectedAccountID || !selectedBotID) {
      pushToast(t("exposureRadar.toast.selectBotAccountForMemory"));
      return;
    }
    const plan = findContentDraftPlanForSeed(contentDraftBridge.plans, selectedAccountID, selectedBotID);
    setGeneratingSeedDraftID(item.id);
    try {
      const seed = await contentLibraryService.create(buildRadarContentSeedPayload(item, selectedAccountID, selectedBotID));
      recordManualAction(item, { saved: true, taskStatus: "in_progress" });
      if (!plan) {
        void loadContentDraftBridge();
        pushToast(t("exposureRadar.toast.seedSavedPlanMissing"));
        return;
      }
      await contentDraftService.generateDraft(plan.id, buildSeedDraftDirection(item), seed.id);
      await loadContentDraftBridge();
      pushToast(t("exposureRadar.toast.seedDraftGenerated"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("exposureRadar.toast.seedDraftFailed") : t("exposureRadar.toast.seedDraftFailed"));
    } finally {
      setGeneratingSeedDraftID(null);
    }
  }, [contentDraftBridge.plans, loadContentDraftBridge, pushToast, recordManualAction, selectedAccountID, selectedBotID, t]);

  const markRadarHandled = useCallback(async (item: ExposureRadarItemApi, publishedURL: string) => {
    const normalizedPublishedURL = publishedURL.trim();
    setHandlingID(item.id);
    try {
      let persistedURL = normalizedPublishedURL;
      if (item.review_task_id) {
        const task = await exposureRadarService.markDraftHandled(item.review_task_id, {
          published_url: normalizedPublishedURL || undefined,
        });
        persistedURL = task.comment_url || normalizedPublishedURL;
        setData((current) => current ? {
          ...current,
          items: current.items.map((row) => row.id === item.id ? {
            ...row,
            review_status: task.status,
            manual_action_url: task.manual_action_url || row.manual_action_url,
            comment_tweet_id: task.comment_tweet_id,
            comment_url: task.comment_url,
          } : row),
        } : current);
      }
      recordManualAction({ ...item, comment_url: persistedURL || item.comment_url, review_status: item.review_task_id ? "handled" : item.review_status }, { handled: true, persisted: true, publishedUrl: persistedURL, taskStatus: "done" });
      void exposureRadarService.performance({ region, botId: selectedBotID, xAccountId: selectedAccountID, days: 7 })
        .then(setPerformance)
        .catch(() => undefined);
      pushToast(t("exposureRadar.manualAction.persistedToast"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("exposureRadar.manualAction.persistFailed") : t("exposureRadar.manualAction.persistFailed"));
    } finally {
      setHandlingID(null);
    }
  }, [pushToast, recordManualAction, region, selectedAccountID, selectedBotID, t]);

  const submitManualOutcome = useCallback(async (item: ExposureRadarItemApi, outcome: ManualOutcome, comment: string) => {
    setFeedbackSavingID(item.id);
    try {
      if (item.review_task_id) {
        await exposureRadarService.createDraftFeedback(item.review_task_id, buildManualOutcomePayload(outcome, comment, item));
      }
      recordManualAction(item, {
        outcome,
        feedbackComment: comment.trim(),
        feedbackAt: new Date().toISOString(),
        taskStatus: isManualActionHandled(item, manualActionStates[item.id]) ? "done" : "in_progress",
      });
      pushToast(t("exposureRadar.manualFeedback.savedToast"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("exposureRadar.manualFeedback.saveFailed") : t("exposureRadar.manualFeedback.saveFailed"));
    } finally {
      setFeedbackSavingID(null);
    }
  }, [manualActionStates, pushToast, recordManualAction, t]);

  const submitManualResult = useCallback(async (item: ExposureRadarItemApi, result: {
    impressions?: number;
    likes?: number;
    replies?: number;
    reposts?: number;
    quotes?: number;
    bookmarks?: number;
    notes?: string;
  }) => {
    const patch: Partial<ManualActionState> = {
      resultImpressionCount: result.impressions,
      resultLikeCount: result.likes,
      resultReplyCount: result.replies,
      resultRetweetCount: result.reposts,
      resultQuoteCount: result.quotes,
      resultBookmarkCount: result.bookmarks,
      resultNotes: result.notes,
      resultCheckedAt: new Date().toISOString(),
      taskStatus: isManualActionHandled(item, manualActionStates[item.id]) ? "done" : "in_progress",
    };
    recordManualAction(item, patch);
    pushToast(t("exposureRadar.resultTracking.savedToast"));
    void Promise.all([
      exposureRadarService.weeklyReview({ region, days: 7 }).then(setWeeklyReview),
      exposureRadarService.recentManualRecords({ region, days: 7, limit: 100 }).then((records) => setRecentManualRecords(records.items || [])),
    ]).catch(() => undefined);
  }, [manualActionStates, pushToast, recordManualAction, region, t]);

  const refreshManualResults = useCallback(async () => {
    setResultRefreshing(true);
    try {
      const summary = await exposureRadarService.refreshManualResults({ region, days: 7, limit: 100 });
      setResultRefreshSummary(summary);
      const [review, recentRecords] = await Promise.all([
        exposureRadarService.weeklyReview({ region, days: 7 }),
        exposureRadarService.recentManualRecords({ region, days: 7, limit: 100 }),
      ]);
      setWeeklyReview(review);
      setRecentManualRecords(recentRecords.items || []);
      setManualActionStates((current) => mergeManualRecordStates(current, recentRecords.items || []));
      pushToast(t("exposureRadar.resultRefresh.toast", { count: summary.refreshed_count || 0 }));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("exposureRadar.resultRefresh.failed") : t("exposureRadar.resultRefresh.failed"));
    } finally {
      setResultRefreshing(false);
    }
  }, [pushToast, region, t]);

  const focusRadarItem = useCallback((itemID: string) => {
    setRadarView("all");
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
      document.getElementById(radarCardAnchorID(itemID))?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }, []);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-[#2f3336] bg-[#0f1419]">
        <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="p-5 md:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#1d9bf0]/30 bg-[#1d9bf0]/10 px-3 py-1 text-xs font-semibold text-[#8ecdf8]">
                <Zap className="size-3.5" />
                {t("exposureRadar.hero.kicker")}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-3 py-1 text-xs font-semibold text-[#7ee0b5]">
                <Sparkles className="size-3.5" />
                {t("exposureRadar.hero.free")}
              </span>
            </div>
            <h1 className="mt-5 max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-[#e7e9ea] md:text-4xl">{t("exposureRadar.hero.title")}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#8b98a5] md:text-base">{t("exposureRadar.hero.subtitle")}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-4">
              <LightMetric icon={<Search className="size-4" />} label={t("exposureRadar.metrics.items")} value={String(items.length)} />
              <LightMetric icon={<Flame className="size-4" />} label={t("exposureRadar.metrics.highScore")} value={String(metrics.highScore)} />
              <LightMetric icon={<Gauge className="size-4" />} label={t("exposureRadar.metrics.velocity")} value={metrics.avgVelocity ? `${metrics.avgVelocity}/min` : "-"} />
              <LightMetric icon={<ShieldAlert className="size-4" />} label={t("exposureRadar.metrics.risky")} value={String(metrics.risky)} />
            </div>
          </div>
          <div className="border-t border-[#2f3336] bg-black/30 p-5 md:p-6 xl:border-l xl:border-t-0">
            <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.playbook.title")}</p>
            <div className="mt-4 space-y-2">
              {["velocity", "lowFans", "review", "memory"].map((key, index) => (
                <div key={key} className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-[#2f3336] bg-black text-[11px] font-semibold text-[#8ecdf8]">0{index + 1}</span>
                    <div>
                      <p className="text-sm font-semibold text-[#e7e9ea]">{t(`exposureRadar.playbook.${key}.title`)}</p>
                      <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t(`exposureRadar.playbook.${key}.description`)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <DailyGrowthDeskPanel
        selectedAccountID={selectedAccountID}
        selectedBotID={selectedBotID}
        strategy={growthStrategy}
        moves={todayMoves}
        stats={workbenchStats}
        people={peopleRadar}
        recentRecords={recentManualRecords}
        weeklyReview={weeklyReview}
        safety={safetyCenter}
        lastRefreshedAt={lastRefreshedAt}
        timeZone={timeZone}
        loadState={loadState}
        onRefresh={() => void load()}
      />

      <DailySessionProgressPanel
        strategy={growthStrategy}
        moves={todayMoves}
        stats={workbenchStats}
        recentRecords={recentManualRecords}
        timeZone={timeZone}
      />

      <DailyReviewReportPanel
        data={data}
        strategy={growthStrategy}
        moves={todayMoves}
        recentRecords={recentManualRecords}
        weeklyReview={weeklyReview}
        safety={safetyCenter}
        learningProfile={exposureLearningProfile}
        timeZone={timeZone}
      />

      <ContentDraftOperatingPanel
        bridge={contentDraftBridge}
        loading={contentDraftBridgeLoading}
        exposureMoves={todayMoves}
        recentRecords={recentManualRecords}
        onRefresh={() => void loadContentDraftBridge()}
      />

      <GrowthDeskCommandPanel
        data={data}
        strategy={growthStrategy}
        moves={todayMoves}
        people={peopleRadar}
        recentRecords={recentManualRecords}
        weeklyReview={weeklyReview}
        safety={safetyCenter}
        timeZone={timeZone}
        loadState={loadState}
        manualActionStates={manualActionStates}
        resultRefreshing={resultRefreshing}
        resultRefreshSummary={resultRefreshSummary}
        onRefreshResults={() => void refreshManualResults()}
        onFocusItem={(itemID) => {
          setActiveWorkbenchID(itemID);
          focusRadarItem(itemID);
        }}
      />

      <XApiBudgetPanel
        data={data}
        diagnostics={data?.diagnostics || null}
        resultRefreshSummary={resultRefreshSummary}
        resultRefreshing={resultRefreshing}
        timeZone={timeZone}
        onRefreshResults={() => void refreshManualResults()}
      />

      {shouldShowSignalRecovery(data, loadState, workbenchStats) ? (
        <SignalRecoveryPanel
          data={data}
          loadState={loadState}
          currentHours={hours}
          currentMaxFans={maxFans}
          onWidenWindow={() => setHours(8)}
          onRaiseFans={() => setMaxFans((current) => Math.max(current, 50000))}
          onRefresh={() => void load()}
        />
      ) : null}

      <div id="radar-setup" className="scroll-mt-24">
        <Card className="bg-[#0f1419]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <CardHeader title={t("exposureRadar.filters.title")} description={t("exposureRadar.filters.description")} className="mb-0" />
            <Button type="button" variant="outline" onClick={() => void load()} disabled={loadState === "loading"}>
              <RefreshCw className={`size-4 ${loadState === "loading" ? "animate-spin" : ""}`} />
              {t("common.refresh")}
            </Button>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-4">
            <SegmentedControl
              label={t("exposureRadar.filters.region")}
              options={[
                { value: "zh", label: t("exposureRadar.region.zh") },
                { value: "en", label: t("exposureRadar.region.en") },
              ]}
              value={region}
              onChange={(value) => setRegion(value as ExposureRadarRegion)}
            />
            <NumberButtons label={t("exposureRadar.filters.hours")} values={hourOptions} value={hours} suffix="h" onChange={setHours} />
            <NumberButtons label={t("exposureRadar.filters.maxFans")} values={fanOptions} value={maxFans} formatter={formatCompact} onChange={setMaxFans} />
            <NumberButtons label={t("exposureRadar.filters.hotCount")} values={hotCountOptions} value={minHotCount} formatter={(value) => (value === 0 ? t("common.all") : `>=${value}`)} onChange={setMinHotCount} disabled={region === "en"} />
          </div>
          {data ? <SourceHealthPanel data={data} timeZone={timeZone} /> : null}
          {data?.diagnostics ? <CollectionDiagnosticsPanel diagnostics={data.diagnostics} timeZone={timeZone} /> : null}
          <div className="mt-4 border-t border-[#2f3336] pt-4">
            <CardHeader title={t("exposureRadar.draft.title")} description={t("exposureRadar.draft.description")} className="mb-3" />
            <div className="grid gap-3 md:grid-cols-2 md:items-end">
              <SelectField
                icon={<Users className="size-4" />}
                label={t("exposureRadar.draft.account")}
                value={selectedAccountID}
                onChange={setSelectedAccountID}
                emptyLabel={t("exposureRadar.draft.noAccounts")}
                options={accounts.map((account) => ({ value: account.id, label: `@${account.username}` }))}
              />
              <SelectField
                icon={<Bot className="size-4" />}
                label={t("exposureRadar.draft.bot")}
                value={selectedBotID}
                onChange={setSelectedBotID}
                emptyLabel={t("exposureRadar.draft.noBots")}
                options={bots.map((bot) => ({ value: bot.id, label: bot.name || t("oafBots.botNumber", { id: bot.id }) }))}
              />
            </div>
          </div>
        </Card>
      </div>

      <FirstDayLaunchPanel
        selectedAccountID={selectedAccountID}
        selectedBotID={selectedBotID}
        accounts={accounts}
        bots={bots}
        strategy={growthStrategy}
        moves={todayMoves}
        recentRecords={recentManualRecords}
        contentDraftBridge={contentDraftBridge}
      />

      <div id="radar-strategy" className="scroll-mt-24">
        <StrategySetupPanel
          strategy={growthStrategy}
          region={region}
          saving={strategySaving}
          onSave={saveGrowthStrategy}
        />
      </div>

      <div id="radar-results" className="scroll-mt-24">
        <GrowthReviewPanel
          review={weeklyReview}
          safety={safetyCenter}
          recentRecords={recentManualRecords}
          timeZone={timeZone}
        />
      </div>

      <TodayMovesPanel
        moves={todayMoves}
        stats={workbenchStats}
        activeID={activeWorkbenchID}
        onFocus={(itemID) => {
          setActiveWorkbenchID(itemID);
          focusRadarItem(itemID);
        }}
        onTaskStatus={(item, taskStatus) => recordManualAction(item, taskStatus === "done" ? { taskStatus, handled: true } : { taskStatus })}
      />

      <div id="radar-people" className="scroll-mt-24">
        <PeopleRadarPanel
          people={peopleRadar}
          savingKey={peopleNoteSavingKey}
          onSaveNote={savePeopleNote}
          onFocus={(itemID) => {
            setActiveWorkbenchID(itemID);
            focusRadarItem(itemID);
          }}
        />
      </div>

      <div id="radar-workbench" className="scroll-mt-24">
        <HandlingWorkbenchPanel
          queue={handlingQueue}
          activeID={activeWorkbenchID}
          stats={workbenchStats}
          draftingID={draftingID}
          draftDisabled={!selectedAccountID || !selectedBotID}
          handlingID={handlingID}
          savingMemoryID={savingMemoryID}
          memoryDisabled={!selectedAccountID || !selectedBotID}
          selectedReplyAngleIDs={selectedReplyAngleIDs}
          onCreateDraft={createDraft}
          onMarkHandled={markRadarHandled}
          onSaveMemory={saveRadarMemory}
          onSaveContentSeed={saveRadarContentSeed}
          onGenerateContentDraft={generateContentDraftFromRadarSeed}
          onManualAction={recordManualAction}
          onSelectReplyAngle={updateSelectedReplyAngle}
          onActiveChange={setActiveWorkbenchID}
          onFocusItem={focusRadarItem}
          savedMemoryIDs={savedMemoryIDs}
          savingSeedID={savingSeedID}
          generatingSeedDraftID={generatingSeedDraftID}
        />
      </div>

      <Card className="bg-[#0f1419]">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <CardHeader title={t("exposureRadar.list.title")} description={t(region === "zh" ? "exposureRadar.list.descriptionZh" : "exposureRadar.list.descriptionEn")} />
          <span className="inline-flex items-center gap-2 rounded-full border border-[#2f3336] px-3 py-1 text-xs font-semibold text-[#8b98a5]">
            <Activity className="size-3.5" />
            {data?.data_quality || "-"}
          </span>
        </div>
        <RadarViewTabs value={radarView} counts={radarViewCounts} onChange={setRadarView} />
        <LeaderboardStatusStrip stats={leaderboardStats} data={data} lastRefreshedAt={lastRefreshedAt} timeZone={timeZone} />
        {loadState === "loading" ? (
          <div className="rounded-2xl border border-[#2f3336] bg-black px-4 py-10 text-center text-sm text-[#71767b]">{t("exposureRadar.loading")}</div>
        ) : null}
        {loadState === "error" ? (
          <div className="rounded-2xl border border-[#f4212e]/25 bg-[#f4212e]/10 px-4 py-10 text-center text-sm text-[#ff8a91]">{t("exposureRadar.toast.loadFailed")}</div>
        ) : null}
        {loadState === "ready" && items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#2f3336] bg-black px-4 py-10 text-center text-sm text-[#71767b]">{t("exposureRadar.empty")}</div>
        ) : null}
        {loadState === "ready" && items.length > 0 && displayedItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#2f3336] bg-black px-4 py-10 text-center text-sm text-[#71767b]">{t("exposureRadar.list.filteredEmpty")}</div>
        ) : null}
        {loadState === "ready" && displayedItems.length ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {displayedItems.map((item, index) => (
              <RadarCard
                key={item.id}
                item={item}
                rank={index + 1}
                timeZone={timeZone}
                rankChange={rankChanges.get(item.id)}
                savedMemoryID={radarItemSavedMemoryID(item, savedMemoryIDs)}
                drafting={draftingID === item.id}
                draftDisabled={!selectedAccountID || !selectedBotID}
                onCreateDraft={createDraft}
                handling={handlingID === item.id}
                onMarkHandled={markRadarHandled}
                savingMemory={savingMemoryID === item.id}
                memoryDisabled={!selectedAccountID || !selectedBotID}
                memoryAccountID={selectedAccountID}
                onSaveMemory={saveRadarMemory}
                onSaveContentSeed={saveRadarContentSeed}
                savingSeed={savingSeedID === item.id}
                onGenerateContentDraft={generateContentDraftFromRadarSeed}
                generatingSeedDraft={generatingSeedDraftID === item.id}
                manualState={manualActionStates[item.id]}
                onManualAction={(patch) => recordManualAction(item, patch)}
                feedbackSaving={feedbackSavingID === item.id}
                onSubmitFeedback={submitManualOutcome}
                onSubmitResult={submitManualResult}
              />
            ))}
          </div>
        ) : null}
      </Card>

      <LearningInsightsPanel data={performance} items={items} manualActionStates={manualActionStates} recentRecords={recentManualRecords} learningProfile={exposureLearningProfile} />

      <PerformancePanel data={performance} timeZone={timeZone} />

      <TopicHistoryPanel data={archive} timeZone={timeZone} />
    </div>
  );
}

function LightMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-black p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-[#71767b]">{icon}{label}</div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</p>
    </div>
  );
}

function DailyGrowthDeskPanel({
  selectedAccountID,
  selectedBotID,
  strategy,
  moves,
  stats,
  people,
  recentRecords,
  weeklyReview,
  safety,
  lastRefreshedAt,
  timeZone,
  loadState,
  onRefresh,
}: {
  selectedAccountID: number;
  selectedBotID: number;
  strategy: ExposureRadarGrowthStrategyApi | null;
  moves: DailyActionPlanItem[];
  stats: WorkbenchStats;
  people: PeopleRadarEntry[];
  recentRecords: ExposureRadarManualRecordApi[];
  weeklyReview: ExposureRadarWeeklyReviewData | null;
  safety: ExposureRadarSafetyCenterData | null;
  lastRefreshedAt: string;
  timeZone: string;
  loadState: LoadState;
  onRefresh: () => void;
}) {
  const { t } = useT();
  const strategyReady = Boolean(strategy?.target_audience || strategy?.core_topics?.length);
  const dailyLimit = Math.max(1, Math.min(50, strategy?.daily_move_limit || 10));
  const recentHandled = recentRecords.filter((record) => isRecentManualRecord(record, 24) && (record.handled_at || record.task_status === "done")).length;
  const recentBackfilled = recentRecords.filter((record) => isRecentManualRecord(record, 24) && (record.result_checked_at || record.result_score)).length;
  const priorityPeople = people.filter((person) => person.stage === "priority" || person.stage === "repeat").length;
  const safetyWarnings = (safety?.watch_count || 0) + (safety?.block_count || 0);
  const completionPercent = Math.min(100, Math.round((recentHandled / dailyLimit) * 100));
  const focusKey = dailyDeskFocusKey({ selectedAccountID, selectedBotID, strategyReady, stats, moves, recentBackfilled });
  const focusAnchor = dailyDeskFocusAnchor(focusKey);
  const refreshedLabel = lastRefreshedAt ? formatDateTime(lastRefreshedAt, timeZone) : "-";
  const effectiveRate = weeklyReview ? `${Math.round((weeklyReview.effective_rate || 0) * 100)}%` : "-";
  const rhythmSteps = ["scan", "reply", "save", "review"];

  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-3 py-1 text-xs font-semibold text-[#8ecdf8]">
              <Activity className="size-3.5" />
              {t("exposureRadar.dailyDesk.badge")}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#2f3336] bg-black px-3 py-1 text-xs font-semibold text-[#8b98a5]">
              <Clock3 className="size-3.5" />
              {t("exposureRadar.dailyDesk.refreshed", { time: refreshedLabel })}
            </span>
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[#e7e9ea]">{t("exposureRadar.dailyDesk.title")}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#8b98a5]">{t("exposureRadar.dailyDesk.description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={focusAnchor} className="inline-flex h-9 items-center gap-1 rounded-full bg-[#1d9bf0] px-3 text-sm font-semibold text-white hover:bg-[#1a8cd8]">
            {t(`exposureRadar.dailyDesk.focus.${focusKey}.cta`)}
            <ArrowRight className="size-4" />
          </a>
          <Button type="button" variant="outline" onClick={onRefresh} disabled={loadState === "loading"}>
            <RefreshCw className={`size-4 ${loadState === "loading" ? "animate-spin" : ""}`} />
            {t("exposureRadar.dailyDesk.refresh")}
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(280px,0.75fr)]">
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#e7e9ea]">{t(`exposureRadar.dailyDesk.focus.${focusKey}.title`)}</p>
              <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t(`exposureRadar.dailyDesk.focus.${focusKey}.description`)}</p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-3 py-1 text-xs font-semibold text-[#7ee0b5]">
              <Target className="size-3.5" />
              {t("exposureRadar.dailyDesk.focusLabel")}
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <GrowthDeskMetric icon={<CheckCircle2 className="size-4" />} label={t("exposureRadar.dailyDesk.metric.target")} value={`${recentHandled}/${dailyLimit}`} detail={t("exposureRadar.dailyDesk.metric.targetDetail", { percent: completionPercent })} />
            <GrowthDeskMetric icon={<Zap className="size-4" />} label={t("exposureRadar.dailyDesk.metric.queue")} value={String(stats.pending)} detail={t("exposureRadar.dailyDesk.metric.queueDetail", { count: stats.actNow })} />
            <GrowthDeskMetric icon={<Users className="size-4" />} label={t("exposureRadar.dailyDesk.metric.people")} value={String(priorityPeople)} detail={t("exposureRadar.dailyDesk.metric.peopleDetail")} />
            <GrowthDeskMetric icon={<ShieldAlert className="size-4" />} label={t("exposureRadar.dailyDesk.metric.safety")} value={String(safetyWarnings)} detail={t("exposureRadar.dailyDesk.metric.safetyDetail")} />
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#202327]">
            <div className="h-full rounded-full bg-[#00ba7c]" style={{ width: `${completionPercent}%` }} />
          </div>
        </div>

        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.dailyDesk.pulse.title")}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MiniStat icon={<MessageCircle className="size-3.5" />} label={t("exposureRadar.dailyDesk.pulse.moves")} value={String(moves.length)} />
            <MiniStat icon={<Database className="size-3.5" />} label={t("exposureRadar.dailyDesk.pulse.backfilled")} value={String(recentBackfilled)} />
            <MiniStat icon={<BarChart3 className="size-3.5" />} label={t("exposureRadar.dailyDesk.pulse.effective")} value={effectiveRate} />
            <MiniStat icon={<CalendarClock className="size-3.5" />} label={t("exposureRadar.dailyDesk.pulse.days")} value={String(weeklyReview?.days || 7)} />
          </div>
          <p className="mt-3 text-xs leading-5 text-[#71767b]">{t("exposureRadar.dailyDesk.pulse.hint")}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-4">
        {rhythmSteps.map((step, index) => (
          <a key={step} href={dailyDeskRhythmAnchor(step)} className="rounded-xl border border-[#2f3336] bg-black p-3 transition hover:border-[#1d9bf0]/45 hover:bg-[#1d9bf0]/10">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex size-7 items-center justify-center rounded-full border border-[#2f3336] bg-[#0f1419] text-[11px] font-semibold text-[#8ecdf8]">0{index + 1}</span>
              <ArrowRight className="size-3.5 text-[#71767b]" />
            </div>
            <p className="mt-2 text-sm font-semibold text-[#e7e9ea]">{t(`exposureRadar.dailyDesk.rhythm.${step}.title`)}</p>
            <p className="mt-1 text-xs leading-5 text-[#71767b]">{t(`exposureRadar.dailyDesk.rhythm.${step}.description`)}</p>
          </a>
        ))}
      </div>
    </Card>
  );
}

function GrowthDeskMetric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-[#71767b]">{icon}{label}</div>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-[11px] leading-4 text-[#71767b]">{detail}</p>
    </div>
  );
}

function DailySessionProgressPanel({
  strategy,
  moves,
  stats,
  recentRecords,
  timeZone,
}: {
  strategy: ExposureRadarGrowthStrategyApi | null;
  moves: DailyActionPlanItem[];
  stats: WorkbenchStats;
  recentRecords: ExposureRadarManualRecordApi[];
  timeZone: string;
}) {
  const { t } = useT();
  const dailyTarget = Math.max(1, Math.min(50, strategy?.daily_move_limit || 10));
  const handledToday = recentRecords.filter((record) => isRecentManualRecord(record, 24) && (record.handled_at || record.task_status === "done")).length;
  const backfilledToday = recentRecords.filter((record) => isRecentManualRecord(record, 24) && (record.result_checked_at || record.result_score)).length;
  const completion = Math.min(100, Math.round((handledToday / dailyTarget) * 100));
  const pending = Math.max(0, dailyTarget - handledToday);
  const lastActivity = recentRecords
    .map((record) => record.result_checked_at || record.handled_at || record.feedback_at || record.updated_at || record.created_at)
    .filter(Boolean)
    .sort((a, b) => new Date(b || "").getTime() - new Date(a || "").getTime())[0];
  const sessionState = handledToday >= dailyTarget ? "complete" : moves.length > 0 ? "active" : stats.pending > 0 ? "review" : "quiet";
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <CardHeader title={t("exposureRadar.session.title")} description={t("exposureRadar.session.description")} className="mb-0" />
        <span className={`inline-flex h-9 w-fit items-center gap-2 rounded-full border px-3 text-xs font-semibold ${sessionStateTone(sessionState)}`}>
          <Activity className="size-3.5" />
          {t(`exposureRadar.session.state.${sessionState}`)}
        </span>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-[#8b98a5]">{t("exposureRadar.session.progress")}</p>
              <p className="mt-1 text-2xl font-semibold text-white">{handledToday}/{dailyTarget}</p>
            </div>
            <span className="text-sm font-semibold text-[#8ecdf8]">{completion}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#202327]">
            <div className="h-full rounded-full bg-[#1d9bf0]" style={{ width: `${completion}%` }} />
          </div>
          <p className="mt-3 text-xs leading-5 text-[#71767b]">
            {t("exposureRadar.session.progressDetail", { pending, backfilled: backfilledToday })}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
          <MiniStat icon={<Zap className="size-3.5" />} label={t("exposureRadar.session.metric.moves")} value={String(moves.length)} />
          <MiniStat icon={<BarChart3 className="size-3.5" />} label={t("exposureRadar.session.metric.backfilled")} value={String(backfilledToday)} />
          <MiniStat icon={<Clock3 className="size-3.5" />} label={t("exposureRadar.session.metric.last")} value={lastActivity ? formatDateTime(lastActivity, timeZone) : "-"} />
        </div>
      </div>
    </Card>
  );
}

function DailyReviewReportPanel({
  data,
  strategy,
  moves,
  recentRecords,
  weeklyReview,
  safety,
  learningProfile,
  timeZone,
}: {
  data: ExposureRadarData | null;
  strategy: ExposureRadarGrowthStrategyApi | null;
  moves: DailyActionPlanItem[];
  recentRecords: ExposureRadarManualRecordApi[];
  weeklyReview: ExposureRadarWeeklyReviewData | null;
  safety: ExposureRadarSafetyCenterData | null;
  learningProfile: ExposureLearningProfile;
  timeZone: string;
}) {
  const { t } = useT();
  const { pushToast } = useToast();
  const todayRecords = recentRecords.filter((record) => isRecentManualRecord(record, 24));
  const handledToday = todayRecords.filter((record) => record.handled_at || record.task_status === "done").length;
  const backfilledToday = todayRecords.filter((record) => record.result_checked_at || record.result_score).length;
  const effectiveToday = todayRecords.filter((record) => record.outcome === "effective" || (record.result_score || 0) >= 60).length;
  const topResult = bestExposureResultRecord(todayRecords) || bestExposureResultRecord(recentRecords);
  const topTopics = buildDailyReviewTopics(todayRecords, moves).slice(0, 4);
  const nextActions = buildDailyReviewActions({ data, moves, recentRecords, safety, learningProfile, t }).slice(0, 4);
  const report = buildDailyReviewReportText({ data, strategy, moves, recentRecords, weeklyReview, safety, learningProfile, timeZone, t });
  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report);
      pushToast(t("exposureRadar.dailyReview.copied"));
    } catch {
      pushToast(t("exposureRadar.dailyReview.copyFailed"));
    }
  };
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <CardHeader title={t("exposureRadar.dailyReview.title")} description={t("exposureRadar.dailyReview.description")} className="mb-0" />
        <Button type="button" variant="outline" onClick={() => void copyReport()}>
          <Clipboard className="size-4" />
          {t("exposureRadar.dailyReview.copy")}
        </Button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <GrowthDeskMetric icon={<CheckCircle2 className="size-3.5" />} label={t("exposureRadar.dailyReview.metric.handled")} value={String(handledToday)} detail={t("exposureRadar.dailyReview.metric.handledDetail")} />
        <GrowthDeskMetric icon={<BarChart3 className="size-3.5" />} label={t("exposureRadar.dailyReview.metric.backfilled")} value={String(backfilledToday)} detail={t("exposureRadar.dailyReview.metric.backfilledDetail")} />
        <GrowthDeskMetric icon={<TrendingUp className="size-3.5" />} label={t("exposureRadar.dailyReview.metric.effective")} value={String(effectiveToday)} detail={weeklyReview ? `${Math.round((weeklyReview.effective_rate || 0) * 100)}%` : t("exposureRadar.dailyReview.metric.effectiveDetail")} />
        <GrowthDeskMetric icon={<ShieldAlert className="size-3.5" />} label={t("exposureRadar.dailyReview.metric.safety")} value={String((safety?.watch_count || 0) + (safety?.block_count || 0))} detail={t("exposureRadar.dailyReview.metric.safetyDetail")} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.dailyReview.reportTitle")}</p>
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl border border-[#2f3336] bg-[#0f1419] p-3 text-xs leading-5 text-[#c9d1d9]">{report}</pre>
        </div>
        <div className="space-y-3">
          <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
            <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.dailyReview.bestResult")}</p>
            {topResult ? (
              <div className="mt-3 rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
                <p className="line-clamp-2 text-xs font-semibold text-[#e7e9ea]">{topResult.title}</p>
                <p className="mt-1 text-[11px] text-[#71767b]">{t("exposureRadar.dailyReview.bestResultDetail", { score: topResult.result_score || 0, views: formatCompact(topResult.result_impression_count || 0) })}</p>
              </div>
            ) : (
              <p className="mt-3 rounded-xl border border-dashed border-[#2f3336] px-3 py-5 text-center text-xs text-[#71767b]">{t("exposureRadar.dailyReview.noResult")}</p>
            )}
          </div>
          <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
            <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.dailyReview.nextActions")}</p>
            <div className="mt-3 space-y-2">
              {nextActions.map((action) => (
                <div key={action} className="flex gap-2 rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2 text-xs leading-5 text-[#8b98a5]">
                  <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-[#8ecdf8]" />
                  <span>{action}</span>
                </div>
              ))}
            </div>
          </div>
          {topTopics.length ? (
            <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
              <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.dailyReview.topTopics")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {topTopics.map((topic) => (
                  <span key={topic} className="rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-2.5 py-1 text-xs font-semibold text-[#8ecdf8]">{topic}</span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function ContentDraftOperatingPanel({
  bridge,
  loading,
  exposureMoves,
  recentRecords,
  onRefresh,
}: {
  bridge: ContentDraftBridgeData;
  loading: boolean;
  exposureMoves: DailyActionPlanItem[];
  recentRecords: ExposureRadarManualRecordApi[];
  onRefresh: () => void;
}) {
  const { t } = useT();
  const draftStats = useMemo(() => {
    const activePlans = bridge.plans.filter((plan) => plan.enabled).length;
    const pendingDrafts = bridge.drafts.filter((draft) => draft.status === "draft" || draft.status === "pending_review" || draft.status === "approved" || draft.status === "ready_to_publish").length;
    const publishedDrafts = bridge.drafts.filter((draft) => draft.status === "published").length;
    return { activePlans, pendingDrafts, publishedDrafts };
  }, [bridge]);
  const handledToday = recentRecords.filter((record) => isRecentManualRecord(record, 24) && (record.handled_at || record.task_status === "done")).length;
  const topDraft = bridge.drafts.find((draft) => draft.status === "draft" || draft.status === "pending_review" || draft.status === "approved" || draft.status === "ready_to_publish") || bridge.drafts[0];
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <CardHeader title={t("exposureRadar.contentDesk.title")} description={t("exposureRadar.contentDesk.description")} className="mb-0" />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            {t("exposureRadar.contentDesk.refresh")}
          </Button>
          <Link href="/content-drafts" className="inline-flex h-9 items-center gap-1 rounded-full bg-[#1d9bf0] px-3 text-sm font-semibold text-white hover:bg-[#1a8cd8]">
            {t("exposureRadar.contentDesk.open")}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.contentDesk.loop.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.contentDesk.loop.description")}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <MiniStat icon={<MessageSquarePlus className="size-3.5" />} label={t("exposureRadar.contentDesk.metric.opportunities")} value={String(exposureMoves.length)} />
            <MiniStat icon={<FileText className="size-3.5" />} label={t("exposureRadar.contentDesk.metric.drafts")} value={String(draftStats.pendingDrafts)} />
            <MiniStat icon={<CheckCircle2 className="size-3.5" />} label={t("exposureRadar.contentDesk.metric.handled")} value={String(handledToday)} />
          </div>
          <div className="mt-3 rounded-xl border border-[#1d9bf0]/20 bg-[#08131f] p-3">
            <p className="text-xs font-semibold text-[#8ecdf8]">{t("exposureRadar.contentDesk.today.title")}</p>
            <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("exposureRadar.contentDesk.today.description", { replies: exposureMoves.length, drafts: draftStats.pendingDrafts })}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.contentDesk.content.title")}</p>
              <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.contentDesk.content.description")}</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#2f3336] bg-[#16181c] px-2.5 py-1 text-[11px] font-semibold text-[#8b98a5]">
              <Database className="size-3.5" />
              {t("exposureRadar.contentDesk.metric.plans", { count: draftStats.activePlans })}
            </span>
          </div>
          {topDraft ? (
            <div className="mt-3 rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="line-clamp-2 text-sm font-semibold text-[#e7e9ea]">{topDraft.content_title || topDraft.content_direction || t("exposureRadar.contentDesk.content.untitled")}</p>
                <span className="shrink-0 rounded-full border border-[#2f3336] bg-black px-2 py-1 text-[11px] font-semibold text-[#8b98a5]">{t(`exposureRadar.contentDesk.status.${normalizeContentDraftStatus(topDraft.status)}`)}</span>
              </div>
              <p className="mt-2 line-clamp-3 text-xs leading-5 text-[#8b98a5]">{topDraft.generated_content}</p>
            </div>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-[#2f3336] bg-[#0f1419] px-3 py-6 text-center text-xs text-[#71767b]">{t("exposureRadar.contentDesk.content.empty")}</p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MiniStat icon={<Clock3 className="size-3.5" />} label={t("exposureRadar.contentDesk.metric.pending")} value={String(draftStats.pendingDrafts)} />
            <MiniStat icon={<CheckCircle2 className="size-3.5" />} label={t("exposureRadar.contentDesk.metric.published")} value={String(draftStats.publishedDrafts)} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function XApiBudgetPanel({
  data,
  diagnostics,
  resultRefreshSummary,
  resultRefreshing,
  timeZone,
  onRefreshResults,
}: {
  data: ExposureRadarData | null;
  diagnostics: ExposureRadarDiagnosticsApi | null;
  resultRefreshSummary: ExposureRadarResultRefreshApi | null;
  resultRefreshing: boolean;
  timeZone: string;
  onRefreshResults: () => void;
}) {
  const { t } = useT();
  const mode = apiBudgetMode(diagnostics);
  const visibleCalls = diagnostics ? Math.max(0, (diagnostics.topic_limit || 0) * (diagnostics.search_results || 0)) : 0;
  const lookupScope = resultRefreshSummary?.eligible_count || 0;
  const warnings = apiBudgetWarnings(diagnostics, resultRefreshSummary, t);
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <CardHeader title={t("exposureRadar.apiBudget.title")} description={t("exposureRadar.apiBudget.description")} className="mb-0" />
        <div className="flex flex-wrap gap-2">
          <span className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold ${mode === "conservative" ? "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" : "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]"}`}>
            <Gauge className="size-3.5" />
            {t(`exposureRadar.apiBudget.mode.${mode}`)}
          </span>
          <Button type="button" variant="outline" onClick={onRefreshResults} disabled={resultRefreshing}>
            <RefreshCw className={`size-4 ${resultRefreshing ? "animate-spin" : ""}`} />
            {t("exposureRadar.resultRefresh.button")}
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DiagnosticMetric label={t("exposureRadar.apiBudget.metric.token")} value={diagnostics?.bearer_token_configured ? t("exposureRadar.apiBudget.ready") : t("exposureRadar.apiBudget.missing")} detail={diagnostics?.x_trends_enabled ? t("exposureRadar.apiBudget.xEnabled") : t("exposureRadar.apiBudget.xDisabled")} />
        <DiagnosticMetric label={t("exposureRadar.apiBudget.metric.search")} value={formatCompact(visibleCalls)} detail={t("exposureRadar.apiBudget.metric.searchDetail", { topics: diagnostics?.topic_limit || 0, results: diagnostics?.search_results || 0 })} />
        <DiagnosticMetric label={t("exposureRadar.apiBudget.metric.refresh")} value={`${diagnostics?.refresh_interval_minutes || 0}m`} detail={data?.last_collected_at ? formatDateTime(data.last_collected_at, timeZone) : t("exposureRadar.apiBudget.noCollection")} />
        <DiagnosticMetric label={t("exposureRadar.apiBudget.metric.lookup")} value={formatCompact(lookupScope)} detail={resultRefreshSummary ? t("exposureRadar.apiBudget.metric.lookupDetail", { refreshed: resultRefreshSummary.refreshed_count || 0, failed: resultRefreshSummary.failed_count || 0 }) : t("exposureRadar.apiBudget.metric.lookupEmpty")} />
      </div>
      {warnings.length ? (
        <div className="mt-3 rounded-2xl border border-[#ffd400]/25 bg-[#1f1a07] p-4">
          <p className="text-sm font-semibold text-[#f6d96b]">{t("exposureRadar.apiBudget.warning.title")}</p>
          <ul className="mt-2 space-y-2">
            {warnings.map((warning) => (
              <li key={warning} className="flex gap-2 text-xs leading-5 text-[#e7e9ea]">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#ffd400]" />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-3 rounded-2xl border border-[#2f3336] bg-black p-4">
        <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.apiBudget.guardrail.title")}</p>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {["manual", "bounded", "visible"].map((key) => (
            <div key={key} className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
              <p className="text-xs font-semibold text-[#e7e9ea]">{t(`exposureRadar.apiBudget.guardrail.${key}.title`)}</p>
              <p className="mt-1 text-xs leading-5 text-[#71767b]">{t(`exposureRadar.apiBudget.guardrail.${key}.description`)}</p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function SignalRecoveryPanel({
  data,
  loadState,
  currentHours,
  currentMaxFans,
  onWidenWindow,
  onRaiseFans,
  onRefresh,
}: {
  data: ExposureRadarData | null;
  loadState: LoadState;
  currentHours: number;
  currentMaxFans: number;
  onWidenWindow: () => void;
  onRaiseFans: () => void;
  onRefresh: () => void;
}) {
  const { t } = useT();
  const diagnostics = data?.diagnostics || null;
  const reason = signalRecoveryReason(data, loadState, t);
  const suggestions = signalRecoverySuggestions(diagnostics, t);
  return (
    <Card className="border-[#ffd400]/20 bg-[#120f05]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <CardHeader title={t("exposureRadar.recovery.title")} description={t("exposureRadar.recovery.description")} className="mb-0" />
        <span className="inline-flex h-9 w-fit items-center gap-2 rounded-full border border-[#ffd400]/25 bg-[#ffd400]/10 px-3 text-xs font-semibold text-[#f6d96b]">
          <Search className="size-3.5" />
          {t("exposureRadar.recovery.reason", { reason })}
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DiagnosticMetric label={t("exposureRadar.recovery.metric.visible")} value={formatCompact(diagnostics?.visible_pool_count || data?.items.length || 0)} detail={diagnostics?.top_missing_reason || data?.source_notice || "-"} />
        <DiagnosticMetric label={t("exposureRadar.recovery.metric.hot")} value={formatCompact(diagnostics?.hot_opportunity_count || 0)} detail={t("exposureRadar.recovery.metric.maxViews", { value: formatCompact(diagnostics?.max_impression_count || 0) })} />
        <DiagnosticMetric label={t("exposureRadar.recovery.metric.rising")} value={formatCompact(diagnostics?.rising_opportunity_count || 0)} detail={t("exposureRadar.recovery.metric.maxVelocity", { value: formatOneDecimal(diagnostics?.max_views_per_minute || 0) })} />
        <DiagnosticMetric label={t("exposureRadar.recovery.metric.coverage")} value={`${Math.round((diagnostics?.sampling_coverage || 0) * 100)}%`} detail={t("exposureRadar.recovery.metric.window", { hours: currentHours, fans: formatCompact(currentMaxFans) })} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.recovery.suggestions")}</p>
          <div className="mt-3 space-y-2">
            {suggestions.map((suggestion) => (
              <div key={suggestion} className="flex gap-2 rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2 text-xs leading-5 text-[#8b98a5]">
                <Info className="mt-0.5 size-3.5 shrink-0 text-[#f6d96b]" />
                <span>{suggestion}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.recovery.actionsTitle")}</p>
          <div className="mt-3 grid gap-2">
            <Button type="button" variant="outline" onClick={onWidenWindow} disabled={currentHours >= 8}>
              <Clock3 className="size-4" />
              {t("exposureRadar.recovery.action.widen")}
            </Button>
            <Button type="button" variant="outline" onClick={onRaiseFans} disabled={currentMaxFans >= 50000}>
              <Users className="size-4" />
              {t("exposureRadar.recovery.action.raiseFans")}
            </Button>
            <Button type="button" variant="outline" onClick={onRefresh}>
              <RefreshCw className="size-4" />
              {t("exposureRadar.recovery.action.refresh")}
            </Button>
            <a href="#radar-strategy" className="inline-flex h-9 items-center justify-center gap-1 rounded-full bg-[#1d9bf0] px-3 text-sm font-semibold text-white hover:bg-[#1a8cd8]">
              {t("exposureRadar.recovery.action.strategy")}
              <ArrowRight className="size-4" />
            </a>
          </div>
        </div>
      </div>
    </Card>
  );
}

function GrowthDeskCommandPanel({
  data,
  strategy,
  moves,
  people,
  recentRecords,
  weeklyReview,
  safety,
  timeZone,
  loadState,
  manualActionStates,
  resultRefreshing,
  resultRefreshSummary,
  onRefreshResults,
  onFocusItem,
}: {
  data: ExposureRadarData | null;
  strategy: ExposureRadarGrowthStrategyApi | null;
  moves: DailyActionPlanItem[];
  people: PeopleRadarEntry[];
  recentRecords: ExposureRadarManualRecordApi[];
  weeklyReview: ExposureRadarWeeklyReviewData | null;
  safety: ExposureRadarSafetyCenterData | null;
  timeZone: string;
  loadState: LoadState;
  manualActionStates: Record<string, ManualActionState>;
  resultRefreshing: boolean;
  resultRefreshSummary: ExposureRadarResultRefreshApi | null;
  onRefreshResults: () => void;
  onFocusItem: (itemID: string) => void;
}) {
  const { t } = useT();
  const { pushToast } = useToast();
  const items = data?.items || [];
  const handledToday = recentRecords.filter((record) => isRecentManualRecord(record, 24) && (record.handled_at || record.task_status === "done")).length;
  const backfilledToday = recentRecords.filter((record) => isRecentManualRecord(record, 24) && (record.result_checked_at || record.result_score)).length;
  const pendingBackfill = recentRecords.filter((record) => (record.handled_at || record.published_url || record.task_status === "done") && !record.result_checked_at && !record.result_score).slice(0, 5);
  const bestResult = bestExposureResultRecord(recentRecords);
  const topMove = moves[0];
  const topPeople = people.slice(0, 3);
  const safetyWarnings = (safety?.watch_count || 0) + (safety?.block_count || 0);
  const signalQuality = exposureSignalQualityStatus(data, loadState);
  const learningTopics = buildExposureLearningTopics(recentRecords, items).slice(0, 4);
  const learningAngles = buildExposureLearningAngles(recentRecords, manualActionStates).slice(0, 4);
  const copyBrief = async () => {
    const brief = buildGrowthDeskBrief({
      data,
      strategy,
      moves,
      people: topPeople,
      recentRecords,
      weeklyReview,
      safety,
      timeZone,
      t,
    });
    try {
      await navigator.clipboard.writeText(brief);
      pushToast(t("exposureRadar.command.copyToast"));
    } catch {
      pushToast(t("exposureRadar.manualAction.copyFailed"));
    }
  };

  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <CardHeader title={t("exposureRadar.command.title")} description={t("exposureRadar.command.description")} className="mb-0" />
        <div className="flex flex-wrap gap-2">
          <a href="#radar-workbench" className="inline-flex h-9 items-center gap-1 rounded-full bg-[#1d9bf0] px-3 text-sm font-semibold text-white hover:bg-[#1a8cd8]">
            {t("exposureRadar.command.openWorkbench")}
            <ArrowRight className="size-4" />
          </a>
          <Button type="button" variant="outline" onClick={() => void copyBrief()}>
            <Clipboard className="size-4" />
            {t("exposureRadar.command.copyBrief")}
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {["p58", "p59", "p60", "p61", "p62", "p63", "p64"].map((key) => (
          <span key={key} className="inline-flex items-center gap-1 rounded-full border border-[#2f3336] bg-black px-2.5 py-1 text-[11px] font-semibold text-[#8b98a5]">
            {t(`exposureRadar.command.milestone.${key}`)}
          </span>
        ))}
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.command.plan.title")}</p>
              <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.command.plan.description")}</p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-3 py-1 text-xs font-semibold text-[#8ecdf8]">
              <Clock3 className="size-3.5" />
              {t("exposureRadar.command.plan.timebox")}
            </span>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-4">
            <CommandStep index={1} title={t("exposureRadar.command.plan.scan.title")} detail={t("exposureRadar.command.plan.scan.detail", { count: items.length })} anchor="#radar-setup" />
            <CommandStep index={2} title={t("exposureRadar.command.plan.reply.title")} detail={t("exposureRadar.command.plan.reply.detail", { count: moves.length })} anchor="#radar-workbench" />
            <CommandStep index={3} title={t("exposureRadar.command.plan.people.title")} detail={t("exposureRadar.command.plan.people.detail", { count: topPeople.length })} anchor="#radar-people" />
            <CommandStep index={4} title={t("exposureRadar.command.plan.learn.title")} detail={t("exposureRadar.command.plan.learn.detail", { count: backfilledToday })} anchor="#radar-results" />
          </div>
          {topMove ? (
            <div className="mt-4 rounded-xl border border-[#1d9bf0]/25 bg-[#08131f] p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#8ecdf8]">{t("exposureRadar.command.plan.topMove")}</p>
                  <p className="mt-1 line-clamp-2 text-sm font-semibold text-[#e7e9ea]">{topMove.item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-[#71767b]">{t(`exposureRadar.actionPlan.reason.${topMove.reason}`)}</p>
                </div>
                <Button type="button" size="sm" onClick={() => onFocusItem(topMove.item.id)}>
                  <Search className="size-3.5" />
                  {t("exposureRadar.command.focus")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.command.results.title")}</p>
              <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.command.results.description")}</p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={onRefreshResults} disabled={resultRefreshing || pendingBackfill.length === 0}>
              <RefreshCw className={`size-3.5 ${resultRefreshing ? "animate-spin" : ""}`} />
              {t("exposureRadar.resultRefresh.button")}
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <MiniStat icon={<CheckCircle2 className="size-3.5" />} label={t("exposureRadar.command.results.handled")} value={String(handledToday)} />
            <MiniStat icon={<BarChart3 className="size-3.5" />} label={t("exposureRadar.command.results.backfilled")} value={String(backfilledToday)} />
            <MiniStat icon={<Clock3 className="size-3.5" />} label={t("exposureRadar.command.results.pending")} value={String(pendingBackfill.length)} />
          </div>
          {resultRefreshSummary ? (
            <div className="mt-3 rounded-xl border border-[#1d9bf0]/20 bg-[#08131f] p-3">
              <p className="text-xs font-semibold text-[#8ecdf8]">{t("exposureRadar.resultRefresh.summary", { refreshed: resultRefreshSummary.refreshed_count || 0, eligible: resultRefreshSummary.eligible_count || 0 })}</p>
              <p className="mt-1 text-[11px] leading-5 text-[#71767b]">{resultRefreshSummary.message || t("exposureRadar.resultRefresh.noMessage")}</p>
            </div>
          ) : null}
          {bestResult ? (
            <div className="mt-3 rounded-xl border border-[#00ba7c]/25 bg-[#061a14] p-3">
              <p className="text-xs font-semibold text-[#7ee0b5]">{t("exposureRadar.command.results.best")}</p>
              <p className="mt-1 line-clamp-2 text-sm font-semibold text-[#e7e9ea]">{bestResult.title || bestResult.topic_name || bestResult.signal_id}</p>
              <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("exposureRadar.command.results.bestDetail", { score: bestResult.result_score || 0, impressions: formatCompact(bestResult.result_impression_count || 0) })}</p>
            </div>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-[#2f3336] bg-[#0f1419] px-3 py-4 text-xs leading-5 text-[#71767b]">{t("exposureRadar.command.results.empty")}</p>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.command.people.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.command.people.description")}</p>
          <div className="mt-3 space-y-2">
            {topPeople.length ? topPeople.map((person) => (
              <button key={person.key} type="button" onClick={() => onFocusItem(person.latestItem.id)} className="w-full rounded-xl border border-[#2f3336] bg-[#0f1419] p-3 text-left transition hover:border-[#1d9bf0]/45">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#e7e9ea]">{person.name}</p>
                    {person.handle ? <p className="mt-0.5 text-xs text-[#71767b]">@{person.handle}</p> : null}
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold ${peopleRadarStageTone(person.stage)}`}>{t(`exposureRadar.peopleRadar.stage.${person.stage}`)}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-[#8b98a5]">{t("exposureRadar.command.people.next", { count: person.count, score: person.maxScore })}</p>
              </button>
            )) : <p className="rounded-xl border border-dashed border-[#2f3336] bg-[#0f1419] px-3 py-4 text-xs leading-5 text-[#71767b]">{t("exposureRadar.command.people.empty")}</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.command.safety.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.command.safety.description")}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MiniStat icon={<ShieldAlert className="size-3.5" />} label={t("exposureRadar.command.safety.warnings")} value={String(safetyWarnings)} />
            <MiniStat icon={<Target className="size-3.5" />} label={t("exposureRadar.command.safety.mode")} value={strategy?.safety_mode ? t(`exposureRadar.strategy.safetyMode.${strategy.safety_mode}`) : "-"} />
          </div>
          <ul className="mt-3 space-y-2">
            {["manual", "pace", "fit"].map((key) => (
              <li key={key} className="flex gap-2 text-xs leading-5 text-[#8b98a5]">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#00ba7c]" />
                <span>{t(`exposureRadar.command.safety.rule.${key}`)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.command.signalHealth.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.command.signalHealth.description")}</p>
          <div className={`mt-3 rounded-xl border p-3 ${signalQualityTone(signalQuality)}`}>
            <p className="text-sm font-semibold">{t(`exposureRadar.command.signalHealth.status.${signalQuality}`)}</p>
            <p className="mt-1 text-xs leading-5 opacity-85">{signalHealthDetail(data, loadState, t)}</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MiniStat icon={<Eye className="size-3.5" />} label={t("exposureRadar.command.signalHealth.maxViews")} value={formatCompact(data?.diagnostics?.max_impression_count || 0)} />
            <MiniStat icon={<Gauge className="size-3.5" />} label={t("exposureRadar.command.signalHealth.maxVelocity")} value={formatVelocityLabel(data?.diagnostics?.max_views_per_minute || 0, "-")} />
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.command.learning.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.command.learning.description")}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <CommandList title={t("exposureRadar.command.learning.topics")} items={learningTopics} empty={t("exposureRadar.command.learning.empty")} />
            <CommandList title={t("exposureRadar.command.learning.angles")} items={learningAngles} empty={t("exposureRadar.command.learning.empty")} />
          </div>
        </div>
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.command.brief.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.command.brief.description")}</p>
          <div className="mt-3 rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
            <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.command.brief.previewTitle")}</p>
            <p className="mt-2 whitespace-pre-line text-xs leading-5 text-[#8b98a5]">{buildGrowthDeskBriefPreview({ data, moves, people: topPeople, safety, weeklyReview, t })}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

function CommandStep({ index, title, detail, anchor }: { index: number; title: string; detail: string; anchor: string }) {
  return (
    <a href={anchor} className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3 transition hover:border-[#1d9bf0]/45 hover:bg-[#1d9bf0]/10">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex size-7 items-center justify-center rounded-full border border-[#2f3336] bg-black text-[11px] font-semibold text-[#8ecdf8]">0{index}</span>
        <ArrowRight className="size-3.5 text-[#71767b]" />
      </div>
      <p className="mt-2 text-sm font-semibold text-[#e7e9ea]">{title}</p>
      <p className="mt-1 text-xs leading-5 text-[#71767b]">{detail}</p>
    </a>
  );
}

function CommandList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
      <p className="text-xs font-semibold text-[#e7e9ea]">{title}</p>
      {items.length ? (
        <ul className="mt-2 space-y-2">
          {items.map((item) => (
            <li key={item} className="flex gap-2 text-xs leading-5 text-[#8b98a5]">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#1d9bf0]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs leading-5 text-[#71767b]">{empty}</p>
      )}
    </div>
  );
}

function SegmentedControl({ label, options, value, onChange }: { label: string; options: Array<{ value: string; label: string }>; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <p className="text-xs font-semibold text-[#8b98a5]">{label}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 rounded-2xl border border-[#2f3336] bg-black p-1">
        {options.map((option) => (
          <button key={option.value} type="button" onClick={() => onChange(option.value)} className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${value === option.value ? "bg-[#1d9bf0] text-white" : "text-[#8b98a5] hover:bg-[#16181c] hover:text-[#e7e9ea]"}`}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function NumberButtons({ label, values, value, suffix, formatter, onChange, disabled }: { label: string; values: number[]; value: number; suffix?: string; formatter?: (value: number) => string; onChange: (value: number) => void; disabled?: boolean }) {
  return (
    <div className={disabled ? "opacity-45" : ""}>
      <p className="text-xs font-semibold text-[#8b98a5]">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.map((option) => (
          <button key={option} type="button" disabled={disabled} onClick={() => onChange(option)} className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${value === option ? "border-[#1d9bf0] bg-[#1d9bf0]/15 text-[#8ecdf8]" : "border-[#2f3336] bg-black text-[#8b98a5] hover:border-[#1d9bf0]/45"}`}>
            {formatter ? formatter(option) : `${option}${suffix || ""}`}
          </button>
        ))}
      </div>
    </div>
  );
}

function FirstDayLaunchPanel({
  selectedAccountID,
  selectedBotID,
  accounts,
  bots,
  strategy,
  moves,
  recentRecords,
  contentDraftBridge,
}: {
  selectedAccountID: number;
  selectedBotID: number;
  accounts: AccountListItem[];
  bots: OAFBot[];
  strategy: ExposureRadarGrowthStrategyApi | null;
  moves: DailyActionPlanItem[];
  recentRecords: ExposureRadarManualRecordApi[];
  contentDraftBridge: ContentDraftBridgeData;
}) {
  const { t } = useT();
  const strategyReady = Boolean(strategy?.target_audience || strategy?.core_topics?.length);
  const handledCount = recentRecords.filter((record) => record.handled_at || record.task_status === "done").length;
  const resultCount = recentRecords.filter((record) => record.result_checked_at || record.result_score).length;
  const savedCount = recentRecords.filter((record) => record.saved_at || record.saved_memory_id).length;
  const pendingDraftCount = contentDraftBridge.drafts.filter((draft) => draft.status === "draft" || draft.status === "pending_review" || draft.status === "approved" || draft.status === "ready_to_publish").length;
  const steps: Array<{ key: FirstDayStepKey; done: boolean; anchor: string }> = ([
    { key: "account", done: selectedAccountID > 0 && selectedBotID > 0 },
    { key: "strategy", done: strategyReady },
    { key: "queue", done: moves.length > 0 },
    { key: "result", done: resultCount > 0 || handledCount > 0 },
  ] satisfies Array<{ key: FirstDayStepKey; done: boolean }>).map((step) => ({
    ...step,
    anchor: step.key === "account" ? "#radar-setup" : step.key === "strategy" ? "#radar-strategy" : "#radar-workbench",
  }));
  const doneCount = steps.filter((step) => step.done).length;
  const nextStep = steps.find((step) => !step.done) || steps[steps.length - 1];
  const selectedAccount = accounts.find((account) => account.id === selectedAccountID);
  const selectedBot = bots.find((bot) => bot.id === selectedBotID);
  const checklist = [
    { key: "account", done: selectedAccountID > 0 && selectedBotID > 0, value: selectedAccount ? `@${selectedAccount.username}` : t("exposureRadar.firstDay.selected.missing") },
    { key: "strategy", done: strategyReady, value: strategy?.target_audience || t("exposureRadar.firstDay.selected.missing") },
    { key: "queue", done: moves.length > 0, value: String(moves.length) },
    { key: "reply", done: moves.some((entry) => entry.item.generated_comment || entry.item.review_task_id) || handledCount > 0, value: String(moves.filter((entry) => entry.item.generated_comment || entry.item.review_task_id).length) },
    { key: "seed", done: savedCount > 0 || pendingDraftCount > 0, value: String(savedCount + pendingDraftCount) },
    { key: "result", done: resultCount > 0, value: String(resultCount) },
  ];
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <CardHeader title={t("exposureRadar.firstDay.title")} description={t("exposureRadar.firstDay.description")} className="mb-0" />
          <div className="mt-3 flex flex-wrap gap-2">
            <LeaderboardPill label={t("exposureRadar.firstDay.metric.ready")} value={moves.length} tone="border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]" />
            <LeaderboardPill label={t("exposureRadar.firstDay.metric.handled")} value={handledCount} tone="border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" />
            <LeaderboardPill label={t("exposureRadar.firstDay.metric.backfilled")} value={resultCount} tone="border-[#7856ff]/25 bg-[#7856ff]/10 text-[#c4b5fd]" />
          </div>
        </div>
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4 lg:min-w-64">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] text-[#71767b]">{t("exposureRadar.firstDay.progress")}</p>
              <p className="text-2xl font-semibold text-white">{doneCount}/4</p>
            </div>
            <a href={nextStep.anchor} className="inline-flex h-9 items-center gap-1 rounded-full bg-[#1d9bf0] px-3 text-xs font-semibold text-white hover:bg-[#1a8cd8]">
              {doneCount === steps.length ? t("exposureRadar.firstDay.cta.done") : t(`exposureRadar.firstDay.cta.${nextStep.key}`)}
              <ArrowRight className="size-3.5" />
            </a>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#202327]">
            <div className="h-full rounded-full bg-[#1d9bf0]" style={{ width: `${Math.round((doneCount / steps.length) * 100)}%` }} />
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-3">
        <FirstDaySetupChip icon={<Users className="size-3.5" />} label={t("exposureRadar.firstDay.selected.account")} value={selectedAccount ? `@${selectedAccount.username}` : t("exposureRadar.firstDay.selected.missing")} />
        <FirstDaySetupChip icon={<Bot className="size-3.5" />} label={t("exposureRadar.firstDay.selected.bot")} value={selectedBot?.name || (selectedBotID ? t("oafBots.botNumber", { id: selectedBotID }) : t("exposureRadar.firstDay.selected.missing"))} />
        <FirstDaySetupChip icon={<Target className="size-3.5" />} label={t("exposureRadar.firstDay.selected.lane")} value={strategy?.target_audience || t("exposureRadar.firstDay.selected.missing")} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {steps.map((step, index) => (
          <a key={step.key} href={step.anchor} className={`rounded-2xl border p-4 transition hover:border-[#1d9bf0]/45 ${step.done ? "border-[#00ba7c]/25 bg-[#00ba7c]/10" : step.key === nextStep.key ? "border-[#1d9bf0]/45 bg-[#1d9bf0]/10" : "border-[#2f3336] bg-black"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex size-7 items-center justify-center rounded-full border border-[#2f3336] text-xs font-semibold text-[#8b98a5]">{index + 1}</span>
              {step.done ? <CheckCircle2 className="size-4 text-[#7ee0b5]" /> : <Clock3 className="size-4 text-[#71767b]" />}
            </div>
            <p className="mt-3 text-sm font-semibold text-[#e7e9ea]">{t(`exposureRadar.firstDay.${step.key}.title`)}</p>
            <p className="mt-1 text-xs leading-5 text-[#71767b]">{t(`exposureRadar.firstDay.${step.key}.description`)}</p>
          </a>
        ))}
      </div>
      <div className="mt-4 rounded-2xl border border-[#2f3336] bg-black p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.firstDay.checklist.title")}</p>
            <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.firstDay.checklist.description")}</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#2f3336] bg-[#16181c] px-3 py-1 text-xs font-semibold text-[#8b98a5]">
            <CheckCircle2 className="size-3.5" />
            {checklist.filter((item) => item.done).length}/{checklist.length}
          </span>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {checklist.map((item) => (
            <div key={item.key} className={`rounded-xl border p-3 ${item.done ? "border-[#00ba7c]/25 bg-[#00ba7c]/10" : "border-[#2f3336] bg-[#0f1419]"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-[#e7e9ea]">{t(`exposureRadar.firstDay.checklist.${item.key}.title`)}</p>
                {item.done ? <CheckCircle2 className="size-3.5 text-[#7ee0b5]" /> : <Clock3 className="size-3.5 text-[#71767b]" />}
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-[#71767b]">{t(`exposureRadar.firstDay.checklist.${item.key}.description`)}</p>
              <p className="mt-2 truncate text-xs font-semibold text-[#8ecdf8]">{item.value}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-[#2f3336] bg-black p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.firstDay.timebox.title")}</p>
            <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.firstDay.timebox.description")}</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#2f3336] bg-[#16181c] px-3 py-1 text-xs font-semibold text-[#8b98a5]">
            <Clock3 className="size-3.5" />
            {t("exposureRadar.firstDay.timebox.total")}
          </span>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          {["strategy", "scan", "reply", "backfill"].map((key) => (
            <div key={key} className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
              <p className="text-[11px] font-semibold text-[#8ecdf8]">{t(`exposureRadar.firstDay.timebox.${key}.time`)}</p>
              <p className="mt-1 text-xs font-semibold text-[#e7e9ea]">{t(`exposureRadar.firstDay.timebox.${key}.title`)}</p>
              <p className="mt-1 text-[11px] leading-5 text-[#71767b]">{t(`exposureRadar.firstDay.timebox.${key}.description`)}</p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function FirstDaySetupChip({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-black p-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-[#71767b]">{icon}{label}</div>
      <p className="mt-1 truncate text-sm font-semibold text-[#e7e9ea]">{value}</p>
    </div>
  );
}

function StrategySetupPanel({ strategy, region, saving, onSave }: { strategy: ExposureRadarGrowthStrategyApi | null; region: ExposureRadarRegion; saving: boolean; onSave: (form: StrategyFormState) => void }) {
  const { t } = useT();
  const [form, setForm] = useState<StrategyFormState>(() => strategyFormFromApi(strategy));
  const templates = useMemo(() => buildStarterStrategyTemplates(t, region), [region, t]);
  useEffect(() => {
    setForm(strategyFormFromApi(strategy));
  }, [strategy]);
  const setField = <K extends keyof StrategyFormState,>(key: K, value: StrategyFormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const applyTemplate = (template: StarterStrategyTemplate) => {
    setForm((current) => ({
      ...current,
      ...template.form,
    }));
  };
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <CardHeader title={t("exposureRadar.strategy.title")} description={t("exposureRadar.strategy.description")} className="mb-0" />
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-3 py-1 text-xs font-semibold text-[#8ecdf8]">
          <SlidersHorizontal className="size-3.5" />
          {t(`exposureRadar.region.${region}`)}
        </span>
      </div>
      <div className="mt-4 rounded-2xl border border-[#2f3336] bg-black p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.strategy.templates.title")}</p>
            <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.strategy.templates.description")}</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#2f3336] bg-[#16181c] px-3 py-1 text-xs font-semibold text-[#8b98a5]">
            <Target className="size-3.5" />
            {t("exposureRadar.strategy.templates.badge")}
          </span>
        </div>
        <div className="mt-3 grid gap-2 lg:grid-cols-4">
          {templates.map((template) => (
            <button key={template.key} type="button" onClick={() => applyTemplate(template)} className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3 text-left transition hover:border-[#1d9bf0]/45 hover:bg-[#1d9bf0]/10">
              <p className="text-sm font-semibold text-[#e7e9ea]">{t(`exposureRadar.strategy.templates.${template.key}.name`)}</p>
              <p className="mt-1 min-h-10 text-xs leading-5 text-[#8b98a5]">{t(`exposureRadar.strategy.templates.${template.key}.description`)}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#8ecdf8]">
                {t("exposureRadar.strategy.templates.apply")}
                <ArrowRight className="size-3.5" />
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <StrategyInput label={t("exposureRadar.strategy.targetAudience")} value={form.targetAudience} onChange={(value) => setField("targetAudience", value)} placeholder={t("exposureRadar.strategy.targetAudiencePlaceholder")} />
        <label>
          <span className="text-xs font-semibold text-[#8b98a5]">{t("exposureRadar.strategy.primaryGoal")}</span>
          <select value={form.primaryGoal} onChange={(event) => setField("primaryGoal", event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none focus:border-[#1d9bf0]">
            {["awareness", "relationships", "traffic", "community", "research"].map((option) => (
              <option key={option} value={option}>{t(`exposureRadar.strategy.goal.${option}`)}</option>
            ))}
          </select>
        </label>
        <StrategyInput label={t("exposureRadar.strategy.coreTopics")} value={form.coreTopics} onChange={(value) => setField("coreTopics", value)} placeholder={t("exposureRadar.strategy.coreTopicsPlaceholder")} />
        <StrategyInput label={t("exposureRadar.strategy.avoidTopics")} value={form.avoidTopics} onChange={(value) => setField("avoidTopics", value)} placeholder={t("exposureRadar.strategy.avoidTopicsPlaceholder")} />
        <StrategyInput label={t("exposureRadar.strategy.competitors")} value={form.competitors} onChange={(value) => setField("competitors", value)} placeholder={t("exposureRadar.strategy.competitorsPlaceholder")} />
        <div className="grid gap-3 sm:grid-cols-3">
          <label>
            <span className="text-xs font-semibold text-[#8b98a5]">{t("exposureRadar.strategy.replyStyle")}</span>
            <select value={form.replyStyle} onChange={(event) => setField("replyStyle", event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none focus:border-[#1d9bf0]">
              {["operator_observation", "light_question", "peer_experience", "caution_note"].map((option) => (
                <option key={option} value={option}>{t(`exposureRadar.strategy.replyStyle.${option}`)}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-xs font-semibold text-[#8b98a5]">{t("exposureRadar.strategy.dailyMoveLimit")}</span>
            <input inputMode="numeric" value={String(form.dailyMoveLimit)} onChange={(event) => setField("dailyMoveLimit", Math.max(1, Math.min(50, Number(event.target.value.replace(/[^\d]/g, "")) || 1)))} className="mt-2 h-10 w-full rounded-xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none focus:border-[#1d9bf0]" />
          </label>
          <label>
            <span className="text-xs font-semibold text-[#8b98a5]">{t("exposureRadar.strategy.safetyMode")}</span>
            <select value={form.safetyMode} onChange={(event) => setField("safetyMode", event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none focus:border-[#1d9bf0]">
              {["conservative", "balanced", "growth"].map((option) => (
                <option key={option} value={option}>{t(`exposureRadar.strategy.safetyMode.${option}`)}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end">
        <StrategyInput label={t("exposureRadar.strategy.operatorNotes")} value={form.operatorNotes} onChange={(value) => setField("operatorNotes", value)} placeholder={t("exposureRadar.strategy.operatorNotesPlaceholder")} />
        <Button type="button" disabled={saving} onClick={() => onSave(form)} className="shrink-0">
          {saving ? <RefreshCw className="size-4 animate-spin" /> : <Target className="size-4" />}
          {t("exposureRadar.strategy.save")}
        </Button>
      </div>
    </Card>
  );
}

function GrowthReviewPanel({ review, safety, recentRecords, timeZone }: { review: ExposureRadarWeeklyReviewData | null; safety: ExposureRadarSafetyCenterData | null; recentRecords: ExposureRadarManualRecordApi[]; timeZone: string }) {
  const { t } = useT();
  const latestResult = recentRecords.find((record) => record.result_checked_at || record.result_score);
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Card className="bg-[#0f1419]">
        <CardHeader title={t("exposureRadar.weeklyReview.title")} description={t("exposureRadar.weeklyReview.description")} />
        <div className="grid gap-3 sm:grid-cols-4">
          <ActionPlanMetric label={t("exposureRadar.weeklyReview.metric.handled")} value={review?.handled_count || 0} />
          <ActionPlanMetric label={t("exposureRadar.weeklyReview.metric.published")} value={review?.published_count || 0} />
          <ActionPlanMetric label={t("exposureRadar.weeklyReview.metric.effective")} value={review ? `${Math.round((review.effective_rate || 0) * 100)}%` : "0%"} />
          <ActionPlanMetric label={t("exposureRadar.weeklyReview.metric.resultScore")} value={review ? Math.round(review.average_result_score || 0) : 0} />
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <ReviewList title={t("exposureRadar.weeklyReview.topTopics")} items={(review?.top_topics || []).map((topic) => `${topic.topic_name} · ${topic.count}/${topic.effective}`)} empty={t("exposureRadar.weeklyReview.empty")} />
          <ReviewList title={t("exposureRadar.weeklyReview.recommendations")} items={review?.recommendations || []} empty={t("exposureRadar.weeklyReview.empty")} />
        </div>
      </Card>
      <Card className="bg-[#0f1419]">
        <CardHeader title={t("exposureRadar.safetyCenter.title")} description={t("exposureRadar.safetyCenter.description")} />
        <div className="grid grid-cols-3 gap-2">
          <ActionPlanMetric label={t("exposureRadar.safetyCenter.pass")} value={safety?.pass_count || 0} />
          <ActionPlanMetric label={t("exposureRadar.safetyCenter.watch")} value={safety?.watch_count || 0} />
          <ActionPlanMetric label={t("exposureRadar.safetyCenter.block")} value={safety?.block_count || 0} />
        </div>
        <ReviewList title={t("exposureRadar.safetyCenter.warnings")} items={safety?.warnings || []} empty={t("exposureRadar.safetyCenter.empty")} />
        {latestResult ? (
          <p className="mt-3 text-xs leading-5 text-[#71767b]">
            {t("exposureRadar.weeklyReview.latestResult", { time: latestResult.result_checked_at ? formatDateTime(latestResult.result_checked_at, timeZone) : "-", score: latestResult.result_score || 0 })}
          </p>
        ) : null}
      </Card>
    </div>
  );
}

function StrategyInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="min-w-0 flex-1">
      <span className="text-xs font-semibold text-[#8b98a5]">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-2 h-10 w-full rounded-xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none transition focus:border-[#1d9bf0]" />
    </label>
  );
}

function ReviewList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="mt-4 rounded-2xl border border-[#2f3336] bg-black p-3">
      <p className="text-xs font-semibold text-[#e7e9ea]">{title}</p>
      {items.length ? (
        <ul className="mt-2 space-y-2">
          {items.slice(0, 5).map((item, index) => (
            <li key={`${item}-${index}`} className="flex gap-2 text-xs leading-5 text-[#8b98a5]">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[#1d9bf0]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs leading-5 text-[#71767b]">{empty}</p>
      )}
    </div>
  );
}

function TodayMovesPanel({
  moves,
  stats,
  activeID,
  onFocus,
  onTaskStatus,
}: {
  moves: DailyActionPlanItem[];
  stats: WorkbenchStats;
  activeID: string;
  onFocus: (itemID: string) => void;
  onTaskStatus: (item: ExposureRadarItemApi, taskStatus: DailyTaskStatus) => void;
}) {
  const { t } = useT();
  const replyMoves = moves.filter((entry) => entry.action === "publish_reply" || entry.action === "generate_reply").length;
  const memoryMoves = moves.filter((entry) => entry.action === "save_memory").length;
  const inspectMoves = moves.length - replyMoves - memoryMoves;
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <CardHeader title={t("exposureRadar.todayMoves.title")} description={t("exposureRadar.todayMoves.description")} className="mb-0" />
        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
          <ActionPlanMetric label={t("exposureRadar.todayMoves.metric.moves")} value={moves.length} />
          <ActionPlanMetric label={t("exposureRadar.todayMoves.metric.actNow")} value={stats.actNow} />
          <ActionPlanMetric label={t("exposureRadar.todayMoves.metric.handled")} value={stats.handled} />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <LeaderboardPill label={t("exposureRadar.actionPlan.metric.reply")} value={replyMoves} tone="border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]" />
        <LeaderboardPill label={t("exposureRadar.actionPlan.metric.save")} value={memoryMoves} tone="border-[#7856ff]/25 bg-[#7856ff]/10 text-[#c4b5fd]" />
        <LeaderboardPill label={t("exposureRadar.actionPlan.metric.inspect")} value={inspectMoves} tone="border-[#2f3336] bg-[#16181c] text-[#8b98a5]" />
      </div>
      {moves.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-[#2f3336] bg-black px-4 py-8 text-center text-sm text-[#71767b]">
          {t("exposureRadar.todayMoves.empty")}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {moves.map((entry, index) => {
            const item = entry.item;
            const replyAngle = buildReplyAngleSuggestions(item, t)[0];
            const qualityStage = normalizeQualityStage(item.quality_stage, item);
            const selected = activeID === item.id;
            return (
              <div key={item.id} className={`rounded-2xl border p-4 transition ${selected ? "border-[#1d9bf0]/55 bg-[#1d9bf0]/10" : "border-[#2f3336] bg-black"}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex size-7 items-center justify-center rounded-full border border-[#1d9bf0]/35 bg-[#1d9bf0]/10 text-xs font-bold text-[#8ecdf8]">{index + 1}</span>
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${actionPlanTone(entry.action)}`}>
                        {actionPlanIcon(entry.action)}
                        {t(`exposureRadar.actionPlan.action.${entry.action}`)}
                      </span>
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${qualityStageClass(qualityStage)}`}>
                        <Zap className="size-3.5" />
                        {t(`exposureRadar.qualityStage.${qualityStage}`)}
                      </span>
                    </div>
                    <h2 className="mt-3 line-clamp-2 text-sm font-semibold leading-5 text-[#e7e9ea]">{item.title}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[#71767b]">
                      {item.author_handle ? <span>@{item.author_handle}</span> : null}
                      <span>{item.score} {t("exposureRadar.card.score")}</span>
                      <span>{formatVelocityLabel(item.views_per_min, t("exposureRadar.card.velocitySampling"))}</span>
                      {typeof item.followers_count === "number" && item.followers_count > 0 ? <span>{formatCompact(item.followers_count)} {t("exposureRadar.todayMoves.followers")}</span> : null}
                    </div>
                  </div>
                  <Button type="button" size="sm" variant={selected ? "default" : "outline"} onClick={() => onFocus(item.id)}>
                    <Search className="size-3.5" />
                    {t("exposureRadar.todayMoves.focus")}
                  </Button>
                </div>
                <div className="mt-3 rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#71767b]">{t("exposureRadar.todayMoves.why")}</p>
                  <p className="mt-1 text-xs leading-5 text-[#c9d1d9]">{t(`exposureRadar.actionPlan.reason.${entry.reason}`)}</p>
                </div>
                {replyAngle ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#1d9bf0]/20 bg-[#08131f] px-3 py-2">
                    <MessageCircle className="size-3.5 text-[#8ecdf8]" />
                    <span className="text-[11px] font-semibold text-[#8ecdf8]">{t("exposureRadar.todayMoves.replyAngle")}</span>
                    <span className="text-xs text-[#e7e9ea]">{replyAngle.title}</span>
                    <span className="text-[11px] text-[#71767b]">{replyAngle.tone}</span>
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2 border-t border-[#2f3336] pt-3">
                  <Button type="button" size="sm" variant="outline" onClick={() => onTaskStatus(item, "done")}>
                    <CheckCircle2 className="size-3.5" />
                    {t("exposureRadar.todayMoves.done")}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => onTaskStatus(item, "later")}>
                    <Clock3 className="size-3.5" />
                    {t("exposureRadar.todayMoves.later")}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => onTaskStatus(item, "skipped")}>
                    <ShieldAlert className="size-3.5" />
                    {t("exposureRadar.todayMoves.skip")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function PeopleRadarPanel({
  people,
  savingKey,
  onSaveNote,
  onFocus,
}: {
  people: PeopleRadarEntry[];
  savingKey: string;
  onSaveNote: (person: PeopleRadarEntry, stage: string, notes: string, tags: string) => void;
  onFocus: (itemID: string) => void;
}) {
  const { t } = useT();
  const priorityCount = people.filter((person) => person.stage === "priority").length;
  const repeatCount = people.filter((person) => person.stage === "repeat").length;
  const engagedCount = people.filter((person) => person.stage === "engaged").length;
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <CardHeader title={t("exposureRadar.peopleRadar.title")} description={t("exposureRadar.peopleRadar.description")} className="mb-0" />
        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
          <ActionPlanMetric label={t("exposureRadar.peopleRadar.metric.people")} value={people.length} />
          <ActionPlanMetric label={t("exposureRadar.peopleRadar.metric.priority")} value={priorityCount} />
          <ActionPlanMetric label={t("exposureRadar.peopleRadar.metric.engaged")} value={engagedCount} />
        </div>
      </div>
      {people.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-[#2f3336] bg-black px-4 py-8 text-center text-sm text-[#71767b]">
          {t("exposureRadar.peopleRadar.empty")}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 xl:grid-cols-3">
          {people.slice(0, 6).map((person) => (
            <PeopleRadarCard key={`${person.key}-${person.crmStage || person.stage}-${person.notes || ""}-${(person.tags || []).join("|")}`} person={person} saving={savingKey === person.key} onSaveNote={onSaveNote} onFocus={onFocus} />
          ))}
        </div>
      )}
      {repeatCount > 0 ? (
        <p className="mt-3 text-xs leading-5 text-[#71767b]">{t("exposureRadar.peopleRadar.repeatHint", { count: repeatCount })}</p>
      ) : null}
    </Card>
  );
}

function PeopleRadarCard({ person, saving, onSaveNote, onFocus }: { person: PeopleRadarEntry; saving: boolean; onSaveNote: (person: PeopleRadarEntry, stage: string, notes: string, tags: string) => void; onFocus: (itemID: string) => void }) {
  const { t } = useT();
  const [stage, setStage] = useState(person.crmStage || person.stage || "new");
  const [notes, setNotes] = useState(person.notes || "");
  const [tags, setTags] = useState((person.tags || []).join(", "));
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#e7e9ea]">{person.name}</p>
                  {person.handle ? <p className="mt-0.5 text-xs text-[#71767b]">@{person.handle}</p> : null}
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold ${peopleRadarStageTone(person.stage)}`}>
                  <Users className="size-3.5" />
                  {t(`exposureRadar.peopleRadar.stage.${person.stage}`)}
                </span>
                {person.persisted ? (
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#7856ff]/25 bg-[#7856ff]/10 px-2 py-1 text-[11px] font-semibold text-[#c4b5fd]">
                    <Database className="size-3.5" />
                    {t("exposureRadar.peopleRadar.history")}
                  </span>
                ) : null}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <MiniStat icon={<Zap className="size-3.5" />} label={t("exposureRadar.peopleRadar.count")} value={String(person.count)} />
                <MiniStat icon={<Flame className="size-3.5" />} label={t("exposureRadar.peopleRadar.score")} value={String(person.maxScore)} />
                <MiniStat icon={<Heart className="size-3.5" />} label={t("exposureRadar.peopleRadar.engagement")} value={formatCompact(person.totalEngagement)} />
              </div>
              <div className="mt-3 rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#71767b]">{t("exposureRadar.peopleRadar.latest")}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#c9d1d9]">{person.latestItem.title}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#71767b]">
                  <span>{person.drafted} {t("exposureRadar.peopleRadar.drafted")}</span>
                  <span>{person.saved} {t("exposureRadar.peopleRadar.saved")}</span>
                  <span>{person.handled} {t("exposureRadar.peopleRadar.handled")}</span>
                  {person.feedback ? <span>{person.feedback} {t("exposureRadar.peopleRadar.feedback")}</span> : null}
                  {typeof person.followers === "number" && person.followers > 0 ? <span>{formatCompact(person.followers)} {t("exposureRadar.todayMoves.followers")}</span> : null}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => onFocus(person.latestItem.id)}>
                  <Search className="size-3.5" />
                  {t("exposureRadar.peopleRadar.focus")}
                </Button>
                {person.handle ? (
                  <a href={`https://x.com/${person.handle}`} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-full border border-[#2f3336] px-2.5 text-[0.8rem] font-semibold text-white hover:bg-[#16181c]">
                    {t("exposureRadar.peopleRadar.openProfile")}
                    <ExternalLink className="size-3.5" />
                  </a>
                ) : null}
              </div>
              <div className="mt-3 rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label>
                    <span className="text-[11px] text-[#71767b]">{t("exposureRadar.peopleRadar.crmStage")}</span>
                    <select value={stage} onChange={(event) => setStage(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-[#2f3336] bg-black px-2 text-xs font-semibold text-[#e7e9ea] outline-none focus:border-[#1d9bf0]">
                      {["priority", "watch", "engaged", "avoid", "new"].map((option) => (
                        <option key={option} value={option}>{t(`exposureRadar.peopleRadar.crm.${option}`)}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="text-[11px] text-[#71767b]">{t("exposureRadar.peopleRadar.tags")}</span>
                    <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder={t("exposureRadar.peopleRadar.tagsPlaceholder")} className="mt-1 h-9 w-full rounded-lg border border-[#2f3336] bg-black px-2 text-xs text-[#e7e9ea] outline-none focus:border-[#1d9bf0]" />
                  </label>
                </div>
                <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t("exposureRadar.peopleRadar.notesPlaceholder")} className="mt-2 h-9 w-full rounded-lg border border-[#2f3336] bg-black px-2 text-xs text-[#e7e9ea] outline-none focus:border-[#1d9bf0]" />
                <Button type="button" size="sm" variant="outline" disabled={saving || !person.handle} onClick={() => onSaveNote(person, stage, notes, tags)} className="mt-2">
                  {saving ? <RefreshCw className="size-3.5 animate-spin" /> : <Database className="size-3.5" />}
                  {t("exposureRadar.peopleRadar.saveNote")}
                </Button>
              </div>
    </div>
  );
}

function HandlingWorkbenchPanel({
  queue,
  activeID,
  stats,
  draftingID,
  draftDisabled,
  handlingID,
  savingMemoryID,
  savingSeedID,
  generatingSeedDraftID,
  memoryDisabled,
  savedMemoryIDs,
  selectedReplyAngleIDs,
  onCreateDraft,
  onMarkHandled,
  onSaveMemory,
  onSaveContentSeed,
  onGenerateContentDraft,
  onManualAction,
  onSelectReplyAngle,
  onActiveChange,
  onFocusItem,
}: {
  queue: DailyActionPlanItem[];
  activeID: string;
  stats: WorkbenchStats;
  draftingID: string | null;
  draftDisabled: boolean;
  handlingID: string | null;
  savingMemoryID: string | null;
  savingSeedID: string | null;
  generatingSeedDraftID: string | null;
  memoryDisabled: boolean;
  savedMemoryIDs: Set<string>;
  selectedReplyAngleIDs: Record<string, string>;
  onCreateDraft: (item: ExposureRadarItemApi, replyAngle?: ReplyAngleSuggestion) => void;
  onMarkHandled: (item: ExposureRadarItemApi, publishedURL: string) => MaybePromise<void>;
  onSaveMemory: (item: ExposureRadarItemApi, replyAngle?: ReplyAngleSuggestion) => void;
  onSaveContentSeed: (item: ExposureRadarItemApi) => void;
  onGenerateContentDraft: (item: ExposureRadarItemApi) => void;
  onManualAction: (item: ExposureRadarItemApi, patch: Partial<ManualActionState>, replyAngle?: ReplyAngleSuggestion) => void;
  onSelectReplyAngle: (itemID: string, angleID: string) => void;
  onActiveChange: (itemID: string) => void;
  onFocusItem: (itemID: string) => void;
}) {
  const { t } = useT();
  const { pushToast } = useToast();
  const activeIndex = Math.max(0, queue.findIndex((entry) => entry.item.id === activeID));
  const activeEntry = queue[activeIndex] || queue[0];
  const activeItem = activeEntry?.item;
  const nextEntry = queue[activeIndex + 1] || queue.find((entry) => entry.item.id !== activeItem?.id);
  const previousEntry = activeIndex > 0 ? queue[activeIndex - 1] : undefined;
  const activeExplanation = activeItem ? buildOpportunityExplanation(activeItem, t) : null;
  const replyAngles = activeItem ? buildReplyAngleSuggestions(activeItem, t) : [];
  const selectedReplyAngle = replyAngles.find((angle) => angle.id === selectedReplyAngleIDs[activeItem?.id || ""]) || replyAngles[0];
  const copyWorkbenchReply = async () => {
    if (!activeItem?.generated_comment) return;
    try {
      await navigator.clipboard.writeText(activeItem.generated_comment);
      onManualAction(activeItem, { copied: true, taskStatus: "in_progress" }, selectedReplyAngle);
      pushToast(t("exposureRadar.manualAction.copied"));
    } catch {
      pushToast(t("exposureRadar.manualAction.copyFailed"));
    }
  };
  const completeCurrentAndMoveNext = async () => {
    if (!activeItem) return;
    const nextID = nextEntry?.item.id || previousEntry?.item.id || "";
    await Promise.resolve(onMarkHandled(activeItem, ""));
    if (nextID) onActiveChange(nextID);
  };
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <CardHeader title={t("exposureRadar.workbench.title")} description={t("exposureRadar.workbench.description")} className="mb-0" />
        <div className="flex flex-wrap gap-2">
          <ActionPlanMetric label={t("exposureRadar.workbench.metric.queue")} value={stats.pending} />
          <ActionPlanMetric label={t("exposureRadar.workbench.metric.actNow")} value={stats.actNow} />
          <ActionPlanMetric label={t("exposureRadar.workbench.metric.handled")} value={stats.handled} />
        </div>
      </div>
      {queue.length === 0 || !activeItem ? (
        <div className="mt-4 rounded-2xl border border-dashed border-[#2f3336] bg-black px-4 py-8 text-center text-sm text-[#71767b]">
          {t("exposureRadar.workbench.empty")}
        </div>
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-2xl border border-[#1d9bf0]/20 bg-black p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-3 py-1 text-xs font-semibold text-[#8ecdf8]">
                {t("exposureRadar.workbench.focus", { current: activeIndex + 1, total: queue.length })}
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${actionPlanTone(activeEntry.action)}`}>
                {actionPlanIcon(activeEntry.action)}
                {t(`exposureRadar.actionPlan.action.${activeEntry.action}`)}
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${qualityStageClass(normalizeQualityStage(activeItem.quality_stage, activeItem))}`} title={activeItem.quality_reason || undefined}>
                <Zap className="size-3.5" />
                {t(`exposureRadar.qualityStage.${normalizeQualityStage(activeItem.quality_stage, activeItem)}`)}
              </span>
              <span className="rounded-full border border-[#2f3336] bg-[#16181c] px-2 py-1 text-xs font-semibold text-[#8b98a5]">
                {activeItem.score} {t("exposureRadar.card.score")}
              </span>
            </div>
            <h2 className="mt-3 line-clamp-2 text-lg font-semibold text-[#e7e9ea]">{activeItem.title}</h2>
            {activeItem.author_handle ? <p className="mt-1 text-xs text-[#71767b]">@{activeItem.author_handle}</p> : null}
            <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#c9d1d9]">{activeItem.content}</p>
            <SignalDecisionCard summary={buildSignalDecisionSummary(activeItem, t)} />
            {activeExplanation ? <OpportunityExplanationPanel explanation={activeExplanation} /> : null}
            {replyAngles.length ? (
              <ReplyAngleSuggestionsPanel
                suggestions={replyAngles}
                selectedID={selectedReplyAngle?.id || ""}
                onSelect={(angleID) => onSelectReplyAngle(activeItem.id, angleID)}
              />
            ) : null}
            {selectedReplyAngle ? <ReplyPlanCard item={activeItem} replyAngle={selectedReplyAngle} /> : null}
            <SafetyReviewPanel item={activeItem} replyAngle={selectedReplyAngle} />
            <ReplyQualityPanel item={activeItem} replyAngle={selectedReplyAngle} generated={activeItem.generated_comment || ""} />
            <div className="mt-4 flex flex-wrap gap-2">
              {activeItem.generated_comment ? (
                <Button type="button" size="sm" onClick={() => void copyWorkbenchReply()}>
                  <Clipboard className="size-3.5" />
                  {t("exposureRadar.workbench.copyReply")}
                </Button>
              ) : activeItem.data_quality === "tweet_level" ? (
                <Button type="button" size="sm" disabled={draftDisabled || draftingID === activeItem.id} onClick={() => onCreateDraft(activeItem, selectedReplyAngle)}>
                  {draftingID === activeItem.id ? <RefreshCw className="size-3.5 animate-spin" /> : <MessageSquarePlus className="size-3.5" />}
                  {draftingID === activeItem.id ? t("exposureRadar.card.drafting") : t("exposureRadar.card.createDraft")}
                </Button>
              ) : null}
              {activeItem.url ? (
                <a href={activeItem.url} target="_blank" rel="noreferrer" onClick={() => onManualAction(activeItem, { opened: true, taskStatus: "in_progress" }, selectedReplyAngle)} className="inline-flex h-8 items-center gap-1 rounded-full bg-[#1d9bf0] px-3 text-xs font-semibold text-white hover:bg-[#1a8cd8]">
                  {activeItem.data_quality === "tweet_level" ? t("exposureRadar.card.openPost") : t("exposureRadar.card.openSearch")}
                  <ExternalLink className="size-3.5" />
                </a>
              ) : null}
              {!radarItemSavedMemoryID(activeItem, savedMemoryIDs) ? (
                <Button type="button" size="sm" variant="outline" disabled={memoryDisabled || savingMemoryID === activeItem.id} onClick={() => onSaveMemory(activeItem, selectedReplyAngle)}>
                  {savingMemoryID === activeItem.id ? <RefreshCw className="size-3.5 animate-spin" /> : <BookmarkPlus className="size-3.5" />}
                  {savingMemoryID === activeItem.id ? t("exposureRadar.card.savingMemory") : t("exposureRadar.card.saveMemory")}
                </Button>
              ) : null}
              <Button type="button" size="sm" variant="outline" disabled={memoryDisabled || savingSeedID === activeItem.id} onClick={() => onSaveContentSeed(activeItem)}>
                {savingSeedID === activeItem.id ? <RefreshCw className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
                {savingSeedID === activeItem.id ? t("exposureRadar.card.savingSeed") : t("exposureRadar.card.saveSeed")}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={memoryDisabled || generatingSeedDraftID === activeItem.id} onClick={() => onGenerateContentDraft(activeItem)}>
                {generatingSeedDraftID === activeItem.id ? <RefreshCw className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                {generatingSeedDraftID === activeItem.id ? t("exposureRadar.card.generatingSeedDraft") : t("exposureRadar.card.generateSeedDraft")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => onFocusItem(activeItem.id)}>
                <Search className="size-3.5" />
                {t("exposureRadar.workbench.viewCard")}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={handlingID === activeItem.id} onClick={() => void completeCurrentAndMoveNext()}>
                {handlingID === activeItem.id ? <RefreshCw className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                {t("exposureRadar.workbench.complete")}
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap justify-between gap-2 border-t border-[#2f3336] pt-3">
              <Button type="button" size="sm" variant="outline" disabled={!previousEntry} onClick={() => previousEntry && onActiveChange(previousEntry.item.id)}>
                {t("exposureRadar.workbench.previous")}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={!nextEntry} onClick={() => nextEntry && onActiveChange(nextEntry.item.id)}>
                {t("exposureRadar.workbench.next")}
              </Button>
            </div>
          </div>
          <div className="rounded-2xl border border-[#2f3336] bg-black p-3">
            <div className="flex items-center justify-between gap-2 px-1">
              <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.workbench.queue")}</p>
              <span className="rounded-full border border-[#2f3336] bg-[#16181c] px-2 py-1 text-[11px] font-semibold text-[#8b98a5]">{queue.length}</span>
            </div>
            <div className="mt-3 space-y-2">
              {queue.map((entry, index) => {
                const item = entry.item;
                const selected = item.id === activeItem.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onActiveChange(item.id)}
                    className={`w-full rounded-xl border p-3 text-left transition ${selected ? "border-[#1d9bf0]/55 bg-[#1d9bf0]/10" : "border-[#2f3336] bg-[#0f1419] hover:border-[#1d9bf0]/35"}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${selected ? "border-[#1d9bf0]/45 bg-[#1d9bf0]/15 text-[#8ecdf8]" : "border-[#2f3336] bg-black text-[#8b98a5]"}`}>{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-xs font-semibold leading-5 text-[#e7e9ea]">{item.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[#71767b]">
                          <span>{t(`exposureRadar.qualityStage.${normalizeQualityStage(item.quality_stage, item)}`)}</span>
                          <span>{item.score} {t("exposureRadar.card.score")}</span>
                          <span>{formatVelocityLabel(item.views_per_min, t("exposureRadar.card.velocitySampling"))}</span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function ActionPlanMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-w-24 rounded-xl border border-[#2f3336] bg-black px-3 py-2">
      <p className="text-[11px] text-[#71767b]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function OpportunityExplanationPanel({ explanation }: { explanation: OpportunityExplanation }) {
  const { t } = useT();
  return (
    <div className="mt-4 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.explanation.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{explanation.fit}</p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-3">
        <ExplanationColumn
          icon={<TrendingUp className="size-3.5" />}
          title={t("exposureRadar.explanation.reasons")}
          items={explanation.reasons}
          tone="border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]"
        />
        <ExplanationColumn
          icon={<MessageCircle className="size-3.5" />}
          title={t("exposureRadar.explanation.angles")}
          items={explanation.angles}
          tone="border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]"
        />
        <ExplanationColumn
          icon={<ShieldAlert className="size-3.5" />}
          title={t("exposureRadar.explanation.avoid")}
          items={explanation.avoid}
          tone="border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]"
        />
      </div>
    </div>
  );
}

function ReplyAngleSuggestionsPanel({ suggestions, selectedID, onSelect }: { suggestions: ReplyAngleSuggestion[]; selectedID: string; onSelect: (angleID: string) => void }) {
  const { t } = useT();
  return (
    <div className="mt-4 rounded-2xl border border-[#1d9bf0]/20 bg-[#08131f] p-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.replyAngles.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("exposureRadar.replyAngles.description")}</p>
        </div>
        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-2 py-1 text-[11px] font-semibold text-[#8ecdf8]">
          <MessageCircle className="size-3.5" />
          {t("exposureRadar.replyAngles.selected")}
        </span>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {suggestions.map((suggestion) => {
          const selected = suggestion.id === selectedID;
          return (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => onSelect(suggestion.id)}
              className={`rounded-xl border p-3 text-left transition ${selected ? "border-[#1d9bf0]/70 bg-[#1d9bf0]/15" : "border-[#2f3336] bg-black hover:border-[#1d9bf0]/45"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[#e7e9ea]">{suggestion.title}</p>
                  <p className="mt-1 text-[11px] font-semibold text-[#8ecdf8]">{suggestion.tone}</p>
                </div>
                {selected ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#1d9bf0]" /> : null}
              </div>
              <p className="mt-2 text-xs leading-5 text-[#8b98a5]">{suggestion.description}</p>
              <p className="mt-2 rounded-lg border border-[#2f3336] bg-[#0f1419] px-2 py-2 text-[11px] leading-5 text-[#71767b]">{suggestion.prompt}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ReplyPlanCard({ item, replyAngle }: { item: ExposureRadarItemApi; replyAngle: ReplyAngleSuggestion }) {
  const { t } = useT();
  const plan = buildReplyPlan(item, replyAngle, t);
  return (
    <div className="mt-4 rounded-2xl border border-[#00ba7c]/20 bg-[#061a14] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.replyPlan.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("exposureRadar.replyPlan.description")}</p>
        </div>
        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-2 py-1 text-[11px] font-semibold text-[#7ee0b5]">
          <CheckCircle2 className="size-3.5" />
          {replyAngle.title}
        </span>
      </div>
      <div className="mt-3 rounded-xl border border-[#2f3336] bg-black px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#71767b]">{t("exposureRadar.replyPlan.bestFor")}</p>
        <p className="mt-1 text-xs leading-5 text-[#c9d1d9]">{plan.bestFor}</p>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <ReplyPlanColumn
          icon={<MessageCircle className="size-3.5" />}
          title={t("exposureRadar.replyPlan.structure")}
          items={plan.steps}
          tone="border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]"
        />
        <ReplyPlanColumn
          icon={<ShieldAlert className="size-3.5" />}
          title={t("exposureRadar.replyPlan.safety")}
          items={plan.safety}
          tone="border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]"
        />
      </div>
      <div className="mt-3 rounded-xl border border-[#00ba7c]/20 bg-[#00ba7c]/10 px-3 py-2 text-xs leading-5 text-[#7ee0b5]">
        {plan.readyNote}
      </div>
    </div>
  );
}

function SafetyReviewPanel({ item, replyAngle }: { item: ExposureRadarItemApi; replyAngle?: ReplyAngleSuggestion }) {
  const { t } = useT();
  const review = buildSafetyReview(item, replyAngle, t);
  return (
    <div className={`mt-4 rounded-2xl border p-3 ${safetyReviewTone(review.status)}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.safetyReview.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{review.summary}</p>
        </div>
        <span className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${safetyReviewBadgeTone(review.status)}`}>
          <ShieldAlert className="size-3.5" />
          {t(`exposureRadar.safetyReview.status.${review.status}`)}
        </span>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {review.checks.map((check) => (
          <div key={check.key} className="rounded-xl border border-[#2f3336] bg-black px-3 py-2">
            <div className="flex items-start gap-2">
              <span className={`mt-1 size-2 shrink-0 rounded-full ${safetyReviewDot(check.status)}`} />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#e7e9ea]">{check.title}</p>
                <p className="mt-1 text-[11px] leading-5 text-[#8b98a5]">{check.detail}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReplyQualityPanel({ item, replyAngle, generated }: { item: ExposureRadarItemApi; replyAngle?: ReplyAngleSuggestion; generated: string }) {
  const { t } = useT();
  const checks = [
    { key: "context", pass: item.data_quality === "tweet_level" },
    { key: "angle", pass: Boolean(replyAngle) },
    { key: "length", pass: !generated || generated.length <= 240 },
    { key: "noPitch", pass: !generated || !hasPromotionalSmell(generated) },
  ];
  const passed = checks.filter((check) => check.pass).length;
  return (
    <div className="mt-4 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.replyQuality.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("exposureRadar.replyQuality.description")}</p>
        </div>
        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-2 py-1 text-[11px] font-semibold text-[#8ecdf8]">
          <Gauge className="size-3.5" />
          {passed}/{checks.length}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {checks.map((check) => (
          <div key={check.key} className="flex items-start gap-2 rounded-xl border border-[#2f3336] bg-black px-3 py-2">
            {check.pass ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[#7ee0b5]" /> : <Info className="mt-0.5 size-3.5 shrink-0 text-[#f6d96b]" />}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#e7e9ea]">{t(`exposureRadar.replyQuality.${check.key}.title`)}</p>
              <p className="mt-1 text-[11px] leading-5 text-[#71767b]">{t(`exposureRadar.replyQuality.${check.key}.description`)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReplyPlanColumn({ icon, title, items, tone }: { icon: ReactNode; title: string; items: string[]; tone: string }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-black p-3">
      <div className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold ${tone}`}>
        {icon}
        {title}
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <p key={item} className="text-xs leading-5 text-[#8b98a5]">{item}</p>
        ))}
      </div>
    </div>
  );
}

function SignalDecisionCard({ summary }: { summary: SignalDecisionSummary }) {
  const { t } = useT();
  return (
    <div className={`mt-4 rounded-2xl border p-3 ${signalDecisionTone(summary.mode)}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold opacity-80">{t("exposureRadar.decision.label")}</p>
          <p className="mt-1 text-sm font-semibold">{summary.title}</p>
          <p className="mt-1 text-xs leading-5 opacity-85">{summary.detail}</p>
        </div>
        <span className="inline-flex w-fit shrink-0 items-center gap-1 rounded-full border border-current/20 bg-black/20 px-2.5 py-1 text-[11px] font-semibold">
          <Zap className="size-3.5" />
          {t(`exposureRadar.decision.mode.${summary.mode}`)}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {summary.proof.map((proof) => (
          <div key={proof} className="rounded-xl border border-current/15 bg-black/20 px-3 py-2 text-[11px] leading-4 opacity-90">
            {proof}
          </div>
        ))}
      </div>
    </div>
  );
}

function ExplanationColumn({ icon, title, items, tone }: { icon: ReactNode; title: string; items: string[]; tone: string }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-black p-3">
      <div className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold ${tone}`}>
        {icon}
        {title}
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <p key={item} className="text-xs leading-5 text-[#8b98a5]">{item}</p>
        ))}
      </div>
    </div>
  );
}

function RadarViewTabs({ value, counts, onChange }: { value: RadarViewFilter; counts: Record<RadarViewFilter, number>; onChange: (value: RadarViewFilter) => void }) {
  const { t } = useT();
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {radarViewFilters.map((filter) => (
        <button
          key={filter}
          type="button"
          onClick={() => onChange(filter)}
          className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition ${value === filter ? "border-[#1d9bf0] bg-[#1d9bf0]/15 text-[#8ecdf8]" : "border-[#2f3336] bg-black text-[#8b98a5] hover:border-[#1d9bf0]/45 hover:text-[#e7e9ea]"}`}
        >
          {t(`exposureRadar.list.filter.${filter}`)}
          <span className="rounded-full bg-[#16181c] px-1.5 py-0.5 text-[10px] text-[#71767b]">{counts[filter] || 0}</span>
        </button>
      ))}
    </div>
  );
}

function LeaderboardStatusStrip({ stats, data, lastRefreshedAt, timeZone }: { stats: LeaderboardStats; data: ExposureRadarData | null; lastRefreshedAt: string; timeZone: string }) {
  const { t } = useT();
  const freshest = data?.last_collected_at || data?.updated_at || lastRefreshedAt;
  const freshnessLabel = data?.freshness_seconds ? formatFreshness(data.freshness_seconds, t) : freshest ? formatDateTime(freshest, timeZone) : "-";
  return (
    <div className="mb-4 rounded-2xl border border-[#2f3336] bg-black p-3">
      <div className="grid gap-2 md:grid-cols-[1.1fr_0.9fr] md:items-center">
        <div className="flex flex-wrap gap-2">
          <LeaderboardPill label={t("exposureRadar.leaderboard.status.new")} value={stats.newCount} tone="border-[#f59e0b]/25 bg-[#f59e0b]/10 text-[#f6d96b]" />
          <LeaderboardPill label={t("exposureRadar.leaderboard.status.burst")} value={stats.burst} tone="border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]" />
          <LeaderboardPill label={t("exposureRadar.leaderboard.status.rising")} value={stats.rising} tone="border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" />
          <LeaderboardPill label={t("exposureRadar.leaderboard.status.cooling")} value={stats.cooling} tone="border-[#64748b]/30 bg-[#64748b]/10 text-[#94a3b8]" />
        </div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2f3336] bg-[#0f1419] px-3 py-1 text-xs font-semibold text-[#8b98a5]">
            <RefreshCw className="size-3.5" />
            {t("exposureRadar.leaderboard.manualRefresh")}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2f3336] bg-[#0f1419] px-3 py-1 text-xs font-semibold text-[#8b98a5]">
            <Clock3 className="size-3.5" />
            {t("exposureRadar.leaderboard.freshness", { value: freshnessLabel })}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2f3336] bg-[#0f1419] px-3 py-1 text-xs font-semibold text-[#8b98a5]">
            <TrendingUp className="size-3.5" />
            {t("exposureRadar.leaderboard.movers", { count: stats.movers })}
          </span>
        </div>
      </div>
    </div>
  );
}

function LeaderboardPill({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>
      <span>{label}</span>
      <span className="rounded-full bg-black/25 px-1.5 py-0.5 text-[10px]">{value}</span>
    </span>
  );
}

function SelectField({ icon, label, value, options, emptyLabel, onChange }: { icon: ReactNode; label: string; value: number; options: Array<{ value: number; label: string }>; emptyLabel: string; onChange: (value: number) => void }) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center gap-2 text-xs font-semibold text-[#8b98a5]">{icon}{label}</span>
      <select value={value} onChange={(event) => onChange(Number(event.target.value))} className="h-10 w-full rounded-xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none transition focus:border-[#1d9bf0]">
        {options.length === 0 ? <option value={0}>{emptyLabel}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function SourceHealthPanel({ data, timeZone }: { data: ExposureRadarData; timeZone: string }) {
  const { t } = useT();
  const status = normalizeSourceStatus(data.source_status);
  const statusClass = sourceStatusClass(status);
  return (
    <div className="mt-4 rounded-2xl border border-[#2f3336] bg-black p-4">
      <div className="grid gap-3 md:grid-cols-4">
        <SourceMetaItem
          icon={<Database className="size-4" />}
          label={t("exposureRadar.source.type")}
          value={t(`exposureRadar.sourceType.${normalizeSourceType(data.source_type)}`)}
        />
        <SourceMetaItem
          icon={<CheckCircle2 className="size-4" />}
          label={t("exposureRadar.source.status")}
          value={t(`exposureRadar.sourceStatus.${status}`)}
          valueClassName={statusClass}
        />
        <SourceMetaItem
          icon={<Clock3 className="size-4" />}
          label={t("exposureRadar.source.lastCollected")}
          value={data.last_collected_at || data.updated_at ? formatDateTime(data.last_collected_at || data.updated_at || "", timeZone) : "-"}
        />
        <SourceMetaItem
          icon={<Activity className="size-4" />}
          label={t("exposureRadar.source.quality")}
          value={data.data_quality === "tweet_level" ? t("exposureRadar.quality.tweet") : t("exposureRadar.quality.topic")}
        />
      </div>
      <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2 text-xs leading-5 text-[#8b98a5]">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <p>{data.source_notice || t("exposureRadar.source.noNotice")}</p>
      </div>
    </div>
  );
}

function CollectionDiagnosticsPanel({ diagnostics, timeZone }: { diagnostics: ExposureRadarDiagnosticsApi; timeZone: string }) {
  const { t } = useT();
  const status = normalizeDiagnosticStatus(diagnostics.status);
  const issues = diagnostics.issues || [];
  const suggestions = diagnosticSuggestions(diagnostics, t);
  const missingReason = diagnostics.top_missing_reason || "none";
  const visiblePool = diagnostics.visible_pool_count || diagnostics.tweet_level_count || 0;
  return (
    <div className="mt-4 rounded-2xl border border-[#2f3336] bg-black p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.diagnostics.title")}</p>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${diagnosticStatusClass(status)}`}>
              <Gauge className="size-3.5" />
              {t(`exposureRadar.diagnostics.status.${status}`)}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("exposureRadar.diagnostics.description")}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold ${diagnostics.x_trends_enabled ? "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" : "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]"}`}>
            <CheckCircle2 className="size-3.5" />
            {diagnostics.x_trends_enabled ? t("exposureRadar.diagnostics.xEnabled") : t("exposureRadar.diagnostics.xDisabled")}
          </span>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold ${diagnostics.bearer_token_configured ? "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" : "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]"}`}>
            <Database className="size-3.5" />
            {diagnostics.bearer_token_configured ? t("exposureRadar.diagnostics.tokenReady") : t("exposureRadar.diagnostics.tokenMissing")}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <DiagnosticMetric label={t("exposureRadar.diagnostics.metric.visible")} value={formatCompact(diagnostics.returned_count || 0)} detail={t("exposureRadar.diagnostics.metric.visibleDetail", { count: diagnostics.requested_limit || 0 })} />
        <DiagnosticMetric label={t("exposureRadar.diagnostics.metric.owned")} value={formatCompact(diagnostics.owned_signal_count || 0)} detail={diagnostics.latest_owned_signal_at ? formatDateTime(diagnostics.latest_owned_signal_at, timeZone) : t("exposureRadar.diagnostics.noOwnedTime")} />
        <DiagnosticMetric label={t("exposureRadar.diagnostics.metric.window")} value={formatCompact(diagnostics.owned_in_window_count || 0)} detail={t("exposureRadar.diagnostics.metric.windowDetail", { hours: diagnostics.window_hours || 0 })} />
        <DiagnosticMetric label={t("exposureRadar.diagnostics.metric.filteredFans")} value={formatCompact(diagnostics.owned_over_fan_limit || 0)} detail={t("exposureRadar.diagnostics.metric.filteredFansDetail", { fans: formatCompact(diagnostics.configured_max_fans || 0) })} />
        <DiagnosticMetric label={t("exposureRadar.diagnostics.metric.hot")} value={formatCompact(diagnostics.hot_opportunity_count || 0)} detail={t("exposureRadar.diagnostics.metric.hotDetail")} />
        <DiagnosticMetric label={t("exposureRadar.diagnostics.metric.rising")} value={formatCompact(diagnostics.rising_opportunity_count || 0)} detail={t("exposureRadar.diagnostics.metric.risingDetail")} />
        <DiagnosticMetric label={t("exposureRadar.diagnostics.metric.sampling")} value={formatCompact(diagnostics.needs_sampling_count || 0)} detail={t("exposureRadar.diagnostics.metric.samplingDetail")} />
        <DiagnosticMetric label={t("exposureRadar.diagnostics.metric.realViews")} value={formatCompact(diagnostics.real_impression_count || 0)} detail={t("exposureRadar.diagnostics.metric.realViewsDetail")} />
      </div>

      <div className="mt-4 rounded-xl border border-[#1d9bf0]/20 bg-[#07111a] p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.diagnostics.gap.title")}</p>
            <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{diagnosticMissingReasonDetail(diagnostics, t)}</p>
          </div>
          <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${missingReason === "none" ? "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" : "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]"}`}>
            <Gauge className="size-3.5" />
            {diagnosticMissingReasonText(missingReason, t)}
          </span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <DiagnosticMetric label={t("exposureRadar.diagnostics.gap.maxViews")} value={formatCompact(diagnostics.max_impression_count || 0)} detail={(diagnostics.hot_views_gap || 0) > 0 ? t("exposureRadar.diagnostics.gap.viewsMissing", { count: formatCompact(diagnostics.hot_views_gap || 0) }) : t("exposureRadar.diagnostics.gap.viewsReady")} />
          <DiagnosticMetric label={t("exposureRadar.diagnostics.gap.maxSpeed")} value={`${formatOneDecimal(diagnostics.max_views_per_minute || 0)}/min`} detail={(diagnostics.hot_velocity_gap || 0) > 0 ? t("exposureRadar.diagnostics.gap.speedMissing", { speed: formatOneDecimal(diagnostics.hot_velocity_gap || 0) }) : t("exposureRadar.diagnostics.gap.speedReady")} />
          <DiagnosticMetric label={t("exposureRadar.diagnostics.gap.realCoverage")} value={formatPercent(diagnostics.real_view_coverage || 0)} detail={t("exposureRadar.diagnostics.gap.realCoverageDetail", { count: diagnostics.window_real_view_count || 0, total: visiblePool })} />
          <DiagnosticMetric label={t("exposureRadar.diagnostics.gap.sampleCoverage")} value={formatPercent(diagnostics.sampling_coverage || 0)} detail={t("exposureRadar.diagnostics.gap.sampleCoverageDetail", { count: diagnostics.window_prior_sample_count || 0, total: visiblePool })} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
          <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.diagnostics.issuesTitle")}</p>
          <div className="mt-2 space-y-2">
            {issues.length ? issues.slice(0, 5).map((issue) => (
              <div key={`${issue.code}:${issue.severity}`} className="flex items-start gap-2 rounded-lg border border-[#2f3336] bg-black px-3 py-2">
                <span className={`mt-0.5 size-2 shrink-0 rounded-full ${diagnosticSeverityDot(issue.severity)}`} />
                <p className="text-xs leading-5 text-[#8b98a5]">{diagnosticIssueText(issue, t)}</p>
              </div>
            )) : (
              <p className="rounded-lg border border-dashed border-[#2f3336] bg-black px-3 py-4 text-center text-xs text-[#71767b]">{t("exposureRadar.diagnostics.noIssues")}</p>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
          <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.diagnostics.suggestionsTitle")}</p>
          <div className="mt-2 space-y-2">
            {suggestions.map((text) => (
              <div key={text} className="flex items-start gap-2 rounded-lg border border-[#1d9bf0]/20 bg-[#07111a] px-3 py-2">
                <Info className="mt-0.5 size-3.5 shrink-0 text-[#8ecdf8]" />
                <p className="text-xs leading-5 text-[#8b98a5]">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-xs text-[#71767b] sm:grid-cols-3">
        <span>{t("exposureRadar.diagnostics.config.refresh", { minutes: diagnostics.refresh_interval_minutes || 0 })}</span>
        <span>{t("exposureRadar.diagnostics.config.topics", { count: diagnostics.topic_limit || 0 })}</span>
        <span>{t("exposureRadar.diagnostics.config.search", { count: diagnostics.search_results || 0, heat: diagnostics.configured_min_heat || 0 })}</span>
        <span>{t("exposureRadar.diagnostics.config.hotThreshold", { views: formatCompact(diagnostics.configured_hot_min_views || 0), speed: formatOneDecimal(diagnostics.configured_hot_min_velocity || 0) })}</span>
        <span>{t("exposureRadar.diagnostics.config.strongThreshold", { views: formatCompact(diagnostics.configured_strong_hot_min_views || 0), speed: formatOneDecimal(diagnostics.configured_strong_hot_min_velocity || 0) })}</span>
      </div>
    </div>
  );
}

function DiagnosticMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-normal text-[#71767b]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
      <p className="mt-1 truncate text-[11px] text-[#71767b]" title={detail}>{detail}</p>
    </div>
  );
}

function SourceMetaItem({ icon, label, value, valueClassName }: { icon: ReactNode; label: string; value: string; valueClassName?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-normal text-[#71767b]">{icon}{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold text-[#e7e9ea] ${valueClassName || ""}`}>{value}</p>
    </div>
  );
}

function LearningInsightsPanel({
  data,
  items,
  manualActionStates,
  recentRecords,
  learningProfile,
}: {
  data: ExposureRadarPerformanceData | null;
  items: ExposureRadarItemApi[];
  manualActionStates: Record<string, ManualActionState>;
  recentRecords: ExposureRadarManualRecordApi[];
  learningProfile: ExposureLearningProfile;
}) {
  const { t } = useT();
  const controls = data?.learning_controls;
  const outcomes = Object.values(manualActionStates).filter((state) => state.outcome);
  const effectiveCount = outcomes.filter((state) => state.outcome === "effective").length;
  const negativeCount = outcomes.filter((state) => state.outcome === "ineffective" || state.outcome === "not_suitable").length;
  const boosted = items.filter((item) => (item.ranking_delta || 0) > 0).slice(0, 4);
  const riskyCount = items.filter((item) => item.risk_level === "medium" || item.risk_level === "high").length;
  const topTopics = data?.top_topics?.slice(0, 4) || [];
  const impactRows = buildLearningImpactRows(recentRecords, learningProfile, t).slice(0, 5);
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <CardHeader title={t("exposureRadar.learningPanel.title")} description={t("exposureRadar.learningPanel.description")} className="mb-0" />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <PerformanceMetric label={t("exposureRadar.learningPanel.metric.feedback")} value={formatCompact(outcomes.length)} detail={t("exposureRadar.learningPanel.metric.feedbackDetail")} />
          <PerformanceMetric label={t("exposureRadar.learningPanel.metric.effective")} value={formatCompact(effectiveCount)} detail={t("exposureRadar.learningPanel.metric.effectiveDetail")} />
          <PerformanceMetric label={t("exposureRadar.learningPanel.metric.boosted")} value={formatCompact(boosted.length)} detail={t("exposureRadar.learningPanel.metric.boostedDetail")} />
          <PerformanceMetric label={t("exposureRadar.learningPanel.metric.risky")} value={formatCompact(riskyCount)} detail={t("exposureRadar.learningPanel.metric.riskyDetail")} />
        </div>
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-4">
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.learningPanel.feedbackTitle")}</p>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{negativeCount > 0 ? t("exposureRadar.learningPanel.feedbackMixed", { count: negativeCount }) : t("exposureRadar.learningPanel.feedbackHealthy")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <LeaderboardPill label={t("exposureRadar.learningPanel.outcome.effective")} value={effectiveCount} tone="border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" />
            <LeaderboardPill label={t("exposureRadar.learningPanel.outcome.neutral")} value={outcomes.filter((state) => state.outcome === "neutral").length} tone="border-[#2f3336] bg-[#16181c] text-[#8b98a5]" />
            <LeaderboardPill label={t("exposureRadar.learningPanel.outcome.negative")} value={negativeCount} tone="border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]" />
          </div>
        </div>
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.learningPanel.boostedTitle")}</p>
          <div className="mt-3 space-y-2">
            {boosted.length ? boosted.map((item) => (
              <div key={item.id} className="rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2">
                <p className="line-clamp-1 text-xs font-semibold text-[#e7e9ea]">{item.title}</p>
                <p className="mt-1 text-[11px] text-[#71767b]">{t("exposureRadar.learningPanel.boostedReason", { delta: item.ranking_delta || 0 })}</p>
              </div>
            )) : (
              <p className="rounded-xl border border-dashed border-[#2f3336] px-3 py-6 text-center text-xs text-[#71767b]">{t("exposureRadar.learningPanel.boostedEmpty")}</p>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.learningPanel.controlsTitle")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <LearningBadge label={t("exposureRadar.learning.ranking")} value={controls?.ranking_enabled ? t("exposureRadar.learning.on") : t("exposureRadar.learning.off")} active={Boolean(controls?.ranking_enabled)} />
            <LearningBadge label={t("exposureRadar.learning.collector")} value={controls?.collector_enabled ? t("exposureRadar.learning.on") : t("exposureRadar.learning.off")} active={Boolean(controls?.collector_enabled)} />
            <LearningBadge label={t("exposureRadar.learning.mode")} value={t(`exposureRadar.learningMode.${normalizeLearningMode(controls?.mode)}`)} />
            <LearningBadge label={t("exposureRadar.learning.window")} value={t("exposureRadar.learning.days", { days: controls?.window_days || 30 })} />
          </div>
          <div className="mt-3 rounded-xl border border-[#1d9bf0]/20 bg-[#08131f] px-3 py-2">
            <p className="text-xs leading-5 text-[#8ecdf8]">
              {controls?.ranking_enabled ? t("exposureRadar.learningPanel.rankingEnabled") : t("exposureRadar.learningPanel.rankingDisabled")}
            </p>
          </div>
          {topTopics.length ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.learningPanel.topicTitle")}</p>
              {topTopics.map((topic) => (
                <div key={`${topic.region}:${topic.topic_name}`} className="flex items-center justify-between gap-2 rounded-lg border border-[#2f3336] bg-[#0f1419] px-3 py-2 text-xs">
                  <span className="truncate text-[#c9d1d9]">{topic.topic_name}</span>
                  <span className="shrink-0 text-[#71767b]">{topic.success_count}/{topic.signal_count}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.learningPanel.impactTitle")}</p>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("exposureRadar.learningPanel.impactDescription")}</p>
          <div className="mt-3 space-y-2">
            {impactRows.length ? impactRows.map((row) => (
              <div key={`${row.tone}:${row.label}`} className={`rounded-xl border px-3 py-2 ${learningImpactTone(row.tone)}`}>
                <p className="line-clamp-1 text-xs font-semibold">{row.label}</p>
                <p className="mt-1 text-[11px] leading-4 opacity-85">{row.detail}</p>
              </div>
            )) : (
              <p className="rounded-xl border border-dashed border-[#2f3336] px-3 py-6 text-center text-xs text-[#71767b]">{t("exposureRadar.learningPanel.impactEmpty")}</p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function PerformancePanel({ data, timeZone }: { data: ExposureRadarPerformanceData | null; timeZone: string }) {
  const { t } = useT();
  const topics = data?.top_topics || [];
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <CardHeader title={t("exposureRadar.performance.title")} description={t("exposureRadar.performance.description", { days: data?.range_days || 7 })} className="mb-0" />
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#2f3336] px-3 py-1 text-xs font-semibold text-[#8b98a5]">
            <Bot className="size-3.5" />
            {data?.bot_id || data?.x_account_id ? t("exposureRadar.performance.scopePersonalized") : t("exposureRadar.performance.scopeWorkspace")}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#2f3336] px-3 py-1 text-xs font-semibold text-[#8b98a5]">
            <BarChart3 className="size-3.5" />
            {data?.generated_at ? formatDateTime(data.generated_at, timeZone) : "-"}
          </span>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <PerformanceMetric label={t("exposureRadar.performance.signals")} value={formatCompact(data?.owned_signal_count || 0)} detail={t("exposureRadar.performance.signalsDetail")} />
        <PerformanceMetric label={t("exposureRadar.performance.drafts")} value={formatCompact(data?.draft_count || 0)} detail={t("exposureRadar.performance.draftsDetail", { count: data?.pending_review_count || 0 })} />
        <PerformanceMetric label={t("exposureRadar.performance.approval")} value={formatPercent(data?.approval_rate || 0)} detail={t("exposureRadar.performance.approvalDetail", { count: data?.approved_count || 0 })} />
        <PerformanceMetric label={t("exposureRadar.performance.completion")} value={formatPercent(data?.completion_rate || 0)} detail={t("exposureRadar.performance.completionDetail", { count: (data?.published_count || 0) + (data?.handled_count || 0) })} />
      </div>
      <LearningControlsStrip data={data} />
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.performance.regionTitle")}</p>
          <div className="mt-3 space-y-2">
            {(data?.regions || []).length ? data?.regions.map((row) => (
              <div key={row.region} className="flex items-center justify-between gap-3 rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="font-semibold text-[#e7e9ea]">{t(`exposureRadar.region.${row.region === "zh" ? "zh" : "en"}`)}</p>
                  <p className="mt-0.5 truncate text-[#71767b]">{row.latest_collected_at ? formatDateTime(row.latest_collected_at, timeZone) : t("exposureRadar.performance.noCollection")}</p>
                </div>
                <div className="shrink-0 text-right text-[#8b98a5]">
                  <p>{t("exposureRadar.performance.regionSignals", { count: row.owned_signal_count })}</p>
                  <p>{t("exposureRadar.performance.regionDrafts", { count: row.draft_count })}</p>
                </div>
              </div>
            )) : (
              <p className="rounded-xl border border-dashed border-[#2f3336] px-3 py-6 text-center text-xs text-[#71767b]">{t("exposureRadar.performance.empty")}</p>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.performance.topicTitle")}</p>
          <div className="mt-3 space-y-2">
            {topics.length ? topics.slice(0, 5).map((row) => (
              <div key={`${row.region}:${row.topic_name}`} className="rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <p className="min-w-0 truncate font-semibold text-[#e7e9ea]">{row.topic_name}</p>
                  <span className="shrink-0 rounded-full border border-[#2f3336] px-2 py-0.5 text-[#8b98a5]">{row.region}</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-[#71767b]">
                  <span>{t("exposureRadar.performance.topicSignals", { count: row.signal_count })}</span>
                  <span>{t("exposureRadar.performance.topicDrafts", { count: row.draft_count })}</span>
                  <span>{t("exposureRadar.performance.topicWins", { count: row.success_count })}</span>
                </div>
              </div>
            )) : (
              <p className="rounded-xl border border-dashed border-[#2f3336] px-3 py-6 text-center text-xs text-[#71767b]">{t("exposureRadar.performance.empty")}</p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function LearningControlsStrip({ data }: { data: ExposureRadarPerformanceData | null }) {
  const { t } = useT();
  const controls = data?.learning_controls;
  return (
    <div className="mt-4 grid gap-2 md:grid-cols-4">
      <LearningBadge label={t("exposureRadar.learning.ranking")} value={controls?.ranking_enabled ? t("exposureRadar.learning.on") : t("exposureRadar.learning.off")} active={Boolean(controls?.ranking_enabled)} />
      <LearningBadge label={t("exposureRadar.learning.collector")} value={controls?.collector_enabled ? t("exposureRadar.learning.on") : t("exposureRadar.learning.off")} active={Boolean(controls?.collector_enabled)} />
      <LearningBadge label={t("exposureRadar.learning.mode")} value={t(`exposureRadar.learningMode.${normalizeLearningMode(controls?.mode)}`)} />
      <LearningBadge label={t("exposureRadar.learning.window")} value={t("exposureRadar.learning.days", { days: controls?.window_days || 30 })} />
      <div className="md:col-span-4 rounded-xl border border-[#2f3336] bg-black px-3 py-2 text-xs leading-5 text-[#8b98a5]">
        {t("exposureRadar.learning.scope", { scope: t(`exposureRadar.learningScope.${normalizeLearningScope(controls?.ranking_scope)}`) })}
      </div>
    </div>
  );
}

function LearningBadge({ label, value, active }: { label: string; value: string; active?: boolean }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-black px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-normal text-[#71767b]">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${active === undefined ? "text-[#e7e9ea]" : active ? "text-[#7ee0b5]" : "text-[#ff8a91]"}`}>{value}</p>
    </div>
  );
}

function PerformanceMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
      <p className="text-xs font-semibold text-[#71767b]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-[#8b98a5]">{detail}</p>
    </div>
  );
}

function TopicHistoryPanel({ data, timeZone }: { data: ExposureRadarArchiveData | null; timeZone: string }) {
  const { t } = useT();
  const days = useMemo(() => data?.days || [], [data?.days]);
  const totals = useMemo(() => {
    return days.reduce(
      (acc, row) => ({
        signals: acc.signals + row.signal_count,
        drafts: acc.drafts + row.draft_count,
        positives: acc.positives + row.positive_count,
        memories: acc.memories + row.saved_memory_count,
      }),
      { signals: 0, drafts: 0, positives: 0, memories: 0 },
    );
  }, [days]);
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <CardHeader title={t("exposureRadar.archive.title")} description={t("exposureRadar.archive.description", { days: data?.range_days || 7 })} className="mb-0" />
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#2f3336] px-3 py-1 text-xs font-semibold text-[#8b98a5]">
            <CalendarClock className="size-3.5" />
            {data?.generated_at ? formatDateTime(data.generated_at, timeZone) : "-"}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#2f3336] px-3 py-1 text-xs font-semibold text-[#8b98a5]">
            <Activity className="size-3.5" />
            {data?.region && data.region !== "all" ? t(`exposureRadar.region.${data.region === "zh" ? "zh" : "en"}`) : t("common.all")}
          </span>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <PerformanceMetric label={t("exposureRadar.archive.totalSignals")} value={formatCompact(totals.signals)} detail={t("exposureRadar.archive.totalSignalsDetail")} />
        <PerformanceMetric label={t("exposureRadar.archive.totalDrafts")} value={formatCompact(totals.drafts)} detail={t("exposureRadar.archive.totalDraftsDetail")} />
        <PerformanceMetric label={t("exposureRadar.archive.totalPositive")} value={formatCompact(totals.positives)} detail={t("exposureRadar.archive.totalPositiveDetail")} />
        <PerformanceMetric label={t("exposureRadar.archive.totalMemory")} value={formatCompact(totals.memories)} detail={t("exposureRadar.archive.totalMemoryDetail")} />
      </div>
      <div className="mt-4 space-y-2">
        {days.length ? days.map((day) => {
          const total = day.signal_count + day.draft_count + day.saved_memory_count;
          const positiveRate = day.draft_count > 0 ? Math.round((day.positive_count / day.draft_count) * 100) : 0;
          return (
            <div key={`${day.date_key}:${day.region}`} className="rounded-2xl border border-[#2f3336] bg-black p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full border border-[#2f3336] px-2.5 py-1 text-xs font-semibold text-[#e7e9ea]">
                      <CalendarClock className="size-3.5 text-[#8ecdf8]" />
                      {formatArchiveDate(day.date_key, timeZone)}
                    </span>
                    <span className="rounded-full border border-[#2f3336] px-2.5 py-1 text-xs font-semibold text-[#8b98a5]">
                      {t(`exposureRadar.region.${day.region === "zh" ? "zh" : "en"}`)}
                    </span>
                    {total === 0 ? <span className="rounded-full border border-[#2f3336] px-2.5 py-1 text-xs font-semibold text-[#71767b]">{t("exposureRadar.archive.noActivity")}</span> : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#8b98a5]">
                    <span>{t("exposureRadar.archive.signals", { count: day.signal_count })}</span>
                    <span>{t("exposureRadar.archive.drafts", { count: day.draft_count })}</span>
                    <span>{t("exposureRadar.archive.positive", { count: day.positive_count })}</span>
                    <span>{t("exposureRadar.archive.memory", { count: day.saved_memory_count })}</span>
                    {day.draft_count ? <span>{t("exposureRadar.archive.positiveRate", { rate: positiveRate })}</span> : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {day.top_topics.length ? day.top_topics.map((topic) => (
                    <span key={`${day.date_key}:${topic.region}:${topic.topic_name}`} className="rounded-full border border-[#2f3336] bg-[#0f1419] px-2.5 py-1 text-xs font-semibold text-[#c9d1d9]">
                      {topic.topic_name}
                    </span>
                  )) : (
                    <span className="text-xs text-[#71767b]">{t("exposureRadar.archive.noTopics")}</span>
                  )}
                </div>
              </div>
            </div>
          );
        }) : (
          <p className="rounded-2xl border border-dashed border-[#2f3336] px-4 py-8 text-center text-sm text-[#71767b]">{t("exposureRadar.archive.empty")}</p>
        )}
      </div>
    </Card>
  );
}

function RadarCard({
  item,
  rank,
  timeZone,
  rankChange,
  savedMemoryID,
  drafting,
  draftDisabled,
  handling,
  savingMemory,
  memoryDisabled,
  memoryAccountID,
  onCreateDraft,
  onMarkHandled,
  onSaveMemory,
  onSaveContentSeed,
  savingSeed,
  onGenerateContentDraft,
  generatingSeedDraft,
  manualState,
  onManualAction,
  feedbackSaving,
  onSubmitFeedback,
  onSubmitResult,
}: {
  item: ExposureRadarItemApi;
  rank: number;
  timeZone: string;
  rankChange?: RankChange;
  savedMemoryID: number;
  drafting: boolean;
  draftDisabled: boolean;
  handling: boolean;
  savingMemory: boolean;
  memoryDisabled: boolean;
  memoryAccountID: number;
  onCreateDraft: (item: ExposureRadarItemApi) => void;
  onMarkHandled: (item: ExposureRadarItemApi, publishedURL: string) => void;
  onSaveMemory: (item: ExposureRadarItemApi, replyAngle?: ReplyAngleSuggestion) => void;
  onSaveContentSeed: (item: ExposureRadarItemApi) => void;
  savingSeed: boolean;
  onGenerateContentDraft: (item: ExposureRadarItemApi) => void;
  generatingSeedDraft: boolean;
  manualState?: ManualActionState;
  onManualAction: (patch: Partial<ManualActionState>) => void;
  feedbackSaving: boolean;
  onSubmitFeedback: (item: ExposureRadarItemApi, outcome: ManualOutcome, comment: string) => void;
  onSubmitResult: (item: ExposureRadarItemApi, result: { impressions?: number; likes?: number; replies?: number; reposts?: number; quotes?: number; bookmarks?: number; notes?: string }) => void;
}) {
  const { t } = useT();
  const { pushToast } = useToast();
  const riskClass = item.risk_level === "high" || item.risk_level === "medium" ? "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]" : "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  const generatedComment = item.generated_comment?.trim() || "";
  const canDraft = item.data_quality === "tweet_level" && !draftDisabled;
  const velocityState = normalizeVelocityState(item.velocity_state, item.status);
  const opportunityTier = normalizeOpportunityTier(item.opportunity_tier);
  const qualityStage = normalizeQualityStage(item.quality_stage, item);
  const dataConfidence = normalizeDataConfidence(item.data_confidence, item.data_quality);
  const cardToneClass = qualityStage === "expired" || item.cooling || velocityState === "cooling"
    ? "border-[#64748b]/35 bg-[#0b0f14] opacity-85"
    : qualityStage === "act_now"
      ? "border-[#00ba7c]/35 bg-black shadow-[0_0_0_1px_rgba(0,186,124,0.18)]"
      : opportunityTier === "needs_sampling" || opportunityTier === "topic_lead"
        ? "border-[#2f3336] bg-[#070a0d] opacity-80"
        : "border-[#2f3336] bg-black";
  const savedDone = savedMemoryID > 0 || Boolean(manualState?.saved);
  const handledDone = isManualActionHandled(item, manualState);
  const [publishedURL, setPublishedURL] = useState(manualState?.publishedUrl || item.comment_url || "");
  const [resultResolving, setResultResolving] = useState(false);
  const lastHydratedPublishedURLRef = useRef(manualState?.publishedUrl || item.comment_url || "");
  const rankTone = rank <= 3 ? "border-[#f59e0b]/35 bg-[#f59e0b]/15 text-[#f6d96b]" : "border-[#2f3336] bg-[#16181c] text-[#8b98a5]";
  const highlightClass = rankChange?.kind === "up" || rankChange?.kind === "new"
    ? "shadow-[0_0_0_1px_rgba(0,186,124,0.24),0_18px_46px_rgba(0,186,124,0.08)]"
    : rankChange?.kind === "down"
      ? "shadow-[0_0_0_1px_rgba(244,33,46,0.20)]"
      : "";
  useEffect(() => {
    const nextURL = manualState?.publishedUrl || item.comment_url || "";
    if (nextURL && nextURL !== lastHydratedPublishedURLRef.current) {
      lastHydratedPublishedURLRef.current = nextURL;
      setPublishedURL(nextURL);
    }
  }, [item.comment_url, manualState?.publishedUrl]);
  const copyComment = async () => {
    if (!generatedComment) return;
    try {
      await navigator.clipboard.writeText(generatedComment);
      onManualAction({ copied: true, taskStatus: "in_progress" });
      pushToast(t("exposureRadar.manualAction.copied"));
    } catch {
      pushToast(t("exposureRadar.manualAction.copyFailed"));
    }
  };
  const resolvePublishedResult = async () => {
    const nextURL = publishedURL.trim();
    const commentTweetID = item.comment_tweet_id || extractTweetID(nextURL);
    if (!nextURL && !commentTweetID) {
      pushToast(t("exposureRadar.resultLookup.missing"));
      return;
    }
    setResultResolving(true);
    try {
      const result = await exposureRadarService.resolveManualResult({
        published_url: nextURL || undefined,
        comment_tweet_id: commentTweetID || undefined,
      });
      const resolvedURL = result.published_url || nextURL;
      if (resolvedURL) {
        setPublishedURL(resolvedURL);
      }
      const patch: Partial<ManualActionState> = {
        publishedUrl: resolvedURL,
        taskStatus: handledDone ? "done" : "in_progress",
      };
      if (typeof result.result_impression_count === "number") patch.resultImpressionCount = result.result_impression_count;
      if (typeof result.result_like_count === "number") patch.resultLikeCount = result.result_like_count;
      if (typeof result.result_reply_count === "number") patch.resultReplyCount = result.result_reply_count;
      if (typeof result.result_retweet_count === "number") patch.resultRetweetCount = result.result_retweet_count;
      if (typeof result.result_quote_count === "number") patch.resultQuoteCount = result.result_quote_count;
      if (typeof result.result_bookmark_count === "number") patch.resultBookmarkCount = result.result_bookmark_count;
      if (result.metrics_fetched) {
        patch.resultCheckedAt = new Date().toISOString();
      }
      onManualAction(patch);
      const status = normalizeResultLookupStatus(result.status);
      pushToast(t(`exposureRadar.resultLookup.${status}`));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("exposureRadar.resultLookup.failed") : t("exposureRadar.resultLookup.failed"));
    } finally {
      setResultResolving(false);
    }
  };

  return (
    <article id={radarCardAnchorID(item.id)} className={`scroll-mt-24 rounded-2xl border p-4 transition-shadow ${highlightClass} ${cardToneClass}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex h-7 min-w-8 items-center justify-center rounded-full border px-2 text-xs font-bold ${rankTone}`}>
          #{rank}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-2 py-1 text-xs font-semibold text-[#8ecdf8]">
          <TrendingUp className="size-3.5" />
          {item.signal_label || item.status}
        </span>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${velocityStateClass(velocityState)}`}>
          <span className="size-1.5 rounded-full bg-current" />
          {t(`exposureRadar.velocityState.${velocityState}`)}
        </span>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${opportunityTierClass(opportunityTier)}`} title={item.tier_reason || undefined}>
          <Flame className="size-3.5" />
          {t(`exposureRadar.tier.${opportunityTier}`)}
        </span>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${qualityStageClass(qualityStage)}`} title={item.quality_reason || undefined}>
          <Zap className="size-3.5" />
          {t(`exposureRadar.qualityStage.${qualityStage}`)}
        </span>
        {rankChange ? (
          <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${rankChange.kind === "up" ? "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" : rankChange.kind === "down" ? "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]" : "border-[#f59e0b]/25 bg-[#f59e0b]/10 text-[#f6d96b]"}`}>
            {rankChange.kind === "new" ? "NEW" : rankChange.kind === "up" ? `↑${rankChange.delta}` : `↓${rankChange.delta}`}
          </span>
        ) : null}
        <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${riskClass}`}>
          {t(`exposureRadar.risk.${item.risk_level === "medium" || item.risk_level === "high" ? item.risk_level : "low"}`)}
        </span>
        <span className="rounded-full border border-[#2f3336] bg-[#16181c] px-2 py-1 text-xs font-semibold text-[#8b98a5]">
          {item.data_quality === "tweet_level" ? t("exposureRadar.quality.tweet") : t("exposureRadar.quality.topic")}
        </span>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${dataConfidenceClass(dataConfidence)}`} title={item.data_confidence_reason || undefined}>
          <Database className="size-3.5" />
          {t(`exposureRadar.confidence.${dataConfidence}`)}
        </span>
        {item.ranking_delta ? (
          <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${item.ranking_delta > 0 ? "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" : "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]"}`}>
            {item.ranking_delta > 0 ? `+${item.ranking_delta}` : item.ranking_delta}
          </span>
        ) : null}
        {savedMemoryID > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-2 py-1 text-xs font-semibold text-[#7ee0b5]">
            <BookmarkPlus className="size-3.5" />
            {t("exposureRadar.card.savedMemory")}
          </span>
        ) : null}
        {handledDone ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-2 py-1 text-xs font-semibold text-[#7ee0b5]">
            <CheckCircle2 className="size-3.5" />
            {t("exposureRadar.manualAction.handledBadge")}
          </span>
        ) : null}
      </div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="line-clamp-2 text-base font-semibold text-[#e7e9ea]">{item.title}</h2>
          {item.author_handle ? <p className="mt-1 text-xs text-[#71767b]">@{item.author_handle}</p> : null}
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold text-white">{item.score}</p>
          <p className="text-[11px] text-[#71767b]">{t("exposureRadar.card.score")}</p>
        </div>
      </div>
      <p className="mt-3 line-clamp-4 text-sm leading-6 text-[#c9d1d9]">{item.content}</p>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <MiniStat icon={<Gauge className="size-3.5" />} label={t("exposureRadar.card.velocity")} value={formatVelocityLabel(item.views_per_min, t("exposureRadar.card.velocitySampling"))} />
        <MiniStat icon={<Users className="size-3.5" />} label={t("exposureRadar.card.followers")} value={item.followers_count ? formatCompact(item.followers_count) : "-"} />
        <MiniStat icon={<Flame className="size-3.5" />} label={t("exposureRadar.card.heat")} value={item.heat_count ? formatCompact(item.heat_count) : "-"} />
      </div>
      {hasEngagementMetrics(item) ? (
        <div className="mt-3 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3">
          <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.card.publicMetrics")}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <MetricPill icon={<MessageCircle className="size-3.5" />} label={t("exposureRadar.card.replies")} value={item.reply_count} />
            <MetricPill icon={<Repeat2 className="size-3.5" />} label={t("exposureRadar.card.reposts")} value={item.retweet_count} />
            <MetricPill icon={<Heart className="size-3.5" />} label={t("exposureRadar.card.likes")} value={item.like_count} />
            <MetricPill icon={<Quote className="size-3.5" />} label={t("exposureRadar.card.quotes")} value={item.quote_count} />
            <MetricPill icon={<Bookmark className="size-3.5" />} label={t("exposureRadar.card.bookmarks")} value={item.bookmark_count} />
            <MetricPill icon={<Eye className="size-3.5" />} label={t("exposureRadar.card.impressions")} value={item.impression_count} />
          </div>
        </div>
      ) : null}
      {item.velocity_history?.length ? (
        <VelocitySparkline values={item.velocity_history} />
      ) : null}
      <SignalDecisionCard summary={buildSignalDecisionSummary(item, t)} />
      <div className="mt-4 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3">
        <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.card.recommended")}</p>
        <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{item.recommended_use}</p>
        <p className="mt-2 text-xs leading-5 text-[#71767b]">{item.reason}</p>
        {item.ranking_reason ? <p className="mt-2 text-xs leading-5 text-[#8ecdf8]">{item.ranking_reason}</p> : null}
      </div>
      {generatedComment ? (
        <div className="mt-4 rounded-2xl border border-[#1d9bf0]/35 bg-[#07111a] p-3">
          <p className="text-xs font-semibold text-[#8ecdf8]">{t("exposureRadar.card.generatedComment")}</p>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#e7e9ea]">{generatedComment}</p>
          <p className="mt-2 text-xs leading-5 text-[#8b98a5]">{t("exposureRadar.card.manualPublishHint")}</p>
          <ManualWorkflowPanel
            copied={Boolean(manualState?.copied)}
            opened={Boolean(manualState?.opened)}
            saved={savedDone}
            handled={handledDone}
            handling={handling}
            resultResolving={resultResolving}
            publishedURL={publishedURL}
            commentURL={manualState?.publishedUrl || item.comment_url || ""}
            persisted={Boolean(manualState?.persisted || item.review_status === "handled" || item.comment_tweet_id || item.comment_url)}
            onPublishedURLChange={setPublishedURL}
            onResolveResult={() => void resolvePublishedResult()}
            onMarkHandled={() => onMarkHandled(item, publishedURL)}
          />
          <ManualHandlingRecord
            key={`${item.id}:${manualResultFormKey(manualState)}`}
            item={item}
            manualState={manualState}
            timeZone={timeZone}
            feedbackSaving={feedbackSaving}
            onSubmitFeedback={(outcome, comment) => onSubmitFeedback(item, outcome, comment)}
            onSubmitResult={(result) => onSubmitResult(item, result)}
          />
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#71767b]">
        <span className="inline-flex items-center gap-1">
          <Clock3 className="size-3.5" />
          {item.age_label || (item.updated_at ? formatDateTime(item.updated_at, timeZone) : "-")}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {generatedComment ? (
            <>
              <Button type="button" size="sm" variant="outline" onClick={() => void copyComment()}>
                <Clipboard className="size-3.5" />
                {t("exposureRadar.manualAction.copy")}
              </Button>
              {item.url ? (
                <a href={item.url} target="_blank" rel="noreferrer" onClick={() => onManualAction({ opened: true, taskStatus: "in_progress" })} className="inline-flex h-8 items-center gap-1 rounded-full bg-[#1d9bf0] px-3 font-semibold text-white hover:bg-[#1a8cd8]">
                  {item.data_quality === "tweet_level" ? t("exposureRadar.card.openPost") : t("exposureRadar.card.openSearch")}
                  <ExternalLink className="size-3.5" />
                </a>
              ) : null}
            </>
          ) : (
            <Button type="button" size="sm" variant="outline" disabled={!canDraft || drafting} title={!canDraft && item.data_quality !== "tweet_level" ? t("exposureRadar.card.topicDraftDisabled") : undefined} onClick={() => onCreateDraft(item)}>
              <MessageSquarePlus className="size-3.5" />
              {drafting ? t("exposureRadar.card.drafting") : t("exposureRadar.card.createDraft")}
            </Button>
          )}
          {savedMemoryID > 0 ? (
            <Link href={memoryLink(savedMemoryID, memoryAccountID)} className="inline-flex h-8 items-center gap-1 rounded-full border border-[#2f3336] px-3 font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
              <BookmarkPlus className="size-3.5" />
              {t("exposureRadar.card.openMemory")}
            </Link>
          ) : (
            <Button type="button" size="sm" variant="outline" disabled={memoryDisabled || savingMemory} onClick={() => onSaveMemory(item)}>
              <BookmarkPlus className="size-3.5" />
              {savingMemory ? t("exposureRadar.card.savingMemory") : t("exposureRadar.card.saveMemory")}
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" disabled={memoryDisabled || savingSeed} onClick={() => onSaveContentSeed(item)}>
            {savingSeed ? <RefreshCw className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
            {savingSeed ? t("exposureRadar.card.savingSeed") : t("exposureRadar.card.saveSeed")}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={memoryDisabled || generatingSeedDraft} onClick={() => onGenerateContentDraft(item)}>
            {generatingSeedDraft ? <RefreshCw className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {generatingSeedDraft ? t("exposureRadar.card.generatingSeedDraft") : t("exposureRadar.card.generateSeedDraft")}
          </Button>
          {!generatedComment && item.url ? (
            <a href={item.url} target="_blank" rel="noreferrer" onClick={() => onManualAction({ opened: true, taskStatus: "in_progress" })} className="inline-flex h-8 items-center gap-1 rounded-full bg-[#1d9bf0] px-3 font-semibold text-white hover:bg-[#1a8cd8]">
              {item.data_quality === "tweet_level" ? t("exposureRadar.card.openPost") : t("exposureRadar.card.openSearch")}
              <ExternalLink className="size-3.5" />
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function ManualWorkflowPanel({
  copied,
  opened,
  saved,
  handled,
  handling,
  resultResolving,
  publishedURL,
  commentURL,
  persisted,
  onPublishedURLChange,
  onResolveResult,
  onMarkHandled,
}: {
  copied: boolean;
  opened: boolean;
  saved: boolean;
  handled: boolean;
  handling: boolean;
  resultResolving: boolean;
  publishedURL: string;
  commentURL: string;
  persisted: boolean;
  onPublishedURLChange: (value: string) => void;
  onResolveResult: () => void;
  onMarkHandled: () => void;
}) {
  const { t } = useT();
  const replyURL = publishedURL.trim() || commentURL;
  return (
    <div className="mt-3 rounded-xl border border-[#1d9bf0]/20 bg-black/30 p-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.manualWorkflow.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("exposureRadar.manualWorkflow.description")}</p>
        </div>
        <Button type="button" size="sm" variant={handled ? "outline" : "default"} disabled={handling} onClick={onMarkHandled}>
          {handling ? <RefreshCw className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
          {handling ? t("exposureRadar.manualAction.saving") : handled ? t("exposureRadar.manualAction.handled") : t("exposureRadar.manualAction.markHandled")}
        </Button>
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
        <label className="min-w-0">
          <span className="sr-only">{t("exposureRadar.manualWorkflow.resultLabel")}</span>
          <input
            value={publishedURL}
            onChange={(event) => onPublishedURLChange(event.target.value)}
            placeholder={t("exposureRadar.manualWorkflow.resultPlaceholder")}
            disabled={handling}
            className="h-9 w-full rounded-full border border-[#2f3336] bg-black px-3 text-xs text-[#e7e9ea] outline-none transition focus:border-[#1d9bf0]"
          />
        </label>
        <Button type="button" size="sm" variant="outline" disabled={handling || resultResolving || !replyURL} onClick={onResolveResult} className="h-9">
          {resultResolving ? <RefreshCw className="size-3.5 animate-spin" /> : <BarChart3 className="size-3.5" />}
          {resultResolving ? t("exposureRadar.resultLookup.loading") : t("exposureRadar.resultLookup.button")}
        </Button>
        {replyURL ? (
          <a href={replyURL} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center gap-1 rounded-full border border-[#2f3336] px-3 text-xs font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
            {t("exposureRadar.manualWorkflow.openReply")}
            <ExternalLink className="size-3.5" />
          </a>
        ) : null}
      </div>
      <p className="mt-2 text-xs leading-5 text-[#71767b]">{persisted ? t("exposureRadar.manualWorkflow.persisted") : t("exposureRadar.manualWorkflow.resultHint")}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <ManualWorkflowStep done={copied} label={t("exposureRadar.manualWorkflow.copy")} />
        <ManualWorkflowStep done={opened} label={t("exposureRadar.manualWorkflow.open")} />
        <ManualWorkflowStep done={saved} label={t("exposureRadar.manualWorkflow.save")} />
        <ManualWorkflowStep done={handled} label={t("exposureRadar.manualWorkflow.handle")} />
      </div>
    </div>
  );
}

function ManualHandlingRecord({
  item,
  manualState,
  timeZone,
  feedbackSaving,
  onSubmitFeedback,
  onSubmitResult,
}: {
  item: ExposureRadarItemApi;
  manualState?: ManualActionState;
  timeZone: string;
  feedbackSaving: boolean;
  onSubmitFeedback: (outcome: ManualOutcome, comment: string) => void;
  onSubmitResult: (result: { impressions?: number; likes?: number; replies?: number; reposts?: number; quotes?: number; bookmarks?: number; notes?: string }) => void;
}) {
  const { t } = useT();
  const replyURL = manualState?.publishedUrl || item.comment_url || "";
  const replyID = item.comment_tweet_id || extractTweetID(replyURL);
  const statusKey = manualRecordStatus(item, manualState);
  const updatedAt = manualState?.updatedAt ? formatDateTime(manualState.updatedAt, timeZone) : "-";
  const [feedbackComment, setFeedbackComment] = useState(manualState?.feedbackComment || "");
  const [resultForm, setResultForm] = useState(() => manualResultFormFromState(manualState));
  const saveResult = () => onSubmitResult({
    impressions: parseOptionalCount(resultForm.impressions),
    likes: parseOptionalCount(resultForm.likes),
    replies: parseOptionalCount(resultForm.replies),
    reposts: parseOptionalCount(resultForm.reposts),
    quotes: parseOptionalCount(resultForm.quotes),
    bookmarks: parseOptionalCount(resultForm.bookmarks),
    notes: resultForm.notes.trim(),
  });
  return (
    <div className="mt-3 rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.manualRecord.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.manualRecord.description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {item.manual_action_url ? (
            <a href={item.manual_action_url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-full border border-[#2f3336] px-3 text-xs font-semibold text-[#e7e9ea] hover:bg-black">
              {t("exposureRadar.manualRecord.openOriginal")}
              <ExternalLink className="size-3.5" />
            </a>
          ) : null}
          {replyURL ? (
            <a href={replyURL} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-full border border-[#00ba7c]/30 bg-[#00ba7c]/10 px-3 text-xs font-semibold text-[#7ee0b5] hover:bg-[#00ba7c]/15">
              {t("exposureRadar.manualRecord.openReply")}
              <ExternalLink className="size-3.5" />
            </a>
          ) : null}
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <ManualRecordField label={t("exposureRadar.manualRecord.task")} value={item.review_task_id ? `#${item.review_task_id}` : "-"} />
        <ManualRecordField label={t("exposureRadar.manualRecord.status")} value={t(`exposureRadar.manualRecord.status.${statusKey}`)} />
        <ManualRecordField label={t("exposureRadar.manualRecord.replyId")} value={replyID || t("exposureRadar.manualRecord.noReply")} />
        <ManualRecordField label={t("exposureRadar.manualRecord.updated")} value={updatedAt} />
      </div>
      {manualState?.safetyStatus || manualState?.replyAngleTitle ? (
        <div className="mt-3 rounded-lg border border-[#2f3336] bg-black p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.manualRecord.safetyTitle")}</p>
              <p className="mt-1 text-xs leading-5 text-[#71767b]">{manualState.safetySummary || t("exposureRadar.manualRecord.safetyEmpty")}</p>
            </div>
            {manualState.safetyStatus ? (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${safetyReviewBadgeTone(manualState.safetyStatus)}`}>
                <ShieldAlert className="size-3.5" />
                {t(`exposureRadar.safetyReview.status.${manualState.safetyStatus}`)}
              </span>
            ) : null}
          </div>
          {manualState.replyAngleTitle ? (
            <p className="mt-2 text-xs leading-5 text-[#8b98a5]">{t("exposureRadar.manualRecord.replyAngle", { angle: manualState.replyAngleTitle })}</p>
          ) : null}
        </div>
      ) : null}
      <div className="mt-3 rounded-lg border border-[#2f3336] bg-black p-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.resultTracking.title")}</p>
            <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.resultTracking.description")}</p>
          </div>
          {manualState?.resultCheckedAt ? (
            <span className="inline-flex h-7 items-center rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-2.5 text-xs font-semibold text-[#7ee0b5]">
              {t("exposureRadar.resultTracking.score", { score: manualState.resultScore || 0 })}
            </span>
          ) : null}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <ResultInput label={t("exposureRadar.resultTracking.impressions")} value={resultForm.impressions} onChange={(value) => setResultForm((current) => ({ ...current, impressions: value }))} />
          <ResultInput label={t("exposureRadar.resultTracking.likes")} value={resultForm.likes} onChange={(value) => setResultForm((current) => ({ ...current, likes: value }))} />
          <ResultInput label={t("exposureRadar.resultTracking.replies")} value={resultForm.replies} onChange={(value) => setResultForm((current) => ({ ...current, replies: value }))} />
          <ResultInput label={t("exposureRadar.resultTracking.reposts")} value={resultForm.reposts} onChange={(value) => setResultForm((current) => ({ ...current, reposts: value }))} />
          <ResultInput label={t("exposureRadar.resultTracking.quotes")} value={resultForm.quotes} onChange={(value) => setResultForm((current) => ({ ...current, quotes: value }))} />
          <ResultInput label={t("exposureRadar.resultTracking.bookmarks")} value={resultForm.bookmarks} onChange={(value) => setResultForm((current) => ({ ...current, bookmarks: value }))} />
        </div>
        <div className="mt-3 flex flex-col gap-2 md:flex-row">
          <input
            value={resultForm.notes}
            onChange={(event) => setResultForm((current) => ({ ...current, notes: event.target.value }))}
            placeholder={t("exposureRadar.resultTracking.notesPlaceholder")}
            className="h-9 min-w-0 flex-1 rounded-full border border-[#2f3336] bg-[#0f1419] px-3 text-xs text-[#e7e9ea] outline-none transition focus:border-[#1d9bf0]"
          />
          <Button type="button" size="sm" variant="outline" onClick={saveResult}>
            <BarChart3 className="size-3.5" />
            {t("exposureRadar.resultTracking.save")}
          </Button>
        </div>
      </div>
      <div className="mt-3 rounded-lg border border-[#2f3336] bg-black p-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.manualFeedback.title")}</p>
            <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.manualFeedback.description")}</p>
          </div>
          {manualState?.outcome ? (
            <span className="inline-flex h-7 items-center rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-2.5 text-xs font-semibold text-[#8ecdf8]">
              {t("exposureRadar.manualFeedback.recorded", { outcome: t(`exposureRadar.manualFeedback.outcome.${manualState.outcome}`) })}
            </span>
          ) : null}
        </div>
        <input
          value={feedbackComment}
          onChange={(event) => setFeedbackComment(event.target.value)}
          placeholder={t("exposureRadar.manualFeedback.placeholder")}
          disabled={feedbackSaving}
          className="mt-3 h-9 w-full rounded-full border border-[#2f3336] bg-[#0f1419] px-3 text-xs text-[#e7e9ea] outline-none transition focus:border-[#1d9bf0]"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {manualOutcomeOptions.map((outcome) => (
            <Button key={outcome} type="button" size="sm" variant={manualState?.outcome === outcome ? "default" : "outline"} disabled={feedbackSaving} onClick={() => onSubmitFeedback(outcome, feedbackComment)}>
              {feedbackSaving ? <RefreshCw className="size-3.5 animate-spin" /> : null}
              {t(`exposureRadar.manualFeedback.outcome.${outcome}`)}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ManualRecordField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-[#2f3336] bg-black px-3 py-2">
      <p className="text-[11px] text-[#71767b]">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-[#e7e9ea]" title={value}>{value}</p>
    </div>
  );
}

function ResultInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="min-w-0">
      <span className="text-[11px] text-[#71767b]">{label}</span>
      <input
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, ""))}
        className="mt-1 h-9 w-full rounded-lg border border-[#2f3336] bg-[#0f1419] px-3 text-xs font-semibold text-[#e7e9ea] outline-none transition focus:border-[#1d9bf0]"
      />
    </label>
  );
}

function ManualWorkflowStep({ done, label }: { done: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-semibold ${done ? "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" : "border-[#2f3336] bg-[#0f1419] text-[#71767b]"}`}>
      <CheckCircle2 className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{label}</span>
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
      <p className="flex items-center gap-1 text-[11px] text-[#71767b]">{icon}{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[#e7e9ea]">{value}</p>
    </div>
  );
}

function MetricPill({ icon, label, value }: { icon: ReactNode; label: string; value?: number }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#2f3336] bg-black px-3 py-2">
      <p className="flex items-center gap-1 text-[11px] text-[#71767b]">{icon}{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[#e7e9ea]">{typeof value === "number" ? formatCompact(value) : "-"}</p>
    </div>
  );
}

function VelocitySparkline({ values }: { values: number[] }) {
  const { t } = useT();
  const normalized = values.filter((value) => Number.isFinite(value) && value >= 0).slice(-12);
  if (normalized.length < 4) return null;
  const min = Math.min(...normalized);
  const max = Math.max(...normalized);
  if (max <= 0 || max - min < 1) return null;
  const width = 160;
  const height = 34;
  const points = normalized.map((value, index) => {
    const x = normalized.length === 1 ? 0 : (index / (normalized.length - 1)) * width;
    const y = height - ((value - min) / (max - min)) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <div className="mt-3 rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2">
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-[#71767b]">
        <span>{t("exposureRadar.card.velocityTrend")}</span>
        <span>{formatCompact(Math.round(max))}</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-9 w-full overflow-visible" role="img" aria-label={t("exposureRadar.card.velocityTrend")}>
        <polyline points={points} fill="none" stroke="#1d9bf0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function formatVelocityLabel(value: number | undefined, samplingLabel: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return samplingLabel;
  }
  const rounded = Math.round(value);
  if (rounded < 1) {
    return samplingLabel;
  }
  return `${rounded}/min`;
}

function buildRadarMemoryPayload(item: ExposureRadarItemApi, twitterAccountID: number, botID: number, selectedReplyAngle?: ReplyAngleSuggestion): ContentLibraryItemPayload {
  const velocityState = normalizeVelocityState(item.velocity_state, item.status);
  const qualityStage = normalizeQualityStage(item.quality_stage, item);
  const opportunityExplanation = buildMemoryOpportunityExplanation(item);
  const replyAngleIDs = buildReplyAngleIDs(item);
  const selectedReplyGuide = selectedReplyAngle ? replyAngleGenerationGuides[selectedReplyAngle.id] : undefined;
  const title = compactTitle(item.topic_name || item.title || "Exposure Radar signal");
  const bodyLines = [
    `Signal: ${item.title}`,
    item.author_handle ? `Author: @${item.author_handle}${item.author_name ? ` (${item.author_name})` : ""}` : "",
    item.content ? `Context: ${item.content}` : "",
    exposureMetricSummary(item),
    item.reason ? `Why it matters: ${item.reason}` : "",
    item.recommended_use ? `Suggested operator action: ${item.recommended_use}` : "",
    item.ranking_reason ? `Ranking note: ${item.ranking_reason}` : "",
    item.quality_reason ? `Quality stage: ${qualityStage}; ${item.quality_reason}` : `Quality stage: ${qualityStage}.`,
    formatMemoryOpportunityExplanation(opportunityExplanation, selectedReplyGuide, replyAngleIDs),
    `Radar metadata: region=${item.region}; quality=${item.data_quality}; score=${item.score}; velocity=${velocityState}; risk=${item.risk_level || "unknown"}.`,
  ].filter(Boolean);
  return {
    twitter_account_id: twitterAccountID,
    bot_id: botID,
    title,
    item_type: "data_insight",
    body: bodyLines.join("\n"),
    source_url: item.url || undefined,
    topics: uniqueList(["exposure-radar", "operator-explanation", item.region, item.topic_name, velocityState, qualityStage, item.opportunity_type, item.data_quality, selectedReplyAngle ? `reply-angle-${selectedReplyAngle.id}` : "", ...replyAngleIDs.map((id) => `reply-angle-${id}`)]),
    growth_goal: "Use as OAF Bot memory for context-aware X replies, opportunity review, and safe manual growth decisions.",
    cta_preference: "Use only when relevant. Keep replies review-first, match the selected angle, and do not force product promotion.",
    priority: clampPriority(item.score),
    status: "active",
  };
}

function buildRadarContentSeedPayload(item: ExposureRadarItemApi, twitterAccountID: number, botID: number): ContentLibraryItemPayload {
  const velocityState = normalizeVelocityState(item.velocity_state, item.status);
  const qualityStage = normalizeQualityStage(item.quality_stage, item);
  const replyAngleIDs = buildReplyAngleIDs(item);
  const title = compactTitle(`${item.topic_name || item.title || "Exposure signal"} content seed`);
  const bodyLines = [
    `Source signal: ${item.title}`,
    item.author_handle ? `Source author: @${item.author_handle}${item.author_name ? ` (${item.author_name})` : ""}` : "",
    item.content ? `Observed context: ${item.content}` : "",
    exposureMetricSummary(item),
    item.reason ? `Audience insight: ${item.reason}` : "",
    item.recommended_use ? `Possible content angle: ${item.recommended_use}` : "",
    item.quality_reason ? `Quality note: ${item.quality_reason}` : "",
    replyAngleIDs.length ? `Reply angles to learn from: ${replyAngleIDs.map((id) => replyAngleGenerationGuides[id].label).join(", ")}` : "",
    "Draft direction: Turn this into an original post, thread seed, or operator note. Do not copy the source post and do not force a product pitch.",
    `Radar metadata: region=${item.region}; quality=${item.data_quality}; score=${item.score}; velocity=${velocityState}; stage=${qualityStage}; risk=${item.risk_level || "unknown"}.`,
  ].filter(Boolean);
  return {
    twitter_account_id: twitterAccountID,
    bot_id: botID,
    title,
    item_type: "thread_seed",
    body: bodyLines.join("\n"),
    source_url: item.url || undefined,
    topics: uniqueList(["exposure-radar", "content-seed", item.region, item.topic_name, velocityState, qualityStage, item.opportunity_type, item.data_quality, ...replyAngleIDs.map((id) => `reply-angle-${id}`)]),
    growth_goal: "Convert a live opportunity signal into original account content while preserving persona, context, and safety boundaries.",
    cta_preference: "Use as research context only. Keep the final post useful, specific, and manually reviewed before publishing.",
    priority: clampPriority(item.score),
    status: "active",
  };
}

function findContentDraftPlanForSeed(plans: ContentDraftPlanApi[], accountID: number, botID: number) {
  return plans.find((plan) => plan.x_account_id === accountID && plan.bot_id === botID && plan.enabled)
    || plans.find((plan) => plan.x_account_id === accountID && plan.bot_id === botID)
    || null;
}

function buildSeedDraftDirection(item: ExposureRadarItemApi) {
  const qualityStage = normalizeQualityStage(item.quality_stage, item);
  const velocityState = normalizeVelocityState(item.velocity_state, item.status);
  return [
    "Create an original X post or short thread seed from this Exposure Radar signal.",
    "Do not copy the source post. Do not directly pitch the product.",
    `Signal title: ${item.title}`,
    item.content ? `Observed context: ${item.content}` : "",
    item.topic_name ? `Topic: ${item.topic_name}` : "",
    exposureMetricSummary(item),
    item.reason ? `Why this matters: ${item.reason}` : "",
    item.recommended_use ? `Suggested operator angle: ${item.recommended_use}` : "",
    `Quality stage: ${qualityStage}; velocity: ${velocityState}; risk: ${item.risk_level || "unknown"}.`,
    "Write with a concise founder/operator voice. Make it useful even if readers never saw the source post.",
  ].filter(Boolean).join("\n");
}

function buildSignalDecisionSummary(item: ExposureRadarItemApi, t: (key: string, params?: Record<string, string | number>) => string): SignalDecisionSummary {
  const qualityStage = normalizeQualityStage(item.quality_stage, item);
  const tier = normalizeOpportunityTier(item.opportunity_tier);
  const velocityState = normalizeVelocityState(item.velocity_state, item.status);
  const riskHigh = item.risk_level === "high";
  const riskMedium = item.risk_level === "medium";
  const topicLevel = item.data_quality === "topic_level";
  const proof = uniqueList([
    t("exposureRadar.decision.proof.score", { score: item.score || 0 }),
    typeof item.impression_count === "number" && item.impression_count > 0 ? t("exposureRadar.decision.proof.views", { views: formatCompact(item.impression_count) }) : "",
    typeof item.views_per_min === "number" && item.views_per_min > 0 ? t("exposureRadar.decision.proof.speed", { speed: formatVelocityLabel(item.views_per_min, "0/min") }) : "",
    typeof item.followers_count === "number" && item.followers_count > 0 ? t("exposureRadar.decision.proof.followers", { followers: formatCompact(item.followers_count) }) : "",
    item.ranking_delta ? t("exposureRadar.decision.proof.learning", { delta: item.ranking_delta }) : "",
  ]).slice(0, 3);
  if (topicLevel) {
    return {
      mode: "research",
      title: t("exposureRadar.decision.research.title"),
      detail: t("exposureRadar.decision.research.detail"),
      proof: proof.length ? proof : [t("exposureRadar.decision.proof.topicLevel")],
    };
  }
  if (riskHigh || qualityStage === "expired" || velocityState === "cooling") {
    return {
      mode: "skip",
      title: t(riskHigh ? "exposureRadar.decision.skipRisk.title" : "exposureRadar.decision.skipExpired.title"),
      detail: t(riskHigh ? "exposureRadar.decision.skipRisk.detail" : "exposureRadar.decision.skipExpired.detail"),
      proof: proof.length ? proof : [t("exposureRadar.decision.proof.risk")],
    };
  }
  if (qualityStage === "act_now" || tier === "hot_opportunity" || velocityState === "burst") {
    return {
      mode: "act_now",
      title: t("exposureRadar.decision.actNow.title"),
      detail: t("exposureRadar.decision.actNow.detail"),
      proof: proof.length ? proof : [t("exposureRadar.decision.proof.actNow")],
    };
  }
  return {
    mode: "watch",
    title: t(riskMedium ? "exposureRadar.decision.watchRisk.title" : "exposureRadar.decision.watch.title"),
    detail: t(riskMedium ? "exposureRadar.decision.watchRisk.detail" : "exposureRadar.decision.watch.detail"),
    proof: proof.length ? proof : [t("exposureRadar.decision.proof.watch")],
  };
}

function buildMemoryOpportunityExplanation(item: ExposureRadarItemApi): OpportunityExplanation {
  const qualityStage = normalizeQualityStage(item.quality_stage, item);
  const velocityState = normalizeVelocityState(item.velocity_state, item.status);
  const reasons = uniqueList([
    item.quality_reason || memoryQualityReason(qualityStage),
    item.data_quality === "topic_level" ? "This is a topic-level signal, so a specific post should be selected before replying." : "",
    velocityState === "burst" ? "Velocity is in burst mode, so the operator should inspect it quickly." : "",
    velocityState === "rising" ? "Momentum is still rising, so a timely reply may land before the thread gets crowded." : "",
    velocityState === "new" ? "The signal is new, so the reply surface may still be open." : "",
    typeof item.views_per_min === "number" && item.views_per_min > 0 ? `Current velocity is about ${formatVelocityLabel(item.views_per_min, "0/min")}.` : "",
    typeof item.impression_count === "number" && item.impression_count > 0 ? `The post has about ${formatCompact(item.impression_count)} views, so it is not a cold-start signal.` : "",
    typeof item.followers_count === "number" && item.followers_count > 0 && item.followers_count <= 10000 ? `The author has about ${formatCompact(item.followers_count)} followers, which may make the reply surface friendlier.` : "",
    (item.ranking_delta || 0) > 0 ? "Historical feedback gives similar signals a positive ranking boost." : "",
  ]).slice(0, 3);
  const angleGuides = buildReplyAngleIDs(item).map((id) => {
    const guide = replyAngleGenerationGuides[id];
    return `${guide.label}: ${guide.instruction}`;
  });
  const avoid = uniqueList([
    qualityStage === "expired" ? "Do not force a late reply after the discussion has cooled." : "",
    item.data_quality === "topic_level" ? "Do not make claims from the topic alone; inspect the actual post first." : "",
    item.risk_level === "medium" || item.risk_level === "high" ? "Avoid sensitive judgments, exaggerated promises, and unverified facts." : "",
    "Do not directly pitch the product or drop links.",
    "Avoid generic replies; the response must fit the original context.",
  ]).slice(0, 3);
  return {
    fit: memoryOpportunityFitText(item),
    reasons: reasons.length ? reasons : [memoryQualityReason("watch")],
    angles: angleGuides.length ? angleGuides : [replyAngleGenerationGuides.lightQuestion.instruction],
    avoid: avoid.length ? avoid : ["Avoid generic replies; the response must fit the original context."],
  };
}

function formatMemoryOpportunityExplanation(explanation: OpportunityExplanation, selectedReplyGuide: ReplyAngleGenerationGuide | undefined, replyAngleIDs: ReplyAngleID[]) {
  const suggestedAngles = replyAngleIDs
    .map((id) => replyAngleGenerationGuides[id])
    .map((guide) => `${guide.label} (${guide.tone})`)
    .join(", ");
  return [
    "Operator explanation:",
    `Fit: ${explanation.fit}`,
    `Why handle: ${explanation.reasons.join(" | ")}`,
    `Reply angles: ${explanation.angles.join(" | ")}`,
    selectedReplyGuide ? `Selected reply angle: ${selectedReplyGuide.label} (${selectedReplyGuide.tone}) - ${selectedReplyGuide.instruction}` : "",
    suggestedAngles ? `Suggested angle tags: ${suggestedAngles}` : "",
    `Avoid: ${explanation.avoid.join(" | ")}`,
  ].filter(Boolean).join("\n");
}

function memoryQualityReason(qualityStage: string) {
  if (qualityStage === "act_now") return "Still inside the handling window, so a reply is less likely to miss the conversation rhythm.";
  if (qualityStage === "expired") return "May be past the best window, so confirm the post is still active before acting.";
  return "Worth watching until velocity or context becomes clearer.";
}

function memoryOpportunityFitText(item: ExposureRadarItemApi) {
  if (item.risk_level === "medium" || item.risk_level === "high") {
    return "This opportunity needs a brand-fit check first. Use a conservative, factual reply if you engage.";
  }
  if (item.data_quality === "topic_level") {
    return "This is a topic-level lead. Open live search first, then choose a specific post manually.";
  }
  if (typeof item.followers_count === "number" && item.followers_count > 0 && item.followers_count <= 10000) {
    return "The author is still relatively small, so the reply surface may be easier to enter with a useful point.";
  }
  if (normalizeQualityStage(item.quality_stage, item) === "act_now") {
    return "This opportunity is still inside the useful window, so it is worth checking and handling first.";
  }
  return "Treat this as a candidate signal. Confirm context and persona fit before replying.";
}

function buildOpportunityExplanation(item: ExposureRadarItemApi, t: (key: string, params?: Record<string, string | number>) => string): OpportunityExplanation {
  const qualityStage = normalizeQualityStage(item.quality_stage, item);
  const tier = normalizeOpportunityTier(item.opportunity_tier);
  const velocityState = normalizeVelocityState(item.velocity_state, item.status);
  const reasons = uniqueList([
    item.quality_reason || t(`exposureRadar.explanation.reason.${qualityStage}`),
    item.data_quality === "topic_level" ? t("exposureRadar.explanation.reason.topicLevel") : "",
    velocityState === "burst" || velocityState === "rising" || velocityState === "new" ? t(`exposureRadar.explanation.reason.velocity.${velocityState}`) : "",
    typeof item.views_per_min === "number" && item.views_per_min > 0 ? t("exposureRadar.explanation.reason.speed", { speed: formatVelocityLabel(item.views_per_min, "0/min") }) : "",
    typeof item.impression_count === "number" && item.impression_count > 0 ? t("exposureRadar.explanation.reason.views", { count: formatCompact(item.impression_count) }) : "",
    typeof item.followers_count === "number" && item.followers_count > 0 && item.followers_count <= 10000 ? t("exposureRadar.explanation.reason.lowFans", { count: formatCompact(item.followers_count) }) : "",
    (item.ranking_delta || 0) > 0 ? t("exposureRadar.explanation.reason.learned") : "",
  ]).slice(0, 3);
  const angles = uniqueList([
    item.generated_comment ? t("exposureRadar.explanation.angle.generated") : "",
    item.data_quality === "topic_level" ? t("exposureRadar.explanation.angle.topicResearch") : "",
    item.risk_level === "medium" || item.risk_level === "high" ? t("exposureRadar.explanation.angle.lowRiskQuestion") : "",
    tier === "hot_opportunity" || qualityStage === "act_now" ? t("exposureRadar.explanation.angle.operatorInsight") : "",
    typeof item.followers_count === "number" && item.followers_count > 0 && item.followers_count <= 10000 ? t("exposureRadar.explanation.angle.peerReply") : "",
    item.topic_name ? t("exposureRadar.explanation.angle.topic", { topic: item.topic_name }) : "",
    t("exposureRadar.explanation.angle.default"),
  ]).slice(0, 3);
  const avoid = uniqueList([
    qualityStage === "expired" ? t("exposureRadar.explanation.avoid.expired") : "",
    item.data_quality === "topic_level" ? t("exposureRadar.explanation.avoid.topicLevel") : "",
    item.risk_level === "medium" || item.risk_level === "high" ? t("exposureRadar.explanation.avoid.risk") : "",
    t("exposureRadar.explanation.avoid.promotion"),
    t("exposureRadar.explanation.avoid.generic"),
  ]).slice(0, 3);
  return {
    fit: opportunityFitText(item, t),
    reasons: reasons.length ? reasons : [t("exposureRadar.explanation.reason.watch")],
    angles: angles.length ? angles : [t("exposureRadar.explanation.angle.default")],
    avoid: avoid.length ? avoid : [t("exposureRadar.explanation.avoid.generic")],
  };
}

function opportunityFitText(item: ExposureRadarItemApi, t: (key: string, params?: Record<string, string | number>) => string) {
  if (item.risk_level === "medium" || item.risk_level === "high") {
    return t("exposureRadar.explanation.fit.risk");
  }
  if (item.data_quality === "topic_level") {
    return t("exposureRadar.explanation.fit.topic");
  }
  if (typeof item.followers_count === "number" && item.followers_count > 0 && item.followers_count <= 10000) {
    return t("exposureRadar.explanation.fit.lowFans");
  }
  if (normalizeQualityStage(item.quality_stage, item) === "act_now") {
    return t("exposureRadar.explanation.fit.actNow");
  }
  return t("exposureRadar.explanation.fit.default");
}

function buildReplyAngleSuggestions(item: ExposureRadarItemApi, t: (key: string, params?: Record<string, string | number>) => string): ReplyAngleSuggestion[] {
  return buildReplyAngleIDs(item).map((id) => replyAngle(id, t));
}

function buildReplyPlan(item: ExposureRadarItemApi, replyAngle: ReplyAngleSuggestion, t: (key: string, params?: Record<string, string | number>) => string): ReplyPlan {
  const risky = item.risk_level === "medium" || item.risk_level === "high";
  const topic = item.topic_name || item.title || t("exposureRadar.replyPlan.topicFallback");
  const baseSafety = uniqueList([
    t("exposureRadar.replyPlan.safety.noPitch"),
    t("exposureRadar.replyPlan.safety.noClaims"),
    item.data_quality === "topic_level" ? t("exposureRadar.replyPlan.safety.topicResearch") : "",
    risky ? t("exposureRadar.replyPlan.safety.riskCheck") : "",
    normalizeQualityStage(item.quality_stage, item) === "expired" ? t("exposureRadar.replyPlan.safety.windowCheck") : "",
  ]).slice(0, 3);
  const angleSteps: Record<ReplyAngleID, string[]> = {
    operatorObservation: [
      t("exposureRadar.replyPlan.step.anchorSpecific"),
      t("exposureRadar.replyPlan.step.addObservation"),
      t("exposureRadar.replyPlan.step.keepShort"),
    ],
    lightQuestion: [
      t("exposureRadar.replyPlan.step.anchorSpecific"),
      t("exposureRadar.replyPlan.step.askQuestion"),
      t("exposureRadar.replyPlan.step.keepShort"),
    ],
    peerExperience: [
      t("exposureRadar.replyPlan.step.respondFirst"),
      t("exposureRadar.replyPlan.step.shareExperience"),
      t("exposureRadar.replyPlan.step.closeSoftly"),
    ],
    cautionNote: [
      t("exposureRadar.replyPlan.step.acknowledgeContext"),
      t("exposureRadar.replyPlan.step.addBoundary"),
      t("exposureRadar.replyPlan.step.noStrongJudgment"),
    ],
    topicResearch: [
      t("exposureRadar.replyPlan.step.findSpecificPost"),
      t("exposureRadar.replyPlan.step.anchorSpecific"),
      t("exposureRadar.replyPlan.step.keepShort"),
    ],
  };
  return {
    bestFor: t(`exposureRadar.replyPlan.bestFor.${replyAngle.id}`, { topic }),
    steps: angleSteps[replyAngle.id],
    safety: baseSafety.length ? baseSafety : [t("exposureRadar.replyPlan.safety.noPitch")],
    readyNote: item.generated_comment ? t("exposureRadar.replyPlan.ready.copy") : item.data_quality === "tweet_level" ? t("exposureRadar.replyPlan.ready.generate") : t("exposureRadar.replyPlan.ready.research"),
  };
}

function buildSafetyReview(item: ExposureRadarItemApi, replyAngle: ReplyAngleSuggestion | undefined, t: (key: string, params?: Record<string, string | number>) => string): SafetyReview {
  const generated = item.generated_comment || "";
  const checks: SafetyReviewCheck[] = [
    {
      key: "context",
      status: item.data_quality === "tweet_level" ? "pass" : "block",
      title: t("exposureRadar.safetyReview.check.context.title"),
      detail: item.data_quality === "tweet_level" ? t("exposureRadar.safetyReview.check.context.pass") : t("exposureRadar.safetyReview.check.context.block"),
    },
    {
      key: "risk",
      status: item.risk_level === "high" ? "block" : item.risk_level === "medium" ? "watch" : "pass",
      title: t("exposureRadar.safetyReview.check.risk.title"),
      detail: item.risk_level === "high" ? t("exposureRadar.safetyReview.check.risk.high") : item.risk_level === "medium" ? t("exposureRadar.safetyReview.check.risk.medium") : t("exposureRadar.safetyReview.check.risk.pass"),
    },
    {
      key: "window",
      status: normalizeQualityStage(item.quality_stage, item) === "expired" ? "watch" : "pass",
      title: t("exposureRadar.safetyReview.check.window.title"),
      detail: normalizeQualityStage(item.quality_stage, item) === "expired" ? t("exposureRadar.safetyReview.check.window.watch") : t("exposureRadar.safetyReview.check.window.pass"),
    },
    {
      key: "angle",
      status: replyAngle?.id === "cautionNote" || replyAngle?.id === "topicResearch" ? "watch" : "pass",
      title: t("exposureRadar.safetyReview.check.angle.title"),
      detail: replyAngle ? t(`exposureRadar.safetyReview.check.angle.${replyAngle.id}`) : t("exposureRadar.safetyReview.check.angle.none"),
    },
    {
      key: "promotion",
      status: hasPromotionalSmell(generated) ? "watch" : "pass",
      title: t("exposureRadar.safetyReview.check.promotion.title"),
      detail: hasPromotionalSmell(generated) ? t("exposureRadar.safetyReview.check.promotion.watch") : t("exposureRadar.safetyReview.check.promotion.pass"),
    },
    {
      key: "claims",
      status: hasRiskyGrowthClaim(generated) ? "block" : "pass",
      title: t("exposureRadar.safetyReview.check.claims.title"),
      detail: hasRiskyGrowthClaim(generated) ? t("exposureRadar.safetyReview.check.claims.block") : t("exposureRadar.safetyReview.check.claims.pass"),
    },
  ];
  const status = checks.some((check) => check.status === "block") ? "block" : checks.some((check) => check.status === "watch") ? "watch" : "pass";
  return {
    status,
    summary: t(`exposureRadar.safetyReview.summary.${status}`),
    checks,
  };
}

function hasPromotionalSmell(value: string) {
  if (!value) return false;
  return /octoagent|octo agent|oaf bot|try our|sign up|join us|https?:\/\//i.test(value);
}

function hasRiskyGrowthClaim(value: string) {
  if (!value) return false;
  return /guarantee|guaranteed|5m|5M|fully automated|passive income|spam at scale/i.test(value);
}

function safetyReviewTone(status: SafetyReviewStatus) {
  switch (status) {
    case "block":
      return "border-[#f4212e]/25 bg-[#1f0709]";
    case "watch":
      return "border-[#ffd400]/25 bg-[#1f1a07]";
    default:
      return "border-[#00ba7c]/20 bg-[#061a14]";
  }
}

function safetyReviewBadgeTone(status: SafetyReviewStatus) {
  switch (status) {
    case "block":
      return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
    case "watch":
      return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
    default:
      return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  }
}

function safetyReviewDot(status: SafetyReviewStatus) {
  switch (status) {
    case "block":
      return "bg-[#f4212e]";
    case "watch":
      return "bg-[#ffd400]";
    default:
      return "bg-[#00ba7c]";
  }
}

function buildReplyAngleIDs(item: ExposureRadarItemApi): ReplyAngleID[] {
  const qualityStage = normalizeQualityStage(item.quality_stage, item);
  const tier = normalizeOpportunityTier(item.opportunity_tier);
  const risky = item.risk_level === "medium" || item.risk_level === "high";
  const lowFans = typeof item.followers_count === "number" && item.followers_count > 0 && item.followers_count <= 10000;
  const candidates: Array<ReplyAngleID | undefined> = [
    item.data_quality === "topic_level" ? "topicResearch" : undefined,
    risky ? "cautionNote" : undefined,
    qualityStage === "act_now" || tier === "hot_opportunity" ? "operatorObservation" : undefined,
    lowFans ? "peerExperience" : undefined,
    !risky ? "lightQuestion" : undefined,
    "operatorObservation",
    "lightQuestion",
    "peerExperience",
  ];
  const seen = new Set<ReplyAngleID>();
  const suggestions: ReplyAngleID[] = [];
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    suggestions.push(candidate);
    if (suggestions.length >= 3) break;
  }
  return suggestions;
}

function replyAngle(id: ReplyAngleID, t: (key: string, params?: Record<string, string | number>) => string): ReplyAngleSuggestion {
  return {
    id,
    title: t(`exposureRadar.replyAngles.${id}.title`),
    description: t(`exposureRadar.replyAngles.${id}.description`),
    prompt: t(`exposureRadar.replyAngles.${id}.prompt`),
    tone: t(`exposureRadar.replyAngles.${id}.tone`),
  };
}

function buildDraftRecommendedUse(item: ExposureRadarItemApi, replyAngle?: ReplyAngleSuggestion) {
  if (!replyAngle) return item.recommended_use;
  const generationGuide = replyAngleGenerationGuides[replyAngle.id];
  return [
    item.recommended_use,
    `Selected reply angle: ${generationGuide.label}`,
    `Angle tone: ${generationGuide.tone}`,
    `Angle instruction: ${generationGuide.instruction}`,
    `Reply plan: ${replyPlanGenerationInstruction(replyAngle.id)}`,
  ].filter(Boolean).join("\n\n");
}

function buildDraftReason(item: ExposureRadarItemApi, replyAngle?: ReplyAngleSuggestion) {
  if (!replyAngle) return item.reason;
  const generationGuide = replyAngleGenerationGuides[replyAngle.id];
  return [
    item.reason,
    `Operator selected reply angle: ${generationGuide.label} - ${generationGuide.instruction}`,
  ].filter(Boolean).join("\n\n");
}

function replyPlanGenerationInstruction(angleID: ReplyAngleID) {
  switch (angleID) {
    case "lightQuestion":
      return "Anchor on one concrete post detail, ask one low-pressure question, and stop.";
    case "peerExperience":
      return "Respond to the author's point first, add one short peer experience, and avoid centering the product.";
    case "cautionNote":
      return "Acknowledge the context, add one conservative boundary or condition, and avoid strong judgments.";
    case "topicResearch":
      return "Treat this as research-only until a specific post is found; do not reply from topic context alone.";
    default:
      return "Anchor on one concrete post detail, add one practical operator observation, and avoid product promotion.";
  }
}

function buildDailyActionPlan(items: ExposureRadarItemApi[], manualActionStates: Record<string, ManualActionState>, savedMemoryIDs: Set<string>, learningProfile: ExposureLearningProfile, limit = 6): DailyActionPlanItem[] {
  return items
    .filter((item) => !isManualActionHandled(item, manualActionStates[item.id]) && !isDeferredManualTask(manualActionStates[item.id]))
    .map((item) => ({
      item,
      action: dailyActionType(item, manualActionStates[item.id], savedMemoryIDs),
      reason: dailyActionReason(item, manualActionStates[item.id], learningProfile),
      priority: dailyActionPriority(item, manualActionStates[item.id], savedMemoryIDs, learningProfile),
    }))
    .filter((entry) => entry.priority > 0)
    .sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      if (a.item.score !== b.item.score) return b.item.score - a.item.score;
      return a.item.id.localeCompare(b.item.id);
    })
    .slice(0, limit);
}

function buildWorkbenchStats(items: ExposureRadarItemApi[], manualActionStates: Record<string, ManualActionState>): WorkbenchStats {
  return items.reduce((acc, item) => {
    const handled = isManualActionHandled(item, manualActionStates[item.id]);
    if (isDeferredManualTask(manualActionStates[item.id])) return acc;
    const qualityStage = normalizeQualityStage(item.quality_stage, item);
    const tier = normalizeOpportunityTier(item.opportunity_tier);
    if (handled) {
      acc.handled += 1;
      return acc;
    }
    if (qualityStage === "act_now") acc.actNow += 1;
    if (qualityStage === "act_now" || tier === "hot_opportunity" || tier === "rising_opportunity" || item.generated_comment || item.review_task_id) {
      acc.pending += 1;
    }
    return acc;
  }, { pending: 0, actNow: 0, handled: 0 });
}

function dailyDeskFocusKey({
  selectedAccountID,
  selectedBotID,
  strategyReady,
  stats,
  moves,
  recentBackfilled,
}: {
  selectedAccountID: number;
  selectedBotID: number;
  strategyReady: boolean;
  stats: WorkbenchStats;
  moves: DailyActionPlanItem[];
  recentBackfilled: number;
}): DailyDeskFocusKey {
  if (!selectedAccountID || !selectedBotID) return "setup";
  if (!strategyReady) return "strategy";
  if (stats.actNow > 0 || moves.length > 0) return "handle";
  if (stats.handled > 0 && recentBackfilled === 0) return "backfill";
  return "review";
}

function dailyDeskFocusAnchor(key: DailyDeskFocusKey) {
  if (key === "setup") return "#radar-setup";
  if (key === "strategy") return "#radar-strategy";
  if (key === "backfill" || key === "review") return "#radar-results";
  return "#radar-workbench";
}

function dailyDeskRhythmAnchor(step: string) {
  if (step === "scan") return "#radar-setup";
  if (step === "save") return "#radar-people";
  if (step === "review") return "#radar-results";
  return "#radar-workbench";
}

function isRecentManualRecord(record: ExposureRadarManualRecordApi, hours: number) {
  const value = Math.max(
    manualRecordTimeValue(record.handled_at),
    manualRecordTimeValue(record.result_checked_at),
    manualRecordTimeValue(record.feedback_at),
    manualRecordTimeValue(record.updated_at),
    manualRecordTimeValue(record.created_at),
  );
  if (!value) return false;
  return Date.now() - value <= hours * 60 * 60 * 1000;
}

function manualRecordTimeValue(value?: string) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function bestExposureResultRecord(records: ExposureRadarManualRecordApi[]) {
  return records
    .filter((record) => record.result_checked_at || record.result_score || record.result_impression_count)
    .slice()
    .sort((a, b) => {
      const scoreDelta = (b.result_score || 0) - (a.result_score || 0);
      if (scoreDelta !== 0) return scoreDelta;
      const impressionDelta = (b.result_impression_count || 0) - (a.result_impression_count || 0);
      if (impressionDelta !== 0) return impressionDelta;
      return manualRecordTimeValue(b.result_checked_at || b.updated_at) - manualRecordTimeValue(a.result_checked_at || a.updated_at);
    })[0];
}

function exposureSignalQualityStatus(data: ExposureRadarData | null, loadState: LoadState): SignalQualityStatus {
  if (loadState === "loading" || !data) return "warming";
  if (!data.items.length) return "empty";
  const diagnostics = data.diagnostics;
  if (diagnostics?.status === "limited" || diagnostics?.status === "stale" || diagnostics?.status === "fallback" || diagnostics?.status === "blocked") return "limited";
  if (data.items.some((item) => item.data_quality === "tweet_level" && normalizeQualityStage(item.quality_stage, item) !== "expired")) return "ready";
  return "warming";
}

function signalQualityTone(status: SignalQualityStatus) {
  switch (status) {
    case "ready":
      return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
    case "empty":
      return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
    case "limited":
      return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
    default:
      return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  }
}

function signalHealthDetail(data: ExposureRadarData | null, loadState: LoadState, t: (key: string, params?: Record<string, string | number>) => string) {
  if (loadState === "loading" || !data) return t("exposureRadar.command.signalHealth.detail.warming");
  if (!data.items.length) {
    const reason = data.diagnostics?.top_missing_reason || data.diagnostics?.top_missing_detail || data.source_notice || "-";
    return t("exposureRadar.command.signalHealth.detail.empty", { reason });
  }
  if (data.diagnostics?.top_missing_reason) {
    return t("exposureRadar.command.signalHealth.detail.limited", { reason: data.diagnostics.top_missing_reason });
  }
  return t("exposureRadar.command.signalHealth.detail.ready", { count: data.items.length });
}

function buildExposureLearningProfile(records: ExposureRadarManualRecordApi[], states: Record<string, ManualActionState>): ExposureLearningProfile {
  const boostedTopics = new Set<string>();
  const cautiousTopics = new Set<string>();
  const preferredAngles = new Set<string>();
  const markTopic = (record: ExposureRadarManualRecordApi, positive: boolean) => {
    const key = exposureLearningTopicKey(record.topic_name || record.title);
    if (!key) return;
    if (positive) {
      boostedTopics.add(key);
      cautiousTopics.delete(key);
    } else if (!boostedTopics.has(key)) {
      cautiousTopics.add(key);
    }
  };
  records.forEach((record) => {
    const resultScore = record.result_score || 0;
    const positive = record.outcome === "effective" || resultScore >= 60 || (record.result_impression_count || 0) >= 500;
    const negative = record.outcome === "ineffective" || record.outcome === "not_suitable" || (resultScore > 0 && resultScore <= 20);
    if (positive) markTopic(record, true);
    if (negative) markTopic(record, false);
    if (positive && record.reply_angle_id) preferredAngles.add(record.reply_angle_id);
  });
  Object.values(states).forEach((state) => {
    if (state.outcome === "effective" && state.replyAngleID) preferredAngles.add(state.replyAngleID);
  });
  return { boostedTopics, cautiousTopics, preferredAngles };
}

function buildLearningImpactRows(
  records: ExposureRadarManualRecordApi[],
  profile: ExposureLearningProfile,
  t: (key: string, params?: Record<string, string | number>) => string,
): LearningImpactRow[] {
  const topicLabels = new Map<string, string>();
  records.forEach((record) => {
    const label = record.topic_name || record.title;
    const key = exposureLearningTopicKey(label);
    if (key && label && !topicLabels.has(key)) topicLabels.set(key, label);
  });
  const boosted = Array.from(profile.boostedTopics).map((key) => ({
    label: compactTitle(topicLabels.get(key) || key),
    detail: t("exposureRadar.learningPanel.impact.boosted"),
    tone: "positive" as const,
  }));
  const cautious = Array.from(profile.cautiousTopics).map((key) => ({
    label: compactTitle(topicLabels.get(key) || key),
    detail: t("exposureRadar.learningPanel.impact.cautious"),
    tone: "negative" as const,
  }));
  const angles = Array.from(profile.preferredAngles).map((angleID) => {
    const guide = replyAngleGenerationGuides[angleID as ReplyAngleID];
    return {
      label: guide?.label || angleID,
      detail: t("exposureRadar.learningPanel.impact.angle"),
      tone: "neutral" as const,
    };
  });
  return [...boosted, ...cautious, ...angles];
}

function exposureLearningTopicKey(value?: string) {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120);
}

function buildExposureLearningTopics(records: ExposureRadarManualRecordApi[], items: ExposureRadarItemApi[]) {
  const scores = new Map<string, { count: number; score: number }>();
  const add = (topic: string | undefined, score: number) => {
    const key = (topic || "").trim();
    if (!key) return;
    const existing = scores.get(key) || { count: 0, score: 0 };
    existing.count += 1;
    existing.score += score;
    scores.set(key, existing);
  };
  records.forEach((record) => add(record.topic_name || record.title, Math.max(record.result_score || 0, record.score || 0)));
  items.forEach((item) => add(item.topic_name || item.title, item.score || 0));
  return Array.from(scores.entries())
    .sort((a, b) => (b[1].score + b[1].count * 10) - (a[1].score + a[1].count * 10))
    .map(([topic, value]) => `${topic} · ${value.count}`);
}

function buildExposureLearningAngles(records: ExposureRadarManualRecordApi[], states: Record<string, ManualActionState>) {
  const counts = new Map<string, number>();
  const add = (value?: string) => {
    const key = (value || "").trim();
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  };
  records.forEach((record) => add(record.reply_angle_title || record.reply_angle_id));
  Object.values(states).forEach((state) => add(state.replyAngleTitle || state.replyAngleID));
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([angle, count]) => `${angle} · ${count}`);
}

function buildGrowthDeskBrief({
  data,
  strategy,
  moves,
  people,
  recentRecords,
  weeklyReview,
  safety,
  timeZone,
  t,
}: {
  data: ExposureRadarData | null;
  strategy: ExposureRadarGrowthStrategyApi | null;
  moves: DailyActionPlanItem[];
  people: PeopleRadarEntry[];
  recentRecords: ExposureRadarManualRecordApi[];
  weeklyReview: ExposureRadarWeeklyReviewData | null;
  safety: ExposureRadarSafetyCenterData | null;
  timeZone: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const refreshed = data?.updated_at ? formatDateTime(data.updated_at, timeZone) : "-";
  const handledToday = recentRecords.filter((record) => isRecentManualRecord(record, 24) && (record.handled_at || record.task_status === "done")).length;
  const backfilledToday = recentRecords.filter((record) => isRecentManualRecord(record, 24) && (record.result_checked_at || record.result_score)).length;
  const safetyWarnings = (safety?.watch_count || 0) + (safety?.block_count || 0);
  const topMoves = moves.slice(0, 3).map((entry, index) => `${index + 1}. ${entry.item.title} ${entry.item.author_handle ? `@${entry.item.author_handle}` : ""} · ${entry.item.score}`);
  const topPeople = people.slice(0, 3).map((person, index) => `${index + 1}. ${person.name}${person.handle ? ` @${person.handle}` : ""} · ${person.stage}`);
  return [
    t("exposureRadar.command.brief.heading"),
    t("exposureRadar.command.brief.line.region", { region: data?.region || "-", refreshed }),
    t("exposureRadar.command.brief.line.strategy", { audience: strategy?.target_audience || "-", topics: (strategy?.core_topics || []).slice(0, 3).join(", ") || "-" }),
    t("exposureRadar.command.brief.line.metrics", { signals: data?.items.length || 0, moves: moves.length, handled: handledToday, backfilled: backfilledToday }),
    t("exposureRadar.command.brief.line.safety", { warnings: safetyWarnings, effective: weeklyReview ? `${Math.round((weeklyReview.effective_rate || 0) * 100)}%` : "-" }),
    "",
    t("exposureRadar.command.brief.line.moves"),
    topMoves.length ? topMoves.join("\n") : t("exposureRadar.command.brief.none"),
    "",
    t("exposureRadar.command.brief.line.people"),
    topPeople.length ? topPeople.join("\n") : t("exposureRadar.command.brief.none"),
    "",
    t("exposureRadar.command.brief.footer"),
  ].join("\n");
}

function buildGrowthDeskBriefPreview({
  data,
  moves,
  people,
  safety,
  weeklyReview,
  t,
}: {
  data: ExposureRadarData | null;
  moves: DailyActionPlanItem[];
  people: PeopleRadarEntry[];
  safety: ExposureRadarSafetyCenterData | null;
  weeklyReview: ExposureRadarWeeklyReviewData | null;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return [
    t("exposureRadar.command.brief.previewLine.signals", { count: data?.items.length || 0 }),
    t("exposureRadar.command.brief.previewLine.moves", { count: moves.length }),
    t("exposureRadar.command.brief.previewLine.people", { count: people.length }),
    t("exposureRadar.command.brief.previewLine.safety", { count: (safety?.watch_count || 0) + (safety?.block_count || 0) }),
    t("exposureRadar.command.brief.previewLine.effective", { rate: weeklyReview ? `${Math.round((weeklyReview.effective_rate || 0) * 100)}%` : "-" }),
  ].join("\n");
}

function buildDailyReviewReportText({
  data,
  strategy,
  moves,
  recentRecords,
  weeklyReview,
  safety,
  learningProfile,
  timeZone,
  t,
}: {
  data: ExposureRadarData | null;
  strategy: ExposureRadarGrowthStrategyApi | null;
  moves: DailyActionPlanItem[];
  recentRecords: ExposureRadarManualRecordApi[];
  weeklyReview: ExposureRadarWeeklyReviewData | null;
  safety: ExposureRadarSafetyCenterData | null;
  learningProfile: ExposureLearningProfile;
  timeZone: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const todayRecords = recentRecords.filter((record) => isRecentManualRecord(record, 24));
  const handledToday = todayRecords.filter((record) => record.handled_at || record.task_status === "done").length;
  const backfilledToday = todayRecords.filter((record) => record.result_checked_at || record.result_score).length;
  const effectiveToday = todayRecords.filter((record) => record.outcome === "effective" || (record.result_score || 0) >= 60).length;
  const topResult = bestExposureResultRecord(todayRecords) || bestExposureResultRecord(recentRecords);
  const topTopics = buildDailyReviewTopics(todayRecords, moves).slice(0, 4);
  const nextActions = buildDailyReviewActions({ data, moves, recentRecords, safety, learningProfile, t }).slice(0, 4);
  return [
    t("exposureRadar.dailyReview.report.heading"),
    t("exposureRadar.dailyReview.report.line.region", { region: data?.region || "-", time: data?.updated_at ? formatDateTime(data.updated_at, timeZone) : "-" }),
    t("exposureRadar.dailyReview.report.line.strategy", { audience: strategy?.target_audience || "-", topics: (strategy?.core_topics || []).slice(0, 4).join(", ") || "-" }),
    t("exposureRadar.dailyReview.report.line.metrics", { handled: handledToday, backfilled: backfilledToday, effective: effectiveToday, queued: moves.length }),
    t("exposureRadar.dailyReview.report.line.safety", { warnings: (safety?.watch_count || 0) + (safety?.block_count || 0), rate: weeklyReview ? `${Math.round((weeklyReview.effective_rate || 0) * 100)}%` : "-" }),
    topResult ? t("exposureRadar.dailyReview.report.line.best", { title: compactTitle(topResult.title || "-"), score: topResult.result_score || 0, views: formatCompact(topResult.result_impression_count || 0) }) : t("exposureRadar.dailyReview.report.line.bestEmpty"),
    t("exposureRadar.dailyReview.report.line.topics", { topics: topTopics.join(", ") || "-" }),
    "",
    t("exposureRadar.dailyReview.report.next"),
    nextActions.map((action, index) => `${index + 1}. ${action}`).join("\n"),
  ].join("\n");
}

function buildDailyReviewTopics(records: ExposureRadarManualRecordApi[], moves: DailyActionPlanItem[]) {
  const counts = new Map<string, number>();
  const add = (value?: string) => {
    const topic = (value || "").trim();
    if (!topic) return;
    counts.set(topic, (counts.get(topic) || 0) + 1);
  };
  records.forEach((record) => add(record.topic_name || record.title));
  moves.forEach((move) => add(move.item.topic_name || move.item.title));
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([topic]) => compactTitle(topic));
}

function buildDailyReviewActions({
  data,
  moves,
  recentRecords,
  safety,
  learningProfile,
  t,
}: {
  data: ExposureRadarData | null;
  moves: DailyActionPlanItem[];
  recentRecords: ExposureRadarManualRecordApi[];
  safety: ExposureRadarSafetyCenterData | null;
  learningProfile: ExposureLearningProfile;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const actions: string[] = [];
  const todayRecords = recentRecords.filter((record) => isRecentManualRecord(record, 24));
  const pendingBackfill = todayRecords.filter((record) => (record.handled_at || record.task_status === "done") && !record.result_checked_at && !record.result_score).length;
  if (pendingBackfill > 0) actions.push(t("exposureRadar.dailyReview.action.backfill", { count: pendingBackfill }));
  if (moves.length > 0) actions.push(t("exposureRadar.dailyReview.action.handle", { title: compactTitle(moves[0].item.title) }));
  if ((safety?.watch_count || 0) + (safety?.block_count || 0) > 0) actions.push(t("exposureRadar.dailyReview.action.safety"));
  if (learningProfile.boostedTopics.size > 0) actions.push(t("exposureRadar.dailyReview.action.reuseTopic", { topic: Array.from(learningProfile.boostedTopics)[0] }));
  if (data?.diagnostics?.top_missing_reason) actions.push(t("exposureRadar.dailyReview.action.fixSignal", { reason: data.diagnostics.top_missing_reason }));
  if (!actions.length) actions.push(t("exposureRadar.dailyReview.action.default"));
  return actions;
}

function buildPeopleRadar(items: ExposureRadarItemApi[], manualActionStates: Record<string, ManualActionState>, savedMemoryIDs: Set<string>): PeopleRadarEntry[] {
  const people = new Map<string, PeopleRadarEntry>();
  for (const item of items) {
    if (item.data_quality !== "tweet_level") continue;
    const handle = (item.author_handle || "").replace(/^@/, "").trim();
    const name = item.author_name || handle || item.author_id || "";
    if (!handle && !name) continue;
    const key = (handle || item.author_id || name).toLowerCase();
    const existing = people.get(key);
    const state = manualActionStates[item.id];
    const handled = isManualActionHandled(item, state) ? 1 : 0;
    const drafted = item.generated_comment || item.review_task_id ? 1 : 0;
    const saved = isRadarItemSaved(item, savedMemoryIDs) ? 1 : 0;
    const engagement = publicEngagementCount(item);
    if (!existing) {
      people.set(key, {
        key,
        name,
        handle: handle || undefined,
        count: 1,
        handled,
        drafted,
        saved,
        maxScore: item.score || 0,
        totalEngagement: engagement,
        followers: item.followers_count,
        stage: "new",
        latestItem: item,
      });
      continue;
    }
    existing.count += 1;
    existing.handled += handled;
    existing.drafted += drafted;
    existing.saved += saved;
    existing.maxScore = Math.max(existing.maxScore, item.score || 0);
    existing.totalEngagement += engagement;
    if (typeof item.followers_count === "number" && item.followers_count > 0) {
      existing.followers = typeof existing.followers === "number" && existing.followers > 0 ? Math.max(existing.followers, item.followers_count) : item.followers_count;
    }
    if (radarItemTimeValue(item) > radarItemTimeValue(existing.latestItem)) {
      existing.latestItem = item;
    }
  }
  return Array.from(people.values())
    .map((person) => ({ ...person, stage: peopleRadarStage(person) }))
    .sort((a, b) => {
      const stageDelta = peopleRadarStageWeight(b.stage) - peopleRadarStageWeight(a.stage);
      if (stageDelta !== 0) return stageDelta;
      if (a.maxScore !== b.maxScore) return b.maxScore - a.maxScore;
      if (a.count !== b.count) return b.count - a.count;
      return b.totalEngagement - a.totalEngagement;
    });
}

function publicEngagementCount(item: ExposureRadarItemApi) {
  return (item.reply_count || 0) + (item.retweet_count || 0) + (item.like_count || 0) + (item.quote_count || 0) + (item.bookmark_count || 0);
}

function radarItemTimeValue(item: ExposureRadarItemApi) {
  const raw = item.published_at || item.updated_at || "";
  const value = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(value) ? value : 0;
}

function peopleRadarStage(person: PeopleRadarEntry): PeopleRadarStage {
  const unhandled = Math.max(0, person.count - person.handled);
  if (unhandled > 0 && person.maxScore >= 75) return "priority";
  if (person.count >= 2) return "repeat";
  if (person.handled > 0 || person.drafted > 0 || person.saved > 0) return "engaged";
  return "new";
}

function peopleRadarStageWeight(stage: PeopleRadarStage) {
  switch (stage) {
    case "priority":
      return 4;
    case "repeat":
      return 3;
    case "engaged":
      return 2;
    case "watch":
      return 2;
    case "avoid":
      return 0;
    default:
      return 1;
  }
}

function peopleRadarStageTone(stage: PeopleRadarStage) {
  switch (stage) {
    case "priority":
      return "border-[#f59e0b]/25 bg-[#f59e0b]/10 text-[#f6d96b]";
    case "repeat":
      return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
    case "engaged":
      return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
    case "watch":
      return "border-[#7856ff]/25 bg-[#7856ff]/10 text-[#c4b5fd]";
    case "avoid":
      return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
    default:
      return "border-[#2f3336] bg-[#16181c] text-[#8b98a5]";
  }
}

function dailyActionPriority(item: ExposureRadarItemApi, state: ManualActionState | undefined, savedMemoryIDs: Set<string>, learningProfile: ExposureLearningProfile) {
  const velocityState = normalizeVelocityState(item.velocity_state, item.status);
  const tier = normalizeOpportunityTier(item.opportunity_tier);
  const qualityStage = normalizeQualityStage(item.quality_stage, item);
  const topicKey = exposureLearningTopicKey(item.topic_name || item.title);
  let priority = item.score || 0;
  if (qualityStage === "act_now") priority += 18;
  if (qualityStage === "watch") priority += 3;
  if (qualityStage === "expired") priority -= 35;
  if (item.generated_comment || item.review_task_id) priority += 22;
  if (item.data_quality === "tweet_level") priority += 10;
  if (tier === "hot_opportunity") priority += 10;
  if (tier === "rising_opportunity") priority += 6;
  if (tier === "needs_sampling") priority -= 8;
  if (tier === "topic_lead") priority -= 6;
  if (velocityState === "burst") priority += 8;
  if (velocityState === "rising" || velocityState === "new") priority += 5;
  if ((item.views_per_min || 0) > 0) priority += Math.min(12, Math.round((item.views_per_min || 0) / 10));
  if ((item.followers_count || 0) > 0 && (item.followers_count || 0) <= 10000) priority += 5;
  if ((item.ranking_delta || 0) > 0) priority += Math.min(8, item.ranking_delta || 0);
  if (item.risk_level === "medium") priority -= 6;
  if (item.risk_level === "high") priority -= 18;
  if (velocityState === "cooling" || item.cooling) priority -= 10;
  if (isRadarItemSaved(item, savedMemoryIDs)) priority -= 4;
  if (state?.opened || state?.copied || state?.saved) priority -= 8;
  if (topicKey && learningProfile.boostedTopics.has(topicKey)) priority += 14;
  if (topicKey && learningProfile.cautiousTopics.has(topicKey)) priority -= 16;
  if (buildReplyAngleIDs(item).some((angleID) => learningProfile.preferredAngles.has(angleID))) priority += 4;
  return priority;
}

function dailyActionType(item: ExposureRadarItemApi, state: ManualActionState | undefined, savedMemoryIDs: Set<string>): DailyActionType {
  if (normalizeQualityStage(item.quality_stage, item) === "expired" && !item.generated_comment && !item.review_task_id) return "inspect";
  if (item.generated_comment || item.review_task_id) return "publish_reply";
  if (item.risk_level === "medium" || item.risk_level === "high") return "review_fit";
  if (item.data_quality === "tweet_level") return "generate_reply";
  if (!isRadarItemSaved(item, savedMemoryIDs) && !state?.saved) return "save_memory";
  return "inspect";
}

function dailyActionReason(item: ExposureRadarItemApi, state: ManualActionState | undefined, learningProfile: ExposureLearningProfile): DailyActionReason {
  const velocityState = normalizeVelocityState(item.velocity_state, item.status);
  const qualityStage = normalizeQualityStage(item.quality_stage, item);
  const topicKey = exposureLearningTopicKey(item.topic_name || item.title);
  if (topicKey && learningProfile.boostedTopics.has(topicKey)) return "learned";
  if (item.generated_comment || item.review_task_id) return "generated";
  if (qualityStage === "expired") return "expired";
  if (item.risk_level === "medium" || item.risk_level === "high") return "risk";
  if (qualityStage === "act_now") return "quality";
  if ((item.ranking_delta || 0) > 0) return "learned";
  if (normalizeOpportunityTier(item.opportunity_tier) === "needs_sampling") return "score";
  if (velocityState === "burst" || velocityState === "rising" || velocityState === "new") return "velocity";
  if ((item.followers_count || 0) > 0 && (item.followers_count || 0) <= 10000) return "low_fans";
  if (item.data_quality !== "tweet_level") return "topic";
  if (state?.opened || state?.copied) return "score";
  return "score";
}

function actionPlanTone(action: DailyActionType) {
  switch (action) {
    case "publish_reply":
      return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
    case "generate_reply":
      return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
    case "save_memory":
      return "border-[#7856ff]/25 bg-[#7856ff]/10 text-[#c4b5fd]";
    case "review_fit":
      return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
    default:
      return "border-[#2f3336] bg-[#16181c] text-[#8b98a5]";
  }
}

function actionPlanIcon(action: DailyActionType) {
  switch (action) {
    case "publish_reply":
      return <CheckCircle2 className="size-3.5" />;
    case "generate_reply":
      return <MessageSquarePlus className="size-3.5" />;
    case "save_memory":
      return <BookmarkPlus className="size-3.5" />;
    case "review_fit":
      return <ShieldAlert className="size-3.5" />;
    default:
      return <Search className="size-3.5" />;
  }
}

function radarItemMatchesFilter(item: ExposureRadarItemApi, filter: RadarViewFilter, savedMemoryIDs: Set<string>, manualActionStates: Record<string, ManualActionState>) {
  const tier = normalizeOpportunityTier(item.opportunity_tier);
  const qualityStage = normalizeQualityStage(item.quality_stage, item);
  switch (filter) {
    case "priority":
      return qualityStage === "act_now" || ((tier === "hot_opportunity" || tier === "rising_opportunity") && qualityStage !== "expired");
    case "act_now":
      return qualityStage === "act_now";
    case "watch":
      return qualityStage === "watch";
    case "expired":
      return qualityStage === "expired";
    case "tweet":
      return item.data_quality === "tweet_level";
    case "hot":
      return tier === "hot_opportunity";
    case "rising":
      return tier === "rising_opportunity";
    case "sampling":
      return tier === "needs_sampling";
    case "topic":
      return tier === "topic_lead";
    case "high_score":
      return item.score >= 75;
    case "needs_review":
      return item.risk_level === "medium" || item.risk_level === "high";
    case "saved":
      return isRadarItemSaved(item, savedMemoryIDs);
    case "drafted":
      return Boolean(item.generated_comment || item.review_task_id);
    case "pending_handling":
      return Boolean(item.generated_comment || item.review_task_id) && !isManualActionHandled(item, manualActionStates[item.id]);
    case "handled":
      return isManualActionHandled(item, manualActionStates[item.id]);
    case "backfilled":
      return hasManualBackfill(item, manualActionStates[item.id]);
    default:
      return true;
  }
}

function isManualActionHandled(item: ExposureRadarItemApi, state?: ManualActionState) {
  return Boolean(state?.handled) || state?.taskStatus === "done" || item.status === "handled" || item.review_status === "handled";
}

function isDeferredManualTask(state?: ManualActionState) {
  return state?.taskStatus === "skipped" || state?.taskStatus === "later";
}

function hasManualBackfill(item: ExposureRadarItemApi, state?: ManualActionState) {
  return Boolean(item.comment_url || item.comment_tweet_id || state?.publishedUrl);
}

function manualRecordStatus(item: ExposureRadarItemApi, state?: ManualActionState) {
  if (state?.taskStatus === "skipped") return "skipped";
  if (state?.taskStatus === "later") return "later";
  if (hasManualBackfill(item, state)) return "backfilled";
  if (isManualActionHandled(item, state)) return "handled";
  if (state?.copied || state?.opened || state?.saved) return "in_progress";
  return "generated";
}

function buildManualOutcomePayload(outcome: ManualOutcome, comment: string, item: ExposureRadarItemApi) {
  const meta = manualOutcomeFeedbackMeta[outcome];
  const parts = [
    comment.trim(),
    item.comment_url ? `reply_url=${item.comment_url}` : "",
    item.comment_tweet_id ? `reply_id=${item.comment_tweet_id}` : "",
    item.id ? `signal_id=${item.id}` : "",
    item.region ? `region=${item.region}` : "",
    item.topic_name ? `topic=${item.topic_name}` : "",
    item.opportunity_type ? `opportunity_type=${item.opportunity_type}` : "",
    item.data_quality ? `data_quality=${item.data_quality}` : "",
  ].filter(Boolean);
  return {
    rating: meta.rating,
    issue_tags: meta.issueTags,
    outcome,
    comment: parts.join(" | "),
  };
}

function buildManualRecordPayload(
  item: ExposureRadarItemApi,
  options: {
    selectedAccountID: number;
    selectedBotID: number;
    patch: Partial<ManualActionState>;
    safetyReview: SafetyReview;
    replyAngle?: ReplyAngleSuggestion;
  },
): ExposureRadarManualRecordPayload {
  const patch = options.patch;
  const taskStatus = patch.taskStatus || (patch.handled ? "done" : patch.copied || patch.opened || patch.saved || patch.outcome ? "in_progress" : undefined);
  return {
    bot_id: options.selectedBotID || undefined,
    x_account_id: options.selectedAccountID || undefined,
    signal_id: item.id,
    region: item.region,
    data_source: item.data_source,
    data_quality: item.data_quality,
    tweet_id: item.tweet_id || extractTweetID(item.url || item.id),
    url: item.url,
    title: item.title,
    content: item.content,
    author_id: item.author_id,
    author_handle: item.author_handle,
    author_name: item.author_name,
    topic_name: item.topic_name,
    score: item.score,
    risk_level: item.risk_level,
    opportunity_type: item.opportunity_type,
    opportunity_tier: item.opportunity_tier,
    quality_stage: item.quality_stage,
    views_per_minute: item.views_per_min,
    followers_count: item.followers_count,
    heat_count: item.heat_count,
    reply_count: item.reply_count,
    retweet_count: item.retweet_count,
    like_count: item.like_count,
    quote_count: item.quote_count,
    bookmark_count: item.bookmark_count,
    impression_count: item.impression_count,
    review_task_id: item.review_task_id,
    saved_memory_id: item.saved_memory_id,
    generated_comment: item.generated_comment,
    task_status: taskStatus,
    copied: patch.copied,
    opened: patch.opened,
    saved: patch.saved,
    handled: patch.handled,
    published_url: patch.publishedUrl || item.comment_url,
    outcome: patch.outcome,
    feedback_comment: patch.feedbackComment,
    result_impression_count: patch.resultImpressionCount,
    result_like_count: patch.resultLikeCount,
    result_reply_count: patch.resultReplyCount,
    result_retweet_count: patch.resultRetweetCount,
    result_quote_count: patch.resultQuoteCount,
    result_bookmark_count: patch.resultBookmarkCount,
    result_notes: patch.resultNotes,
    safety_status: patch.safetyStatus || options.safetyReview.status,
    safety_summary: patch.safetySummary || options.safetyReview.summary,
    safety_checks: options.safetyReview.checks.map(safetyCheckToApi),
    reply_angle_id: patch.replyAngleID || options.replyAngle?.id,
    reply_angle_title: patch.replyAngleTitle || options.replyAngle?.title,
  };
}

function safetyCheckToApi(check: SafetyReviewCheck): ExposureRadarSafetyCheckApi {
  return {
    key: check.key,
    status: check.status,
    title: check.title,
    detail: check.detail,
  };
}

function strategyFormFromApi(strategy: ExposureRadarGrowthStrategyApi | null): StrategyFormState {
  return {
    targetAudience: strategy?.target_audience || "",
    primaryGoal: strategy?.primary_goal || "awareness",
    coreTopics: (strategy?.core_topics || []).join(", "),
    avoidTopics: (strategy?.avoid_topics || []).join(", "),
    competitors: (strategy?.competitors || []).map((value) => value.startsWith("@") ? value : `@${value}`).join(", "),
    replyStyle: strategy?.reply_style || "operator_observation",
    dailyMoveLimit: strategy?.daily_move_limit || 10,
    safetyMode: strategy?.safety_mode || "balanced",
    operatorNotes: strategy?.operator_notes || "",
  };
}

function buildStarterStrategyTemplates(t: (key: string) => string, region: ExposureRadarRegion): StarterStrategyTemplate[] {
  const baseDailyLimit = region === "en" ? 8 : 10;
  const build = (key: string, primaryGoal: string, replyStyle: string, dailyMoveLimit = baseDailyLimit): StarterStrategyTemplate => ({
    key,
    form: {
      targetAudience: t(`exposureRadar.strategy.templates.${key}.targetAudience`),
      primaryGoal,
      coreTopics: t(`exposureRadar.strategy.templates.${key}.coreTopics`),
      avoidTopics: t(`exposureRadar.strategy.templates.${key}.avoidTopics`),
      competitors: "",
      replyStyle,
      dailyMoveLimit,
      safetyMode: "conservative",
      operatorNotes: t(`exposureRadar.strategy.templates.${key}.operatorNotes`),
    },
  });
  return [
    build("web3Builder", "relationships", "operator_observation"),
    build("aiAgent", "awareness", "peer_experience"),
    build("saasFounder", "traffic", "light_question", Math.max(6, baseDailyLimit - 2)),
    build("creatorOperator", "community", "caution_note"),
  ];
}

function parseCommaList(value: string): string[] {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function parseOptionalCount(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function manualResultFormFromState(state?: ManualActionState) {
  return {
    impressions: formatOptionalCount(state?.resultImpressionCount),
    likes: formatOptionalCount(state?.resultLikeCount),
    replies: formatOptionalCount(state?.resultReplyCount),
    reposts: formatOptionalCount(state?.resultRetweetCount),
    quotes: formatOptionalCount(state?.resultQuoteCount),
    bookmarks: formatOptionalCount(state?.resultBookmarkCount),
    notes: state?.resultNotes || "",
  };
}

function manualResultFormKey(state?: ManualActionState) {
  return [
    state?.resultImpressionCount ?? "",
    state?.resultLikeCount ?? "",
    state?.resultReplyCount ?? "",
    state?.resultRetweetCount ?? "",
    state?.resultQuoteCount ?? "",
    state?.resultBookmarkCount ?? "",
    state?.resultNotes ?? "",
    state?.resultCheckedAt ?? "",
  ].join(":");
}

function formatOptionalCount(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function normalizeResultLookupStatus(value?: string) {
  switch (value) {
    case "fetched":
    case "token_missing":
    case "lookup_failed":
    case "not_found":
    case "id_only":
      return value;
    default:
      return "failed";
  }
}

function mergeOptionalNumber(primary?: number, fallback?: number) {
  return typeof primary === "number" ? primary : fallback;
}

function mergeManualRecordStates(current: Record<string, ManualActionState>, records: ExposureRadarManualRecordApi[]) {
  if (!records.length) return current;
  const next = { ...current };
  records.forEach((record) => {
    const existing = next[record.signal_id] || {};
    const taskStatus = normalizeManualTaskStatus(record.task_status) || existing.taskStatus;
    const outcome = normalizeManualOutcome(record.outcome) || existing.outcome;
    next[record.signal_id] = {
      ...existing,
      copied: existing.copied || Boolean(record.copied_at),
      opened: existing.opened || Boolean(record.opened_at),
      saved: existing.saved || Boolean(record.saved_at || record.saved_memory_id),
      handled: existing.handled || Boolean(record.handled_at || taskStatus === "done"),
      persisted: true,
      publishedUrl: record.published_url || existing.publishedUrl,
      outcome,
      feedbackComment: record.feedback_comment || existing.feedbackComment,
      feedbackAt: record.feedback_at || existing.feedbackAt,
      resultImpressionCount: mergeOptionalNumber(record.result_impression_count, existing.resultImpressionCount),
      resultLikeCount: mergeOptionalNumber(record.result_like_count, existing.resultLikeCount),
      resultReplyCount: mergeOptionalNumber(record.result_reply_count, existing.resultReplyCount),
      resultRetweetCount: mergeOptionalNumber(record.result_retweet_count, existing.resultRetweetCount),
      resultQuoteCount: mergeOptionalNumber(record.result_quote_count, existing.resultQuoteCount),
      resultBookmarkCount: mergeOptionalNumber(record.result_bookmark_count, existing.resultBookmarkCount),
      resultNotes: record.result_notes || existing.resultNotes,
      resultScore: mergeOptionalNumber(record.result_score, existing.resultScore),
      resultCheckedAt: record.result_checked_at || existing.resultCheckedAt,
      taskStatus,
      safetyStatus: normalizeSafetyReviewStatus(record.safety_status) || existing.safetyStatus,
      safetySummary: record.safety_summary || existing.safetySummary,
      replyAngleID: record.reply_angle_id || existing.replyAngleID,
      replyAngleTitle: record.reply_angle_title || existing.replyAngleTitle,
      updatedAt: record.updated_at || existing.updatedAt || new Date().toISOString(),
    };
  });
  return next;
}

function mergePeopleRadar(current: PeopleRadarEntry[], persisted: ExposureRadarPeopleItemApi[]): PeopleRadarEntry[] {
  if (!persisted.length) return current;
  const people = new Map<string, PeopleRadarEntry>();
  current.forEach((person) => people.set(person.key, person));
  persisted.forEach((person) => {
    const key = person.key || (person.handle || person.name).toLowerCase();
    if (!key) return;
    const latestItem = manualRecordToRadarItem(person.latest_record);
    const existing = people.get(key);
    if (!existing) {
      people.set(key, {
        key,
        name: person.name,
        handle: person.handle,
        count: person.count,
        handled: person.handled,
        drafted: person.latest_record.review_task_id || person.latest_record.generated_comment ? 1 : 0,
        saved: person.saved,
        maxScore: person.max_score || person.latest_record.score || 0,
        totalEngagement: person.total_engagement || publicEngagementCount(latestItem),
        followers: person.followers || person.latest_record.followers_count,
        stage: normalizePeopleRadarStage(person.stage),
        latestItem,
        persisted: true,
        feedback: person.feedback,
        crmStage: person.crm_stage,
        notes: person.notes,
        tags: person.tags,
        lastInteractionAt: person.last_interaction_at,
      });
      return;
    }
    existing.count = Math.max(existing.count, person.count);
    existing.handled = Math.max(existing.handled, person.handled);
    existing.saved = Math.max(existing.saved, person.saved);
    existing.maxScore = Math.max(existing.maxScore, person.max_score || 0);
    existing.totalEngagement = Math.max(existing.totalEngagement, person.total_engagement || 0);
    existing.followers = Math.max(existing.followers || 0, person.followers || 0) || existing.followers;
    existing.feedback = Math.max(existing.feedback || 0, person.feedback || 0);
    existing.crmStage = person.crm_stage || existing.crmStage;
    existing.notes = person.notes || existing.notes;
    existing.tags = person.tags?.length ? person.tags : existing.tags;
    existing.lastInteractionAt = person.last_interaction_at || existing.lastInteractionAt;
    existing.persisted = true;
    if (radarItemTimeValue(latestItem) > radarItemTimeValue(existing.latestItem)) {
      existing.latestItem = latestItem;
    }
    existing.stage = normalizePeopleRadarStage(existing.crmStage || person.stage || existing.stage || peopleRadarStage(existing));
  });
  return Array.from(people.values()).sort((a, b) => {
    const stageDelta = peopleRadarStageWeight(b.stage) - peopleRadarStageWeight(a.stage);
    if (stageDelta !== 0) return stageDelta;
    if (a.maxScore !== b.maxScore) return b.maxScore - a.maxScore;
    if (a.count !== b.count) return b.count - a.count;
    return b.totalEngagement - a.totalEngagement;
  });
}

function manualRecordToRadarItem(record: ExposureRadarManualRecordApi): ExposureRadarItemApi {
  return {
    id: record.signal_id,
    region: record.region === "zh" ? "zh" : "en",
    data_source: record.data_source || "manual_record",
    data_quality: record.data_quality || "tweet_level",
    title: record.title || record.content || record.signal_id,
    author_handle: record.author_handle,
    author_name: record.author_name,
    author_id: record.author_id,
    content: record.content || record.title || "",
    url: record.url,
    tweet_id: record.tweet_id,
    status: record.task_status || "manual_record",
    signal_label: "Manual record",
    topic_name: record.topic_name,
    views_per_min: record.views_per_minute,
    heat_count: record.heat_count,
    followers_count: record.followers_count,
    like_count: record.like_count,
    reply_count: record.reply_count,
    retweet_count: record.retweet_count,
    quote_count: record.quote_count,
    bookmark_count: record.bookmark_count,
    impression_count: record.impression_count,
    score: record.score || 0,
    risk_level: record.risk_level || "low",
    opportunity_type: record.opportunity_type || "manual_record",
    opportunity_tier: record.opportunity_tier,
    quality_stage: record.quality_stage,
    recommended_use: "",
    reason: "",
    review_task_id: record.review_task_id,
    generated_comment: record.generated_comment,
    comment_url: record.published_url,
    saved_memory_id: record.saved_memory_id,
    updated_at: record.updated_at,
  };
}

function selectedReplyAngleForItem(item: ExposureRadarItemApi, selectedReplyAngleIDs: Record<string, string>, t: (key: string, params?: Record<string, string | number>) => string) {
  const suggestions = buildReplyAngleSuggestions(item, t);
  return suggestions.find((angle) => angle.id === selectedReplyAngleIDs[item.id]) || suggestions[0];
}

function normalizeManualTaskStatus(value?: string): DailyTaskStatus | undefined {
  if (value === "todo" || value === "in_progress" || value === "done" || value === "skipped" || value === "later") return value;
  return undefined;
}

function normalizeManualOutcome(value?: string): ManualOutcome | undefined {
  if (value === "effective" || value === "neutral" || value === "ineffective" || value === "not_suitable") return value;
  return undefined;
}

function normalizeSafetyReviewStatus(value?: string): SafetyReviewStatus | undefined {
  if (value === "pass" || value === "watch" || value === "block") return value;
  return undefined;
}

function normalizePeopleRadarStage(value?: string): PeopleRadarStage {
  if (value === "priority" || value === "repeat" || value === "engaged" || value === "watch" || value === "avoid" || value === "new") return value;
  return "new";
}

function normalizeContentDraftStatus(value?: string) {
  if (value === "published") return "published";
  if (value === "rejected") return "rejected";
  if (value === "failed") return "failed";
  if (value === "approved" || value === "ready_to_publish") return "ready";
  if (value === "pending_review") return "review";
  return "draft";
}

function apiBudgetMode(diagnostics: ExposureRadarDiagnosticsApi | null) {
  if (!diagnostics) return "conservative";
  if ((diagnostics.search_results || 0) <= 25 && (diagnostics.refresh_interval_minutes || 0) >= 30) return "conservative";
  return "standard";
}

function apiBudgetWarnings(
  diagnostics: ExposureRadarDiagnosticsApi | null,
  summary: ExposureRadarResultRefreshApi | null,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  const warnings: string[] = [];
  if (!diagnostics?.bearer_token_configured) warnings.push(t("exposureRadar.apiBudget.warning.token"));
  if ((diagnostics?.search_results || 0) > 50) warnings.push(t("exposureRadar.apiBudget.warning.searchScope", { count: diagnostics?.search_results || 0 }));
  if ((diagnostics?.topic_limit || 0) > 24) warnings.push(t("exposureRadar.apiBudget.warning.topicScope", { count: diagnostics?.topic_limit || 0 }));
  if ((diagnostics?.refresh_interval_minutes || 0) > 0 && (diagnostics?.refresh_interval_minutes || 0) < 30) warnings.push(t("exposureRadar.apiBudget.warning.refreshFast", { minutes: diagnostics?.refresh_interval_minutes || 0 }));
  if ((summary?.failed_count || 0) > 0) warnings.push(t("exposureRadar.apiBudget.warning.lookupFailed", { count: summary?.failed_count || 0 }));
  return warnings.slice(0, 4);
}

function sessionStateTone(state: "complete" | "active" | "review" | "quiet") {
  switch (state) {
    case "complete":
      return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
    case "active":
      return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
    case "review":
      return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
    default:
      return "border-[#2f3336] bg-[#16181c] text-[#8b98a5]";
  }
}

function learningImpactTone(tone: LearningImpactRow["tone"]) {
  switch (tone) {
    case "positive":
      return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
    case "negative":
      return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
    default:
      return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  }
}

function signalDecisionTone(mode: SignalDecisionSummary["mode"]) {
  switch (mode) {
    case "act_now":
      return "border-[#00ba7c]/30 bg-[#00ba7c]/10 text-[#7ee0b5]";
    case "research":
      return "border-[#1d9bf0]/30 bg-[#1d9bf0]/10 text-[#8ecdf8]";
    case "skip":
      return "border-[#64748b]/35 bg-[#64748b]/10 text-[#94a3b8]";
    default:
      return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
  }
}

function shouldShowSignalRecovery(data: ExposureRadarData | null, loadState: LoadState, stats: WorkbenchStats) {
  if (loadState === "loading") return false;
  if (!data || data.items.length === 0) return true;
  const diagnostics = data.diagnostics;
  if (diagnostics?.status === "limited" || diagnostics?.status === "empty" || diagnostics?.status === "stale" || diagnostics?.status === "fallback" || diagnostics?.status === "blocked") return true;
  return stats.pending === 0 && (diagnostics?.hot_opportunity_count || 0) === 0 && (diagnostics?.rising_opportunity_count || 0) === 0;
}

function signalRecoveryReason(
  data: ExposureRadarData | null,
  loadState: LoadState,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  if (loadState === "loading") return t("exposureRadar.recovery.reason.loading");
  if (!data || data.items.length === 0) return data?.diagnostics?.top_missing_reason || t("exposureRadar.recovery.reason.empty");
  if (data.diagnostics?.top_missing_reason) return data.diagnostics.top_missing_reason;
  if (data.diagnostics?.status === "limited" || data.diagnostics?.status === "stale" || data.diagnostics?.status === "fallback") return t("exposureRadar.recovery.reason.limited");
  return t("exposureRadar.recovery.reason.quiet");
}

function signalRecoverySuggestions(
  diagnostics: ExposureRadarDiagnosticsApi | null,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  const suggestions: string[] = [];
  if (!diagnostics?.bearer_token_configured) suggestions.push(t("exposureRadar.recovery.suggestion.token"));
  if ((diagnostics?.visible_pool_count || 0) === 0) suggestions.push(t("exposureRadar.recovery.suggestion.query"));
  if ((diagnostics?.max_impression_count || 0) > 0 && (diagnostics?.hot_views_gap || 0) > 0) suggestions.push(t("exposureRadar.recovery.suggestion.threshold"));
  if ((diagnostics?.sampling_coverage || 0) < 0.35) suggestions.push(t("exposureRadar.recovery.suggestion.sampling"));
  if ((diagnostics?.tweet_level_count || 0) === 0 && (diagnostics?.topic_level_count || 0) > 0) suggestions.push(t("exposureRadar.recovery.suggestion.topicLevel"));
  if (!suggestions.length) suggestions.push(t("exposureRadar.recovery.suggestion.default"));
  return suggestions.slice(0, 4);
}

function normalizeOpportunityTier(value?: string) {
  if (value === "hot_opportunity") return "hot_opportunity";
  if (value === "rising_opportunity" || value === "rising_signal") return "rising_opportunity";
  if (value === "topic_lead") return "topic_lead";
  if (value === "needs_sampling" || value === "early_signal") return "needs_sampling";
  return "needs_sampling";
}

function normalizeQualityStage(value?: string, item?: ExposureRadarItemApi) {
  if (value === "act_now" || value === "watch" || value === "expired") return value;
  const tier = normalizeOpportunityTier(item?.opportunity_tier);
  const velocityState = normalizeVelocityState(item?.velocity_state, item?.status);
  if (item?.cooling || velocityState === "cooling") return "expired";
  if (item?.risk_level === "medium" || item?.risk_level === "high") return "watch";
  if (tier === "hot_opportunity" && (velocityState === "burst" || velocityState === "rising" || (item?.score || 0) >= 75)) return "act_now";
  if (tier === "rising_opportunity" && (velocityState === "burst" || (item?.views_per_min || 0) >= 8 || (item?.score || 0) >= 85)) return "act_now";
  return "watch";
}

function qualityStageClass(stage: string) {
  switch (normalizeQualityStage(stage)) {
    case "act_now":
      return "border-[#00ba7c]/30 bg-[#00ba7c]/10 text-[#7ee0b5]";
    case "expired":
      return "border-[#64748b]/35 bg-[#64748b]/10 text-[#94a3b8]";
    default:
      return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  }
}

function normalizeDataConfidence(value?: string, dataQuality?: string) {
  if (value === "real_impressions" || value === "engagement_estimate" || value === "topic_level" || value === "first_sample") return value;
  return dataQuality === "topic_level" ? "topic_level" : "first_sample";
}

function hasEngagementMetrics(item: ExposureRadarItemApi) {
  return [item.reply_count, item.retweet_count, item.like_count, item.quote_count, item.bookmark_count, item.impression_count].some((value) => typeof value === "number");
}

function exposureMetricSummary(item: ExposureRadarItemApi) {
  const values = [
    typeof item.reply_count === "number" ? `replies=${item.reply_count}` : "",
    typeof item.retweet_count === "number" ? `reposts=${item.retweet_count}` : "",
    typeof item.like_count === "number" ? `likes=${item.like_count}` : "",
    typeof item.quote_count === "number" ? `quotes=${item.quote_count}` : "",
    typeof item.bookmark_count === "number" ? `bookmarks=${item.bookmark_count}` : "",
    typeof item.impression_count === "number" ? `impressions=${item.impression_count}` : "",
  ].filter(Boolean);
  return values.length ? `Public metrics: ${values.join("; ")}` : "";
}

function isRadarItemSaved(item: ExposureRadarItemApi, savedMemoryIDs: Set<string>) {
  return Boolean(item.saved_memory_id) || savedMemoryIDs.has(item.id);
}

function radarItemSavedMemoryID(item: ExposureRadarItemApi, savedMemoryIDs: Set<string>) {
  if (item.saved_memory_id) return item.saved_memory_id;
  return savedMemoryIDs.has(item.id) ? -1 : 0;
}

function memoryLink(id: number, accountID: number) {
  const params = new URLSearchParams({ panel: "content" });
  if (id > 0) params.set("content_item_id", String(id));
  if (accountID > 0) params.set("account", String(accountID));
  return `/content-drafts?${params.toString()}`;
}

function radarCardAnchorID(id: string) {
  return `radar-signal-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function compactTitle(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 96) return normalized;
  return `${normalized.slice(0, 93).trim()}...`;
}

function uniqueList(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).slice(0, 12);
}

function clampPriority(score: number) {
  if (!Number.isFinite(score)) return 50;
  return Math.max(50, Math.min(100, Math.round(score)));
}

function buildLeaderboardStats(items: ExposureRadarItemApi[], rankChanges: Map<string, RankChange>): LeaderboardStats {
  const stats: LeaderboardStats = { new: 0, burst: 0, rising: 0, steady: 0, cooling: 0, unknown: 0, newCount: 0, movers: 0 };
  items.forEach((item) => {
    const state = normalizeVelocityState(item.velocity_state, item.status) as LeaderboardStatus;
    stats[state] = (stats[state] || 0) + 1;
  });
  rankChanges.forEach((change) => {
    if (change.kind === "new") stats.newCount += 1;
    if (change.kind === "up" || change.kind === "down") stats.movers += 1;
  });
  return stats;
}

function radarRankStorageKey(region: ExposureRadarRegion, hours: number, maxFans: number, minHotCount: number) {
  return `${radarRankStorageKeyPrefix}:${region}:${hours}:${maxFans}:${minHotCount}`;
}

function readStoredRadarRanks(key: string) {
  const out = new Map<string, number>();
  if (typeof window === "undefined") return out;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return out;
    const parsed = JSON.parse(raw) as Array<[string, number]>;
    parsed.forEach(([id, rank]) => {
      if (typeof id === "string" && Number.isFinite(rank) && rank > 0) out.set(id, rank);
    });
  } catch {
    return new Map<string, number>();
  }
  return out;
}

function writeStoredRadarRanks(key: string, ranks: Map<string, number>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(ranks.entries()).slice(0, 100)));
  } catch {
    // Local ranking memory is a UI hint only; ignore storage failures.
  }
}

function readManualActionStates(): Record<string, ManualActionState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(radarManualActionStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ManualActionState>;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed).filter(([id, state]) => typeof id === "string" && state && typeof state === "object"));
  } catch {
    return {};
  }
}

function writeManualActionStates(states: Record<string, ManualActionState>) {
  if (typeof window === "undefined") return;
  try {
    const entries = Object.entries(states)
      .sort(([, a], [, b]) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
      .slice(0, 200);
    window.localStorage.setItem(radarManualActionStorageKey, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Local cache keeps the UI responsive while backend records hydrate.
  }
}

function getPositiveParam(params: URLSearchParams, key: string, fallback: number) {
  const value = Number(params.get(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getNonNegativeParam(params: URLSearchParams, key: string, fallback: number) {
  const value = Number(params.get(key));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function formatFreshness(seconds: number, t: (key: string, params?: Record<string, string | number>) => string) {
  if (!Number.isFinite(seconds) || seconds < 0) return "-";
  if (seconds < 60) return t("exposureRadar.leaderboard.secondsAgo", { count: Math.round(seconds) });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t("exposureRadar.leaderboard.minutesAgo", { count: minutes });
  return t("exposureRadar.leaderboard.hoursAgo", { count: Math.round(minutes / 60) });
}

function formatArchiveDate(value: string, timeZone: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone }).format(date);
}

function formatCompact(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(value >= 10000000 ? 0 : 1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
  return String(value);
}

function formatOneDecimal(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function extractTweetID(raw: string) {
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/\/status(?:es)?\/(\d+)/);
  return match?.[1] || "";
}

function normalizeSourceType(value?: string) {
  if (value === "owned_collector" || value === "tl1_fallback" || value === "x_trends_cache") return value;
  return "unknown";
}

function normalizeSourceStatus(value?: string) {
  if (value === "fresh" || value === "stale" || value === "fallback" || value === "cache" || value === "empty") return value;
  return "unknown";
}

function normalizeDiagnosticStatus(value?: string) {
  if (value === "healthy" || value === "warming" || value === "limited" || value === "empty" || value === "fallback" || value === "stale" || value === "blocked") return value;
  return "limited";
}

function normalizeLearningMode(value?: string) {
  if (value === "hybrid" || value === "workspace" || value === "scoped") return value;
  return "hybrid";
}

function normalizeLearningScope(value?: string) {
  if (value === "selected_bot_account" || value === "workspace" || value === "disabled" || value === "no_memory") return value;
  return "no_memory";
}

function normalizeVelocityState(value?: string, fallback?: string) {
  const raw = (value || fallback || "").toLowerCase();
  if (raw === "new" || raw === "burst" || raw === "rising" || raw === "steady" || raw === "cooling") return raw;
  if (raw === "fire") return "burst";
  if (raw === "hot") return "rising";
  if (raw === "observed" || raw === "normal") return "steady";
  return "unknown";
}

function velocityStateClass(state: string) {
  if (state === "burst") return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
  if (state === "rising" || state === "new") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  if (state === "cooling") return "border-[#64748b]/30 bg-[#64748b]/10 text-[#94a3b8]";
  return "border-[#2f3336] bg-[#16181c] text-[#8b98a5]";
}

function opportunityTierClass(tier: string) {
  if (tier === "hot_opportunity") return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
  if (tier === "rising_opportunity") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  if (tier === "topic_lead") return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  return "border-[#f59e0b]/25 bg-[#f59e0b]/10 text-[#f6d96b]";
}

function dataConfidenceClass(confidence: string) {
  if (confidence === "real_impressions") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  if (confidence === "engagement_estimate") return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  if (confidence === "topic_level") return "border-[#8b5cf6]/25 bg-[#8b5cf6]/10 text-[#c4b5fd]";
  return "border-[#f59e0b]/25 bg-[#f59e0b]/10 text-[#f6d96b]";
}

function sourceStatusClass(status: string) {
  if (status === "fresh") return "text-[#7ee0b5]";
  if (status === "stale" || status === "fallback") return "text-[#f6d96b]";
  if (status === "empty") return "text-[#ff8a91]";
  return "text-[#8ecdf8]";
}

function diagnosticStatusClass(status: string) {
  if (status === "healthy") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  if (status === "warming") return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  if (status === "limited" || status === "stale" || status === "fallback") return "border-[#f59e0b]/25 bg-[#f59e0b]/10 text-[#f6d96b]";
  if (status === "blocked" || status === "empty") return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
  return "border-[#2f3336] bg-[#16181c] text-[#8b98a5]";
}

function diagnosticSeverityDot(severity?: string) {
  if (severity === "critical") return "bg-[#f4212e]";
  if (severity === "warning") return "bg-[#f59e0b]";
  return "bg-[#1d9bf0]";
}

function diagnosticIssueText(issue: ExposureRadarDiagnosticIssueApi, t: (key: string, params?: Record<string, string | number>) => string) {
  const known = new Set([
    "diagnostic_query_failed",
    "x_trends_disabled",
    "bearer_token_missing",
    "external_fallback",
    "topic_cache_only",
    "collector_stale",
    "no_owned_signals",
    "window_too_short",
    "fan_filter_strict",
    "no_true_hot",
    "first_sample_only",
    "filters_empty",
  ]);
  if (known.has(issue.code)) return t(`exposureRadar.diagnostics.issue.${issue.code}`);
  return issue.message || issue.code;
}

function diagnosticMissingReasonText(reason: string, t: (key: string, params?: Record<string, string | number>) => string) {
  const code = reason || "none";
  const known = new Set([
    "none",
    "x_config_blocked",
    "no_owned_signals",
    "window_too_short",
    "fan_filter_strict",
    "query_low_yield",
    "x_impressions_sparse",
    "insufficient_resampling",
    "views_below_threshold",
    "velocity_below_threshold",
    "no_true_hot",
  ]);
  if (known.has(code)) return t(`exposureRadar.diagnostics.gap.reason.${code}`);
  return code;
}

function diagnosticMissingReasonDetail(diagnostics: ExposureRadarDiagnosticsApi, t: (key: string, params?: Record<string, string | number>) => string) {
  return t("exposureRadar.diagnostics.gap.detail", {
    views: formatCompact(diagnostics.configured_hot_min_views || 0),
    speed: formatOneDecimal(diagnostics.configured_hot_min_velocity || 0),
    pool: diagnostics.visible_pool_count || diagnostics.tweet_level_count || 0,
  });
}

function diagnosticSuggestions(diagnostics: ExposureRadarDiagnosticsApi, t: (key: string, params?: Record<string, string | number>) => string) {
  const codes = new Set((diagnostics.issues || []).map((issue) => issue.code));
  const suggestions: string[] = [];
  const add = (key: string) => {
    const value = t(key);
    if (!suggestions.includes(value)) suggestions.push(value);
  };
  if (codes.has("x_trends_disabled") || codes.has("bearer_token_missing")) add("exposureRadar.diagnostics.suggestion.configureToken");
  if (codes.has("no_owned_signals") || codes.has("collector_stale") || codes.has("first_sample_only")) add("exposureRadar.diagnostics.suggestion.manualRefresh");
  if (codes.has("window_too_short")) add("exposureRadar.diagnostics.suggestion.widenWindow");
  if (codes.has("fan_filter_strict")) add("exposureRadar.diagnostics.suggestion.raiseFans");
  if (codes.has("topic_cache_only") || codes.has("external_fallback")) add("exposureRadar.diagnostics.suggestion.researchOnly");
  if (codes.has("no_true_hot") && diagnostics.top_missing_reason) add(`exposureRadar.diagnostics.suggestion.${diagnostics.top_missing_reason}`);
  if (codes.has("no_true_hot")) add("exposureRadar.diagnostics.suggestion.useRising");
  if (suggestions.length === 0) add("exposureRadar.diagnostics.suggestion.operate");
  return suggestions.slice(0, 5);
}
