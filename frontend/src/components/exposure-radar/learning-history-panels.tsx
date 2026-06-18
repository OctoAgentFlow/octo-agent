"use client";

import { useMemo } from "react";

import { BoostedSignalsCard, LearningChangeSummaryCard, LearningControlsCard, LearningFeedbackCard, LearningImpactCard, ResultLearningStatusCard } from "@/components/exposure-radar/learning-insights-cards";
import { buildLearningChangeRows, buildLearningImpactRows } from "@/components/exposure-radar/learning-profile-utils";
import { PerformanceMetric } from "@/components/exposure-radar/performance-panel";
import { formatArchiveDate, formatCompact } from "@/components/exposure-radar/radar-utils";
import { ArchiveDayRow, ArchivePanelHeader, ArchiveTotalsMetrics } from "@/components/exposure-radar/topic-history-sections";
import type { ExposureLearningProfile, ManualActionState } from "@/components/exposure-radar/types";
import { Card, CardHeader } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";
import type { ExposureRadarArchiveData, ExposureRadarItemApi, ExposureRadarManualRecordApi, ExposureRadarPerformanceData } from "@/services/exposure-radar.service";

export function LearningInsightsPanel({
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
  const changeRows = buildLearningChangeRows(recentRecords, manualActionStates, learningProfile, t).slice(0, 4);
  const impactRows = buildLearningImpactRows(recentRecords, learningProfile, t).slice(0, 5);
  const localStates = Object.values(manualActionStates);
  const localHandledCount = localStates.filter((state) => state.handled || state.taskStatus === "done" || Boolean(state.publishedUrl)).length;
  const localBackfilledCount = localStates.filter(hasLocalResultMetrics).length;
  const recordHandledCount = recentRecords.filter((record) => record.handled_at || record.task_status === "done" || record.published_url).length;
  const recordBackfilledCount = recentRecords.filter(hasRecordResultMetrics).length;
  const handledCount = Math.max(localHandledCount, recordHandledCount);
  const backfilledCount = Math.max(localBackfilledCount, recordBackfilledCount);
  const pendingBackfillCount = Math.max(0, handledCount - backfilledCount);
  const learnedSignalCount = learningProfile.boostedTopics.size + learningProfile.cautiousTopics.size + learningProfile.preferredAngles.size;
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
      <div className="mt-4">
        <ResultLearningStatusCard
          handledCount={handledCount}
          pendingBackfillCount={pendingBackfillCount}
          backfilledCount={backfilledCount}
          learnedSignalCount={learnedSignalCount}
        />
      </div>
      <div className="mt-3">
        <LearningChangeSummaryCard rows={changeRows} />
      </div>
      <div className="mt-3 grid gap-3 xl:grid-cols-4">
        <LearningFeedbackCard effectiveCount={effectiveCount} neutralCount={neutralCount} negativeCount={negativeCount} />
        <BoostedSignalsCard items={boosted} />
        <LearningControlsCard controls={controls} topTopics={topTopics} />
        <LearningImpactCard rows={impactRows} />
      </div>
    </Card>
  );
}

function hasLocalResultMetrics(state: ManualActionState) {
  return Boolean(
    state.resultCheckedAt ||
      (state.resultScore || 0) > 0 ||
      (state.resultImpressionCount || 0) > 0 ||
      (state.resultLikeCount || 0) > 0 ||
      (state.resultReplyCount || 0) > 0 ||
      (state.resultRetweetCount || 0) > 0 ||
      (state.resultQuoteCount || 0) > 0 ||
      (state.resultBookmarkCount || 0) > 0,
  );
}

function hasRecordResultMetrics(record: ExposureRadarManualRecordApi) {
  return Boolean(
    record.result_checked_at ||
      (record.result_score || 0) > 0 ||
      (record.result_impression_count || 0) > 0 ||
      (record.result_like_count || 0) > 0 ||
      (record.result_reply_count || 0) > 0 ||
      (record.result_retweet_count || 0) > 0 ||
      (record.result_quote_count || 0) > 0 ||
      (record.result_bookmark_count || 0) > 0,
  );
}

export function TopicHistoryPanel({ data, timeZone }: { data: ExposureRadarArchiveData | null; timeZone: string }) {
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
