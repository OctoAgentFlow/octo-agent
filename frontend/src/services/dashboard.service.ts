import { request } from "@/lib/request";

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

export type DashboardOverview = {
  plan: string;
  trial_days_left: number;
  /** active | expired — same semantics as billing subscription */
  subscription_status: string;
  subscription_expires_at?: string;
  wallet_bound: boolean;
  connected_x_count: number;
  activity_count_24h: number;
  activity_count_prev_24h: number;
  activity_success_rate_pct: number;
  last_activity_at?: string;
};

export const dashboardService = {
  async overview() {
    const res = await request.get<ApiResponse<DashboardOverview>>("/dashboard/overview");
    return res.data.data;
  },
};
