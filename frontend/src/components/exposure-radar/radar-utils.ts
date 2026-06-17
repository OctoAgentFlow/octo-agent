import type { ExposureRadarItemApi } from "@/services/exposure-radar.service";
import type { DailyTaskStatus, ManualOutcome, PeopleRadarStage, SafetyReviewStatus } from "@/components/exposure-radar/types";

export type TranslationFn = (key: string, params?: Record<string, string | number>) => string;

export function formatVelocityLabel(value: number | undefined, samplingLabel: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return samplingLabel;
  }
  const rounded = Math.round(value);
  if (rounded < 1) {
    return samplingLabel;
  }
  return `${rounded}/min`;
}

export function formatFreshness(seconds: number, t: TranslationFn) {
  if (!Number.isFinite(seconds) || seconds < 0) return "-";
  if (seconds < 60) return t("exposureRadar.leaderboard.secondsAgo", { count: Math.round(seconds) });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t("exposureRadar.leaderboard.minutesAgo", { count: minutes });
  return t("exposureRadar.leaderboard.hoursAgo", { count: Math.round(minutes / 60) });
}

export function formatArchiveDate(value: string, timeZone: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone }).format(date);
}

export function formatCompact(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(value >= 10000000 ? 0 : 1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
  return String(value);
}

export function formatOneDecimal(value: number) {
  if (!Number.isFinite(value)) return "0";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function normalizeManualTaskStatus(value?: string): DailyTaskStatus | undefined {
  if (value === "todo" || value === "in_progress" || value === "done" || value === "skipped" || value === "later") return value;
  return undefined;
}

export function normalizeManualOutcome(value?: string): ManualOutcome | undefined {
  if (value === "effective" || value === "neutral" || value === "ineffective" || value === "not_suitable") return value;
  return undefined;
}

export function normalizeSafetyReviewStatus(value?: string): SafetyReviewStatus | undefined {
  if (value === "pass" || value === "watch" || value === "block") return value;
  return undefined;
}

export function normalizePeopleRadarStage(value?: string): PeopleRadarStage {
  if (value === "priority" || value === "repeat" || value === "engaged" || value === "watch" || value === "avoid" || value === "new") return value;
  return "new";
}

export function normalizeContentDraftStatus(value?: string) {
  if (value === "published") return "published";
  if (value === "rejected") return "rejected";
  if (value === "failed") return "failed";
  if (value === "approved" || value === "ready_to_publish") return "ready";
  if (value === "pending_review") return "review";
  return "draft";
}

export function normalizeSourceType(value?: string) {
  if (value === "owned_collector" || value === "tl1_fallback" || value === "x_trends_cache") return value;
  return "unknown";
}

export function normalizeSourceStatus(value?: string) {
  if (value === "fresh" || value === "stale" || value === "fallback" || value === "cache" || value === "empty") return value;
  return "unknown";
}

export function normalizeDiagnosticStatus(value?: string) {
  if (value === "healthy" || value === "warming" || value === "limited" || value === "empty" || value === "fallback" || value === "stale" || value === "blocked") return value;
  return "limited";
}

export function normalizeVelocityState(value?: string, fallback?: string) {
  const raw = (value || fallback || "").toLowerCase();
  if (raw === "new" || raw === "burst" || raw === "rising" || raw === "steady" || raw === "cooling") return raw;
  if (raw === "fire") return "burst";
  if (raw === "hot") return "rising";
  if (raw === "observed" || raw === "normal") return "steady";
  return "unknown";
}

export function normalizeOpportunityTier(value?: string) {
  if (value === "hot_opportunity") return "hot_opportunity";
  if (value === "rising_opportunity" || value === "rising_signal") return "rising_opportunity";
  if (value === "topic_lead") return "topic_lead";
  if (value === "needs_sampling" || value === "early_signal") return "needs_sampling";
  return "needs_sampling";
}

export function normalizeQualityStage(value?: string, item?: ExposureRadarItemApi) {
  if (value === "act_now" || value === "watch" || value === "expired") return value;
  const tier = normalizeOpportunityTier(item?.opportunity_tier);
  const velocityState = normalizeVelocityState(item?.velocity_state, item?.status);
  if (item?.cooling || velocityState === "cooling") return "expired";
  if (item?.risk_level === "medium" || item?.risk_level === "high") return "watch";
  if (tier === "hot_opportunity" && (velocityState === "burst" || velocityState === "rising" || (item?.score || 0) >= 75)) return "act_now";
  if (tier === "rising_opportunity" && (velocityState === "burst" || (item?.views_per_min || 0) >= 8 || (item?.score || 0) >= 85)) return "act_now";
  return "watch";
}

export function normalizeDataConfidence(value?: string, dataQuality?: string) {
  if (value === "real_impressions" || value === "engagement_estimate" || value === "topic_level" || value === "first_sample") return value;
  return dataQuality === "topic_level" ? "topic_level" : "first_sample";
}

export function qualityStageClass(stage: string) {
  switch (normalizeQualityStage(stage)) {
    case "act_now":
      return "border-[#00ba7c]/30 bg-[#00ba7c]/10 text-[#7ee0b5]";
    case "expired":
      return "border-[#64748b]/35 bg-[#64748b]/10 text-[#94a3b8]";
    default:
      return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  }
}

export function sourceStatusClass(status: string) {
  if (status === "fresh") return "text-[#7ee0b5]";
  if (status === "stale" || status === "fallback") return "text-[#f6d96b]";
  if (status === "empty") return "text-[#ff8a91]";
  return "text-[#8ecdf8]";
}

export function diagnosticStatusClass(status: string) {
  if (status === "healthy") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  if (status === "warming") return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  if (status === "limited" || status === "stale" || status === "fallback") return "border-[#f59e0b]/25 bg-[#f59e0b]/10 text-[#f6d96b]";
  if (status === "blocked" || status === "empty") return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
  return "border-[#2f3336] bg-[#16181c] text-[#8b98a5]";
}

export function diagnosticSeverityDot(severity?: string) {
  if (severity === "critical") return "bg-[#f4212e]";
  if (severity === "warning") return "bg-[#f59e0b]";
  return "bg-[#1d9bf0]";
}
