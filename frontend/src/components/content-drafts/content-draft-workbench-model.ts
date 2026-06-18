import type {
  ContentDraftGenerationRunApi,
  ContentDraftHandlingMode,
  ContentDraftLengthMode,
  ContentDraftPlanApi,
} from "@/services/content-drafts.service";
import type {
  ContentLibraryItemApi,
  ContentLibraryItemType,
  ContentLibraryStatus,
} from "@/services/content-library.service";

export type LoadState = "loading" | "ready" | "error";
export type WorkbenchPanel = "generate" | "planner" | "content" | "history";
export type RunStatusFilter = "all" | ContentDraftGenerationRunApi["status"];
export type RunAccountScope = "selected" | "all";
export type RunRangeFilter = "all" | "24h" | "7d" | "30d";
export type ContentExposureFilter = "all" | "exposure" | "radar" | "brief";
export type ContentRegionFilter = "all" | "zh" | "en";
export type ContentVelocityFilter = "all" | "rising" | "steady" | "cooling";
export type ContentSortMode = "default" | "score_desc" | "newest" | "usage_desc";

export type PlannerForm = {
  enabled: boolean;
  executionMode: ContentDraftHandlingMode;
  minIntervalMinutes: number;
  postingWindows: string;
  timezone: string;
  contentLengthMode: ContentDraftLengthMode;
  excludedTrendNames: string[];
};

export type LibraryForm = {
  title: string;
  itemType: ContentLibraryItemType;
  body: string;
  sourceURL: string;
  topics: string;
  growthGoal: string;
  ctaPreference: string;
  priority: number;
  status: ContentLibraryStatus;
};

export type ContentSourceTrace = {
  kind: "radar" | "brief";
  signalTitle: string;
  summary: string;
  whyItMatters: string;
  suggestedAction: string;
  bestUse: string;
  region: string;
  score: string;
  velocity: string;
  risk: string;
  quality: string;
  sourceURL: string;
};

export type ExposureStrategyRecommendation = {
  items: ContentLibraryItemApi[];
  title: string;
  summary: string;
  direction: string;
  topics: string[];
  regions: string[];
  averageScore: number;
};

export const timezones = ["UTC", "Asia/Shanghai", "America/New_York", "Europe/London"];
export const executionModes: ContentDraftHandlingMode[] = ["manual", "review", "autopilot"];
export const xSubscriptionTiers = ["unknown", "free", "premium", "premium_plus"] as const;
export const contentDraftLengthModes: ContentDraftLengthMode[] = ["standard", "long"];
export const contentItemTypes: ContentLibraryItemType[] = [
  "idea",
  "feature_highlight",
  "pain_point",
  "product_update",
  "faq",
  "case_study",
  "comparison",
  "tutorial",
  "data_insight",
  "announcement",
  "campaign",
  "link",
  "thread_seed",
];
export const workbenchPanels: Array<{ id: WorkbenchPanel; labelKey: string; descriptionKey: string }> = [
  { id: "generate", labelKey: "contentDrafts.tabs.generate", descriptionKey: "contentDrafts.tabs.generateDesc" },
  { id: "planner", labelKey: "contentDrafts.tabs.planner", descriptionKey: "contentDrafts.tabs.plannerDesc" },
  { id: "content", labelKey: "contentDrafts.tabs.content", descriptionKey: "contentDrafts.tabs.contentDesc" },
  { id: "history", labelKey: "contentDrafts.tabs.history", descriptionKey: "contentDrafts.tabs.historyDesc" },
];
export const runStatusFilters: RunStatusFilter[] = ["all", "completed", "skipped", "failed"];
export const runAccountScopes: RunAccountScope[] = ["selected", "all"];
export const runRangeFilters: RunRangeFilter[] = ["all", "24h", "7d", "30d"];
export const contentExposureFilters: ContentExposureFilter[] = ["all", "exposure", "radar", "brief"];
export const contentRegionFilters: ContentRegionFilter[] = ["all", "zh", "en"];
export const contentVelocityFilters: ContentVelocityFilter[] = ["all", "rising", "steady", "cooling"];
export const contentSortModes: ContentSortMode[] = ["default", "score_desc", "newest", "usage_desc"];
export const postingWindowHours = Array.from({ length: 24 }, (_, hour) => hour);
export const postingWindowPresets = [
  { key: "business", hours: [9, 10, 11, 12, 13, 14, 15, 16, 17] },
  { key: "morning", hours: [8, 9, 10, 11] },
  { key: "afternoon", hours: [13, 14, 15, 16, 17] },
  { key: "evening", hours: [18, 19, 20, 21] },
  { key: "allDay", hours: postingWindowHours },
];

export function defaultForm(): PlannerForm {
  return {
    enabled: false,
    executionMode: "review",
    minIntervalMinutes: 120,
    postingWindows: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    contentLengthMode: "standard",
    excludedTrendNames: [],
  };
}

