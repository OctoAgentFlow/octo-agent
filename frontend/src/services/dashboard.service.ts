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

export type DashboardWorkbenchItem = {
  id: string;
  type: "post" | "comment" | "reply" | "dm" | string;
  source_id: number;
  title: string;
  description: string;
  status?: string;
  href: string;
  tone: "blue" | "green" | "amber" | "rose" | string;
  score?: number;
};

export type DashboardWorkbench = {
  opportunities: DashboardWorkbenchItem[];
  reviews: DashboardWorkbenchItem[];
  stats: {
    pending_review: number;
    ready_to_publish: number;
    approved: number;
    rejected: number;
    failed: number;
  };
};

export const dashboardService = {
  async overview() {
    const res = await request.get<ApiResponse<DashboardOverview>>("/dashboard/overview");
    return res.data.data;
  },
  async workbench() {
    const res = await request.get<ApiResponse<DashboardWorkbench>>("/dashboard/workbench");
    return res.data.data;
  },
};
