import type { ExposureRadarItemApi } from "@/services/exposure-radar.service";
import { formatCompact, formatOneDecimal, normalizeOpportunityTier, normalizeQualityStage, type TranslationFn } from "@/components/exposure-radar/radar-utils";
import type { ResultLearningMove } from "@/components/exposure-radar/types";

export function sessionStateTone(state: "complete" | "active" | "review" | "quiet") {
  switch (state) {
    case "complete":
      return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
    case "active":
      return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
    case "review":
      return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
    default:
      return "border-[#2f3336] bg-[#16181c] text-[#8b98a5]";
  }
}

export function resultLearningTone(tone: ResultLearningMove["tone"]) {
  switch (tone) {
    case "positive":
      return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
    case "warning":
      return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
    default:
      return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  }
}

export function buildPriorityReasonChips(item: ExposureRadarItemApi, t: TranslationFn) {
  const qualityStage = normalizeQualityStage(item.quality_stage, item);
  const tier = normalizeOpportunityTier(item.opportunity_tier);
  return [
    item.score >= 80 ? t("exposureRadar.firstLoop.why.highScore", { score: item.score }) : "",
    qualityStage === "act_now" ? t("exposureRadar.firstLoop.why.actNow") : "",
    tier === "hot_opportunity" || tier === "rising_opportunity" ? t(`exposureRadar.firstLoop.why.${tier}`) : "",
    typeof item.views_per_min === "number" && item.views_per_min > 0 ? t("exposureRadar.firstLoop.why.velocity", { speed: formatOneDecimal(item.views_per_min) }) : "",
    typeof item.impression_count === "number" && item.impression_count > 0 ? t("exposureRadar.firstLoop.why.views", { views: formatCompact(item.impression_count) }) : "",
    typeof item.followers_count === "number" && item.followers_count > 0 && item.followers_count <= 10000 ? t("exposureRadar.firstLoop.why.smallAuthor", { fans: formatCompact(item.followers_count) }) : "",
    item.risk_level === "low" ? t("exposureRadar.firstLoop.why.lowRisk") : "",
  ].filter(Boolean).slice(0, 4);
}
