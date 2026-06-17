import type { ExposureRadarGrowthStrategyApi, ExposureRadarRegion } from "@/services/exposure-radar.service";
import type { StarterStrategyTemplate, StrategyFormState } from "@/components/exposure-radar/types";

export function strategyFormFromApi(strategy: ExposureRadarGrowthStrategyApi | null): StrategyFormState {
  return {
    targetAudience: strategy?.target_audience || "",
    primaryGoal: strategy?.primary_goal || "awareness",
    coreTopics: (strategy?.core_topics || []).join(", "),
    avoidTopics: (strategy?.avoid_topics || []).join(", "),
    competitors: (strategy?.competitors || []).map((value) => value.startsWith("@") ? value : `@${value}`).join(", "),
    replyStyle: strategy?.reply_style || "operator_observation",
    dailyMoveLimit: strategy?.daily_move_limit || 10,
    safetyMode: strategy?.safety_mode || "balanced",
    operatorNotes: strategy?.operator_notes || "",
  };
}

export function buildStarterStrategyTemplates(t: (key: string) => string, region: ExposureRadarRegion): StarterStrategyTemplate[] {
  const baseDailyLimit = region === "en" ? 8 : 10;
  const build = (key: string, primaryGoal: string, replyStyle: string, dailyMoveLimit = baseDailyLimit): StarterStrategyTemplate => ({
    key,
    form: {
      targetAudience: t(`exposureRadar.strategy.templates.${key}.targetAudience`),
      primaryGoal,
      coreTopics: t(`exposureRadar.strategy.templates.${key}.coreTopics`),
      avoidTopics: t(`exposureRadar.strategy.templates.${key}.avoidTopics`),
      competitors: "",
      replyStyle,
      dailyMoveLimit,
      safetyMode: "conservative",
      operatorNotes: t(`exposureRadar.strategy.templates.${key}.operatorNotes`),
    },
  });
  return [
    build("web3Builder", "relationships", "operator_observation"),
    build("aiAgent", "awareness", "peer_experience"),
    build("saasFounder", "traffic", "light_question", Math.max(6, baseDailyLimit - 2)),
    build("creatorOperator", "community", "caution_note"),
  ];
}

export function parseCommaList(value: string): string[] {
  return value
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}
