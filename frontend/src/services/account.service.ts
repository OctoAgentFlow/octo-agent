import { request } from "@/lib/request";
import type { OAFBotPayload } from "@/types/oaf-bot";

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

export type AccountIntelligencePostApi = {
  id: string;
  text: string;
  url?: string;
  created_at?: string;
  like_count: number;
  reply_count: number;
  retweet_count: number;
  quote_count: number;
  bookmark_count: number;
  impression_count: number;
  engagements: number;
  engagement_rate: number;
  score: number;
  topics?: string[];
};

export type AccountIntelligenceApi = {
  account: AccountListItem;
  generated_at: string;
  source_status: "ready" | "limited" | "empty" | "needs_reauth" | string;
  limit_reason?: string;
  metrics: {
    post_count: number;
    posts_with_impressions: number;
    total_impressions: number;
    total_engagements: number;
    average_impressions: number;
    average_engagement_rate: number;
    best_post_id?: string;
    best_post_url?: string;
    best_post_text?: string;
    best_post_score?: number;
  };
  positioning: {
    confidence: number;
    primary_language: string;
    positioning_summary: string;
    audience_guess: string;
    voice_tone: string;
    maturity_stage: string;
    detected_topics: string[];
    content_pillars: string[];
    strengths: string[];
    risks: string[];
  };
  bot_suggestion: OAFBotPayload;
  radar_guidance: {
    fit_keywords: string[];
    avoid_keywords: string[];
    preferred_regions: string[];
    opportunity_fit_rules: string[];
    recommended_actions: string[];
  };
  weekly_review: {
    headline: string;
    wins: string[];
    risks: string[];
    next_actions: string[];
  };
  recent_posts: AccountIntelligencePostApi[];
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
  async intelligence(id: number) {
    const res = await request.get<ApiResponse<AccountIntelligenceApi>>(`/accounts/${id}/intelligence`);
    return res.data.data;
  },
};
