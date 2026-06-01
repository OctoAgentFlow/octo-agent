import { request } from "@/lib/request";
import type { TrendTopicApi } from "@/services/auto-post.service";

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

export type ReviewQueueType = "all" | "post" | "comment" | "reply" | "dm";
export type ReviewQueueStatus = "all" | "draft" | "pending_review" | "approved" | "ready_to_publish" | "processing" | "published" | "rejected" | "failed";
export type ReviewQueueExecutionMode = "all" | "manual" | "review" | "autopilot";

export type ReviewQueueItemApi = {
  id: number;
  type: "post" | "comment" | "reply" | "dm";
  delivery_mode?: "auto_comment" | "manual_comment" | "quote_post" | "skip" | "inbound_handoff" | string;
  content: string;
  status: Exclude<ReviewQueueStatus, "all">;
  execution_mode: Exclude<ReviewQueueExecutionMode, "all">;
  bot_id: number;
  bot_name?: string;
  twitter_account_id: number;
  twitter_account_name?: string;
  target_summary?: string;
  risk_level: string;
  risk_reasons: string[];
  plan_id?: number;
  content_library_item_id?: number;
  content_title?: string;
  content_direction?: string;
  selected_trends?: TrendTopicApi[];
  publish_job_id?: number;
  publish_status?: string;
  publish_mode?: "simulated" | "dry_run" | "real" | "";
  publish_last_error?: string;
  publish_external_url?: string;
  created_at: string;
  source_status?: string;
  source_id: number;
  feedback_signal_count?: number;
  feedback_signal_summary?: FeedbackSignalSummaryApi;
};

export type FeedbackSignalSummaryApi = {
  count: number;
  scenes: string[];
  issue_tags: string[];
  latest_comment?: string;
  applied_learning_rules?: FeedbackLearningRuleApi[];
};

export type FeedbackLearningRuleApi = {
  issue: string;
  confidence: number;
  accurate_judgments: number;
  instruction: string;
  evidence?: string[];
  preference_status?: string;
};

export type ReviewQueueStatsApi = {
  pending_review: number;
  ready_to_publish: number;
  approved: number;
  rejected: number;
  failed: number;
};

export type ReviewQueueResponseApi = {
  items: ReviewQueueItemApi[];
  total: number;
  page: number;
  page_size: number;
  stats: ReviewQueueStatsApi;
};

export type ReviewQueueQuery = {
  type?: ReviewQueueType;
  status?: ReviewQueueStatus;
  executionMode?: ReviewQueueExecutionMode;
  page?: number;
  pageSize?: number;
};

export type ReviewQueueFeedbackIssueVerdictPayload = {
  queue_type: ReviewQueueItemApi["type"];
  source_id: number;
  bot_id?: number;
  feedback_issue: string;
  verdict: "accurate" | "irrelevant";
  reasons: string[];
};

export type ReviewQueueBulkAction = "approve" | "reject" | "retry";

export type ReviewQueueBulkActionItemPayload = {
  queue_type: ReviewQueueItemApi["type"];
  source_id: number;
  publish_job_id?: number;
};

export type ReviewQueueBulkActionPayload = {
  action: ReviewQueueBulkAction;
  reject_reason?: string;
  items: ReviewQueueBulkActionItemPayload[];
};

export type ReviewQueueBulkActionResultApi = {
  queue_type: ReviewQueueItemApi["type"];
  source_id: number;
  publish_job_id?: number;
  success: boolean;
  error?: string;
};

export type ReviewQueueBulkActionApi = {
  action: ReviewQueueBulkAction;
  total: number;
  succeeded: number;
  failed: number;
  audit_activity_id?: number;
  audit_preview_key?: string;
  results: ReviewQueueBulkActionResultApi[];
};

export type ReviewQueueFeedbackIssueVerdictApi = {
  id: number;
  saved: boolean;
};

export type ReviewQueueFeedbackIssueReasonStatApi = {
  reason: string;
  accurate: number;
  irrelevant: number;
  total: number;
  accuracy_rate: number;
  score_adjustment: number;
};

export type ReviewQueueFeedbackIssueVerdictStatApi = {
  feedback_issue: string;
  accurate: number;
  irrelevant: number;
  total: number;
  accuracy_rate: number;
  reasons: ReviewQueueFeedbackIssueReasonStatApi[];
};

export type ReviewQueueFeedbackIssueVerdictStatsApi = {
  issues: ReviewQueueFeedbackIssueVerdictStatApi[];
};

export type ReviewQueueFeedbackIssueVerdictDetailApi = {
  id: number;
  queue_type: ReviewQueueItemApi["type"];
  source_id: number;
  bot_id?: number;
  feedback_issue: string;
  verdict: "accurate" | "irrelevant" | string;
  reasons: string[];
  content_preview?: string;
  target_summary?: string;
  source_status?: string;
  created_at: string;
  execution_queue_url: string;
};

export type ReviewQueueFeedbackIssueVerdictDetailsApi = {
  items: ReviewQueueFeedbackIssueVerdictDetailApi[];
};

export const reviewQueueService = {
  async list(query?: ReviewQueueQuery) {
    const res = await request.get<ApiResponse<ReviewQueueResponseApi>>("/review-queue", {
      params: {
        type: query?.type && query.type !== "all" ? query.type : undefined,
        status: query?.status && query.status !== "all" ? query.status : undefined,
        execution_mode: query?.executionMode && query.executionMode !== "all" ? query.executionMode : undefined,
        page: query?.page || 1,
        page_size: query?.pageSize || 20,
      },
    });
    return res.data.data;
  },

  async submitFeedbackIssueVerdict(payload: ReviewQueueFeedbackIssueVerdictPayload) {
    const res = await request.post<ApiResponse<ReviewQueueFeedbackIssueVerdictApi>>("/review-queue/feedback-issue-verdict", payload);
    return res.data.data;
  },

  async bulkAction(payload: ReviewQueueBulkActionPayload) {
    const res = await request.post<ApiResponse<ReviewQueueBulkActionApi>>("/review-queue/bulk-action", payload);
    return res.data.data;
  },

  async feedbackIssueVerdictStats() {
    const res = await request.get<ApiResponse<ReviewQueueFeedbackIssueVerdictStatsApi>>("/review-queue/feedback-issue-verdict-stats");
    return res.data.data;
  },

  async feedbackIssueVerdictDetails(query?: { limit?: number }) {
    const res = await request.get<ApiResponse<ReviewQueueFeedbackIssueVerdictDetailsApi>>("/review-queue/feedback-issue-verdict-details", {
      params: { limit: query?.limit },
    });
    return res.data.data;
  },
};
