"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import axios from "axios";
import Link from "next/link";
import { Activity, BarChart3, Bookmark, BookmarkPlus, Bot, CalendarClock, CheckCircle2, Clipboard, Clock3, Database, ExternalLink, Eye, Flame, Gauge, Heart, Info, MessageCircle, MessageSquarePlus, Quote, RefreshCw, Repeat2, Search, ShieldAlert, Sparkles, TrendingUp, Users, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { broadcastPageRefreshComplete, subscribePageRefreshRequest } from "@/lib/app-page-refresh";
import { formatDateTime, usePreferredTimeZone } from "@/lib/timezone";
import { accountService, type AccountListItem } from "@/services/account.service";
import { contentLibraryService, type ContentLibraryItemPayload } from "@/services/content-library.service";
import { exposureRadarService, type ExposureRadarArchiveData, type ExposureRadarData, type ExposureRadarDiagnosticIssueApi, type ExposureRadarDiagnosticsApi, type ExposureRadarItemApi, type ExposureRadarPerformanceData, type ExposureRadarRegion } from "@/services/exposure-radar.service";
import { oafBotService } from "@/services/oaf-bot.service";
import type { OAFBot } from "@/types/oaf-bot";

type LoadState = "loading" | "ready" | "error";
type MaybePromise<T> = T | Promise<T>;
type RankChange = { kind: "new" | "up" | "down"; delta?: number };
type RadarViewFilter = "priority" | "all" | "act_now" | "watch" | "expired" | "hot" | "rising" | "sampling" | "topic" | "tweet" | "high_score" | "needs_review" | "saved" | "drafted" | "pending_handling" | "handled" | "backfilled";
type ManualOutcome = "effective" | "neutral" | "ineffective" | "not_suitable";
type LeaderboardStatus = "new" | "burst" | "rising" | "steady" | "cooling" | "unknown";
type LeaderboardStats = Record<LeaderboardStatus, number> & { newCount: number; movers: number };
type DailyActionType = "publish_reply" | "generate_reply" | "save_memory" | "inspect" | "review_fit";
type DailyActionReason = "generated" | "quality" | "expired" | "velocity" | "low_fans" | "learned" | "risk" | "topic" | "score";
type DailyActionPlanItem = {
  item: ExposureRadarItemApi;
  action: DailyActionType;
  reason: DailyActionReason;
  priority: number;
};
type OpportunityExplanation = {
  fit: string;
  reasons: string[];
  angles: string[];
  avoid: string[];
};
type ReplyAngleID = "operatorObservation" | "lightQuestion" | "peerExperience" | "cautionNote" | "topicResearch";
type ReplyAngleSuggestion = {
  id: ReplyAngleID;
  title: string;
  description: string;
  prompt: string;
  tone: string;
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
  updatedAt?: string;
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
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [bots, setBots] = useState<OAFBot[]>([]);
  const [selectedAccountID, setSelectedAccountID] = useState(0);
  const [selectedBotID, setSelectedBotID] = useState(0);
  const [draftingID, setDraftingID] = useState<string | null>(null);
  const [handlingID, setHandlingID] = useState<string | null>(null);
  const [feedbackSavingID, setFeedbackSavingID] = useState<string | null>(null);
  const [savingMemoryID, setSavingMemoryID] = useState<string | null>(null);
  const [radarView, setRadarView] = useState<RadarViewFilter>("priority");
  const [savedMemoryIDs, setSavedMemoryIDs] = useState<Set<string>>(() => new Set());
  const [manualActionStates, setManualActionStates] = useState<Record<string, ManualActionState>>({});
  const [manualActionsHydrated, setManualActionsHydrated] = useState(false);
  const [activeWorkbenchID, setActiveWorkbenchID] = useState("");
  const [selectedReplyAngleIDs, setSelectedReplyAngleIDs] = useState<Record<string, string>>({});
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

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const [next, perf, dailyArchive] = await Promise.all([
        exposureRadarService.list({ region, botId: selectedBotID, xAccountId: selectedAccountID, hours, maxFans, minHotCount, limit: 60 }),
        exposureRadarService.performance({ region, botId: selectedBotID, xAccountId: selectedAccountID, days: 7 }),
        exposureRadarService.archive({ region, botId: selectedBotID, xAccountId: selectedAccountID, days: 7 }),
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
      setLastRefreshedAt(new Date().toISOString());
      setLoadState("ready");
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("exposureRadar.toast.loadFailed") : t("exposureRadar.toast.loadFailed"));
      setLoadState("error");
    }
  }, [hours, maxFans, minHotCount, pushToast, region, selectedAccountID, selectedBotID, t]);

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
  const handlingQueue = useMemo(() => buildDailyActionPlan(items, manualActionStates, savedMemoryIDs, 12), [items, manualActionStates, savedMemoryIDs]);
  const workbenchStats = useMemo(() => buildWorkbenchStats(items, manualActionStates), [items, manualActionStates]);

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
      pushToast(task.status === "pending_review" ? t("exposureRadar.toast.draftQueued") : t("exposureRadar.toast.draftCreated"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("exposureRadar.toast.draftFailed") : t("exposureRadar.toast.draftFailed"));
    } finally {
      setDraftingID(null);
    }
  }, [pushToast, selectedAccountID, selectedBotID, t]);

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
      updateManualActionState(item.id, { saved: true });
      pushToast(t("exposureRadar.toast.memorySaved"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("exposureRadar.toast.memoryFailed") : t("exposureRadar.toast.memoryFailed"));
    } finally {
      setSavingMemoryID(null);
    }
  }, [pushToast, selectedAccountID, selectedBotID, t, updateManualActionState]);

  const markRadarHandled = useCallback(async (item: ExposureRadarItemApi, publishedURL: string) => {
    const normalizedPublishedURL = publishedURL.trim();
    if (!item.review_task_id) {
      updateManualActionState(item.id, { handled: true, persisted: false, publishedUrl: normalizedPublishedURL });
      pushToast(t("exposureRadar.manualAction.localOnlyToast"));
      return;
    }
    setHandlingID(item.id);
    try {
      const task = await exposureRadarService.markDraftHandled(item.review_task_id, {
        published_url: normalizedPublishedURL || undefined,
      });
      const persistedURL = task.comment_url || normalizedPublishedURL;
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
      updateManualActionState(item.id, { handled: true, persisted: true, publishedUrl: persistedURL });
      void exposureRadarService.performance({ region, botId: selectedBotID, xAccountId: selectedAccountID, days: 7 })
        .then(setPerformance)
        .catch(() => undefined);
      pushToast(t("exposureRadar.manualAction.persistedToast"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("exposureRadar.manualAction.persistFailed") : t("exposureRadar.manualAction.persistFailed"));
    } finally {
      setHandlingID(null);
    }
  }, [pushToast, region, selectedAccountID, selectedBotID, t, updateManualActionState]);

  const submitManualOutcome = useCallback(async (item: ExposureRadarItemApi, outcome: ManualOutcome, comment: string) => {
    if (!item.review_task_id) {
      pushToast(t("exposureRadar.manualFeedback.missingTask"));
      return;
    }
    setFeedbackSavingID(item.id);
    try {
      await exposureRadarService.createDraftFeedback(item.review_task_id, buildManualOutcomePayload(outcome, comment, item));
      updateManualActionState(item.id, {
        outcome,
        feedbackComment: comment.trim(),
        feedbackAt: new Date().toISOString(),
      });
      pushToast(t("exposureRadar.manualFeedback.savedToast"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("exposureRadar.manualFeedback.saveFailed") : t("exposureRadar.manualFeedback.saveFailed"));
    } finally {
      setFeedbackSavingID(null);
    }
  }, [pushToast, t, updateManualActionState]);

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
        onManualAction={(itemID, patch) => updateManualActionState(itemID, patch)}
        onSelectReplyAngle={updateSelectedReplyAngle}
        onActiveChange={setActiveWorkbenchID}
        onFocusItem={focusRadarItem}
        savedMemoryIDs={savedMemoryIDs}
      />

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
                manualState={manualActionStates[item.id]}
                onManualAction={(patch) => updateManualActionState(item.id, patch)}
                feedbackSaving={feedbackSavingID === item.id}
                onSubmitFeedback={submitManualOutcome}
              />
            ))}
          </div>
        ) : null}
      </Card>

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

