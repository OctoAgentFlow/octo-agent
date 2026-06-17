"use client";

import { Activity, BarChart3, Clock3, Zap } from "lucide-react";

import { Card, CardHeader } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";
import { formatDateTime } from "@/lib/timezone";
import type { ExposureRadarGrowthStrategyApi, ExposureRadarItemApi, ExposureRadarManualRecordApi } from "@/services/exposure-radar.service";
import { sessionStateTone } from "@/components/exposure-radar/display-helper-utils";
import { isRecentManualRecord } from "@/components/exposure-radar/growth-desk-utils";
import { MiniStat } from "@/components/exposure-radar/panel-primitives";
import type { DailyActionPlanItem, ManualActionState, WorkbenchStats } from "@/components/exposure-radar/types";

export function DailySessionProgressPanel({
  strategy,
  moves,
  stats,
  items,
  manualActionStates,
  recentRecords,
  timeZone,
}: {
  strategy: ExposureRadarGrowthStrategyApi | null;
  moves: DailyActionPlanItem[];
  stats: WorkbenchStats;
  items: ExposureRadarItemApi[];
  manualActionStates: Record<string, ManualActionState>;
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
  const activation = buildActivationFunnel(items, manualActionStates, recentRecords);
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
      <div className="mt-4 rounded-2xl border border-[#2f3336] bg-black p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.activationMetrics.title")}</p>
            <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.activationMetrics.description")}</p>
          </div>
          <span className="inline-flex w-fit rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-2.5 py-1 text-[11px] font-semibold text-[#8ecdf8]">
            {t("exposureRadar.activationMetrics.score", { count: activation.completed })}
          </span>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-5">
          {activation.steps.map((step) => (
            <ActivationFunnelStep key={step.key} label={t(`exposureRadar.activationMetrics.${step.key}.label`)} detail={t(`exposureRadar.activationMetrics.${step.key}.detail`, { count: step.count })} done={step.done} />
          ))}
        </div>
      </div>
    </Card>
  );
}

function ActivationFunnelStep({ label, detail, done }: { label: string; detail: string; done: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${done ? "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" : "border-[#2f3336] bg-[#0f1419] text-[#8b98a5]"}`}>
      <p className="text-xs font-semibold">{label}</p>
      <p className="mt-1 text-[11px] leading-4 opacity-85">{detail}</p>
    </div>
  );
}

function buildActivationFunnel(
  items: ExposureRadarItemApi[],
  states: Record<string, ManualActionState>,
  records: ExposureRadarManualRecordApi[],
) {
  const stateValues = Object.values(states);
  const generated = Math.max(items.filter((item) => Boolean(item.generated_comment?.trim())).length, records.filter((record) => Boolean(record.generated_comment?.trim())).length);
  const copiedOrOpened = Math.max(
    stateValues.filter((state) => state.copied || state.opened).length,
    records.filter((record) => Boolean(record.copied_at || record.opened_at)).length,
  );
  const handledOrSaved = Math.max(
    stateValues.filter((state) => state.saved || state.handled || state.taskStatus === "done").length,
    records.filter((record) => Boolean(record.saved_at || record.handled_at || record.task_status === "done")).length,
  );
  const backfilled = Math.max(
    stateValues.filter((state) => Boolean(state.resultCheckedAt || state.resultScore || state.resultImpressionCount)).length,
    records.filter((record) => Boolean(record.result_checked_at || record.result_score || record.result_impression_count)).length,
  );
  const activeDays = new Set(records.map((record) => (record.handled_at || record.created_at || "").slice(0, 10)).filter(Boolean)).size;
  const returned = activeDays >= 2 ? activeDays : 0;
  const steps = [
    { key: "generated", count: generated, done: generated > 0 },
    { key: "copied", count: copiedOrOpened, done: copiedOrOpened > 0 },
    { key: "handled", count: handledOrSaved, done: handledOrSaved > 0 },
    { key: "backfilled", count: backfilled, done: backfilled > 0 },
    { key: "returned", count: returned, done: returned > 0 },
  ];
  return { steps, completed: steps.filter((step) => step.done).length };
}
