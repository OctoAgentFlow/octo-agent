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
};

export const analyticsService = {
  async overview() {
    const res = await request.get<ApiResponse<AnalyticsOverview>>("/analytics/overview");
    return res.data.data;
  },
};
