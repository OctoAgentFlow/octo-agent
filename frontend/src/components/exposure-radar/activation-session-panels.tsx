"use client";

import type { ReactNode } from "react";
import { ArrowRight, Bot, CheckCircle2, Clock3, Gauge, Info, RefreshCw, Search, ShieldCheck, Sparkles, Target, Users } from "lucide-react";

import { DiagnosticMetric, LeaderboardPill } from "@/components/exposure-radar/list-support";
import type { FirstDayActivationAction, FirstDayActivationMode, FirstDayStepKey, LoadState, SafetyReviewStatus, SessionFocusKey } from "@/components/exposure-radar/types";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";

export type FirstDayLaunchStep = { key: FirstDayStepKey; done: boolean; anchor: string };
export type FirstDayChecklistItem = { key: string; done: boolean; value: string };
export type SetupWizardStep = { key: string; done: boolean; href: string; icon: ReactNode };
export type EmptyStateMetricSet = { visible: string; maxViews: string; maxSpeed: string; coverage: string };
export type PreflightCheckItem = { key: string; status: SafetyReviewStatus; icon: ReactNode; title: string; detail: string };
export type SessionFocusOption = { key: SessionFocusKey; icon: ReactNode; title: string; description: string };
export type DailyOperatingGoal = { key: string; icon: ReactNode; title: string; description: string; done: number; target: number };

export function FirstDayLaunchCard({
  steps,
  checklist,
  wizardSteps,
  activationMode,
  activationActions,
  selectedAccountLabel,
  selectedBotLabel,
  selectedLaneLabel,
  readyCount,
  handledCount,
  resultCount,
  usingSampleMode,
  onStartSample,
  onExitSample,
}: {
  steps: FirstDayLaunchStep[];
  checklist: FirstDayChecklistItem[];
  wizardSteps: SetupWizardStep[];
  activationMode: FirstDayActivationMode;
  activationActions: FirstDayActivationAction[];
  selectedAccountLabel: string;
  selectedBotLabel: string;
  selectedLaneLabel: string;
  readyCount: number;
  handledCount: number;
  resultCount: number;
  usingSampleMode: boolean;
  onStartSample: () => void;
  onExitSample: () => void;
}) {
  const { t } = useT();
  const doneCount = steps.filter((step) => step.done).length;
  const nextStep = steps.find((step) => !step.done) || steps[steps.length - 1];
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <CardHeader title={t("exposureRadar.firstDay.title")} description={t("exposureRadar.firstDay.description")} className="mb-0" />
          <div className="mt-3 flex flex-wrap gap-2">
            <LeaderboardPill label={t("exposureRadar.firstDay.metric.ready")} value={readyCount} tone="border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]" />
            <LeaderboardPill label={t("exposureRadar.firstDay.metric.handled")} value={handledCount} tone="border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" />
            <LeaderboardPill label={t("exposureRadar.firstDay.metric.backfilled")} value={resultCount} tone="border-[#7856ff]/25 bg-[#7856ff]/10 text-[#c4b5fd]" />
          </div>
        </div>
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4 lg:min-w-64">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] text-[#71767b]">{t("exposureRadar.firstDay.progress")}</p>
              <p className="text-2xl font-semibold text-white">{doneCount}/{steps.length}</p>
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
        <FirstDaySetupChip icon={<Users className="size-3.5" />} label={t("exposureRadar.firstDay.selected.account")} value={selectedAccountLabel} />
        <FirstDaySetupChip icon={<Bot className="size-3.5" />} label={t("exposureRadar.firstDay.selected.bot")} value={selectedBotLabel} />
        <FirstDaySetupChip icon={<Target className="size-3.5" />} label={t("exposureRadar.firstDay.selected.lane")} value={selectedLaneLabel} />
      </div>
      <SetupWizardPanel steps={wizardSteps} usingSampleMode={usingSampleMode} onStartSample={onStartSample} onExitSample={onExitSample} />
      <FirstDayActivationCard mode={activationMode} actions={activationActions} />
      <FirstSessionPath steps={steps} checklist={checklist} />
      <div className="mt-4 grid gap-3 md:grid-cols-5">
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
      <FirstDayChecklist checklist={checklist} />
      <FirstDayTimebox />
    </Card>
  );
}

