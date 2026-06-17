import type {
  ExposureRadarItemApi,
  ExposureRadarManualRecordApi,
  ExposureRadarManualRecordPayload,
  ExposureRadarPeopleItemApi,
  ExposureRadarResultLookupApi,
  ExposureRadarSafetyCheckApi,
} from "@/services/exposure-radar.service";
import { manualOutcomeFeedbackMeta } from "@/components/exposure-radar/constants";
import {
  peopleRadarStage,
  peopleRadarStageWeight,
  publicEngagementCount,
  radarItemTimeValue,
} from "@/components/exposure-radar/people-radar-utils";
import { extractTweetID, scoreManualResult } from "@/components/exposure-radar/radar-signal-utils";
import {
  normalizeManualOutcome,
  normalizeManualTaskStatus,
  normalizePeopleRadarStage,
  normalizeSafetyReviewStatus,
} from "@/components/exposure-radar/radar-utils";
import type {
  ManualActionState,
  ManualOutcome,
  PeopleRadarEntry,
  ReplyAngleSuggestion,
  SafetyReview,
  SafetyReviewCheck,
} from "@/components/exposure-radar/types";

export type ManualResultInput = {
  impressions?: number;
  likes?: number;
  replies?: number;
  reposts?: number;
  quotes?: number;
  bookmarks?: number;
  notes?: string;
};

export function buildManualOutcomePayload(outcome: ManualOutcome, comment: string, item: ExposureRadarItemApi) {
  const meta = manualOutcomeFeedbackMeta[outcome];
  const parts = [
    comment.trim(),
    item.comment_url ? `reply_url=${item.comment_url}` : "",
    item.comment_tweet_id ? `reply_id=${item.comment_tweet_id}` : "",
    item.id ? `signal_id=${item.id}` : "",
    item.region ? `region=${item.region}` : "",
    item.topic_name ? `topic=${item.topic_name}` : "",
    item.opportunity_type ? `opportunity_type=${item.opportunity_type}` : "",
    item.data_quality ? `data_quality=${item.data_quality}` : "",
  ].filter(Boolean);
  return {
    rating: meta.rating,
    issue_tags: meta.issueTags,
    outcome,
    comment: parts.join(" | "),
  };
}

export function buildManualRecordPayload(
  item: ExposureRadarItemApi,
  options: {
    selectedAccountID: number;
    selectedBotID: number;
    patch: Partial<ManualActionState>;
    safetyReview: SafetyReview;
    replyAngle?: ReplyAngleSuggestion;
  },
): ExposureRadarManualRecordPayload {
  const patch = options.patch;
  const taskStatus = patch.taskStatus || (patch.handled ? "done" : patch.copied || patch.opened || patch.saved || patch.outcome ? "in_progress" : undefined);
  return {
    bot_id: options.selectedBotID || undefined,
    x_account_id: options.selectedAccountID || undefined,
    signal_id: item.id,
    region: item.region,
    data_source: item.data_source,
    data_quality: item.data_quality,
    tweet_id: item.tweet_id || extractTweetID(item.url || item.id),
    url: item.url,
    title: item.title,
    content: item.content,
    author_id: item.author_id,
    author_handle: item.author_handle,
    author_name: item.author_name,
    topic_name: item.topic_name,
    score: item.score,
    risk_level: item.risk_level,
    opportunity_type: item.opportunity_type,
    opportunity_tier: item.opportunity_tier,
    quality_stage: item.quality_stage,
    views_per_minute: item.views_per_min,
    followers_count: item.followers_count,
    heat_count: item.heat_count,
    reply_count: item.reply_count,
    retweet_count: item.retweet_count,
    like_count: item.like_count,
    quote_count: item.quote_count,
    bookmark_count: item.bookmark_count,
    impression_count: item.impression_count,
    review_task_id: item.review_task_id,
    saved_memory_id: item.saved_memory_id,
    generated_comment: item.generated_comment,
    task_status: taskStatus,
    copied: patch.copied,
    opened: patch.opened,
    saved: patch.saved,
    handled: patch.handled,
    published_url: patch.publishedUrl || item.comment_url,
    outcome: patch.outcome,
    feedback_comment: patch.feedbackComment,
    result_impression_count: patch.resultImpressionCount,
    result_like_count: patch.resultLikeCount,
    result_reply_count: patch.resultReplyCount,
    result_retweet_count: patch.resultRetweetCount,
    result_quote_count: patch.resultQuoteCount,
    result_bookmark_count: patch.resultBookmarkCount,
    result_notes: patch.resultNotes,
    safety_status: patch.safetyStatus || options.safetyReview.status,
    safety_summary: patch.safetySummary || options.safetyReview.summary,
    safety_checks: options.safetyReview.checks.map(safetyCheckToApi),
    reply_angle_id: patch.replyAngleID || options.replyAngle?.id,
    reply_angle_title: patch.replyAngleTitle || options.replyAngle?.title,
  };
}

