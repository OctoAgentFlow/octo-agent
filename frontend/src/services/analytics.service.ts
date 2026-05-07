import { request } from "@/lib/request";

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

export type AnalyticsAutomationType = "post" | "reply" | "dm";

export type AnalyticsOverview = {
  range_days: number;
  generated_at: string;
  activity_summary: {
    total: number;
    success: number;
    failed: number;
    review: number;
    total_7d: number;
    success_7d: number;
    failed_7d: number;
    review_7d: number;
    success_rate_pct: number;
    last_activity_at?: string;
  };
  post_summary: {
    total: number;
    draft: number;
    scheduled: number;
    processing: number;
    published: number;
    failed: number;
  };
  automation_breakdown: Array<{
    type: AnalyticsAutomationType;
    total: number;
    success: number;
    failed: number;
    review: number;
  }>;
  daily_activity: Array<{
    date: string;
    total: number;
    success: number;
    failed: number;
    review: number;
  }>;
  failure_reasons: Array<{
    reason: string;
    count: number;
    last_at?: string;
  }>;
  attention_items: Array<{
    id: number;
    type: AnalyticsAutomationType;
    status: "failed" | "review";
    account_handle: string;
    preview_key: string;
    executed_at: string;
    error_message?: string;
  }>;
};

export type AnalyticsRange = "7d" | "30d";

export type AnalyticsOverviewParams = {
  range?: AnalyticsRange;
  accountId?: number;
};

export const analyticsService = {
  async overview(params: AnalyticsOverviewParams = {}) {
    const res = await request.get<ApiResponse<AnalyticsOverview>>("/analytics/overview", {
      params: {
        range: params.range ?? "7d",
        account_id: params.accountId,
      },
    });
    return res.data.data;
  },
};
