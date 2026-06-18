import { Bot, FileText, MessageCircle, Send } from "lucide-react";

import { apiErrorCode } from "@/lib/request";
import type { ContentDraftRewriteMode, TrendTopicApi } from "@/services/content-drafts.service";
import type {
  ReviewQueueFeedbackIssueVerdictStatApi,
  ReviewQueueExecutionMode,
  ReviewQueueItemApi,
  ReviewQueueStatus,
  ReviewQueueType,
} from "@/services/review-queue.service";

export type LoadState = "loading" | "ready" | "error";
export type ModuleType = "post" | "comment" | "reply" | "dm";
export type QueueQualitySignal = "liked" | "disliked" | "more_like_this";
export type SocialRewriteMode = "natural" | "shorter" | "human_reply" | "less_marketing" | "more_specific";
export type QueueFocus = {
  type: ReviewQueueType;
  sourceID: number | null;
};
export type RejectReasonKey = "irrelevant" | "too_salesy" | "wrong_tone" | "fact_risk" | "weak_context" | "other";
export type RejectDraft = {
  reason: RejectReasonKey;
  note: string;
};
export type FeedbackIssueKey = RejectReasonKey | "missing_context" | "";
export type FeedbackIssueMatch = {
  score: number;
  reasons: string[];
  reasonKeys: string[];
};
export type FeedbackIssueVerdict = "accurate" | "irrelevant";
export type BulkAction = "approve" | "reject" | "retry" | "delete";
export type FailureGroupKey = "authorization" | "module_paused" | "rate_limit" | "safety" | "publish_api" | "content" | "unknown";
export type PublishOutcomeFilter = "all" | "pending" | "published" | "failed" | "dry_run" | "real";
export type SmartBulkGroup = {
  id: string;
  category: "failure" | "feedback" | "bot" | "account" | "type";
  title: string;
  description: string;
  items: ReviewQueueItemApi[];
  approveCount: number;
  rejectCount: number;
  retryCount: number;
};

export const typeOptions: ReviewQueueType[] = ["all", "post", "comment", "reply"];
export const statusOptions: ReviewQueueStatus[] = ["all", "draft", "pending_review", "ready_to_publish", "processing", "published", "approved", "rejected", "failed"];
export const modeOptions: ReviewQueueExecutionMode[] = ["all", "manual", "review"];
export const publishOutcomeOptions: PublishOutcomeFilter[] = ["all", "pending", "published", "failed"];
export const rejectReasons: RejectReasonKey[] = ["irrelevant", "too_salesy", "wrong_tone", "fact_risk", "weak_context", "other"];
export const queuePageSize = 24;
export const queueContentPreviewLength = 360;

export function compactQueueContent(content?: string) {
  const normalized = (content || "").trim();
  if (!normalized) return "—";
  if (normalized.length <= queueContentPreviewLength) return normalized;
  return `${normalized.slice(0, queueContentPreviewLength).trimEnd()}...`;
}

export function statusTone(status: string) {
  if (status === "ready_to_publish") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  if (status === "processing") return "border-[#1d9bf0]/35 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  if (status === "pending_review" || status === "draft") return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
  if (status === "approved" || status === "published") return "border-[#1d9bf0]/35 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  if (status === "rejected" || status === "failed") return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
  return "border-[#2f3336] bg-[#16181c] text-[#71767b]";
}

export function typeIcon(type: string) {
  if (type === "comment") return MessageCircle;
  if (type === "post") return FileText;
  if (type === "dm") return Send;
  return Bot;
}

