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

export type AdminExecutionSummaryApi = {
  publish_pending: number;
  publish_processing: number;
  publish_failed: number;
  published_this_month: number;
  auto_post_enabled_plans: number;
  auto_post_due_now: number;
  auto_post_skipped_24h: number;
  auto_post_failed_24h: number;
  needs_reauth_accounts: number;
  monthly_ai_generations: number;
  monthly_x_publishes: number;
  monthly_cost_cents: number;
  monthly_cost_amount: string;
  prompt_guard: AdminPromptGuardSummaryApi;
};

export type AdminPromptGuardSceneApi = {
  scene: string;
  total: number;
  language_mismatches: number;
  retry_count: number;
};

export type AdminPromptGuardSummaryApi = {
  window_days: number;
  total_ai_calls: number;
  guarded_ai_calls: number;
  system_language_violations: number;
  language_mismatches: number;
  retry_count: number;
  by_scene: AdminPromptGuardSceneApi[];
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
  execution: AdminExecutionSummaryApi;
  config: AdminConfigSummaryApi;
  recent_users: AdminUserListItemApi[];
  recent_orders: BillingOrderListItemApi[];
  recent_events: AdminActivityListItemApi[];
};

export type AdminTrendFeedbackTopicApi = {
  trend_name: string;
  normalized_name: string;
  category: string;
  irrelevant: number;
  too_forced: number;
  total_negative: number;
  suggested_action: "move_to_review_pool" | "lower_general_weight" | "check_classification_keywords" | "monitor" | "no_action" | string;
  suggested_reason: string;
  active_rules?: string[];
  last_feedback_at: string;
};

