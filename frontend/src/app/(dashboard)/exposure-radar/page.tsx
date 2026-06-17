"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import axios from "axios";
import Link from "next/link";
import { Activity, ArrowRight, BarChart3, BookmarkPlus, Bot, BrainCircuit, CalendarClock, CheckCircle2, Clipboard, Clock3, Database, ExternalLink, Eye, FileText, Flame, Gauge, Heart, Info, MessageCircle, MessageSquarePlus, RefreshCw, Search, ShieldAlert, ShieldCheck, SlidersHorizontal, Sparkles, Target, TrendingUp, Users, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { broadcastPageRefreshComplete, subscribePageRefreshRequest } from "@/lib/app-page-refresh";
import { formatDateTime, usePreferredTimeZone } from "@/lib/timezone";
import { accountService, type AccountListItem } from "@/services/account.service";
import { contentDraftService, type ContentDraftPlanApi } from "@/services/content-draft.service";
import { contentLibraryService, type ContentLibraryItemPayload } from "@/services/content-library.service";
import { exposureRadarService, type ExposureRadarArchiveData, type ExposureRadarData, type ExposureRadarDiagnosticsApi, type ExposureRadarGrowthStrategyApi, type ExposureRadarItemApi, type ExposureRadarManualRecordApi, type ExposureRadarPeopleItemApi, type ExposureRadarPerformanceData, type ExposureRadarRegion, type ExposureRadarResultRefreshApi, type ExposureRadarSafetyCenterData, type ExposureRadarWeeklyReviewData } from "@/services/exposure-radar.service";
import { oafBotService } from "@/services/oaf-bot.service";
import { appendOperatorNote, dailyDeskFocusAnchor, dailyDeskFocusKey, dailyDeskRhythmAnchor, firstDayActivationActions, firstDayActivationMode, sessionFocusOptions } from "@/components/exposure-radar/activation-session-utils";
import { exposureRadarWorkspaceTabs, fanOptions, hotCountOptions, hourOptions, radarViewFilters, replyAngleGenerationGuides } from "@/components/exposure-radar/constants";
import { DailyOperatingGoalsCard, FirstDayLaunchCard, PreflightSafetyCard, RadarEmptyStateCard, SessionFocusCard } from "@/components/exposure-radar/activation-session-panels";
import { DailyGrowthDesk } from "@/components/exposure-radar/daily-growth-desk";
import { actionPlanIcon, actionPlanTone, buildDailyActionPlan, exposureLearningTopicKey, isDeferredManualTask, radarItemMatchesFilter } from "@/components/exposure-radar/daily-action-plan-utils";
import { BoostedSignalsCard, LearningControlsCard, LearningFeedbackCard, LearningImpactCard } from "@/components/exposure-radar/learning-insights-cards";
import { buildExposureLearningAngles, buildExposureLearningProfile, buildExposureLearningTopics, buildLearningImpactRows } from "@/components/exposure-radar/learning-profile-utils";
import { DiagnosticMetric, LeaderboardStatusStrip, RadarViewTabs } from "@/components/exposure-radar/list-support";
import { isExposureRadarWorkspaceTab, radarOperatorNoteKey, radarRankStorageKey, readManualActionStates, readOperatorNotes, readPublishGateStates, readSessionFocuses, readStoredRadarRanks, writeManualActionStates, writeOperatorNotes, writePublishGateStates, writeSessionFocuses, writeStoredRadarRanks } from "@/components/exposure-radar/local-state";
import { bestExposureResultRecord, buildDailyReviewActions, buildDailyReviewReportText, buildDailyReviewTopics, buildGrowthDeskBrief, buildGrowthDeskBriefPreview, isRecentManualRecord } from "@/components/exposure-radar/growth-desk-utils";
import { buildManualOutcomePayload, buildManualRecordPayload, buildManualResultPatch, buildResolvedManualResultPatch, buildSampleResolvedResultPatch, mergeManualRecordStates, mergePeopleRadar, normalizeResultLookupStatus, type ManualResultInput } from "@/components/exposure-radar/manual-record-utils";
import { ManualHandlingPanel } from "@/components/exposure-radar/manual-handling-panel";
import { AccountHealthScoreCard, GrowthExperimentCard, MemoryAssetDeskCard, OpportunityEvidenceDeskCard, PeopleRelationshipDeskCard, WeeklyOperatorReviewCard, peopleRadarStageTone } from "@/components/exposure-radar/operating-desk-panels";
import { OpportunitySignalList } from "@/components/exposure-radar/opportunity-signal-list";
import { OpportunityDecisionBrief, OpportunityExplanationPanel, ReplyPlanCard } from "@/components/exposure-radar/opportunity-explanation-cards";
import { PerformanceMetric, PerformancePanel } from "@/components/exposure-radar/performance-panel";
import { buildPeopleRadar, buildPeopleRadarNextTouch, buildPeopleRadarPlaybook, peopleRadarPlaybookTone, publicEngagementCount } from "@/components/exposure-radar/people-radar-utils";
import { diagnosticSuggestions } from "@/components/exposure-radar/radar-diagnostic-utils";
import { ManualHandlingRecord, ManualWorkflowPanel, manualResultFormKey } from "@/components/exposure-radar/radar-card-manual-workflow";
import { RadarCardActionFooter, RadarCardBadges, RadarCardGeneratedCommentBlock, RadarCardHeader, RadarCardPrimaryMetrics, RadarCardPublicMetrics, RadarCardRecommendedUse, RadarCardVelocityTrend } from "@/components/exposure-radar/radar-card-sections";
import { RadarFilters } from "@/components/exposure-radar/radar-filters";
import { clampPriority, compactTitle, extractTweetID, isManualActionHandled, isRadarItemSaved, isSampleRadarItem, radarCardAnchorID, radarItemSavedMemoryID, uniqueList } from "@/components/exposure-radar/radar-signal-utils";
import { buildDraftReason, buildDraftRecommendedUse, buildMemoryOpportunityExplanation, buildOpportunityExplanation, buildReplyAngleIDs, buildReplyAngleSuggestions, buildReplyPlan, buildSafetyReview, buildSampleReplyDraft, formatMemoryOpportunityExplanation, hasPromotionalSmell, hasRiskyGrowthClaim, selectedReplyAngleForItem } from "@/components/exposure-radar/opportunity-reply-utils";
import { diagnosticStatusClass, formatArchiveDate, formatCompact, formatFreshness, formatOneDecimal, formatPercent, formatVelocityLabel, normalizeContentDraftStatus, normalizeDataConfidence, normalizeDiagnosticStatus, normalizeOpportunityTier, normalizeQualityStage, normalizeSourceStatus, normalizeSourceType, normalizeVelocityState, qualityStageClass } from "@/components/exposure-radar/radar-utils";
import { MemoryDrivenReplyPanel, ReplyAngleSuggestionsPanel } from "@/components/exposure-radar/reply-guidance-panels";
import { ReplyQualityPanel, SafetyReviewPanel } from "@/components/exposure-radar/reply-safety-panels";
import { SignalCredibilityPanel, SignalDecisionCard } from "@/components/exposure-radar/signal-analysis-cards";
import { CollectionDiagnosticsPanel, SourceHealthPanel } from "@/components/exposure-radar/source-diagnostics";
import { TodayMovesPanel } from "@/components/exposure-radar/today-moves-panel";
import { ArchiveDayRow, ArchivePanelHeader, ArchiveTotalsMetrics } from "@/components/exposure-radar/topic-history-sections";
import type { AccountHealthScore, ContentDraftBridgeData, DailyActionPlanItem, ExposureLearningProfile, ExposureRadarWorkspaceTab, FirstDayStepKey, GrowthExperiment, LeaderboardStats, LeaderboardStatus, LoadState, ManualActionState, ManualOutcome, MaybePromise, MemoryReplyCue, OperatorSessionNote, PeopleRadarEntry, PublishGateKey, PublishGateState, RadarViewFilter, RankChange, ReplyAngleSuggestion, ReplyQualityScore, ResultLearningMove, ResultLearningSummary, SafetyReviewStatus, SessionFocusKey, SignalCredibility, SignalCredibilityStatus, SignalDecisionSummary, SignalQualityStatus, StarterStrategyTemplate, StrategyFormState, WorkbenchStats } from "@/components/exposure-radar/types";
import type { OAFBot } from "@/types/oaf-bot";

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
  const [sampleMode, setSampleMode] = useState(false);
  const [sampleItemOverrides, setSampleItemOverrides] = useState<Record<string, Partial<ExposureRadarItemApi>>>({});
  const [firstLoopCompletedAt, setFirstLoopCompletedAt] = useState("");
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
  const [workspaceTab, setWorkspaceTab] = useState<ExposureRadarWorkspaceTab>("today");
  const [savedMemoryIDs, setSavedMemoryIDs] = useState<Set<string>>(() => new Set());
  const [manualActionStates, setManualActionStates] = useState<Record<string, ManualActionState>>({});
  const [manualActionsHydrated, setManualActionsHydrated] = useState(false);
  const [operatorNotes, setOperatorNotes] = useState<Record<string, OperatorSessionNote>>({});
  const [operatorNotesHydrated, setOperatorNotesHydrated] = useState(false);
  const [sessionFocuses, setSessionFocuses] = useState<Record<string, SessionFocusKey>>({});
  const [sessionFocusesHydrated, setSessionFocusesHydrated] = useState(false);
  const [publishGateStates, setPublishGateStates] = useState<Record<string, PublishGateState>>({});
  const [publishGatesHydrated, setPublishGatesHydrated] = useState(false);
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
    setSelectedAccountID((current) => getPositiveParam(params, "x_account_id", getPositiveParam(params, "account_id", current)));
    setSelectedBotID((current) => getPositiveParam(params, "bot_id", current));
    const nextTab = params.get("tab");
    if (isExposureRadarWorkspaceTab(nextTab)) setWorkspaceTab(nextTab);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("region", region);
    params.set("hours", String(hours));
    params.set("max_fans", String(maxFans));
    params.set("min_hot_count", String(minHotCount));
    params.set("tab", workspaceTab);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, [hours, maxFans, minHotCount, region, workspaceTab]);

  useEffect(() => {
    setManualActionStates(readManualActionStates());
    setManualActionsHydrated(true);
  }, []);

  useEffect(() => {
    if (!manualActionsHydrated) return;
    writeManualActionStates(manualActionStates);
  }, [manualActionStates, manualActionsHydrated]);

  useEffect(() => {
    setOperatorNotes(readOperatorNotes());
    setOperatorNotesHydrated(true);
  }, []);

  useEffect(() => {
    if (!operatorNotesHydrated) return;
    writeOperatorNotes(operatorNotes);
  }, [operatorNotes, operatorNotesHydrated]);

  const operatorNoteKey = useMemo(() => radarOperatorNoteKey(region, selectedAccountID, selectedBotID), [region, selectedAccountID, selectedBotID]);
  const operatorNote = operatorNotes[operatorNoteKey]?.text || "";
  const sessionFocus = sessionFocuses[operatorNoteKey] || "relationships";
  const updateOperatorNote = useCallback((text: string) => {
    setOperatorNotes((current) => ({
      ...current,
      [operatorNoteKey]: {
        text,
        updatedAt: new Date().toISOString(),
      },
    }));
  }, [operatorNoteKey]);
  const updateSessionFocus = useCallback((focus: SessionFocusKey) => {
    setSessionFocuses((current) => ({
      ...current,
      [operatorNoteKey]: focus,
    }));
  }, [operatorNoteKey]);
  const updatePublishGate = useCallback((itemID: string, key: PublishGateKey, checked: boolean) => {
    setPublishGateStates((current) => ({
      ...current,
      [itemID]: {
        ...(current[itemID] || {}),
        [key]: checked,
        updatedAt: new Date().toISOString(),
      },
    }));
  }, []);

  useEffect(() => {
    setSessionFocuses(readSessionFocuses());
    setSessionFocusesHydrated(true);
  }, []);

  useEffect(() => {
    if (!sessionFocusesHydrated) return;
    writeSessionFocuses(sessionFocuses);
  }, [sessionFocuses, sessionFocusesHydrated]);

  useEffect(() => {
    setPublishGateStates(readPublishGateStates());
    setPublishGatesHydrated(true);
  }, []);

  useEffect(() => {
    if (!publishGatesHydrated) return;
    writePublishGateStates(publishGateStates);
  }, [publishGateStates, publishGatesHydrated]);

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
    if (isSampleRadarItem(item)) {
      return;
    }
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
      if (next.items.length > 0) {
        setSampleMode(false);
        setSampleItemOverrides({});
      }
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

  const realItems = useMemo(() => data?.items || [], [data?.items]);
  const sampleItems = useMemo(() => {
    if (!sampleMode || realItems.length > 0) return [];
    return buildSampleExposureItems(region, t).map((item) => ({ ...item, ...(sampleItemOverrides[item.id] || {}) }));
  }, [realItems.length, region, sampleItemOverrides, sampleMode, t]);
  const usingSampleMode = sampleMode && realItems.length === 0;
  const items = useMemo(() => (realItems.length > 0 ? realItems : sampleItems), [realItems, sampleItems]);
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
  const firstLoopItem = useMemo(() => handlingQueue[0]?.item || items.find((item) => !isManualActionHandled(item, manualActionStates[item.id])) || items[0], [handlingQueue, items, manualActionStates]);
  const firstLoopDone = Boolean(firstLoopCompletedAt) || recentManualRecords.some((record) => Boolean(record.result_checked_at || record.result_score || record.handled_at || record.task_status === "done"));
  const workbenchStats = useMemo(() => buildWorkbenchStats(items, manualActionStates), [items, manualActionStates]);
  const peopleRadar = useMemo(() => mergePeopleRadar(buildPeopleRadar(items, manualActionStates, savedMemoryIDs), persistedPeople), [items, manualActionStates, persistedPeople, savedMemoryIDs]);
  const workspaceTabCounts = useMemo<Record<ExposureRadarWorkspaceTab, number>>(() => ({
    today: handlingQueue.length,
    signals: items.length,
    people: peopleRadar.length,
    strategy: recentManualRecords.length,
    diagnostics: (data?.diagnostics?.issues?.length || 0) + (safetyCenter?.watch_count || 0) + (safetyCenter?.block_count || 0),
  }), [data?.diagnostics?.issues?.length, handlingQueue.length, items.length, peopleRadar.length, recentManualRecords.length, safetyCenter?.block_count, safetyCenter?.watch_count]);
  const leaderboardFreshest = data?.last_collected_at || data?.updated_at || lastRefreshedAt;
  const leaderboardFreshnessLabel = data?.freshness_seconds ? formatFreshness(data.freshness_seconds, t) : leaderboardFreshest ? formatDateTime(leaderboardFreshest, timeZone) : "-";

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
    if (isSampleRadarItem(item)) {
      setDraftingID(item.id);
      try {
        const generatedComment = buildSampleReplyDraft(item, replyAngle, t);
        const nextItem = {
          ...item,
          review_status: "draft",
          generated_comment: generatedComment,
        };
        setSampleItemOverrides((current) => ({
          ...current,
          [item.id]: {
            ...(current[item.id] || {}),
            review_status: "draft",
            generated_comment: generatedComment,
          },
        }));
        recordManualAction(nextItem, { taskStatus: "in_progress" }, replyAngle);
        pushToast(t("exposureRadar.sample.toast.draftCreated"));
      } finally {
        setDraftingID(null);
      }
      return;
    }
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
    if (isSampleRadarItem(item)) {
      setSavedMemoryIDs((current) => new Set(current).add(item.id));
      setSampleItemOverrides((current) => ({
        ...current,
        [item.id]: {
          ...(current[item.id] || {}),
          saved_memory_id: -1,
        },
      }));
      recordManualAction({ ...item, saved_memory_id: -1 }, { saved: true, taskStatus: "in_progress" }, replyAngle);
      pushToast(t("exposureRadar.sample.toast.memorySaved"));
      return;
    }
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
    if (isSampleRadarItem(item)) {
      recordManualAction(item, { saved: true, taskStatus: "in_progress" });
      pushToast(t("exposureRadar.sample.toast.seedSaved"));
      return;
    }
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
    if (isSampleRadarItem(item)) {
      recordManualAction(item, { saved: true, taskStatus: "in_progress" });
      pushToast(t("exposureRadar.sample.toast.seedDraftGenerated"));
      return;
    }
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
    if (isSampleRadarItem(item)) {
      const sampleURL = normalizedPublishedURL || item.url || "";
      recordManualAction({ ...item, comment_url: sampleURL, review_status: "handled" }, { handled: true, persisted: false, publishedUrl: sampleURL, taskStatus: "done" });
      setFirstLoopCompletedAt((current) => current || new Date().toISOString());
      pushToast(t("exposureRadar.sample.toast.handled"));
      return;
    }
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
      setFirstLoopCompletedAt((current) => current || new Date().toISOString());
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
    if (isSampleRadarItem(item)) {
      recordManualAction(item, {
        outcome,
        feedbackComment: comment.trim(),
        feedbackAt: new Date().toISOString(),
        taskStatus: isManualActionHandled(item, manualActionStates[item.id]) ? "done" : "in_progress",
      });
      pushToast(t("exposureRadar.sample.toast.feedbackSaved"));
      return;
    }
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

  const submitManualResult = useCallback(async (item: ExposureRadarItemApi, result: ManualResultInput) => {
    const patch = buildManualResultPatch(result, isManualActionHandled(item, manualActionStates[item.id]));
    recordManualAction(item, patch);
    setFirstLoopCompletedAt((current) => current || new Date().toISOString());
    pushToast(t("exposureRadar.resultTracking.savedToast"));
    if (isSampleRadarItem(item)) {
      return;
    }
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
    setWorkspaceTab("signals");
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

      <ExposureRadarWorkspaceNav value={workspaceTab} counts={workspaceTabCounts} onChange={setWorkspaceTab} />

      {workspaceTab === "today" ? (
        <DailyGrowthDesk
          overview={(
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
          )}
          activation={(
            <TenMinuteActivationPanel
              selectedAccountID={selectedAccountID}
              selectedBotID={selectedBotID}
              strategy={growthStrategy}
              moves={todayMoves}
              recentRecords={recentManualRecords}
              itemsCount={items.length}
              onRefresh={() => void load()}
              onStartSample={() => setSampleMode(true)}
            />
          )}
          progress={(
            <DailySessionProgressPanel
              strategy={growthStrategy}
              moves={todayMoves}
              stats={workbenchStats}
              recentRecords={recentManualRecords}
              timeZone={timeZone}
            />
          )}
          handoff={(
            <TeamHandoffPanel
              moves={todayMoves}
              people={peopleRadar}
              recentRecords={recentManualRecords}
              safety={safetyCenter}
              timeZone={timeZone}
            />
          )}
          command={(
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
          )}
          firstDay={(
            <FirstDayLaunchPanel
              selectedAccountID={selectedAccountID}
              selectedBotID={selectedBotID}
              accounts={accounts}
              bots={bots}
              strategy={growthStrategy}
              moves={todayMoves}
              recentRecords={recentManualRecords}
              contentDraftBridge={contentDraftBridge}
              itemsCount={items.length}
              usingSampleMode={usingSampleMode}
              loadState={loadState}
              onRefresh={() => void load()}
              onStartSample={() => setSampleMode(true)}
              onExitSample={() => {
                setSampleMode(false);
                setSampleItemOverrides({});
              }}
            />
          )}
          preflight={(
            <PreflightSafetyPanel
              selectedAccountID={selectedAccountID}
              selectedBotID={selectedBotID}
              strategy={growthStrategy}
              data={data}
              items={items}
              stats={workbenchStats}
              recentRecords={recentManualRecords}
              usingSampleMode={usingSampleMode}
            />
          )}
          sessionFocus={<SessionFocusPanel focus={sessionFocus} onChange={updateSessionFocus} strategy={growthStrategy} firstItem={firstLoopItem} usingSampleMode={usingSampleMode} />}
          goals={(
            <DailyOperatingGoalsPanel
              strategy={growthStrategy}
              stats={workbenchStats}
              items={items}
              manualActionStates={manualActionStates}
              savedMemoryIDs={savedMemoryIDs}
              recentRecords={recentManualRecords}
              usingSampleMode={usingSampleMode}
              onStartSample={() => setSampleMode(true)}
            />
          )}
          sampleBanner={usingSampleMode ? (
            <SampleModeBanner
              onExit={() => {
                setSampleMode(false);
                setSampleItemOverrides({});
              }}
            />
          ) : null}
          firstLoop={(
            <FirstLoopPanel
              item={firstLoopItem}
              manualState={firstLoopItem ? manualActionStates[firstLoopItem.id] : undefined}
              savedMemoryID={firstLoopItem ? radarItemSavedMemoryID(firstLoopItem, savedMemoryIDs) : 0}
              drafting={firstLoopItem ? draftingID === firstLoopItem.id : false}
              draftDisabled={!selectedAccountID || !selectedBotID}
              handling={firstLoopItem ? handlingID === firstLoopItem.id : false}
              usingSampleMode={usingSampleMode}
              firstLoopDone={firstLoopDone}
              publishGateState={firstLoopItem ? publishGateStates[firstLoopItem.id] : undefined}
              onStartSample={() => setSampleMode(true)}
              onCreateDraft={createDraft}
              onMarkHandled={markRadarHandled}
              onManualAction={(item, patch, replyAngle) => recordManualAction(item, patch, replyAngle)}
              onTogglePublishGate={updatePublishGate}
              onFocusWorkbench={(itemID) => {
                if (itemID) setActiveWorkbenchID(itemID);
                if (itemID) focusRadarItem(itemID);
              }}
            />
          )}
          completion={firstLoopDone ? <FirstLoopCompletionPanel completedAt={firstLoopCompletedAt} recentRecords={recentManualRecords} timeZone={timeZone} /> : null}
          scratchpad={<OperatorScratchpadPanel note={operatorNote} onChange={updateOperatorNote} item={firstLoopItem} manualState={firstLoopItem ? manualActionStates[firstLoopItem.id] : undefined} />}
          recap={(
            <DailyRecapPanel
              items={items}
              stats={workbenchStats}
              manualActionStates={manualActionStates}
              recentRecords={recentManualRecords}
              operatorNote={operatorNote}
              usingSampleMode={usingSampleMode}
              timeZone={timeZone}
            />
          )}
          carryover={(
            <NextSessionCarryoverPanel
              items={items}
              manualActionStates={manualActionStates}
              sessionFocus={sessionFocus}
              operatorNote={operatorNote}
              onFocus={(itemID) => {
                setActiveWorkbenchID(itemID);
                focusRadarItem(itemID);
              }}
            />
          )}
        />
      ) : null}

      {workspaceTab === "strategy" ? (
        <div className="space-y-5">
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

          <ResultLearningLoopPanel
            data={data}
            moves={todayMoves}
            recentRecords={recentManualRecords}
            weeklyReview={weeklyReview}
            safety={safetyCenter}
            learningProfile={exposureLearningProfile}
          />
        </div>
      ) : null}

      {workspaceTab === "signals" ? (
        <OpportunityEvidenceDeskPanel items={items} moves={todayMoves} data={data} loadState={loadState} />
      ) : null}

      {workspaceTab === "strategy" ? (
        <GrowthExperimentPanel
          items={items}
          moves={todayMoves}
          recentRecords={recentManualRecords}
          learningProfile={exposureLearningProfile}
          safety={safetyCenter}
        />
      ) : null}

      {workspaceTab === "strategy" ? (
        <WeeklyOperatorReviewPanel
          weeklyReview={weeklyReview}
          recentRecords={recentManualRecords}
          moves={todayMoves}
          learningProfile={exposureLearningProfile}
          safety={safetyCenter}
          timeZone={timeZone}
        />
      ) : null}

      {workspaceTab === "strategy" ? (
        <ContentDraftOperatingPanel
          bridge={contentDraftBridge}
          loading={contentDraftBridgeLoading}
          exposureMoves={todayMoves}
          recentRecords={recentManualRecords}
          onRefresh={() => void loadContentDraftBridge()}
        />
      ) : null}

      {workspaceTab === "people" ? (
        <MemoryAssetDeskPanel
          bridge={contentDraftBridge}
          items={items}
          recentRecords={recentManualRecords}
          savedMemoryIDs={savedMemoryIDs}
          manualActionStates={manualActionStates}
        />
      ) : null}

      {workspaceTab === "diagnostics" ? (
        <div className="space-y-5">
          <XApiBudgetPanel
            data={data}
            diagnostics={data?.diagnostics || null}
            resultRefreshSummary={resultRefreshSummary}
            resultRefreshing={resultRefreshing}
            timeZone={timeZone}
            onRefreshResults={() => void refreshManualResults()}
          />

          <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <AccountHealthScorePanel
              selectedAccountID={selectedAccountID}
              selectedBotID={selectedBotID}
              strategy={growthStrategy}
              data={data}
              items={items}
              recentRecords={recentManualRecords}
              safety={safetyCenter}
              stats={workbenchStats}
              loadState={loadState}
            />
            <AccountSafetyCenterPanel safety={safetyCenter} recentRecords={recentManualRecords} strategy={growthStrategy} />
            <RadarDataHealthMonitorPanel data={data} loadState={loadState} timeZone={timeZone} />
          </div>
        </div>
      ) : null}

      {workspaceTab === "diagnostics" && shouldShowSignalRecovery(data, loadState, workbenchStats) ? (
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

      {workspaceTab === "signals" ? (
        <RadarFilters
          region={region}
          hours={hours}
          maxFans={maxFans}
          minHotCount={minHotCount}
          loadState={loadState}
          hourOptions={hourOptions}
          fanOptions={fanOptions}
          hotCountOptions={hotCountOptions}
          accounts={accounts}
          bots={bots}
          selectedAccountID={selectedAccountID}
          selectedBotID={selectedBotID}
          sourceHealth={data ? <SourceHealthPanel data={data} timeZone={timeZone} /> : null}
          diagnostics={data?.diagnostics ? <CollectionDiagnosticsPanel diagnostics={data.diagnostics} timeZone={timeZone} /> : null}
          onRefresh={() => void load()}
          onRegionChange={setRegion}
          onHoursChange={setHours}
          onMaxFansChange={setMaxFans}
          onMinHotCountChange={setMinHotCount}
          onAccountChange={setSelectedAccountID}
          onBotChange={setSelectedBotID}
        />
      ) : null}

      {workspaceTab === "strategy" ? (
        <div className="space-y-5">
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
        </div>
      ) : null}

      {workspaceTab === "today" ? (
        <ManualHandlingPanel
          moves={(
            <TodayMovesPanel
              moves={todayMoves}
              stats={workbenchStats}
              activeID={activeWorkbenchID}
              onFocus={(itemID) => {
                setActiveWorkbenchID(itemID);
                focusRadarItem(itemID);
              }}
              onTaskStatus={(item, taskStatus) => recordManualAction(item, taskStatus === "done" ? { taskStatus, handled: true } : { taskStatus })}
              getReplyAngle={(item) => buildReplyAngleSuggestions(item, t)[0]}
            />
          )}
          workbench={(
            <HandlingWorkbenchPanel
              queue={handlingQueue}
              activeID={activeWorkbenchID}
              stats={workbenchStats}
              draftingID={draftingID}
              draftDisabled={!selectedAccountID || !selectedBotID}
              handlingID={handlingID}
              savingMemoryID={savingMemoryID}
              memoryDisabled={!selectedAccountID || !selectedBotID}
              strategy={growthStrategy}
              recentRecords={recentManualRecords}
              learningProfile={exposureLearningProfile}
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
          )}
        />
      ) : null}

      {workspaceTab === "people" ? (
        <div id="radar-people" className="space-y-5 scroll-mt-24">
          <PeopleRelationshipDeskPanel
            people={peopleRadar}
            recentRecords={recentManualRecords}
            onFocus={(itemID) => {
              setActiveWorkbenchID(itemID);
              focusRadarItem(itemID);
            }}
          />
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
      ) : null}

      {workspaceTab === "signals" ? (
        <OpportunitySignalList
          region={region}
          dataQuality={data?.data_quality}
          loadState={loadState}
          realItemCount={realItems.length}
          totalItemCount={items.length}
          displayedItemCount={displayedItems.length}
          usingSampleMode={usingSampleMode}
          viewTabs={<RadarViewTabs value={radarView} counts={radarViewCounts} onChange={setRadarView} />}
          leaderboard={<LeaderboardStatusStrip stats={leaderboardStats} freshnessLabel={leaderboardFreshnessLabel} />}
          emptyState={(
            <RadarEmptyStatePanel
              data={data}
              loadState={loadState}
              onRefresh={() => void load()}
              onWidenWindow={() => setHours(8)}
              onRaiseFans={() => setMaxFans((current) => Math.max(current, 50000))}
              onStartSample={() => setSampleMode(true)}
            />
          )}
        >
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
        </OpportunitySignalList>
      ) : null}

      {workspaceTab === "strategy" ? (
        <div className="space-y-5">
          <LearningInsightsPanel data={performance} items={items} manualActionStates={manualActionStates} recentRecords={recentManualRecords} learningProfile={exposureLearningProfile} />

          <PerformancePanel data={performance} timeZone={timeZone} />

          <TopicHistoryPanel data={archive} timeZone={timeZone} />
        </div>
      ) : null}
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

function ExposureRadarWorkspaceNav({
  value,
  counts,
  onChange,
}: {
  value: ExposureRadarWorkspaceTab;
  counts: Record<ExposureRadarWorkspaceTab, number>;
  onChange: (tab: ExposureRadarWorkspaceTab) => void;
}) {
  const { t } = useT();
  const icons: Record<ExposureRadarWorkspaceTab, ReactNode> = {
    today: <Zap className="size-4" />,
    signals: <Search className="size-4" />,
    people: <Users className="size-4" />,
    strategy: <Target className="size-4" />,
    diagnostics: <Gauge className="size-4" />,
  };

  return (
    <div className="sticky top-3 z-20 rounded-2xl border border-[#2f3336] bg-black/85 p-2 shadow-[0_16px_40px_rgba(0,0,0,0.28)] backdrop-blur">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="px-2">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.workspace.title")}</p>
          <p className="mt-0.5 text-xs text-[#71767b]">{t("exposureRadar.workspace.description")}</p>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1 lg:pb-0">
          {exposureRadarWorkspaceTabs.map((tab) => {
            const active = value === tab;
            return (
              <button
                key={tab}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(tab)}
                className={`min-w-[160px] rounded-xl border px-3 py-2 text-left transition ${
                  active
                    ? "border-[#1d9bf0]/60 bg-[#1d9bf0]/15 text-white"
                    : "border-[#2f3336] bg-[#0f1419] text-[#8b98a5] hover:border-[#1d9bf0]/35 hover:text-[#e7e9ea]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 text-sm font-semibold">
                    {icons[tab]}
                    {t(`exposureRadar.workspace.tab.${tab}.title`)}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${active ? "bg-[#1d9bf0] text-white" : "bg-black text-[#71767b]"}`}>
                    {formatCompact(counts[tab] || 0)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-1 text-xs opacity-75">{t(`exposureRadar.workspace.tab.${tab}.description`)}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TenMinuteActivationPanel({
  selectedAccountID,
  selectedBotID,
  strategy,
  moves,
  recentRecords,
  itemsCount,
  onRefresh,
  onStartSample,
}: {
  selectedAccountID: number;
  selectedBotID: number;
  strategy: ExposureRadarGrowthStrategyApi | null;
  moves: DailyActionPlanItem[];
  recentRecords: ExposureRadarManualRecordApi[];
  itemsCount: number;
  onRefresh: () => void;
  onStartSample: () => void;
}) {
  const { t } = useT();
  const strategyReady = Boolean(strategy?.target_audience || strategy?.core_topics?.length);
  const handledCount = recentRecords.filter((record) => record.handled_at || record.task_status === "done").length;
  const backfilledCount = recentRecords.filter((record) => record.result_checked_at || record.result_score).length;
  const steps = [
    { key: "setup", done: selectedAccountID > 0 && selectedBotID > 0, href: "#radar-setup", value: selectedAccountID > 0 && selectedBotID > 0 ? t("exposureRadar.activation10.value.ready") : t("exposureRadar.activation10.value.missing") },
    { key: "strategy", done: strategyReady, href: "#radar-strategy", value: strategyReady ? t("exposureRadar.activation10.value.ready") : t("exposureRadar.activation10.value.missing") },
    { key: "signal", done: itemsCount > 0 || moves.length > 0, href: "#radar-workbench", value: String(Math.max(itemsCount, moves.length)) },
    { key: "result", done: handledCount > 0 || backfilledCount > 0, href: "#radar-results", value: String(backfilledCount || handledCount) },
  ];
  const completed = steps.filter((step) => step.done).length;
  const nextStep = steps.find((step) => !step.done) || steps[steps.length - 1];
  return (
    <Card className="border-[#1d9bf0]/20 bg-[#07111a]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#1d9bf0]/30 bg-[#1d9bf0]/10 px-3 py-1 text-xs font-semibold text-[#8ecdf8]">
            <Clock3 className="size-3.5" />
            {t("exposureRadar.activation10.badge")}
          </span>
          <h2 className="mt-3 text-lg font-semibold text-[#e7e9ea]">{t("exposureRadar.activation10.title")}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#8b98a5]">{t("exposureRadar.activation10.description")}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <a href={nextStep.href} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#1d9bf0] px-3 text-sm font-semibold text-white hover:bg-[#1a8cd8]">
            {t(`exposureRadar.activation10.action.${nextStep.key}`)}
            <ArrowRight className="size-4" />
          </a>
          <Button type="button" variant="outline" onClick={onRefresh}>
            <RefreshCw className="size-4" />
            {t("common.refresh")}
          </Button>
          <Button type="button" variant="outline" onClick={onStartSample}>
            <Sparkles className="size-4" />
            {t("exposureRadar.sample.start")}
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {steps.map((step, index) => (
          <a key={step.key} href={step.href} className={`rounded-2xl border p-4 transition hover:border-[#1d9bf0]/45 ${step.done ? "border-[#00ba7c]/25 bg-[#00ba7c]/10" : step.key === nextStep.key ? "border-[#1d9bf0]/45 bg-[#1d9bf0]/10" : "border-[#2f3336] bg-black"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex size-8 items-center justify-center rounded-full border border-[#2f3336] bg-black text-xs font-semibold text-[#8ecdf8]">{index + 1}</span>
              {step.done ? <CheckCircle2 className="size-4 text-[#7ee0b5]" /> : <Clock3 className="size-4 text-[#71767b]" />}
            </div>
            <p className="mt-3 text-sm font-semibold text-[#e7e9ea]">{t(`exposureRadar.activation10.${step.key}.title`)}</p>
            <p className="mt-1 text-xs leading-5 text-[#71767b]">{t(`exposureRadar.activation10.${step.key}.description`)}</p>
            <p className="mt-2 text-xs font-semibold text-[#8ecdf8]">{step.value}</p>
          </a>
        ))}
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#202327]">
        <div className="h-full rounded-full bg-[#1d9bf0]" style={{ width: `${Math.round((completed / steps.length) * 100)}%` }} />
      </div>
    </Card>
  );
}

function AccountHealthScorePanel({
  selectedAccountID,
  selectedBotID,
  strategy,
  data,
  items,
  recentRecords,
  safety,
  stats,
  loadState,
}: {
  selectedAccountID: number;
  selectedBotID: number;
  strategy: ExposureRadarGrowthStrategyApi | null;
  data: ExposureRadarData | null;
  items: ExposureRadarItemApi[];
  recentRecords: ExposureRadarManualRecordApi[];
  safety: ExposureRadarSafetyCenterData | null;
  stats: WorkbenchStats;
  loadState: LoadState;
}) {
  const { t } = useT();
  const health = buildAccountHealthScore({
    selectedAccountID,
    selectedBotID,
    strategy,
    data,
    items,
    recentRecords,
    safety,
    stats,
    loadState,
    t,
  });
  return <AccountHealthScoreCard health={health} />;
}

function OpportunityEvidenceDeskPanel({ items, moves, data, loadState }: { items: ExposureRadarItemApi[]; moves: DailyActionPlanItem[]; data: ExposureRadarData | null; loadState: LoadState }) {
  const { t } = useT();
  const credibility = items.map((item) => buildSignalCredibility(item, t));
  const strong = credibility.filter((entry) => entry.status === "strong").length;
  const usable = credibility.filter((entry) => entry.status === "usable").length;
  const thin = credibility.filter((entry) => entry.status === "thin").length;
  const weak = credibility.filter((entry) => entry.status === "weak").length;
  const topMove = moves[0]?.item || items[0];
  const topCredibility = topMove ? buildSignalCredibility(topMove, t) : null;
  const diagnostics = data?.diagnostics || null;
  return (
    <OpportunityEvidenceDeskCard
      itemCount={items.length}
      loadState={loadState}
      strong={strong}
      usable={usable}
      thin={thin}
      weak={weak}
      topSignal={topMove && topCredibility ? {
        title: topMove.title,
        views: formatCompact(topMove.impression_count || 0),
        speed: formatVelocityLabel(topMove.views_per_min, "-"),
        followers: formatCompact(topMove.followers_count || 0),
        nextStep: topCredibility.nextStep,
      } : null}
      diagnostics={{
        maxViews: formatCompact(diagnostics?.max_impression_count || 0),
        maxSpeed: formatOneDecimal(diagnostics?.max_views_per_minute || 0),
        coverage: formatPercent(diagnostics?.real_view_coverage || 0),
      }}
    />
  );
}

function GrowthExperimentPanel({
  items,
  moves,
  recentRecords,
  learningProfile,
  safety,
}: {
  items: ExposureRadarItemApi[];
  moves: DailyActionPlanItem[];
  recentRecords: ExposureRadarManualRecordApi[];
  learningProfile: ExposureLearningProfile;
  safety: ExposureRadarSafetyCenterData | null;
}) {
  const { t } = useT();
  const experiments = buildGrowthExperiments({ items, moves, recentRecords, learningProfile, safety, t });
  return <GrowthExperimentCard experiments={experiments} />;
}

function WeeklyOperatorReviewPanel({
  weeklyReview,
  recentRecords,
  moves,
  learningProfile,
  safety,
  timeZone,
}: {
  weeklyReview: ExposureRadarWeeklyReviewData | null;
  recentRecords: ExposureRadarManualRecordApi[];
  moves: DailyActionPlanItem[];
  learningProfile: ExposureLearningProfile;
  safety: ExposureRadarSafetyCenterData | null;
  timeZone: string;
}) {
  const { t } = useT();
  const { pushToast } = useToast();
  const handled = weeklyReview?.handled_count || recentRecords.filter((record) => record.handled_at || record.task_status === "done").length;
  const effective = weeklyReview?.effective_count || recentRecords.filter((record) => record.outcome === "effective").length;
  const negative = weeklyReview?.negative_count || recentRecords.filter((record) => record.outcome === "ineffective" || record.outcome === "not_suitable").length;
  const backfilled = recentRecords.filter((record) => record.result_checked_at || record.result_score).length;
  const report = buildWeeklyOperatorReport({ weeklyReview, recentRecords, moves, learningProfile, safety, timeZone, t });
  const topTopicItems = (weeklyReview?.top_topics || []).slice(0, 5).map((topic) => `${topic.topic_name} · ${topic.effective}/${topic.count}`);
  const nextItems = weeklyReview?.recommendations?.length ? weeklyReview.recommendations : buildWeeklyFallbackRecommendations(learningProfile, safety, t);
  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report);
      pushToast(t("exposureRadar.weeklyOps.copied"));
    } catch {
      pushToast(t("exposureRadar.weeklyOps.copyFailed"));
    }
  };
  return (
    <WeeklyOperatorReviewCard
      handled={handled}
      effective={effective}
      negative={negative}
      backfilled={backfilled}
      topTopicItems={topTopicItems}
      nextItems={nextItems}
      onCopyReport={() => void copyReport()}
    />
  );
}

function PeopleRelationshipDeskPanel({ people, recentRecords, onFocus }: { people: PeopleRadarEntry[]; recentRecords: ExposureRadarManualRecordApi[]; onFocus: (itemID: string) => void }) {
  const priority = people.filter((person) => person.stage === "priority" || person.crmStage === "priority");
  const repeat = people.filter((person) => person.stage === "repeat");
  const engaged = people.filter((person) => person.stage === "engaged" || person.handled > 0);
  const avoid = people.filter((person) => person.stage === "avoid" || person.crmStage === "avoid");
  const topPeople = [...priority, ...repeat, ...engaged].filter((person, index, list) => list.findIndex((row) => row.key === person.key) === index).slice(0, 3);
  const relationshipRecords = recentRecords.filter((record) => record.author_handle && (record.handled_at || record.feedback_at || record.saved_at));
  return (
    <PeopleRelationshipDeskCard
      relationshipCount={relationshipRecords.length}
      priorityCount={priority.length}
      repeatCount={repeat.length}
      engagedCount={engaged.length}
      avoidCount={avoid.length}
      topPeople={topPeople}
      onFocus={onFocus}
    />
  );
}

function MemoryAssetDeskPanel({
  bridge,
  items,
  recentRecords,
  savedMemoryIDs,
  manualActionStates,
}: {
  bridge: ContentDraftBridgeData;
  items: ExposureRadarItemApi[];
  recentRecords: ExposureRadarManualRecordApi[];
  savedMemoryIDs: Set<string>;
  manualActionStates: Record<string, ManualActionState>;
}) {
  const savedSignals = items.filter((item) => radarItemSavedMemoryID(item, savedMemoryIDs)).length;
  const localSaved = Object.values(manualActionStates).filter((state) => state.saved).length;
  const effectiveTopics = topRecordLabels(recentRecords.filter((record) => record.outcome === "effective" || (record.result_score || 0) >= 60), "topic_name", 4);
  const contentSeeds = bridge.drafts.filter((draft) => draft.content_library_item_id || draft.content_direction || draft.content_title).slice(0, 3);
  return (
    <MemoryAssetDeskCard
      savedSignalsCount={savedSignals + localSaved}
      draftCount={bridge.drafts.length}
      enabledPlanCount={bridge.plans.filter((plan) => plan.enabled).length}
      effectiveTopics={effectiveTopics}
      contentSeeds={contentSeeds}
    />
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
  const topTasks = moves.slice(0, 5);

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

      <div className="mt-4 rounded-2xl border border-[#2f3336] bg-black p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.dailyDesk.topFive.title")}</p>
            <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("exposureRadar.dailyDesk.topFive.description")}</p>
          </div>
          <a href="#radar-workbench" className="inline-flex h-8 w-fit items-center gap-1 rounded-full border border-[#1d9bf0]/35 bg-[#1d9bf0]/10 px-3 text-xs font-semibold text-[#8ecdf8] hover:bg-[#1d9bf0]/15">
            {t("exposureRadar.dailyDesk.topFive.open")}
            <ArrowRight className="size-3.5" />
          </a>
        </div>
        {topTasks.length ? (
          <div className="mt-3 grid gap-2 xl:grid-cols-5">
            {topTasks.map((task, index) => (
              <a key={task.item.id} href="#radar-workbench" className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3 transition hover:border-[#1d9bf0]/45 hover:bg-[#1d9bf0]/10">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex size-6 items-center justify-center rounded-full border border-[#1d9bf0]/35 bg-[#1d9bf0]/10 text-[11px] font-semibold text-[#8ecdf8]">{index + 1}</span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${actionPlanTone(task.action)}`}>
                    {t(`exposureRadar.actionPlan.action.${task.action}`)}
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-[#e7e9ea]">{task.item.title}</p>
                <p className="mt-2 text-[11px] leading-4 text-[#71767b]">{t(`exposureRadar.actionPlan.reason.${task.reason}`)}</p>
                <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[#8b98a5]">
                  <span>{task.item.score} {t("exposureRadar.card.score")}</span>
                  <span>{formatVelocityLabel(task.item.views_per_min, t("exposureRadar.card.velocitySampling"))}</span>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-xl border border-dashed border-[#2f3336] px-3 py-6 text-center text-xs text-[#71767b]">
            {t("exposureRadar.dailyDesk.topFive.empty")}
          </div>
        )}
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

function ResultLearningLoopPanel({
  data,
  moves,
  recentRecords,
  weeklyReview,
  safety,
  learningProfile,
}: {
  data: ExposureRadarData | null;
  moves: DailyActionPlanItem[];
  recentRecords: ExposureRadarManualRecordApi[];
  weeklyReview: ExposureRadarWeeklyReviewData | null;
  safety: ExposureRadarSafetyCenterData | null;
  learningProfile: ExposureLearningProfile;
}) {
  const { t } = useT();
  const actions = buildResultLearningMoves({ data, moves, recentRecords, weeklyReview, safety, learningProfile, t });
  const resultRecords = recentRecords.filter((record) => record.result_checked_at || record.result_score || record.outcome);
  const effectiveRecords = resultRecords.filter((record) => record.outcome === "effective" || (record.result_score || 0) >= 60);
  const pendingBackfill = recentRecords.filter((record) => (record.handled_at || record.task_status === "done" || record.published_url) && !record.result_checked_at && !record.result_score).length;
  const summary = buildResultLearningSummary({ moves, recentRecords, weeklyReview, safety, learningProfile, pendingBackfill, t });
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <CardHeader title={t("exposureRadar.learningLoop.title")} description={t("exposureRadar.learningLoop.description")} className="mb-0" />
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-3 py-1 text-xs font-semibold text-[#7ee0b5]">
          <BarChart3 className="size-3.5" />
          {t("exposureRadar.learningLoop.badge")}
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <GrowthDeskMetric icon={<Database className="size-3.5" />} label={t("exposureRadar.learningLoop.metric.results")} value={String(resultRecords.length)} detail={t("exposureRadar.learningLoop.metric.resultsDetail")} />
        <GrowthDeskMetric icon={<TrendingUp className="size-3.5" />} label={t("exposureRadar.learningLoop.metric.effective")} value={String(effectiveRecords.length)} detail={weeklyReview ? `${Math.round((weeklyReview.effective_rate || 0) * 100)}%` : t("exposureRadar.learningLoop.metric.effectiveDetail")} />
        <GrowthDeskMetric icon={<Clock3 className="size-3.5" />} label={t("exposureRadar.learningLoop.metric.pending")} value={String(pendingBackfill)} detail={t("exposureRadar.learningLoop.metric.pendingDetail")} />
        <GrowthDeskMetric icon={<ShieldAlert className="size-3.5" />} label={t("exposureRadar.learningLoop.metric.safety")} value={String((safety?.watch_count || 0) + (safety?.block_count || 0))} detail={t("exposureRadar.learningLoop.metric.safetyDetail")} />
      </div>
      <div className={`mt-4 rounded-2xl border p-4 ${resultLearningTone(summary.tone)}`}>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <BrainCircuit className="size-4" />
          {summary.title}
        </p>
        <p className="mt-2 text-xs leading-5 opacity-85">{summary.detail}</p>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {actions.map((action) => (
          <div key={action.key} className={`rounded-2xl border p-4 ${resultLearningTone(action.tone)}`}>
            <p className="text-sm font-semibold">{action.title}</p>
            <p className="mt-2 text-xs leading-5 opacity-85">{action.detail}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function TeamHandoffPanel({
  moves,
  people,
  recentRecords,
  safety,
  timeZone,
}: {
  moves: DailyActionPlanItem[];
  people: PeopleRadarEntry[];
  recentRecords: ExposureRadarManualRecordApi[];
  safety: ExposureRadarSafetyCenterData | null;
  timeZone: string;
}) {
  const { t } = useT();
  const { pushToast } = useToast();
  const readyMoves = moves.slice(0, 3);
  const priorityPeople = people.filter((person) => person.stage === "priority" || person.stage === "repeat").slice(0, 3);
  const handledToday = recentRecords.filter((record) => isRecentManualRecord(record, 24) && (record.handled_at || record.task_status === "done")).length;
  const pendingBackfill = recentRecords.filter((record) => isRecentManualRecord(record, 72) && (record.handled_at || record.task_status === "done") && !record.result_checked_at && !record.result_score).length;
  const warnings = (safety?.watch_count || 0) + (safety?.block_count || 0);
  const report = [
    t("exposureRadar.handoff.report.heading"),
    t("exposureRadar.handoff.report.summary", { moves: readyMoves.length, handled: handledToday, backfill: pendingBackfill, warnings }),
    readyMoves.length ? t("exposureRadar.handoff.report.queue") : t("exposureRadar.handoff.report.queueEmpty"),
    ...readyMoves.map((entry, index) => t("exposureRadar.handoff.report.queueItem", {
      index: index + 1,
      title: entry.item.title,
      action: t(`exposureRadar.dailyAction.${entry.action}`),
      score: entry.item.score,
    })),
    priorityPeople.length ? t("exposureRadar.handoff.report.people") : t("exposureRadar.handoff.report.peopleEmpty"),
    ...priorityPeople.map((person) => t("exposureRadar.handoff.report.peopleItem", {
      name: person.name,
      handle: person.handle ? `@${person.handle}` : "-",
      count: person.count,
    })),
    t("exposureRadar.handoff.report.generatedAt", { time: formatDateTime(new Date().toISOString(), timeZone) }),
  ].join("\n");
  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report);
      pushToast(t("exposureRadar.handoff.copied"));
    } catch {
      pushToast(t("exposureRadar.handoff.copyFailed"));
    }
  };
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <CardHeader title={t("exposureRadar.handoff.title")} description={t("exposureRadar.handoff.description")} className="mb-0" />
        <Button type="button" variant="outline" onClick={() => void copyReport()}>
          <Clipboard className="size-4" />
          {t("exposureRadar.handoff.copy")}
        </Button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <GrowthDeskMetric icon={<MessageCircle className="size-3.5" />} label={t("exposureRadar.handoff.metric.ready")} value={String(readyMoves.length)} detail={t("exposureRadar.handoff.metric.readyDetail")} />
        <GrowthDeskMetric icon={<CheckCircle2 className="size-3.5" />} label={t("exposureRadar.handoff.metric.handled")} value={String(handledToday)} detail={t("exposureRadar.handoff.metric.handledDetail")} />
        <GrowthDeskMetric icon={<BarChart3 className="size-3.5" />} label={t("exposureRadar.handoff.metric.backfill")} value={String(pendingBackfill)} detail={t("exposureRadar.handoff.metric.backfillDetail")} />
        <GrowthDeskMetric icon={<ShieldAlert className="size-3.5" />} label={t("exposureRadar.handoff.metric.safety")} value={String(warnings)} detail={t("exposureRadar.handoff.metric.safetyDetail")} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.handoff.queueTitle")}</p>
          <div className="mt-3 space-y-2">
            {readyMoves.length ? readyMoves.map((entry, index) => (
              <div key={entry.item.id} className="rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <p className="line-clamp-2 text-xs font-semibold text-[#e7e9ea]">{index + 1}. {entry.item.title}</p>
                  <span className="shrink-0 rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-2 py-0.5 text-[11px] font-semibold text-[#8ecdf8]">{entry.item.score}</span>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-[#71767b]">{t(`exposureRadar.dailyAction.${entry.action}`)} · {t(`exposureRadar.dailyActionReason.${entry.reason}`)}</p>
              </div>
            )) : (
              <p className="rounded-xl border border-dashed border-[#2f3336] px-3 py-6 text-center text-xs text-[#71767b]">{t("exposureRadar.handoff.queueEmpty")}</p>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.handoff.rolesTitle")}</p>
          <div className="mt-3 space-y-2">
            {["reviewer", "handler", "analyst"].map((key) => (
              <div key={key} className="rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2">
                <p className="text-xs font-semibold text-[#e7e9ea]">{t(`exposureRadar.handoff.role.${key}.title`)}</p>
                <p className="mt-1 text-[11px] leading-4 text-[#71767b]">{t(`exposureRadar.handoff.role.${key}.description`)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function AccountSafetyCenterPanel({
  safety,
  recentRecords,
  strategy,
}: {
  safety: ExposureRadarSafetyCenterData | null;
  recentRecords: ExposureRadarManualRecordApi[];
  strategy: ExposureRadarGrowthStrategyApi | null;
}) {
  const { t } = useT();
  const watch = safety?.watch_count || 0;
  const blocked = safety?.block_count || 0;
  const riskyRecords = recentRecords.filter((record) => record.safety_status === "watch" || record.safety_status === "block" || record.risk_level === "medium" || record.risk_level === "high").length;
  const posture = blocked > 0 ? "pause" : watch > 0 || riskyRecords > 0 ? "review" : "steady";
  const dailyLimit = Math.max(1, strategy?.daily_move_limit || 10);
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <CardHeader title={t("exposureRadar.accountSafety.title")} description={t("exposureRadar.accountSafety.description")} className="mb-0" />
        <span className={`inline-flex h-9 w-fit items-center gap-2 rounded-full border px-3 text-xs font-semibold ${posture === "steady" ? "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" : posture === "review" ? "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]" : "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]"}`}>
          {posture === "steady" ? <ShieldCheck className="size-3.5" /> : <ShieldAlert className="size-3.5" />}
          {t(`exposureRadar.accountSafety.posture.${posture}`)}
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <DiagnosticMetric label={t("exposureRadar.accountSafety.metric.dailyLimit")} value={String(dailyLimit)} detail={t("exposureRadar.accountSafety.metric.dailyLimitDetail")} />
        <DiagnosticMetric label={t("exposureRadar.accountSafety.metric.review")} value={String(watch)} detail={t("exposureRadar.accountSafety.metric.reviewDetail")} />
        <DiagnosticMetric label={t("exposureRadar.accountSafety.metric.blocked")} value={String(blocked)} detail={t("exposureRadar.accountSafety.metric.blockedDetail")} />
        <DiagnosticMetric label={t("exposureRadar.accountSafety.metric.risky")} value={String(riskyRecords)} detail={t("exposureRadar.accountSafety.metric.riskyDetail")} />
      </div>
      <div className="mt-4 rounded-2xl border border-[#2f3336] bg-black p-4">
        <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.accountSafety.rulesTitle")}</p>
        <div className="mt-3 space-y-2">
          {(safety?.warnings?.length ? safety.warnings.slice(0, 3) : ["manual", "context", "pace"]).map((item) => (
            <div key={item} className="flex gap-2 rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2 text-xs leading-5 text-[#8b98a5]">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[#7ee0b5]" />
              <span>{["manual", "context", "pace"].includes(item) ? t(`exposureRadar.accountSafety.rule.${item}`) : item}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function RadarDataHealthMonitorPanel({ data, loadState, timeZone }: { data: ExposureRadarData | null; loadState: LoadState; timeZone: string }) {
  const { t } = useT();
  const diagnostics = data?.diagnostics || null;
  const status = normalizeDiagnosticStatus(diagnostics?.status || (loadState === "loading" ? "warming" : data?.source_status));
  const suggestions = diagnostics ? diagnosticSuggestions(diagnostics, t).slice(0, 3) : [t("exposureRadar.dataHealth.suggestion.loading")];
  const sourceType = normalizeSourceType(data?.source_type);
  const sourceStatus = normalizeSourceStatus(data?.source_status);
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <CardHeader title={t("exposureRadar.dataHealth.title")} description={t("exposureRadar.dataHealth.description")} className="mb-0" />
        <span className={`inline-flex h-9 w-fit items-center gap-2 rounded-full border px-3 text-xs font-semibold ${diagnosticStatusClass(status)}`}>
          <Activity className="size-3.5" />
          {t(`exposureRadar.diagnostics.status.${status}`)}
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DiagnosticMetric label={t("exposureRadar.dataHealth.metric.source")} value={t(`exposureRadar.sourceType.${sourceType}`)} detail={t(`exposureRadar.sourceStatus.${sourceStatus}`)} />
        <DiagnosticMetric label={t("exposureRadar.dataHealth.metric.coverage")} value={formatPercent(diagnostics?.real_view_coverage || 0)} detail={t("exposureRadar.dataHealth.metric.coverageDetail", { count: diagnostics?.window_real_view_count || 0 })} />
        <DiagnosticMetric label={t("exposureRadar.dataHealth.metric.sampling")} value={formatPercent(diagnostics?.sampling_coverage || 0)} detail={t("exposureRadar.dataHealth.metric.samplingDetail", { count: diagnostics?.window_prior_sample_count || 0 })} />
        <DiagnosticMetric label={t("exposureRadar.dataHealth.metric.updated")} value={data?.last_collected_at ? formatDateTime(data.last_collected_at, timeZone) : "-"} detail={data?.updated_at ? formatDateTime(data.updated_at, timeZone) : t("exposureRadar.dataHealth.metric.updatedEmpty")} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.dataHealth.gapTitle")}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <MiniStat icon={<Eye className="size-3.5" />} label={t("exposureRadar.diagnostics.gap.maxViews")} value={formatCompact(diagnostics?.max_impression_count || 0)} />
            <MiniStat icon={<Gauge className="size-3.5" />} label={t("exposureRadar.diagnostics.gap.maxSpeed")} value={`${formatOneDecimal(diagnostics?.max_views_per_minute || 0)}/min`} />
            <MiniStat icon={<Flame className="size-3.5" />} label={t("exposureRadar.diagnostics.metric.hot")} value={formatCompact(diagnostics?.hot_opportunity_count || 0)} />
          </div>
        </div>
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.dataHealth.nextTitle")}</p>
          <div className="mt-3 space-y-2">
            {suggestions.map((suggestion) => (
              <div key={suggestion} className="flex gap-2 text-xs leading-5 text-[#8b98a5]">
                <Info className="mt-0.5 size-3.5 shrink-0 text-[#8ecdf8]" />
                <span>{suggestion}</span>
              </div>
            ))}
          </div>
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

function FirstDayLaunchPanel({
  selectedAccountID,
  selectedBotID,
  accounts,
  bots,
  strategy,
  moves,
  recentRecords,
  contentDraftBridge,
  itemsCount,
  usingSampleMode,
  loadState,
  onRefresh,
  onStartSample,
  onExitSample,
}: {
  selectedAccountID: number;
  selectedBotID: number;
  accounts: AccountListItem[];
  bots: OAFBot[];
  strategy: ExposureRadarGrowthStrategyApi | null;
  moves: DailyActionPlanItem[];
  recentRecords: ExposureRadarManualRecordApi[];
  contentDraftBridge: ContentDraftBridgeData;
  itemsCount: number;
  usingSampleMode: boolean;
  loadState: LoadState;
  onRefresh: () => void;
  onStartSample: () => void;
  onExitSample: () => void;
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
    { key: "queue", done: moves.length > 0 || itemsCount > 0 },
    { key: "result", done: resultCount > 0 || handledCount > 0 },
  ] satisfies Array<{ key: FirstDayStepKey; done: boolean }>).map((step) => ({
    ...step,
    anchor: step.key === "account" ? "#radar-setup" : step.key === "strategy" ? "#radar-strategy" : step.key === "result" ? "#radar-results" : moves.length > 0 ? "#radar-workbench" : "#radar-setup",
  }));
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
  const activationMode = firstDayActivationMode({
    selectedAccountID,
    selectedBotID,
    strategyReady,
    itemsCount,
    movesCount: moves.length,
    handledCount,
    resultCount,
  });
  const wizardSteps = [
    { key: "account", done: selectedAccountID > 0, href: "/accounts", icon: <Users className="size-4" /> },
    { key: "bot", done: selectedBotID > 0, href: "/oaf-bots", icon: <Bot className="size-4" /> },
    { key: "strategy", done: strategyReady, href: "#radar-strategy", icon: <Target className="size-4" /> },
    { key: "signals", done: itemsCount > 0, href: "#radar-workbench", icon: <Search className="size-4" /> },
    { key: "result", done: resultCount > 0 || handledCount > 0, href: "#radar-results", icon: <BarChart3 className="size-4" /> },
  ];
  return (
    <FirstDayLaunchCard
      steps={steps}
      checklist={checklist}
      wizardSteps={wizardSteps}
      activationMode={activationMode}
      activationActions={firstDayActivationActions(activationMode, onRefresh, loadState, onStartSample)}
      selectedAccountLabel={selectedAccount ? `@${selectedAccount.username}` : t("exposureRadar.firstDay.selected.missing")}
      selectedBotLabel={selectedBot?.name || (selectedBotID ? t("oafBots.botNumber", { id: selectedBotID }) : t("exposureRadar.firstDay.selected.missing"))}
      selectedLaneLabel={strategy?.target_audience || t("exposureRadar.firstDay.selected.missing")}
      readyCount={moves.length}
      handledCount={handledCount}
      resultCount={resultCount}
      usingSampleMode={usingSampleMode}
      onStartSample={onStartSample}
      onExitSample={onExitSample}
    />
  );
}

function RadarEmptyStatePanel({
  data,
  loadState,
  onRefresh,
  onWidenWindow,
  onRaiseFans,
  onStartSample,
}: {
  data: ExposureRadarData | null;
  loadState: LoadState;
  onRefresh: () => void;
  onWidenWindow: () => void;
  onRaiseFans: () => void;
  onStartSample: () => void;
}) {
  const { t } = useT();
  const diagnostics = data?.diagnostics || null;
  const reason = signalRecoveryReason(data, loadState, t);
  const suggestions = signalRecoverySuggestions(diagnostics, t).slice(0, 3);
  return (
    <RadarEmptyStateCard
      reason={reason}
      suggestions={suggestions}
      metrics={{
        visible: formatCompact(diagnostics?.visible_pool_count || 0),
        maxViews: formatCompact(diagnostics?.max_impression_count || 0),
        maxSpeed: `${formatOneDecimal(diagnostics?.max_views_per_minute || 0)}/min`,
        coverage: formatPercent(diagnostics?.sampling_coverage || 0),
      }}
      loadState={loadState}
      onRefresh={onRefresh}
      onWidenWindow={onWidenWindow}
      onRaiseFans={onRaiseFans}
      onStartSample={onStartSample}
    />
  );
}

function PreflightSafetyPanel({
  selectedAccountID,
  selectedBotID,
  strategy,
  data,
  items,
  stats,
  recentRecords,
  usingSampleMode,
}: {
  selectedAccountID: number;
  selectedBotID: number;
  strategy: ExposureRadarGrowthStrategyApi | null;
  data: ExposureRadarData | null;
  items: ExposureRadarItemApi[];
  stats: WorkbenchStats;
  recentRecords: ExposureRadarManualRecordApi[];
  usingSampleMode: boolean;
}) {
  const { t } = useT();
  const checks = buildPreflightChecks({
    selectedAccountID,
    selectedBotID,
    strategy,
    data,
    items,
    stats,
    recentRecords,
    usingSampleMode,
    t,
  });
  const blocked = checks.filter((check) => check.status === "block").length;
  const watch = checks.filter((check) => check.status === "watch").length;
  const status = blocked > 0 ? "block" : watch > 0 ? "watch" : "pass";
  return <PreflightSafetyCard checks={checks} status={status} />;
}

function SessionFocusPanel({
  focus,
  onChange,
  strategy,
  firstItem,
  usingSampleMode,
}: {
  focus: SessionFocusKey;
  onChange: (focus: SessionFocusKey) => void;
  strategy: ExposureRadarGrowthStrategyApi | null;
  firstItem?: ExposureRadarItemApi;
  usingSampleMode: boolean;
}) {
  const { t } = useT();
  const options = sessionFocusOptions(t);
  const strategyLabel = usingSampleMode ? t("exposureRadar.sample.badge") : strategy?.primary_goal ? t(`exposureRadar.strategy.goal.${strategy.primary_goal}`) : t("exposureRadar.sessionFocus.noStrategy");
  const guidance = t(`exposureRadar.sessionFocus.guidance.${focus}`, { signal: firstItem ? compactTitle(firstItem.title) : t("exposureRadar.sessionFocus.noSignal") });
  return (
    <SessionFocusCard focus={focus} options={options} strategyLabel={strategyLabel} guidance={guidance} onChange={onChange} />
  );
}

function DailyOperatingGoalsPanel({
  strategy,
  stats,
  items,
  manualActionStates,
  savedMemoryIDs,
  recentRecords,
  usingSampleMode,
  onStartSample,
}: {
  strategy: ExposureRadarGrowthStrategyApi | null;
  stats: WorkbenchStats;
  items: ExposureRadarItemApi[];
  manualActionStates: Record<string, ManualActionState>;
  savedMemoryIDs: Set<string>;
  recentRecords: ExposureRadarManualRecordApi[];
  usingSampleMode: boolean;
  onStartSample: () => void;
}) {
  const { t } = useT();
  const goals = buildDailyOperatingGoals(strategy, stats, items, manualActionStates, savedMemoryIDs, recentRecords, t);
  const completed = goals.filter((goal) => goal.done >= goal.target).length;
  const overall = goals.length ? Math.round((goals.reduce((sum, goal) => sum + Math.min(1, goal.done / goal.target), 0) / goals.length) * 100) : 0;
  return (
    <DailyOperatingGoalsCard goals={goals} completed={completed} overall={overall} hasItems={items.length > 0} usingSampleMode={usingSampleMode} onStartSample={onStartSample} />
  );
}

function PublishQualityGatePanel({
  gates,
  state,
  ready,
  onToggle,
}: {
  gates: Array<{ key: PublishGateKey; title: string; detail: string }>;
  state?: PublishGateState;
  ready: boolean;
  onToggle: (key: PublishGateKey, checked: boolean) => void;
}) {
  const { t } = useT();
  return (
    <div className="mt-4 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.publishGate.title")}</p>
          <p className="mt-1 text-[11px] leading-5 text-[#71767b]">{t("exposureRadar.publishGate.description")}</p>
        </div>
        <span className={`inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-semibold ${ready ? "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" : "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]"}`}>
          {ready ? t("exposureRadar.publishGate.ready") : t("exposureRadar.publishGate.review")}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {gates.map((gate) => (
          <label key={gate.key} className={`flex cursor-pointer gap-3 rounded-xl border p-3 ${state?.[gate.key] ? "border-[#00ba7c]/25 bg-[#00ba7c]/10" : "border-[#2f3336] bg-black"}`}>
            <input
              type="checkbox"
              checked={Boolean(state?.[gate.key])}
              onChange={(event) => onToggle(gate.key, event.target.checked)}
              className="mt-1 size-4 accent-[#1d9bf0]"
            />
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-[#e7e9ea]">{gate.title}</span>
              <span className="mt-1 block text-[11px] leading-5 text-[#71767b]">{gate.detail}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

function OperatorScratchpadPanel({
  note,
  onChange,
  item,
  manualState,
}: {
  note: string;
  onChange: (value: string) => void;
  item?: ExposureRadarItemApi;
  manualState?: ManualActionState;
}) {
  const { t } = useT();
  const suggestions = buildOperatorScratchpadSuggestions(item, manualState, t);
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#2f3336] bg-black px-3 py-1 text-xs font-semibold text-[#8b98a5]">
            <FileText className="size-3.5" />
            {t("exposureRadar.scratchpad.badge")}
          </span>
          <CardHeader title={t("exposureRadar.scratchpad.title")} description={t("exposureRadar.scratchpad.description")} className="mt-3 mb-0" />
        </div>
      </div>
      <textarea
        value={note}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t("exposureRadar.scratchpad.placeholder")}
        className="mt-4 min-h-32 w-full resize-y rounded-2xl border border-[#2f3336] bg-black p-3 text-sm leading-6 text-[#e7e9ea] outline-none transition placeholder:text-[#71767b] focus:border-[#1d9bf0]"
      />
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onChange(appendOperatorNote(note, suggestion))}
            className="rounded-xl border border-[#2f3336] bg-black px-3 py-2 text-left text-xs leading-5 text-[#8b98a5] transition hover:border-[#1d9bf0]/45 hover:text-[#e7e9ea]"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </Card>
  );
}

function NextSessionCarryoverPanel({
  items,
  manualActionStates,
  sessionFocus,
  operatorNote,
  onFocus,
}: {
  items: ExposureRadarItemApi[];
  manualActionStates: Record<string, ManualActionState>;
  sessionFocus: SessionFocusKey;
  operatorNote: string;
  onFocus: (itemID: string) => void;
}) {
  const { t } = useT();
  const carryovers = buildNextSessionCarryovers(items, manualActionStates, sessionFocus, operatorNote, t);
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#ffd400]/25 bg-[#ffd400]/10 px-3 py-1 text-xs font-semibold text-[#f6d96b]">
            <CalendarClock className="size-3.5" />
            {t("exposureRadar.carryover.badge")}
          </span>
          <CardHeader title={t("exposureRadar.carryover.title")} description={t("exposureRadar.carryover.description")} className="mt-3 mb-0" />
        </div>
        <a href="#radar-workbench" className="inline-flex h-9 w-fit items-center gap-1.5 rounded-full border border-[#2f3336] px-3 text-sm font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
          {t("exposureRadar.carryover.openWorkbench")}
          <ArrowRight className="size-4" />
        </a>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {carryovers.map((carryover) => (
          <button
            key={carryover.key}
            type="button"
            onClick={() => carryover.itemID && onFocus(carryover.itemID)}
            className="rounded-2xl border border-[#2f3336] bg-black p-4 text-left transition hover:border-[#1d9bf0]/35 disabled:cursor-default"
            disabled={!carryover.itemID}
          >
            <span className="inline-flex size-9 items-center justify-center rounded-xl border border-[#2f3336] bg-[#16181c] text-[#8b98a5]">{carryover.icon}</span>
            <p className="mt-3 text-sm font-semibold text-[#e7e9ea]">{carryover.title}</p>
            <p className="mt-1 text-xs leading-5 text-[#71767b]">{carryover.detail}</p>
          </button>
        ))}
      </div>
    </Card>
  );
}

function DailyRecapPanel({
  items,
  stats,
  manualActionStates,
  recentRecords,
  operatorNote,
  usingSampleMode,
  timeZone,
}: {
  items: ExposureRadarItemApi[];
  stats: WorkbenchStats;
  manualActionStates: Record<string, ManualActionState>;
  recentRecords: ExposureRadarManualRecordApi[];
  operatorNote: string;
  usingSampleMode: boolean;
  timeZone: string;
}) {
  const { t } = useT();
  const { pushToast } = useToast();
  const recap = buildDailyRecapText({ items, stats, manualActionStates, recentRecords, operatorNote, usingSampleMode, timeZone, t });
  const copyRecap = async () => {
    try {
      await navigator.clipboard.writeText(recap);
      pushToast(t("exposureRadar.dailyRecap.copied"));
    } catch {
      pushToast(t("exposureRadar.dailyRecap.copyFailed"));
    }
  };
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#7856ff]/25 bg-[#7856ff]/10 px-3 py-1 text-xs font-semibold text-[#c4b5fd]">
            <Clipboard className="size-3.5" />
            {t("exposureRadar.dailyRecap.badge")}
          </span>
          <CardHeader title={t("exposureRadar.dailyRecap.title")} description={t("exposureRadar.dailyRecap.description")} className="mt-3 mb-0" />
        </div>
        <Button type="button" size="sm" onClick={() => void copyRecap()}>
          <Clipboard className="size-3.5" />
          {t("exposureRadar.dailyRecap.copy")}
        </Button>
      </div>
      <pre className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl border border-[#2f3336] bg-black p-4 text-xs leading-6 text-[#c9d1d9]">{recap}</pre>
    </Card>
  );
}

function SampleModeBanner({ onExit }: { onExit: () => void }) {
  const { t } = useT();
  return (
    <div className="rounded-2xl border border-[#7856ff]/25 bg-[#140f24] p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#7856ff]/30 bg-black/30 px-3 py-1 text-xs font-semibold text-[#c4b5fd]">
            <Sparkles className="size-3.5" />
            {t("exposureRadar.sample.badge")}
          </span>
          <p className="mt-3 text-base font-semibold text-[#e7e9ea]">{t("exposureRadar.sample.title")}</p>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#8b98a5]">{t("exposureRadar.sample.description")}</p>
        </div>
        <Button type="button" variant="outline" onClick={onExit}>
          <RefreshCw className="size-4" />
          {t("exposureRadar.sample.exit")}
        </Button>
      </div>
    </div>
  );
}

function FirstLoopPanel({
  item,
  manualState,
  savedMemoryID,
  drafting,
  draftDisabled,
  handling,
  usingSampleMode,
  firstLoopDone,
  publishGateState,
  onStartSample,
  onCreateDraft,
  onMarkHandled,
  onManualAction,
  onTogglePublishGate,
  onFocusWorkbench,
}: {
  item?: ExposureRadarItemApi;
  manualState?: ManualActionState;
  savedMemoryID: number;
  drafting: boolean;
  draftDisabled: boolean;
  handling: boolean;
  usingSampleMode: boolean;
  firstLoopDone: boolean;
  publishGateState?: PublishGateState;
  onStartSample: () => void;
  onCreateDraft: (item: ExposureRadarItemApi, replyAngle?: ReplyAngleSuggestion) => void;
  onMarkHandled: (item: ExposureRadarItemApi, publishedURL: string) => MaybePromise<void>;
  onManualAction: (item: ExposureRadarItemApi, patch: Partial<ManualActionState>, replyAngle?: ReplyAngleSuggestion) => void;
  onTogglePublishGate: (itemID: string, key: PublishGateKey, checked: boolean) => void;
  onFocusWorkbench: (itemID: string) => void;
}) {
  const { t } = useT();
  const { pushToast } = useToast();
  const replyAngles = item ? buildReplyAngleSuggestions(item, t) : [];
  const selectedReplyAngle = item ? selectedReplyAngleForItem(item, {}, t) : undefined;
  const generatedComment = item?.generated_comment?.trim() || "";
  const handled = item ? isManualActionHandled(item, manualState) : false;
  const stepKey = firstLoopStepKey(item, manualState, firstLoopDone);
  const priorityReasons = item ? buildPriorityReasonChips(item, t) : [];
  const gateItems = item ? buildPublishGateItems(item, generatedComment, t) : [];
  const gateReady = gateItems.length > 0 && gateItems.every((gate) => Boolean(publishGateState?.[gate.key]));
  const copyReply = async () => {
    if (!item || !generatedComment) return;
    try {
      await navigator.clipboard.writeText(generatedComment);
      onManualAction(item, { copied: true, taskStatus: "in_progress" }, selectedReplyAngle);
      pushToast(t("exposureRadar.manualAction.copied"));
    } catch {
      pushToast(t("exposureRadar.manualAction.copyFailed"));
    }
  };
  return (
    <Card className="border-[#1d9bf0]/20 bg-[#07111a]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#1d9bf0]/30 bg-black/30 px-3 py-1 text-xs font-semibold text-[#8ecdf8]">
            <Target className="size-3.5" />
            {t("exposureRadar.firstLoop.badge")}
          </span>
          <CardHeader title={t("exposureRadar.firstLoop.title")} description={t("exposureRadar.firstLoop.description")} className="mt-3 mb-0" />
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#2f3336] bg-black px-3 py-1 text-xs font-semibold text-[#8b98a5]">
          <Clock3 className="size-3.5" />
          {t(`exposureRadar.firstLoop.step.${stepKey}`)}
        </span>
      </div>
      {!item ? (
        <div className="mt-4 rounded-2xl border border-dashed border-[#2f3336] bg-black p-5">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.firstLoop.empty.title")}</p>
          <p className="mt-1 text-sm leading-6 text-[#8b98a5]">{t("exposureRadar.firstLoop.empty.description")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" onClick={onStartSample}>
              <Sparkles className="size-4" />
              {t("exposureRadar.sample.start")}
            </Button>
            <a href="#radar-setup" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#2f3336] px-3 text-sm font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
              {t("exposureRadar.firstLoop.empty.filters")}
              <ArrowRight className="size-4" />
            </a>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
            <div className="flex flex-wrap items-center gap-2">
              {usingSampleMode ? (
                <span className="rounded-full border border-[#7856ff]/25 bg-[#7856ff]/10 px-2 py-1 text-xs font-semibold text-[#c4b5fd]">{t("exposureRadar.sample.badge")}</span>
              ) : null}
              <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${qualityStageClass(normalizeQualityStage(item.quality_stage, item))}`}>
                {t(`exposureRadar.qualityStage.${normalizeQualityStage(item.quality_stage, item)}`)}
              </span>
              <span className="rounded-full border border-[#2f3336] bg-[#16181c] px-2 py-1 text-xs font-semibold text-[#8b98a5]">
                {item.score} {t("exposureRadar.card.score")}
              </span>
            </div>
            <h3 className="mt-3 line-clamp-2 text-lg font-semibold text-[#e7e9ea]">{item.title}</h3>
            {item.author_handle ? <p className="mt-1 text-xs text-[#71767b]">@{item.author_handle}</p> : null}
            <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#c9d1d9]">{item.content}</p>
            {priorityReasons.length ? (
              <div className="mt-4 rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
                <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.firstLoop.why.title")}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {priorityReasons.map((reason) => (
                    <span key={reason} className="inline-flex items-center gap-1.5 rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-2 py-1 text-[11px] font-semibold text-[#8ecdf8]">
                      <Info className="size-3" />
                      {reason}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            {replyAngles.length ? (
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                {replyAngles.slice(0, 2).map((angle) => (
                  <div key={angle.id} className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
                    <p className="text-xs font-semibold text-[#e7e9ea]">{angle.title}</p>
                    <p className="mt-1 text-[11px] leading-5 text-[#71767b]">{angle.description}</p>
                  </div>
                ))}
              </div>
            ) : null}
            {generatedComment ? (
              <div className="mt-4 rounded-xl border border-[#1d9bf0]/30 bg-[#07111a] p-3">
                <p className="text-xs font-semibold text-[#8ecdf8]">{t("exposureRadar.card.generatedComment")}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#e7e9ea]">{generatedComment}</p>
              </div>
            ) : null}
          </div>
          <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
            <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.firstLoop.actions.title")}</p>
            <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.firstLoop.actions.description")}</p>
            <div className="mt-4 space-y-2">
              <FirstLoopActionRow done={Boolean(generatedComment)} label={t("exposureRadar.firstLoop.actions.generate")} />
              <FirstLoopActionRow done={Boolean(manualState?.copied)} label={t("exposureRadar.firstLoop.actions.copy")} />
              <FirstLoopActionRow done={Boolean(manualState?.opened)} label={t("exposureRadar.firstLoop.actions.open")} />
              <FirstLoopActionRow done={handled} label={t("exposureRadar.firstLoop.actions.handle")} />
              <FirstLoopActionRow done={Boolean(manualState?.resultCheckedAt)} label={t("exposureRadar.firstLoop.actions.backfill")} />
            </div>
            {generatedComment ? (
              <PublishQualityGatePanel
                gates={gateItems}
                state={publishGateState}
                ready={gateReady}
                onToggle={(key, checked) => onTogglePublishGate(item.id, key, checked)}
              />
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              {generatedComment ? (
                <Button type="button" size="sm" onClick={() => void copyReply()}>
                  <Clipboard className="size-3.5" />
                  {t("exposureRadar.workbench.copyReply")}
                </Button>
              ) : (
                <Button type="button" size="sm" disabled={(!usingSampleMode && draftDisabled) || drafting || item.data_quality !== "tweet_level"} onClick={() => onCreateDraft(item, selectedReplyAngle)}>
                  {drafting ? <RefreshCw className="size-3.5 animate-spin" /> : <MessageSquarePlus className="size-3.5" />}
                  {drafting ? t("exposureRadar.card.drafting") : t("exposureRadar.card.createDraft")}
                </Button>
              )}
              {item.url ? (
                <a href={item.url} target="_blank" rel="noreferrer" onClick={() => onManualAction(item, { opened: true, taskStatus: "in_progress" }, selectedReplyAngle)} className="inline-flex h-8 items-center gap-1 rounded-full bg-[#1d9bf0] px-3 text-xs font-semibold text-white hover:bg-[#1a8cd8]">
                  {t("exposureRadar.card.openPost")}
                  <ExternalLink className="size-3.5" />
                </a>
              ) : null}
              <Button type="button" size="sm" variant="outline" disabled={handling || handled} onClick={() => void onMarkHandled(item, manualState?.publishedUrl || item.comment_url || "")}>
                {handling ? <RefreshCw className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                {handled ? t("exposureRadar.manualAction.handled") : t("exposureRadar.manualAction.markHandled")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => onFocusWorkbench(item.id)}>
                <Search className="size-3.5" />
                {t("exposureRadar.firstLoop.openFull")}
              </Button>
            </div>
            <p className="mt-3 text-xs leading-5 text-[#71767b]">
              {savedMemoryID !== 0 || manualState?.saved ? t("exposureRadar.firstLoop.memorySaved") : t("exposureRadar.firstLoop.memoryHint")}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

function FirstLoopActionRow({ done, label }: { done: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${done ? "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" : "border-[#2f3336] bg-[#0f1419] text-[#8b98a5]"}`}>
      {done ? <CheckCircle2 className="size-3.5" /> : <Clock3 className="size-3.5" />}
      <span className="font-semibold">{label}</span>
    </div>
  );
}

function FirstLoopCompletionPanel({ completedAt, recentRecords, timeZone }: { completedAt: string; recentRecords: ExposureRadarManualRecordApi[]; timeZone: string }) {
  const { t } = useT();
  const latestRecord = recentRecords.find((record) => record.result_checked_at || record.handled_at || record.task_status === "done");
  const completedLabel = completedAt ? formatDateTime(completedAt, timeZone) : latestRecord?.result_checked_at ? formatDateTime(latestRecord.result_checked_at, timeZone) : latestRecord?.handled_at ? formatDateTime(latestRecord.handled_at, timeZone) : "";
  const reviewCards = ["result", "angle", "memory"].map((key) => ({
    key,
    value: key === "result"
      ? latestRecord?.result_score ? String(latestRecord.result_score) : t("exposureRadar.firstLoopComplete.review.pending")
      : key === "angle"
        ? latestRecord?.reply_angle_title || t("exposureRadar.firstLoopComplete.review.pending")
        : latestRecord?.saved_memory_id ? `#${latestRecord.saved_memory_id}` : t("exposureRadar.firstLoopComplete.review.pending"),
  }));
  return (
    <div className="rounded-2xl border border-[#00ba7c]/25 bg-[#061a13] p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#00ba7c]/30 bg-black/30 px-3 py-1 text-xs font-semibold text-[#7ee0b5]">
            <CheckCircle2 className="size-3.5" />
            {t("exposureRadar.firstLoopComplete.badge")}
          </span>
          <p className="mt-3 text-base font-semibold text-[#e7e9ea]">{t("exposureRadar.firstLoopComplete.title")}</p>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#8b98a5]">{t("exposureRadar.firstLoopComplete.description")}</p>
          {completedLabel ? <p className="mt-2 text-xs text-[#71767b]">{t("exposureRadar.firstLoopComplete.completedAt", { time: completedLabel })}</p> : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <a href="#radar-results" className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#1d9bf0] px-3 text-sm font-semibold text-white hover:bg-[#1a8cd8]">
            {t("exposureRadar.firstLoopComplete.action.review")}
            <ArrowRight className="size-4" />
          </a>
          <a href="#radar-workbench" className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#2f3336] px-3 text-sm font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
            {t("exposureRadar.firstLoopComplete.action.next")}
            <Target className="size-4" />
          </a>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {reviewCards.map((card) => (
          <div key={card.key} className="rounded-xl border border-[#2f3336] bg-black/40 p-3">
            <p className="text-xs font-semibold text-[#e7e9ea]">{t(`exposureRadar.firstLoopComplete.review.${card.key}.title`)}</p>
            <p className="mt-1 text-[11px] leading-5 text-[#71767b]">{t(`exposureRadar.firstLoopComplete.review.${card.key}.description`)}</p>
            <p className="mt-2 truncate text-sm font-semibold text-[#7ee0b5]">{card.value}</p>
          </div>
        ))}
      </div>
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
  const avoidCount = people.filter((person) => person.stage === "avoid" || person.crmStage === "avoid").length;
  const playbook = buildPeopleRadarPlaybook(people, t);
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <CardHeader title={t("exposureRadar.peopleRadar.title")} description={t("exposureRadar.peopleRadar.description")} className="mb-0" />
        <div className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap">
          <ActionPlanMetric label={t("exposureRadar.peopleRadar.metric.people")} value={people.length} />
          <ActionPlanMetric label={t("exposureRadar.peopleRadar.metric.priority")} value={priorityCount} />
          <ActionPlanMetric label={t("exposureRadar.peopleRadar.metric.engaged")} value={engagedCount} />
          <ActionPlanMetric label={t("exposureRadar.peopleRadar.metric.avoid")} value={avoidCount} />
        </div>
      </div>
      <div className={`mt-4 rounded-2xl border p-4 ${peopleRadarPlaybookTone(playbook.tone)}`}>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Target className="size-4" />
          {playbook.title}
        </p>
        <p className="mt-2 text-xs leading-5 opacity-85">{playbook.detail}</p>
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
  const nextTouch = buildPeopleRadarNextTouch(person, t);
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
              <div className="mt-3 rounded-xl border border-[#1d9bf0]/20 bg-[#07111a] p-3">
                <p className="text-[11px] font-semibold text-[#8ecdf8]">{t("exposureRadar.peopleRadar.nextTouch")}</p>
                <p className="mt-1 text-xs leading-5 text-[#c9d1d9]">{nextTouch}</p>
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
  strategy,
  recentRecords,
  learningProfile,
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
  strategy: ExposureRadarGrowthStrategyApi | null;
  recentRecords: ExposureRadarManualRecordApi[];
  learningProfile: ExposureLearningProfile;
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
  const activeDecision = activeItem ? buildSignalDecisionSummary(activeItem, t) : null;
  const activeCredibility = activeItem ? buildSignalCredibility(activeItem, t) : null;
  const replyAngles = activeItem ? buildReplyAngleSuggestions(activeItem, t) : [];
  const selectedReplyAngle = replyAngles.find((angle) => angle.id === selectedReplyAngleIDs[activeItem?.id || ""]) || replyAngles[0];
  const selectedReplyPlan = activeItem && selectedReplyAngle ? buildReplyPlan(activeItem, selectedReplyAngle, t) : null;
  const memoryReplyCues = activeItem ? buildMemoryReplyCues(activeItem, strategy, learningProfile, recentRecords, selectedReplyAngle, t) : [];
  const safetyReview = activeItem ? buildSafetyReview(activeItem, selectedReplyAngle, t) : null;
  const replyQuality = activeItem ? buildReplyQualityScore(activeItem, selectedReplyAngle, activeItem.generated_comment || "") : null;
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
            {activeDecision && activeCredibility ? <OpportunityDecisionBrief item={activeItem} summary={activeDecision} credibility={activeCredibility} replyAngle={selectedReplyAngle} /> : null}
            {activeDecision ? <SignalDecisionCard summary={activeDecision} /> : null}
            {activeCredibility ? <SignalCredibilityPanel credibility={activeCredibility} /> : null}
            {activeExplanation ? <OpportunityExplanationPanel explanation={activeExplanation} /> : null}
            {replyAngles.length ? (
              <ReplyAngleSuggestionsPanel
                suggestions={replyAngles}
                selectedID={selectedReplyAngle?.id || ""}
                onSelect={(angleID) => onSelectReplyAngle(activeItem.id, angleID)}
              />
            ) : null}
            <MemoryDrivenReplyPanel cues={memoryReplyCues} />
            {selectedReplyPlan && selectedReplyAngle ? <ReplyPlanCard plan={selectedReplyPlan} replyAngle={selectedReplyAngle} /> : null}
            {safetyReview ? <SafetyReviewPanel review={safetyReview} /> : null}
            {replyQuality ? <ReplyQualityPanel quality={replyQuality} /> : null}
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
  const neutralCount = outcomes.filter((state) => state.outcome === "neutral").length;
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
        <LearningFeedbackCard effectiveCount={effectiveCount} neutralCount={neutralCount} negativeCount={negativeCount} />
        <BoostedSignalsCard items={boosted} />
        <LearningControlsCard controls={controls} topTopics={topTopics} />
        <LearningImpactCard rows={impactRows} />
      </div>
    </Card>
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
      <ArchivePanelHeader rangeDays={data?.range_days || 7} generatedAt={data?.generated_at} region={data?.region} timeZone={timeZone} />
      <ArchiveTotalsMetrics totals={totals} />
      <div className="mt-4 space-y-2">
        {days.length ? days.map((day) => (
          <ArchiveDayRow key={`${day.date_key}:${day.region}`} day={day} dateLabel={formatArchiveDate(day.date_key, timeZone)} />
        )) : (
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
  const generatedComment = item.generated_comment?.trim() || "";
  const canDraft = item.data_quality === "tweet_level" && !draftDisabled;
  const velocityState = normalizeVelocityState(item.velocity_state, item.status);
  const opportunityTier = normalizeOpportunityTier(item.opportunity_tier);
  const qualityStage = normalizeQualityStage(item.quality_stage, item);
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
    if (isSampleRadarItem(item)) {
      const resolvedURL = nextURL || item.url || "";
      if (resolvedURL) setPublishedURL(resolvedURL);
      onManualAction(buildSampleResolvedResultPatch(resolvedURL, handledDone));
      pushToast(t("exposureRadar.sample.toast.resultSaved"));
      return;
    }
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
      const { patch, resolvedURL } = buildResolvedManualResultPatch(result, nextURL, handledDone);
      if (resolvedURL) {
        setPublishedURL(resolvedURL);
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
      <RadarCardBadges item={item} rank={rank} rankChange={rankChange} savedMemoryID={savedMemoryID} handledDone={handledDone} />
      <RadarCardHeader item={item} />
      <RadarCardPrimaryMetrics item={item} />
      <RadarCardPublicMetrics item={item} />
      <RadarCardVelocityTrend item={item} />
      <SignalDecisionCard summary={buildSignalDecisionSummary(item, t)} />
      <SignalCredibilityPanel credibility={buildSignalCredibility(item, t)} compact />
      <RadarCardRecommendedUse item={item} />
      <RadarCardGeneratedCommentBlock
        generatedComment={generatedComment}
        workflow={(
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
        )}
        record={(
          <ManualHandlingRecord
            key={`${item.id}:${manualResultFormKey(manualState)}`}
            item={item}
            manualState={manualState}
            timeZone={timeZone}
            feedbackSaving={feedbackSaving}
            onSubmitFeedback={(outcome, comment) => onSubmitFeedback(item, outcome, comment)}
            onSubmitResult={(result) => onSubmitResult(item, result)}
          />
        )}
      />
      <RadarCardActionFooter
        item={item}
        timeZone={timeZone}
        generatedComment={generatedComment}
        canDraft={canDraft}
        drafting={drafting}
        savedMemoryID={savedMemoryID}
        memoryAccountID={memoryAccountID}
        memoryDisabled={memoryDisabled}
        savingMemory={savingMemory}
        savingSeed={savingSeed}
        generatingSeedDraft={generatingSeedDraft}
        onCopyComment={copyComment}
        onOpenPost={() => onManualAction({ opened: true, taskStatus: "in_progress" })}
        onCreateDraft={() => onCreateDraft(item)}
        onSaveMemory={() => onSaveMemory(item)}
        onSaveContentSeed={() => onSaveContentSeed(item)}
        onGenerateContentDraft={() => onGenerateContentDraft(item)}
      />
    </article>
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

function buildAccountHealthScore({
  selectedAccountID,
  selectedBotID,
  strategy,
  data,
  items,
  recentRecords,
  safety,
  stats,
  loadState,
  t,
}: {
  selectedAccountID: number;
  selectedBotID: number;
  strategy: ExposureRadarGrowthStrategyApi | null;
  data: ExposureRadarData | null;
  items: ExposureRadarItemApi[];
  recentRecords: ExposureRadarManualRecordApi[];
  safety: ExposureRadarSafetyCenterData | null;
  stats: WorkbenchStats;
  loadState: LoadState;
  t: (key: string, params?: Record<string, string | number>) => string;
}): AccountHealthScore {
  const strategyReady = Boolean(strategy?.target_audience || strategy?.core_topics?.length);
  const tweetLevelCount = items.filter((item) => item.data_quality === "tweet_level").length;
  const safetyWarnings = (safety?.watch_count || 0) + (safety?.block_count || 0);
  const recentHandled = recentRecords.filter((record) => isRecentManualRecord(record, 24) && (record.handled_at || record.task_status === "done")).length;
  const pendingBackfill = recentRecords.filter((record) => (record.handled_at || record.task_status === "done") && !record.result_checked_at && !record.result_score).length;
  const dailyLimit = Math.max(1, strategy?.daily_move_limit || 8);
  const checks = [
    { key: "setup", pass: selectedAccountID > 0 && selectedBotID > 0, value: selectedAccountID > 0 && selectedBotID > 0 ? t("exposureRadar.healthScore.value.ready") : t("exposureRadar.healthScore.value.missing") },
    { key: "strategy", pass: strategyReady, value: strategyReady ? strategy?.primary_goal || t("exposureRadar.healthScore.value.ready") : t("exposureRadar.healthScore.value.missing") },
    { key: "data", pass: loadState === "ready" && tweetLevelCount > 0, value: t("exposureRadar.healthScore.value.tweetLevel", { count: tweetLevelCount }) },
    { key: "pace", pass: recentHandled <= dailyLimit && stats.pending > 0, value: t("exposureRadar.healthScore.value.pace", { handled: recentHandled, limit: dailyLimit }) },
    { key: "safety", pass: safetyWarnings === 0, value: t("exposureRadar.healthScore.value.safety", { count: safetyWarnings }) },
    { key: "backfill", pass: pendingBackfill <= 3, value: t("exposureRadar.healthScore.value.backfill", { count: pendingBackfill }) },
  ];
  let score = 100;
  if (!checks[0].pass) score -= 20;
  if (!checks[1].pass) score -= 15;
  if (!checks[2].pass) score -= data?.diagnostics?.topic_level_count ? 10 : 18;
  if (!checks[3].pass) score -= 12;
  if (!checks[4].pass) score -= Math.min(25, 8 + safetyWarnings * 4);
  if (!checks[5].pass) score -= 10;
  score = Math.max(0, Math.min(100, score));
  return {
    score,
    status: score >= 82 ? "healthy" : score >= 60 ? "watch" : "risk",
    checks,
  };
}

function buildGrowthExperiments({
  items,
  moves,
  recentRecords,
  learningProfile,
  safety,
  t,
}: {
  items: ExposureRadarItemApi[];
  moves: DailyActionPlanItem[];
  recentRecords: ExposureRadarManualRecordApi[];
  learningProfile: ExposureLearningProfile;
  safety: ExposureRadarSafetyCenterData | null;
  t: (key: string, params?: Record<string, string | number>) => string;
}): GrowthExperiment[] {
  const learnedTopic = Array.from(learningProfile.boostedTopics)[0] || topRecordLabels(recentRecords, "topic_name", 1)[0] || items[0]?.topic_name || t("exposureRadar.experimentPanel.fallback.topic");
  const preferredAngle = Array.from(learningProfile.preferredAngles)[0] || "operatorObservation";
  const readyMoves = moves.filter((entry) => entry.item.data_quality === "tweet_level").slice(0, 3);
  const safetyWarnings = (safety?.watch_count || 0) + (safety?.block_count || 0);
  return [
    {
      key: "angle",
      title: t("exposureRadar.experimentPanel.angle.title"),
      hypothesis: t("exposureRadar.experimentPanel.angle.hypothesis", { angle: preferredAngleLabel(preferredAngle, t) }),
      action: readyMoves.length
        ? t("exposureRadar.experimentPanel.angle.action", { count: readyMoves.length })
        : t("exposureRadar.experimentPanel.angle.actionEmpty"),
      metric: t("exposureRadar.experimentPanel.angle.metric"),
      tone: "blue",
    },
    {
      key: "topic",
      title: t("exposureRadar.experimentPanel.topic.title"),
      hypothesis: t("exposureRadar.experimentPanel.topic.hypothesis", { topic: learnedTopic }),
      action: t("exposureRadar.experimentPanel.topic.action"),
      metric: t("exposureRadar.experimentPanel.topic.metric"),
      tone: "green",
    },
    {
      key: "safety",
      title: t("exposureRadar.experimentPanel.safety.title"),
      hypothesis: safetyWarnings > 0
        ? t("exposureRadar.experimentPanel.safety.hypothesisWatch", { count: safetyWarnings })
        : t("exposureRadar.experimentPanel.safety.hypothesisClean"),
      action: t("exposureRadar.experimentPanel.safety.action"),
      metric: t("exposureRadar.experimentPanel.safety.metric"),
      tone: safetyWarnings > 0 ? "amber" : "green",
    },
  ];
}

function preferredAngleLabel(angleID: string, t: (key: string, params?: Record<string, string | number>) => string) {
  if (["operatorObservation", "lightQuestion", "peerExperience", "cautionNote", "topicResearch"].includes(angleID)) {
    return t(`exposureRadar.replyAngles.${angleID}.title`);
  }
  return angleID;
}

function buildWeeklyOperatorReport({
  weeklyReview,
  recentRecords,
  moves,
  learningProfile,
  safety,
  timeZone,
  t,
}: {
  weeklyReview: ExposureRadarWeeklyReviewData | null;
  recentRecords: ExposureRadarManualRecordApi[];
  moves: DailyActionPlanItem[];
  learningProfile: ExposureLearningProfile;
  safety: ExposureRadarSafetyCenterData | null;
  timeZone: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const handled = weeklyReview?.handled_count || recentRecords.filter((record) => record.handled_at || record.task_status === "done").length;
  const effective = weeklyReview?.effective_count || recentRecords.filter((record) => record.outcome === "effective").length;
  const negative = weeklyReview?.negative_count || recentRecords.filter((record) => record.outcome === "ineffective" || record.outcome === "not_suitable").length;
  const recommendations = weeklyReview?.recommendations?.length ? weeklyReview.recommendations : buildWeeklyFallbackRecommendations(learningProfile, safety, t);
  return [
    t("exposureRadar.weeklyOps.report.title"),
    t("exposureRadar.weeklyOps.report.summary", { handled, effective, negative, ready: moves.length }),
    t("exposureRadar.weeklyOps.report.generated", { time: formatDateTime(new Date().toISOString(), timeZone) }),
    "",
    t("exposureRadar.weeklyOps.report.recommendations"),
    ...recommendations.map((item) => `- ${item}`),
  ].join("\n");
}

function buildWeeklyFallbackRecommendations(learningProfile: ExposureLearningProfile, safety: ExposureRadarSafetyCenterData | null, t: (key: string, params?: Record<string, string | number>) => string) {
  const recommendations = [
    t("exposureRadar.weeklyOps.fallback.backfill"),
    t("exposureRadar.weeklyOps.fallback.smallBatch"),
  ];
  const topic = Array.from(learningProfile.boostedTopics)[0];
  if (topic) recommendations.unshift(t("exposureRadar.weeklyOps.fallback.topic", { topic }));
  if ((safety?.watch_count || 0) + (safety?.block_count || 0) > 0) recommendations.unshift(t("exposureRadar.weeklyOps.fallback.safety"));
  return recommendations.slice(0, 4);
}

function topRecordLabels(records: ExposureRadarManualRecordApi[], field: "topic_name" | "reply_angle_title" | "author_handle", limit: number) {
  const counts = new Map<string, number>();
  records.forEach((record) => {
    const label = record[field];
    if (!label) return;
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => `${label} · ${count}`);
}

function buildReplyQualityScore(item: ExposureRadarItemApi, replyAngle: ReplyAngleSuggestion | undefined, generated: string): ReplyQualityScore {
  const checks = [
    { key: "context", pass: item.data_quality === "tweet_level" },
    { key: "angle", pass: Boolean(replyAngle) },
    { key: "length", pass: !generated || generated.length <= 240 },
    { key: "noPitch", pass: !generated || !hasPromotionalSmell(generated) },
  ];
  const score = Math.round((checks.filter((check) => check.pass).length / checks.length) * 100);
  const status = checks[0].pass ? (score >= 75 ? "ready" : "needs_edit") : "research";
  return { score, status, checks };
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

function buildSignalCredibility(item: ExposureRadarItemApi, t: (key: string, params?: Record<string, string | number>) => string): SignalCredibility {
  const hasViews = typeof item.impression_count === "number" && item.impression_count > 0;
  const hasVelocity = typeof item.views_per_min === "number" && item.views_per_min > 0;
  const hasAuthor = typeof item.followers_count === "number" && item.followers_count > 0;
  const hasEngagement = publicEngagementCount(item) > 0;
  const hasSecondSample = (item.velocity_history || []).filter((value) => Number.isFinite(value)).length >= 2;
  const realImpressions = normalizeDataConfidence(item.data_confidence, item.data_quality) === "real_impressions";
  let score = 0;
  if (item.data_quality === "tweet_level") score += 24;
  if (realImpressions || hasViews) score += 22;
  if (hasVelocity) score += 18;
  if (hasSecondSample) score += 12;
  if (hasAuthor) score += 10;
  if (hasEngagement) score += 8;
  if (item.quality_reason || item.ranking_reason) score += 6;
  if (item.data_quality === "topic_level") score = Math.min(score, 38);
  score = Math.max(0, Math.min(100, score));
  const status: SignalCredibilityStatus = score >= 78 ? "strong" : score >= 58 ? "usable" : score >= 38 ? "thin" : "weak";
  const proof = [
    item.data_quality === "tweet_level" ? t("exposureRadar.credibility.proof.tweet") : "",
    hasViews ? t("exposureRadar.credibility.proof.views", { views: formatCompact(item.impression_count || 0) }) : "",
    hasVelocity ? t("exposureRadar.credibility.proof.velocity", { speed: formatVelocityLabel(item.views_per_min, "0/min") }) : "",
    hasSecondSample ? t("exposureRadar.credibility.proof.resampled") : "",
    hasAuthor ? t("exposureRadar.credibility.proof.author", { followers: formatCompact(item.followers_count || 0) }) : "",
    hasEngagement ? t("exposureRadar.credibility.proof.engagement", { count: formatCompact(publicEngagementCount(item)) }) : "",
  ].filter(Boolean).slice(0, 4);
  const missing = [
    item.data_quality !== "tweet_level" ? t("exposureRadar.credibility.missing.tweet") : "",
    !hasViews ? t("exposureRadar.credibility.missing.views") : "",
    !hasVelocity ? t("exposureRadar.credibility.missing.velocity") : "",
    !hasSecondSample ? t("exposureRadar.credibility.missing.resample") : "",
    !hasAuthor ? t("exposureRadar.credibility.missing.author") : "",
  ].filter(Boolean).slice(0, 4);
  return {
    status,
    score,
    proof,
    missing,
    nextStep: t(`exposureRadar.credibility.next.${status}`),
  };
}

function buildMemoryReplyCues(
  item: ExposureRadarItemApi,
  strategy: ExposureRadarGrowthStrategyApi | null,
  learningProfile: ExposureLearningProfile,
  recentRecords: ExposureRadarManualRecordApi[],
  selectedReplyAngle: ReplyAngleSuggestion | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
): MemoryReplyCue[] {
  const topicKey = exposureLearningTopicKey(item.topic_name || item.title);
  const coreTopics = (strategy?.core_topics || []).slice(0, 3);
  const avoidTopics = (strategy?.avoid_topics || []).slice(0, 3);
  const learnedAngle = selectedReplyAngle && learningProfile.preferredAngles.has(selectedReplyAngle.id);
  const similarRecord = recentRecords.find((record) => exposureLearningTopicKey(record.topic_name || record.title) === topicKey && (record.result_score || 0) >= 40);
  return [
    {
      key: "persona",
      title: t("exposureRadar.memoryReply.cue.persona.title"),
      detail: strategy?.target_audience
        ? t("exposureRadar.memoryReply.cue.persona.detail", { audience: strategy.target_audience })
        : t("exposureRadar.memoryReply.cue.persona.empty"),
      tone: strategy?.target_audience ? "blue" : "amber",
    },
    {
      key: "topics",
      title: t("exposureRadar.memoryReply.cue.topics.title"),
      detail: coreTopics.length
        ? t("exposureRadar.memoryReply.cue.topics.detail", { topics: coreTopics.join(", ") })
        : t("exposureRadar.memoryReply.cue.topics.empty"),
      tone: coreTopics.length ? "green" : "neutral",
    },
    {
      key: "angle",
      title: t("exposureRadar.memoryReply.cue.angle.title"),
      detail: selectedReplyAngle
        ? t(learnedAngle ? "exposureRadar.memoryReply.cue.angle.learned" : "exposureRadar.memoryReply.cue.angle.detail", { angle: selectedReplyAngle.title })
        : t("exposureRadar.memoryReply.cue.angle.empty"),
      tone: learnedAngle ? "green" : "blue",
    },
    {
      key: "boundary",
      title: t("exposureRadar.memoryReply.cue.boundary.title"),
      detail: avoidTopics.length
        ? t("exposureRadar.memoryReply.cue.boundary.detail", { topics: avoidTopics.join(", ") })
        : t("exposureRadar.memoryReply.cue.boundary.empty"),
      tone: avoidTopics.length || item.risk_level === "medium" || item.risk_level === "high" ? "amber" : "neutral",
    },
    {
      key: "history",
      title: t("exposureRadar.memoryReply.cue.history.title"),
      detail: similarRecord
        ? t("exposureRadar.memoryReply.cue.history.detail", { score: similarRecord.result_score || 0, views: formatCompact(similarRecord.result_impression_count || 0) })
        : t("exposureRadar.memoryReply.cue.history.empty"),
      tone: similarRecord ? "green" : "neutral",
    },
  ];
}

function buildResultLearningMoves({
  data,
  moves,
  recentRecords,
  weeklyReview,
  safety,
  learningProfile,
  t,
}: {
  data: ExposureRadarData | null;
  moves: DailyActionPlanItem[];
  recentRecords: ExposureRadarManualRecordApi[];
  weeklyReview: ExposureRadarWeeklyReviewData | null;
  safety: ExposureRadarSafetyCenterData | null;
  learningProfile: ExposureLearningProfile;
  t: (key: string, params?: Record<string, string | number>) => string;
}): ResultLearningMove[] {
  const pendingBackfill = recentRecords.filter((record) => (record.handled_at || record.task_status === "done" || record.published_url) && !record.result_checked_at && !record.result_score).length;
  const best = bestExposureResultRecord(recentRecords);
  const boostedTopic = Array.from(learningProfile.boostedTopics)[0];
  const cautiousTopic = Array.from(learningProfile.cautiousTopics)[0];
  const warnings = (safety?.watch_count || 0) + (safety?.block_count || 0);
  const nextMove = moves[0]?.item;
  const actions: ResultLearningMove[] = [];
  if (pendingBackfill > 0) {
    actions.push({
      key: "backfill",
      title: t("exposureRadar.learningLoop.action.backfill.title"),
      detail: t("exposureRadar.learningLoop.action.backfill.detail", { count: pendingBackfill }),
      tone: "warning",
    });
  }
  if (best) {
    actions.push({
      key: "best",
      title: t("exposureRadar.learningLoop.action.best.title"),
      detail: t("exposureRadar.learningLoop.action.best.detail", { title: compactTitle(best.title || best.topic_name || best.signal_id), score: best.result_score || 0, views: formatCompact(best.result_impression_count || 0) }),
      tone: "positive",
    });
  }
  if (boostedTopic) {
    actions.push({
      key: "boosted",
      title: t("exposureRadar.learningLoop.action.boosted.title"),
      detail: t("exposureRadar.learningLoop.action.boosted.detail", { topic: boostedTopic }),
      tone: "positive",
    });
  }
  if (cautiousTopic || warnings > 0) {
    actions.push({
      key: "caution",
      title: t("exposureRadar.learningLoop.action.caution.title"),
      detail: cautiousTopic ? t("exposureRadar.learningLoop.action.caution.topic", { topic: cautiousTopic }) : t("exposureRadar.learningLoop.action.caution.safety", { count: warnings }),
      tone: "warning",
    });
  }
  if (nextMove) {
    actions.push({
      key: "next",
      title: t("exposureRadar.learningLoop.action.next.title"),
      detail: t("exposureRadar.learningLoop.action.next.detail", { title: compactTitle(nextMove.title), score: nextMove.score }),
      tone: "neutral",
    });
  }
  if (data?.diagnostics?.top_missing_reason && actions.length < 3) {
    actions.push({
      key: "diagnostic",
      title: t("exposureRadar.learningLoop.action.diagnostic.title"),
      detail: t("exposureRadar.learningLoop.action.diagnostic.detail", { reason: data.diagnostics.top_missing_reason }),
      tone: "neutral",
    });
  }
  if (!actions.length) {
    actions.push({
      key: "default",
      title: t("exposureRadar.learningLoop.action.default.title"),
      detail: weeklyReview ? t("exposureRadar.learningLoop.action.default.review", { rate: Math.round((weeklyReview.effective_rate || 0) * 100) }) : t("exposureRadar.learningLoop.action.default.detail"),
      tone: "neutral",
    });
  }
  return actions.slice(0, 3);
}

function buildResultLearningSummary({
  moves,
  recentRecords,
  weeklyReview,
  safety,
  learningProfile,
  pendingBackfill,
  t,
}: {
  moves: DailyActionPlanItem[];
  recentRecords: ExposureRadarManualRecordApi[];
  weeklyReview: ExposureRadarWeeklyReviewData | null;
  safety: ExposureRadarSafetyCenterData | null;
  learningProfile: ExposureLearningProfile;
  pendingBackfill: number;
  t: (key: string, params?: Record<string, string | number>) => string;
}): ResultLearningSummary {
  const best = bestExposureResultRecord(recentRecords);
  const boostedTopic = Array.from(learningProfile.boostedTopics)[0];
  const cautiousTopic = Array.from(learningProfile.cautiousTopics)[0];
  const warnings = (safety?.watch_count || 0) + (safety?.block_count || 0);
  const effectiveRate = weeklyReview ? Math.round((weeklyReview.effective_rate || 0) * 100) : 0;

  if (pendingBackfill > 0) {
    return {
      key: "summary-backfill",
      title: t("exposureRadar.learningLoop.summary.backfill.title"),
      detail: t("exposureRadar.learningLoop.summary.backfill.detail", { count: pendingBackfill }),
      tone: "warning",
    };
  }
  if (best || boostedTopic) {
    return {
      key: "summary-repeat",
      title: t("exposureRadar.learningLoop.summary.repeat.title"),
      detail: best
        ? t("exposureRadar.learningLoop.summary.repeat.best", { title: compactTitle(best.title || best.topic_name || best.signal_id), score: best.result_score || 0 })
        : t("exposureRadar.learningLoop.summary.repeat.topic", { topic: boostedTopic || "" }),
      tone: "positive",
    };
  }
  if (cautiousTopic || warnings > 0) {
    return {
      key: "summary-caution",
      title: t("exposureRadar.learningLoop.summary.caution.title"),
      detail: cautiousTopic
        ? t("exposureRadar.learningLoop.summary.caution.topic", { topic: cautiousTopic })
        : t("exposureRadar.learningLoop.summary.caution.safety", { count: warnings }),
      tone: "warning",
    };
  }
  return {
    key: "summary-default",
    title: t("exposureRadar.learningLoop.summary.default.title"),
    detail: weeklyReview
      ? t("exposureRadar.learningLoop.summary.default.rate", { rate: effectiveRate, count: moves.length })
      : t("exposureRadar.learningLoop.summary.default.detail", { count: moves.length }),
    tone: "neutral",
  };
}

function resultLearningTone(tone: ResultLearningMove["tone"]) {
  switch (tone) {
    case "positive":
      return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
    case "warning":
      return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
    default:
      return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  }
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

function buildDailyOperatingGoals(
  strategy: ExposureRadarGrowthStrategyApi | null,
  stats: WorkbenchStats,
  items: ExposureRadarItemApi[],
  manualActionStates: Record<string, ManualActionState>,
  savedMemoryIDs: Set<string>,
  recentRecords: ExposureRadarManualRecordApi[],
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  const dailyLimit = Math.max(4, Math.min(20, strategy?.daily_move_limit || 8));
  const reviewTarget = Math.max(3, Math.min(6, Math.ceil(dailyLimit / 2)));
  const handleTarget = Math.max(1, Math.min(3, Math.ceil(dailyLimit / 4)));
  const saveTarget = 1;
  const backfillTarget = 1;
  const reviewedCount = items.filter((item) => {
    const state = manualActionStates[item.id];
    return Boolean(state?.opened || state?.copied || state?.saved || state?.handled || item.generated_comment || item.review_task_id);
  }).length;
  const handledCount = Math.max(stats.handled, items.filter((item) => isManualActionHandled(item, manualActionStates[item.id])).length);
  const savedCount = items.filter((item) => isRadarItemSaved(item, savedMemoryIDs) || manualActionStates[item.id]?.saved).length;
  const backfilledCount = items.filter((item) => manualActionStates[item.id]?.resultCheckedAt).length + recentRecords.filter((record) => record.result_checked_at || record.result_score).length;
  return [
    {
      key: "review",
      icon: <Search className="size-4" />,
      title: t("exposureRadar.dailyGoals.review.title"),
      description: t("exposureRadar.dailyGoals.review.description"),
      done: Math.min(reviewedCount, reviewTarget),
      target: reviewTarget,
    },
    {
      key: "handle",
      icon: <MessageCircle className="size-4" />,
      title: t("exposureRadar.dailyGoals.handle.title"),
      description: t("exposureRadar.dailyGoals.handle.description"),
      done: Math.min(handledCount, handleTarget),
      target: handleTarget,
    },
    {
      key: "save",
      icon: <BookmarkPlus className="size-4" />,
      title: t("exposureRadar.dailyGoals.save.title"),
      description: t("exposureRadar.dailyGoals.save.description"),
      done: Math.min(savedCount, saveTarget),
      target: saveTarget,
    },
    {
      key: "backfill",
      icon: <BarChart3 className="size-4" />,
      title: t("exposureRadar.dailyGoals.backfill.title"),
      description: t("exposureRadar.dailyGoals.backfill.description"),
      done: Math.min(backfilledCount, backfillTarget),
      target: backfillTarget,
    },
  ];
}

function buildPriorityReasonChips(item: ExposureRadarItemApi, t: (key: string, params?: Record<string, string | number>) => string) {
  const qualityStage = normalizeQualityStage(item.quality_stage, item);
  const tier = normalizeOpportunityTier(item.opportunity_tier);
  return [
    item.score >= 80 ? t("exposureRadar.firstLoop.why.highScore", { score: item.score }) : "",
    qualityStage === "act_now" ? t("exposureRadar.firstLoop.why.actNow") : "",
    tier === "hot_opportunity" || tier === "rising_opportunity" ? t(`exposureRadar.firstLoop.why.${tier}`) : "",
    typeof item.views_per_min === "number" && item.views_per_min > 0 ? t("exposureRadar.firstLoop.why.velocity", { speed: formatOneDecimal(item.views_per_min) }) : "",
    typeof item.impression_count === "number" && item.impression_count > 0 ? t("exposureRadar.firstLoop.why.views", { views: formatCompact(item.impression_count) }) : "",
    typeof item.followers_count === "number" && item.followers_count > 0 && item.followers_count <= 10000 ? t("exposureRadar.firstLoop.why.smallAuthor", { fans: formatCompact(item.followers_count) }) : "",
    item.risk_level === "low" ? t("exposureRadar.firstLoop.why.lowRisk") : "",
  ].filter(Boolean).slice(0, 4);
}

function buildPublishGateItems(
  item: ExposureRadarItemApi,
  generatedComment: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): Array<{ key: PublishGateKey; title: string; detail: string }> {
  return [
    {
      key: "context",
      title: t("exposureRadar.publishGate.context.title"),
      detail: item.author_handle ? t("exposureRadar.publishGate.context.detailWithAuthor", { author: `@${item.author_handle}` }) : t("exposureRadar.publishGate.context.detail"),
    },
    {
      key: "persona",
      title: t("exposureRadar.publishGate.persona.title"),
      detail: t("exposureRadar.publishGate.persona.detail"),
    },
    {
      key: "nonPromo",
      title: t("exposureRadar.publishGate.nonPromo.title"),
      detail: hasPromotionalSmell(generatedComment) ? t("exposureRadar.publishGate.nonPromo.warning") : t("exposureRadar.publishGate.nonPromo.detail"),
    },
    {
      key: "claim",
      title: t("exposureRadar.publishGate.claim.title"),
      detail: hasRiskyGrowthClaim(generatedComment) ? t("exposureRadar.publishGate.claim.warning") : t("exposureRadar.publishGate.claim.detail"),
    },
  ];
}

function buildPreflightChecks({
  selectedAccountID,
  selectedBotID,
  strategy,
  data,
  items,
  stats,
  recentRecords,
  usingSampleMode,
  t,
}: {
  selectedAccountID: number;
  selectedBotID: number;
  strategy: ExposureRadarGrowthStrategyApi | null;
  data: ExposureRadarData | null;
  items: ExposureRadarItemApi[];
  stats: WorkbenchStats;
  recentRecords: ExposureRadarManualRecordApi[];
  usingSampleMode: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const strategyReady = Boolean(strategy?.target_audience || strategy?.core_topics?.length);
  const dailyLimit = Math.max(4, Math.min(20, strategy?.daily_move_limit || 8));
  const handledToday = recentRecords.filter((record) => isRecentManualRecord(record, 24) && (record.handled_at || record.task_status === "done")).length;
  const dataStatus = data?.diagnostics?.status || data?.source_status || "";
  const accountStatus: SafetyReviewStatus = selectedAccountID && selectedBotID ? "pass" : "block";
  const strategyStatus: SafetyReviewStatus = strategyReady ? "pass" : "watch";
  const signalStatus: SafetyReviewStatus = usingSampleMode || items.length > 0 ? "pass" : dataStatus === "blocked" ? "block" : "watch";
  const volumeStatus: SafetyReviewStatus = handledToday > dailyLimit ? "block" : stats.pending > dailyLimit * 2 ? "watch" : "pass";
  return [
    {
      key: "context",
      status: accountStatus,
      icon: <Users className="size-4" />,
      title: t("exposureRadar.preflight.context.title"),
      detail: t(`exposureRadar.preflight.context.${accountStatus}`),
    },
    {
      key: "strategy",
      status: strategyStatus,
      icon: <Target className="size-4" />,
      title: t("exposureRadar.preflight.strategy.title"),
      detail: t(`exposureRadar.preflight.strategy.${strategyStatus}`),
    },
    {
      key: "signals",
      status: signalStatus,
      icon: <Search className="size-4" />,
      title: t("exposureRadar.preflight.signals.title"),
      detail: usingSampleMode ? t("exposureRadar.preflight.signals.sample") : t(`exposureRadar.preflight.signals.${signalStatus}`, { count: items.length }),
    },
    {
      key: "volume",
      status: volumeStatus,
      icon: <Gauge className="size-4" />,
      title: t("exposureRadar.preflight.volume.title"),
      detail: t(`exposureRadar.preflight.volume.${volumeStatus}`, { handled: handledToday, limit: dailyLimit }),
    },
  ];
}

function buildOperatorScratchpadSuggestions(
  item: ExposureRadarItemApi | undefined,
  manualState: ManualActionState | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  if (!item) {
    return [
      t("exposureRadar.scratchpad.suggestion.strategy"),
      t("exposureRadar.scratchpad.suggestion.sample"),
      t("exposureRadar.scratchpad.suggestion.refresh"),
    ];
  }
  const topic = compactTitle(item.topic_name || item.title);
  return [
    item.generated_comment ? t("exposureRadar.scratchpad.suggestion.copy", { topic }) : t("exposureRadar.scratchpad.suggestion.inspect", { topic }),
    manualState?.handled ? t("exposureRadar.scratchpad.suggestion.backfill", { topic }) : t("exposureRadar.scratchpad.suggestion.handle", { topic }),
    t("exposureRadar.scratchpad.suggestion.memory", { topic }),
  ];
}

function buildNextSessionCarryovers(
  items: ExposureRadarItemApi[],
  manualActionStates: Record<string, ManualActionState>,
  sessionFocus: SessionFocusKey,
  operatorNote: string,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  const byPriority = [...items].sort((a, b) => b.score - a.score);
  const needsBackfill = byPriority.find((item) => isManualActionHandled(item, manualActionStates[item.id]) && !manualActionStates[item.id]?.resultCheckedAt);
  const needsMemory = byPriority.find((item) => (item.generated_comment || manualActionStates[item.id]?.handled) && !manualActionStates[item.id]?.saved && !item.saved_memory_id);
  const nextOpportunity = byPriority.find((item) => !isManualActionHandled(item, manualActionStates[item.id]));
  return [
    {
      key: "focus",
      icon: <Target className="size-4" />,
      title: t("exposureRadar.carryover.focus.title"),
      detail: t(`exposureRadar.carryover.focus.${sessionFocus}`),
    },
    {
      key: "backfill",
      icon: <BarChart3 className="size-4" />,
      title: t("exposureRadar.carryover.backfill.title"),
      detail: needsBackfill ? t("exposureRadar.carryover.backfill.detail", { signal: compactTitle(needsBackfill.title) }) : t("exposureRadar.carryover.backfill.empty"),
      itemID: needsBackfill?.id,
    },
    {
      key: "next",
      icon: needsMemory ? <BookmarkPlus className="size-4" /> : <MessageCircle className="size-4" />,
      title: needsMemory ? t("exposureRadar.carryover.memory.title") : t("exposureRadar.carryover.next.title"),
      detail: needsMemory
        ? t("exposureRadar.carryover.memory.detail", { signal: compactTitle(needsMemory.title) })
        : nextOpportunity
          ? t("exposureRadar.carryover.next.detail", { signal: compactTitle(nextOpportunity.title) })
          : operatorNote.trim()
            ? t("exposureRadar.carryover.next.note")
            : t("exposureRadar.carryover.next.empty"),
      itemID: needsMemory?.id || nextOpportunity?.id,
    },
  ];
}

function buildDailyRecapText({
  items,
  stats,
  manualActionStates,
  recentRecords,
  operatorNote,
  usingSampleMode,
  timeZone,
  t,
}: {
  items: ExposureRadarItemApi[];
  stats: WorkbenchStats;
  manualActionStates: Record<string, ManualActionState>;
  recentRecords: ExposureRadarManualRecordApi[];
  operatorNote: string;
  usingSampleMode: boolean;
  timeZone: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const reviewed = items.filter((item) => {
    const state = manualActionStates[item.id];
    return Boolean(state?.opened || state?.copied || state?.saved || state?.handled || item.generated_comment || item.review_task_id);
  }).length;
  const saved = items.filter((item) => isRadarItemSaved(item, new Set()) || manualActionStates[item.id]?.saved).length;
  const backfilled = items.filter((item) => manualActionStates[item.id]?.resultCheckedAt).length + recentRecords.filter((record) => record.result_checked_at || record.result_score).length;
  const topSignals = items.slice(0, 3).map((item, index) => `${index + 1}. ${compactTitle(item.title)} (${item.score})`);
  return [
    t("exposureRadar.dailyRecap.text.title"),
    t("exposureRadar.dailyRecap.text.generatedAt", { time: formatDateTime(new Date().toISOString(), timeZone) }),
    t("exposureRadar.dailyRecap.text.mode", { mode: usingSampleMode ? t("exposureRadar.sample.badge") : t("exposureRadar.dailyRecap.text.realMode") }),
    "",
    t("exposureRadar.dailyRecap.text.metrics"),
    `- ${t("exposureRadar.dailyRecap.text.signals", { count: items.length })}`,
    `- ${t("exposureRadar.dailyRecap.text.reviewed", { count: reviewed })}`,
    `- ${t("exposureRadar.dailyRecap.text.pending", { count: stats.pending })}`,
    `- ${t("exposureRadar.dailyRecap.text.handled", { count: stats.handled })}`,
    `- ${t("exposureRadar.dailyRecap.text.saved", { count: saved })}`,
    `- ${t("exposureRadar.dailyRecap.text.backfilled", { count: backfilled })}`,
    "",
    t("exposureRadar.dailyRecap.text.topSignals"),
    ...(topSignals.length ? topSignals : [`- ${t("exposureRadar.dailyRecap.text.noSignals")}`]),
    "",
    t("exposureRadar.dailyRecap.text.operatorNotes"),
    operatorNote.trim() || t("exposureRadar.dailyRecap.text.noNotes"),
    "",
    t("exposureRadar.dailyRecap.text.next"),
  ].join("\n");
}

function firstLoopStepKey(item?: ExposureRadarItemApi, manualState?: ManualActionState, firstLoopDone?: boolean) {
  if (firstLoopDone || manualState?.resultCheckedAt) return "done";
  if (!item) return "recover";
  if (!item.generated_comment) return "generate";
  if (!manualState?.copied) return "copy";
  if (!manualState?.opened) return "open";
  if (!isManualActionHandled(item, manualState)) return "handle";
  return "backfill";
}

function buildSampleExposureItems(region: ExposureRadarRegion, t: (key: string, params?: Record<string, string | number>) => string): ExposureRadarItemApi[] {
  const now = Date.now();
  const sampleSearchURL = region === "zh"
    ? "https://x.com/search?q=AI%20Agent%20%E5%B7%A5%E4%BD%9C%E6%B5%81&src=typed_query"
    : "https://x.com/search?q=AI%20agent%20workflow%20human-in-the-loop&src=typed_query";
  return [
    {
      id: `sample-${region}-workflow-proof`,
      region,
      data_source: "TODO_MYSQL_DSN",
      data_quality: "tweet_level",
      data_confidence: "real_impressions",
      data_confidence_reason: t("exposureRadar.sample.item.one.confidence"),
      title: t("exposureRadar.sample.item.one.title"),
      author_handle: region === "zh" ? "sample_builder_cn" : "sample_builder",
      author_name: t("exposureRadar.sample.item.one.author"),
      author_id: `sample-${region}-author-1`,
      content: t("exposureRadar.sample.item.one.content"),
      url: sampleSearchURL,
      tweet_id: `sample-${region}-tweet-1`,
      status: "sample",
      signal_label: t("exposureRadar.sample.signalLabel"),
      topic_name: region === "zh" ? "AI Agent workflow" : "AI agent workflow",
      published_at: new Date(now - 42 * 60 * 1000).toISOString(),
      views_per_min: 38,
      heat_count: 1680,
      followers_count: 6200,
      like_count: 84,
      reply_count: 18,
      retweet_count: 11,
      quote_count: 5,
      bookmark_count: 23,
      impression_count: 9800,
      hot_count: 3,
      age_label: t("exposureRadar.sample.item.one.age"),
      velocity_state: "rising",
      opportunity_tier: "hot_opportunity",
      tier_reason: t("exposureRadar.sample.item.one.tierReason"),
      quality_stage: "act_now",
      quality_reason: t("exposureRadar.sample.item.one.qualityReason"),
      velocity_history: [9, 14, 19, 28, 35, 38],
      score: 86,
      risk_level: "low",
      opportunity_type: "sample_manual_reply",
      recommended_use: t("exposureRadar.sample.item.one.recommended"),
      reason: t("exposureRadar.sample.item.one.reason"),
      ranking_delta: 8,
      ranking_reason: t("exposureRadar.sample.item.one.rankingReason"),
      guardrails: [
        t("exposureRadar.sample.guardrail.noPitch"),
        t("exposureRadar.sample.guardrail.context"),
      ],
      updated_at: new Date(now).toISOString(),
    },
    {
      id: `sample-${region}-operator-question`,
      region,
      data_source: "TODO_MYSQL_DSN",
      data_quality: "tweet_level",
      data_confidence: "engagement_estimate",
      data_confidence_reason: t("exposureRadar.sample.item.two.confidence"),
      title: t("exposureRadar.sample.item.two.title"),
      author_handle: region === "zh" ? "sample_operator_cn" : "sample_operator",
      author_name: t("exposureRadar.sample.item.two.author"),
      author_id: `sample-${region}-author-2`,
      content: t("exposureRadar.sample.item.two.content"),
      url: sampleSearchURL,
      tweet_id: `sample-${region}-tweet-2`,
      status: "sample",
      signal_label: t("exposureRadar.sample.signalLabel"),
      topic_name: region === "zh" ? "Founder-led growth" : "Founder-led growth",
      published_at: new Date(now - 93 * 60 * 1000).toISOString(),
      views_per_min: 16,
      heat_count: 790,
      followers_count: 3400,
      like_count: 42,
      reply_count: 9,
      retweet_count: 4,
      quote_count: 2,
      bookmark_count: 12,
      impression_count: 4100,
      hot_count: 2,
      age_label: t("exposureRadar.sample.item.two.age"),
      velocity_state: "steady",
      opportunity_tier: "rising_opportunity",
      tier_reason: t("exposureRadar.sample.item.two.tierReason"),
      quality_stage: "watch",
      quality_reason: t("exposureRadar.sample.item.two.qualityReason"),
      velocity_history: [11, 13, 15, 16, 15, 16],
      score: 73,
      risk_level: "low",
      opportunity_type: "sample_manual_reply",
      recommended_use: t("exposureRadar.sample.item.two.recommended"),
      reason: t("exposureRadar.sample.item.two.reason"),
      ranking_delta: 3,
      ranking_reason: t("exposureRadar.sample.item.two.rankingReason"),
      guardrails: [
        t("exposureRadar.sample.guardrail.noPitch"),
        t("exposureRadar.sample.guardrail.context"),
      ],
      updated_at: new Date(now).toISOString(),
    },
  ];
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

function getPositiveParam(params: URLSearchParams, key: string, fallback: number) {
  const value = Number(params.get(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getNonNegativeParam(params: URLSearchParams, key: string, fallback: number) {
  const value = Number(params.get(key));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}