export function normalizeResultLookupStatus(value?: string) {
  switch (value) {
    case "fetched":
    case "token_missing":
    case "lookup_failed":
    case "not_found":
    case "id_only":
      return value;
    default:
      return "failed";
  }
}

export function buildManualResultPatch(result: ManualResultInput, handled: boolean, checkedAt = new Date().toISOString()): Partial<ManualActionState> {
  return {
    resultImpressionCount: result.impressions,
    resultLikeCount: result.likes,
    resultReplyCount: result.replies,
    resultRetweetCount: result.reposts,
    resultQuoteCount: result.quotes,
    resultBookmarkCount: result.bookmarks,
    resultNotes: result.notes,
    resultScore: scoreManualResult(result),
    resultCheckedAt: checkedAt,
    taskStatus: handled ? "done" : "in_progress",
  };
}

export function buildSampleResolvedResultPatch(resolvedURL: string, handled: boolean, checkedAt = new Date().toISOString()): Partial<ManualActionState> {
  return {
    publishedUrl: resolvedURL,
    resultImpressionCount: 1280,
    resultLikeCount: 24,
    resultReplyCount: 3,
    resultRetweetCount: 2,
    resultBookmarkCount: 5,
    resultScore: 74,
    resultCheckedAt: checkedAt,
    taskStatus: handled ? "done" : "in_progress",
  };
}

export function buildResolvedManualResultPatch(result: ExposureRadarResultLookupApi, fallbackURL: string, handled: boolean, checkedAt = new Date().toISOString()) {
  const resolvedURL = result.published_url || fallbackURL;
  const patch: Partial<ManualActionState> = {
    publishedUrl: resolvedURL,
    taskStatus: handled ? "done" : "in_progress",
  };
  if (typeof result.result_impression_count === "number") patch.resultImpressionCount = result.result_impression_count;
  if (typeof result.result_like_count === "number") patch.resultLikeCount = result.result_like_count;
  if (typeof result.result_reply_count === "number") patch.resultReplyCount = result.result_reply_count;
  if (typeof result.result_retweet_count === "number") patch.resultRetweetCount = result.result_retweet_count;
  if (typeof result.result_quote_count === "number") patch.resultQuoteCount = result.result_quote_count;
  if (typeof result.result_bookmark_count === "number") patch.resultBookmarkCount = result.result_bookmark_count;
  if (result.metrics_fetched) {
    patch.resultCheckedAt = checkedAt;
  }
  return { patch, resolvedURL };
}

export function mergeManualRecordStates(current: Record<string, ManualActionState>, records: ExposureRadarManualRecordApi[]) {
  if (!records.length) return current;
  const next = { ...current };
  records.forEach((record) => {
    const existing = next[record.signal_id] || {};
    const taskStatus = normalizeManualTaskStatus(record.task_status) || existing.taskStatus;
    const outcome = normalizeManualOutcome(record.outcome) || existing.outcome;
    next[record.signal_id] = {
      ...existing,
      copied: existing.copied || Boolean(record.copied_at),
      opened: existing.opened || Boolean(record.opened_at),
      saved: existing.saved || Boolean(record.saved_at || record.saved_memory_id),
      handled: existing.handled || Boolean(record.handled_at || taskStatus === "done"),
      persisted: true,
      publishedUrl: record.published_url || existing.publishedUrl,
      outcome,
      feedbackComment: record.feedback_comment || existing.feedbackComment,
      feedbackAt: record.feedback_at || existing.feedbackAt,
      resultImpressionCount: mergeOptionalNumber(record.result_impression_count, existing.resultImpressionCount),
      resultLikeCount: mergeOptionalNumber(record.result_like_count, existing.resultLikeCount),
      resultReplyCount: mergeOptionalNumber(record.result_reply_count, existing.resultReplyCount),
      resultRetweetCount: mergeOptionalNumber(record.result_retweet_count, existing.resultRetweetCount),
      resultQuoteCount: mergeOptionalNumber(record.result_quote_count, existing.resultQuoteCount),
      resultBookmarkCount: mergeOptionalNumber(record.result_bookmark_count, existing.resultBookmarkCount),
      resultNotes: record.result_notes || existing.resultNotes,
      resultScore: mergeOptionalNumber(record.result_score, existing.resultScore),
      resultCheckedAt: record.result_checked_at || existing.resultCheckedAt,
      taskStatus,
      safetyStatus: normalizeSafetyReviewStatus(record.safety_status) || existing.safetyStatus,
      safetySummary: record.safety_summary || existing.safetySummary,
      replyAngleID: record.reply_angle_id || existing.replyAngleID,
      replyAngleTitle: record.reply_angle_title || existing.replyAngleTitle,
      updatedAt: record.updated_at || existing.updatedAt || new Date().toISOString(),
    };
  });
  return next;
}

