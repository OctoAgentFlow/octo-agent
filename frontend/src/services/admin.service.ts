import { request } from "@/lib/request";
import type {
  BillingOrderDetailApi,
  BillingOrderListItemApi,
  BillingOrderOpsActionRequest,
  BillingOrderQueryApi,
  BillingOrdersData,
  BillingOpsSummaryApi,
} from "@/services/billing.service";

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

export type AdminOperatorApi = {
  id: number;
  email: string;
  name: string;
  role: string;
};

export type AdminUserSummaryApi = {
  total: number;
  active: number;
  suspended: number;
  owners: number;
  admins: number;
  active_subscriptions: number;
  expired_subscriptions: number;
};

export type AdminActivitySummaryApi = {
  last_24h: number;
  success: number;
  failed: number;
  review: number;
};

export type AdminContentSummaryApi = {
  connected_accounts: number;
  posts: number;
  scheduled_posts: number;
  published_posts: number;
  failed_posts: number;
  enabled_automations: number;
  paused_automations: number;
};

export type AdminConfigSummaryApi = {
  email_provider: string;
  resend_configured: boolean;
  x_oauth_configured: boolean;
  billing_method_count: number;
  frontend_base_url: string;
};

export type AdminUserListItemApi = {
  id: number;
  email: string;
  name: string;
  status: string;
  role: string;
  subscription_plan_code: string;
  subscription_status: string;
  subscription_expires_at?: string;
  created_at: string;
  updated_at: string;
};

export type AdminActivityListItemApi = {
  id: number;
  user_id: number;
  x_account_id?: number;
  type: string;
  status: string;
  preview_key: string;
  account_handle: string;
  executed_at: string;
  error_message?: string;
};

export type AdminOverviewApi = {
  operator: AdminOperatorApi;
  users: AdminUserSummaryApi;
  billing: BillingOpsSummaryApi;
  activity: AdminActivitySummaryApi;
  content: AdminContentSummaryApi;
  config: AdminConfigSummaryApi;
  recent_users: AdminUserListItemApi[];
  recent_orders: BillingOrderListItemApi[];
  recent_events: AdminActivityListItemApi[];
};

export type AdminUserQueryApi = {
  page?: number;
  page_size?: number;
  query?: string;
  role?: string;
  status?: string;
};

export type AdminUsersApi = {
  items: AdminUserListItemApi[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
  };
};

export type AdminPointActivityApi = {
  id: number;
  code: string;
  title: string;
  description: string;
  points: number;
  claim_period: string;
  enabled: boolean;
  starts_at?: string;
  ends_at?: string;
  sort_order: number;
  updated_at: string;
};

export type AdminPointUserApi = {
  user_id: number;
  email: string;
  name: string;
  balance: number;
  frozen: number;
  lifetime_earned: number;
  lifetime_spent: number;
  updated_at: string;
};

export type AdminPointUsersApi = {
  items: AdminPointUserApi[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
  };
};

export const adminService = {
  async overview() {
    const res = await request.get<ApiResponse<AdminOverviewApi>>("/admin/overview");
    return res.data.data;
  },
  async users(params?: AdminUserQueryApi) {
    const res = await request.get<ApiResponse<AdminUsersApi>>("/admin/users", { params });
    return res.data.data;
  },
  async updateUser(userId: number, body: { role?: string; status?: string }) {
    const res = await request.patch<ApiResponse<AdminUserListItemApi>>(`/admin/users/${userId}`, body);
    return res.data.data;
  },
  async billingOrders(params?: BillingOrderQueryApi) {
    const res = await request.get<ApiResponse<BillingOrdersData>>("/admin/billing/orders", { params });
    return res.data.data;
  },
  async updateBillingOrder(orderId: string, body: BillingOrderOpsActionRequest) {
    const res = await request.post<ApiResponse<BillingOrderDetailApi>>(`/admin/billing/orders/${orderId}/ops-action`, body);
    return res.data.data;
  },
  async pointActivities() {
    const res = await request.get<ApiResponse<AdminPointActivityApi[]>>("/admin/points/activities");
    return res.data.data;
  },
  async updatePointActivity(activityId: number, body: Partial<Pick<AdminPointActivityApi, "title" | "description" | "points" | "claim_period" | "enabled" | "sort_order">>) {
    const res = await request.patch<ApiResponse<AdminPointActivityApi>>(`/admin/points/activities/${activityId}`, body);
    return res.data.data;
  },
  async pointUsers(params?: { page?: number; page_size?: number; query?: string }) {
    const res = await request.get<ApiResponse<AdminPointUsersApi>>("/admin/points/users", { params });
    return res.data.data;
  },
  async adjustUserPoints(userId: number, body: { points: number; reason: string }) {
    const res = await request.post<ApiResponse<AdminPointUserApi>>(`/admin/points/users/${userId}/adjust`, body);
    return res.data.data;
  },
};
