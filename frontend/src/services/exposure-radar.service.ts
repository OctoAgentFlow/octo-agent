import { request } from "@/lib/request";

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

export type ExposureRadarRegion = "zh" | "en";

export type ExposureRadarItemApi = {
  id: string;
  region: ExposureRadarRegion;
  data_source: string;
  data_quality: "tweet_level" | "topic_level" | string;
  data_confidence?: "real_impressions" | "engagement_estimate" | "topic_level" | "first_sample" | string;
  data_confidence_reason?: string;
  title: string;
  author_handle?: string;
  author_name?: string;
  author_id?: string;
  content: string;
  url?: string;
  tweet_id?: string;
  status: string;
  signal_label: string;
  topic_name?: string;
  published_at?: string;
  views_per_min?: number;
  heat_count?: number;
  followers_count?: number;
  like_count?: number;
  reply_count?: number;
  retweet_count?: number;
  quote_count?: number;
  bookmark_count?: number;
  impression_count?: number;
  hot_count?: number;
  age_label?: string;
  velocity_state?: "new" | "burst" | "rising" | "steady" | "cooling" | "unknown" | string;
  opportunity_tier?: "hot_opportunity" | "rising_opportunity" | "rising_signal" | "needs_sampling" | "topic_lead" | "early_signal" | string;
  tier_reason?: string;
  quality_stage?: "act_now" | "watch" | "expired" | string;
  quality_reason?: string;
  cooling?: boolean;
  velocity_history?: number[];
  score: number;
  risk_level: string;
  opportunity_type: string;
  recommended_use: string;
  reason: string;
  ranking_delta?: number;
  ranking_reason?: string;
  guardrails?: string[];
  review_task_id?: number;
  review_status?: string;
  review_queue_url?: string;
  generated_comment?: string;
  manual_action_url?: string;
  comment_tweet_id?: string;
  comment_url?: string;
  saved_memory_id?: number;
  updated_at?: string;
};

export type ExposureRadarData = {
  region: ExposureRadarRegion;
  data_source: string;
  data_quality: string;
  source_type?: "owned_collector" | "tl1_fallback" | "x_trends_cache" | string;
  source_status?: "fresh" | "stale" | "fallback" | "cache" | "empty" | "unknown" | string;
  updated_at?: string;
  last_collected_at?: string;
  freshness_seconds?: number;
  filters: {
    region: string;
    bot_id?: number;
    x_account_id?: number;
    hours: number;
    max_fans: number;
    min_hot_count: number;
    limit: number;
  };
  learning_controls?: ExposureRadarLearningControlsApi;
  diagnostics?: ExposureRadarDiagnosticsApi;
  items: ExposureRadarItemApi[];
  source_notice: string;
};

export type ExposureRadarDiagnosticsApi = {
  status: "healthy" | "warming" | "limited" | "empty" | "fallback" | "stale" | "blocked" | string;
  region: ExposureRadarRegion | string;
  source_type: string;
  source_status: string;
  x_trends_enabled: boolean;
  bearer_token_configured: boolean;
  refresh_interval_minutes: number;
  topic_limit: number;
  search_results: number;
  configured_max_fans: number;
  configured_min_heat: number;
  configured_hot_min_views: number;
  configured_hot_min_velocity: number;
  configured_strong_hot_min_views: number;
  configured_strong_hot_min_velocity: number;
  window_hours: number;
  requested_limit: number;
  returned_count: number;
  owned_signal_count: number;
  owned_in_window_count: number;
  owned_under_fan_limit: number;
  owned_over_fan_limit: number;
  visible_pool_count: number;
  window_real_view_count: number;
  window_prior_sample_count: number;
  max_impression_count: number;
  max_views_per_minute: number;
  hot_views_gap: number;
  hot_velocity_gap: number;
  real_view_coverage: number;
  sampling_coverage: number;
  top_missing_reason?: string;
  top_missing_detail?: string;
  latest_owned_signal_at?: string;
  freshness_seconds?: number;
  tweet_level_count: number;
  topic_level_count: number;
  hot_opportunity_count: number;
  rising_opportunity_count: number;
  needs_sampling_count: number;
  topic_lead_count: number;
  real_impression_count: number;
  first_sample_count: number;
  high_score_count: number;
  issues: ExposureRadarDiagnosticIssueApi[];
  suggestions: string[];
};