export function SetupWizardPanel({
  steps,
  usingSampleMode,
  onStartSample,
  onExitSample,
}: {
  steps: SetupWizardStep[];
  usingSampleMode: boolean;
  onStartSample: () => void;
  onExitSample: () => void;
}) {
  const { t } = useT();
  const doneCount = steps.filter((step) => step.done).length;
  const nextStep = steps.find((step) => !step.done) || steps[steps.length - 1];
  return (
    <div className="mt-4 rounded-2xl border border-[#2f3336] bg-black p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#7856ff]/25 bg-[#7856ff]/10 px-3 py-1 text-xs font-semibold text-[#c4b5fd]">
            <ShieldCheck className="size-3.5" />
            {t("exposureRadar.setupWizard.badge")}
          </span>
          <p className="mt-3 text-base font-semibold text-[#e7e9ea]">{t("exposureRadar.setupWizard.title")}</p>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#8b98a5]">{t("exposureRadar.setupWizard.description")}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <a href={nextStep.href} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#1d9bf0] px-3 text-sm font-semibold text-white hover:bg-[#1a8cd8]">
            {t(nextStep.done ? "exposureRadar.setupWizard.action.review" : `exposureRadar.setupWizard.action.${nextStep.key}`)}
            <ArrowRight className="size-3.5" />
          </a>
          {usingSampleMode ? (
            <Button type="button" variant="outline" onClick={onExitSample}>
              <RefreshCw className="size-4" />
              {t("exposureRadar.sample.exit")}
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={onStartSample}>
              <Sparkles className="size-4" />
              {t("exposureRadar.sample.start")}
            </Button>
          )}
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-5">
        {steps.map((step, index) => (
          <a key={step.key} href={step.href} className={`rounded-xl border p-3 transition hover:border-[#1d9bf0]/45 ${step.done ? "border-[#00ba7c]/25 bg-[#00ba7c]/10" : step.key === nextStep.key ? "border-[#1d9bf0]/45 bg-[#1d9bf0]/10" : "border-[#2f3336] bg-[#0f1419]"}`}>
            <div className="flex items-center justify-between gap-2">
              <span className={`inline-flex size-8 items-center justify-center rounded-full border ${step.done ? "border-[#00ba7c]/30 bg-[#00ba7c]/10 text-[#7ee0b5]" : "border-[#2f3336] bg-black text-[#8b98a5]"}`}>
                {step.done ? <CheckCircle2 className="size-4" /> : step.icon}
              </span>
              <span className="text-[11px] font-semibold text-[#71767b]">{String(index + 1).padStart(2, "0")}</span>
            </div>
            <p className="mt-3 text-xs font-semibold text-[#e7e9ea]">{t(`exposureRadar.setupWizard.${step.key}.title`)}</p>
            <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-[#71767b]">{t(`exposureRadar.setupWizard.${step.key}.description`)}</p>
          </a>
        ))}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#202327]">
        <div className="h-full rounded-full bg-[#00ba7c]" style={{ width: `${Math.round((doneCount / steps.length) * 100)}%` }} />
      </div>
    </div>
  );
}

export function FirstDayActivationCard({ mode, actions }: { mode: FirstDayActivationMode; actions: FirstDayActivationAction[] }) {
  const { t } = useT();
  return (
    <div className="mt-4 rounded-2xl border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#1d9bf0]/30 bg-black/30 px-3 py-1 text-xs font-semibold text-[#8ecdf8]">
            <Sparkles className="size-3.5" />
            {t("exposureRadar.firstDay.activation.badge")}
          </span>
          <p className="mt-3 text-base font-semibold text-[#e7e9ea]">{t(`exposureRadar.firstDay.activation.${mode}.title`)}</p>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#8b98a5]">{t(`exposureRadar.firstDay.activation.${mode}.description`)}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {actions.map((action) => action.href ? (
            <a key={action.key} href={action.href} className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition ${action.primary ? "bg-[#1d9bf0] text-white hover:bg-[#1a8cd8]" : "border border-[#2f3336] bg-black text-[#e7e9ea] hover:bg-[#16181c]"}`}>
              {action.icon}
              {t(`exposureRadar.firstDay.activation.action.${action.key}`)}
            </a>
          ) : (
            <Button key={action.key} type="button" variant={action.primary ? "default" : "outline"} onClick={action.onClick} disabled={action.disabled}>
              {action.icon}
              {t(`exposureRadar.firstDay.activation.action.${action.key}`)}
            </Button>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-3">
        {["one", "two", "three"].map((key) => (
          <div key={key} className="rounded-xl border border-[#2f3336] bg-black/60 p-3">
            <p className="text-xs font-semibold text-[#e7e9ea]">{t(`exposureRadar.firstDay.activation.${mode}.step.${key}.title`)}</p>
            <p className="mt-1 text-[11px] leading-5 text-[#71767b]">{t(`exposureRadar.firstDay.activation.${mode}.step.${key}.description`)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RadarEmptyStateCard({
  reason,
  suggestions,
  metrics,
  loadState,
  onRefresh,
  onWidenWindow,
  onRaiseFans,
  onStartSample,
}: {
  reason: string;
  suggestions: string[];
  metrics: EmptyStateMetricSet;
  loadState: LoadState;
  onRefresh: () => void;
  onWidenWindow: () => void;
  onRaiseFans: () => void;
  onStartSample: () => void;
}) {
  const { t } = useT();
  return (
    <div className="rounded-2xl border border-dashed border-[#2f3336] bg-black p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#ffd400]/25 bg-[#ffd400]/10 px-3 py-1 text-xs font-semibold text-[#f6d96b]">
            <Search className="size-3.5" />
            {t("exposureRadar.emptyState.badge")}
          </span>
          <h3 className="mt-3 text-lg font-semibold text-[#e7e9ea]">{t("exposureRadar.emptyState.title")}</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#8b98a5]">{t("exposureRadar.emptyState.description", { reason })}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" onClick={onRefresh} disabled={loadState === "loading"}>
            <RefreshCw className={`size-4 ${loadState === "loading" ? "animate-spin" : ""}`} />
            {t("exposureRadar.emptyState.action.refresh")}
          </Button>
          <Button type="button" variant="outline" onClick={onWidenWindow}>
            <Clock3 className="size-4" />
            {t("exposureRadar.emptyState.action.widen")}
          </Button>
          <Button type="button" variant="outline" onClick={onRaiseFans}>
            <Users className="size-4" />
            {t("exposureRadar.emptyState.action.raiseFans")}
          </Button>
          <Button type="button" variant="outline" onClick={onStartSample}>
            <Sparkles className="size-4" />
            {t("exposureRadar.sample.start")}
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <DiagnosticMetric label={t("exposureRadar.emptyState.metric.visible")} value={metrics.visible} detail={t("exposureRadar.emptyState.metric.visibleDetail")} />
        <DiagnosticMetric label={t("exposureRadar.emptyState.metric.maxViews")} value={metrics.maxViews} detail={t("exposureRadar.emptyState.metric.maxViewsDetail")} />
        <DiagnosticMetric label={t("exposureRadar.emptyState.metric.maxSpeed")} value={metrics.maxSpeed} detail={t("exposureRadar.emptyState.metric.maxSpeedDetail")} />
        <DiagnosticMetric label={t("exposureRadar.emptyState.metric.coverage")} value={metrics.coverage} detail={t("exposureRadar.emptyState.metric.coverageDetail")} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.emptyState.suggestions")}</p>
          <div className="mt-3 space-y-2">
            {suggestions.map((suggestion) => (
              <div key={suggestion} className="flex gap-2 rounded-lg border border-[#2f3336] bg-black px-3 py-2 text-xs leading-5 text-[#8b98a5]">
                <Info className="mt-0.5 size-3.5 shrink-0 text-[#8ecdf8]" />
                <span>{suggestion}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.emptyState.safeFallback.title")}</p>
          <p className="mt-2 text-xs leading-5 text-[#71767b]">{t("exposureRadar.emptyState.safeFallback.description")}</p>
          <a href="#radar-strategy" className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full border border-[#2f3336] px-3 text-sm font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
            {t("exposureRadar.emptyState.action.strategy")}
            <ArrowRight className="size-4" />
          </a>
        </div>
      </div>
      <EmptyStatePlaybook onRefresh={onRefresh} onWidenWindow={onWidenWindow} onStartSample={onStartSample} loadState={loadState} />
    </div>
  );
}

export function PreflightSafetyCard({ checks, status }: { checks: PreflightCheckItem[]; status: SafetyReviewStatus }) {
  const { t } = useT();
  return (
    <Card className={safetyReviewTone(status)}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${safetyReviewBadgeTone(status)}`}>
            <ShieldCheck className="size-3.5" />
            {t("exposureRadar.preflight.badge")}
          </span>
          <CardHeader title={t("exposureRadar.preflight.title")} description={t(`exposureRadar.preflight.description.${status}`)} className="mt-3 mb-0" />
        </div>
        <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${safetyReviewBadgeTone(status)}`}>
          {t(`exposureRadar.preflight.status.${status}`)}
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {checks.map((check) => (
          <div key={check.key} className="rounded-xl border border-[#2f3336] bg-black/35 p-3">
            <div className="flex items-start justify-between gap-2">
              <span className={`inline-flex size-8 items-center justify-center rounded-lg border ${safetyReviewBadgeTone(check.status)}`}>{check.icon}</span>
              <span className={`size-2 rounded-full ${safetyReviewDot(check.status)}`} />
            </div>
            <p className="mt-3 text-xs font-semibold text-[#e7e9ea]">{check.title}</p>
            <p className="mt-1 text-[11px] leading-5 text-[#71767b]">{check.detail}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function SessionFocusCard({
  focus,
  options,
  strategyLabel,
  guidance,
  onChange,
}: {
  focus: SessionFocusKey;
  options: SessionFocusOption[];
  strategyLabel: string;
  guidance: string;
  onChange: (focus: SessionFocusKey) => void;
}) {
  const { t } = useT();
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-3 py-1 text-xs font-semibold text-[#8ecdf8]">
            <Target className="size-3.5" />
            {t("exposureRadar.sessionFocus.badge")}
          </span>
          <CardHeader title={t("exposureRadar.sessionFocus.title")} description={t("exposureRadar.sessionFocus.description")} className="mt-3 mb-0" />
        </div>
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#2f3336] bg-black px-3 py-1 text-xs font-semibold text-[#8b98a5]">
          {strategyLabel}
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={`rounded-2xl border p-4 text-left transition ${focus === option.key ? "border-[#1d9bf0]/55 bg-[#1d9bf0]/10" : "border-[#2f3336] bg-black hover:border-[#1d9bf0]/35"}`}
          >
            <span className={`inline-flex size-9 items-center justify-center rounded-xl border ${focus === option.key ? "border-[#1d9bf0]/35 bg-[#1d9bf0]/10 text-[#8ecdf8]" : "border-[#2f3336] bg-[#16181c] text-[#8b98a5]"}`}>
              {option.icon}
            </span>
            <p className="mt-3 text-sm font-semibold text-[#e7e9ea]">{option.title}</p>
            <p className="mt-1 text-xs leading-5 text-[#71767b]">{option.description}</p>
          </button>
        ))}
      </div>
      <div className="mt-4 rounded-2xl border border-[#2f3336] bg-black p-4">
        <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.sessionFocus.guidance.title")}</p>
        <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{guidance}</p>
      </div>
    </Card>
  );
}

export function DailyOperatingGoalsCard({
  goals,
  completed,
  overall,
  hasItems,
  usingSampleMode,
  onStartSample,
}: {
  goals: DailyOperatingGoal[];
  completed: number;
  overall: number;
  hasItems: boolean;
  usingSampleMode: boolean;
  onStartSample: () => void;
}) {
  const { t } = useT();
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-3 py-1 text-xs font-semibold text-[#7ee0b5]">
            <Gauge className="size-3.5" />
            {t("exposureRadar.dailyGoals.badge")}
          </span>
          <CardHeader title={t("exposureRadar.dailyGoals.title")} description={t("exposureRadar.dailyGoals.description")} className="mt-3 mb-0" />
        </div>
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4 lg:min-w-56">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] text-[#71767b]">{t("exposureRadar.dailyGoals.progress")}</p>
              <p className="text-2xl font-semibold text-white">{completed}/{goals.length}</p>
            </div>
            <span className="inline-flex size-12 items-center justify-center rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 text-sm font-semibold text-[#7ee0b5]">{overall}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#202327]">
            <div className="h-full rounded-full bg-[#00ba7c]" style={{ width: `${overall}%` }} />
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {goals.map((goal) => (
          <div key={goal.key} className={`rounded-2xl border p-4 ${goal.done >= goal.target ? "border-[#00ba7c]/25 bg-[#00ba7c]/10" : "border-[#2f3336] bg-black"}`}>
            <div className="flex items-start justify-between gap-3">
              <span className={`inline-flex size-9 items-center justify-center rounded-xl border ${goal.done >= goal.target ? "border-[#00ba7c]/30 bg-[#00ba7c]/10 text-[#7ee0b5]" : "border-[#2f3336] bg-[#16181c] text-[#8b98a5]"}`}>
                {goal.icon}
              </span>
              <span className="text-sm font-semibold text-[#e7e9ea]">{goal.done}/{goal.target}</span>
            </div>
            <p className="mt-3 text-sm font-semibold text-[#e7e9ea]">{goal.title}</p>
            <p className="mt-1 text-xs leading-5 text-[#71767b]">{goal.description}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-[#2f3336] bg-black p-4 md:flex-row md:items-center md:justify-between">
        <p className="text-xs leading-5 text-[#8b98a5]">{usingSampleMode ? t("exposureRadar.dailyGoals.sampleNote") : t("exposureRadar.dailyGoals.note")}</p>
        {!hasItems ? (
          <Button type="button" size="sm" onClick={onStartSample}>
            <Sparkles className="size-3.5" />
            {t("exposureRadar.sample.start")}
          </Button>
        ) : (
          <a href="#radar-workbench" className="inline-flex h-8 items-center gap-1 rounded-full border border-[#2f3336] px-3 text-xs font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
            {t("exposureRadar.dailyGoals.openWorkbench")}
            <ArrowRight className="size-3.5" />
          </a>
        )}
      </div>
    </Card>
  );
}

function FirstSessionPath({ steps, checklist }: { steps: FirstDayLaunchStep[]; checklist: FirstDayChecklistItem[] }) {
  const { t } = useT();
  const doneCount = checklist.filter((item) => item.done).length;
  const nextStep = steps.find((step) => !step.done) || steps[steps.length - 1];
  return (
    <div className="mt-4 rounded-2xl border border-[#2f3336] bg-black p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-3 py-1 text-xs font-semibold text-[#8ecdf8]">
            <Target className="size-3.5" />
            {t("exposureRadar.firstDay.path.badge")}
          </span>
          <p className="mt-3 text-base font-semibold text-[#e7e9ea]">{t("exposureRadar.firstDay.path.title")}</p>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#8b98a5]">{t("exposureRadar.firstDay.path.description")}</p>
        </div>
        <a href={nextStep.anchor} className="inline-flex h-9 w-fit items-center gap-1.5 rounded-full border border-[#2f3336] px-3 text-sm font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
          {t("exposureRadar.firstDay.path.next")}
          <ArrowRight className="size-3.5" />
        </a>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-5">
        {steps.map((step, index) => (
          <a key={step.key} href={step.anchor} className={`rounded-xl border p-3 transition hover:border-[#1d9bf0]/45 ${step.done ? "border-[#00ba7c]/25 bg-[#00ba7c]/10" : step.key === nextStep.key ? "border-[#1d9bf0]/45 bg-[#1d9bf0]/10" : "border-[#2f3336] bg-[#0f1419]"}`}>
            <div className="flex items-start justify-between gap-3">
              <span className="text-[11px] font-semibold text-[#71767b]">{t("exposureRadar.firstDay.path.step", { index: index + 1 })}</span>
              {step.done ? <CheckCircle2 className="size-3.5 text-[#7ee0b5]" /> : <Clock3 className="size-3.5 text-[#71767b]" />}
            </div>
            <p className="mt-2 text-xs font-semibold text-[#e7e9ea]">{t(`exposureRadar.firstDay.path.${step.key}.title`)}</p>
            <p className="mt-1 text-[11px] leading-5 text-[#71767b]">{t(`exposureRadar.firstDay.path.${step.key}.description`)}</p>
          </a>
        ))}
      </div>
      <div className="mt-3 flex flex-col gap-2 rounded-xl border border-[#2f3336] bg-[#0f1419] p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-[#8b98a5]">{t("exposureRadar.firstDay.path.rule")}</p>
        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-[#2f3336] bg-black px-2.5 py-1 text-[11px] font-semibold text-[#8b98a5]">
          {doneCount}/{checklist.length} {t("exposureRadar.firstDay.path.checks")}
        </span>
      </div>
    </div>
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

function FirstDayChecklist({ checklist }: { checklist: FirstDayChecklistItem[] }) {
  const { t } = useT();
  return (
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
  );
}

function FirstDayTimebox() {
  const { t } = useT();
  return (
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
  );
}

function EmptyStatePlaybook({
  onRefresh,
  onWidenWindow,
  onStartSample,
  loadState,
}: {
  onRefresh: () => void;
  onWidenWindow: () => void;
  onStartSample: () => void;
  loadState: LoadState;
}) {
  const { t } = useT();
  const actions = [
    { key: "refresh", icon: <RefreshCw className={`size-4 ${loadState === "loading" ? "animate-spin" : ""}`} />, onClick: onRefresh, disabled: loadState === "loading" },
    { key: "window", icon: <Clock3 className="size-4" />, onClick: onWidenWindow },
    { key: "sample", icon: <Sparkles className="size-4" />, onClick: onStartSample },
  ];
  return (
    <div className="mt-4 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.emptyPlaybook.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.emptyPlaybook.description")}</p>
        </div>
        <a href="#radar-strategy" className="inline-flex h-8 w-fit items-center gap-1 rounded-full border border-[#2f3336] px-3 text-xs font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
          {t("exposureRadar.emptyPlaybook.strategy")}
          <ArrowRight className="size-3.5" />
        </a>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            disabled={action.disabled}
            onClick={action.onClick}
            className="rounded-xl border border-[#2f3336] bg-black p-3 text-left transition hover:border-[#1d9bf0]/45 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="inline-flex size-8 items-center justify-center rounded-lg border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]">{action.icon}</span>
            <p className="mt-3 text-xs font-semibold text-[#e7e9ea]">{t(`exposureRadar.emptyPlaybook.${action.key}.title`)}</p>
            <p className="mt-1 text-[11px] leading-5 text-[#71767b]">{t(`exposureRadar.emptyPlaybook.${action.key}.description`)}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function safetyReviewTone(status: SafetyReviewStatus) {
  if (status === "pass") return "border-[#00ba7c]/20 bg-[#061a13]";
  if (status === "watch") return "border-[#ffd400]/20 bg-[#1c1805]";
  return "border-[#f4212e]/20 bg-[#1f0b0e]";
}

function safetyReviewBadgeTone(status: SafetyReviewStatus) {
  if (status === "pass") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  if (status === "watch") return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
  return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
}

function safetyReviewDot(status: SafetyReviewStatus) {
  if (status === "pass") return "bg-[#00ba7c]";
  if (status === "watch") return "bg-[#ffd400]";
  return "bg-[#f4212e]";
}
