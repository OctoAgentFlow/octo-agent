import { request } from "@/lib/request";

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

export type AutoPostExecutionMode = "manual" | "review" | "autopilot";
export type AutoPostLengthMode = "standard" | "long";
export type TrendSensitivePolicy = "avoid" | "review_only" | "allow";

export type AutoPostPlanApi = {
  id: number;
  user_id: number;
  x_account_id: number;
  bot_id: number;
  account_handle?: string;
  bot_name?: string;
  enabled: boolean;
  execution_mode: AutoPostExecutionMode;
  /** Deprecated: retained for old API responses; monthly plan quota is enforced instead. */
  daily_limit?: number;
  min_interval_minutes: number;
  posting_windows?: string;
  timezone: string;
  content_length_mode: AutoPostLengthMode;
  trend_regions?: string[];
  trend_categories?: string[];
  excluded_trend_names?: string[];
  allow_general_trends?: boolean;
  sensitive_trend_policy?: TrendSensitivePolicy;
  last_run_at?: string;
  next_run_at?: string;
  processing_at?: string;
  created_at: string;
  updated_at: string;
};

export type AutoPostDraftApi = {
  id: number;
  user_id: number;
  plan_id: number;
  bot_id: number;
  x_account_id: number;
  content_library_item_id?: number;
  content_title?: string;
  exposure_source_trace?: ExposureSourceTraceApi;
  bot_name?: string;
  account_handle?: string;
  content_direction?: string;
  content_hash?: string;
  selected_trends?: TrendTopicApi[];
  generated_content: string;
  feedback_signal_count?: number;
  feedback_signal_summary?: {
    count: number;
    scenes: string[];
    issue_tags: string[];
    latest_comment?: string;
    applied_learning_rules?: Array<{
      issue: string;
      confidence: number;
      accurate_judgments: number;
      instruction: string;
      evidence?: string[];
      preference_status?: string;
    }>;
  };
  status: "draft" | "pending_review" | "approved" | "ready_to_publish" | "published" | "rejected" | "failed";
  risk_level: string;
  capability_status: string;
  failure_category?: string;
  failure_reason?: string;
  approval_required: boolean;
  activity_log_id?: number;
  created_at: string;
  generated_at?: string;
  approved_at?: string;
  rejected_at?: string;
  published_at?: string;
};

export type ExposureSourceTraceApi = {
  kind: "radar" | "brief" | string;
  signal_title: string;
  summary?: string;
  why_it_matters?: string;
  suggested_action?: string;
  best_use?: string;
  region?: string;
  score?: string;
  velocity?: string;
  risk?: string;
  quality?: string;
  source_url?: string;
};

export type AutoPostRewriteMode = "more_specific" | "shorter" | "founder_voice" | "announcement" | "interactive" | "less_marketing";

export type AutoPostPlansData = {
  items: AutoPostPlanApi[];
};

export type AutoPostDraftsData = {
  items: AutoPostDraftApi[];
};

export type AutoPostGenerationRunApi = {
  id: number;
  user_id: number;
  plan_id: number;
  x_account_id: number;
  account_handle?: string;
  bot_id: number;
  bot_name?: string;
  content_library_item_id?: number;
  content_title?: string;
  content_library_item_title?: string;
  status: "completed" | "skipped" | "failed";
  skip_reason?: string;
  generated_draft_id?: number;
  selected_trends?: TrendTopicApi[];
  error_message?: string;
  created_at: string;
};

export type AutoPostGenerationRunsData = {
  items: AutoPostGenerationRunApi[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
  };
};

