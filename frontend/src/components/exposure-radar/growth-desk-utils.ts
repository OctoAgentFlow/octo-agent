import { formatDateTime } from "@/lib/timezone";
import type { ExposureRadarData, ExposureRadarGrowthStrategyApi, ExposureRadarManualRecordApi, ExposureRadarSafetyCenterData, ExposureRadarWeeklyReviewData } from "@/services/exposure-radar.service";
import type { DailyActionPlanItem, ExposureLearningProfile, PeopleRadarEntry } from "@/components/exposure-radar/types";
import { compactTitle } from "@/components/exposure-radar/radar-signal-utils";
import { formatCompact, type TranslationFn } from "@/components/exposure-radar/radar-utils";

export function isRecentManualRecord(record: ExposureRadarManualRecordApi, hours: number) {
  const value = Math.max(
    manualRecordTimeValue(record.handled_at),
    manualRecordTimeValue(record.result_checked_at),
    manualRecordTimeValue(record.feedback_at),
    manualRecordTimeValue(record.updated_at),
    manualRecordTimeValue(record.created_at),
  );
  if (!value) return false;
  return Date.now() - value <= hours * 60 * 60 * 1000;
}

export function bestExposureResultRecord(records: ExposureRadarManualRecordApi[]) {
  return records
    .filter((record) => record.result_checked_at || record.result_score || record.result_impression_count)
    .slice()
    .sort((a, b) => {
      const scoreDelta = (b.result_score || 0) - (a.result_score || 0);
      if (scoreDelta !== 0) return scoreDelta;
      const impressionDelta = (b.result_impression_count || 0) - (a.result_impression_count || 0);
      if (impressionDelta !== 0) return impressionDelta;
      return manualRecordTimeValue(b.result_checked_at || b.updated_at) - manualRecordTimeValue(a.result_checked_at || a.updated_at);
    })[0];
}

export function buildGrowthDeskBrief({
  data,
  strategy,
  moves,
  people,
  recentRecords,
  weeklyReview,
  safety,
  timeZone,
  t,
}: {
  data: ExposureRadarData | null;
  strategy: ExposureRadarGrowthStrategyApi | null;
  moves: DailyActionPlanItem[];
  people: PeopleRadarEntry[];
  recentRecords: ExposureRadarManualRecordApi[];
  weeklyReview: ExposureRadarWeeklyReviewData | null;
  safety: ExposureRadarSafetyCenterData | null;
  timeZone: string;
  t: TranslationFn;
}) {
  const refreshed = data?.updated_at ? formatDateTime(data.updated_at, timeZone) : "-";
  const handledToday = recentRecords.filter((record) => isRecentManualRecord(record, 24) && (record.handled_at || record.task_status === "done")).length;
  const backfilledToday = recentRecords.filter((record) => isRecentManualRecord(record, 24) && (record.result_checked_at || record.result_score)).length;
  const safetyWarnings = (safety?.watch_count || 0) + (safety?.block_count || 0);
  const topMoves = moves.slice(0, 3).map((entry, index) => `${index + 1}. ${entry.item.title} ${entry.item.author_handle ? `@${entry.item.author_handle}` : ""} · ${entry.item.score}`);
  const topPeople = people.slice(0, 3).map((person, index) => `${index + 1}. ${person.name}${person.handle ? ` @${person.handle}` : ""} · ${person.stage}`);
  return [
    t("exposureRadar.command.brief.heading"),
    t("exposureRadar.command.brief.line.region", { region: data?.region || "-", refreshed }),
    t("exposureRadar.command.brief.line.strategy", { audience: strategy?.target_audience || "-", topics: (strategy?.core_topics || []).slice(0, 3).join(", ") || "-" }),
    t("exposureRadar.command.brief.line.metrics", { signals: data?.items.length || 0, moves: moves.length, handled: handledToday, backfilled: backfilledToday }),
    t("exposureRadar.command.brief.line.safety", { warnings: safetyWarnings, effective: weeklyReview ? `${Math.round((weeklyReview.effective_rate || 0) * 100)}%` : "-" }),
    "",
    t("exposureRadar.command.brief.line.moves"),
    topMoves.length ? topMoves.join("\n") : t("exposureRadar.command.brief.none"),
    "",
    t("exposureRadar.command.brief.line.people"),
    topPeople.length ? topPeople.join("\n") : t("exposureRadar.command.brief.none"),
    "",
    t("exposureRadar.command.brief.footer"),
  ].join("\n");
}

export function buildGrowthDeskBriefPreview({
  data,
  moves,
  people,
  safety,
  weeklyReview,
  t,
}: {
  data: ExposureRadarData | null;
  moves: DailyActionPlanItem[];
  people: PeopleRadarEntry[];
  safety: ExposureRadarSafetyCenterData | null;
  weeklyReview: ExposureRadarWeeklyReviewData | null;
  t: TranslationFn;
}) {
  return [
    t("exposureRadar.command.brief.previewLine.signals", { count: data?.items.length || 0 }),
    t("exposureRadar.command.brief.previewLine.moves", { count: moves.length }),
    t("exposureRadar.command.brief.previewLine.people", { count: people.length }),
    t("exposureRadar.command.brief.previewLine.safety", { count: (safety?.watch_count || 0) + (safety?.block_count || 0) }),
    t("exposureRadar.command.brief.previewLine.effective", { rate: weeklyReview ? `${Math.round((weeklyReview.effective_rate || 0) * 100)}%` : "-" }),
  ].join("\n");
}

