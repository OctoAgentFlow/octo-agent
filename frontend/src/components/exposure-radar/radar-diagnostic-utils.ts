import type { ExposureRadarData, ExposureRadarDiagnosticIssueApi, ExposureRadarDiagnosticsApi, ExposureRadarItemApi, ExposureRadarResultRefreshApi } from "@/services/exposure-radar.service";
import { formatCompact, formatOneDecimal, normalizeQualityStage, normalizeVelocityState, type TranslationFn } from "@/components/exposure-radar/radar-utils";
import type { LeaderboardStats, LeaderboardStatus, LoadState, RankChange, SignalQualityStatus, WorkbenchStats } from "@/components/exposure-radar/types";

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

export function exposureSignalQualityStatus(data: ExposureRadarData | null, loadState: LoadState): SignalQualityStatus {
  if (loadState === "loading" || !data) return "warming";
  if (!data.items.length) return "empty";
  const diagnostics = data.diagnostics;
  if (diagnostics?.status === "limited" || diagnostics?.status === "stale" || diagnostics?.status === "fallback" || diagnostics?.status === "blocked") return "limited";
  if (data.items.some((item) => item.data_quality === "tweet_level" && normalizeQualityStage(item.quality_stage, item) !== "expired")) return "ready";
  return "warming";
}

export function signalQualityTone(status: SignalQualityStatus) {
  switch (status) {
    case "ready":
      return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
    case "empty":
      return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
    case "limited":
      return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
    default:
      return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  }
}

export function signalHealthDetail(data: ExposureRadarData | null, loadState: LoadState, t: TranslationFn) {
  if (loadState === "loading" || !data) return t("exposureRadar.command.signalHealth.detail.warming");
  if (!data.items.length) {
    const reason = data.diagnostics?.top_missing_reason || data.diagnostics?.top_missing_detail || data.source_notice || "-";
    return t("exposureRadar.command.signalHealth.detail.empty", { reason });
  }
  if (data.diagnostics?.top_missing_reason) {
    return t("exposureRadar.command.signalHealth.detail.limited", { reason: data.diagnostics.top_missing_reason });
  }
  return t("exposureRadar.command.signalHealth.detail.ready", { count: data.items.length });
}

export function apiBudgetMode(diagnostics: ExposureRadarDiagnosticsApi | null) {
  if (!diagnostics) return "conservative";
  if ((diagnostics.search_results || 0) <= 25 && (diagnostics.refresh_interval_minutes || 0) >= 30) return "conservative";
  return "standard";
}

export function apiBudgetWarnings(
  diagnostics: ExposureRadarDiagnosticsApi | null,
  summary: ExposureRadarResultRefreshApi | null,
  t: TranslationFn,
) {
  const warnings: string[] = [];
  if (!diagnostics?.bearer_token_configured) warnings.push(t("exposureRadar.apiBudget.warning.token"));
  if ((diagnostics?.search_results || 0) > 50) warnings.push(t("exposureRadar.apiBudget.warning.searchScope", { count: diagnostics?.search_results || 0 }));
  if ((diagnostics?.topic_limit || 0) > 24) warnings.push(t("exposureRadar.apiBudget.warning.topicScope", { count: diagnostics?.topic_limit || 0 }));
  if ((diagnostics?.refresh_interval_minutes || 0) > 0 && (diagnostics?.refresh_interval_minutes || 0) < 30) warnings.push(t("exposureRadar.apiBudget.warning.refreshFast", { minutes: diagnostics?.refresh_interval_minutes || 0 }));
  if ((summary?.failed_count || 0) > 0) warnings.push(t("exposureRadar.apiBudget.warning.lookupFailed", { count: summary?.failed_count || 0 }));
  return warnings.slice(0, 4);
}

export function shouldShowSignalRecovery(data: ExposureRadarData | null, loadState: LoadState, stats: WorkbenchStats) {
  if (loadState === "loading") return false;
  if (!data || data.items.length === 0) return true;
  const diagnostics = data.diagnostics;
  if (diagnostics?.status === "limited" || diagnostics?.status === "empty" || diagnostics?.status === "stale" || diagnostics?.status === "fallback" || diagnostics?.status === "blocked") return true;
  return stats.pending === 0 && (diagnostics?.hot_opportunity_count || 0) === 0 && (diagnostics?.rising_opportunity_count || 0) === 0;
}

export function signalRecoveryReason(
  data: ExposureRadarData | null,
  loadState: LoadState,
  t: TranslationFn,
) {
  if (loadState === "loading") return t("exposureRadar.recovery.reason.loading");
  if (!data || data.items.length === 0) return data?.diagnostics?.top_missing_reason || t("exposureRadar.recovery.reason.empty");
  if (data.diagnostics?.top_missing_reason) return data.diagnostics.top_missing_reason;
  if (data.diagnostics?.status === "limited" || data.diagnostics?.status === "stale" || data.diagnostics?.status === "fallback") return t("exposureRadar.recovery.reason.limited");
  return t("exposureRadar.recovery.reason.quiet");
}

export function signalRecoverySuggestions(
  diagnostics: ExposureRadarDiagnosticsApi | null,
  t: TranslationFn,
) {
  const suggestions: string[] = [];
  if (!diagnostics?.bearer_token_configured) suggestions.push(t("exposureRadar.recovery.suggestion.token"));
  if ((diagnostics?.visible_pool_count || 0) === 0) suggestions.push(t("exposureRadar.recovery.suggestion.query"));
  if ((diagnostics?.max_impression_count || 0) > 0 && (diagnostics?.hot_views_gap || 0) > 0) suggestions.push(t("exposureRadar.recovery.suggestion.threshold"));
  if ((diagnostics?.sampling_coverage || 0) < 0.35) suggestions.push(t("exposureRadar.recovery.suggestion.sampling"));
  if ((diagnostics?.tweet_level_count || 0) === 0 && (diagnostics?.topic_level_count || 0) > 0) suggestions.push(t("exposureRadar.recovery.suggestion.topicLevel"));
  if (!suggestions.length) suggestions.push(t("exposureRadar.recovery.suggestion.default"));
  return suggestions.slice(0, 4);
}

export function exposureMetricSummary(item: ExposureRadarItemApi) {
  const values = [
    typeof item.reply_count === "number" ? `replies=${item.reply_count}` : "",
    typeof item.retweet_count === "number" ? `reposts=${item.retweet_count}` : "",
    typeof item.like_count === "number" ? `likes=${item.like_count}` : "",
    typeof item.quote_count === "number" ? `quotes=${item.quote_count}` : "",
    typeof item.bookmark_count === "number" ? `bookmarks=${item.bookmark_count}` : "",
    typeof item.impression_count === "number" ? `impressions=${item.impression_count}` : "",
  ].filter(Boolean);
  return values.length ? `Public metrics: ${values.join("; ")}` : "";
}

export function buildLeaderboardStats(items: ExposureRadarItemApi[], rankChanges: Map<string, RankChange>): LeaderboardStats {
  const stats: LeaderboardStats = { new: 0, burst: 0, rising: 0, steady: 0, cooling: 0, unknown: 0, newCount: 0, movers: 0 };
  items.forEach((item) => {
    const state = normalizeVelocityState(item.velocity_state, item.status) as LeaderboardStatus;
    stats[state] = (stats[state] || 0) + 1;
  });
  rankChanges.forEach((change) => {
    if (change.kind === "new") stats.newCount += 1;
    if (change.kind === "up" || change.kind === "down") stats.movers += 1;
  });
  return stats;
}