export type ExposureRadarDiagnosticIssueApi = {
  code: string;
  severity: "critical" | "warning" | "info" | string;
  message: string;
};

export type ExposureRadarLearningControlsApi = {
  ranking_enabled: boolean;
  collector_enabled: boolean;
  mode: "hybrid" | "workspace" | "scoped" | string;
  window_days: number;
  ranking_scope: "selected_bot_account" | "workspace" | "disabled" | "no_memory" | string;
};

export type ExposureRadarDraftPayload = {
  bot_id: number;
  x_account_id: number;
  signal_id: string;
  region: ExposureRadarRegion;
  data_source: string;
  data_quality: string;
  tweet_id?: string;
  url?: string;
  title: string;
  author_handle?: string;
  author_name?: string;
  content: string;
  topic_name?: string;
  score: number;
  risk_level: string;
  opportunity_type: string;
  recommended_use: string;
  reason: string;
};

export type ExposureRadarDraftApi = {
  id: number;
  generated_comment?: string;
  status: "draft" | "review" | "pending_review" | "approved" | "ready_to_publish" | "processing" | "published" | "rejected" | "sending" | "blocked" | "failed" | "sent" | "handled" | "skipped" | string;
  risk_level: "low" | "medium" | "high" | string;
  capability_status?: string;
  failure_category?: string;
  failure_reason?: string;
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
  manual_action_url?: string;
  comment_tweet_id?: string;
  comment_url?: string;
};

export type ExposureRadarDraftFeedbackPayload = {
  rating: "positive" | "negative";
  issue_tags: string[];
  comment?: string;
  outcome?: "effective" | "neutral" | "ineffective" | "not_suitable";
};

export type ExposureRadarManualHandlePayload = {
  published_url?: string;
  comment_tweet_id?: string;
  note?: string;
};

export type ExposureRadarResultLookupApi = {
  published_url?: string;
  comment_tweet_id?: string;
  status: "fetched" | "token_missing" | "lookup_failed" | "not_found" | "id_only" | string;
  source: string;
  message?: string;
  metrics_fetched: boolean;
  result_impression_count?: number;
  result_like_count?: number;
  result_reply_count?: number;
  result_retweet_count?: number;
  result_quote_count?: number;
  result_bookmark_count?: number;
};

export type ExposureRadarResultRefreshApi = {
  region: ExposureRadarRegion | "all" | string;
  days: number;
  limit: number;
  token_configured: boolean;
  scanned_count: number;
  eligible_count: number;
  refreshed_count: number;
  skipped_count: number;
  failed_count: number;
  message?: string;
  items: Array<{
    signal_id: string;
    published_url?: string;
    comment_tweet_id?: string;
    status: string;
    message?: string;
    result_impression_count?: number;
    result_like_count?: number;
    result_reply_count?: number;
    result_retweet_count?: number;
    result_quote_count?: number;
    result_bookmark_count?: number;
    result_score?: number;
    result_checked_at?: string;
  }>;
};

export type ExposureRadarSafetyCheckApi = {
  key: string;
  status: "pass" | "watch" | "block" | string;
  title: string;
  detail: string;
};

