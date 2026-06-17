"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";

import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { broadcastPageRefreshComplete, subscribePageRefreshRequest } from "@/lib/app-page-refresh";
import { formatDateTime, usePreferredTimeZone } from "@/lib/timezone";
import { accountService, type AccountListItem } from "@/services/account.service";
import { contentDraftService } from "@/services/content-draft.service";
import { contentLibraryService } from "@/services/content-library.service";
import { exposureRadarService, type ExposureRadarArchiveData, type ExposureRadarData, type ExposureRadarGrowthStrategyApi, type ExposureRadarItemApi, type ExposureRadarManualRecordApi, type ExposureRadarPeopleItemApi, type ExposureRadarPerformanceData, type ExposureRadarRegion, type ExposureRadarResultRefreshApi, type ExposureRadarSafetyCenterData, type ExposureRadarWeeklyReviewData } from "@/services/exposure-radar.service";
import { oafBotService } from "@/services/oaf-bot.service";
import { fanOptions, hotCountOptions, hourOptions, radarViewFilters } from "@/components/exposure-radar/constants";
import { buildRadarContentSeedPayload, buildRadarMemoryPayload, buildSeedDraftDirection, findContentDraftPlanForSeed } from "@/components/exposure-radar/content-payload-utils";
import { DailyGrowthDesk } from "@/components/exposure-radar/daily-growth-desk";
import { buildDailyActionPlan, radarItemMatchesFilter } from "@/components/exposure-radar/daily-action-plan-utils";
import { buildExposureLearningProfile } from "@/components/exposure-radar/learning-profile-utils";
import { LeaderboardStatusStrip, RadarViewTabs } from "@/components/exposure-radar/list-support";
import { radarOperatorNoteKey, radarRankStorageKey, readManualActionStates, readOperatorNotes, readPublishGateStates, readSessionFocuses, readStoredRadarRanks, writeManualActionStates, writeOperatorNotes, writePublishGateStates, writeSessionFocuses, writeStoredRadarRanks } from "@/components/exposure-radar/local-state";
import { ExposureRadarHeroPanel } from "@/components/exposure-radar/hero-panel";
import { HandlingWorkbenchPanel } from "@/components/exposure-radar/handling-workbench-panel";
import { buildManualOutcomePayload, buildManualRecordPayload, buildManualResultPatch, mergeManualRecordStates, mergePeopleRadar, type ManualResultInput } from "@/components/exposure-radar/manual-record-utils";
import { ManualHandlingPanel } from "@/components/exposure-radar/manual-handling-panel";
import { AccountHealthScorePanel, GrowthExperimentPanel, MemoryAssetDeskPanel, OpportunityEvidenceDeskPanel, PeopleRelationshipDeskPanel, WeeklyOperatorReviewPanel } from "@/components/exposure-radar/operating-desk-panel-containers";
import { OpportunitySignalList } from "@/components/exposure-radar/opportunity-signal-list";
import { AccountSafetyCenterPanel, ContentDraftOperatingPanel, GrowthDeskCommandPanel, RadarDataHealthMonitorPanel, SignalRecoveryPanel, TeamHandoffPanel, XApiBudgetPanel } from "@/components/exposure-radar/operating-status-panels";
import { PerformancePanel } from "@/components/exposure-radar/performance-panel";
import { buildPeopleRadar } from "@/components/exposure-radar/people-radar-utils";
import { buildLeaderboardStats, shouldShowSignalRecovery } from "@/components/exposure-radar/radar-diagnostic-utils";
import { RadarFilters } from "@/components/exposure-radar/radar-filters";
import { RadarCard } from "@/components/exposure-radar/radar-card";
import { extractTweetID, isManualActionHandled, isSampleRadarItem, radarCardAnchorID, radarItemSavedMemoryID } from "@/components/exposure-radar/radar-signal-utils";
import { buildDraftReason, buildDraftRecommendedUse, buildReplyAngleSuggestions, buildSafetyReview, buildSampleReplyDraft, selectedReplyAngleForItem } from "@/components/exposure-radar/opportunity-reply-utils";
import { formatFreshness } from "@/components/exposure-radar/radar-utils";
import { exposureRadarQueryStateFromSearch, exposureRadarQueryStringFromState } from "@/components/exposure-radar/route-query-utils";
import { buildSampleExposureItems } from "@/components/exposure-radar/sample-data-utils";
import { DailySessionProgressPanel } from "@/components/exposure-radar/session-progress-panel";
import { DailyOperatingGoalsPanel, DailyRecapPanel, FirstDayLaunchPanel, FirstLoopCompletionPanel, FirstLoopPanel, NextSessionCarryoverPanel, OperatorScratchpadPanel, PreflightSafetyPanel, RadarEmptyStatePanel, SampleModeBanner, SessionFocusPanel } from "@/components/exposure-radar/session-workflow-panels";
import { CollectionDiagnosticsPanel, SourceHealthPanel } from "@/components/exposure-radar/source-diagnostics";
import { parseCommaList, type StrategyContextImportDraft } from "@/components/exposure-radar/strategy-form-utils";
import { TodayMovesPanel } from "@/components/exposure-radar/today-moves-panel";
import { LearningInsightsPanel, TopicHistoryPanel } from "@/components/exposure-radar/learning-history-panels";
import { DailyReviewReportPanel, ResultLearningLoopPanel } from "@/components/exposure-radar/strategy-report-panels";
import { GrowthReviewPanel, PeopleRadarPanel, StrategySetupPanel } from "@/components/exposure-radar/strategy-people-panels";
import type { ContentDraftBridgeData, ExposureRadarWorkspaceTab, LoadState, ManualActionState, ManualOutcome, OperatorSessionNote, PeopleRadarEntry, PublishGateKey, PublishGateState, RadarViewFilter, RankChange, ReplyAngleSuggestion, SessionFocusKey, StrategyFormState } from "@/components/exposure-radar/types";
import { buildWorkbenchStats } from "@/components/exposure-radar/workbench-helper-utils";
import { DailyGrowthDeskPanel, ExposureRadarWorkspaceNav, TenMinuteActivationPanel } from "@/components/exposure-radar/workspace-panels";
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
  const [savingContextMemory, setSavingContextMemory] = useState(false);
  const [radarView, setRadarView] = useState<RadarViewFilter>("priority");
  const [workspaceTab, setWorkspaceTab] = useState<ExposureRadarWorkspaceTab>("today");
  const [queryHydrated, setQueryHydrated] = useState(false);
  const [guidedFirstSession, setGuidedFirstSession] = useState(false);
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
  const initialQueryStateRef = useRef({
    region,
    hours,
    maxFans,
    minHotCount,
    selectedAccountID,
    selectedBotID,
    workspaceTab,
  });
  const selectedAccount = useMemo(() => accounts.find((account) => account.id === selectedAccountID), [accounts, selectedAccountID]);
  const selectedBot = useMemo(() => bots.find((bot) => bot.id === selectedBotID), [bots, selectedBotID]);
  const selectedAccountIntelligenceHref = selectedAccountID > 0 ? `/accounts/${selectedAccountID}` : "";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const queryState = exposureRadarQueryStateFromSearch(window.location.search, initialQueryStateRef.current);
    setRegion(queryState.region);
    setHours(queryState.hours);
    setMaxFans(queryState.maxFans);
    setMinHotCount(queryState.minHotCount);
    setSelectedAccountID(queryState.selectedAccountID);
    setSelectedBotID(queryState.selectedBotID);
    setWorkspaceTab(queryState.workspaceTab);
    setGuidedFirstSession(params.get("activation") === "first_day");
    setQueryHydrated(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!queryHydrated) return;
    const query = exposureRadarQueryStringFromState(window.location.search, { region, hours, maxFans, minHotCount, selectedAccountID, selectedBotID, workspaceTab });
    window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
  }, [hours, maxFans, minHotCount, queryHydrated, region, selectedAccountID, selectedBotID, workspaceTab]);

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
    if (!queryHydrated) return;
    void load();
  }, [load, queryHydrated]);

  useEffect(() => {
    void (async () => {
      try {
        const [accountData, botData] = await Promise.all([accountService.list(), oafBotService.list()]);
        const connectedAccounts = accountData.items.filter((account) => account.status !== "disconnected");
        const queryState = typeof window === "undefined"
          ? initialQueryStateRef.current
          : exposureRadarQueryStateFromSearch(window.location.search, initialQueryStateRef.current);
        const accountIDForContext = queryState.selectedAccountID || connectedAccounts[0]?.id || 0;
        const botIDForContext = queryState.selectedBotID
          || botData.items.find((bot) => bot.twitter_account_id === accountIDForContext)?.id
          || botData.items[0]?.id
          || 0;
        setAccounts(connectedAccounts);
        setBots(botData.items);
        setSelectedAccountID((current) => current || accountIDForContext);
        setSelectedBotID((current) => current || botIDForContext);
      } catch (error) {
        pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("exposureRadar.toast.configLoadFailed") : t("exposureRadar.toast.configLoadFailed"));
      }
    })();
  }, [pushToast, t]);

  const selectAccountForRadar = useCallback((accountID: number) => {
    setSelectedAccountID(accountID);
    if (!accountID) {
      setSelectedBotID(0);
      return;
    }
    const boundBot = bots.find((bot) => bot.twitter_account_id === accountID);
    if (boundBot) {
      setSelectedBotID(boundBot.id);
    }
  }, [bots]);

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

  const saveStrategyContextMemory = useCallback(async (draft: StrategyContextImportDraft) => {
    if (!selectedAccountID && !selectedBotID) {
      pushToast(t("exposureRadar.toast.selectBotAccountForMemory"));
      return;
    }
    setSavingContextMemory(true);
    try {
      await contentLibraryService.create({
        twitter_account_id: selectedAccountID || undefined,
        bot_id: selectedBotID || undefined,
        title: draft.title,
        item_type: "idea",
        body: draft.memoryBody,
        topics: draft.topics,
        growth_goal: draft.form.primaryGoal,
        cta_preference: draft.form.replyStyle,
        priority: 70,
        status: "active",
      });
      void loadContentDraftBridge();
      pushToast(t("exposureRadar.strategy.contextImport.memorySaved"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("exposureRadar.strategy.contextImport.memoryFailed") : t("exposureRadar.strategy.contextImport.memoryFailed"));
    } finally {
      setSavingContextMemory(false);
    }
  }, [loadContentDraftBridge, pushToast, selectedAccountID, selectedBotID, t]);

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
      <ExposureRadarHeroPanel itemCount={items.length} metrics={metrics} />

      {guidedFirstSession && !firstLoopDone ? null : (
        <ExposureRadarWorkspaceNav value={workspaceTab} counts={workspaceTabCounts} onChange={setWorkspaceTab} />
      )}

      {workspaceTab === "today" ? (
        <DailyGrowthDesk
          guidedFirstSession={guidedFirstSession && !firstLoopDone}
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
              accountLabel={selectedAccount ? `@${selectedAccount.username}` : ""}
              botLabel={selectedBot?.name || ""}
              accountIntelligenceHref={selectedAccountIntelligenceHref}
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
              items={items}
              manualActionStates={manualActionStates}
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
          onAccountChange={selectAccountForRadar}
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
              contextMemorySaving={savingContextMemory}
              onSave={saveGrowthStrategy}
              onSaveContextMemory={saveStrategyContextMemory}
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
