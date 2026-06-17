"use client";

import { ArrowRight, BarChart3, BrainCircuit, CheckCircle2, Clipboard, Clock3, Database, ShieldAlert, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import type { ExposureRadarData, ExposureRadarGrowthStrategyApi, ExposureRadarManualRecordApi, ExposureRadarSafetyCenterData, ExposureRadarWeeklyReviewData } from "@/services/exposure-radar.service";
import { resultLearningTone } from "@/components/exposure-radar/display-helper-utils";
import { bestExposureResultRecord, buildDailyReviewActions, buildDailyReviewReportText, buildDailyReviewTopics, isRecentManualRecord } from "@/components/exposure-radar/growth-desk-utils";
import { buildResultLearningMoves, buildResultLearningSummary } from "@/components/exposure-radar/learning-report-utils";
import { GrowthDeskMetric } from "@/components/exposure-radar/panel-primitives";
import { formatCompact } from "@/components/exposure-radar/radar-utils";
import type { DailyActionPlanItem, ExposureLearningProfile } from "@/components/exposure-radar/types";

export function DailyReviewReportPanel({
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

export function ResultLearningLoopPanel({
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
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold">{action.title}</p>
              {action.metric ? (
                <span className="max-w-[9rem] truncate rounded-full border border-current/20 bg-black/25 px-2 py-0.5 text-[11px] font-semibold">
                  {action.metric}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-xs leading-5 opacity-85">{action.detail}</p>
            {action.actionLabel ? (
              <p className="mt-3 inline-flex items-center gap-1 rounded-full border border-current/20 bg-black/25 px-2.5 py-1 text-[11px] font-semibold">
                {action.actionLabel}
                <ArrowRight className="size-3" />
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}
