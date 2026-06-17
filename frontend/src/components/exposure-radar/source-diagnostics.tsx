"use client";

import type { ReactNode } from "react";
import { Activity, CheckCircle2, Clock3, Database, Gauge, Info } from "lucide-react";

import { useT } from "@/i18n/use-t";
import { formatDateTime } from "@/lib/timezone";
import type { ExposureRadarData, ExposureRadarDiagnosticIssueApi, ExposureRadarDiagnosticsApi } from "@/services/exposure-radar.service";

export function SourceHealthPanel({ data, timeZone }: { data: ExposureRadarData; timeZone: string }) {
  const { t } = useT();
  const status = normalizeSourceStatus(data.source_status);
  const statusClass = sourceStatusClass(status);

  return (
    <div className="mt-4 rounded-2xl border border-[#2f3336] bg-black p-4">
      <div className="grid gap-3 md:grid-cols-4">
        <SourceMetaItem
          icon={<Database className="size-4" />}
          label={t("exposureRadar.source.type")}
          value={t(`exposureRadar.sourceType.${normalizeSourceType(data.source_type)}`)}
        />
        <SourceMetaItem
          icon={<CheckCircle2 className="size-4" />}
          label={t("exposureRadar.source.status")}
          value={t(`exposureRadar.sourceStatus.${status}`)}
          valueClassName={statusClass}
        />
        <SourceMetaItem
          icon={<Clock3 className="size-4" />}
          label={t("exposureRadar.source.lastCollected")}
          value={data.last_collected_at || data.updated_at ? formatDateTime(data.last_collected_at || data.updated_at || "", timeZone) : "-"}
        />
        <SourceMetaItem
          icon={<Activity className="size-4" />}
          label={t("exposureRadar.source.quality")}
          value={data.data_quality === "tweet_level" ? t("exposureRadar.quality.tweet") : t("exposureRadar.quality.topic")}
        />
      </div>
      <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2 text-xs leading-5 text-[#8b98a5]">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <p>{data.source_notice || t("exposureRadar.source.noNotice")}</p>
      </div>
    </div>
  );
}

export function CollectionDiagnosticsPanel({ diagnostics, timeZone }: { diagnostics: ExposureRadarDiagnosticsApi; timeZone: string }) {
  const { t } = useT();
  const status = normalizeDiagnosticStatus(diagnostics.status);
  const issues = diagnostics.issues || [];
  const suggestions = diagnosticSuggestions(diagnostics, t);
  const missingReason = diagnostics.top_missing_reason || "none";
  const visiblePool = diagnostics.visible_pool_count || diagnostics.tweet_level_count || 0;

  return (
    <div className="mt-4 rounded-2xl border border-[#2f3336] bg-black p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.diagnostics.title")}</p>
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${diagnosticStatusClass(status)}`}>
              <Gauge className="size-3.5" />
              {t(`exposureRadar.diagnostics.status.${status}`)}
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("exposureRadar.diagnostics.description")}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold ${diagnostics.x_trends_enabled ? "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" : "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]"}`}>
            <CheckCircle2 className="size-3.5" />
            {diagnostics.x_trends_enabled ? t("exposureRadar.diagnostics.xEnabled") : t("exposureRadar.diagnostics.xDisabled")}
          </span>
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-semibold ${diagnostics.bearer_token_configured ? "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" : "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]"}`}>
            <Database className="size-3.5" />
            {diagnostics.bearer_token_configured ? t("exposureRadar.diagnostics.tokenReady") : t("exposureRadar.diagnostics.tokenMissing")}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <DiagnosticMetric label={t("exposureRadar.diagnostics.metric.visible")} value={formatCompact(diagnostics.returned_count || 0)} detail={t("exposureRadar.diagnostics.metric.visibleDetail", { count: diagnostics.requested_limit || 0 })} />
        <DiagnosticMetric label={t("exposureRadar.diagnostics.metric.owned")} value={formatCompact(diagnostics.owned_signal_count || 0)} detail={diagnostics.latest_owned_signal_at ? formatDateTime(diagnostics.latest_owned_signal_at, timeZone) : t("exposureRadar.diagnostics.noOwnedTime")} />
        <DiagnosticMetric label={t("exposureRadar.diagnostics.metric.window")} value={formatCompact(diagnostics.owned_in_window_count || 0)} detail={t("exposureRadar.diagnostics.metric.windowDetail", { hours: diagnostics.window_hours || 0 })} />
        <DiagnosticMetric label={t("exposureRadar.diagnostics.metric.filteredFans")} value={formatCompact(diagnostics.owned_over_fan_limit || 0)} detail={t("exposureRadar.diagnostics.metric.filteredFansDetail", { fans: formatCompact(diagnostics.configured_max_fans || 0) })} />
        <DiagnosticMetric label={t("exposureRadar.diagnostics.metric.hot")} value={formatCompact(diagnostics.hot_opportunity_count || 0)} detail={t("exposureRadar.diagnostics.metric.hotDetail")} />
        <DiagnosticMetric label={t("exposureRadar.diagnostics.metric.rising")} value={formatCompact(diagnostics.rising_opportunity_count || 0)} detail={t("exposureRadar.diagnostics.metric.risingDetail")} />
        <DiagnosticMetric label={t("exposureRadar.diagnostics.metric.sampling")} value={formatCompact(diagnostics.needs_sampling_count || 0)} detail={t("exposureRadar.diagnostics.metric.samplingDetail")} />
        <DiagnosticMetric label={t("exposureRadar.diagnostics.metric.realViews")} value={formatCompact(diagnostics.real_impression_count || 0)} detail={t("exposureRadar.diagnostics.metric.realViewsDetail")} />
      </div>

      <div className="mt-4 rounded-xl border border-[#1d9bf0]/20 bg-[#07111a] p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.diagnostics.gap.title")}</p>
            <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{diagnosticMissingReasonDetail(diagnostics, t)}</p>
          </div>
          <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${missingReason === "none" ? "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" : "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]"}`}>
            <Gauge className="size-3.5" />
            {diagnosticMissingReasonText(missingReason, t)}
          </span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <DiagnosticMetric label={t("exposureRadar.diagnostics.gap.maxViews")} value={formatCompact(diagnostics.max_impression_count || 0)} detail={(diagnostics.hot_views_gap || 0) > 0 ? t("exposureRadar.diagnostics.gap.viewsMissing", { count: formatCompact(diagnostics.hot_views_gap || 0) }) : t("exposureRadar.diagnostics.gap.viewsReady")} />
          <DiagnosticMetric label={t("exposureRadar.diagnostics.gap.maxSpeed")} value={`${formatOneDecimal(diagnostics.max_views_per_minute || 0)}/min`} detail={(diagnostics.hot_velocity_gap || 0) > 0 ? t("exposureRadar.diagnostics.gap.speedMissing", { speed: formatOneDecimal(diagnostics.hot_velocity_gap || 0) }) : t("exposureRadar.diagnostics.gap.speedReady")} />
          <DiagnosticMetric label={t("exposureRadar.diagnostics.gap.realCoverage")} value={formatPercent(diagnostics.real_view_coverage || 0)} detail={t("exposureRadar.diagnostics.gap.realCoverageDetail", { count: diagnostics.window_real_view_count || 0, total: visiblePool })} />
          <DiagnosticMetric label={t("exposureRadar.diagnostics.gap.sampleCoverage")} value={formatPercent(diagnostics.sampling_coverage || 0)} detail={t("exposureRadar.diagnostics.gap.sampleCoverageDetail", { count: diagnostics.window_prior_sample_count || 0, total: visiblePool })} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
          <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.diagnostics.issuesTitle")}</p>
          <div className="mt-2 space-y-2">
            {issues.length ? issues.slice(0, 5).map((issue) => (
              <div key={`${issue.code}:${issue.severity}`} className="flex items-start gap-2 rounded-lg border border-[#2f3336] bg-black px-3 py-2">
                <span className={`mt-0.5 size-2 shrink-0 rounded-full ${diagnosticSeverityDot(issue.severity)}`} />
                <p className="text-xs leading-5 text-[#8b98a5]">{diagnosticIssueText(issue, t)}</p>
              </div>
            )) : (
              <p className="rounded-lg border border-dashed border-[#2f3336] bg-black px-3 py-4 text-center text-xs text-[#71767b]">{t("exposureRadar.diagnostics.noIssues")}</p>
            )}
          </div>
        </div>
        <div className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
          <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.diagnostics.suggestionsTitle")}</p>
          <div className="mt-2 space-y-2">
            {suggestions.map((text) => (
              <div key={text} className="flex items-start gap-2 rounded-lg border border-[#1d9bf0]/20 bg-[#07111a] px-3 py-2">
                <Info className="mt-0.5 size-3.5 shrink-0 text-[#8ecdf8]" />
                <p className="text-xs leading-5 text-[#8b98a5]">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-xs text-[#71767b] sm:grid-cols-3">
        <span>{t("exposureRadar.diagnostics.config.refresh", { minutes: diagnostics.refresh_interval_minutes || 0 })}</span>
        <span>{t("exposureRadar.diagnostics.config.topics", { count: diagnostics.topic_limit || 0 })}</span>
        <span>{t("exposureRadar.diagnostics.config.search", { count: diagnostics.search_results || 0, heat: diagnostics.configured_min_heat || 0 })}</span>
        <span>{t("exposureRadar.diagnostics.config.hotThreshold", { views: formatCompact(diagnostics.configured_hot_min_views || 0), speed: formatOneDecimal(diagnostics.configured_hot_min_velocity || 0) })}</span>
        <span>{t("exposureRadar.diagnostics.config.strongThreshold", { views: formatCompact(diagnostics.configured_strong_hot_min_views || 0), speed: formatOneDecimal(diagnostics.configured_strong_hot_min_velocity || 0) })}</span>
      </div>
    </div>
  );
}

function DiagnosticMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
      <p className="text-[11px] font-semibold uppercase tracking-normal text-[#71767b]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
      <p className="mt-1 truncate text-[11px] text-[#71767b]" title={detail}>{detail}</p>
    </div>
  );
}