export type ExposureRadarManualRecordPayload = {
  bot_id?: number;
  x_account_id?: number;
  signal_id: string;
  region?: ExposureRadarRegion;
  data_source?: string;
  data_quality?: string;
  tweet_id?: string;
  url?: string;
  title?: string;
  content?: string;
  author_id?: string;
  author_handle?: string;
  author_name?: string;
  topic_name?: string;
  score?: number;
  risk_level?: string;
  opportunity_type?: string;
  opportunity_tier?: string;
  quality_stage?: string;
  views_per_minute?: number;
  followers_count?: number;
  heat_count?: number;
  reply_count?: number;
  retweet_count?: number;
  like_count?: number;
  quote_count?: number;
  bookmark_count?: number;
  impression_count?: number;
  review_task_id?: number;
  saved_memory_id?: number;
  generated_comment?: string;
  task_status?: "todo" | "in_progress" | "done" | "skipped" | "later" | string;
  copied?: boolean;
  opened?: boolean;
  saved?: boolean;
  handled?: boolean;
  published_url?: string;
  outcome?: "effective" | "neutral" | "ineffective" | "not_suitable" | string;
  feedback_comment?: string;
  result_impression_count?: number;
  result_like_count?: number;
  result_reply_count?: number;
  result_retweet_count?: number;
  result_quote_count?: number;
  result_bookmark_count?: number;
  result_notes?: string;
  safety_status?: string;
  safety_summary?: string;
  safety_checks?: ExposureRadarSafetyCheckApi[];
  reply_angle_id?: string;
  reply_angle_title?: string;
};

export type ExposureRadarManualRecordApi = {
  id: number;
  bot_id?: number;
  x_account_id?: number;
  signal_id: string;
  region: ExposureRadarRegion | string;
  data_source?: string;
  data_quality?: string;
  tweet_id?: string;
  url?: string;
  title?: string;
  content?: string;
  author_id?: string;
  author_handle?: string;
  author_name?: string;
  topic_name?: string;
  score: number;
  risk_level?: string;
  opportunity_type?: string;
  opportunity_tier?: string;
  quality_stage?: string;
  views_per_minute?: number;
  followers_count?: number;
  heat_count?: number;
  reply_count?: number;
  retweet_count?: number;
  like_count?: number;
  quote_count?: number;
  bookmark_count?: number;
  impression_count?: number;
  review_task_id?: number;
  saved_memory_id?: number;
  generated_comment?: string;
  task_status?: string;
  published_url?: string;
  outcome?: string;
  feedback_comment?: string;
  result_impression_count?: number;
  result_like_count?: number;
  result_reply_count?: number;
  result_retweet_count?: number;
  result_quote_count?: number;
  result_bookmark_count?: number;
  result_notes?: string;
  result_score?: number;
  result_checked_at?: string;
  safety_status?: string;
  safety_summary?: string;
  safety_checks?: ExposureRadarSafetyCheckApi[];
  reply_angle_id?: string;
  reply_angle_title?: string;
  copied_at?: string;
  opened_at?: string;
  saved_at?: string;
  handled_at?: string;
  feedback_at?: string;
  created_at?: string;
  updated_at?: string;
};

export type ExposureRadarPeopleItemApi = {
  key: string;
  name: string;
  handle?: string;
  count: number;
  handled: number;
  copied: number;
  opened: number;
  saved: number;
  feedback: number;
  max_score: number;
  total_engagement: number;
  followers?: number;
  stage: "priority" | "repeat" | "engaged" | "new" | string;
  crm_stage?: string;
  notes?: string;
  tags?: string[];
  last_interaction_at?: string;
  crm_updated_at?: string;
  latest_record: ExposureRadarManualRecordApi;
};

export type ExposureRadarGrowthStrategyApi = {
  id?: number;
  bot_id?: number;
  x_account_id?: number;
  region: ExposureRadarRegion | string;
  target_audience?: string;
  primary_goal?: string;
  core_topics: string[];
  avoid_topics: string[];
  competitors: string[];
  reply_style: "operator_observation" | "light_question" | "peer_experience" | "caution_note" | string;
  daily_move_limit: number;
  safety_mode: "conservative" | "balanced" | "growth" | string;
  operator_notes?: string;
  last_reviewed_summary?: string;
  created_at?: string;
  updated_at?: string;
};