export type AutoPostGenerationRunQuery = {
  status?: AutoPostGenerationRunApi["status"] | "all";
  xAccountID?: number;
  range?: "all" | "24h" | "7d" | "30d";
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

export type AutoPostPlanPayload = {
  x_account_id: number;
  enabled: boolean;
  execution_mode: AutoPostExecutionMode;
  min_interval_minutes: number;
  posting_windows: string;
  timezone: string;
  content_length_mode: AutoPostLengthMode;
  trend_regions?: string[];
  trend_categories?: string[];
  excluded_trend_names: string[];
  allow_general_trends?: boolean;
  sensitive_trend_policy?: TrendSensitivePolicy;
};

export type TrendTopicApi = {
  id: number;
  trend_name: string;
  normalized_name: string;
  woeid: string;
  region_name: string;
  tweet_count: number;
  category: string;
  risk_level: string;
  language_hint?: string;
  source: string;
  matched_keywords?: string[];
  relevance_reason?: string;
  fetched_at: string;
  expires_at: string;
};

export type TrendSelectionData = {
  items: TrendTopicApi[];
};

export type TrendTopicListData = {
  items: TrendTopicApi[];
};

export type TrendFeedbackRating = "relevant" | "irrelevant" | "too_forced";

export type TrendFeedbackPayload = {
  bot_id?: number;
  x_account_id?: number;
  trend_name: string;
  normalized_name?: string;
  woeid?: string;
  category?: string;
  rating: TrendFeedbackRating;
  source_type?: string;
  source_id?: number;
};

export type TrendFeedbackApi = {
  id: number;
  bot_id: number;
  x_account_id: number;
  trend_name: string;
  normalized_name: string;
  woeid: string;
  category: string;
  rating: TrendFeedbackRating;
  source_type: string;
  source_id: number;
  created_at: string;
};

export type TrendFeedbackListData = {
  items: TrendFeedbackApi[];
  summary: {
    total: number;
    relevant: number;
    irrelevant: number;
    too_forced: number;
  };
};

export const autoPostService = {
  async plans() {
    const res = await request.get<ApiResponse<AutoPostPlansData>>("/auto-post/plans");
    return res.data.data;
  },
  async createPlan(payload: AutoPostPlanPayload) {
    const res = await request.post<ApiResponse<AutoPostPlanApi>>("/auto-post/plans", payload);
    return res.data.data;
  },
  async updatePlan(id: number, payload: AutoPostPlanPayload) {
    const res = await request.put<ApiResponse<AutoPostPlanApi>>(`/auto-post/plans/${id}`, payload);
    return res.data.data;
  },
  async selectedTrends(params: { planID?: number; botID?: number; limit?: number; excludedTrendNames?: string[] }) {
    const res = await request.get<ApiResponse<TrendSelectionData>>("/trends/selected", {
      params: {
        plan_id: params.planID || undefined,
        bot_id: params.botID || undefined,
        limit: params.limit || 3,
        excluded_trend_names: params.excludedTrendNames?.join(",") || undefined,
      },
    });
    return res.data.data;
  },
  async trendTopics(params?: { limit?: number; region?: string; category?: string; riskLevel?: string }) {
    const res = await request.get<ApiResponse<TrendTopicListData>>("/trends/topics", {
      params: {
        limit: params?.limit || 80,
        region: params?.region || undefined,
        category: params?.category || undefined,
        risk_level: params?.riskLevel || undefined,
      },
    });
    return res.data.data;
  },
  async submitTrendFeedback(payload: TrendFeedbackPayload) {
    const res = await request.post<ApiResponse<{ item: unknown }>>("/trends/feedback", payload);
    return res.data.data;
  },
  async trendFeedback(params?: { botID?: number; onlyNegative?: boolean; limit?: number }) {
    const res = await request.get<ApiResponse<TrendFeedbackListData>>("/trends/feedback", {
      params: {
        bot_id: params?.botID || undefined,
        only_negative: params?.onlyNegative ?? undefined,
        limit: params?.limit || 20,
      },
    });
    return res.data.data;
  },
  async deleteTrendFeedback(id: number) {
    const res = await request.delete<ApiResponse<{ deleted: boolean }>>(`/trends/feedback/${id}`);
    return res.data.data;
  },
  async generateDraft(planID: number, contentDirection: string, contentLibraryItemID?: number, excludedTrendNames?: string[]) {
    const res = await request.post<ApiResponse<AutoPostDraftApi>>(`/auto-post/plans/${planID}/generate`, {
      content_direction: contentDirection,
      content_library_item_id: contentLibraryItemID || 0,
      excluded_trend_names: excludedTrendNames || [],
    });
    return res.data.data;
  },
  async drafts() {
    const res = await request.get<ApiResponse<AutoPostDraftsData>>("/auto-post/drafts");
    return res.data.data;
  },
  async runs(query?: AutoPostGenerationRunQuery) {
    const res = await request.get<ApiResponse<AutoPostGenerationRunsData>>("/auto-post/runs", {
      params: {
        status: query?.status && query.status !== "all" ? query.status : undefined,
        x_account_id: query?.xAccountID || undefined,
        range: query?.range && query.range !== "all" ? query.range : undefined,
        date_from: query?.dateFrom || undefined,
        date_to: query?.dateTo || undefined,
        page: query?.page || 1,
        page_size: query?.pageSize || 20,
      },
    });
    return res.data.data;
  },
  async runNow(planID: number) {
    const res = await request.post<ApiResponse<AutoPostGenerationRunApi>>(`/auto-post/plans/${planID}/run-now`);
    return res.data.data;
  },
  async updateDraft(id: number, generatedContent: string) {
    const res = await request.patch<ApiResponse<AutoPostDraftApi>>(`/auto-post/drafts/${id}`, {
      generated_content: generatedContent,
    });
    return res.data.data;
  },
  async rewriteDraft(id: number, payload: { rewrite_mode: AutoPostRewriteMode; feedback?: string; disabled_learning_issues?: string[] }) {
    const res = await request.post<ApiResponse<AutoPostDraftApi>>(`/auto-post/drafts/${id}/rewrite`, payload);
    return res.data.data;
  },
  async approveDraft(id: number) {
    const res = await request.post<ApiResponse<AutoPostDraftApi>>(`/auto-post/drafts/${id}/approve`);
    return res.data.data;
  },
  async preparePublish(id: number) {
    const res = await request.post<ApiResponse<AutoPostDraftApi>>(`/auto-post/drafts/${id}/prepare-publish`);
    return res.data.data;
  },
  async rejectDraft(id: number, reason: string) {
    const res = await request.post<ApiResponse<AutoPostDraftApi>>(`/auto-post/drafts/${id}/reject`, { reason });
    return res.data.data;
  },
};
