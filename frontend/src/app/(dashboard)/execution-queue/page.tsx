"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import { ArrowRight, Bot, CheckCircle2, ChevronDown, Clock, ExternalLink, FileText, MessageCircle, Pencil, RefreshCw, Send, ShieldAlert, Sparkles, ThumbsDown, ThumbsUp, Trash2, Wand2, XCircle, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { OperationalBlockersCard, type OperationalBlocker } from "@/components/operations/operational-blockers-card";
import { useConfirm } from "@/components/providers/confirm-provider";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { apiErrorCode, apiErrorMessage } from "@/lib/request";
import { formatDateTime, usePreferredTimeZone } from "@/lib/timezone";
import { automationService } from "@/services/automation.service";
import { activityService, type ActivityItemApi } from "@/services/activity.service";
import { contentDraftService, type ContentDraftApi, type ContentDraftRewriteMode, type TrendFeedbackRating, type TrendTopicApi } from "@/services/content-drafts.service";
import { exposureRadarService } from "@/services/exposure-radar.service";
import { oafBotService } from "@/services/oaf-bot.service";
import { publishingService, type XPublisherStatusApi } from "@/services/publishing.service";
import {
  reviewQueueService,
  type ReviewQueueBulkActionApi,
  type ReviewQueueFeedbackIssueVerdictStatApi,
  type ReviewQueueExecutionMode,
  type ReviewQueueItemApi,
  type ReviewQueueStatus,
  type ReviewQueueType,
} from "@/services/review-queue.service";

type LoadState = "loading" | "ready" | "error";
type ModuleType = "post" | "comment" | "reply" | "dm";
type QueueQualitySignal = "liked" | "disliked" | "more_like_this";
type SocialRewriteMode = "natural" | "shorter" | "human_reply" | "less_marketing" | "more_specific";
type QueueFocus = {
  type: ReviewQueueType;
  sourceID: number | null;
};
type RejectReasonKey = "irrelevant" | "too_salesy" | "wrong_tone" | "fact_risk" | "weak_context" | "other";
type RejectDraft = {
  reason: RejectReasonKey;
  note: string;
};
type FeedbackIssueKey = RejectReasonKey | "missing_context" | "";
type FeedbackIssueMatch = {
  score: number;
  reasons: string[];
  reasonKeys: string[];
};
type FeedbackIssueVerdict = "accurate" | "irrelevant";
type BulkAction = "approve" | "reject" | "retry" | "delete";
type FailureGroupKey = "authorization" | "module_paused" | "rate_limit" | "safety" | "publish_api" | "content" | "unknown";
type PublishOutcomeFilter = "all" | "pending" | "published" | "failed" | "dry_run" | "real";
type SmartBulkGroup = {
  id: string;
  category: "failure" | "feedback" | "bot" | "account" | "type";
  title: string;
  description: string;
  items: ReviewQueueItemApi[];
  approveCount: number;
  rejectCount: number;
  retryCount: number;
};

const typeOptions: ReviewQueueType[] = ["all", "post", "comment", "reply", "dm"];
const statusOptions: ReviewQueueStatus[] = ["all", "draft", "pending_review", "ready_to_publish", "processing", "published", "approved", "rejected", "failed"];
const modeOptions: ReviewQueueExecutionMode[] = ["all", "manual", "review", "autopilot"];
const publishOutcomeOptions: PublishOutcomeFilter[] = ["all", "pending", "published", "failed", "dry_run", "real"];
const rejectReasons: RejectReasonKey[] = ["irrelevant", "too_salesy", "wrong_tone", "fact_risk", "weak_context", "other"];
const queuePageSize = 24;
const queueContentPreviewLength = 360;

function compactQueueContent(content?: string) {
  const normalized = (content || "").trim();
  if (!normalized) return "—";
  if (normalized.length <= queueContentPreviewLength) return normalized;
  return `${normalized.slice(0, queueContentPreviewLength).trimEnd()}...`;
}

function statusTone(status: string) {
  if (status === "ready_to_publish") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  if (status === "processing") return "border-[#1d9bf0]/35 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  if (status === "pending_review" || status === "draft") return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
  if (status === "approved" || status === "published") return "border-[#1d9bf0]/35 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  if (status === "rejected" || status === "failed") return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
  return "border-[#2f3336] bg-[#16181c] text-[#71767b]";
}

function typeIcon(type: string) {
  if (type === "comment") return MessageCircle;
  if (type === "post") return FileText;
  if (type === "dm") return Send;
  return Bot;
}

