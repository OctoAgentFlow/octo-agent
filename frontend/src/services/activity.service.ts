import { request } from "@/lib/request";

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

export type ActivityItemApi = {
  id: number;
  x_account_id?: number;
  type: "post" | "reply" | "dm";
  status: "success" | "review" | "failed";
  preview_key: string;
  account_handle: string;
  executed_at: string;
  error_message?: string;
  reply_comment_tweet_id?: string;
  reply_to_username?: string;
  reply_to_text_preview?: string;
  reply_text_preview?: string;
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
  type?: "post" | "reply" | "dm";
  status?: "success" | "review" | "failed";
  range?: "24h" | "7d" | "30d";
  account_id?: number;
  error_reason?: string;
};

export const activityService = {
  async list(query: ActivityListQuery) {
    const res = await request.get<ApiResponse<ActivityListData>>("/activities", { params: query });
    return res.data.data;
  },
};