function SourceMetaItem({ icon, label, value, valueClassName }: { icon: ReactNode; label: string; value: string; valueClassName?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-normal text-[#71767b]">{icon}{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold text-[#e7e9ea] ${valueClassName || ""}`}>{value}</p>
    </div>
  );
}

function normalizeSourceType(value?: string) {
  if (value === "owned_collector" || value === "tl1_fallback" || value === "x_trends_cache") return value;
  return "unknown";
}

function normalizeSourceStatus(value?: string) {
  if (value === "fresh" || value === "stale" || value === "fallback" || value === "cache" || value === "empty") return value;
  return "unknown";
}

function normalizeDiagnosticStatus(value?: string) {
  if (value === "healthy" || value === "warming" || value === "limited" || value === "empty" || value === "fallback" || value === "stale" || value === "blocked") return value;
  return "limited";
}

function sourceStatusClass(status: string) {
  if (status === "fresh") return "text-[#7ee0b5]";
  if (status === "stale" || status === "fallback") return "text-[#f6d96b]";
  if (status === "empty") return "text-[#ff8a91]";
  return "text-[#8ecdf8]";
}

function diagnosticStatusClass(status: string) {
  if (status === "healthy") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  if (status === "warming") return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  if (status === "limited" || status === "stale" || status === "fallback") return "border-[#f59e0b]/25 bg-[#f59e0b]/10 text-[#f6d96b]";
  if (status === "blocked" || status === "empty") return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
  return "border-[#2f3336] bg-[#16181c] text-[#8b98a5]";
}

function diagnosticSeverityDot(severity?: string) {
  if (severity === "critical") return "bg-[#f4212e]";
  if (severity === "warning") return "bg-[#f59e0b]";
  return "bg-[#1d9bf0]";
}

function diagnosticIssueText(issue: ExposureRadarDiagnosticIssueApi, t: (key: string, params?: Record<string, string | number>) => string) {
  const known = new Set([
    "diagnostic_query_failed",
    "x_trends_disabled",
    "bearer_token_missing",
    "external_fallback",
    "topic_cache_only",
    "collector_stale",
    "no_owned_signals",
    "window_too_short",
    "fan_filter_strict",
    "no_true_hot",
    "first_sample_only",
    "filters_empty",
  ]);
  if (known.has(issue.code)) return t(`exposureRadar.diagnostics.issue.${issue.code}`);
  return issue.message || issue.code;
}

function diagnosticMissingReasonText(reason: string, t: (key: string, params?: Record<string, string | number>) => string) {
  const code = reason || "none";
  const known = new Set([
    "none",
    "x_config_blocked",
    "no_owned_signals",
    "window_too_short",
    "fan_filter_strict",
    "query_low_yield",
    "x_impressions_sparse",
    "insufficient_resampling",
    "views_below_threshold",
    "velocity_below_threshold",
    "no_true_hot",
  ]);
  if (known.has(code)) return t(`exposureRadar.diagnostics.gap.reason.${code}`);
  return code;
}

function diagnosticMissingReasonDetail(diagnostics: ExposureRadarDiagnosticsApi, t: (key: string, params?: Record<string, string | number>) => string) {
  return t("exposureRadar.diagnostics.gap.detail", {
    views: formatCompact(diagnostics.configured_hot_min_views || 0),
    speed: formatOneDecimal(diagnostics.configured_hot_min_velocity || 0),
    pool: diagnostics.visible_pool_count || diagnostics.tweet_level_count || 0,
  });
}

function diagnosticSuggestions(diagnostics: ExposureRadarDiagnosticsApi, t: (key: string, params?: Record<string, string | number>) => string) {
  const codes = new Set((diagnostics.issues || []).map((issue) => issue.code));
  const suggestions: string[] = [];
  const add = (key: string) => {
    const value = t(key);
    if (!suggestions.includes(value)) suggestions.push(value);
  };
  if (codes.has("x_trends_disabled") || codes.has("bearer_token_missing")) add("exposureRadar.diagnostics.suggestion.configureToken");
  if (codes.has("no_owned_signals") || codes.has("collector_stale") || codes.has("first_sample_only")) add("exposureRadar.diagnostics.suggestion.manualRefresh");
  if (codes.has("window_too_short")) add("exposureRadar.diagnostics.suggestion.widenWindow");
  if (codes.has("fan_filter_strict")) add("exposureRadar.diagnostics.suggestion.raiseFans");
  if (codes.has("topic_cache_only") || codes.has("external_fallback")) add("exposureRadar.diagnostics.suggestion.researchOnly");
  if (codes.has("no_true_hot") && diagnostics.top_missing_reason) add(`exposureRadar.diagnostics.suggestion.${diagnostics.top_missing_reason}`);
  if (codes.has("no_true_hot")) add("exposureRadar.diagnostics.suggestion.useRising");
  if (suggestions.length === 0) add("exposureRadar.diagnostics.suggestion.operate");
  return suggestions.slice(0, 5);
}

function formatCompact(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(value >= 10000000 ? 0 : 1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
  return String(value);
}

function formatOneDecimal(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}
