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
  publish_ready?: boolean;
  publish_reauth_required?: boolean;
  publish_issue?: "needs_reauth" | "missing_access_token" | "missing_tweet_write" | string;
  missing_scopes?: string[];
};

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
};
