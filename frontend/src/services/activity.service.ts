import { request } from "@/lib/request";

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

export type ActivityItemApi = {
  id: number;
  x_account_id?: number;
  type: "post" | "reply" | "dm" | "comment" | "system";
  status: "success" | "review" | "failed";
  preview_key: string;
  preview_display_key?: string;
  account_handle: string;
  source_module?: "post" | "reply" | "dm" | "comment";
  executed_at: string;
  error_message?: string;
  failure_category?: "x_auth" | "rate_limit" | "safety" | "configuration" | "network" | "system" | "unknown";
  reply_comment_tweet_id?: string;
  reply_to_username?: string;
  reply_to_text_preview?: string;
  reply_text_preview?: string;
  review_queue_bulk?: ReviewQueueBulkActivityApi;
};

export type ReviewQueueBulkActivityApi = {
  action?: "approve" | "reject" | "retry" | string;
  total?: number;
  succeeded?: number;
  failed?: number;
};

export type ActivityListData = {
  items: ActivityItemApi[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
  };
};

export type ActivityListQuery = {
  page?: number;
  page_size?: number;
  type?: "post" | "reply" | "dm" | "comment" | "system";
  event_scope?: "all" | "execution" | "system";
  status?: "success" | "review" | "failed";
  range?: "24h" | "7d" | "30d";
  account_id?: number;
  error_reason?: string;
  failure_category?: "x_auth" | "rate_limit" | "safety" | "configuration" | "network" | "system" | "unknown";
};

export const activityService = {
  async list(query: ActivityListQuery) {
    const res = await request.get<ApiResponse<ActivityListData>>("/activities", { params: query });
    return res.data.data;
  },
};