function HandlingWorkbenchPanel({
  queue,
  activeID,
  stats,
  draftingID,
  draftDisabled,
  handlingID,
  savingMemoryID,
  memoryDisabled,
  savedMemoryIDs,
  selectedReplyAngleIDs,
  onCreateDraft,
  onMarkHandled,
  onSaveMemory,
  onManualAction,
  onSelectReplyAngle,
  onActiveChange,
  onFocusItem,
}: {
  queue: DailyActionPlanItem[];
  activeID: string;
  stats: { pending: number; actNow: number; handled: number };
  draftingID: string | null;
  draftDisabled: boolean;
  handlingID: string | null;
  savingMemoryID: string | null;
  memoryDisabled: boolean;
  savedMemoryIDs: Set<string>;
  selectedReplyAngleIDs: Record<string, string>;
  onCreateDraft: (item: ExposureRadarItemApi, replyAngle?: ReplyAngleSuggestion) => void;
  onMarkHandled: (item: ExposureRadarItemApi, publishedURL: string) => MaybePromise<void>;
  onSaveMemory: (item: ExposureRadarItemApi, replyAngle?: ReplyAngleSuggestion) => void;
  onManualAction: (itemID: string, patch: Partial<ManualActionState>) => void;
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
      onManualAction(activeItem.id, { copied: true });
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
            {activeExplanation ? <OpportunityExplanationPanel explanation={activeExplanation} /> : null}
            {replyAngles.length ? (
              <ReplyAngleSuggestionsPanel
                suggestions={replyAngles}
                selectedID={selectedReplyAngle?.id || ""}
                onSelect={(angleID) => onSelectReplyAngle(activeItem.id, angleID)}
              />
            ) : null}
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
                <a href={activeItem.url} target="_blank" rel="noreferrer" onClick={() => onManualAction(activeItem.id, { opened: true })} className="inline-flex h-8 items-center gap-1 rounded-full bg-[#1d9bf0] px-3 text-xs font-semibold text-white hover:bg-[#1a8cd8]">
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

function ActionPlanMetric({ label, value }: { label: string; value: number }) {
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
  manualState,
  onManualAction,
  feedbackSaving,
  onSubmitFeedback,
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
  manualState?: ManualActionState;
  onManualAction: (patch: Partial<ManualActionState>) => void;
  feedbackSaving: boolean;
  onSubmitFeedback: (item: ExposureRadarItemApi, outcome: ManualOutcome, comment: string) => void;
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
  const rankTone = rank <= 3 ? "border-[#f59e0b]/35 bg-[#f59e0b]/15 text-[#f6d96b]" : "border-[#2f3336] bg-[#16181c] text-[#8b98a5]";
  const highlightClass = rankChange?.kind === "up" || rankChange?.kind === "new"
    ? "shadow-[0_0_0_1px_rgba(0,186,124,0.24),0_18px_46px_rgba(0,186,124,0.08)]"
    : rankChange?.kind === "down"
      ? "shadow-[0_0_0_1px_rgba(244,33,46,0.20)]"
      : "";
  const copyComment = async () => {
    if (!generatedComment) return;
    try {
      await navigator.clipboard.writeText(generatedComment);
      onManualAction({ copied: true });
      pushToast(t("exposureRadar.manualAction.copied"));
    } catch {
      pushToast(t("exposureRadar.manualAction.copyFailed"));
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
            publishedURL={publishedURL}
            commentURL={item.comment_url || manualState?.publishedUrl || ""}
            persisted={Boolean(manualState?.persisted || item.review_status === "handled" || item.comment_tweet_id || item.comment_url)}
            onPublishedURLChange={setPublishedURL}
            onMarkHandled={() => onMarkHandled(item, publishedURL)}
          />
          <ManualHandlingRecord
            item={item}
            manualState={manualState}
            timeZone={timeZone}
            feedbackSaving={feedbackSaving}
            onSubmitFeedback={(outcome, comment) => onSubmitFeedback(item, outcome, comment)}
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
                <a href={item.url} target="_blank" rel="noreferrer" onClick={() => onManualAction({ opened: true })} className="inline-flex h-8 items-center gap-1 rounded-full bg-[#1d9bf0] px-3 font-semibold text-white hover:bg-[#1a8cd8]">
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
          {!generatedComment && item.url ? (
            <a href={item.url} target="_blank" rel="noreferrer" onClick={() => onManualAction({ opened: true })} className="inline-flex h-8 items-center gap-1 rounded-full bg-[#1d9bf0] px-3 font-semibold text-white hover:bg-[#1a8cd8]">
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
  publishedURL,
  commentURL,
  persisted,
  onPublishedURLChange,
  onMarkHandled,
}: {
  copied: boolean;
  opened: boolean;
  saved: boolean;
  handled: boolean;
  handling: boolean;
  publishedURL: string;
  commentURL: string;
  persisted: boolean;
  onPublishedURLChange: (value: string) => void;
  onMarkHandled: () => void;
}) {
  const { t } = useT();
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
      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
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
        {commentURL ? (
          <a href={commentURL} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center gap-1 rounded-full border border-[#2f3336] px-3 text-xs font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
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
}: {
  item: ExposureRadarItemApi;
  manualState?: ManualActionState;
  timeZone: string;
  feedbackSaving: boolean;
  onSubmitFeedback: (outcome: ManualOutcome, comment: string) => void;
}) {
  const { t } = useT();
  const replyURL = item.comment_url || manualState?.publishedUrl || "";
  const replyID = item.comment_tweet_id || extractTweetID(replyURL);
  const statusKey = manualRecordStatus(item, manualState);
  const updatedAt = manualState?.updatedAt ? formatDateTime(manualState.updatedAt, timeZone) : "-";
  const [feedbackComment, setFeedbackComment] = useState(manualState?.feedbackComment || "");
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

function buildDailyActionPlan(items: ExposureRadarItemApi[], manualActionStates: Record<string, ManualActionState>, savedMemoryIDs: Set<string>, limit = 6): DailyActionPlanItem[] {
  return items
    .filter((item) => !isManualActionHandled(item, manualActionStates[item.id]))
    .map((item) => ({
      item,
      action: dailyActionType(item, manualActionStates[item.id], savedMemoryIDs),
      reason: dailyActionReason(item, manualActionStates[item.id]),
      priority: dailyActionPriority(item, manualActionStates[item.id], savedMemoryIDs),
    }))
    .filter((entry) => entry.priority > 0)
    .sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      if (a.item.score !== b.item.score) return b.item.score - a.item.score;
      return a.item.id.localeCompare(b.item.id);
    })
    .slice(0, limit);
}

function buildWorkbenchStats(items: ExposureRadarItemApi[], manualActionStates: Record<string, ManualActionState>) {
  return items.reduce((acc, item) => {
    const handled = isManualActionHandled(item, manualActionStates[item.id]);
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

function dailyActionPriority(item: ExposureRadarItemApi, state: ManualActionState | undefined, savedMemoryIDs: Set<string>) {
  const velocityState = normalizeVelocityState(item.velocity_state, item.status);
  const tier = normalizeOpportunityTier(item.opportunity_tier);
  const qualityStage = normalizeQualityStage(item.quality_stage, item);
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

function dailyActionReason(item: ExposureRadarItemApi, state?: ManualActionState): DailyActionReason {
  const velocityState = normalizeVelocityState(item.velocity_state, item.status);
  const qualityStage = normalizeQualityStage(item.quality_stage, item);
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
  return Boolean(state?.handled) || item.status === "handled" || item.review_status === "handled";
}

function hasManualBackfill(item: ExposureRadarItemApi, state?: ManualActionState) {
  return Boolean(item.comment_url || item.comment_tweet_id || state?.publishedUrl);
}

function manualRecordStatus(item: ExposureRadarItemApi, state?: ManualActionState) {
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
    // Manual handling progress is a local UI aid only.
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
