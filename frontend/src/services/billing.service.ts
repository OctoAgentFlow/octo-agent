import { request } from "@/lib/request";

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

export type BillingSubscriptionApi = {
  plan: string;
  billing_cycle: "monthly" | "yearly";
  status: string;
  expiration_date: string;
  trial_days_left: number;
  billing_hint: string;
  limits: PlanLimitsApi;
  usage: PlanUsageApi;
};

export type BillingPlanApi = {
  code: string;
  name: string;
  price: string;
  period: string;
  monthly_price: number;
  yearly_price: number;
  currency: string;
  audience: string;
  badge?: string;
  description: string;
  features: string[];
  feature_flags: PlanFeatureApi[];
  limits: PlanLimitsApi;
  highlight: boolean;
};

export type PlanLimitsApi = {
  max_bots: number;
  max_twitter_accounts: number;
  ai_generations_monthly: number;
  monthly_x_writes: number;
  monthly_x_url_posts: number;
  monthly_cost_cap_cents: number;
  monthly_content_drafts?: number;
  monthly_reply_drafts?: number;
  monthly_opportunity_drafts?: number;
  monthly_review_capacity?: number;
  content_memory_sources?: number;
  monthly_radar_refreshes?: number;
  daily_content_drafts?: number;
  daily_reply_drafts?: number;
  daily_opportunity_drafts?: number;
  daily_review_capacity?: number;
  monthly_auto_posts: number;
  monthly_auto_replies: number;
  monthly_auto_comments: number;
  monthly_auto_dms: number;
  auto_comment_targets: number;
  monthly_auto_comment_scans: number;
  daily_auto_posts: number;
  daily_auto_replies: number;
  daily_auto_comments: number;
  daily_auto_dms: number;
  analytics_days: number;
  team_seats: number;
  full_persona_fields: boolean;
  auto_dm_import: boolean;
  advanced_bot_strategy: boolean;
  bulk_review: boolean;
  bot_performance: boolean;
  data_export: boolean;
  multi_bot_matrix: boolean;
  ab_testing: boolean;
  advanced_flow_builder: boolean;
  advanced_risk_rules: boolean;
  priority_support: boolean;
};

export type PlanFeatureApi = {
  key: string;
  label: string;
  available: boolean;
  min_plan?: string;
};

export type PlanUsageApi = {
  oaf_bots: number;
  twitter_accounts: number;
  ai_generations_month: number;
  content_drafts_month?: number;
  reply_drafts_month?: number;
  opportunity_drafts_month?: number;
  review_capacity_month?: number;
  auto_posts_month: number;
  auto_replies_month: number;
  auto_comments_month: number;
  auto_dms_month: number;
  content_drafts_today?: number;
  reply_drafts_today?: number;
  opportunity_drafts_today?: number;
  review_capacity_today?: number;
  auto_posts_today: number;
  auto_replies_today: number;
  auto_comments_today: number;
  auto_dms_today: number;
};

export type BillingPaymentMethodApi = {
  method: string;
  network: string;
  token_address: string;
  receiver_address: string;
  decimals: number;
  chain_id: number;
  is_default: boolean;
  note: string;
};

export type BillingCreateOrderRequest = {
  plan_code: string;
  billing_cycle?: "monthly" | "yearly";
  method: string;
  network: string;
  points_to_use?: number;
  idempotency_key?: string;
};

export type BillingQuoteRequest = {
  plan_code: string;
  billing_cycle?: "monthly" | "yearly";
  points_to_use?: number;
};

export type BillingUpgradeQuoteApi = {
  current_plan: string;
  current_billing_cycle: "monthly" | "yearly";
  target_plan: string;
  target_billing_cycle: "monthly" | "yearly";
  original_amount: string;
  credit_amount: string;
  point_discount_amount: string;
  points_used: number;
  max_points_usable: number;
  point_balance: number;
  payable_amount: string;
  currency: string;
  order_type: "new" | "renew" | "upgrade";
  is_upgrade: boolean;
  current_expires_at?: string;
  quote_expires_at?: string;
};

export type BillingCreateOrderResponse = {
  order_id: string;
  amount: string;
  currency: string;
  network: string;
  token_address: string;
  receiver_address: string;
  expired_at: string;
  status: string;
  quote?: BillingUpgradeQuoteApi;
};

export type BillingOrderDetailApi = {
  order_id: string;
  user_id: number;
  amount: string;
  original_amount?: string;
  credit_amount?: string;
  point_discount_amount?: string;
  points_used?: number;
  payable_amount?: string;
  order_type?: string;
  idempotency_key?: string;
  currency: string;
  network: string;
  token_address: string;
  receiver_address: string;
  chain_id: number;
  expired_at: string;
  status: string;
  tx_hash?: string;
  paid_at?: string;
  failure_reason?: string;
  last_checked_at?: string;
  auto_scan_status?: string;
  auto_scan_skip_reason?: string;
  auto_scanned_at?: string;
  can_retry: boolean;
  next_action: string;
  reconciliation_status: string;
  review_status: string;
  reviewed_at?: string;
  ops_note?: string;
  audit_trail?: BillingOrderAuditApi[];
};

