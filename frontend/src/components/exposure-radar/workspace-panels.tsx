"use client";

import type { ReactNode } from "react";
import { Activity, ArrowRight, BarChart3, CalendarClock, CheckCircle2, Clock3, Database, Gauge, MessageCircle, RefreshCw, Search, ShieldAlert, Sparkles, Target, Users, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";
import { formatDateTime } from "@/lib/timezone";
import type { ExposureRadarGrowthStrategyApi, ExposureRadarManualRecordApi, ExposureRadarSafetyCenterData, ExposureRadarWeeklyReviewData } from "@/services/exposure-radar.service";
import { dailyDeskFocusAnchor, dailyDeskFocusKey, dailyDeskRhythmAnchor } from "@/components/exposure-radar/activation-session-utils";
import { exposureRadarWorkspaceTabs } from "@/components/exposure-radar/constants";
import { actionPlanTone } from "@/components/exposure-radar/daily-action-plan-utils";
import { isRecentManualRecord } from "@/components/exposure-radar/growth-desk-utils";
import { GrowthDeskMetric, MiniStat } from "@/components/exposure-radar/panel-primitives";
import { formatCompact, formatVelocityLabel } from "@/components/exposure-radar/radar-utils";
import type { DailyActionPlanItem, ExposureRadarWorkspaceTab, LoadState, PeopleRadarEntry, WorkbenchStats } from "@/components/exposure-radar/types";

export function ExposureRadarWorkspaceNav({
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

export function TenMinuteActivationPanel({
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

export function DailyGrowthDeskPanel({
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