export function sourceTone(type: string) {
  if (type === "post") return "border-[#1d9bf0]/35 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  if (type === "comment") return "border-[#7856ff]/30 bg-[#7856ff]/12 text-[#b8a7ff]";
  if (type === "reply") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
}

export function sourceLabelKey(type: string) {
  if (type === "post") return "handlingList.source.autoPost";
  if (type === "comment") return "handlingList.source.autoComment";
  if (type === "reply") return "handlingList.source.autoReply";
  return "handlingList.source.autoDm";
}

export function sourceLabelKeyForItem(item: ReviewQueueItemApi) {
  if (item.type === "comment" && item.source_type === "exposure_radar") return "handlingList.source.exposureRadar";
  return sourceLabelKey(item.type);
}

export function deliveryLabelKey(item: ReviewQueueItemApi) {
  if (item.type === "comment" && item.delivery_mode === "quote_post") return "handlingList.delivery.quotePost";
  if (item.type === "comment" && item.delivery_mode === "manual_comment") return "handlingList.delivery.manualComment";
  if (item.type === "comment" && item.delivery_mode === "auto_comment") return "handlingList.delivery.autoComment";
  return "";
}

export function sourceDescriptionKey(type: string) {
  if (type === "post") return "handlingList.sourceDesc.post";
  if (type === "comment") return "handlingList.sourceDesc.comment";
  if (type === "reply") return "handlingList.sourceDesc.reply";
  return "handlingList.sourceDesc.dm";
}

export function sourceDescriptionForItem(item: ReviewQueueItemApi) {
  if (item.type === "comment" && item.source_type === "exposure_radar") return "handlingList.sourceDesc.exposureRadar";
  if (item.type === "comment" && item.delivery_mode === "quote_post") return "handlingList.sourceDesc.quotePost";
  if (item.type === "comment" && item.delivery_mode === "manual_comment") return "handlingList.sourceDesc.manualComment";
  return sourceDescriptionKey(item.type);
}

export function canManualPublish(item: ReviewQueueItemApi) {
  if (item.type !== "post") return false;
  if (!item.publish_job_id) return false;
  if (item.status === "ready_to_publish" || item.status === "failed") return true;
  return item.status === "published" && (item.publish_mode === "simulated" || item.publish_mode === "dry_run");
}

export function targetLabelKey(type: string) {
  if (type === "post") return "handlingList.item.contentSource";
  if (type === "comment") return "handlingList.item.targetTweet";
  if (type === "reply") return "handlingList.item.replyTarget";
  return "handlingList.item.target";
}

export function targetLabelForItem(item: ReviewQueueItemApi) {
  if (item.type === "comment" && item.delivery_mode === "quote_post") return "handlingList.item.quoteTarget";
  return targetLabelKey(item.type);
}

export function normalizeTargetSummary(type: string, value: string | undefined, t: (key: string, values?: Record<string, string | number>) => string) {
  const summary = (value || "").trim();
  if (!summary) return "—";
  if (type === "post" && summary === "Content Library Item") return t("handlingList.target.contentLibraryItem");
  if (type === "post" && ["Auto Post", "Content Draft", "Content Draft Planner"].includes(summary)) return t("handlingList.target.autoPostPlanner");
  return summary;
}

export function publishStatusKey(status?: string) {
  if (!status) return "handlingList.publishState.notCreated";
  if (status === "pending") return "handlingList.publishState.pending";
  if (status === "processing") return "handlingList.publishState.processing";
  if (status === "published") return "handlingList.publishState.published";
  if (status === "failed") return "handlingList.publishState.failed";
  if (status === "cancelled") return "handlingList.publishState.cancelled";
  return "handlingList.publishState.unknown";
}

export function publishTone(status?: string) {
  if (status === "published") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  if (status === "processing") return "border-[#1d9bf0]/35 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  if (status === "failed" || status === "cancelled") return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
  if (status === "pending") return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
  return "border-[#2f3336] bg-[#16181c] text-[#71767b]";
}

export function publishOutcomeMatches(item: ReviewQueueItemApi, filter: PublishOutcomeFilter) {
  if (filter === "all") return true;
  if (filter === "dry_run" || filter === "real") return item.publish_mode === filter;
  if (filter === "pending") return item.publish_status === "pending" || item.publish_status === "processing";
  return item.publish_status === filter;
}

export function automationPausedToast(t: (key: string, values?: Record<string, string | number>) => string, error: unknown, fallback: string) {
  return apiErrorCode(error) === "automation_module_paused" ? t("automation.pausedNotice.toast") : fallback;
}

export function moduleNameKey(type: string) {
  if (type === "post") return "automation.module.post.name";
  if (type === "comment") return "automation.module.comment.name";
  if (type === "reply") return "automation.module.reply.name";
  return "automation.module.dm.name";
}

export function moduleWorkspaceHref(type: string) {
  if (type === "post") return "/content-drafts?panel=planner";
  if (type === "comment") return "/exposure-radar";
  return "/handling-list";
}

export function normalizedTypeFilter(value: string | null): ReviewQueueType {
  return value && typeOptions.includes(value as ReviewQueueType) ? (value as ReviewQueueType) : "all";
}

export function normalizedStatusFilter(value: string | null): ReviewQueueStatus {
  return value && statusOptions.includes(value as ReviewQueueStatus) ? (value as ReviewQueueStatus) : "all";
}

export function normalizedModeFilter(value: string | null): ReviewQueueExecutionMode {
  return value && modeOptions.includes(value as ReviewQueueExecutionMode) ? (value as ReviewQueueExecutionMode) : "all";
}

export function normalizedPublishOutcomeFilter(value: string | null): PublishOutcomeFilter {
  return value && publishOutcomeOptions.includes(value as PublishOutcomeFilter) ? (value as PublishOutcomeFilter) : "all";
}

export function normalizedFocusType(value: string | null): ReviewQueueType {
  const type = normalizedTypeFilter(value);
  return type === "all" ? "all" : type;
}

export function normalizeFeedbackIssue(value: string | null): FeedbackIssueKey {
  if (value === "irrelevant" || value === "too_salesy" || value === "wrong_tone" || value === "fact_risk" || value === "weak_context" || value === "missing_context" || value === "other") return value;
  return "";
}

export function defaultContentDraftRewriteMode(issue: FeedbackIssueKey): ContentDraftRewriteMode {
  switch (issue) {
    case "too_salesy":
      return "less_marketing";
    case "weak_context":
    case "missing_context":
    case "irrelevant":
    case "fact_risk":
      return "more_specific";
    case "wrong_tone":
      return "founder_voice";
    default:
      return "more_specific";
  }
}

export function defaultSocialRewriteMode(issue: FeedbackIssueKey): SocialRewriteMode {
  switch (issue) {
    case "too_salesy":
      return "less_marketing";
    case "weak_context":
    case "missing_context":
    case "irrelevant":
    case "fact_risk":
      return "more_specific";
    case "wrong_tone":
      return "human_reply";
    default:
      return "natural";
  }
}

export function issueSearchText(item: ReviewQueueItemApi) {
  return [
    item.content,
    item.target_summary,
    item.content_title,
    item.content_direction,
    item.bot_name,
    item.twitter_account_name,
    ...(item.risk_reasons || []),
  ].filter(Boolean).join(" ").toLowerCase();
}

export function feedbackIssueMatch(
  item: ReviewQueueItemApi,
  issue: FeedbackIssueKey,
  t?: (key: string, params?: Record<string, string | number>) => string,
  reasonWeights: Record<string, number> = {}
): FeedbackIssueMatch {
  if (!issue) return { score: 0, reasons: [], reasonKeys: [] };
  const text = issueSearchText(item);
  const content = (item.content || "").trim();
  const reasons: string[] = [];
  const reasonKeys: string[] = [];
  const add = (score: number, key: string) => {
    reasonKeys.push(key);
    if (t) reasons.push(t(key));
    return Math.max(0, score + (reasonWeights[key] || 0));
  };

  let score = 0;
  if (issue === "too_salesy") {
    const salesTerms = ["try", "start", "boost", "instantly", "best", "join", "visit", "sign up", "signup", "free trial", "cta", "click", "buy", "limited"];
    const hits = salesTerms.filter((term) => text.includes(term)).length;
    if (hits > 0) score += add(Math.min(5, hits + 1), "handlingList.feedbackFocus.reason.salesTerms");
    if (/https?:\/\//i.test(content)) score += add(2, "handlingList.feedbackFocus.reason.link");
    if ((content.match(/!/g) || []).length >= 2) score += add(1, "handlingList.feedbackFocus.reason.exclamation");
  } else if (issue === "missing_context" || issue === "weak_context") {
    if (content.length > 0 && content.length < 190) score += add(3, "handlingList.feedbackFocus.reason.short");
    if (!item.target_summary && !item.content_title && !item.content_direction) score += add(2, "handlingList.feedbackFocus.reason.noContext");
    const genericTerms = ["teams", "automation", "growth", "operations", "content", "community"];
    const genericHits = genericTerms.filter((term) => text.includes(term)).length;
    if (genericHits >= 3 && !/octo|oaf|agent|web3|socialfi|x operations/.test(text)) score += add(2, "handlingList.feedbackFocus.reason.generic");
  } else if (issue === "wrong_tone") {
    const toneTerms = ["announcing", "excited", "revolutionary", "must", "don't miss", "game-changing", "ultimate"];
    if (toneTerms.some((term) => text.includes(term))) score += add(3, "handlingList.feedbackFocus.reason.announcementTone");
    if ((content.match(/#/g) || []).length >= 4) score += add(1, "handlingList.feedbackFocus.reason.tooManyHashtags");
  } else if (issue === "fact_risk") {
    const riskTerms = ["guarantee", "guaranteed", "always", "never", "100%", "risk-free", "profit", "price prediction", "official partnership", "best"];
    const hits = riskTerms.filter((term) => text.includes(term)).length;
    if (hits > 0) score += add(Math.min(5, hits + 1), "handlingList.feedbackFocus.reason.riskyClaims");
    if (item.risk_level === "high") score += add(2, "handlingList.feedbackFocus.reason.highRisk");
  } else if (issue === "irrelevant") {
    if (item.type === "post" && item.selected_trends?.length) score += add(2, "handlingList.feedbackFocus.reason.trendMismatch");
    if (!item.target_summary && !item.content_title && !item.content_direction) score += add(1, "handlingList.feedbackFocus.reason.noContext");
  } else if (issue === "other") {
    if (item.risk_level === "high" || item.status === "failed") score += add(2, "handlingList.feedbackFocus.reason.needsReview");
  }
  return {
    score,
    reasons: Array.from(new Set(reasons)).slice(0, 3),
    reasonKeys: Array.from(new Set(reasonKeys)).slice(0, 3),
  };
}

export function prioritizeByFeedbackIssue(items: ReviewQueueItemApi[], issue: FeedbackIssueKey, reasonWeights: Record<string, number>) {
  if (!issue) return items;
  return [...items].sort((a, b) => {
    const scoreDiff = feedbackIssueMatch(b, issue, undefined, reasonWeights).score - feedbackIssueMatch(a, issue, undefined, reasonWeights).score;
    if (scoreDiff !== 0) return scoreDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export function issueVerdictStatForIssue(stats: ReviewQueueFeedbackIssueVerdictStatApi[], issue: FeedbackIssueKey) {
  if (!issue) return null;
  return stats.find((item) => item.feedback_issue === issue) || null;
}

export function reasonWeightsForIssue(stats: ReviewQueueFeedbackIssueVerdictStatApi[], issue: FeedbackIssueKey) {
  const stat = issueVerdictStatForIssue(stats, issue);
  if (!stat) return {};
  return Object.fromEntries(stat.reasons.map((reason) => [reason.reason, reason.score_adjustment]));
}

export function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function canEditQueueItem(item: ReviewQueueItemApi) {
  if (item.type !== "comment" && item.type !== "post") return false;
  return item.status === "pending_review" || item.status === "draft" || item.status === "approved";
}

export function isActionableQueueItem(item: ReviewQueueItemApi) {
  if (item.type !== "comment" && item.type !== "post") return false;
  return ["draft", "pending_review", "approved", "ready_to_publish", "failed"].includes(item.status);
}

export function feedbackSceneForQueueType(type: string) {
  if (type === "post") return "tweet";
  if (type === "reply") return "reply";
  if (type === "comment") return "comment";
  return "dm";
}

export function queueItemKey(item: ReviewQueueItemApi) {
  return `${item.type}-${item.id}`;
}

export function canBulkApprove(item: ReviewQueueItemApi, moduleEnabled: Record<ModuleType, boolean>) {
  return (item.type === "comment" || item.type === "post")
    && (item.status === "pending_review" || item.status === "draft")
    && moduleEnabled[item.type as ModuleType] !== false;
}

export function canBulkReject(item: ReviewQueueItemApi) {
  return (item.type === "comment" || item.type === "post")
    && item.status !== "rejected"
    && item.status !== "published";
}

export function canBulkRetry(item: ReviewQueueItemApi, moduleEnabled: Record<ModuleType, boolean>) {
  return item.status === "failed" && Boolean(item.publish_job_id) && moduleEnabled[item.type as ModuleType] !== false;
}

export function canDeleteQueueItem(item: ReviewQueueItemApi) {
  if (item.type !== "comment" && item.type !== "post") return false;
  if (item.status === "processing" || item.status === "published") return false;
  if (item.publish_status === "processing" || item.publish_status === "published") return false;
  return ["draft", "pending_review", "approved", "ready_to_publish", "rejected", "failed"].includes(item.status);
}

export function failureGroupForItem(item: ReviewQueueItemApi): FailureGroupKey {
  const text = [
    item.publish_last_error,
    item.source_status,
    item.risk_level,
    ...(item.risk_reasons || []),
  ].filter(Boolean).join(" ").toLowerCase();
  if (!text.trim()) return "unknown";
  if (/auth|oauth|scope|permission|tweet\.write|unauthori[sz]ed|token|credential/.test(text)) return "authorization";
  if (/paused|module|disabled|automation_module_paused/.test(text)) return "module_paused";
  if (/rate|limit|429|too many|cooldown|retry after/.test(text)) return "rate_limit";
  if (/safety|risk|policy|blocked|sensitive|rejected|guard/.test(text)) return "safety";
  if (/publish|x api|twitter|api|network|timeout|external/.test(text)) return "publish_api";
  if (/content|empty|length|invalid|validation|format/.test(text)) return "content";
  return "unknown";
}

export function feedbackIssueLabel(tag: string, t: (key: string, params?: Record<string, string | number>) => string) {
  const normalized = tag.trim();
  const known = ["irrelevant", "too_salesy", "wrong_tone", "fact_risk", "weak_context", "missing_context", "other"];
  if (known.includes(normalized)) return t(`handlingList.rejectDialog.reason.${normalized}`);
  return normalized.replace(/_/g, " ");
}

export function feedbackSceneLabel(scene: string, t: (key: string, params?: Record<string, string | number>) => string) {
  const normalized = scene.trim();
  const known = ["tweet", "reply", "comment", "auto_comment", "dm"];
  if (known.includes(normalized)) return t(`dashboard.feedbackLearning.scene.${normalized}`);
  return normalized.replace(/_/g, " ");
}

export type QueueTrendContextInput = {
  trends: TrendTopicApi[];
  botID: number;
  xAccountID: number;
  sourceID: number;
};
