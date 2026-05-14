import { request } from "@/lib/request";

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
  publish_job_id?: number;
  publish_status?: string;
  publish_last_error?: string;
  created_at: string;
  source_status?: string;
  source_id: number;
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
};
