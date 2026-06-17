import type { ExposureRadarDiagnosticIssueApi, ExposureRadarDiagnosticsApi } from "@/services/exposure-radar.service";
import { formatCompact, formatOneDecimal, type TranslationFn } from "@/components/exposure-radar/radar-utils";

const knownDiagnosticIssueCodes = new Set([
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

const knownDiagnosticMissingReasons = new Set([
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

export function diagnosticIssueText(issue: ExposureRadarDiagnosticIssueApi, t: TranslationFn) {
  if (knownDiagnosticIssueCodes.has(issue.code)) return t(`exposureRadar.diagnostics.issue.${issue.code}`);
  return issue.message || issue.code;
}

export function diagnosticMissingReasonText(reason: string, t: TranslationFn) {
  const code = reason || "none";
  if (knownDiagnosticMissingReasons.has(code)) return t(`exposureRadar.diagnostics.gap.reason.${code}`);
  return code;
}

export function diagnosticMissingReasonDetail(diagnostics: ExposureRadarDiagnosticsApi, t: TranslationFn) {
  return t("exposureRadar.diagnostics.gap.detail", {
    views: formatCompact(diagnostics.configured_hot_min_views || 0),
    speed: formatOneDecimal(diagnostics.configured_hot_min_velocity || 0),
    pool: diagnostics.visible_pool_count || diagnostics.tweet_level_count || 0,
  });
}

export function diagnosticSuggestions(diagnostics: ExposureRadarDiagnosticsApi, t: TranslationFn) {
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