export function buildDailyReviewReportText({
  data,
  strategy,
  moves,
  recentRecords,
  weeklyReview,
  safety,
  learningProfile,
  timeZone,
  t,
}: {
  data: ExposureRadarData | null;
  strategy: ExposureRadarGrowthStrategyApi | null;
  moves: DailyActionPlanItem[];
  recentRecords: ExposureRadarManualRecordApi[];
  weeklyReview: ExposureRadarWeeklyReviewData | null;
  safety: ExposureRadarSafetyCenterData | null;
  learningProfile: ExposureLearningProfile;
  timeZone: string;
  t: TranslationFn;
}) {
  const todayRecords = recentRecords.filter((record) => isRecentManualRecord(record, 24));
  const handledToday = todayRecords.filter((record) => record.handled_at || record.task_status === "done").length;
  const backfilledToday = todayRecords.filter((record) => record.result_checked_at || record.result_score).length;
  const effectiveToday = todayRecords.filter((record) => record.outcome === "effective" || (record.result_score || 0) >= 60).length;
  const topResult = bestExposureResultRecord(todayRecords) || bestExposureResultRecord(recentRecords);
  const topTopics = buildDailyReviewTopics(todayRecords, moves).slice(0, 4);
  const nextActions = buildDailyReviewActions({ data, moves, recentRecords, safety, learningProfile, t }).slice(0, 4);
  return [
    t("exposureRadar.dailyReview.report.heading"),
    t("exposureRadar.dailyReview.report.line.region", { region: data?.region || "-", time: data?.updated_at ? formatDateTime(data.updated_at, timeZone) : "-" }),
    t("exposureRadar.dailyReview.report.line.strategy", { audience: strategy?.target_audience || "-", topics: (strategy?.core_topics || []).slice(0, 4).join(", ") || "-" }),
    t("exposureRadar.dailyReview.report.line.metrics", { handled: handledToday, backfilled: backfilledToday, effective: effectiveToday, queued: moves.length }),
    t("exposureRadar.dailyReview.report.line.safety", { warnings: (safety?.watch_count || 0) + (safety?.block_count || 0), rate: weeklyReview ? `${Math.round((weeklyReview.effective_rate || 0) * 100)}%` : "-" }),
    topResult ? t("exposureRadar.dailyReview.report.line.best", { title: compactTitle(topResult.title || "-"), score: topResult.result_score || 0, views: formatCompact(topResult.result_impression_count || 0) }) : t("exposureRadar.dailyReview.report.line.bestEmpty"),
    t("exposureRadar.dailyReview.report.line.topics", { topics: topTopics.join(", ") || "-" }),
    "",
    t("exposureRadar.dailyReview.report.next"),
    nextActions.map((action, index) => `${index + 1}. ${action}`).join("\n"),
  ].join("\n");
}

export function buildDailyReviewTopics(records: ExposureRadarManualRecordApi[], moves: DailyActionPlanItem[]) {
  const counts = new Map<string, number>();
  const add = (value?: string) => {
    const topic = (value || "").trim();
    if (!topic) return;
    counts.set(topic, (counts.get(topic) || 0) + 1);
  };
  records.forEach((record) => add(record.topic_name || record.title));
  moves.forEach((move) => add(move.item.topic_name || move.item.title));
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([topic]) => compactTitle(topic));
}

export function buildDailyReviewActions({
  data,
  moves,
  recentRecords,
  safety,
  learningProfile,
  t,
}: {
  data: ExposureRadarData | null;
  moves: DailyActionPlanItem[];
  recentRecords: ExposureRadarManualRecordApi[];
  safety: ExposureRadarSafetyCenterData | null;
  learningProfile: ExposureLearningProfile;
  t: TranslationFn;
}) {
  const actions: string[] = [];
  const todayRecords = recentRecords.filter((record) => isRecentManualRecord(record, 24));
  const pendingBackfill = todayRecords.filter((record) => (record.handled_at || record.task_status === "done") && !record.result_checked_at && !record.result_score).length;
  if (pendingBackfill > 0) actions.push(t("exposureRadar.dailyReview.action.backfill", { count: pendingBackfill }));
  if (moves.length > 0) actions.push(t("exposureRadar.dailyReview.action.handle", { title: compactTitle(moves[0].item.title) }));
  if ((safety?.watch_count || 0) + (safety?.block_count || 0) > 0) actions.push(t("exposureRadar.dailyReview.action.safety"));
  if (learningProfile.boostedTopics.size > 0) actions.push(t("exposureRadar.dailyReview.action.reuseTopic", { topic: Array.from(learningProfile.boostedTopics)[0] }));
  if (data?.diagnostics?.top_missing_reason) actions.push(t("exposureRadar.dailyReview.action.fixSignal", { reason: data.diagnostics.top_missing_reason }));
  if (!actions.length) actions.push(t("exposureRadar.dailyReview.action.default"));
  return actions;
}

function manualRecordTimeValue(value?: string) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}