export type AdminTrendOperationRuleApi = {
  id: number;
  trend_name: string;
  normalized_name: string;
  category: string;
  rule_type: string;
  reason: string;
  source: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type AdminTrendFeedbackSummaryApi = {
  days: number;
  total_negative: number;
  irrelevant: number;
  too_forced: number;
  unique_trends: number;
  top_negative: AdminTrendFeedbackTopicApi[];
  top_irrelevant: AdminTrendFeedbackTopicApi[];
  top_too_forced: AdminTrendFeedbackTopicApi[];
};

export type AdminTrendOperationRulesApi = {
  items: AdminTrendOperationRuleApi[];
};

export type AdminTrendSyncResultApi = {
  enabled: boolean;
  synced_regions: number;
  synced_topics: number;
  skipped_reason?: string;
  attempted_at?: string;
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

export type AdminPointRiskConfigApi = {
  enabled: boolean;
  daily_earn_limit: number;
  monthly_discount_limit: number;
  large_adjustment_alert_threshold: number;
  point_expiry_days: number;
  updated_at: string;
};

export type AdminPointRedemptionCodeApi = {
  id: number;
  code: string;
  title: string;
  points: number;
  max_uses: number;
  used_count: number;
  per_user_uses: number;
  enabled: boolean;
  starts_at?: string;
  ends_at?: string;
  updated_at: string;
};

export type AdminReferralSummaryApi = {
  invite_codes: number;
  referral_signups: number;
  first_purchase_rewards: number;
  signup_reward_points: number;
  purchase_reward_points: number;
};

export type AdminGrossMarginCostApi = {
  key: string;
  amount: string;
  cents: number;
  share_bps: number;
  quantity?: number;
  unit_label?: string;
};

export type AdminGrossMarginRevenueApi = {
  plan_code: string;
  orders: number;
  amount: string;
  cents: number;
};

export type AdminGrossMarginSummaryApi = {
  period_start: string;
  period_end: string;
  revenue_amount: string;
  revenue_cents: number;
  total_cost: string;
  total_cost_cents: number;
  gross_profit: string;
  gross_profit_cents: number;
  gross_margin_bps: number;
  target_bps: number;
  status: string;
  costs: AdminGrossMarginCostApi[];
  revenue_by_plan: AdminGrossMarginRevenueApi[];
};

export type AdminGrossMarginAlertConfigApi = {
  enabled: boolean;
  target_margin_bps: number;
  openai_cost_share_threshold_bps: number;
  x_cost_share_threshold_bps: number;
  point_cost_share_threshold_bps: number;
  check_interval_hours: number;
  updated_at: string;
};

export type AdminGrossMarginAlertEventApi = {
  id: number;
  period_start: string;
  period_end: string;
  level: string;
  status: string;
  reasons: string[];
  revenue_amount: string;
  total_cost: string;
  gross_profit: string;
  gross_margin_bps: number;
  target_margin_bps: number;
  openai_cost: string;
  x_cost: string;
  point_discount_cost: string;
  lark_status: string;
  lark_error?: string;
  config_snapshot?: string;
  acknowledged_by?: number;
  acknowledged_at?: string;
  acknowledge_note?: string;
  created_at: string;
};

export type AdminGrossMarginAlertEventListApi = {
  items: AdminGrossMarginAlertEventApi[];
};

export type AdminGrossMarginAlertEventQueryApi = {
  status?: string;
  reason?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
};

export type AdminPointCostSourceApi = {
  source: string;
  points: number;
  usdt_amount: string;
};

export type AdminPointCostSummaryApi = {
  period_start: string;
  period_end: string;
  points_per_usdt: number;
  earned_points: number;
  earned_usdt: string;
  discounted_points: number;
  discounted_usdt: string;
  expired_points: number;
  expired_usdt: string;
  outstanding_points: number;
  outstanding_usdt: string;
  monthly_earned_by_source: AdminPointCostSourceApi[];
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
  async grossMarginSummary() {
    const res = await request.get<ApiResponse<AdminGrossMarginSummaryApi>>("/admin/billing/gross-margin");
    return res.data.data;
  },
  async grossMarginAlertConfig() {
    const res = await request.get<ApiResponse<AdminGrossMarginAlertConfigApi>>("/admin/billing/gross-margin/alert-config");
    return res.data.data;
  },
  async updateGrossMarginAlertConfig(body: Partial<AdminGrossMarginAlertConfigApi>) {
    const res = await request.patch<ApiResponse<AdminGrossMarginAlertConfigApi>>("/admin/billing/gross-margin/alert-config", body);
    return res.data.data;
  },
  async grossMarginAlertEvents(params?: AdminGrossMarginAlertEventQueryApi) {
    const res = await request.get<ApiResponse<AdminGrossMarginAlertEventListApi>>("/admin/billing/gross-margin/alerts", { params });
    return res.data.data;
  },
  async acknowledgeGrossMarginAlert(id: number, body: { note: string }) {
    const res = await request.post<ApiResponse<AdminGrossMarginAlertEventApi>>(`/admin/billing/gross-margin/alerts/${id}/acknowledge`, body);
    return res.data.data;
  },
  async updateBillingOrder(orderId: string, body: BillingOrderOpsActionRequest) {
    const res = await request.post<ApiResponse<BillingOrderDetailApi>>(`/admin/billing/orders/${orderId}/ops-action`, body);
    return res.data.data;
  },
  async trendFeedbackSummary(params?: { days?: number; limit?: number }) {
    const res = await request.get<ApiResponse<AdminTrendFeedbackSummaryApi>>("/admin/trends/feedback-summary", { params });
    return res.data.data;
  },
  async applyTrendRule(body: { trend_name: string; normalized_name: string; category?: string; action: string; reason?: string }) {
    const res = await request.post<ApiResponse<AdminTrendOperationRuleApi>>("/admin/trends/rules/apply", body);
    return res.data.data;
  },
  async trendRules() {
    const res = await request.get<ApiResponse<AdminTrendOperationRulesApi>>("/admin/trends/rules");
    return res.data.data;
  },
  async updateTrendRule(id: number, body: { enabled: boolean }) {
    const res = await request.patch<ApiResponse<AdminTrendOperationRuleApi>>(`/admin/trends/rules/${id}`, body);
    return res.data.data;
  },
  async syncTrendsNow() {
    const res = await request.post<ApiResponse<AdminTrendSyncResultApi>>("/admin/trends/sync-now");
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
  async pointRiskConfig() {
    const res = await request.get<ApiResponse<AdminPointRiskConfigApi>>("/admin/points/risk-config");
    return res.data.data;
  },
  async updatePointRiskConfig(body: Partial<AdminPointRiskConfigApi>) {
    const res = await request.patch<ApiResponse<AdminPointRiskConfigApi>>("/admin/points/risk-config", body);
    return res.data.data;
  },
  async pointRedemptionCodes() {
    const res = await request.get<ApiResponse<AdminPointRedemptionCodeApi[]>>("/admin/points/redemption-codes");
    return res.data.data;
  },
  async createPointRedemptionCode(body: { code: string; title: string; points: number; max_uses: number; per_user_uses?: number; enabled?: boolean }) {
    const res = await request.post<ApiResponse<AdminPointRedemptionCodeApi>>("/admin/points/redemption-codes", body);
    return res.data.data;
  },
  async referralSummary() {
    const res = await request.get<ApiResponse<AdminReferralSummaryApi>>("/admin/points/referral-summary");
    return res.data.data;
  },
  async pointCostSummary() {
    const res = await request.get<ApiResponse<AdminPointCostSummaryApi>>("/admin/points/cost-summary");
    return res.data.data;
  },
};