function sourceTone(type: string) {
  if (type === "post") return "border-[#1d9bf0]/35 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  if (type === "comment") return "border-[#7856ff]/30 bg-[#7856ff]/12 text-[#b8a7ff]";
  if (type === "reply") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
}

function sourceLabelKey(type: string) {
  if (type === "post") return "handlingList.source.autoPost";
  if (type === "comment") return "handlingList.source.autoComment";
  if (type === "reply") return "handlingList.source.autoReply";
  return "handlingList.source.autoDm";
}

function sourceLabelKeyForItem(item: ReviewQueueItemApi) {
  if (item.type === "comment" && item.source_type === "exposure_radar") return "handlingList.source.exposureRadar";
  return sourceLabelKey(item.type);
}

function deliveryLabelKey(item: ReviewQueueItemApi) {
  if (item.type === "comment" && item.delivery_mode === "quote_post") return "handlingList.delivery.quotePost";
  if (item.type === "comment" && item.delivery_mode === "manual_comment") return "handlingList.delivery.manualComment";
  if (item.type === "comment" && item.delivery_mode === "auto_comment") return "handlingList.delivery.autoComment";
  return "";
}

function sourceDescriptionKey(type: string) {
  if (type === "post") return "handlingList.sourceDesc.post";
  if (type === "comment") return "handlingList.sourceDesc.comment";
  if (type === "reply") return "handlingList.sourceDesc.reply";
  return "handlingList.sourceDesc.dm";
}

function sourceDescriptionForItem(item: ReviewQueueItemApi) {
  if (item.type === "comment" && item.source_type === "exposure_radar") return "handlingList.sourceDesc.exposureRadar";
  if (item.type === "comment" && item.delivery_mode === "quote_post") return "handlingList.sourceDesc.quotePost";
  if (item.type === "comment" && item.delivery_mode === "manual_comment") return "handlingList.sourceDesc.manualComment";
  return sourceDescriptionKey(item.type);
}

function canManualPublish(item: ReviewQueueItemApi) {
  if (!item.publish_job_id) return false;
  if (item.status === "ready_to_publish" || item.status === "failed") return true;
  return item.status === "published" && (item.publish_mode === "simulated" || item.publish_mode === "dry_run");
}

function targetLabelKey(type: string) {
  if (type === "post") return "handlingList.item.contentSource";
  if (type === "comment") return "handlingList.item.targetTweet";
  if (type === "reply") return "handlingList.item.replyTarget";
  return "handlingList.item.target";
}

function targetLabelForItem(item: ReviewQueueItemApi) {
  if (item.type === "comment" && item.delivery_mode === "quote_post") return "handlingList.item.quoteTarget";
  return targetLabelKey(item.type);
}

function normalizeTargetSummary(type: string, value: string | undefined, t: (key: string, values?: Record<string, string | number>) => string) {
  const summary = (value || "").trim();
  if (!summary) return "—";
  if (type === "post" && summary === "Content Library Item") return t("handlingList.target.contentLibraryItem");
  if (type === "post" && ["Auto Post", "Content Draft", "Content Draft Planner"].includes(summary)) return t("handlingList.target.autoPostPlanner");
  return summary;
}

function publishStatusKey(status?: string) {
  if (!status) return "handlingList.publishState.notCreated";
  if (status === "pending") return "handlingList.publishState.pending";
  if (status === "processing") return "handlingList.publishState.processing";
  if (status === "published") return "handlingList.publishState.published";
  if (status === "failed") return "handlingList.publishState.failed";
  if (status === "cancelled") return "handlingList.publishState.cancelled";
  return "handlingList.publishState.unknown";
}

function publishTone(status?: string) {
  if (status === "published") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  if (status === "processing") return "border-[#1d9bf0]/35 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  if (status === "failed" || status === "cancelled") return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
  if (status === "pending") return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
  return "border-[#2f3336] bg-[#16181c] text-[#71767b]";
}

function publishOutcomeMatches(item: ReviewQueueItemApi, filter: PublishOutcomeFilter) {
  if (filter === "all") return true;
  if (filter === "dry_run" || filter === "real") return item.publish_mode === filter;
  if (filter === "pending") return item.publish_status === "pending" || item.publish_status === "processing";
  return item.publish_status === filter;
}

function automationPausedToast(t: (key: string, values?: Record<string, string | number>) => string, error: unknown, fallback: string) {
  return apiErrorCode(error) === "automation_module_paused" ? t("automation.pausedNotice.toast") : apiErrorMessage(error) || fallback;
}

function moduleNameKey(type: string) {
  if (type === "post") return "automation.module.post.name";
  if (type === "comment") return "automation.module.comment.name";
  if (type === "reply") return "automation.module.reply.name";
  return "automation.module.dm.name";
}

function normalizedTypeFilter(value: string | null): ReviewQueueType {
  return value && typeOptions.includes(value as ReviewQueueType) ? (value as ReviewQueueType) : "all";
}

function normalizedStatusFilter(value: string | null): ReviewQueueStatus {
  return value && statusOptions.includes(value as ReviewQueueStatus) ? (value as ReviewQueueStatus) : "all";
}

function normalizedModeFilter(value: string | null): ReviewQueueExecutionMode {
  return value && modeOptions.includes(value as ReviewQueueExecutionMode) ? (value as ReviewQueueExecutionMode) : "all";
}

function normalizedPublishOutcomeFilter(value: string | null): PublishOutcomeFilter {
  return value && publishOutcomeOptions.includes(value as PublishOutcomeFilter) ? (value as PublishOutcomeFilter) : "all";
}

function normalizedFocusType(value: string | null): ReviewQueueType {
  const type = normalizedTypeFilter(value);
  return type === "all" ? "all" : type;
}

function normalizeFeedbackIssue(value: string | null): FeedbackIssueKey {
  if (value === "irrelevant" || value === "too_salesy" || value === "wrong_tone" || value === "fact_risk" || value === "weak_context" || value === "missing_context" || value === "other") return value;
  return "";
}

function defaultContentDraftRewriteMode(issue: FeedbackIssueKey): ContentDraftRewriteMode {
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

function defaultSocialRewriteMode(issue: FeedbackIssueKey): SocialRewriteMode {
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

function issueSearchText(item: ReviewQueueItemApi) {
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

function feedbackIssueMatch(item: ReviewQueueItemApi, issue: FeedbackIssueKey, t?: (key: string, params?: Record<string, string | number>) => string, reasonWeights: Record<string, number> = {}): FeedbackIssueMatch {
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

function prioritizeByFeedbackIssue(items: ReviewQueueItemApi[], issue: FeedbackIssueKey, reasonWeights: Record<string, number>) {
  if (!issue) return items;
  return [...items].sort((a, b) => {
    const scoreDiff = feedbackIssueMatch(b, issue, undefined, reasonWeights).score - feedbackIssueMatch(a, issue, undefined, reasonWeights).score;
    if (scoreDiff !== 0) return scoreDiff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

function issueVerdictStatForIssue(stats: ReviewQueueFeedbackIssueVerdictStatApi[], issue: FeedbackIssueKey) {
  if (!issue) return null;
  return stats.find((item) => item.feedback_issue === issue) || null;
}

function reasonWeightsForIssue(stats: ReviewQueueFeedbackIssueVerdictStatApi[], issue: FeedbackIssueKey) {
  const stat = issueVerdictStatForIssue(stats, issue);
  if (!stat) return {};
  return Object.fromEntries(stat.reasons.map((reason) => [reason.reason, reason.score_adjustment]));
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function canEditQueueItem(item: ReviewQueueItemApi) {
  if (item.type !== "comment" && item.type !== "reply" && item.type !== "post") return false;
  return item.status === "pending_review" || item.status === "draft" || item.status === "approved";
}

function isActionableQueueItem(item: ReviewQueueItemApi) {
  if (item.type !== "comment" && item.type !== "reply" && item.type !== "post") return false;
  return ["draft", "pending_review", "approved", "ready_to_publish", "failed"].includes(item.status);
}

function feedbackSceneForQueueType(type: string) {
  if (type === "post") return "tweet";
  if (type === "reply") return "reply";
  if (type === "comment") return "comment";
  return "dm";
}

function queueItemKey(item: ReviewQueueItemApi) {
  return `${item.type}-${item.id}`;
}

function canBulkApprove(item: ReviewQueueItemApi, moduleEnabled: Record<ModuleType, boolean>) {
  return (item.type === "comment" || item.type === "reply" || item.type === "post")
    && (item.status === "pending_review" || item.status === "draft")
    && moduleEnabled[item.type as ModuleType] !== false;
}

function canBulkReject(item: ReviewQueueItemApi) {
  return (item.type === "comment" || item.type === "reply" || item.type === "post")
    && item.status !== "rejected"
    && item.status !== "published";
}

function canBulkRetry(item: ReviewQueueItemApi, moduleEnabled: Record<ModuleType, boolean>) {
  return item.status === "failed" && Boolean(item.publish_job_id) && moduleEnabled[item.type as ModuleType] !== false;
}

function canDeleteQueueItem(item: ReviewQueueItemApi) {
  if (item.type !== "comment" && item.type !== "reply" && item.type !== "post") return false;
  if (item.status === "processing" || item.status === "published") return false;
  if (item.publish_status === "processing" || item.publish_status === "published") return false;
  return ["draft", "pending_review", "approved", "ready_to_publish", "rejected", "failed"].includes(item.status);
}

function failureGroupForItem(item: ReviewQueueItemApi): FailureGroupKey {
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

export default function ExecutionQueuePage() {
  const { t } = useT();
  const timeZone = usePreferredTimeZone();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const urlFilters = useMemo(() => {
    const params = new URLSearchParams(searchKey);
    return {
      type: normalizedTypeFilter(params.get("type")),
      status: normalizedStatusFilter(params.get("status")),
      mode: normalizedModeFilter(params.get("mode")),
      publishOutcome: normalizedPublishOutcomeFilter(params.get("publish_outcome")),
    };
  }, [searchKey]);
  const urlFocus = useMemo<QueueFocus>(() => {
    const params = new URLSearchParams(searchKey);
    const sourceID = Number(params.get("focus_source_id"));
    return {
      type: normalizedFocusType(params.get("focus_type")),
      sourceID: Number.isFinite(sourceID) && sourceID > 0 ? sourceID : null,
    };
  }, [searchKey]);
  const urlFeedbackIssue = useMemo<FeedbackIssueKey>(() => {
    const params = new URLSearchParams(searchKey);
    return normalizeFeedbackIssue(params.get("feedback_issue"));
  }, [searchKey]);
  const { pushToast } = useToast();
  const { confirm } = useConfirm();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [items, setItems] = useState<ReviewQueueItemApi[]>([]);
  const [stats, setStats] = useState({ pending_review: 0, ready_to_publish: 0, approved: 0, rejected: 0, failed: 0 });
  const [typeFilter, setTypeFilter] = useState<ReviewQueueType>(() => urlFilters.type);
  const [statusFilter, setStatusFilter] = useState<ReviewQueueStatus>(() => urlFilters.status);
  const [modeFilter, setModeFilter] = useState<ReviewQueueExecutionMode>(() => urlFilters.mode);
  const [publishOutcomeFilter, setPublishOutcomeFilter] = useState<PublishOutcomeFilter>(() => urlFilters.publishOutcome);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [expandedItemKeys, setExpandedItemKeys] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState<BulkAction | null>(null);
  const [bulkResult, setBulkResult] = useState<ReviewQueueBulkActionApi | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [busyID, setBusyID] = useState<number | null>(null);
  const [qualitySignals, setQualitySignals] = useState<Record<string, QueueQualitySignal>>({});
  const [rewriteModeByKey, setRewriteModeByKey] = useState<Record<string, string>>({});
  const [rewriteFeedbackByKey, setRewriteFeedbackByKey] = useState<Record<string, string>>({});
  const [disabledLearningIssuesByKey, setDisabledLearningIssuesByKey] = useState<Record<string, string[]>>({});
  const [issueMatchVerdicts, setIssueMatchVerdicts] = useState<Record<string, FeedbackIssueVerdict>>({});
  const [feedbackIssueStats, setFeedbackIssueStats] = useState<ReviewQueueFeedbackIssueVerdictStatApi[]>([]);
  const [rejectingItem, setRejectingItem] = useState<ReviewQueueItemApi | null>(null);
  const [rejectDraft, setRejectDraft] = useState<RejectDraft>({ reason: "irrelevant", note: "" });
  const [bulkRejectCandidates, setBulkRejectCandidates] = useState<ReviewQueueItemApi[]>([]);
  const [bulkRejectDraft, setBulkRejectDraft] = useState<RejectDraft>({ reason: "irrelevant", note: "" });
  const [publisherStatus, setPublisherStatus] = useState<XPublisherStatusApi | null>(null);
  const [recentBulkActivity, setRecentBulkActivity] = useState<ActivityItemApi | null>(null);
  const loadSeqRef = useRef(0);
  const loadToastRef = useRef(pushToast);
  const loadTRef = useRef(t);
  const lastLoadErrorToastRef = useRef("");
  const syncingFiltersFromUrlRef = useRef(false);
  const filterStateRef = useRef({
    type: typeFilter,
    status: statusFilter,
    mode: modeFilter,
    publishOutcome: publishOutcomeFilter,
  });
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [moduleEnabled, setModuleEnabled] = useState<Record<ModuleType, boolean>>({
    post: true,
    comment: true,
    reply: true,
    dm: true,
  });

  useEffect(() => {
    loadToastRef.current = pushToast;
    loadTRef.current = t;
  }, [pushToast, t]);

  useEffect(() => {
    filterStateRef.current = {
      type: typeFilter,
      status: statusFilter,
      mode: modeFilter,
      publishOutcome: publishOutcomeFilter,
    };
  }, [modeFilter, publishOutcomeFilter, statusFilter, typeFilter]);

  useEffect(() => {
    const current = filterStateRef.current;
    const hasMismatch = current.type !== urlFilters.type ||
      current.status !== urlFilters.status ||
      current.mode !== urlFilters.mode ||
      current.publishOutcome !== urlFilters.publishOutcome;
    if (!hasMismatch) return;
    syncingFiltersFromUrlRef.current = true;
    setTypeFilter((current) => (current === urlFilters.type ? current : urlFilters.type));
    setStatusFilter((current) => (current === urlFilters.status ? current : urlFilters.status));
    setModeFilter((current) => (current === urlFilters.mode ? current : urlFilters.mode));
    setPublishOutcomeFilter((current) => (current === urlFilters.publishOutcome ? current : urlFilters.publishOutcome));
  }, [urlFilters.mode, urlFilters.publishOutcome, urlFilters.status, urlFilters.type]);

  useEffect(() => {
    if (syncingFiltersFromUrlRef.current) {
      if (
        typeFilter === urlFilters.type &&
        statusFilter === urlFilters.status &&
        modeFilter === urlFilters.mode &&
        publishOutcomeFilter === urlFilters.publishOutcome
      ) {
        syncingFiltersFromUrlRef.current = false;
      }
      return;
    }
    const next = new URLSearchParams();
    if (typeFilter !== "all") next.set("type", typeFilter);
    if (statusFilter !== "all") next.set("status", statusFilter);
    if (modeFilter !== "all") next.set("mode", modeFilter);
    if (publishOutcomeFilter !== "all") next.set("publish_outcome", publishOutcomeFilter);
    if (urlFeedbackIssue) next.set("feedback_issue", urlFeedbackIssue);
    if (urlFocus.type !== "all" && urlFocus.sourceID) {
      next.set("focus_type", urlFocus.type);
      next.set("focus_source_id", String(urlFocus.sourceID));
    }
    const query = next.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    const currentHref = searchKey ? `${pathname}?${searchKey}` : pathname;
    if (href !== currentHref) {
      router.replace(href, { scroll: false });
    }
  }, [modeFilter, pathname, publishOutcomeFilter, router, searchKey, statusFilter, typeFilter, urlFeedbackIssue, urlFilters.mode, urlFilters.publishOutcome, urlFilters.status, urlFilters.type, urlFocus.sourceID, urlFocus.type]);

  const loadQueue = useCallback(async (options?: { forceToast?: boolean }) => {
    const seq = loadSeqRef.current + 1;
    const loadKey = `${typeFilter}:${statusFilter}:${modeFilter}`;
    loadSeqRef.current = seq;
    setLoadState("loading");
    try {
      const [data, publishingStatus, automationData, verdictStats, activityData] = await Promise.all([
        reviewQueueService.list({
          type: typeFilter,
          status: statusFilter,
          executionMode: modeFilter,
          page: 1,
          pageSize: queuePageSize,
        }),
        publishingService.status(),
        automationService.list(),
        reviewQueueService.feedbackIssueVerdictStats(),
        activityService.list({ page: 1, page_size: 5, event_scope: "system", range: "7d" }),
      ]);
      if (loadSeqRef.current !== seq) return;
      setItems(data.items);
      setStats(data.stats);
      setFeedbackIssueStats(verdictStats.issues || []);
      setRecentBulkActivity(activityData.items.find((item) => item.preview_key === "activity.preview.reviewQueueBulkAction") || null);
      setPublisherStatus(publishingStatus);
      setModuleEnabled({
        post: automationData.modules.find((item) => item.type === "post")?.config.enabled ?? true,
        comment: automationData.modules.find((item) => item.type === "comment")?.config.enabled ?? true,
        reply: automationData.modules.find((item) => item.type === "reply")?.config.enabled ?? true,
        dm: automationData.modules.find((item) => item.type === "dm")?.config.enabled ?? true,
      });
      lastLoadErrorToastRef.current = "";
      setLoadState("ready");
    } catch (error) {
      if (loadSeqRef.current !== seq) return;
      const fallback = loadTRef.current("handlingList.errors.load");
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || fallback
        : fallback;
      const toastKey = `${loadKey}:${message}`;
      if (options?.forceToast || lastLoadErrorToastRef.current !== toastKey) {
        loadToastRef.current(message);
        lastLoadErrorToastRef.current = toastKey;
      }
      setLoadState("error");
    }
  }, [modeFilter, statusFilter, typeFilter]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const statCards = useMemo(
    () => [
      { key: "pendingReview", value: stats.pending_review, label: t("handlingList.stats.pendingReview"), icon: Clock },
      { key: "readyToPublish", value: stats.ready_to_publish, label: t("handlingList.stats.readyToPublish"), icon: Send },
      { key: "approved", value: stats.approved, label: t("handlingList.stats.approved"), icon: CheckCircle2 },
      { key: "rejected", value: stats.rejected, label: t("handlingList.stats.rejected"), icon: XCircle },
      { key: "failed", value: stats.failed, label: t("handlingList.stats.failed"), icon: ShieldAlert },
    ],
    [stats, t]
  );
  const activeIssueVerdictStat = useMemo(() => issueVerdictStatForIssue(feedbackIssueStats, urlFeedbackIssue), [feedbackIssueStats, urlFeedbackIssue]);
  const activeReasonWeights = useMemo(() => reasonWeightsForIssue(feedbackIssueStats, urlFeedbackIssue), [feedbackIssueStats, urlFeedbackIssue]);
  const prioritizedItems = useMemo(() => prioritizeByFeedbackIssue(items, urlFeedbackIssue, activeReasonWeights), [activeReasonWeights, items, urlFeedbackIssue]);
  const publishFilteredItems = useMemo(() => prioritizedItems.filter((item) => publishOutcomeMatches(item, publishOutcomeFilter)), [prioritizedItems, publishOutcomeFilter]);
  const visibleSelectableItems = useMemo(() => publishFilteredItems.filter((item) => canBulkApprove(item, moduleEnabled) || canBulkReject(item) || canBulkRetry(item, moduleEnabled) || canDeleteQueueItem(item)), [moduleEnabled, publishFilteredItems]);
  const selectedItems = useMemo(() => publishFilteredItems.filter((item) => selectedKeys.has(queueItemKey(item))), [publishFilteredItems, selectedKeys]);
  const selectedApproveCount = useMemo(() => selectedItems.filter((item) => canBulkApprove(item, moduleEnabled)).length, [moduleEnabled, selectedItems]);
  const selectedRejectCount = useMemo(() => selectedItems.filter(canBulkReject).length, [selectedItems]);
  const selectedRetryCount = useMemo(() => selectedItems.filter((item) => canBulkRetry(item, moduleEnabled)).length, [moduleEnabled, selectedItems]);
  const selectedDeleteCount = useMemo(() => selectedItems.filter(canDeleteQueueItem).length, [selectedItems]);
  const failureGroups = useMemo(() => {
    const groups = new Map<FailureGroupKey, { key: FailureGroupKey; count: number; examples: string[] }>();
    for (const item of publishFilteredItems) {
      if (item.status !== "failed") continue;
      const key = failureGroupForItem(item);
      const group = groups.get(key) || { key, count: 0, examples: [] };
      group.count += 1;
      const example = item.publish_last_error || item.risk_reasons?.find(Boolean) || item.target_summary || item.content;
      if (example && group.examples.length < 2) group.examples.push(example);
      groups.set(key, group);
    }
    return Array.from(groups.values()).sort((a, b) => b.count - a.count);
  }, [publishFilteredItems]);
  const smartBulkGroups = useMemo<SmartBulkGroup[]>(() => {
    const groups = new Map<string, SmartBulkGroup>();
    const ensureGroup = (id: string, category: SmartBulkGroup["category"], title: string, description: string) => {
      const existing = groups.get(id);
      if (existing) return existing;
      const next: SmartBulkGroup = { id, category, title, description, items: [], approveCount: 0, rejectCount: 0, retryCount: 0 };
      groups.set(id, next);
      return next;
    };
    const addItem = (item: ReviewQueueItemApi, id: string, category: SmartBulkGroup["category"], title: string, description: string) => {
      const canApprove = canBulkApprove(item, moduleEnabled);
      const canReject = canBulkReject(item);
      const canRetry = canBulkRetry(item, moduleEnabled);
      if (!canApprove && !canReject && !canRetry) return;
      const group = ensureGroup(id, category, title, description);
      group.items.push(item);
      if (canApprove) group.approveCount += 1;
      if (canReject) group.rejectCount += 1;
      if (canRetry) group.retryCount += 1;
    };

    for (const item of publishFilteredItems) {
      if (item.status === "failed") {
        const key = failureGroupForItem(item);
        addItem(item, `failure-${key}`, "failure", t(`handlingList.failureGroups.${key}.title`), t("handlingList.smartBulk.category.failure"));
      }
      for (const issue of item.feedback_signal_summary?.issue_tags || []) {
        addItem(item, `feedback-${issue}`, "feedback", feedbackIssueLabel(issue, t), t("handlingList.smartBulk.category.feedback"));
      }
      if (item.bot_id || item.bot_name) {
        addItem(item, `bot-${item.bot_id || item.bot_name}`, "bot", item.bot_name || t("handlingList.item.botFallback", { id: item.bot_id || 0 }), t("handlingList.smartBulk.category.bot"));
      }
      if (item.twitter_account_id || item.twitter_account_name) {
        addItem(item, `account-${item.twitter_account_id || item.twitter_account_name}`, "account", item.twitter_account_name || `#${item.twitter_account_id}`, t("handlingList.smartBulk.category.account"));
      }
      addItem(item, `type-${item.type}`, "type", t(sourceLabelKey(item.type)), t("handlingList.smartBulk.category.type"));
    }

    return Array.from(groups.values())
      .filter((group) => group.items.length >= 2)
      .sort((a, b) => b.items.length - a.items.length || b.retryCount - a.retryCount || b.approveCount - a.approveCount)
      .slice(0, 8);
  }, [moduleEnabled, publishFilteredItems, t]);
  const feedbackIssueMatchCount = useMemo(() => (urlFeedbackIssue ? items.filter((item) => feedbackIssueMatch(item, urlFeedbackIssue, undefined, activeReasonWeights).score > 0).length : 0), [activeReasonWeights, items, urlFeedbackIssue]);
  const disabledModuleTypes = useMemo(
    () =>
      (Object.keys(moduleEnabled) as ModuleType[]).filter((type) => {
        if (moduleEnabled[type]) return false;
        return typeFilter === "all" || typeFilter === type;
      }),
    [moduleEnabled, typeFilter]
  );
  const operationalBlockers = useMemo<OperationalBlocker[]>(() => {
    const blockers: OperationalBlocker[] = [];
    if ((publisherStatus?.accounts_missing_tweet_write_count || 0) > 0) {
      blockers.push({
        id: "missing_scope",
        title: t("handlingList.blockers.missingScope.title", { count: publisherStatus?.accounts_missing_tweet_write_count || 0 }),
        description: t("handlingList.blockers.missingScope.description"),
        href: "/accounts?filter=needs_reauth",
        actionLabel: t("handlingList.blockers.missingScope.action"),
        severity: "danger",
        countLabel: String(publisherStatus?.accounts_missing_tweet_write_count || 0),
      });
    }
    if (disabledModuleTypes.length > 0) {
      blockers.push({
        id: "paused_modules",
        title: t("handlingList.blockers.pausedModules.title", { count: disabledModuleTypes.length }),
        description: t("handlingList.blockers.pausedModules.description", {
          modules: disabledModuleTypes.map((type) => t(moduleNameKey(type))).join(" / "),
        }),
        href: "/automations#automation-modules",
        actionLabel: t("handlingList.blockers.pausedModules.action"),
        severity: "danger",
        countLabel: String(disabledModuleTypes.length),
      });
    }
    if (stats.failed > 0) {
      blockers.push({
        id: "failed",
        title: t("handlingList.blockers.failed.title", { count: stats.failed }),
        description: t("handlingList.blockers.failed.description"),
        href: "/handling-list?status=failed",
        actionLabel: t("handlingList.blockers.failed.action"),
        severity: "danger",
        countLabel: String(stats.failed),
      });
    }
    if (stats.pending_review + stats.ready_to_publish > 0) {
      const count = stats.pending_review + stats.ready_to_publish;
      blockers.push({
        id: "review",
        title: t("handlingList.blockers.review.title", { count }),
        description: t("handlingList.blockers.review.description"),
        href: "/handling-list?status=pending_review",
        actionLabel: t("handlingList.blockers.review.action"),
        severity: "warning",
        countLabel: String(count),
      });
    }
    return blockers;
  }, [disabledModuleTypes, publisherStatus?.accounts_missing_tweet_write_count, stats.failed, stats.pending_review, stats.ready_to_publish, t]);
  const focusRequested = urlFocus.type !== "all" && Boolean(urlFocus.sourceID);
  const focusedItem = useMemo(
    () =>
      focusRequested
        ? prioritizedItems.find((item) => item.type === urlFocus.type && item.source_id === urlFocus.sourceID) || null
        : null,
    [focusRequested, prioritizedItems, urlFocus.sourceID, urlFocus.type]
  );
  const focusItemKey = focusedItem ? `${focusedItem.type}-${focusedItem.id}` : "";
  const nextActionItem = focusedItem || prioritizedItems.find(isActionableQueueItem) || null;
  const focusMissing = loadState === "ready" && focusRequested && !focusedItem;

  useEffect(() => {
    if (!focusItemKey || loadState !== "ready") return;
    const node = itemRefs.current[focusItemKey];
    if (!node) return;
    window.setTimeout(() => {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  }, [focusItemKey, loadState]);

  useEffect(() => {
    setSelectedKeys((current) => {
      if (current.size === 0) return current;
      const visibleKeys = new Set(publishFilteredItems.map(queueItemKey));
      const next = new Set(Array.from(current).filter((key) => visibleKeys.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [publishFilteredItems]);

  const focusQueueItem = (item: ReviewQueueItemApi | null) => {
    const next = new URLSearchParams();
    if (typeFilter !== "all") next.set("type", typeFilter);
    if (statusFilter !== "all") next.set("status", statusFilter);
    if (modeFilter !== "all") next.set("mode", modeFilter);
    if (urlFeedbackIssue) next.set("feedback_issue", urlFeedbackIssue);
    if (item) {
      next.set("focus_type", item.type);
      next.set("focus_source_id", String(item.source_id));
    }
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  const moveFocusAfterAction = (handled: ReviewQueueItemApi) => {
    const actionable = items.filter((item) => item.id !== handled.id && isActionableQueueItem(item));
    if (!actionable.length) {
      focusQueueItem(null);
      return;
    }
    const currentIndex = items.findIndex((item) => item.id === handled.id && item.type === handled.type);
    const nextItem = actionable.find((item) => {
      const index = items.findIndex((candidate) => candidate.id === item.id && candidate.type === item.type);
      return currentIndex < 0 || index > currentIndex;
    }) || actionable[0];
    focusQueueItem(nextItem);
  };

  const updateLocalItem = (updated: ReviewQueueItemApi, patch: Partial<ReviewQueueItemApi>) => {
    setItems((current) => current.map((item) => (item.id === updated.id && item.type === updated.type ? { ...item, ...patch } : item)));
  };

  const patchContentDraft = (item: ReviewQueueItemApi, updated: ContentDraftApi) => {
    updateLocalItem(item, {
      content: updated.generated_content || item.content,
      status: updated.status as ReviewQueueItemApi["status"],
      risk_level: updated.risk_level || item.risk_level,
      risk_reasons: [updated.failure_category, updated.failure_reason].filter(Boolean) as string[],
      content_library_item_id: updated.content_library_item_id || item.content_library_item_id,
      content_title: updated.content_title || item.content_title,
      exposure_source_trace: updated.exposure_source_trace || item.exposure_source_trace,
      content_direction: updated.content_direction || item.content_direction,
      selected_trends: updated.selected_trends || item.selected_trends,
      feedback_signal_count: updated.feedback_signal_count,
      feedback_signal_summary: updated.feedback_signal_summary,
    });
  };

  const saveEdit = async (item: ReviewQueueItemApi) => {
    if (!editingContent.trim() || (item.type !== "comment" && item.type !== "reply" && item.type !== "post")) return;
    if (!canEditQueueItem(item)) {
      setEditingKey(null);
      setEditingContent("");
      pushToast(t("handlingList.errors.save"));
      return;
    }
    setBusyID(item.id);
    try {
      if (item.type === "comment") {
        const updated = await exposureRadarService.updateDraft(item.source_id, editingContent.trim());
        updateLocalItem(item, {
          content: updated.generated_comment || editingContent.trim(),
          status: updated.status === "review" ? "pending_review" : updated.status === "sent" ? "published" : (updated.status as ReviewQueueItemApi["status"]),
        });
      } else if (item.type === "reply") {
        const updated = await automationService.updateReplyDraft(item.source_id, editingContent.trim());
        updateLocalItem(item, {
          content: updated.generated_reply || editingContent.trim(),
          status: updated.status === "review" ? "pending_review" : updated.status === "sent" ? "published" : (updated.status as ReviewQueueItemApi["status"]),
        });
      } else {
        const updated = await contentDraftService.updateDraft(item.source_id, editingContent.trim());
        patchContentDraft(item, updated);
      }
      setEditingKey(null);
      setEditingContent("");
      pushToast(t("handlingList.toast.saved"));
      moveFocusAfterAction(item);
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("handlingList.errors.save") : t("handlingList.errors.save"));
    } finally {
      setBusyID(null);
    }
  };

  const approve = async (item: ReviewQueueItemApi) => {
    if (item.type !== "comment" && item.type !== "reply" && item.type !== "post") return;
    setBusyID(item.id);
    try {
      const updated = item.type === "comment"
        ? await exposureRadarService.approveDraft(item.source_id)
        : item.type === "reply"
          ? await automationService.approveReplyDraft(item.source_id)
          : await contentDraftService.approveDraft(item.source_id);
      updateLocalItem(item, { status: updated.status === "review" ? "pending_review" : (updated.status as ReviewQueueItemApi["status"]) });
      pushToast(t(item.type === "post" ? "handlingList.toast.postPublishJobCreated" : "handlingList.toast.approved"));
      moveFocusAfterAction(item);
      void loadQueue();
    } catch (error) {
      pushToast(automationPausedToast(t, error, t("handlingList.errors.approve")));
    } finally {
      setBusyID(null);
    }
  };

  const openRejectDialog = (item: ReviewQueueItemApi) => {
    setRejectingItem(item);
    setRejectDraft({ reason: "irrelevant", note: "" });
  };

  const saveRejectFeedback = async (item: ReviewQueueItemApi, draft: RejectDraft, reasonText: string) => {
    const issueTags = [draft.reason];
    const sampleContext = [item.target_summary, item.content_title, item.content_direction].filter(Boolean).join("\n");
    if (item.type === "comment") {
      return exposureRadarService.createDraftFeedback(item.source_id, {
        rating: "negative",
        issue_tags: issueTags,
        comment: reasonText,
      }).then(() => true).catch(() => false);
    }
    if ((item.type === "reply" || item.type === "post") && item.bot_id) {
      return oafBotService.createGenerationFeedback(item.bot_id, {
        scene: feedbackSceneForQueueType(item.type) as "tweet" | "reply" | "comment" | "dm",
        rating: "negative",
        issue_tags: issueTags,
        comment: reasonText,
        sample_context: sampleContext,
        generated_content: item.content || "",
        provider: "execution_queue_reject",
      }).then(() => true).catch(() => false);
    }
    return false;
  };

  const reject = async (item: ReviewQueueItemApi, draft: RejectDraft = rejectDraft) => {
    if (item.type !== "comment" && item.type !== "reply" && item.type !== "post") return;
    const reasonLabel = t(`handlingList.rejectDialog.reason.${draft.reason}`);
    const reasonText = [reasonLabel, draft.note.trim()].filter(Boolean).join(" — ");
    setBusyID(item.id);
    try {
      const updated = item.type === "comment"
        ? await exposureRadarService.rejectDraft(item.source_id, reasonText || t("handlingList.rejectReason"))
        : item.type === "reply"
          ? await automationService.rejectReplyDraft(item.source_id, reasonText || t("handlingList.rejectReason"))
          : await contentDraftService.rejectDraft(item.source_id, reasonText || t("handlingList.rejectReason"));
      const feedbackSaved = await saveRejectFeedback(item, draft, reasonText || t("handlingList.rejectReason"));
      updateLocalItem(item, { status: updated.status as ReviewQueueItemApi["status"] });
      pushToast(feedbackSaved ? t("handlingList.toast.rejectedLearned", { reason: reasonLabel }) : t("handlingList.toast.rejected"));
      setRejectingItem(null);
      moveFocusAfterAction(item);
      void loadQueue();
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("handlingList.errors.reject") : t("handlingList.errors.reject"));
    } finally {
      setBusyID(null);
    }
  };

  const retryPublish = async (item: ReviewQueueItemApi) => {
    if (!item.publish_job_id) return;
    setBusyID(item.id);
    try {
      await publishingService.retry(item.publish_job_id);
      pushToast(t("handlingList.toast.retryQueued"));
      moveFocusAfterAction(item);
      void loadQueue();
    } catch (error) {
      pushToast(automationPausedToast(t, error, t("handlingList.errors.retry")));
    } finally {
      setBusyID(null);
    }
  };

  const preparePostPublish = async (item: ReviewQueueItemApi) => {
    if (item.type !== "post") return;
    setBusyID(item.id);
    try {
      await contentDraftService.preparePublish(item.source_id);
      pushToast(t("handlingList.toast.postPublishJobCreated"));
      moveFocusAfterAction(item);
      void loadQueue();
    } catch (error) {
      pushToast(automationPausedToast(t, error, t("handlingList.errors.preparePublish")));
    } finally {
      setBusyID(null);
    }
  };

  const saveQualitySignal = (item: ReviewQueueItemApi, signal: QueueQualitySignal) => {
    const key = `${item.type}-${item.id}`;
    setQualitySignals((current) => ({ ...current, [key]: signal }));
    pushToast(t(`handlingList.quality.toast.${signal}`));
  };

  const saveIssueMatchVerdict = async (item: ReviewQueueItemApi, verdict: FeedbackIssueVerdict) => {
    if (!urlFeedbackIssue) return;
    const key = `${urlFeedbackIssue}-${item.type}-${item.id}`;
    const previousVerdict = issueMatchVerdicts[key];
    const match = feedbackIssueMatch(item, urlFeedbackIssue, t, activeReasonWeights);
    setIssueMatchVerdicts((current) => ({ ...current, [key]: verdict }));
    try {
      await reviewQueueService.submitFeedbackIssueVerdict({
        queue_type: item.type,
        source_id: item.source_id || item.id,
        bot_id: item.bot_id,
        feedback_issue: urlFeedbackIssue,
        verdict,
        reasons: match.reasonKeys,
      });
      pushToast(t(`handlingList.feedbackFocus.toast.${verdict}`));
      void loadQueue();
    } catch (error) {
      setIssueMatchVerdicts((current) => {
        const next = { ...current };
        if (previousVerdict) {
          next[key] = previousVerdict;
        } else {
          delete next[key];
        }
        return next;
      });
      pushToast(apiErrorMessage(error) || t("handlingList.feedbackFocus.toast.saveFailed"));
    }
  };

  const rewritePostDraft = async (item: ReviewQueueItemApi) => {
    if (item.type !== "post") return;
    const key = `${item.type}-${item.id}`;
    const rewriteMode = (rewriteModeByKey[key] as ContentDraftRewriteMode) || defaultContentDraftRewriteMode(urlFeedbackIssue);
    const feedback = rewriteFeedbackByKey[key] || "";
    const disabledLearningIssues = disabledLearningIssuesByKey[key] || [];
    setBusyID(item.id);
    try {
      const updated = await contentDraftService.rewriteDraft(item.source_id, {
        rewrite_mode: rewriteMode,
        feedback,
        disabled_learning_issues: disabledLearningIssues,
      });
      patchContentDraft(item, updated);
      setEditingKey(null);
      setEditingContent("");
      pushToast(t("handlingList.quality.toast.rewritten"));
    } catch (error) {
      pushToast(apiErrorCode(error) === "ai_generation_quota_exceeded" ? t("handlingList.quality.errors.quota") : apiErrorMessage(error) || t("handlingList.quality.errors.rewrite"));
    } finally {
      setBusyID(null);
    }
  };

  const rewriteSocialDraft = async (item: ReviewQueueItemApi) => {
    if (item.type !== "comment" && item.type !== "reply") return;
    const key = `${item.type}-${item.id}`;
    const rewriteMode = rewriteModeByKey[key] || defaultSocialRewriteMode(urlFeedbackIssue);
    const feedback = rewriteFeedbackByKey[key] || "";
    const disabledLearningIssues = disabledLearningIssuesByKey[key] || [];
    setBusyID(item.id);
    try {
      if (item.type === "comment") {
        const updated = await exposureRadarService.rewriteDraft(item.source_id, {
          rewrite_mode: rewriteMode,
          feedback,
          disabled_learning_issues: disabledLearningIssues,
        });
        updateLocalItem(item, {
          content: updated.generated_comment || item.content,
          status: updated.status === "review" ? "pending_review" : updated.status === "sent" ? "published" : (updated.status as ReviewQueueItemApi["status"]),
          risk_level: updated.risk_level || item.risk_level,
          risk_reasons: [updated.failure_category, updated.failure_reason].filter(Boolean) as string[],
          feedback_signal_count: updated.feedback_signal_count,
          feedback_signal_summary: updated.feedback_signal_summary,
        });
      } else {
        const updated = await automationService.rewriteReplyDraft(item.source_id, {
          rewrite_mode: rewriteMode,
          feedback,
          disabled_learning_issues: disabledLearningIssues,
        });
        updateLocalItem(item, {
          content: updated.generated_reply || item.content,
          status: updated.status === "review" ? "pending_review" : updated.status === "sent" ? "published" : (updated.status as ReviewQueueItemApi["status"]),
          risk_level: updated.risk_level || item.risk_level,
          risk_reasons: [updated.failure_category, updated.failure_reason].filter(Boolean) as string[],
          feedback_signal_count: updated.feedback_signal_count,
          feedback_signal_summary: updated.feedback_signal_summary,
        });
      }
      setEditingKey(null);
      setEditingContent("");
      pushToast(t("handlingList.socialRewrite.toast.rewritten"));
    } catch (error) {
      pushToast(apiErrorCode(error) === "ai_generation_quota_exceeded" ? t("handlingList.quality.errors.quota") : apiErrorMessage(error) || t("handlingList.socialRewrite.errors.rewrite"));
    } finally {
      setBusyID(null);
    }
  };

  const toggleLearningIssue = async (itemKey: string, botID: number | undefined, issue: string) => {
    const normalized = issue.trim();
    if (!normalized) return;
    const existing = disabledLearningIssuesByKey[itemKey] || [];
    const nextStatus = existing.includes(normalized) ? "enabled" : "disabled";
    setDisabledLearningIssuesByKey((current) => {
      const existing = current[itemKey] || [];
      const nextIssues = existing.includes(normalized) ? existing.filter((item) => item !== normalized) : [...existing, normalized];
      return { ...current, [itemKey]: nextIssues };
    });
    if (!botID) return;
    try {
      await oafBotService.saveLearningRulePreference(botID, normalized, nextStatus);
      pushToast(t(nextStatus === "disabled" ? "handlingList.feedbackSignals.learningRuleSavedDisabled" : "handlingList.feedbackSignals.learningRuleSavedEnabled"));
    } catch (error) {
      setDisabledLearningIssuesByKey((current) => {
        const currentIssues = current[itemKey] || [];
        return {
          ...current,
          [itemKey]: nextStatus === "disabled" ? currentIssues.filter((item) => item !== normalized) : [...new Set([...currentIssues, normalized])],
        };
      });
      pushToast(apiErrorMessage(error) || t("handlingList.feedbackSignals.learningRuleSaveFailed"));
    }
  };

  const realPublish = async (item: ReviewQueueItemApi) => {
    if (!item.publish_job_id) return;
    const confirmKey = publisherStatus?.dry_run ? "handlingList.confirm.dryRunPublish" : "handlingList.confirm.realPublish";
    const confirmed = await confirm({
      description: t(confirmKey),
      confirmLabel: t(publisherStatus?.dry_run ? "handlingList.actions.dryRunPublish" : "handlingList.actions.realPublish"),
      tone: publisherStatus?.dry_run ? "default" : "destructive",
    });
    if (!confirmed) return;
    setBusyID(item.id);
    try {
      const updated = await publishingService.publishNow(item.publish_job_id);
      pushToast(updated.publish_mode === "dry_run" ? t("handlingList.toast.dryRunPublish") : t("handlingList.toast.realPublish"));
      moveFocusAfterAction(item);
      void loadQueue();
    } catch (error) {
      pushToast(automationPausedToast(t, error, t("handlingList.errors.realPublish")));
    } finally {
      setBusyID(null);
    }
  };

  const toggleSelectedItem = (item: ReviewQueueItemApi) => {
    const key = queueItemKey(item);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleSelectVisible = () => {
    setSelectedKeys((current) => {
      const visibleKeys = visibleSelectableItems.map(queueItemKey);
      const allSelected = visibleKeys.length > 0 && visibleKeys.every((key) => current.has(key));
      if (allSelected) return new Set();
      return new Set(visibleKeys);
    });
  };

  const selectSmartBulkGroup = (group: SmartBulkGroup) => {
    setSelectedKeys(new Set(group.items.map(queueItemKey)));
  };

  const bulkCandidatesForAction = (action: BulkAction, sourceItems = selectedItems) => {
    return sourceItems.filter((item) => {
      if (action === "approve") return canBulkApprove(item, moduleEnabled);
      if (action === "reject") return canBulkReject(item);
      if (action === "delete") return canDeleteQueueItem(item);
      return canBulkRetry(item, moduleEnabled);
    });
  };

  const openBulkRejectDialog = () => {
    const candidates = bulkCandidatesForAction("reject");
    if (!candidates.length) {
      pushToast(t("handlingList.bulk.noEligible"));
      return;
    }
    setBulkRejectDraft({ reason: "irrelevant", note: "" });
    setBulkRejectCandidates(candidates);
  };

  const closeBulkRejectDialog = () => {
    setBulkRejectCandidates([]);
    setBulkRejectDraft({ reason: "irrelevant", note: "" });
  };

  const runBulkAction = async (action: BulkAction, options?: { candidates?: ReviewQueueItemApi[]; rejectDraft?: RejectDraft; skipConfirm?: boolean }) => {
    const candidates = bulkCandidatesForAction(action, options?.candidates || selectedItems);
    if (!candidates.length) {
      pushToast(t("handlingList.bulk.noEligible"));
      return;
    }
    const draft = options?.rejectDraft || { reason: "other" as RejectReasonKey, note: t("handlingList.bulk.rejectReason") };
    const reasonLabel = action === "reject" ? t(`handlingList.rejectDialog.reason.${draft.reason}`) : "";
    const reason = action === "reject" ? [reasonLabel, draft.note.trim()].filter(Boolean).join(" — ") : "";
    if (!options?.skipConfirm) {
      const confirmed = await confirm({
        description: t(`handlingList.bulk.confirm.${action}`, { count: candidates.length }),
        confirmLabel: t(`handlingList.bulk.action.${action}`),
        tone: action === "reject" || action === "delete" ? "destructive" : "default",
      });
      if (!confirmed) return;
    }

    setBulkBusy(action);
    try {
      const result = await reviewQueueService.bulkAction({
        action,
        reject_reason: action === "reject" ? reason : undefined,
        items: candidates.map((item) => ({
          queue_type: item.type,
          source_id: item.source_id,
          publish_job_id: item.publish_job_id,
        })),
      });
      if (action === "reject") {
        const succeededKeys = new Set(result.results.filter((item) => item.success).map((item) => `${item.queue_type}-${item.source_id}`));
        await Promise.allSettled(candidates
          .filter((item) => succeededKeys.has(`${item.type}-${item.source_id}`))
          .map((item) => saveRejectFeedback(item, draft, reason)));
      }
      const failedResultKeys = new Set(result.results.filter((item) => !item.success).map((item) => `${item.queue_type}-${item.source_id}-${item.publish_job_id || 0}`));
      setSelectedKeys(new Set(candidates.filter((item) => failedResultKeys.has(`${item.type}-${item.source_id}-${item.publish_job_id || 0}`)).map(queueItemKey)));
      if (action === "reject") closeBulkRejectDialog();
      setBulkResult(result);
      pushToast(t(result.failed > 0 ? "handlingList.bulk.toast.partial" : "handlingList.bulk.toast.success", { succeeded: result.succeeded, failed: result.failed }));
      void loadQueue();
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("handlingList.bulk.toast.partial", { succeeded: 0, failed: candidates.length }) : t("handlingList.bulk.toast.partial", { succeeded: 0, failed: candidates.length }));
    } finally {
      setBulkBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-[#1d9bf0]">{t("handlingList.kicker")}</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">{t("handlingList.title")}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#71767b]">{t("handlingList.subtitle")}</p>
        {publisherStatus ? (
          <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2 text-xs">
            <span className="max-w-full rounded-full border border-[#2f3336] bg-[#0f1419] px-3 py-1 text-[#71767b]">
              {t("handlingList.publisherMode.label")}
            </span>
            <span className={`max-w-full rounded-full border px-3 py-1 ${
              publisherStatus.real_publish_enabled && !publisherStatus.dry_run
                ? "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]"
                : publisherStatus.dry_run
                  ? "border-[#1d9bf0]/35 bg-[#1d9bf0]/10 text-[#8ecdf8]"
                  : "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]"
            }`}>
              {publisherStatus.real_publish_enabled && !publisherStatus.dry_run
                ? t("handlingList.publisherMode.real")
                : publisherStatus.dry_run
                  ? t("handlingList.publisherMode.dryRun")
                  : t("handlingList.publisherMode.simulated")}
            </span>
            <span className="max-w-full break-words rounded-full border border-[#2f3336] bg-[#0f1419] px-3 py-1 text-[#71767b] [overflow-wrap:anywhere]">
              {t("handlingList.publisherMode.limits", {
                daily: publisherStatus.per_account_daily_limit,
                cooldown: publisherStatus.per_account_min_interval_seconds,
              })}
            </span>
            {publisherStatus.accounts_missing_tweet_write_count > 0 ? (
              <span className="max-w-full break-words rounded-full border border-[#ffd400]/25 bg-[#ffd400]/10 px-3 py-1 text-[#f6d96b] [overflow-wrap:anywhere]">
                {t("handlingList.publisherMode.missingScope", { count: publisherStatus.accounts_missing_tweet_write_count })}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <OperationalBlockersCard
        title={t("handlingList.blockers.title")}
        description={t("handlingList.blockers.description")}
        loading={loadState === "loading"}
        blockers={operationalBlockers}
        emptyTitle={t("handlingList.blockers.emptyTitle")}
        emptyDescription={t("handlingList.blockers.emptyDescription")}
      />

      <details className="group rounded-2xl border border-[#2f3336] bg-[#0f1419]">
        <summary className="flex cursor-pointer list-none flex-col gap-3 p-4 marker:hidden md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">{t("handlingList.diagnostics.title")}</p>
            <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("handlingList.diagnostics.description")}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-amber-300/25 bg-amber-500/10 px-2.5 py-1 text-amber-100">
              {t("handlingList.diagnostics.pending", { count: stats.pending_review })}
            </span>
            <span className="rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-2.5 py-1 text-[#7ee0b5]">
              {t("handlingList.diagnostics.ready", { count: stats.ready_to_publish })}
            </span>
            <span className="rounded-full border border-rose-300/25 bg-rose-500/10 px-2.5 py-1 text-rose-100">
              {t("handlingList.diagnostics.failed", { count: stats.failed })}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-[#2f3336] px-2.5 py-1 font-semibold text-[#8ecdf8]">
              {t("handlingList.diagnostics.expand")}
              <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
            </span>
          </div>
        </summary>
        <div className="space-y-4 border-t border-[#2f3336] p-4">
          <div className="grid gap-3 md:grid-cols-5">
            {statCards.map((stat) => (
              <div key={stat.key} className="rounded-xl border border-[#2f3336] bg-black/60 p-4 transition-colors hover:border-[#1d9bf0]/40">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-[#71767b]">{stat.label}</p>
                    <p className="mt-2 text-2xl font-semibold text-white">{stat.value}</p>
                  </div>
                  <stat.icon className="size-4 text-[#1d9bf0]" />
                </div>
              </div>
            ))}
          </div>

          <QueueProgressCard stats={stats} pausedCount={disabledModuleTypes.length} />

          <PublishReadinessCard
            stats={stats}
            publisherStatus={publisherStatus}
            pausedCount={disabledModuleTypes.length}
          />

          {failureGroups.length > 0 ? (
            <div className="rounded-2xl border border-rose-300/20 bg-rose-500/10 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-rose-50">{t("handlingList.failureGroups.title")}</p>
                  <p className="mt-1 text-xs leading-5 text-rose-50/70">{t("handlingList.failureGroups.description")}</p>
                </div>
                <Link href="/handling-list?status=failed" className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full border border-rose-200/25 bg-black/20 px-3 text-sm font-semibold text-rose-50 transition hover:bg-rose-300/10">
                  {t("handlingList.failureGroups.viewFailed")}
                  <ArrowRight className="size-4" />
                </Link>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {failureGroups.slice(0, 3).map((group) => (
                  <Link key={group.key} href="/handling-list?status=failed" className="rounded-2xl border border-rose-200/20 bg-black/30 p-4 transition hover:border-rose-200/40">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-rose-50">{t(`handlingList.failureGroups.${group.key}.title`)}</p>
                        <p className="mt-1 text-xs leading-5 text-rose-50/65">{t(`handlingList.failureGroups.${group.key}.description`)}</p>
                      </div>
                      <span className="shrink-0 rounded-full border border-rose-200/25 bg-black/30 px-2 py-0.5 text-xs font-semibold text-rose-50">{group.count}</span>
                    </div>
                    {group.examples[0] ? (
                      <p className="mt-3 line-clamp-2 text-xs leading-5 text-rose-50/60">{group.examples[0]}</p>
                    ) : null}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {loadState === "ready" && smartBulkGroups.length > 0 ? (
            <SmartBulkGroupPanel groups={smartBulkGroups} selectedKeys={selectedKeys} onSelectGroup={selectSmartBulkGroup} />
          ) : null}

          {loadState === "ready" && visibleSelectableItems.length > 0 ? (
            <div className="rounded-2xl border border-[#2f3336] bg-black/60 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <label className="flex min-w-0 items-center gap-3 text-sm font-semibold text-[#e7e9ea]">
                  <input
                    type="checkbox"
                    checked={visibleSelectableItems.length > 0 && visibleSelectableItems.every((item) => selectedKeys.has(queueItemKey(item)))}
                    onChange={toggleSelectVisible}
                    className="size-4 rounded border-[#2f3336] bg-black"
                  />
                  <span>{t("handlingList.bulk.selectVisible", { count: visibleSelectableItems.length })}</span>
                  <span className="text-xs font-normal text-[#71767b]">{t("handlingList.bulk.selected", { count: selectedItems.length })}</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={bulkBusy !== null || selectedApproveCount === 0} onClick={() => void runBulkAction("approve")}>
                    <CheckCircle2 className="size-4" />
                    {t("handlingList.bulk.action.approveWithCount", { count: selectedApproveCount })}
                  </Button>
                  <Button size="sm" variant="outline" disabled={bulkBusy !== null || selectedRetryCount === 0} onClick={() => void runBulkAction("retry")}>
                    <RefreshCw className="size-4" />
                    {t("handlingList.bulk.action.retryWithCount", { count: selectedRetryCount })}
                  </Button>
                  <Button size="sm" variant="outline" disabled={bulkBusy !== null || selectedRejectCount === 0} onClick={openBulkRejectDialog}>
                    <XCircle className="size-4" />
                    {t("handlingList.bulk.action.rejectWithCount", { count: selectedRejectCount })}
                  </Button>
                  <Button size="sm" variant="outline" disabled={bulkBusy !== null || selectedDeleteCount === 0} onClick={() => void runBulkAction("delete")}>
                    <Trash2 className="size-4" />
                    {t("handlingList.bulk.action.deleteWithCount", { count: selectedDeleteCount })}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          {recentBulkActivity ? (
            <RecentBulkActivityCard activity={recentBulkActivity} />
          ) : null}
        </div>
      </details>

      <Card className="bg-[#0f1419]">
        <div className="grid gap-3 md:grid-cols-4">
          <FilterSelect label={t("handlingList.filters.type")} value={typeFilter} onChange={(value) => setTypeFilter(value as ReviewQueueType)} options={typeOptions} labelPrefix="handlingList.type" />
          <FilterSelect label={t("handlingList.filters.status")} value={statusFilter} onChange={(value) => setStatusFilter(value as ReviewQueueStatus)} options={statusOptions} labelPrefix="handlingList.status" />
          <FilterSelect label={t("handlingList.filters.executionMode")} value={modeFilter} onChange={(value) => setModeFilter(value as ReviewQueueExecutionMode)} options={modeOptions} labelPrefix="handlingList.executionMode" />
          <FilterSelect label={t("handlingList.filters.publishOutcome")} value={publishOutcomeFilter} onChange={(value) => setPublishOutcomeFilter(value as PublishOutcomeFilter)} options={publishOutcomeOptions} labelPrefix="handlingList.publishOutcome" />
        </div>
      </Card>

      {urlFeedbackIssue ? (
        <Card className="border-[#1d9bf0]/25 bg-[#1d9bf0]/10 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#d7ebff]">{t("handlingList.feedbackFocus.title", { issue: t(`handlingList.rejectDialog.reason.${urlFeedbackIssue}`) })}</p>
              <p className="mt-1 text-sm leading-6 text-[#8b98a5]">
                {t("handlingList.feedbackFocus.description", {
                  postMode: t(`handlingList.quality.mode.${defaultContentDraftRewriteMode(urlFeedbackIssue)}`),
                  socialMode: t(`handlingList.socialRewrite.mode.${defaultSocialRewriteMode(urlFeedbackIssue)}`),
                })}
              </p>
              <p className="mt-1 text-xs leading-5 text-[#8ecdf8]">
                {feedbackIssueMatchCount > 0 ? t("handlingList.feedbackFocus.matchCount", { count: feedbackIssueMatchCount }) : t("handlingList.feedbackFocus.noStrongMatch")}
              </p>
              {activeIssueVerdictStat && activeIssueVerdictStat.total > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border border-[#1d9bf0]/30 bg-black/20 px-2.5 py-1 text-[#d7ebff]">
                    {t("handlingList.feedbackFocus.learning.accuracy", { rate: percent(activeIssueVerdictStat.accuracy_rate), total: activeIssueVerdictStat.total })}
                  </span>
                  {activeIssueVerdictStat.reasons.slice(0, 2).map((reason) => (
                    <span key={reason.reason} className={`rounded-full border px-2.5 py-1 ${reason.score_adjustment >= 0 ? "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" : "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]"}`}>
                      {t("handlingList.feedbackFocus.learning.reason", {
                        reason: t(reason.reason),
                        rate: percent(reason.accuracy_rate),
                      })}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <Link href="/handling-list?status=pending_review" className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-[#1d9bf0]/30 px-3 text-sm font-semibold text-[#8ecdf8] transition hover:bg-[#1d9bf0]/10">
              {t("handlingList.feedbackFocus.clear")}
            </Link>
          </div>
        </Card>
      ) : null}

      {disabledModuleTypes.length > 0 ? (
        <Card className="border-amber-300/25 bg-amber-500/10 p-4">
          <p className="text-sm font-semibold text-amber-50">{t("handlingList.pausedNotice.title")}</p>
          <p className="mt-1 text-sm leading-6 text-amber-50/75">
            {t("handlingList.pausedNotice.description", {
              modules: disabledModuleTypes.map((type) => t(moduleNameKey(type))).join(" / "),
            })}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {disabledModuleTypes.map((type) => (
              <Link
                key={type}
                href={`/automations?module=${type}#automation-modules`}
                className="inline-flex h-8 items-center justify-center gap-2 rounded-full border border-amber-300/25 bg-black/20 px-3 text-xs font-semibold text-amber-50 transition hover:bg-amber-300/10"
              >
                {t("handlingList.pausedNotice.fixModule", { module: t(moduleNameKey(type)) })}
                <ArrowRight className="size-3.5" />
              </Link>
            ))}
          </div>
        </Card>
      ) : null}

      {focusRequested || nextActionItem ? (
        <QueueFocusCard
          item={nextActionItem}
          focusRequested={focusRequested}
          focusMissing={focusMissing}
          busy={nextActionItem ? busyID === nextActionItem.id : false}
          modulePaused={nextActionItem ? moduleEnabled[nextActionItem.type as ModuleType] === false : false}
          publisherStatus={publisherStatus}
          onEdit={(item) => {
            const key = `${item.type}-${item.id}`;
            setEditingKey(key);
            setEditingContent(item.content || "");
            itemRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
          onApprove={(item) => void approve(item)}
          onReject={openRejectDialog}
          onPreparePublish={(item) => void preparePostPublish(item)}
          onPublish={(item) => void realPublish(item)}
        />
      ) : null}

      <Card className="overflow-hidden bg-[#0f1419] p-0">
        <div className="border-b border-[#2f3336] p-5 md:p-6">
          <CardHeader title={t("handlingList.list.title")} description={t("handlingList.list.description")} />
        </div>
        {loadState === "loading" ? (
          <div className="m-5 rounded-2xl border border-[#2f3336] bg-black px-4 py-10 text-center text-sm text-[#71767b]">{t("handlingList.loading")}</div>
        ) : null}
        {loadState === "error" ? (
          <div className="m-5 rounded-2xl border border-[#f4212e]/25 bg-[#f4212e]/10 px-4 py-10 text-center text-sm text-[#ff8a91]">
            <p>{t("handlingList.errors.load")}</p>
            <Button className="mt-4" size="sm" variant="outline" onClick={() => void loadQueue({ forceToast: true })}>
              {t("common.retry")}
            </Button>
          </div>
        ) : null}
        {loadState === "ready" && items.length === 0 ? (
          <div className="m-5 rounded-2xl border border-[#2f3336] bg-black px-4 py-12 text-center">
            <p className="text-sm font-medium text-white">{t("handlingList.empty.title")}</p>
            <p className="mt-2 text-sm text-[#71767b]">{t("handlingList.empty.description")}</p>
          </div>
        ) : null}
        {loadState === "ready" && items.length > 0 && publishFilteredItems.length === 0 ? (
          <div className="m-5 rounded-2xl border border-[#2f3336] bg-black px-4 py-12 text-center">
            <p className="text-sm font-medium text-white">{t("handlingList.publishOutcome.empty.title")}</p>
            <p className="mt-2 text-sm text-[#71767b]">{t("handlingList.publishOutcome.empty.description")}</p>
          </div>
        ) : null}
        {loadState === "ready" && publishFilteredItems.length > 0 ? (
          <div className="divide-y divide-[#2f3336]">
            {publishFilteredItems.map((item) => {
              const Icon = typeIcon(item.type);
              const itemKey = queueItemKey(item);
              const isFocused = itemKey === focusItemKey;
              const editing = editingKey === itemKey;
              const contentExpanded = expandedItemKeys.has(itemKey) || isFocused || editing;
              const canExpandContent = (item.content || "").trim().length > queueContentPreviewLength;
              const heavyPanelsOpen = contentExpanded;
              const manageable = item.type === "comment" || item.type === "reply" || item.type === "post";
              const canEdit = canEditQueueItem(item);
              const canReview = manageable && (item.status === "pending_review" || item.status === "draft");
              const canDelete = canDeleteQueueItem(item);
              const bulkSelectable = canBulkApprove(item, moduleEnabled) || canBulkReject(item) || canBulkRetry(item, moduleEnabled) || canDelete;
              const displayTarget = normalizeTargetSummary(item.type, item.target_summary, t);
              const publishStatusLabel = t(publishStatusKey(item.publish_status));
              const modulePaused = moduleEnabled[item.type as ModuleType] === false;
              const issueMatch = feedbackIssueMatch(item, urlFeedbackIssue, t, activeReasonWeights);
              const issueVerdict = urlFeedbackIssue ? issueMatchVerdicts[`${urlFeedbackIssue}-${item.type}-${item.id}`] : undefined;
              const modulePausedTip = modulePaused
                ? t("automation.pausedNotice.actionDisabled", { module: t(moduleNameKey(item.type)) })
                : "";
              return (
                <div
                  key={`${item.type}-${item.id}`}
                  ref={(node) => {
                    itemRefs.current[itemKey] = node;
                  }}
                  className={`p-4 transition-colors md:p-5 ${
                    isFocused
                      ? "bg-[#06111d] shadow-[inset_3px_0_0_#1d9bf0]"
                      : "bg-black hover:bg-[#080808]"
                  }`}
                >
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {bulkSelectable ? (
                          <label className="inline-flex h-7 items-center gap-2 rounded-full border border-[#2f3336] bg-[#0f1419] px-2.5 text-xs text-[#8b98a5]">
                            <input
                              type="checkbox"
                              checked={selectedKeys.has(itemKey)}
                              onChange={() => toggleSelectedItem(item)}
                              className="size-3.5 rounded border-[#2f3336] bg-black"
                            />
                            {t("handlingList.bulk.selectOne")}
                          </label>
                        ) : null}
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${sourceTone(item.type)}`}>
                          <Icon className="size-3.5" />
                          {t(sourceLabelKeyForItem(item))}
                        </span>
                        {deliveryLabelKey(item) ? (
                          <span className="rounded-full border border-[#1d9bf0]/35 bg-[#1d9bf0]/10 px-2.5 py-1 text-xs text-[#8ecdf8]">
                            {t(deliveryLabelKey(item))}
                          </span>
                        ) : null}
                        <span className={`rounded-full border px-2.5 py-1 text-xs ${statusTone(item.status)}`}>{t(`handlingList.status.${item.status}`)}</span>
                        <span className="rounded-full border border-[#2f3336] bg-[#16181c] px-2.5 py-1 text-xs text-[#71767b]">
                          {t(`handlingList.executionMode.${item.execution_mode}`)}
                        </span>
                        {item.risk_level === "high" ? (
                          <span className="rounded-full border border-[#ffd400]/25 bg-[#ffd400]/10 px-2.5 py-1 text-xs text-[#f6d96b]">
                            {t("handlingList.riskFallback")}
                          </span>
                        ) : null}
                        {issueMatch.score > 0 ? (
                          <span className="inline-flex flex-wrap items-center gap-1.5 rounded-full border border-[#1d9bf0]/30 bg-[#1d9bf0]/10 px-2 py-1 text-xs text-[#8ecdf8]">
                            <span className="px-0.5">{t("handlingList.feedbackFocus.matchBadge", { reasons: issueMatch.reasons.join(" / ") })}</span>
                            <button
                              type="button"
                              onClick={() => void saveIssueMatchVerdict(item, "accurate")}
                              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold transition ${
                                issueVerdict === "accurate"
                                  ? "border-[#00ba7c]/40 bg-[#00ba7c]/20 text-[#7ee0b5]"
                                  : "border-[#2f3336] bg-black/30 text-[#8b98a5] hover:border-[#00ba7c]/35 hover:text-[#7ee0b5]"
                              }`}
                            >
                              {t("handlingList.feedbackFocus.verdict.accurate")}
                            </button>
                            <button
                              type="button"
                              onClick={() => void saveIssueMatchVerdict(item, "irrelevant")}
                              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold transition ${
                                issueVerdict === "irrelevant"
                                  ? "border-[#f4212e]/35 bg-[#f4212e]/15 text-[#ff8a91]"
                                  : "border-[#2f3336] bg-black/30 text-[#8b98a5] hover:border-[#f4212e]/30 hover:text-[#ff8a91]"
                              }`}
                            >
                              {t("handlingList.feedbackFocus.verdict.irrelevant")}
                            </button>
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs leading-5 text-[#71767b]">
                        <span className="min-w-0">
                          <span className="font-semibold text-[#8b98a5]">{t(targetLabelForItem(item))}:</span>{" "}
                          <span className="break-words text-[#cfd9e2]">{displayTarget}</span>
                        </span>
                        <span>
                          <span className="font-semibold text-[#8b98a5]">{t("handlingList.item.bot")}:</span>{" "}
                          <span className="text-[#cfd9e2]">{item.bot_name || (item.bot_id ? t("handlingList.item.botFallback", { id: item.bot_id }) : "—")}</span>
                        </span>
                        <span>
                          <span className="font-semibold text-[#8b98a5]">{t("handlingList.item.account")}:</span>{" "}
                          <span className="text-[#cfd9e2]">{item.twitter_account_name || `#${item.twitter_account_id}`}</span>
                        </span>
                      </div>

                      {heavyPanelsOpen ? (
                        <div className="mt-4 grid gap-3 lg:grid-cols-3">
                          <QueueInfoCard
                            icon={Sparkles}
                            label={t("handlingList.item.source")}
                            title={deliveryLabelKey(item) ? t(deliveryLabelKey(item)) : t(sourceLabelKeyForItem(item))}
                            description={t(sourceDescriptionForItem(item))}
                            tone={sourceTone(item.type)}
                          />
                          <QueueInfoCard
                            icon={ShieldAlert}
                            label={t("handlingList.item.executionPath")}
                            title={t(`handlingList.executionMode.${item.execution_mode}`)}
                            description={t(`handlingList.executionPath.${item.execution_mode}`)}
                            tone={statusTone(item.status)}
                          />
                          <QueueInfoCard
                            icon={Send}
                            label={t("handlingList.item.publishState")}
                            title={publishStatusLabel}
                            description={item.publish_job_id ? t("handlingList.publishState.withJob", { id: item.publish_job_id }) : t("handlingList.publishState.withoutJob")}
                            tone={publishTone(item.publish_status)}
                          />
                        </div>
                      ) : null}

                      <div className="mt-4 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
                        {editing ? (
                          <textarea
                            value={editingContent}
                            onChange={(event) => setEditingContent(event.target.value)}
                            rows={4}
                            className="form-input min-h-28 resize-y leading-6"
                          />
                        ) : (
                          <>
                            <p className={`${contentExpanded ? "whitespace-pre-wrap" : ""} break-words text-[15px] leading-7 text-[#e7e9ea] [overflow-wrap:anywhere]`}>
                              {contentExpanded ? item.content || "—" : compactQueueContent(item.content)}
                            </p>
                            {canExpandContent && !isFocused ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="mt-3 h-8 px-2 text-[#8ecdf8]"
                                aria-expanded={contentExpanded}
                                onClick={() =>
                                  setExpandedItemKeys((current) => {
                                    const next = new Set(current);
                                    if (next.has(itemKey)) next.delete(itemKey);
                                    else next.add(itemKey);
                                    return next;
                                  })
                                }
                              >
                                <ChevronDown className={`size-3.5 transition-transform ${contentExpanded ? "rotate-180" : ""}`} />
                                {contentExpanded ? t("handlingList.performance.collapse") : t("handlingList.performance.expand")}
                              </Button>
                            ) : null}
                          </>
                        )}
                      </div>

                      {!heavyPanelsOpen ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-3 h-8"
                          aria-expanded={heavyPanelsOpen}
                          onClick={() =>
                            setExpandedItemKeys((current) => {
                              const next = new Set(current);
                              next.add(itemKey);
                              return next;
                            })
                          }
                        >
                          <ChevronDown className="size-3.5" />
                          {t(manageable ? "handlingList.performance.expandTools" : "handlingList.performance.expandDetails")}
                        </Button>
                      ) : null}

                      {heavyPanelsOpen && item.type === "post" ? (
                        <QueueQualityLoop
                          item={item}
                          selectedSignal={qualitySignals[itemKey]}
                          rewriteMode={(rewriteModeByKey[itemKey] as ContentDraftRewriteMode) || defaultContentDraftRewriteMode(urlFeedbackIssue)}
                          rewriteFeedback={rewriteFeedbackByKey[itemKey] || ""}
                          disabledLearningIssues={disabledLearningIssuesByKey[itemKey] || []}
                          disabled={busyID === item.id || !canEdit}
                          onSignal={(signal) => saveQualitySignal(item, signal)}
                          onRewriteModeChange={(mode) => setRewriteModeByKey((current) => ({ ...current, [itemKey]: mode }))}
                          onRewriteFeedbackChange={(feedback) => setRewriteFeedbackByKey((current) => ({ ...current, [itemKey]: feedback }))}
                          onToggleLearningIssue={(issue) => void toggleLearningIssue(itemKey, item.bot_id, issue)}
                          onRewrite={() => void rewritePostDraft(item)}
                        />
                      ) : null}

                      {heavyPanelsOpen && item.type === "post" && item.exposure_source_trace ? (
                        <QueueExposureSourceTrace trace={item.exposure_source_trace} />
                      ) : null}

                      {heavyPanelsOpen && (item.type === "comment" || item.type === "reply") ? (
                        <SocialDraftRewritePanel
                          item={item}
                          rewriteMode={(rewriteModeByKey[itemKey] as SocialRewriteMode) || defaultSocialRewriteMode(urlFeedbackIssue)}
                          rewriteFeedback={rewriteFeedbackByKey[itemKey] || ""}
                          disabledLearningIssues={disabledLearningIssuesByKey[itemKey] || []}
                          disabled={busyID === item.id || !canEdit}
                          onRewriteModeChange={(mode) => setRewriteModeByKey((current) => ({ ...current, [itemKey]: mode }))}
                          onRewriteFeedbackChange={(feedback) => setRewriteFeedbackByKey((current) => ({ ...current, [itemKey]: feedback }))}
                          onToggleLearningIssue={(issue) => void toggleLearningIssue(itemKey, item.bot_id, issue)}
                          onRewrite={() => void rewriteSocialDraft(item)}
                        />
                      ) : null}

                      {heavyPanelsOpen && item.type === "post" && item.selected_trends?.length ? (
                        <QueueTrendContext
                          trends={item.selected_trends}
                          botID={item.bot_id}
                          xAccountID={item.twitter_account_id}
                          sourceID={item.source_id}
                        />
                      ) : null}

                      {modulePaused ? (
                        <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100/80">
                          {modulePausedTip}
                        </p>
                      ) : null}

                      {heavyPanelsOpen ? (
                        <div className="mt-3 grid gap-2 text-xs text-[#71767b] md:grid-cols-2">
                          <MetaLine label={t("handlingList.item.bot")} value={item.bot_name || (item.bot_id ? t("handlingList.item.botFallback", { id: item.bot_id }) : "—")} />
                          <MetaLine label={t("handlingList.item.account")} value={item.twitter_account_name || `#${item.twitter_account_id}`} />
                          <MetaLine className="md:col-span-2" label={t(targetLabelForItem(item))} value={displayTarget} />
                          <MetaLine label={t("handlingList.item.createdAt")} value={formatDateTime(item.created_at, timeZone)} />
                          <MetaLine
                            label={t("handlingList.item.risk")}
                            value={`${item.risk_level ? t(`handlingList.riskLevel.${item.risk_level}`) : t("handlingList.riskLevel.low")}${item.risk_reasons?.length ? ` · ${item.risk_reasons.join(" / ")}` : ""}`}
                          />
                          {item.publish_job_id ? (
                            <MetaLine
                              className="md:col-span-2"
                              label={t("handlingList.item.publishJob")}
                              value={[
                                `#${item.publish_job_id}`,
                                item.publish_status ? t(`handlingList.publishStatus.${item.publish_status}`) : "",
                                item.publish_mode ? t(`handlingList.publishMode.${item.publish_mode}`) : "",
                                item.publish_last_error || "",
                              ].filter(Boolean).join(" · ")}
                            />
                          ) : null}
                          {item.publish_external_url ? (
                            <a className="md:col-span-2 break-words text-[#1d9bf0] hover:underline" href={item.publish_external_url} target="_blank" rel="noreferrer">
                              {item.publish_external_url}
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="grid shrink-0 gap-2 sm:flex sm:flex-wrap sm:justify-start xl:max-w-[300px] xl:justify-end">
                      {item.status === "ready_to_publish" ? (
                        <span className="inline-flex h-8 items-center rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-3 text-xs text-[#7ee0b5]">
                          {item.publish_job_id ? t("handlingList.actions.inPublishQueue") : t("handlingList.actions.readyForPublishJob")}
                        </span>
                      ) : null}
                      {item.status === "processing" ? (
                        <span className="inline-flex h-8 items-center rounded-full border border-[#1d9bf0]/35 bg-[#1d9bf0]/10 px-3 text-xs text-[#8ecdf8]">
                          {t("handlingList.actions.processing")}
                        </span>
                      ) : null}
                      {editing ? (
                        <>
                          <Button size="sm" className="w-full sm:w-auto" disabled={busyID === item.id} onClick={() => void saveEdit(item)}>{t("handlingList.actions.save")}</Button>
                          <Button size="sm" className="w-full sm:w-auto" variant="outline" onClick={() => setEditingKey(null)}>{t("common.cancel")}</Button>
                        </>
                      ) : (
                        <>
                          {canReview ? (
                            <Button
                              size="sm"
                              className="w-full sm:w-auto"
                              disabled={busyID === item.id || modulePaused}
                              title={modulePausedTip}
                              onClick={() => void approve(item)}
                            >
                              <CheckCircle2 className="size-4" />
                              {t("handlingList.actions.approve")}
                            </Button>
                          ) : null}
                          {manageable && item.status !== "rejected" && item.status !== "published" ? (
                            <Button size="sm" className="w-full sm:w-auto" variant="outline" disabled={busyID === item.id} onClick={() => openRejectDialog(item)}>
                              <XCircle className="size-4" />
                              {t("handlingList.actions.reject")}
                            </Button>
                          ) : null}
                          {canEdit ? (
                            <Button
                              size="sm"
                              className="w-full sm:w-auto"
                              variant="outline"
                              onClick={() => {
                                setEditingKey(itemKey);
                                setEditingContent(item.content || "");
                                setExpandedItemKeys((current) => {
                                  const next = new Set(current);
                                  next.add(itemKey);
                                  return next;
                                });
                              }}
                            >
                              <Pencil className="size-4" />
                              {t("handlingList.actions.edit")}
                            </Button>
                          ) : null}
                          {item.status === "failed" && item.publish_job_id ? (
                            <Button
                              size="sm"
                              className="w-full sm:w-auto"
                              disabled={busyID === item.id || modulePaused}
                              title={modulePausedTip}
                              onClick={() => void retryPublish(item)}
                            >
                              <Send className="size-4" />
                              {t("handlingList.actions.retryPublish")}
                            </Button>
                          ) : null}
                          {item.type === "post" && !item.publish_job_id && (item.status === "ready_to_publish" || item.status === "approved") ? (
                            <Button
                              size="sm"
                              className="w-full sm:w-auto"
                              disabled={busyID === item.id || modulePaused}
                              title={modulePausedTip}
                              onClick={() => void preparePostPublish(item)}
                            >
                              <Send className="size-4" />
                              {t("handlingList.actions.preparePublish")}
                            </Button>
                          ) : null}
                          {canManualPublish(item) ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full sm:w-auto"
                              disabled={busyID === item.id || modulePaused || !publisherStatus?.manual_publish_enabled || (!publisherStatus?.real_publish_enabled && !publisherStatus?.dry_run)}
                              title={modulePaused ? modulePausedTip : !publisherStatus?.real_publish_enabled && !publisherStatus?.dry_run ? t("handlingList.actions.realPublishDisabledTip") : ""}
                              onClick={() => void realPublish(item)}
                            >
                              <Send className="size-4" />
                              {publisherStatus?.dry_run ? t("handlingList.actions.dryRunPublish") : t("handlingList.actions.realPublish")}
                            </Button>
                          ) : null}
                          {canDelete ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full border-[#f4212e]/25 bg-[#f4212e]/5 text-[#ff8a91] hover:bg-[#f4212e]/10 sm:w-auto"
                              disabled={busyID === item.id || bulkBusy !== null}
                              onClick={() => void runBulkAction("delete", { candidates: [item] })}
                            >
                              <Trash2 className="size-4" />
                              {t("handlingList.actions.delete")}
                            </Button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </Card>

      <RejectReasonDialog
        item={rejectingItem}
        draft={rejectDraft}
        busy={rejectingItem ? busyID === rejectingItem.id : false}
        onDraftChange={setRejectDraft}
        onClose={() => setRejectingItem(null)}
        onConfirm={() => rejectingItem ? void reject(rejectingItem, rejectDraft) : undefined}
      />
      <BulkRejectReasonDialog
        count={bulkRejectCandidates.length}
        draft={bulkRejectDraft}
        busy={bulkBusy === "reject"}
        onDraftChange={setBulkRejectDraft}
        onClose={closeBulkRejectDialog}
        onConfirm={() => void runBulkAction("reject", { candidates: bulkRejectCandidates, rejectDraft: bulkRejectDraft, skipConfirm: true })}
      />
      <BulkResultDialog result={bulkResult} onClose={() => setBulkResult(null)} />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  labelPrefix,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  labelPrefix: string;
}) {
  const { t } = useT();
  return (
    <label className="block space-y-2">
      <span className="text-xs font-medium text-[#71767b]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="form-input h-10 py-0"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {t(`${labelPrefix}.${option}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

function SmartBulkGroupPanel({
  groups,
  selectedKeys,
  onSelectGroup,
}: {
  groups: SmartBulkGroup[];
  selectedKeys: Set<string>;
  onSelectGroup: (group: SmartBulkGroup) => void;
}) {
  const { t } = useT();
  return (
    <Card className="border-[#1d9bf0]/20 bg-[#06111d] p-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#d7ebff]">{t("handlingList.smartBulk.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("handlingList.smartBulk.description")}</p>
        </div>
        <span className="w-fit rounded-full border border-[#1d9bf0]/30 bg-black/20 px-2.5 py-1 text-xs font-semibold text-[#8ecdf8]">
          {t("handlingList.smartBulk.groupCount", { count: groups.length })}
        </span>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {groups.map((group) => {
          const selected = group.items.length > 0 && group.items.every((item) => selectedKeys.has(queueItemKey(item)));
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => onSelectGroup(group)}
              className={`min-h-[136px] rounded-xl border p-3 text-left transition ${
                selected
                  ? "border-[#1d9bf0]/60 bg-[#1d9bf0]/15"
                  : "border-[#2f3336] bg-black/20 hover:border-[#1d9bf0]/35 hover:bg-[#1d9bf0]/10"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="line-clamp-2 text-sm font-semibold leading-5 text-[#e7e9ea]">{group.title}</span>
                <span className="shrink-0 rounded-full border border-[#2f3336] bg-black/25 px-2 py-0.5 text-xs font-semibold text-[#8ecdf8]">
                  {group.items.length}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#71767b]">{group.description}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {group.approveCount > 0 ? (
                  <span className="rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-2 py-0.5 text-[11px] font-semibold text-[#7ee0b5]">
                    {t("handlingList.smartBulk.approveCount", { count: group.approveCount })}
                  </span>
                ) : null}
                {group.retryCount > 0 ? (
                  <span className="rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-2 py-0.5 text-[11px] font-semibold text-[#8ecdf8]">
                    {t("handlingList.smartBulk.retryCount", { count: group.retryCount })}
                  </span>
                ) : null}
                {group.rejectCount > 0 ? (
                  <span className="rounded-full border border-[#f4212e]/25 bg-[#f4212e]/10 px-2 py-0.5 text-[11px] font-semibold text-[#ff8a91]">
                    {t("handlingList.smartBulk.rejectCount", { count: group.rejectCount })}
                  </span>
                ) : null}
              </div>
              <p className="mt-3 text-xs font-semibold text-[#8ecdf8]">
                {selected ? t("handlingList.smartBulk.selected") : t("handlingList.smartBulk.select")}
              </p>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function QueueProgressCard({ stats, pausedCount }: { stats: { pending_review: number; ready_to_publish: number; approved: number; rejected: number; failed: number }; pausedCount: number }) {
  const { t } = useT();
  const pending = stats.pending_review + stats.ready_to_publish;
  const completed = stats.approved + stats.rejected;
  const total = pending + completed + stats.failed;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 100;
  const metrics = [
    { key: "pending", value: pending, href: "/handling-list?status=pending_review", tone: "text-amber-100" },
    { key: "completed", value: completed, href: "/handling-list?status=approved", tone: "text-emerald-100" },
    { key: "failed", value: stats.failed, href: "/handling-list?status=failed", tone: "text-rose-100" },
    { key: "paused", value: pausedCount, href: "/automations#automation-modules", tone: "text-[#8ecdf8]" },
  ];
  return (
    <Card className="border-[#1d9bf0]/25 bg-[#06111d] p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#d7ebff]">{t("handlingList.progress.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("handlingList.progress.description")}</p>
        </div>
        <div className="min-w-56">
          <div className="flex items-center justify-between gap-3 text-xs text-[#71767b]">
            <span>{t("handlingList.progress.percent")}</span>
            <span className="font-semibold text-white">{progress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#2f3336]">
            <div className="h-full rounded-full bg-[#00ba7c]" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-4">
        {metrics.map((metric) => (
          <Link key={metric.key} href={metric.href} className="rounded-xl border border-[#2f3336] bg-black/70 p-3 transition hover:border-[#1d9bf0]/60">
            <p className="text-xs text-[#71767b]">{t(`handlingList.progress.metric.${metric.key}`)}</p>
            <p className={`mt-1 text-xl font-semibold ${metric.tone}`}>{metric.value}</p>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function PublishReadinessCard({
  stats,
  publisherStatus,
  pausedCount,
}: {
  stats: { pending_review: number; ready_to_publish: number; approved: number; rejected: number; failed: number };
  publisherStatus: XPublisherStatusApi | null;
  pausedCount: number;
}) {
  const { t } = useT();
  const modeKey = publisherStatus?.real_publish_enabled && !publisherStatus.dry_run
    ? "real"
    : publisherStatus?.dry_run
      ? "dryRun"
      : "simulated";
  const missingScope = publisherStatus?.accounts_missing_tweet_write_count || 0;
  const canManualPublish = Boolean(publisherStatus?.manual_publish_enabled && (publisherStatus.real_publish_enabled || publisherStatus.dry_run));
  const checks = [
    {
      key: "review",
      done: stats.pending_review === 0,
      value: stats.pending_review,
      href: "/handling-list?status=pending_review",
    },
    {
      key: "ready",
      done: stats.ready_to_publish > 0,
      value: stats.ready_to_publish,
      href: "/handling-list?status=ready_to_publish",
    },
    {
      key: "permission",
      done: missingScope === 0,
      value: missingScope,
      href: "/accounts?filter=needs_reauth",
    },
    {
      key: "mode",
      done: canManualPublish,
      value: modeKey,
      href: "/settings",
    },
  ];
  const primaryHref = stats.pending_review > 0
    ? "/handling-list?status=pending_review"
    : stats.ready_to_publish > 0
      ? "/handling-list?status=ready_to_publish"
      : missingScope > 0
        ? "/accounts?filter=needs_reauth"
        : "/exposure-radar";
  return (
    <Card className="border-[#00ba7c]/20 bg-[#04130f] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#d5f8e8]">{t("handlingList.publishReadiness.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">
            {t("handlingList.publishReadiness.description", { mode: t(`handlingList.publisherMode.${modeKey}`) })}
          </p>
          {pausedCount > 0 ? (
            <p className="mt-2 text-xs leading-5 text-amber-100/80">{t("handlingList.publishReadiness.pausedHint", { count: pausedCount })}</p>
          ) : null}
        </div>
        <Link href={primaryHref} className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full bg-[#00ba7c] px-3 text-sm font-semibold text-black hover:bg-[#12c98a]">
          {t("handlingList.publishReadiness.cta")}
          <ArrowRight className="size-4" />
        </Link>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-4">
        {checks.map((check) => (
          <Link key={check.key} href={check.href} className={`rounded-xl border p-3 transition ${check.done ? "border-[#00ba7c]/20 bg-black/35 hover:border-[#00ba7c]/40" : "border-amber-300/20 bg-amber-500/10 hover:border-amber-200/35"}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[#e7e9ea]">{t(`handlingList.publishReadiness.${check.key}.title`)}</p>
              {check.done ? <CheckCircle2 className="size-4 text-[#7ee0b5]" /> : <ShieldAlert className="size-4 text-amber-100" />}
            </div>
            <p className="mt-2 text-xs leading-5 text-[#8b98a5]">
              {t(`handlingList.publishReadiness.${check.key}.description`, { value: check.value })}
            </p>
          </Link>
        ))}
      </div>
    </Card>
  );
}

function RejectReasonDialog({
  item,
  draft,
  busy,
  onDraftChange,
  onClose,
  onConfirm,
}: {
  item: ReviewQueueItemApi | null;
  draft: RejectDraft;
  busy: boolean;
  onDraftChange: (draft: RejectDraft) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useT();
  return (
    <Dialog
      open={Boolean(item)}
      onOpenChange={(open) => !open && onClose()}
      title={t("handlingList.rejectDialog.title")}
      description={t("handlingList.rejectDialog.description")}
      closeLabel={t("common.close")}
      className="max-w-lg"
    >
      <div className="space-y-4">
        {item ? (
          <div className="rounded-xl border border-[#2f3336] bg-black/50 p-3">
            <p className="text-xs text-[#71767b]">{t(sourceLabelKeyForItem(item))}</p>
            <p className="mt-1 line-clamp-3 text-sm leading-6 text-[#e7e9ea]">{item.content || item.target_summary || "—"}</p>
          </div>
        ) : null}
        <label className="block space-y-2">
          <span className="text-xs font-medium text-[#71767b]">{t("handlingList.rejectDialog.reasonLabel")}</span>
          <select value={draft.reason} onChange={(event) => onDraftChange({ ...draft, reason: event.target.value as RejectReasonKey })} className="form-input h-10 py-0">
            {rejectReasons.map((reason) => (
              <option key={reason} value={reason}>
                {t(`handlingList.rejectDialog.reason.${reason}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-2">
          <span className="text-xs font-medium text-[#71767b]">{t("handlingList.rejectDialog.noteLabel")}</span>
          <textarea
            value={draft.note}
            onChange={(event) => onDraftChange({ ...draft, note: event.target.value })}
            rows={3}
            className="form-input min-h-24 resize-y text-sm leading-6"
            placeholder={t("handlingList.rejectDialog.notePlaceholder")}
          />
        </label>
        <div className="rounded-xl border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-3 py-2 text-xs leading-5 text-[#8ecdf8]">
          {t("handlingList.rejectDialog.learningHint")}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={busy}>
            <XCircle className="size-4" />
            {t("handlingList.rejectDialog.confirm")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function BulkRejectReasonDialog({
  count,
  draft,
  busy,
  onDraftChange,
  onClose,
  onConfirm,
}: {
  count: number;
  draft: RejectDraft;
  busy: boolean;
  onDraftChange: (draft: RejectDraft) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useT();
  return (
    <Dialog
      open={count > 0}
      onOpenChange={(open) => !open && onClose()}
      title={t("handlingList.bulkReject.title", { count })}
      description={t("handlingList.bulkReject.description")}
      closeLabel={t("common.close")}
      className="max-w-lg"
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-[#2f3336] bg-black/50 p-3">
          <p className="text-xs text-[#71767b]">{t("handlingList.bulkReject.selected")}</p>
          <p className="mt-1 text-2xl font-semibold text-white">{count}</p>
        </div>
        <label className="block space-y-2">
          <span className="text-xs font-medium text-[#71767b]">{t("handlingList.rejectDialog.reasonLabel")}</span>
          <select value={draft.reason} onChange={(event) => onDraftChange({ ...draft, reason: event.target.value as RejectReasonKey })} className="form-input h-10 py-0" disabled={busy}>
            {rejectReasons.map((reason) => (
              <option key={reason} value={reason}>
                {t(`handlingList.rejectDialog.reason.${reason}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-2">
          <span className="text-xs font-medium text-[#71767b]">{t("handlingList.rejectDialog.noteLabel")}</span>
          <textarea
            value={draft.note}
            onChange={(event) => onDraftChange({ ...draft, note: event.target.value })}
            rows={3}
            className="form-input min-h-24 resize-y text-sm leading-6"
            placeholder={t("handlingList.bulkReject.notePlaceholder")}
            disabled={busy}
          />
        </label>
        <div className="rounded-xl border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-3 py-2 text-xs leading-5 text-[#8ecdf8]">
          {t("handlingList.bulkReject.learningHint")}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={busy}>
            <XCircle className="size-4" />
            {t("handlingList.bulkReject.confirm", { count })}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function BulkResultDialog({ result, onClose }: { result: ReviewQueueBulkActionApi | null; onClose: () => void }) {
  const { t } = useT();
  const failedResults = result?.results.filter((item) => !item.success) || [];
  return (
    <Dialog
      open={Boolean(result)}
      onOpenChange={(open) => !open && onClose()}
      title={result ? t("handlingList.bulkResult.title", { action: t(`handlingList.bulk.action.${result.action}`) }) : ""}
      description={result ? t("handlingList.bulkResult.description", { succeeded: result.succeeded, failed: result.failed, total: result.total }) : ""}
      closeLabel={t("common.close")}
      className="max-w-2xl"
    >
      {result ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[#2f3336] bg-black/40 p-3">
              <p className="text-xs text-[#71767b]">{t("handlingList.bulkResult.total")}</p>
              <p className="mt-1 text-2xl font-semibold text-white">{result.total}</p>
            </div>
            <div className="rounded-xl border border-[#00ba7c]/25 bg-[#00ba7c]/10 p-3">
              <p className="text-xs text-[#7ee0b5]">{t("handlingList.bulkResult.succeeded")}</p>
              <p className="mt-1 text-2xl font-semibold text-[#7ee0b5]">{result.succeeded}</p>
            </div>
            <div className="rounded-xl border border-[#f4212e]/25 bg-[#f4212e]/10 p-3">
              <p className="text-xs text-[#ff8a91]">{t("handlingList.bulkResult.failed")}</p>
              <p className="mt-1 text-2xl font-semibold text-[#ff8a91]">{result.failed}</p>
            </div>
          </div>

          {result.audit_activity_id ? (
            <div className="rounded-xl border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-3 py-2 text-xs leading-5 text-[#8ecdf8]">
              {t("handlingList.bulkResult.audit", { id: result.audit_activity_id })}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {result.failed > 0 ? (
              <Link href="/handling-list?status=failed" className="inline-flex h-9 items-center justify-center rounded-full border border-[#f4212e]/25 bg-[#f4212e]/10 px-3 text-sm font-semibold text-[#ff8a91] hover:bg-[#f4212e]/15">
                {t("handlingList.bulkResult.viewFailed")}
              </Link>
            ) : null}
            {result.audit_activity_id ? (
              <Link href="/activity?event_scope=system&range=7d" className="inline-flex h-9 items-center justify-center rounded-full border border-[#2f3336] px-3 text-sm font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
                {t("handlingList.bulkResult.viewAudit")}
              </Link>
            ) : null}
          </div>

          <div className="max-h-80 overflow-auto rounded-xl border border-[#2f3336]">
            {result.results.map((item, index) => (
              <div key={`${item.queue_type}-${item.source_id}-${item.publish_job_id || 0}-${index}`} className="flex gap-3 border-b border-[#2f3336] px-3 py-3 last:border-b-0">
                <span className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full ${item.success ? "bg-[#00ba7c]/20 text-[#7ee0b5]" : "bg-[#f4212e]/15 text-[#ff8a91]"}`}>
                  {item.success ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#e7e9ea]">
                    {t(sourceLabelKey(item.queue_type))} #{item.source_id}
                    {item.publish_job_id ? <span className="ml-2 text-xs font-normal text-[#71767b]">{t("handlingList.item.publishJob")} #{item.publish_job_id}</span> : null}
                  </p>
                  <p className={`mt-1 text-xs leading-5 ${item.success ? "text-[#7ee0b5]" : "text-[#ff8a91]"}`}>
                    {item.success ? t("handlingList.bulkResult.itemSuccess") : item.error || t("handlingList.bulkResult.itemFailed")}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {failedResults.length > 0 ? (
            <div className="rounded-xl border border-[#f4212e]/20 bg-[#f4212e]/10 px-3 py-2 text-xs leading-5 text-[#ffb6bb]">
              {t("handlingList.bulkResult.failedHint")}
            </div>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}

function RecentBulkActivityCard({ activity }: { activity: ActivityItemApi }) {
  const { t } = useT();
  const timeZone = usePreferredTimeZone();
  const bulk = activity.review_queue_bulk;
  const href = (bulk?.failed || 0) > 0
    ? "/handling-list?status=failed"
    : bulk?.action === "approve"
      ? "/handling-list?status=ready_to_publish"
      : bulk?.action === "reject"
        ? "/handling-list?status=rejected"
        : "/handling-list";
  return (
    <Card className="border-[#1d9bf0]/20 bg-[#07111c] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-normal text-[#8ecdf8]">{t("handlingList.recentBulk.title")}</p>
          <p className="mt-1 text-sm leading-6 text-[#d7ebff]">
            {t("handlingList.recentBulk.summary", {
              action: t(`handlingList.bulk.action.${bulk?.action || "approve"}`),
              total: bulk?.total || 0,
              succeeded: bulk?.succeeded || 0,
              failed: bulk?.failed || 0,
              time: formatDateTime(activity.executed_at, timeZone),
            })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/activity?event_scope=system&range=7d`} className="inline-flex h-8 items-center justify-center rounded-full border border-[#2f3336] px-3 text-sm font-semibold text-white hover:bg-[#16181c]">
            {t("handlingList.recentBulk.openActivity")}
          </Link>
          <Link href={href} className="inline-flex h-8 items-center justify-center rounded-full bg-[#1d9bf0] px-3 text-sm font-semibold text-white hover:bg-[#1a8cd8]">
            {t("handlingList.recentBulk.openQueue")}
          </Link>
        </div>
      </div>
    </Card>
  );
}

function QueueFocusCard({
  item,
  focusRequested,
  focusMissing,
  busy,
  modulePaused,
  publisherStatus,
  onEdit,
  onApprove,
  onReject,
  onPreparePublish,
  onPublish,
}: {
  item: ReviewQueueItemApi | null;
  focusRequested: boolean;
  focusMissing: boolean;
  busy: boolean;
  modulePaused: boolean;
  publisherStatus: XPublisherStatusApi | null;
  onEdit: (item: ReviewQueueItemApi) => void;
  onApprove: (item: ReviewQueueItemApi) => void;
  onReject: (item: ReviewQueueItemApi) => void;
  onPreparePublish: (item: ReviewQueueItemApi) => void;
  onPublish: (item: ReviewQueueItemApi) => void;
}) {
  const { t } = useT();
  if (!item && !focusMissing) return null;
  const canEdit = item ? canEditQueueItem(item) : false;
  const canReview = item ? (item.type === "comment" || item.type === "reply" || item.type === "post") && (item.status === "pending_review" || item.status === "draft") : false;
  const canPrepare = item ? item.type === "post" && !item.publish_job_id && (item.status === "ready_to_publish" || item.status === "approved") : false;
  const canPublish = item ? canManualPublish(item) : false;
  return (
    <Card className="border-[#1d9bf0]/30 bg-[#06111d] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#d7ebff]">
            {focusRequested ? t("handlingList.focus.title") : t("handlingList.focus.nextTitle")}
          </p>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">
            {focusMissing
              ? t("handlingList.focus.missing")
              : item
                ? t("handlingList.focus.description", {
                    type: t(sourceLabelKeyForItem(item)),
                    status: t(`handlingList.status.${item.status}`),
                  })
                : ""}
          </p>
          {item ? (
            <p className="mt-2 truncate text-sm font-semibold text-white">{item.target_summary || item.content_title || item.bot_name || item.content || "—"}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/exposure-radar" className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-[#2f3336] px-3 text-sm font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
            <ArrowRight className="size-4 rotate-180" />
            {t("handlingList.focus.backToOpportunities")}
          </Link>
          {item && canEdit ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onEdit(item)}>
              <Pencil className="size-4" />
              {t("handlingList.actions.edit")}
            </Button>
          ) : null}
          {item && canReview ? (
            <Button size="sm" disabled={busy || modulePaused} onClick={() => onApprove(item)}>
              <CheckCircle2 className="size-4" />
              {t("handlingList.actions.approve")}
            </Button>
          ) : null}
          {item && canPrepare ? (
            <Button size="sm" disabled={busy || modulePaused} onClick={() => onPreparePublish(item)}>
              <Send className="size-4" />
              {t("handlingList.actions.preparePublish")}
            </Button>
          ) : null}
          {item && canPublish ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy || modulePaused || !publisherStatus?.manual_publish_enabled || (!publisherStatus?.real_publish_enabled && !publisherStatus?.dry_run)}
              onClick={() => onPublish(item)}
            >
              <Send className="size-4" />
              {publisherStatus?.dry_run ? t("handlingList.actions.dryRunPublish") : t("handlingList.actions.realPublish")}
            </Button>
          ) : null}
          {item && item.type !== "dm" && item.status !== "rejected" && item.status !== "published" ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onReject(item)}>
              <XCircle className="size-4" />
              {t("handlingList.actions.reject")}
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function QueueInfoCard({
  icon: Icon,
  label,
  title,
  description,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  title: string;
  description: string;
  tone: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className={`inline-flex size-9 shrink-0 items-center justify-center rounded-2xl border ${tone}`}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#71767b]">{label}</p>
          <p className="mt-1 truncate text-sm font-semibold text-white">{title}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#71767b]">{description}</p>
        </div>
      </div>
    </div>
  );
}

function SocialDraftRewritePanel({
  item,
  rewriteMode,
  rewriteFeedback,
  disabledLearningIssues,
  disabled,
  onRewriteModeChange,
  onRewriteFeedbackChange,
  onToggleLearningIssue,
  onRewrite,
}: {
  item: ReviewQueueItemApi;
  rewriteMode: SocialRewriteMode;
  rewriteFeedback: string;
  disabledLearningIssues: string[];
  disabled: boolean;
  onRewriteModeChange: (mode: SocialRewriteMode) => void;
  onRewriteFeedbackChange: (feedback: string) => void;
  onToggleLearningIssue: (issue: string) => void;
  onRewrite: () => void;
}) {
  const { t } = useT();
  const rewriteModes: SocialRewriteMode[] = ["natural", "shorter", "human_reply", "less_marketing", "more_specific"];
  return (
    <div className="mt-3 rounded-2xl border border-[#1d9bf0]/25 bg-[#06111d] p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#d7ebff]">{t("handlingList.socialRewrite.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">
            {t(item.type === "comment" ? "handlingList.socialRewrite.commentDescription" : "handlingList.socialRewrite.replyDescription")}
          </p>
          <p className="mt-2 text-xs leading-5 text-[#8ecdf8]">{t("handlingList.socialRewrite.learningHint")}</p>
        </div>
        <Button size="sm" disabled={disabled} onClick={onRewrite}>
          <Wand2 className="size-4" />
          {t("handlingList.socialRewrite.rewrite")}
        </Button>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[220px_1fr]">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-[#71767b]">{t("handlingList.socialRewrite.mode")}</span>
          <select value={rewriteMode} onChange={(event) => onRewriteModeChange(event.target.value as SocialRewriteMode)} className="form-input h-9 py-0 text-sm" disabled={disabled}>
            {rewriteModes.map((mode) => (
              <option key={mode} value={mode}>
                {t(`handlingList.socialRewrite.mode.${mode}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-[#71767b]">{t("handlingList.socialRewrite.feedback")}</span>
          <input
            value={rewriteFeedback}
            onChange={(event) => onRewriteFeedbackChange(event.target.value)}
            className="form-input h-9 text-sm"
            placeholder={t("handlingList.socialRewrite.feedbackPlaceholder")}
            disabled={disabled}
          />
        </label>
      </div>
      <FeedbackSignalSummary summary={item.feedback_signal_summary} count={item.feedback_signal_count || 0} disabledLearningIssues={disabledLearningIssues} onToggleLearningIssue={onToggleLearningIssue} />
      {disabled ? <p className="mt-2 text-xs leading-5 text-[#71767b]">{t("handlingList.socialRewrite.disabledHint")}</p> : null}
    </div>
  );
}

function QueueQualityLoop({
  item,
  selectedSignal,
  rewriteMode,
  rewriteFeedback,
  disabledLearningIssues,
  disabled,
  onSignal,
  onRewriteModeChange,
  onRewriteFeedbackChange,
  onToggleLearningIssue,
  onRewrite,
}: {
  item: ReviewQueueItemApi;
  selectedSignal?: QueueQualitySignal;
  rewriteMode: ContentDraftRewriteMode;
  rewriteFeedback: string;
  disabledLearningIssues: string[];
  disabled: boolean;
  onSignal: (signal: QueueQualitySignal) => void;
  onRewriteModeChange: (mode: ContentDraftRewriteMode) => void;
  onRewriteFeedbackChange: (feedback: string) => void;
  onToggleLearningIssue: (issue: string) => void;
  onRewrite: () => void;
}) {
  const { t } = useT();
  const signalOptions: Array<{ value: QueueQualitySignal; icon: LucideIcon }> = [
    { value: "liked", icon: ThumbsUp },
    { value: "disliked", icon: ThumbsDown },
    { value: "more_like_this", icon: Sparkles },
  ];
  const rewriteModes: ContentDraftRewriteMode[] = ["more_specific", "shorter", "founder_voice", "announcement", "interactive", "less_marketing"];
  const sourceTitle = item.content_title || item.content_direction || (item.content_library_item_id ? t("handlingList.target.contentLibraryItem") : t("handlingList.target.autoPostPlanner"));
  return (
    <div className="mt-3 rounded-2xl border border-[#1d9bf0]/25 bg-[#06111d] p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Wand2 className="size-4 text-[#8ecdf8]" />
            <p className="text-sm font-semibold text-[#d7ebff]">{t("handlingList.quality.title")}</p>
          </div>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("handlingList.quality.description")}</p>
          <p className="mt-2 break-words text-xs leading-5 text-[#71767b]">
            {t("handlingList.quality.sourcePrefix")} <span className="text-[#cfd9e2]">{sourceTitle}</span>
          </p>
          <p className="mt-2 text-xs leading-5 text-[#8ecdf8]">{t("handlingList.quality.learningHint")}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {signalOptions.map((option) => {
            const Icon = option.icon;
            const active = selectedSignal === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onSignal(option.value)}
                className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition ${
                  active
                    ? "border-[#1d9bf0]/50 bg-[#1d9bf0]/20 text-[#d7ebff]"
                    : "border-[#2f3336] bg-black text-[#8b98a5] hover:border-[#1d9bf0]/45 hover:text-[#d7ebff]"
                }`}
              >
                <Icon className="size-3.5" />
                {t(`handlingList.quality.signal.${option.value}`)}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(180px,240px)_1fr_auto] lg:items-end">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-[#71767b]">{t("handlingList.quality.rewriteMode")}</span>
          <select value={rewriteMode} onChange={(event) => onRewriteModeChange(event.target.value as ContentDraftRewriteMode)} className="form-input h-9 py-0 text-sm" disabled={disabled}>
            {rewriteModes.map((mode) => (
              <option key={mode} value={mode}>
                {t(`handlingList.quality.mode.${mode}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-[#71767b]">{t("handlingList.quality.feedback")}</span>
          <input
            value={rewriteFeedback}
            onChange={(event) => onRewriteFeedbackChange(event.target.value)}
            className="form-input h-9 text-sm"
            placeholder={t("handlingList.quality.feedbackPlaceholder")}
            disabled={disabled}
          />
        </label>
        <Button size="sm" className="h-9 w-full lg:w-auto" onClick={onRewrite} disabled={disabled}>
          <Wand2 className="size-4" />
          {t("handlingList.quality.rewrite")}
        </Button>
      </div>
      <FeedbackSignalSummary summary={item.feedback_signal_summary} count={item.feedback_signal_count || 0} disabledLearningIssues={disabledLearningIssues} onToggleLearningIssue={onToggleLearningIssue} />
      {disabled ? <p className="mt-2 text-xs leading-5 text-[#71767b]">{t("handlingList.quality.disabledHint")}</p> : null}
    </div>
  );
}

function QueueExposureSourceTrace({ trace }: { trace: NonNullable<ReviewQueueItemApi["exposure_source_trace"]> }) {
  const { t } = useT();
  const metrics = [
    { label: t("contentDrafts.contentLibrary.sourceTrace.region"), value: trace.region },
    { label: t("contentDrafts.contentLibrary.sourceTrace.score"), value: trace.score },
    { label: t("contentDrafts.contentLibrary.sourceTrace.velocity"), value: trace.velocity },
    { label: t("contentDrafts.contentLibrary.sourceTrace.risk"), value: trace.risk },
    { label: t("contentDrafts.contentLibrary.sourceTrace.quality"), value: trace.quality },
  ].filter((metric) => metric.value);
  return (
    <div className="mt-3 rounded-2xl border border-[#1d9bf0]/25 bg-[#06111d] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#1d9bf0]/35 bg-[#1d9bf0]/10 px-2.5 py-1 text-xs font-semibold text-[#8ecdf8]">
              {t("contentDrafts.contentLibrary.sourceTrace.title")}
            </span>
            <span className="rounded-full border border-[#2f3336] bg-black px-2.5 py-1 text-xs text-[#8b98a5]">
              {t(`contentDrafts.contentLibrary.sourceTrace.kind.${trace.kind === "brief" ? "brief" : "radar"}`)}
            </span>
          </div>
          <p className="mt-2 break-words text-sm font-semibold text-[#e7e9ea] [overflow-wrap:anywhere]">{trace.signal_title}</p>
        </div>
        {trace.source_url ? (
          <a href={trace.source_url} target="_blank" rel="noreferrer" className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-[#2f3336] bg-black px-3 text-xs font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
            {t("contentDrafts.contentLibrary.sourceTrace.openSource")}
            <ExternalLink className="size-3.5" />
          </a>
        ) : null}
      </div>
      {metrics.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {metrics.map((metric) => (
            <span key={metric.label} className="rounded-full border border-[#2f3336] bg-black px-2.5 py-1 text-xs text-[#8b98a5]">
              <span className="text-[#71767b]">{metric.label}: </span>
              <span className="text-[#cfd9e2]">{metric.value}</span>
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-3 grid gap-2 lg:grid-cols-2">
        {trace.summary ? <TraceTextBlock label={t("contentDrafts.contentLibrary.sourceTrace.summary")} value={trace.summary} /> : null}
        {trace.suggested_action ? <TraceTextBlock label={t("contentDrafts.contentLibrary.sourceTrace.action")} value={trace.suggested_action} /> : null}
        {trace.best_use ? <TraceTextBlock className="lg:col-span-2" label={t("contentDrafts.contentLibrary.sourceTrace.bestUse")} value={trace.best_use} /> : null}
      </div>
    </div>
  );
}

function TraceTextBlock({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-xl border border-[#2f3336] bg-black px-3 py-2 ${className}`}>
      <p className="text-[11px] font-semibold uppercase tracking-normal text-[#71767b]">{label}</p>
      <p className="mt-1 text-sm leading-6 text-[#c9d1d9]">{value}</p>
    </div>
  );
}

function FeedbackSignalSummary({
  summary,
  count,
  disabledLearningIssues,
  onToggleLearningIssue,
}: {
  summary?: ReviewQueueItemApi["feedback_signal_summary"];
  count: number;
  disabledLearningIssues?: string[];
  onToggleLearningIssue?: (issue: string) => void;
}) {
  const { t } = useT();
  if (!summary || summary.count <= 0) {
    if (count <= 0) return null;
    return <p className="mt-3 rounded-xl border border-[#1d9bf0]/20 bg-black/25 px-3 py-2 text-xs text-[#8ecdf8]">{t("handlingList.feedbackSignals.countOnly", { count })}</p>;
  }
  const issueLabels = (summary.issue_tags || []).map((tag) => feedbackIssueLabel(tag, t)).filter(Boolean);
  const sceneLabels = (summary.scenes || []).map((scene) => feedbackSceneLabel(scene, t)).filter(Boolean);
  const learningRules = summary.applied_learning_rules || [];
  return (
    <div className="mt-3 rounded-xl border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 p-3">
      <p className="text-xs font-semibold text-[#8ecdf8]">{t("handlingList.feedbackSignals.title", { count: summary.count })}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {issueLabels.length > 0 ? (
          <span className="rounded-full border border-[#1d9bf0]/30 bg-black/30 px-2.5 py-1 text-xs text-[#c9eefc]">{t("handlingList.feedbackSignals.issues", { issues: issueLabels.join(", ") })}</span>
        ) : null}
        {sceneLabels.length > 0 ? (
          <span className="rounded-full border border-[#1d9bf0]/30 bg-black/30 px-2.5 py-1 text-xs text-[#c9eefc]">{t("handlingList.feedbackSignals.scenes", { scenes: sceneLabels.join(", ") })}</span>
        ) : null}
      </div>
      {summary.latest_comment ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#71767b]">{t("handlingList.feedbackSignals.latest", { comment: summary.latest_comment })}</p> : null}
      {learningRules.length > 0 ? (
        <div className="mt-3 space-y-2 border-t border-[#1d9bf0]/20 pt-3">
          <p className="text-xs font-semibold text-[#c9eefc]">{t("handlingList.feedbackSignals.learningRulesTitle")}</p>
          {learningRules.map((rule) => {
            const disabled = disabledLearningIssues?.includes(rule.issue) || rule.preference_status === "disabled";
            return (
              <div key={rule.issue} className="rounded-lg border border-[#1d9bf0]/20 bg-black/25 p-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#e7e9ea]">
                      {feedbackIssueLabel(rule.issue, t)} <span className="text-[#8b98a5]">· {t("handlingList.feedbackSignals.learningRuleMeta", { confidence: rule.confidence, count: rule.accurate_judgments })}</span>
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{rule.instruction}</p>
                  </div>
                  {onToggleLearningIssue ? (
                    <button
                      type="button"
                      onClick={() => onToggleLearningIssue(rule.issue)}
                      className={`h-7 shrink-0 rounded-full border px-2.5 text-xs font-semibold transition ${
                        disabled ? "border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#facc15]" : "border-[#00ba7c]/40 bg-[#00ba7c]/10 text-[#9ff2c9]"
                      }`}
                    >
                      {disabled ? t("handlingList.feedbackSignals.learningRuleDisabled") : t("handlingList.feedbackSignals.learningRuleEnabled")}
                    </button>
                  ) : null}
                </div>
                {rule.evidence?.length ? <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("handlingList.feedbackSignals.learningRuleEvidence", { evidence: rule.evidence.join(" / ") })}</p> : null}
              </div>
            );
          })}
          <p className="text-xs leading-5 text-[#71767b]">{t("handlingList.feedbackSignals.learningRuleToggleHint")}</p>
        </div>
      ) : null}
    </div>
  );
}

function feedbackIssueLabel(tag: string, t: (key: string, params?: Record<string, string | number>) => string) {
  const normalized = tag.trim();
  const known = ["irrelevant", "too_salesy", "wrong_tone", "fact_risk", "weak_context", "missing_context", "other"];
  if (known.includes(normalized)) return t(`handlingList.rejectDialog.reason.${normalized}`);
  return normalized.replace(/_/g, " ");
}

function feedbackSceneLabel(scene: string, t: (key: string, params?: Record<string, string | number>) => string) {
  const normalized = scene.trim();
  const known = ["tweet", "reply", "comment", "auto_comment", "dm"];
  if (known.includes(normalized)) return t(`dashboard.feedbackLearning.scene.${normalized}`);
  return normalized.replace(/_/g, " ");
}

function QueueTrendContext({ trends, botID, xAccountID, sourceID }: { trends: TrendTopicApi[]; botID: number; xAccountID: number; sourceID: number }) {
  const { t } = useT();
  const { pushToast } = useToast();
  const [pendingKey, setPendingKey] = useState("");
  if (!trends.length) return null;
  async function submitFeedback(trend: TrendTopicApi, rating: TrendFeedbackRating) {
    const key = `${trend.woeid}-${trend.normalized_name || trend.trend_name}-${rating}`;
    setPendingKey(key);
    try {
      await contentDraftService.submitTrendFeedback({
        bot_id: botID || 0,
        x_account_id: xAccountID || 0,
        trend_name: trend.trend_name,
        normalized_name: trend.normalized_name,
        woeid: trend.woeid,
        category: trend.category,
        rating,
        source_type: "execution_queue",
        source_id: sourceID || 0,
      });
      pushToast(t("contentDrafts.trends.feedbackSaved"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("contentDrafts.trends.feedbackFailed") : t("contentDrafts.trends.feedbackFailed"));
    } finally {
      setPendingKey("");
    }
  }
  return (
    <div className="mt-3 rounded-2xl border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="size-4 text-[#1d9bf0]" />
        <p className="text-sm font-semibold text-[#d7ebff]">{t("handlingList.trends.title")}</p>
      </div>
      <div className="grid gap-2">
        {trends.slice(0, 3).map((trend) => (
          <div key={`${trend.woeid}-${trend.normalized_name || trend.trend_name}`} className="rounded-xl border border-[#2f3336] bg-black px-3 py-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-[#e7e9ea]">{trend.trend_name}</span>
              <span className="rounded-full border border-[#2f3336] bg-[#0f1419] px-2 py-0.5 text-[11px] text-[#71767b]">
                {t(`contentDrafts.trends.category.${trend.category}`)}
              </span>
            </div>
            {trend.relevance_reason ? (
              <p className="mt-1 break-words leading-5 text-[#8b98a5]">
                {t("contentDrafts.trends.reasonPrefix")} {trend.relevance_reason}
              </p>
            ) : null}
            {trend.matched_keywords?.length ? (
              <p className="mt-1 break-words leading-5 text-[#71767b]">
                {t("contentDrafts.trends.keywordsPrefix")} {trend.matched_keywords.join(", ")}
              </p>
            ) : null}
            <QueueTrendFeedbackButtons
              trend={trend}
              pendingKey={pendingKey}
              onSubmit={(rating) => void submitFeedback(trend, rating)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function QueueTrendFeedbackButtons({ trend, pendingKey, onSubmit }: { trend: TrendTopicApi; pendingKey: string; onSubmit: (rating: TrendFeedbackRating) => void }) {
  const { t } = useT();
  const baseKey = `${trend.woeid}-${trend.normalized_name || trend.trend_name}`;
  const options: Array<{ rating: TrendFeedbackRating; label: string }> = [
    { rating: "relevant", label: t("contentDrafts.trends.feedback.relevant") },
    { rating: "irrelevant", label: t("contentDrafts.trends.feedback.irrelevant") },
    { rating: "too_forced", label: t("contentDrafts.trends.feedback.tooForced") },
  ];
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {options.map((option) => {
        const loading = pendingKey === `${baseKey}-${option.rating}`;
        return (
          <button
            key={option.rating}
            type="button"
            onClick={() => onSubmit(option.rating)}
            disabled={Boolean(pendingKey)}
            className="rounded-full border border-[#2f3336] bg-black px-2.5 py-1 text-[11px] font-medium text-[#8b98a5] transition hover:border-[#1d9bf0]/50 hover:text-[#d7ebff] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? t("contentDrafts.trends.feedback.saving") : option.label}
          </button>
        );
      })}
    </div>
  );
}

function MetaLine({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <p className={`min-w-0 break-words [overflow-wrap:anywhere] ${className}`}>
      <span className="text-[#71767b]">{label}</span>
      <ArrowRight className="mx-1.5 inline size-3 text-[#2f3336]" />
      <span className="text-[#aeb4bb]">{value || "—"}</span>
    </p>
  );
}
