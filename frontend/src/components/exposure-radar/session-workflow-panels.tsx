"use client";

import { ArrowRight, BarChart3, Bot, CalendarClock, CheckCircle2, Clipboard, Clock3, ExternalLink, FileText, Info, MessageSquarePlus, RefreshCw, Search, Sparkles, Target, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { formatDateTime } from "@/lib/timezone";
import type { AccountListItem } from "@/services/account.service";
import type { ExposureRadarData, ExposureRadarGrowthStrategyApi, ExposureRadarItemApi, ExposureRadarManualRecordApi } from "@/services/exposure-radar.service";
import { appendOperatorNote, firstDayActivationActions, firstDayActivationMode, sessionFocusOptions } from "@/components/exposure-radar/activation-session-utils";
import { DailyOperatingGoalsCard, FirstDayLaunchCard, PreflightSafetyCard, RadarEmptyStateCard, SessionFocusCard } from "@/components/exposure-radar/activation-session-panels";
import { buildPriorityReasonChips } from "@/components/exposure-radar/display-helper-utils";
import { buildReplyAngleSuggestions, selectedReplyAngleForItem } from "@/components/exposure-radar/opportunity-reply-utils";
import { FirstLoopActionRow } from "@/components/exposure-radar/panel-primitives";
import { compactTitle, isManualActionHandled } from "@/components/exposure-radar/radar-signal-utils";
import { formatCompact, formatOneDecimal, formatPercent, normalizeQualityStage, qualityStageClass } from "@/components/exposure-radar/radar-utils";
import { signalRecoveryReason, signalRecoverySuggestions } from "@/components/exposure-radar/radar-diagnostic-utils";
import { buildDailyRecapText, buildNextSessionCarryovers, buildOperatorScratchpadSuggestions, firstLoopStepKey } from "@/components/exposure-radar/session-helper-utils";
import type { ContentDraftBridgeData, DailyActionPlanItem, FirstDayStepKey, LoadState, ManualActionState, MaybePromise, PublishGateKey, PublishGateState, ReplyAngleSuggestion, SessionFocusKey, WorkbenchStats } from "@/components/exposure-radar/types";
import { buildDailyOperatingGoals, buildPreflightChecks, buildPublishGateItems } from "@/components/exposure-radar/workbench-helper-utils";
import type { OAFBot } from "@/types/oaf-bot";

export function FirstDayLaunchPanel({
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
  const replyDraftCount = moves.filter((entry) => entry.item.generated_comment || entry.item.review_task_id).length;
  const steps: Array<{ key: FirstDayStepKey; done: boolean; anchor: string }> = ([
    { key: "analysis", done: selectedAccountID > 0 },
    { key: "strategy", done: strategyReady },
    { key: "desk", done: moves.length > 0 || itemsCount > 0 },
    { key: "reply", done: replyDraftCount > 0 || handledCount > 0 },
    { key: "result", done: resultCount > 0 },
  ] satisfies Array<{ key: FirstDayStepKey; done: boolean }>).map((step) => ({
    ...step,
    anchor: step.key === "analysis"
      ? selectedAccountID > 0 ? `/accounts/${selectedAccountID}` : "/accounts"
      : step.key === "strategy"
        ? "#radar-strategy"
        : step.key === "result"
          ? "#radar-results"
          : "#radar-workbench",
  }));
  const selectedAccount = accounts.find((account) => account.id === selectedAccountID);
  const selectedBot = bots.find((bot) => bot.id === selectedBotID);
  const checklist = [
    { key: "account", done: selectedAccountID > 0 && selectedBotID > 0, value: selectedAccount ? `@${selectedAccount.username}` : t("exposureRadar.firstDay.selected.missing") },
    { key: "strategy", done: strategyReady, value: strategy?.target_audience || t("exposureRadar.firstDay.selected.missing") },
    { key: "queue", done: moves.length > 0, value: String(moves.length) },
    { key: "reply", done: replyDraftCount > 0 || handledCount > 0, value: String(replyDraftCount) },
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

export function RadarEmptyStatePanel({
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

export function PreflightSafetyPanel({
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

export function SessionFocusPanel({
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

export function DailyOperatingGoalsPanel({
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

export function PublishQualityGatePanel({
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

export function OperatorScratchpadPanel({
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

export function NextSessionCarryoverPanel({
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

export function DailyRecapPanel({
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

export function SampleModeBanner({ onExit }: { onExit: () => void }) {
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

export function FirstLoopPanel({
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

export function FirstLoopCompletionPanel({ completedAt, recentRecords, timeZone }: { completedAt: string; recentRecords: ExposureRadarManualRecordApi[]; timeZone: string }) {
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