export function mergePeopleRadar(current: PeopleRadarEntry[], persisted: ExposureRadarPeopleItemApi[]): PeopleRadarEntry[] {
  if (!persisted.length) return current;
  const people = new Map<string, PeopleRadarEntry>();
  current.forEach((person) => people.set(person.key, person));
  persisted.forEach((person) => {
    const key = person.key || (person.handle || person.name).toLowerCase();
    if (!key) return;
    const latestItem = manualRecordToRadarItem(person.latest_record);
    const existing = people.get(key);
    if (!existing) {
      people.set(key, {
        key,
        name: person.name,
        handle: person.handle,
        count: person.count,
        handled: person.handled,
        drafted: person.latest_record.review_task_id || person.latest_record.generated_comment ? 1 : 0,
        saved: person.saved,
        maxScore: person.max_score || person.latest_record.score || 0,
        totalEngagement: person.total_engagement || publicEngagementCount(latestItem),
        followers: person.followers || person.latest_record.followers_count,
        stage: normalizePeopleRadarStage(person.stage),
        latestItem,
        persisted: true,
        feedback: person.feedback,
        crmStage: person.crm_stage,
        notes: person.notes,
        tags: person.tags,
        lastInteractionAt: person.last_interaction_at,
      });
      return;
    }
    existing.count = Math.max(existing.count, person.count);
    existing.handled = Math.max(existing.handled, person.handled);
    existing.saved = Math.max(existing.saved, person.saved);
    existing.maxScore = Math.max(existing.maxScore, person.max_score || 0);
    existing.totalEngagement = Math.max(existing.totalEngagement, person.total_engagement || 0);
    existing.followers = Math.max(existing.followers || 0, person.followers || 0) || existing.followers;
    existing.feedback = Math.max(existing.feedback || 0, person.feedback || 0);
    existing.crmStage = person.crm_stage || existing.crmStage;
    existing.notes = person.notes || existing.notes;
    existing.tags = person.tags?.length ? person.tags : existing.tags;
    existing.lastInteractionAt = person.last_interaction_at || existing.lastInteractionAt;
    existing.persisted = true;
    if (radarItemTimeValue(latestItem) > radarItemTimeValue(existing.latestItem)) {
      existing.latestItem = latestItem;
    }
    existing.stage = normalizePeopleRadarStage(existing.crmStage || person.stage || existing.stage || peopleRadarStage(existing));
  });
  return Array.from(people.values()).sort((a, b) => {
    const stageDelta = peopleRadarStageWeight(b.stage) - peopleRadarStageWeight(a.stage);
    if (stageDelta !== 0) return stageDelta;
    if (a.maxScore !== b.maxScore) return b.maxScore - a.maxScore;
    if (a.count !== b.count) return b.count - a.count;
    return b.totalEngagement - a.totalEngagement;
  });
}

function safetyCheckToApi(check: SafetyReviewCheck): ExposureRadarSafetyCheckApi {
  return {
    key: check.key,
    status: check.status,
    title: check.title,
    detail: check.detail,
  };
}

function mergeOptionalNumber(primary?: number, fallback?: number) {
  return typeof primary === "number" ? primary : fallback;
}

function manualRecordToRadarItem(record: ExposureRadarManualRecordApi): ExposureRadarItemApi {
  return {
    id: record.signal_id,
    region: record.region === "zh" ? "zh" : "en",
    data_source: record.data_source || "manual_record",
    data_quality: record.data_quality || "tweet_level",
    title: record.title || record.content || record.signal_id,
    author_handle: record.author_handle,
    author_name: record.author_name,
    author_id: record.author_id,
    content: record.content || record.title || "",
    url: record.url,
    tweet_id: record.tweet_id,
    status: record.task_status || "manual_record",
    signal_label: "Manual record",
    topic_name: record.topic_name,
    views_per_min: record.views_per_minute,
    heat_count: record.heat_count,
    followers_count: record.followers_count,
    like_count: record.like_count,
    reply_count: record.reply_count,
    retweet_count: record.retweet_count,
    quote_count: record.quote_count,
    bookmark_count: record.bookmark_count,
    impression_count: record.impression_count,
    score: record.score || 0,
    risk_level: record.risk_level || "low",
    opportunity_type: record.opportunity_type || "manual_record",
    opportunity_tier: record.opportunity_tier,
    quality_stage: record.quality_stage,
    recommended_use: "",
    reason: "",
    review_task_id: record.review_task_id,
    generated_comment: record.generated_comment,
    comment_url: record.published_url,
    saved_memory_id: record.saved_memory_id,
    updated_at: record.updated_at,
  };
}
