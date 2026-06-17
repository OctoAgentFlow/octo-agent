import type { ExposureRadarItemApi } from "@/services/exposure-radar.service";
import type { ManualActionState } from "@/components/exposure-radar/types";

export function isSampleRadarItem(item: ExposureRadarItemApi) {
  return item.id.startsWith("sample-") || item.data_source === "sample_mode";
}

export function scoreManualResult(result: {
  impressions?: number;
  likes?: number;
  replies?: number;
  reposts?: number;
  quotes?: number;
  bookmarks?: number;
}) {
  const impressions = result.impressions || 0;
  const engagement = (result.likes || 0) + (result.replies || 0) * 3 + (result.reposts || 0) * 4 + (result.quotes || 0) * 4 + (result.bookmarks || 0) * 2;
  const impressionScore = impressions > 0 ? Math.min(60, Math.round(Math.log10(impressions + 1) * 18)) : 0;
  const engagementScore = Math.min(40, engagement * 3);
  return Math.max(0, Math.min(100, impressionScore + engagementScore));
}

export function radarCardAnchorID(id: string) {
  return `radar-signal-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export function compactTitle(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 96) return normalized;
  return `${normalized.slice(0, 93).trim()}...`;
}

export function uniqueList(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).slice(0, 12);
}

export function clampPriority(score: number) {
  if (!Number.isFinite(score)) return 50;
  return Math.max(50, Math.min(100, Math.round(score)));
}

export function extractTweetID(raw: string) {
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/\/status(?:es)?\/(\d+)/);
  return match?.[1] || "";
}

export function isManualActionHandled(item: ExposureRadarItemApi, state?: ManualActionState) {
  return Boolean(state?.handled) || state?.taskStatus === "done" || item.status === "handled" || item.review_status === "handled";
}

export function hasManualBackfill(item: ExposureRadarItemApi, state?: ManualActionState) {
  return Boolean(item.comment_url || item.comment_tweet_id || state?.publishedUrl);
}

export function isRadarItemSaved(item: ExposureRadarItemApi, savedMemoryIDs: Set<string>) {
  return Boolean(item.saved_memory_id) || savedMemoryIDs.has(item.id);
}

export function radarItemSavedMemoryID(item: ExposureRadarItemApi, savedMemoryIDs: Set<string>) {
  if (item.saved_memory_id) return item.saved_memory_id;
  return savedMemoryIDs.has(item.id) ? -1 : 0;
}
