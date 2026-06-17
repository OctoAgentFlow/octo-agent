"use client";

import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import type {
  ExposureRadarData,
  ExposureRadarGrowthStrategyApi,
  ExposureRadarItemApi,
  ExposureRadarManualRecordApi,
  ExposureRadarSafetyCenterData,
  ExposureRadarWeeklyReviewData,
} from "@/services/exposure-radar.service";
import {
  AccountHealthScoreCard,
  GrowthExperimentCard,
  OpportunityEvidenceDeskCard,
  WeeklyOperatorReviewCard,
} from "@/components/exposure-radar/operating-desk-panels";
import { buildWeeklyFallbackRecommendations, buildWeeklyOperatorReport } from "@/components/exposure-radar/learning-report-utils";
import { buildAccountHealthScore, buildGrowthExperiments } from "@/components/exposure-radar/operating-analysis-utils";
import { buildSignalCredibility } from "@/components/exposure-radar/signal-analysis-utils";
import { formatCompact, formatOneDecimal, formatPercent, formatVelocityLabel } from "@/components/exposure-radar/radar-utils";
import type { DailyActionPlanItem, ExposureLearningProfile, LoadState, WorkbenchStats } from "@/components/exposure-radar/types";

export function AccountHealthScorePanel({
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

export function OpportunityEvidenceDeskPanel({ items, moves, data, loadState }: { items: ExposureRadarItemApi[]; moves: DailyActionPlanItem[]; data: ExposureRadarData | null; loadState: LoadState }) {
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

export function GrowthExperimentPanel({
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

export function WeeklyOperatorReviewPanel({
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