export function defaultLibraryForm(): LibraryForm {
  return {
    title: "",
    itemType: "idea",
    body: "",
    sourceURL: "",
    topics: "",
    growthGoal: "",
    ctaPreference: "",
    priority: 50,
    status: "active",
  };
}

export function formFromPlan(plan: ContentDraftPlanApi): PlannerForm {
  return {
    enabled: plan.enabled,
    executionMode: plan.execution_mode,
    minIntervalMinutes: plan.min_interval_minutes,
    postingWindows: plan.posting_windows || "",
    timezone: plan.timezone || "UTC",
    contentLengthMode: plan.content_length_mode || "standard",
    excludedTrendNames: plan.excluded_trend_names || [],
  };
}

export function statusTone(status: string) {
  if (status === "ready_to_publish") return "border-emerald-300/25 bg-emerald-500/10 text-emerald-100";
  if (status === "pending_review" || status === "draft") return "border-amber-300/25 bg-amber-500/10 text-amber-100";
  if (status === "approved" || status === "published") return "border-blue-300/25 bg-blue-500/10 text-blue-100";
  if (status === "rejected" || status === "failed") return "border-rose-300/25 bg-rose-500/10 text-rose-100";
  return "border-white/10 bg-white/[0.05] text-white/65";
}

export function runTone(status: string) {
  if (status === "completed") return "border-emerald-300/25 bg-emerald-500/10 text-emerald-100";
  if (status === "skipped") return "border-amber-300/25 bg-amber-500/10 text-amber-100";
  if (status === "failed") return "border-rose-300/25 bg-rose-500/10 text-rose-100";
  return "border-white/10 bg-white/[0.05] text-white/65";
}

export function readWorkbenchPanel(value: string | null): WorkbenchPanel {
  return value === "planner" || value === "content" || value === "history" || value === "generate" ? value : "generate";
}

export function readRunStatus(value: string | null): RunStatusFilter {
  return value === "completed" || value === "skipped" || value === "failed" ? value : "all";
}

export function readRunAccountScope(value: string | null): RunAccountScope {
  return value === "all" ? "all" : "selected";
}

export function readRunRange(value: string | null): RunRangeFilter {
  return value === "24h" || value === "7d" || value === "30d" ? value : "all";
}

export function readRunPage(value: string | null) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

