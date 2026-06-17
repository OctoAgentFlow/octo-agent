"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Activity, ArrowRight, BarChart3, CheckCircle2, Clipboard, Clock3, Database, Eye, FileText, Flame, Gauge, Info, MessageCircle, MessageSquarePlus, RefreshCw, Search, ShieldAlert, ShieldCheck, Target, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { formatDateTime } from "@/lib/timezone";
import type { ExposureRadarData, ExposureRadarDiagnosticsApi, ExposureRadarGrowthStrategyApi, ExposureRadarManualRecordApi, ExposureRadarResultRefreshApi, ExposureRadarSafetyCenterData, ExposureRadarWeeklyReviewData } from "@/services/exposure-radar.service";
import { buildExposureLearningAngles, buildExposureLearningTopics } from "@/components/exposure-radar/learning-profile-utils";
import { DiagnosticMetric } from "@/components/exposure-radar/list-support";
import { bestExposureResultRecord, buildGrowthDeskBrief, buildGrowthDeskBriefPreview, isRecentManualRecord } from "@/components/exposure-radar/growth-desk-utils";
import { peopleRadarStageTone } from "@/components/exposure-radar/operating-desk-panels";
import { CommandList, CommandStep, GrowthDeskMetric, MiniStat } from "@/components/exposure-radar/panel-primitives";
import { apiBudgetMode, apiBudgetWarnings, diagnosticSuggestions, exposureSignalQualityStatus, signalHealthDetail, signalQualityTone, signalRecoveryReason, signalRecoverySuggestions } from "@/components/exposure-radar/radar-diagnostic-utils";
import { formatCompact, formatOneDecimal, formatPercent, formatVelocityLabel, normalizeContentDraftStatus, normalizeDiagnosticStatus, normalizeSourceStatus, normalizeSourceType, diagnosticStatusClass } from "@/components/exposure-radar/radar-utils";
import type { ContentDraftBridgeData, DailyActionPlanItem, LoadState, ManualActionState, PeopleRadarEntry } from "@/components/exposure-radar/types";

