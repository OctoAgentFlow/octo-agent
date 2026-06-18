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
  MemoryAssetDeskCard,
  OpportunityEvidenceDeskCard,
  PeopleRelationshipDeskCard,
  WeeklyOperatorReviewCard,
} from "@/components/exposure-radar/operating-desk-panels";
import { buildWeeklyFallbackRecommendations, buildWeeklyOperatorReport, topRecordLabels } from "@/components/exposure-radar/learning-report-utils";
import { buildAccountHealthScore, buildGrowthExperiments } from "@/components/exposure-radar/operating-analysis-utils";
import { buildSignalCredibility } from "@/components/exposure-radar/signal-analysis-utils";
import { radarItemSavedMemoryID } from "@/components/exposure-radar/radar-signal-utils";
import { formatCompact, formatOneDecimal, formatPercent, formatVelocityLabel } from "@/components/exposure-radar/radar-utils";
import type { ContentDraftBridgeData, DailyActionPlanItem, ExposureLearningProfile, LoadState, ManualActionState, PeopleRadarEntry, WorkbenchStats } from "@/components/exposure-radar/types";

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
  const evidenceScore = itemCountQualityScore(strong, usable, thin, weak);
  const qualityStatus = itemCountQualityStatus({ itemCount: items.length, strong, usable, weak, score: evidenceScore });
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
      qualityGate={{
        status: qualityStatus,
        score: evidenceScore,
        signal: topMove ? topMove.title : (diagnostics?.top_missing_reason || t("exposureRadar.evidenceDesk.quality.noSignal")),
      }}
    />
  );
}

function itemCountQualityScore(strong: number, usable: number, thin: number, weak: number) {
  const total = strong + usable + thin + weak;
  if (!total) return 0;
  return Math.round(((strong * 1 + usable * 0.7 + thin * 0.35) / total) * 100);
}

function itemCountQualityStatus({
  itemCount,
  strong,
  usable,
  weak,
  score,
}: {
  itemCount: number;
  strong: number;
  usable: number;
  weak: number;
  score: number;
}): "handle" | "observe" | "tune" {
  if (!itemCount || weak > strong + usable || score < 35) return "tune";
  if (strong >= 1 || strong + usable >= 3 || score >= 62) return "handle";
  return "observe";
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

export function PeopleRelationshipDeskPanel({ people, recentRecords, onFocus }: { people: PeopleRadarEntry[]; recentRecords: ExposureRadarManualRecordApi[]; onFocus: (itemID: string) => void }) {
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

export function MemoryAssetDeskPanel({
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