export function readAccountID(value: string | null) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function readContentItemID(value: string | null) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function hourLabel(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function parseClockMinutes(value: string) {
  const parts = value.trim().split(":");
  if (parts.length !== 2) return null;
  const hour = Number.parseInt(parts[0], 10);
  const minute = Number.parseInt(parts[1], 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function parsePostingWindowHours(value: string) {
  const selected = new Set<number>();
  value
    .replaceAll("，", ",")
    .replaceAll(";", ",")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const [startRaw, endRaw] = part.split("-").map((item) => item.trim());
      const start = parseClockMinutes(startRaw || "");
      const end = parseClockMinutes(endRaw || "");
      if (start === null || end === null) return;
      const addRange = (from: number, to: number) => {
        for (let hour = Math.floor(from / 60); hour <= Math.floor(to / 60); hour += 1) {
          if (hour >= 0 && hour <= 23) selected.add(hour);
        }
      };
      if (start <= end) {
        addRange(start, end);
      } else {
        addRange(start, 23 * 60 + 59);
        addRange(0, end);
      }
    });
  return selected;
}

export function formatPostingWindowHours(hours: Set<number>) {
  const sorted = Array.from(hours)
    .filter((hour) => hour >= 0 && hour <= 23)
    .sort((a, b) => a - b);
  if (sorted.length === 0) return "";
  const ranges: Array<{ start: number; end: number }> = [];
  sorted.forEach((hour) => {
    const last = ranges[ranges.length - 1];
    if (last && hour === last.end + 1) {
      last.end = hour;
      return;
    }
    ranges.push({ start: hour, end: hour });
  });
  return ranges
    .map((range) => `${hourLabel(range.start)}-${String(range.end).padStart(2, "0")}:59`)
    .join(", ");
}

export function parseContentSourceTrace(item: ContentLibraryItemApi): ContentSourceTrace | null {
  if (!item.topics.some((topic) => topic.toLowerCase() === "exposure-radar")) return null;
  const lines = item.body.split("\n").map((line) => line.trim()).filter(Boolean);
  const metadata = parseRadarMetadata(readTraceLine(lines, "Radar metadata"));
  const kind = item.topics.some((topic) => topic.toLowerCase() === "hourly-brief") || Boolean(readTraceLine(lines, "Brief item")) ? "brief" : "radar";
  const signalTitle = readTraceLine(lines, kind === "brief" ? "Brief item" : "Signal") || item.title;
  const summary = readTraceLine(lines, "Summary") || readTraceLine(lines, "Context");
  const region = metadata.region || item.topics.find((topic) => ["zh", "en"].includes(topic.toLowerCase())) || "";
  return {
    kind,
    signalTitle,
    summary,
    whyItMatters: readTraceLine(lines, "Why it matters"),
    suggestedAction: readTraceLine(lines, "Suggested operator action"),
    bestUse: readTraceLine(lines, "Best use"),
    region,
    score: metadata.score || "",
    velocity: metadata.velocity || "",
    risk: metadata.risk || "",
    quality: metadata.quality || "",
    sourceURL: item.source_url || "",
  };
}

export function contentItemMatchesExposureFilters(
  item: ContentLibraryItemApi,
  exposure: ContentExposureFilter,
  region: ContentRegionFilter,
  velocity: ContentVelocityFilter
) {
  const trace = parseContentSourceTrace(item);
  if (exposure === "exposure" && !trace) return false;
  if (exposure === "radar" && trace?.kind !== "radar") return false;
  if (exposure === "brief" && trace?.kind !== "brief") return false;
  if (region !== "all" && trace?.region?.toLowerCase() !== region) return false;
  if (velocity !== "all" && normalizeContentVelocity(trace?.velocity || "") !== velocity) return false;
  return true;
}

export function sortContentItems(items: ContentLibraryItemApi[], sortMode: ContentSortMode) {
  return [...items].sort((a, b) => {
    if (sortMode === "score_desc") return traceScore(b) - traceScore(a) || b.priority - a.priority || b.id - a.id;
    if (sortMode === "newest") return Date.parse(b.created_at || "") - Date.parse(a.created_at || "") || b.id - a.id;
    if (sortMode === "usage_desc") return b.usage_count - a.usage_count || b.id - a.id;
    return b.priority - a.priority || b.id - a.id;
  });
}

export function normalizeContentVelocity(value: string): ContentVelocityFilter {
  const next = value.trim().toLowerCase();
  if (next.includes("cool")) return "cooling";
  if (next.includes("steady") || next.includes("stable")) return "steady";
  if (next.includes("rising") || next.includes("hot") || next.includes("new")) return "rising";
  return "all";
}

export function buildExposureStrategyRecommendation(items: ContentLibraryItemApi[]): ExposureStrategyRecommendation | null {
  const ranked = sortContentItems(
    items.filter((item) => item.status === "active" && parseContentSourceTrace(item)),
    "score_desc"
  ).slice(0, 3);
  if (ranked.length === 0) return null;
  const traces = ranked.map((item) => parseContentSourceTrace(item)).filter((trace): trace is ContentSourceTrace => Boolean(trace));
  const topics = uniqueStrings(ranked.flatMap((item) => item.topics.filter((topic) => !["exposure-radar", "hourly-brief", "zh", "en"].includes(topic.toLowerCase())))).slice(0, 5);
  const regions = uniqueStrings(traces.map((trace) => trace.region).filter(Boolean));
  const averageScore = Math.round(traces.reduce((sum, trace) => sum + (Number(trace.score) || 0), 0) / Math.max(traces.length, 1));
  const primary = traces[0];
  const actions = uniqueStrings(traces.map((trace) => trace.suggestedAction || trace.bestUse).filter(Boolean)).slice(0, 3);
  const directionLines = [
    `Use today as a controlled Exposure memory sprint.`,
    `Primary signal: ${primary.signalTitle}.`,
    topics.length ? `Focus topics: ${topics.join(", ")}.` : "",
    regions.length ? `Region context: ${regions.join(", ")}.` : "",
    `Recommended workflow: create 1 high-context post or reply angle from the primary signal, then queue 2 review-first follow-up drafts from related memories.`,
    actions.length ? `Operator angles: ${actions.join(" | ")}` : "",
    `Guardrail: keep the post practical, avoid broad growth promises, and route output through the review queue before publishing.`,
  ].filter(Boolean);
  return {
    items: ranked,
    title: primary.signalTitle,
    summary: actions[0] || primary.whyItMatters || primary.summary,
    direction: directionLines.join("\n"),
    topics,
    regions,
    averageScore,
  };
}

function readTraceLine(lines: string[], label: string) {
  const prefix = `${label}:`;
  const row = lines.find((line) => line.toLowerCase().startsWith(prefix.toLowerCase()));
  return row ? row.slice(prefix.length).trim() : "";
}

function parseRadarMetadata(value: string) {
  const out: Record<string, string> = {};
  value.split(";").forEach((part) => {
    const [rawKey, ...rawValue] = part.split("=");
    const key = rawKey?.trim().toLowerCase();
    const next = rawValue.join("=").trim().replace(/[.。]+$/, "");
    if (key && next) out[key] = next;
  });
  return out;
}

function traceScore(item: ContentLibraryItemApi) {
  const score = Number(parseContentSourceTrace(item)?.score || "");
  return Number.isFinite(score) ? score : -1;
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const next = value.trim();
    const key = next.toLowerCase();
    if (!next || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