export function TeamHandoffPanel({
  moves,
  people,
  recentRecords,
  safety,
  timeZone,
}: {
  moves: DailyActionPlanItem[];
  people: PeopleRadarEntry[];
  recentRecords: ExposureRadarManualRecordApi[];
  safety: ExposureRadarSafetyCenterData | null;
  timeZone: string;
}) {
  const { t } = useT();
  const { pushToast } = useToast();
  const readyMoves = moves.slice(0, 3);
  const priorityPeople = people.filter((person) => person.stage === "priority" || person.stage === "repeat").slice(0, 3);
  const handledToday = recentRecords.filter((record) => isRecentManualRecord(record, 24) && (record.handled_at || record.task_status === "done")).length;
  const pendingBackfill = recentRecords.filter((record) => isRecentManualRecord(record, 72) && (record.handled_at || record.task_status === "done") && !record.result_checked_at && !record.result_score).length;
  const warnings = (safety?.watch_count || 0) + (safety?.block_count || 0);
  const report = [
    t("exposureRadar.handoff.report.heading"),
    t("exposureRadar.handoff.report.summary", { moves: readyMoves.length, handled: handledToday, backfill: pendingBackfill, warnings }),
    readyMoves.length ? t("exposureRadar.handoff.report.queue") : t("exposureRadar.handoff.report.queueEmpty"),
    ...readyMoves.map((entry, index) => t("exposureRadar.handoff.report.queueItem", {
      index: index + 1,
      title: entry.item.title,
      action: t(`exposureRadar.dailyAction.${entry.action}`),
      score: entry.item.score,
    })),
    priorityPeople.length ? t("exposureRadar.handoff.report.people") : t("exposureRadar.handoff.report.peopleEmpty"),
    ...priorityPeople.map((person) => t("exposureRadar.handoff.report.peopleItem", {
      name: person.name,
      handle: person.handle ? `@${person.handle}` : "-",
      count: person.count,
    })),
    t("exposureRadar.handoff.report.generatedAt", { time: formatDateTime(new Date().toISOString(), timeZone) }),
  ].join("\n");
  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report);
      pushToast(t("exposureRadar.handoff.copied"));
    } catch {
      pushToast(t("exposureRadar.handoff.copyFailed"));
    }
  };
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <CardHeader title={t("exposureRadar.handoff.title")} description={t("exposureRadar.handoff.description")} className="mb-0" />
        <Button type="button" variant="outline" onClick={() => void copyReport()}>
          <Clipboard className="size-4" />
          {t("exposureRadar.handoff.copy")}
        </Button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <GrowthDeskMetric icon={<MessageCircle className="size-3.5" />} label={t("exposureRadar.handoff.metric.ready")} value={String(readyMoves.length)} detail={t("exposureRadar.handoff.metric.readyDetail")} />
        <GrowthDeskMetric icon={<CheckCircle2 className="size-3.5" />} label={t("exposureRadar.handoff.metric.handled")} value={String(handledToday)} detail={t("exposureRadar.handoff.metric.handledDetail")} />
        <GrowthDeskMetric icon={<BarChart3 className="size-3.5" />} label={t("exposureRadar.handoff.metric.backfill")} value={String(pendingBackfill)} detail={t("exposureRadar.handoff.metric.backfillDetail")} />
        <GrowthDeskMetric icon={<ShieldAlert className="size-3.5" />} label={t("exposureRadar.handoff.metric.safety")} value={String(warnings)} detail={t("exposureRadar.handoff.metric.safetyDetail")} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.handoff.queueTitle")}</p>
          <div className="mt-3 space-y-2">
            {readyMoves.length ? readyMoves.map((entry, index) => (
              <div key={entry.item.id} className="rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2">
                <div className="flex items-start justify-between gap-3">
                  <p className="line-clamp-2 text-xs font-semibold text-[#e7e9ea]">{index + 1}. {entry.item.title}</p>
                  <span className="shrink-0 rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-2 py-0.5 text-[11px] font-semibold text-[#8ecdf8]">{entry.item.score}</span>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-[#71767b]">{t(`exposureRadar.dailyAction.${entry.action}`)} · {t(`exposureRadar.dailyActionReason.${entry.reason}`)}</p>
              </div>
            )) : (
              <p className="rounded-xl border border-dashed border-[#2f3336] px-3 py-6 text-center text-xs text-[#71767b]">{t("exposureRadar.handoff.queueEmpty")}</p>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.handoff.rolesTitle")}</p>
          <div className="mt-3 space-y-2">
            {["reviewer", "handler", "analyst"].map((key) => (
              <div key={key} className="rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2">
                <p className="text-xs font-semibold text-[#e7e9ea]">{t(`exposureRadar.handoff.role.${key}.title`)}</p>
                <p className="mt-1 text-[11px] leading-4 text-[#71767b]">{t(`exposureRadar.handoff.role.${key}.description`)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function AccountSafetyCenterPanel({
  safety,
  recentRecords,
  strategy,
}: {
  safety: ExposureRadarSafetyCenterData | null;
  recentRecords: ExposureRadarManualRecordApi[];
  strategy: ExposureRadarGrowthStrategyApi | null;
}) {
  const { t } = useT();
  const watch = safety?.watch_count || 0;
  const blocked = safety?.block_count || 0;
  const riskyRecords = recentRecords.filter((record) => record.safety_status === "watch" || record.safety_status === "block" || record.risk_level === "medium" || record.risk_level === "high").length;
  const posture = blocked > 0 ? "pause" : watch > 0 || riskyRecords > 0 ? "review" : "steady";
  const dailyLimit = Math.max(1, strategy?.daily_move_limit || 10);
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <CardHeader title={t("exposureRadar.accountSafety.title")} description={t("exposureRadar.accountSafety.description")} className="mb-0" />
        <span className={`inline-flex h-9 w-fit items-center gap-2 rounded-full border px-3 text-xs font-semibold ${posture === "steady" ? "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" : posture === "review" ? "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]" : "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]"}`}>
          {posture === "steady" ? <ShieldCheck className="size-3.5" /> : <ShieldAlert className="size-3.5" />}
          {t(`exposureRadar.accountSafety.posture.${posture}`)}
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <DiagnosticMetric label={t("exposureRadar.accountSafety.metric.dailyLimit")} value={String(dailyLimit)} detail={t("exposureRadar.accountSafety.metric.dailyLimitDetail")} />
        <DiagnosticMetric label={t("exposureRadar.accountSafety.metric.review")} value={String(watch)} detail={t("exposureRadar.accountSafety.metric.reviewDetail")} />
        <DiagnosticMetric label={t("exposureRadar.accountSafety.metric.blocked")} value={String(blocked)} detail={t("exposureRadar.accountSafety.metric.blockedDetail")} />
        <DiagnosticMetric label={t("exposureRadar.accountSafety.metric.risky")} value={String(riskyRecords)} detail={t("exposureRadar.accountSafety.metric.riskyDetail")} />
      </div>
      <div className="mt-4 rounded-2xl border border-[#2f3336] bg-black p-4">
        <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.accountSafety.rulesTitle")}</p>
        <div className="mt-3 space-y-2">
          {(safety?.warnings?.length ? safety.warnings.slice(0, 3) : ["manual", "context", "pace"]).map((item) => (
            <div key={item} className="flex gap-2 rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2 text-xs leading-5 text-[#8b98a5]">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[#7ee0b5]" />
              <span>{["manual", "context", "pace"].includes(item) ? t(`exposureRadar.accountSafety.rule.${item}`) : item}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function RadarDataHealthMonitorPanel({ data, loadState, timeZone }: { data: ExposureRadarData | null; loadState: LoadState; timeZone: string }) {
  const { t } = useT();
  const diagnostics = data?.diagnostics || null;
  const status = normalizeDiagnosticStatus(diagnostics?.status || (loadState === "loading" ? "warming" : data?.source_status));
  const suggestions = diagnostics ? diagnosticSuggestions(diagnostics, t).slice(0, 3) : [t("exposureRadar.dataHealth.suggestion.loading")];
  const sourceType = normalizeSourceType(data?.source_type);
  const sourceStatus = normalizeSourceStatus(data?.source_status);
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <CardHeader title={t("exposureRadar.dataHealth.title")} description={t("exposureRadar.dataHealth.description")} className="mb-0" />
        <span className={`inline-flex h-9 w-fit items-center gap-2 rounded-full border px-3 text-xs font-semibold ${diagnosticStatusClass(status)}`}>
          <Activity className="size-3.5" />
          {t(`exposureRadar.diagnostics.status.${status}`)}
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DiagnosticMetric label={t("exposureRadar.dataHealth.metric.source")} value={t(`exposureRadar.sourceType.${sourceType}`)} detail={t(`exposureRadar.sourceStatus.${sourceStatus}`)} />
        <DiagnosticMetric label={t("exposureRadar.dataHealth.metric.coverage")} value={formatPercent(diagnostics?.real_view_coverage || 0)} detail={t("exposureRadar.dataHealth.metric.coverageDetail", { count: diagnostics?.window_real_view_count || 0 })} />
        <DiagnosticMetric label={t("exposureRadar.dataHealth.metric.sampling")} value={formatPercent(diagnostics?.sampling_coverage || 0)} detail={t("exposureRadar.dataHealth.metric.samplingDetail", { count: diagnostics?.window_prior_sample_count || 0 })} />
        <DiagnosticMetric label={t("exposureRadar.dataHealth.metric.updated")} value={data?.last_collected_at ? formatDateTime(data.last_collected_at, timeZone) : "-"} detail={data?.updated_at ? formatDateTime(data.updated_at, timeZone) : t("exposureRadar.dataHealth.metric.updatedEmpty")} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.dataHealth.gapTitle")}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <MiniStat icon={<Eye className="size-3.5" />} label={t("exposureRadar.diagnostics.gap.maxViews")} value={formatCompact(diagnostics?.max_impression_count || 0)} />
            <MiniStat icon={<Gauge className="size-3.5" />} label={t("exposureRadar.diagnostics.gap.maxSpeed")} value={`${formatOneDecimal(diagnostics?.max_views_per_minute || 0)}/min`} />
            <MiniStat icon={<Flame className="size-3.5" />} label={t("exposureRadar.diagnostics.metric.hot")} value={formatCompact(diagnostics?.hot_opportunity_count || 0)} />
          </div>
        </div>
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.dataHealth.nextTitle")}</p>
          <div className="mt-3 space-y-2">
            {suggestions.map((suggestion) => (
              <div key={suggestion} className="flex gap-2 text-xs leading-5 text-[#8b98a5]">
                <Info className="mt-0.5 size-3.5 shrink-0 text-[#8ecdf8]" />
                <span>{suggestion}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function ContentDraftOperatingPanel({
  bridge,
  loading,
  exposureMoves,
  recentRecords,
  onRefresh,
}: {
  bridge: ContentDraftBridgeData;
  loading: boolean;
  exposureMoves: DailyActionPlanItem[];
  recentRecords: ExposureRadarManualRecordApi[];
  onRefresh: () => void;
}) {
  const { t } = useT();
  const draftStats = useMemo(() => {
    const activePlans = bridge.plans.filter((plan) => plan.enabled).length;
    const pendingDrafts = bridge.drafts.filter((draft) => draft.status === "draft" || draft.status === "pending_review" || draft.status === "approved" || draft.status === "ready_to_publish").length;
    const publishedDrafts = bridge.drafts.filter((draft) => draft.status === "published").length;
    return { activePlans, pendingDrafts, publishedDrafts };
  }, [bridge]);
  const handledToday = recentRecords.filter((record) => isRecentManualRecord(record, 24) && (record.handled_at || record.task_status === "done")).length;
  const topDraft = bridge.drafts.find((draft) => draft.status === "draft" || draft.status === "pending_review" || draft.status === "approved" || draft.status === "ready_to_publish") || bridge.drafts[0];
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <CardHeader title={t("exposureRadar.contentDesk.title")} description={t("exposureRadar.contentDesk.description")} className="mb-0" />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            {t("exposureRadar.contentDesk.refresh")}
          </Button>
          <Link href="/content-drafts" className="inline-flex h-9 items-center gap-1 rounded-full bg-[#1d9bf0] px-3 text-sm font-semibold text-white hover:bg-[#1a8cd8]">
            {t("exposureRadar.contentDesk.open")}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.contentDesk.loop.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.contentDesk.loop.description")}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <MiniStat icon={<MessageSquarePlus className="size-3.5" />} label={t("exposureRadar.contentDesk.metric.opportunities")} value={String(exposureMoves.length)} />
            <MiniStat icon={<FileText className="size-3.5" />} label={t("exposureRadar.contentDesk.metric.drafts")} value={String(draftStats.pendingDrafts)} />
            <MiniStat icon={<CheckCircle2 className="size-3.5" />} label={t("exposureRadar.contentDesk.metric.handled")} value={String(handledToday)} />
          </div>
          <div className="mt-3 rounded-xl border border-[#1d9bf0]/20 bg-[#08131f] p-3">
            <p className="text-xs font-semibold text-[#8ecdf8]">{t("exposureRadar.contentDesk.today.title")}</p>
            <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("exposureRadar.contentDesk.today.description", { replies: exposureMoves.length, drafts: draftStats.pendingDrafts })}</p>
          </div>
        </div>
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.contentDesk.content.title")}</p>
              <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.contentDesk.content.description")}</p>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[#2f3336] bg-[#16181c] px-2.5 py-1 text-[11px] font-semibold text-[#8b98a5]">
              <Database className="size-3.5" />
              {t("exposureRadar.contentDesk.metric.plans", { count: draftStats.activePlans })}
            </span>
          </div>
          {topDraft ? (
            <div className="mt-3 rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="line-clamp-2 text-sm font-semibold text-[#e7e9ea]">{topDraft.content_title || topDraft.content_direction || t("exposureRadar.contentDesk.content.untitled")}</p>
                <span className="shrink-0 rounded-full border border-[#2f3336] bg-black px-2 py-1 text-[11px] font-semibold text-[#8b98a5]">{t(`exposureRadar.contentDesk.status.${normalizeContentDraftStatus(topDraft.status)}`)}</span>
              </div>
              <p className="mt-2 line-clamp-3 text-xs leading-5 text-[#8b98a5]">{topDraft.generated_content}</p>
            </div>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-[#2f3336] bg-[#0f1419] px-3 py-6 text-center text-xs text-[#71767b]">{t("exposureRadar.contentDesk.content.empty")}</p>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MiniStat icon={<Clock3 className="size-3.5" />} label={t("exposureRadar.contentDesk.metric.pending")} value={String(draftStats.pendingDrafts)} />
            <MiniStat icon={<CheckCircle2 className="size-3.5" />} label={t("exposureRadar.contentDesk.metric.published")} value={String(draftStats.publishedDrafts)} />
          </div>
        </div>
      </div>
    </Card>
  );
}

export function XApiBudgetPanel({
  data,
  diagnostics,
  resultRefreshSummary,
  resultRefreshing,
  timeZone,
  onRefreshResults,
}: {
  data: ExposureRadarData | null;
  diagnostics: ExposureRadarDiagnosticsApi | null;
  resultRefreshSummary: ExposureRadarResultRefreshApi | null;
  resultRefreshing: boolean;
  timeZone: string;
  onRefreshResults: () => void;
}) {
  const { t } = useT();
  const mode = apiBudgetMode(diagnostics);
  const visibleCalls = diagnostics ? Math.max(0, (diagnostics.topic_limit || 0) * (diagnostics.search_results || 0)) : 0;
  const lookupScope = resultRefreshSummary?.eligible_count || 0;
  const warnings = apiBudgetWarnings(diagnostics, resultRefreshSummary, t);
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <CardHeader title={t("exposureRadar.apiBudget.title")} description={t("exposureRadar.apiBudget.description")} className="mb-0" />
        <div className="flex flex-wrap gap-2">
          <span className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold ${mode === "conservative" ? "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" : "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]"}`}>
            <Gauge className="size-3.5" />
            {t(`exposureRadar.apiBudget.mode.${mode}`)}
          </span>
          <Button type="button" variant="outline" onClick={onRefreshResults} disabled={resultRefreshing}>
            <RefreshCw className={`size-4 ${resultRefreshing ? "animate-spin" : ""}`} />
            {t("exposureRadar.resultRefresh.button")}
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DiagnosticMetric label={t("exposureRadar.apiBudget.metric.token")} value={diagnostics?.bearer_token_configured ? t("exposureRadar.apiBudget.ready") : t("exposureRadar.apiBudget.missing")} detail={diagnostics?.x_trends_enabled ? t("exposureRadar.apiBudget.xEnabled") : t("exposureRadar.apiBudget.xDisabled")} />
        <DiagnosticMetric label={t("exposureRadar.apiBudget.metric.search")} value={formatCompact(visibleCalls)} detail={t("exposureRadar.apiBudget.metric.searchDetail", { topics: diagnostics?.topic_limit || 0, results: diagnostics?.search_results || 0 })} />
        <DiagnosticMetric label={t("exposureRadar.apiBudget.metric.refresh")} value={`${diagnostics?.refresh_interval_minutes || 0}m`} detail={data?.last_collected_at ? formatDateTime(data.last_collected_at, timeZone) : t("exposureRadar.apiBudget.noCollection")} />
        <DiagnosticMetric label={t("exposureRadar.apiBudget.metric.lookup")} value={formatCompact(lookupScope)} detail={resultRefreshSummary ? t("exposureRadar.apiBudget.metric.lookupDetail", { refreshed: resultRefreshSummary.refreshed_count || 0, failed: resultRefreshSummary.failed_count || 0 }) : t("exposureRadar.apiBudget.metric.lookupEmpty")} />
      </div>
      {warnings.length ? (
        <div className="mt-3 rounded-2xl border border-[#ffd400]/25 bg-[#1f1a07] p-4">
          <p className="text-sm font-semibold text-[#f6d96b]">{t("exposureRadar.apiBudget.warning.title")}</p>
          <ul className="mt-2 space-y-2">
            {warnings.map((warning) => (
              <li key={warning} className="flex gap-2 text-xs leading-5 text-[#e7e9ea]">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#ffd400]" />
                <span>{warning}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-3 rounded-2xl border border-[#2f3336] bg-black p-4">
        <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.apiBudget.guardrail.title")}</p>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {["manual", "bounded", "visible"].map((key) => (
            <div key={key} className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
              <p className="text-xs font-semibold text-[#e7e9ea]">{t(`exposureRadar.apiBudget.guardrail.${key}.title`)}</p>
              <p className="mt-1 text-xs leading-5 text-[#71767b]">{t(`exposureRadar.apiBudget.guardrail.${key}.description`)}</p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function SignalRecoveryPanel({
  data,
  loadState,
  currentHours,
  currentMaxFans,
  onWidenWindow,
  onRaiseFans,
  onRefresh,
}: {
  data: ExposureRadarData | null;
  loadState: LoadState;
  currentHours: number;
  currentMaxFans: number;
  onWidenWindow: () => void;
  onRaiseFans: () => void;
  onRefresh: () => void;
}) {
  const { t } = useT();
  const diagnostics = data?.diagnostics || null;
  const reason = signalRecoveryReason(data, loadState, t);
  const suggestions = signalRecoverySuggestions(diagnostics, t);
  return (
    <Card className="border-[#ffd400]/20 bg-[#120f05]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <CardHeader title={t("exposureRadar.recovery.title")} description={t("exposureRadar.recovery.description")} className="mb-0" />
        <span className="inline-flex h-9 w-fit items-center gap-2 rounded-full border border-[#ffd400]/25 bg-[#ffd400]/10 px-3 text-xs font-semibold text-[#f6d96b]">
          <Search className="size-3.5" />
          {t("exposureRadar.recovery.reason", { reason })}
        </span>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DiagnosticMetric label={t("exposureRadar.recovery.metric.visible")} value={formatCompact(diagnostics?.visible_pool_count || data?.items.length || 0)} detail={diagnostics?.top_missing_reason || data?.source_notice || "-"} />
        <DiagnosticMetric label={t("exposureRadar.recovery.metric.hot")} value={formatCompact(diagnostics?.hot_opportunity_count || 0)} detail={t("exposureRadar.recovery.metric.maxViews", { value: formatCompact(diagnostics?.max_impression_count || 0) })} />
        <DiagnosticMetric label={t("exposureRadar.recovery.metric.rising")} value={formatCompact(diagnostics?.rising_opportunity_count || 0)} detail={t("exposureRadar.recovery.metric.maxVelocity", { value: formatOneDecimal(diagnostics?.max_views_per_minute || 0) })} />
        <DiagnosticMetric label={t("exposureRadar.recovery.metric.coverage")} value={`${Math.round((diagnostics?.sampling_coverage || 0) * 100)}%`} detail={t("exposureRadar.recovery.metric.window", { hours: currentHours, fans: formatCompact(currentMaxFans) })} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.recovery.suggestions")}</p>
          <div className="mt-3 space-y-2">
            {suggestions.map((suggestion) => (
              <div key={suggestion} className="flex gap-2 rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2 text-xs leading-5 text-[#8b98a5]">
                <Info className="mt-0.5 size-3.5 shrink-0 text-[#f6d96b]" />
                <span>{suggestion}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.recovery.actionsTitle")}</p>
          <div className="mt-3 grid gap-2">
            <Button type="button" variant="outline" onClick={onWidenWindow} disabled={currentHours >= 8}>
              <Clock3 className="size-4" />
              {t("exposureRadar.recovery.action.widen")}
            </Button>
            <Button type="button" variant="outline" onClick={onRaiseFans} disabled={currentMaxFans >= 50000}>
              <Users className="size-4" />
              {t("exposureRadar.recovery.action.raiseFans")}
            </Button>
            <Button type="button" variant="outline" onClick={onRefresh}>
              <RefreshCw className="size-4" />
              {t("exposureRadar.recovery.action.refresh")}
            </Button>
            <a href="#radar-strategy" className="inline-flex h-9 items-center justify-center gap-1 rounded-full bg-[#1d9bf0] px-3 text-sm font-semibold text-white hover:bg-[#1a8cd8]">
              {t("exposureRadar.recovery.action.strategy")}
              <ArrowRight className="size-4" />
            </a>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function GrowthDeskCommandPanel({
  data,
  strategy,
  moves,
  people,
  recentRecords,
  weeklyReview,
  safety,
  timeZone,
  loadState,
  manualActionStates,
  resultRefreshing,
  resultRefreshSummary,
  onRefreshResults,
  onFocusItem,
}: {
  data: ExposureRadarData | null;
  strategy: ExposureRadarGrowthStrategyApi | null;
  moves: DailyActionPlanItem[];
  people: PeopleRadarEntry[];
  recentRecords: ExposureRadarManualRecordApi[];
  weeklyReview: ExposureRadarWeeklyReviewData | null;
  safety: ExposureRadarSafetyCenterData | null;
  timeZone: string;
  loadState: LoadState;
  manualActionStates: Record<string, ManualActionState>;
  resultRefreshing: boolean;
  resultRefreshSummary: ExposureRadarResultRefreshApi | null;
  onRefreshResults: () => void;
  onFocusItem: (itemID: string) => void;
}) {
  const { t } = useT();
  const { pushToast } = useToast();
  const items = data?.items || [];
  const handledToday = recentRecords.filter((record) => isRecentManualRecord(record, 24) && (record.handled_at || record.task_status === "done")).length;
  const backfilledToday = recentRecords.filter((record) => isRecentManualRecord(record, 24) && (record.result_checked_at || record.result_score)).length;
  const pendingBackfill = recentRecords.filter((record) => (record.handled_at || record.published_url || record.task_status === "done") && !record.result_checked_at && !record.result_score).slice(0, 5);
  const bestResult = bestExposureResultRecord(recentRecords);
  const topMove = moves[0];
  const topPeople = people.slice(0, 3);
  const safetyWarnings = (safety?.watch_count || 0) + (safety?.block_count || 0);
  const signalQuality = exposureSignalQualityStatus(data, loadState);
  const learningTopics = buildExposureLearningTopics(recentRecords, items).slice(0, 4);
  const learningAngles = buildExposureLearningAngles(recentRecords, manualActionStates).slice(0, 4);
  const copyBrief = async () => {
    const brief = buildGrowthDeskBrief({
      data,
      strategy,
      moves,
      people: topPeople,
      recentRecords,
      weeklyReview,
      safety,
      timeZone,
      t,
    });
    try {
      await navigator.clipboard.writeText(brief);
      pushToast(t("exposureRadar.command.copyToast"));
    } catch {
      pushToast(t("exposureRadar.manualAction.copyFailed"));
    }
  };

  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <CardHeader title={t("exposureRadar.command.title")} description={t("exposureRadar.command.description")} className="mb-0" />
        <div className="flex flex-wrap gap-2">
          <a href="#radar-workbench" className="inline-flex h-9 items-center gap-1 rounded-full bg-[#1d9bf0] px-3 text-sm font-semibold text-white hover:bg-[#1a8cd8]">
            {t("exposureRadar.command.openWorkbench")}
            <ArrowRight className="size-4" />
          </a>
          <Button type="button" variant="outline" onClick={() => void copyBrief()}>
            <Clipboard className="size-4" />
            {t("exposureRadar.command.copyBrief")}
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {["p58", "p59", "p60", "p61", "p62", "p63", "p64"].map((key) => (
          <span key={key} className="inline-flex items-center gap-1 rounded-full border border-[#2f3336] bg-black px-2.5 py-1 text-[11px] font-semibold text-[#8b98a5]">
            {t(`exposureRadar.command.milestone.${key}`)}
          </span>
        ))}
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.command.plan.title")}</p>
              <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.command.plan.description")}</p>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-3 py-1 text-xs font-semibold text-[#8ecdf8]">
              <Clock3 className="size-3.5" />
              {t("exposureRadar.command.plan.timebox")}
            </span>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-4">
            <CommandStep index={1} title={t("exposureRadar.command.plan.scan.title")} detail={t("exposureRadar.command.plan.scan.detail", { count: items.length })} anchor="#radar-setup" />
            <CommandStep index={2} title={t("exposureRadar.command.plan.reply.title")} detail={t("exposureRadar.command.plan.reply.detail", { count: moves.length })} anchor="#radar-workbench" />
            <CommandStep index={3} title={t("exposureRadar.command.plan.people.title")} detail={t("exposureRadar.command.plan.people.detail", { count: topPeople.length })} anchor="#radar-people" />
            <CommandStep index={4} title={t("exposureRadar.command.plan.learn.title")} detail={t("exposureRadar.command.plan.learn.detail", { count: backfilledToday })} anchor="#radar-results" />
          </div>
          {topMove ? (
            <div className="mt-4 rounded-xl border border-[#1d9bf0]/25 bg-[#08131f] p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#8ecdf8]">{t("exposureRadar.command.plan.topMove")}</p>
                  <p className="mt-1 line-clamp-2 text-sm font-semibold text-[#e7e9ea]">{topMove.item.title}</p>
                  <p className="mt-1 text-xs leading-5 text-[#71767b]">{t(`exposureRadar.actionPlan.reason.${topMove.reason}`)}</p>
                </div>
                <Button type="button" size="sm" onClick={() => onFocusItem(topMove.item.id)}>
                  <Search className="size-3.5" />
                  {t("exposureRadar.command.focus")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.command.results.title")}</p>
              <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.command.results.description")}</p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={onRefreshResults} disabled={resultRefreshing || pendingBackfill.length === 0}>
              <RefreshCw className={`size-3.5 ${resultRefreshing ? "animate-spin" : ""}`} />
              {t("exposureRadar.resultRefresh.button")}
            </Button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <MiniStat icon={<CheckCircle2 className="size-3.5" />} label={t("exposureRadar.command.results.handled")} value={String(handledToday)} />
            <MiniStat icon={<BarChart3 className="size-3.5" />} label={t("exposureRadar.command.results.backfilled")} value={String(backfilledToday)} />
            <MiniStat icon={<Clock3 className="size-3.5" />} label={t("exposureRadar.command.results.pending")} value={String(pendingBackfill.length)} />
          </div>
          {resultRefreshSummary ? (
            <div className="mt-3 rounded-xl border border-[#1d9bf0]/20 bg-[#08131f] p-3">
              <p className="text-xs font-semibold text-[#8ecdf8]">{t("exposureRadar.resultRefresh.summary", { refreshed: resultRefreshSummary.refreshed_count || 0, eligible: resultRefreshSummary.eligible_count || 0 })}</p>
              <p className="mt-1 text-[11px] leading-5 text-[#71767b]">{resultRefreshSummary.message || t("exposureRadar.resultRefresh.noMessage")}</p>
            </div>
          ) : null}
          {bestResult ? (
            <div className="mt-3 rounded-xl border border-[#00ba7c]/25 bg-[#061a14] p-3">
              <p className="text-xs font-semibold text-[#7ee0b5]">{t("exposureRadar.command.results.best")}</p>
              <p className="mt-1 line-clamp-2 text-sm font-semibold text-[#e7e9ea]">{bestResult.title || bestResult.topic_name || bestResult.signal_id}</p>
              <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("exposureRadar.command.results.bestDetail", { score: bestResult.result_score || 0, impressions: formatCompact(bestResult.result_impression_count || 0) })}</p>
            </div>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-[#2f3336] bg-[#0f1419] px-3 py-4 text-xs leading-5 text-[#71767b]">{t("exposureRadar.command.results.empty")}</p>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.command.people.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.command.people.description")}</p>
          <div className="mt-3 space-y-2">
            {topPeople.length ? topPeople.map((person) => (
              <button key={person.key} type="button" onClick={() => onFocusItem(person.latestItem.id)} className="w-full rounded-xl border border-[#2f3336] bg-[#0f1419] p-3 text-left transition hover:border-[#1d9bf0]/45">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#e7e9ea]">{person.name}</p>
                    {person.handle ? <p className="mt-0.5 text-xs text-[#71767b]">@{person.handle}</p> : null}
                  </div>
                  <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold ${peopleRadarStageTone(person.stage)}`}>{t(`exposureRadar.peopleRadar.stage.${person.stage}`)}</span>
                </div>
                <p className="mt-2 text-xs leading-5 text-[#8b98a5]">{t("exposureRadar.command.people.next", { count: person.count, score: person.maxScore })}</p>
              </button>
            )) : <p className="rounded-xl border border-dashed border-[#2f3336] bg-[#0f1419] px-3 py-4 text-xs leading-5 text-[#71767b]">{t("exposureRadar.command.people.empty")}</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.command.safety.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.command.safety.description")}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MiniStat icon={<ShieldAlert className="size-3.5" />} label={t("exposureRadar.command.safety.warnings")} value={String(safetyWarnings)} />
            <MiniStat icon={<Target className="size-3.5" />} label={t("exposureRadar.command.safety.mode")} value={strategy?.safety_mode ? t(`exposureRadar.strategy.safetyMode.${strategy.safety_mode}`) : "-"} />
          </div>
          <ul className="mt-3 space-y-2">
            {["manual", "pace", "fit"].map((key) => (
              <li key={key} className="flex gap-2 text-xs leading-5 text-[#8b98a5]">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#00ba7c]" />
                <span>{t(`exposureRadar.command.safety.rule.${key}`)}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.command.signalHealth.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.command.signalHealth.description")}</p>
          <div className={`mt-3 rounded-xl border p-3 ${signalQualityTone(signalQuality)}`}>
            <p className="text-sm font-semibold">{t(`exposureRadar.command.signalHealth.status.${signalQuality}`)}</p>
            <p className="mt-1 text-xs leading-5 opacity-85">{signalHealthDetail(data, loadState, t)}</p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <MiniStat icon={<Eye className="size-3.5" />} label={t("exposureRadar.command.signalHealth.maxViews")} value={formatCompact(data?.diagnostics?.max_impression_count || 0)} />
            <MiniStat icon={<Gauge className="size-3.5" />} label={t("exposureRadar.command.signalHealth.maxVelocity")} value={formatVelocityLabel(data?.diagnostics?.max_views_per_minute || 0, "-")} />
          </div>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.command.learning.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.command.learning.description")}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <CommandList title={t("exposureRadar.command.learning.topics")} items={learningTopics} empty={t("exposureRadar.command.learning.empty")} />
            <CommandList title={t("exposureRadar.command.learning.angles")} items={learningAngles} empty={t("exposureRadar.command.learning.empty")} />
          </div>
        </div>
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.command.brief.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.command.brief.description")}</p>
          <div className="mt-3 rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
            <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.command.brief.previewTitle")}</p>
            <p className="mt-2 whitespace-pre-line text-xs leading-5 text-[#8b98a5]">{buildGrowthDeskBriefPreview({ data, moves, people: topPeople, safety, weeklyReview, t })}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
