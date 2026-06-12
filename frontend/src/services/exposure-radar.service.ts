import { request } from "@/lib/request";
import type { AutoCommentTaskApi } from "@/services/automation.service";

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
  opportunity_tier?: "hot_opportunity" | "early_signal" | string;
  tier_reason?: string;
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
  items: ExposureRadarItemApi[];
  source_notice: string;
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
    const res = await request.post<ApiResponse<AutoCommentTaskApi>>("/auto-comments/exposure-radar-drafts", payload);
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