export type ExposureRadarGrowthStrategyPayload = {
  bot_id?: number;
  x_account_id?: number;
  region: ExposureRadarRegion;
  target_audience?: string;
  primary_goal?: string;
  core_topics?: string[];
  avoid_topics?: string[];
  competitors?: string[];
  reply_style?: string;
  daily_move_limit?: number;
  safety_mode?: string;
  operator_notes?: string;
};

export type ExposureRadarPeopleNotePayload = {
  region?: ExposureRadarRegion | "all";
  author_handle: string;
  author_name?: string;
  stage?: string;
  tags?: string[];
  notes?: string;
  last_signal_id?: string;
};

export type ExposureRadarPeopleNoteApi = {
  id?: number;
  region: string;
  author_handle: string;
  author_name?: string;
  stage?: string;
  tags: string[];
  notes?: string;
  last_signal_id?: string;
  last_interaction_at?: string;
  updated_at?: string;
};

export type ExposureRadarWeeklyReviewData = {
  region: string;
  days: number;
  generated_at: string;
  total_records: number;
  handled_count: number;
  published_count: number;
  effective_count: number;
  negative_count: number;
  completion_rate: number;
  effective_rate: number;
  average_result_score: number;
  top_topics: Array<{ topic_name: string; count: number; effective: number }>;
  top_people: Array<{ handle: string; name?: string; count: number }>;
  recommendations: string[];
};

export type ExposureRadarSafetyCenterData = {
  region: string;
  days: number;
  generated_at: string;
  total_records: number;
  pass_count: number;
  watch_count: number;
  block_count: number;
  promotion_smell_count: number;
  risky_claim_count: number;
  warnings: string[];
};

export type ExposureRadarPerformanceData = {
  region: ExposureRadarRegion | "all" | string;
  bot_id?: number;
  x_account_id?: number;
  range_days: number;
  generated_at: string;
  owned_signal_count: number;
  draft_count: number;
  pending_review_count: number;
  approved_count: number;
  rejected_count: number;
  published_count: number;
  handled_count: number;
  positive_count: number;
  approval_rate: number;
  completion_rate: number;
  owned_collector_share: number;
  learning_controls?: ExposureRadarLearningControlsApi;
  regions: ExposureRadarPerformanceRegionApi[];
  top_topics: ExposureRadarPerformanceTopicApi[];
};

export type ExposureRadarBriefData = {
  region: ExposureRadarRegion | string;
  hour_key: string;
  generated_at: string;
  source_type?: string;
  source_status?: string;
  data_quality: string;
  summary: string;
  learning_controls?: ExposureRadarLearningControlsApi;
  items: ExposureRadarBriefItemApi[];
};

export type ExposureRadarArchiveData = {
  region: ExposureRadarRegion | "all" | string;
  bot_id?: number;
  x_account_id?: number;
  range_days: number;
  generated_at: string;
  days: ExposureRadarArchiveDayApi[];
};

export type ExposureRadarArchiveDayApi = {
  date_key: string;
  region: string;
  signal_count: number;
  draft_count: number;
  pending_count: number;
  positive_count: number;
  rejected_count: number;
  saved_memory_count: number;
  top_topics: ExposureRadarPerformanceTopicApi[];
};

export type ExposureRadarBriefItemApi = {
  rank: number;
  signal_id: string;
  region: string;
  data_source?: string;
  data_quality?: string;
  topic_name?: string;
  title: string;
  summary: string;
  content?: string;
  author_handle?: string;
  author_name?: string;
  why_it_matters: string;
  suggested_action: string;
  best_use: string;
  score: number;
  velocity_state?: string;
  quality_stage?: string;
  quality_reason?: string;
  risk_level: string;
  source_url?: string;
  guardrails?: string[];
  review_task_id?: number;
  review_status?: string;
  review_queue_url?: string;
  generated_comment?: string;
  saved_memory_id?: number;
};

