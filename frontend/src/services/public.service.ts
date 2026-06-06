import { request } from "@/lib/request";

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

export type SiteLinksApi = {
  official_x_url: string;
  telegram_url: string;
};

export type OAFBotLaunchPlanRequest = {
  stage: "start_from_zero" | "existing_account" | "multi_account";
  account_type: "brand" | "founder_operator" | "kol_creator" | "community" | "agency";
  x_handle?: string;
  project_summary: string;
  target_audience?: string;
  desired_followers?: string;
  industry?: string;
  source_material?: string;
  voice_preference?: string;
  guardrails?: string;
  website_url?: string;
  output_language?: "zh-CN" | "en";
};

export type OAFBotLaunchPlanDay = {
  day: number;
  theme: string;
  action: string;
  outcome: string;
};

export type OAFBotLaunchPlanDraft = {
  label: string;
  content: string;
  why: string;
};

export type OAFBotLaunchPlanOutput = {
  account_positioning: string;
  recommended_bot_type: string;
  recommended_occupation: string;
  recommended_industries: string[];
  content_themes: string[];
  safety_guardrails: string[];
  seven_day_plan: OAFBotLaunchPlanDay[];
  first_posts: OAFBotLaunchPlanDraft[];
  comment_examples: OAFBotLaunchPlanDraft[];
  bio_suggestion: string;
  operating_cadence: string;
  create_oaf_bot_cta: string;
};

export type OAFBotLaunchPlanResponse = {
  token: string;
  create_oaf_bot_url: string;
  plan: OAFBotLaunchPlanOutput;
  created_at: string;
};

export const publicService = {
  async siteLinks() {
    const res = await request.get<ApiResponse<SiteLinksApi>>("/public/site-links");
    return res.data.data;
  },
  async generateOAFBotLaunchPlan(payload: OAFBotLaunchPlanRequest) {
    const res = await request.post<ApiResponse<OAFBotLaunchPlanResponse>>("/public/oaf-bot-launch-plans/generate", payload);
    return res.data.data;
  },
};
