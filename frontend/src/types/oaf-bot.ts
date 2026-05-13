import type { PlanLimits, PlanUsage } from "@/types/billing";

export type OAFBot = {
  id: number;
  name: string;
  twitter_account_id: number;
  occupation: string;
  industry: string;
  age_range: string;
  gender: string;
  education: string;
  mbti: string;
  personality_tags: string[];
  identity_summary: string;
  voice_tone: string;
  topics: string[];
  forbidden_topics: string[];
  growth_goal: string;
  safety_mode: string;
  created_at: string;
  updated_at: string;
};

export type OAFBotPayload = Omit<OAFBot, "id" | "created_at" | "updated_at">;

export type OAFBotListData = {
  items: OAFBot[];
  usage: PlanUsage;
  limits: PlanLimits;
};

export type OAFBotSamples = {
  tweet: string;
  reply: string;
  dm: string;
};
