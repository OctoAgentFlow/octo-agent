import { request } from "@/lib/request";

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

export type AccountListItem = {
  id: number;
  avatar_url: string;
  username: string;
  display_name: string;
  status: "connected" | "needs_reauth" | "disconnected";
  last_synced_at?: string;
  followers?: string;
  x_subscription_tier: XSubscriptionTier;
  x_subscription_source: "manual" | "x_api";
  publish_ready?: boolean;
  publish_reauth_required?: boolean;
  publish_issue?: "needs_reauth" | "missing_access_token" | "missing_tweet_write" | string;
  missing_scopes?: string[];
  oauth_scopes?: string[];
};

export type XSubscriptionTier = "unknown" | "free" | "premium" | "premium_plus";

type AccountListData = {
  items: AccountListItem[];
};

type OAuthStartData = {
  auth_url: string;
  state: string;
};

export const accountService = {
  async list() {
    const res = await request.get<ApiResponse<AccountListData>>("/accounts");
    return res.data.data;
  },
  async startXOAuth() {
    const res = await request.post<ApiResponse<OAuthStartData>>("/accounts/oauth/x/start");
    return res.data.data;
  },
  async disconnect(id: number) {
    await request.delete(`/accounts/${id}`);
  },
  async updateSettings(id: number, payload: { x_subscription_tier: XSubscriptionTier }) {
    const res = await request.put<ApiResponse<AccountListItem>>(`/accounts/${id}/settings`, payload);
    return res.data.data;
  },
  async syncXSubscription(id: number) {
    const res = await request.post<ApiResponse<AccountListItem>>(`/accounts/${id}/sync-x-subscription`);
    return res.data.data;
  },
};
