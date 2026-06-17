import type { ExposureRadarGrowthStrategyApi, ExposureRadarRegion } from "@/services/exposure-radar.service";
import type { StarterStrategyTemplate, StrategyFormState } from "@/components/exposure-radar/types";

export type StrategyContextImportDraft = {
  form: StrategyFormState;
  title: string;
  memoryBody: string;
  topics: string[];
  guardrails: string[];
};

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

export function buildStrategyContextImportDraft(current: StrategyFormState, raw: string, t: (key: string) => string): StrategyContextImportDraft {
  const text = normalizeContextText(raw);
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const topics = uniqueStrategyList([
    ...extractMarkedList(lines, ["topic", "topics", "feature", "features", "关键词", "话题", "功能", "能力"]),
    ...extractKeywordCandidates(text),
  ]).slice(0, 8);
  const guardrails = uniqueStrategyList([
    ...extractMarkedList(lines, ["avoid", "risk", "guardrail", "do not", "不要", "避免", "风险", "边界"]),
    ...extractRiskClaims(text),
  ]).slice(0, 6);
  const audience = extractAudience(lines) || current.targetAudience;
  const primaryGoal = inferPrimaryGoal(text, current.primaryGoal);
  const replyStyle = inferReplyStyle(text, current.replyStyle);
  const summary = lines.slice(0, 5).join("\n");
  const title = lines[0]?.replace(/^#+\s*/, "").slice(0, 80) || t("exposureRadar.strategy.contextImport.memoryTitle");
  const importedNotes = [
    t("exposureRadar.strategy.contextImport.notesHeader"),
    summary,
    topics.length ? `${t("exposureRadar.strategy.contextImport.notesTopics")} ${topics.join(", ")}` : "",
    guardrails.length ? `${t("exposureRadar.strategy.contextImport.notesGuardrails")} ${guardrails.join(", ")}` : "",
  ].filter(Boolean).join("\n");
  const memoryBody = [
    t("exposureRadar.strategy.contextImport.memoryBodyHeader"),
    summary,
    topics.length ? `${t("exposureRadar.strategy.contextImport.notesTopics")} ${topics.join(", ")}` : "",
    guardrails.length ? `${t("exposureRadar.strategy.contextImport.notesGuardrails")} ${guardrails.join(", ")}` : "",
  ].filter(Boolean).join("\n\n");
  return {
    title,
    memoryBody,
    topics,
    guardrails,
    form: {
      ...current,
      targetAudience: audience,
      primaryGoal,
      coreTopics: mergeCommaField(current.coreTopics, topics),
      avoidTopics: mergeCommaField(current.avoidTopics, guardrails),
      replyStyle,
      safetyMode: guardrails.length ? "conservative" : current.safetyMode,
      operatorNotes: mergeNotes(current.operatorNotes, importedNotes),
    },
  };
}

function normalizeContextText(raw: string) {
  return raw.replace(/\r/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 6000);
}

function extractMarkedList(lines: string[], markers: string[]) {
  return lines.flatMap((line) => {
    const lower = line.toLowerCase();
    if (!markers.some((marker) => lower.includes(marker.toLowerCase()))) return [];
    const [, value = line] = line.split(/[:：]/, 2);
    return value.split(/[,，、;；/|]/).map((item) => cleanStrategyToken(item)).filter(Boolean);
  });
}

function extractAudience(lines: string[]) {
  const match = lines.find((line) => /audience|customer|users?|target|ICP|受众|用户|客户|目标/i.test(line));
  if (!match) return "";
  const [, value = match] = match.split(/[:：]/, 2);
  return cleanStrategySentence(value).slice(0, 160);
}

function extractKeywordCandidates(text: string) {
  const stopwords = new Set([
    "about", "after", "again", "agent", "also", "and", "are", "based", "build", "can", "for", "from", "growth", "helps", "into", "more", "our", "product", "safe", "social", "that", "the", "their", "this", "users", "with", "workflow", "your",
    "一个", "以及", "可以", "用户", "产品", "系统", "我们", "通过", "用于", "帮助", "内容", "运营", "安全",
  ]);
  const counts = new Map<string, number>();
  const matches = text.match(/[#@]?[A-Za-z][A-Za-z0-9-]{3,}|[\u4e00-\u9fa5]{2,8}/g) || [];
  matches.forEach((raw) => {
    const token = cleanStrategyToken(raw.replace(/^#/, ""));
    if (!token || stopwords.has(token.toLowerCase())) return;
    counts.set(token, (counts.get(token) || 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([token]) => token)
    .slice(0, 10);
}

function extractRiskClaims(text: string) {
  const risks = [
    ["guaranteed", "No guaranteed growth claims"],
    ["fully automated", "Avoid fully automated growth claims"],
    ["spam", "Avoid spam-like replies"],
    ["passive income", "Avoid passive income claims"],
    ["yield", "Avoid yield or financial-return framing"],
    ["保证", "避免保证增长或收益"],
    ["全自动", "避免全自动增长表述"],
    ["刷屏", "避免刷屏式回复"],
    ["收益", "避免收益承诺"],
  ];
  const lower = text.toLowerCase();
  return risks.filter(([needle]) => lower.includes(needle.toLowerCase())).map(([, label]) => label);
}

function inferPrimaryGoal(text: string, fallback: string) {
  const lower = text.toLowerCase();
  if (/community|discord|telegram|社群|社区/.test(lower)) return "community";
  if (/relationship|network|partnership|关系|合作/.test(lower)) return "relationships";
  if (/traffic|trial|signup|website|demo|访问|注册|试用/.test(lower)) return "traffic";
  if (/research|learn|insight|调研|洞察/.test(lower)) return "research";
  return fallback || "awareness";
}

function inferReplyStyle(text: string, fallback: string) {
  const lower = text.toLowerCase();
  if (/question|ask|问题|提问/.test(lower)) return "light_question";
  if (/case|experience|lesson|实践|经验|案例/.test(lower)) return "peer_experience";
  if (/risk|safe|guardrail|claim|风险|安全|边界/.test(lower)) return "caution_note";
  return fallback || "operator_observation";
}

function mergeCommaField(current: string, next: string[]) {
  return uniqueStrategyList([...parseCommaList(current), ...next]).slice(0, 12).join(", ");
}

function mergeNotes(current: string, next: string) {
  if (!next) return current;
  if (!current.trim()) return next;
  if (current.includes(next)) return current;
  return `${current.trim()}\n\n${next}`;
}

function uniqueStrategyList(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanStrategyToken(value: string) {
  return value.replace(/^[\s#*-]+|[\s.,，。:：;；!！?？]+$/g, "").trim();
}

function cleanStrategySentence(value: string) {
  return value.replace(/^[\s#*-]+|[\s]+$/g, "").trim();
}