export type BillingOrderListItemApi = {
  order_id: string;
  user_id: number;
  plan_code: string;
  billing_cycle: "monthly" | "yearly";
  amount: string;
  original_amount?: string;
  credit_amount?: string;
  point_discount_amount?: string;
  points_used?: number;
  payable_amount?: string;
  order_type?: string;
  idempotency_key?: string;
  currency: string;
  method: string;
  network: string;
  status: string;
  tx_hash?: string;
  created_at: string;
  expired_at: string;
  paid_at?: string;
  failure_reason?: string;
  last_checked_at?: string;
  auto_scan_status?: string;
  auto_scan_skip_reason?: string;
  auto_scanned_at?: string;
  can_retry: boolean;
  next_action: string;
  reconciliation_status: string;
  review_status: string;
  reviewed_at?: string;
  ops_note?: string;
  last_audit_action?: string;
  last_audit_at?: string;
  last_audit_operator_id?: number;
};

export type BillingOrderQueryApi = {
  status?: string;
  reconciliation_status?: string;
  review_status?: string;
  auto_scan_status?: string;
  auto_scan_skip_reason?: string;
  limit?: number;
  scope?: string;
};

export type BillingOrderAuditApi = {
  id: string;
  order_id: string;
  user_id: number;
  operator_user_id: number;
  action: string;
  previous_order_status?: string;
  new_order_status?: string;
  previous_reconciliation_status?: string;
  new_reconciliation_status?: string;
  previous_review_status?: string;
  new_review_status?: string;
  previous_ops_note?: string;
  new_ops_note?: string;
  created_at: string;
};

export type BillingOpsSummaryApi = {
  total: number;
  pending: number;
  paid: number;
  failed: number;
  expired: number;
  unchecked: number;
  matched: number;
  mismatch: number;
  needs_review: number;
  review_needed: number;
  reviewed: number;
};

export type BillingOrderOpsActionRequest = {
  action: string;
  ops_note?: string;
};

type BillingPlansData = {
  items: BillingPlanApi[];
};

type BillingPaymentMethodsData = {
  items: BillingPaymentMethodApi[];
};

export type BillingOrdersData = {
  items: BillingOrderListItemApi[];
  total: number;
  ops_summary: BillingOpsSummaryApi;
  scope: string;
  can_operate_billing: boolean;
};

type BillingOrderAuditsData = {
  items: BillingOrderAuditApi[];
};

export const billingService = {
  async subscription() {
    const res = await request.get<ApiResponse<BillingSubscriptionApi>>("/billing/subscription");
    return res.data.data;
  },
  async plans() {
    const res = await request.get<ApiResponse<BillingPlansData>>("/billing/plans");
    return res.data.data;
  },
  async paymentMethods() {
    const res = await request.get<ApiResponse<BillingPaymentMethodsData>>("/billing/payment-methods");
    return res.data.data;
  },
  async quote(body: BillingQuoteRequest) {
    const res = await request.post<ApiResponse<BillingUpgradeQuoteApi>>("/billing/quote", body);
    return res.data.data;
  },
  async createOrder(body: BillingCreateOrderRequest) {
    const res = await request.post<ApiResponse<BillingCreateOrderResponse>>("/billing/orders", body);
    return res.data.data;
  },
  async getOrder(orderId: string) {
    const res = await request.get<ApiResponse<BillingOrderDetailApi>>(`/billing/orders/${orderId}`);
    return res.data.data;
  },
  async confirmOrder(orderId: string, txHash: string) {
    const res = await request.post<ApiResponse<BillingOrderDetailApi>>(`/billing/orders/${orderId}/confirm`, {
      tx_hash: txHash,
    });
    return res.data.data;
  },
  async orders(params?: BillingOrderQueryApi) {
    const res = await request.get<ApiResponse<BillingOrdersData>>("/billing/orders", { params });
    return res.data.data;
  },
  async orderOpsAction(orderId: string, body: BillingOrderOpsActionRequest) {
    const res = await request.post<ApiResponse<BillingOrderDetailApi>>(`/billing/orders/${orderId}/ops-action`, body);
    return res.data.data;
  },
  async orderAudits(orderId: string) {
    const res = await request.get<ApiResponse<BillingOrderAuditsData>>(`/billing/orders/${orderId}/audits`);
    return res.data.data;
  },
};
