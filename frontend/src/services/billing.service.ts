import { request } from "@/lib/request";

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

export type BillingSubscriptionApi = {
  plan: string;
  status: string;
  expiration_date: string;
  trial_days_left: number;
  billing_hint: string;
};

export type BillingPlanApi = {
  code: string;
  name: string;
  price: string;
  period: string;
  description: string;
  features: string[];
  highlight: boolean;
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
  method: string;
  network: string;
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
};

export type BillingOrderDetailApi = {
  order_id: string;
  amount: string;
  currency: string;
  network: string;
  token_address: string;
  receiver_address: string;
  chain_id: number;
  expired_at: string;
  status: string;
  tx_hash?: string;
  paid_at?: string;
};

export type BillingOrderListItemApi = {
  order_id: string;
  plan_code: string;
  amount: string;
  currency: string;
  method: string;
  network: string;
  status: string;
  tx_hash?: string;
  created_at: string;
  expired_at: string;
  paid_at?: string;
};

type BillingPlansData = {
  items: BillingPlanApi[];
};

type BillingPaymentMethodsData = {
  items: BillingPaymentMethodApi[];
};

type BillingOrdersData = {
  items: BillingOrderListItemApi[];
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
  async createOrder(body: BillingCreateOrderRequest) {
    const res = await request.post<ApiResponse<BillingCreateOrderResponse>>("/billing/orders", body);
    return res.data.data;
  },
  async getOrder(orderId: string) {
    const res = await request.get<ApiResponse<BillingOrderDetailApi>>(`/billing/orders/${orderId}`);
    return res.data.data;
  },
  async orders() {
    const res = await request.get<ApiResponse<BillingOrdersData>>("/billing/orders");
    return res.data.data;
  },
};