export type ExposureRadarPerformanceRegionApi = {
  region: string;
  owned_signal_count: number;
  draft_count: number;
  pending_review_count: number;
  approved_count: number;
  rejected_count: number;
  published_count: number;
  handled_count: number;
  latest_collected_at?: string;
  latest_drafted_at?: string;
  source_health_status: string;
};

export type ExposureRadarPerformanceTopicApi = {
  topic_name: string;
  region: string;
  signal_count: number;
  draft_count: number;
  success_count: number;
};

export const exposureRadarService = {
  async list(params: { region: ExposureRadarRegion; botId?: number; xAccountId?: number; hours?: number; maxFans?: number; minHotCount?: number; limit?: number }) {
    const res = await request.get<ApiResponse<ExposureRadarData>>("/trends/exposure-radar", {
      params: {
        region: params.region,
        bot_id: params.botId || undefined,
        x_account_id: params.xAccountId || undefined,
        hours: params.hours || 4,
        max_fans: params.maxFans || 10000,
        min_hot_count: params.minHotCount || undefined,
        limit: params.limit || 50,
      },
    });
    return res.data.data;
  },
  async createCommentDraft(payload: ExposureRadarDraftPayload) {
    const res = await request.post<ApiResponse<ExposureRadarDraftApi>>("/exposure-radar/drafts", payload);
    return res.data.data;
  },
  async updateDraft(id: number, generatedComment: string) {
    const res = await request.patch<ApiResponse<ExposureRadarDraftApi>>(`/exposure-radar/drafts/${id}`, {
      generated_comment: generatedComment,
    });
    return res.data.data;
  },
  async rewriteDraft(id: number, payload: { rewrite_mode: string; feedback?: string; disabled_learning_issues?: string[] }) {
    const res = await request.post<ApiResponse<ExposureRadarDraftApi>>(`/exposure-radar/drafts/${id}/rewrite`, payload);
    return res.data.data;
  },
  async approveDraft(id: number) {
    const res = await request.post<ApiResponse<ExposureRadarDraftApi>>(`/exposure-radar/drafts/${id}/approve`);
    return res.data.data;
  },
  async rejectDraft(id: number, reason: string) {
    const res = await request.post<ApiResponse<ExposureRadarDraftApi>>(`/exposure-radar/drafts/${id}/reject`, { reason });
    return res.data.data;
  },
  async markDraftHandled(id: number, payload: ExposureRadarManualHandlePayload = {}) {
    const res = await request.post<ApiResponse<ExposureRadarDraftApi>>(`/exposure-radar/drafts/${id}/handled`, payload);
    return res.data.data;
  },
  async createDraftFeedback(id: number, payload: ExposureRadarDraftFeedbackPayload) {
    const res = await request.post<ApiResponse<unknown>>(`/exposure-radar/drafts/${id}/feedback`, payload);
    return res.data.data;
  },
  async upsertManualRecord(payload: ExposureRadarManualRecordPayload) {
    const res = await request.post<ApiResponse<ExposureRadarManualRecordApi>>("/exposure-radar/manual-records", payload);
    return res.data.data;
  },
  async listManualRecords(signalIds: string[]) {
    const res = await request.get<ApiResponse<{ items: ExposureRadarManualRecordApi[] }>>("/exposure-radar/manual-records", {
      params: { signal_ids: signalIds.join(",") },
    });
    return res.data.data;
  },
  async resolveManualResult(payload: { published_url?: string; comment_tweet_id?: string }) {
    const res = await request.post<ApiResponse<ExposureRadarResultLookupApi>>("/exposure-radar/manual-records/resolve-result", payload);
    return res.data.data;
  },
  async refreshManualResults(payload: { region?: ExposureRadarRegion | "all"; days?: number; limit?: number }) {
    const res = await request.post<ApiResponse<ExposureRadarResultRefreshApi>>("/exposure-radar/manual-records/refresh-results", payload);
    return res.data.data;
  },
  async recentManualRecords(params: { region?: ExposureRadarRegion | "all"; days?: number; limit?: number }) {
    const res = await request.get<ApiResponse<{ items: ExposureRadarManualRecordApi[] }>>("/exposure-radar/manual-records/recent", {
      params: {
        region: params.region || "all",
        days: params.days || 7,
        limit: params.limit || 100,
      },
    });
    return res.data.data;
  },
  async growthStrategy(params: { region: ExposureRadarRegion; botId?: number; xAccountId?: number }) {
    const res = await request.get<ApiResponse<ExposureRadarGrowthStrategyApi>>("/exposure-radar/strategy", {
      params: {
        region: params.region,
        bot_id: params.botId || undefined,
        x_account_id: params.xAccountId || undefined,
      },
    });
    return res.data.data;
  },
  async saveGrowthStrategy(payload: ExposureRadarGrowthStrategyPayload) {
    const res = await request.put<ApiResponse<ExposureRadarGrowthStrategyApi>>("/exposure-radar/strategy", payload);
    return res.data.data;
  },
  async weeklyReview(params: { region?: ExposureRadarRegion | "all"; days?: number }) {
    const res = await request.get<ApiResponse<ExposureRadarWeeklyReviewData>>("/exposure-radar/weekly-review", {
      params: {
        region: params.region || "all",
        days: params.days || 7,
      },
    });
    return res.data.data;
  },
  async safetyCenter(params: { region?: ExposureRadarRegion | "all"; days?: number }) {
    const res = await request.get<ApiResponse<ExposureRadarSafetyCenterData>>("/exposure-radar/safety-center", {
      params: {
        region: params.region || "all",
        days: params.days || 7,
      },
    });
    return res.data.data;
  },
  async people(params: { region?: ExposureRadarRegion | "all"; days?: number; limit?: number }) {
    const res = await request.get<ApiResponse<{ items: ExposureRadarPeopleItemApi[] }>>("/exposure-radar/people", {
      params: {
        region: params.region || "all",
        days: params.days || 30,
        limit: params.limit || 20,
      },
    });
    return res.data.data;
  },
  async savePeopleNote(payload: ExposureRadarPeopleNotePayload) {
    const handle = payload.author_handle.replace(/^@/, "");
    const res = await request.put<ApiResponse<ExposureRadarPeopleNoteApi>>(`/exposure-radar/people/${encodeURIComponent(handle)}/note`, payload);
    return res.data.data;
  },
  async performance(params: { region?: ExposureRadarRegion | "all"; botId?: number; xAccountId?: number; days?: number }) {
    const res = await request.get<ApiResponse<ExposureRadarPerformanceData>>("/trends/exposure-radar/performance", {
      params: {
        region: params.region || "all",
        bot_id: params.botId || undefined,
        x_account_id: params.xAccountId || undefined,
        days: params.days || 7,
      },
    });
    return res.data.data;
  },
  async brief(params: { region: ExposureRadarRegion; botId?: number; xAccountId?: number; hours?: number; limit?: number }) {
    const res = await request.get<ApiResponse<ExposureRadarBriefData>>("/trends/exposure-radar/brief", {
      params: {
        region: params.region,
        bot_id: params.botId || undefined,
        x_account_id: params.xAccountId || undefined,
        hours: params.hours || 1,
        limit: params.limit || 10,
      },
    });
    return res.data.data;
  },
  async archive(params: { region?: ExposureRadarRegion | "all"; botId?: number; xAccountId?: number; days?: number }) {
    const res = await request.get<ApiResponse<ExposureRadarArchiveData>>("/trends/exposure-radar/archive", {
      params: {
        region: params.region || "all",
        bot_id: params.botId || undefined,
        x_account_id: params.xAccountId || undefined,
        days: params.days || 7,
      },
    });
    return res.data.data;
  },
};
