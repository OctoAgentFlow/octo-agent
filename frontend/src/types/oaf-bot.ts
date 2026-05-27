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
  project_one_liner: string;
  target_audience: string;
  core_value_props: string;
  product_features: string;
  differentiators: string;
  content_pillars: string[];
  content_objectives: string;
  preferred_cta: string;
  hashtags: string[];
  keywords: string[];
  compliance_notes: string;
  avoid_claims: string[];
  safety_mode: string;
  primary_language: string;
  language_strategy: string;
  created_at: string;
  updated_at: string;
};

export type OAFBotPayload = Omit<OAFBot, "id" | "created_at" | "updated_at">;

export type OAFBotListData = {
  items: OAFBot[];
  usage: PlanUsage;
  limits: PlanLimits;
};

export type OAFBotSampleScene = "tweet" | "reply" | "comment" | "dm";
export type OAFBotSampleContext = Partial<Record<OAFBotSampleScene, string>>;
export type OAFBotProfileAssistMode = "fill_missing_only" | "improve_all";

export type OAFBotSamples = {
  tweet: string;
  reply: string;
  comment: string;
  dm: string;
};

export type OAFBotSafetyHit = {
  source: "forbidden_topic" | "avoid_claim" | "platform_policy" | "conservative_review" | string;
  term: string;
};

export type OAFBotSafetyEvaluation = {
  level: "low" | "medium" | "high" | string;
  action: "allow" | "review" | "avoid" | string;
  category: string;
  reason: string;
  matched_hits: OAFBotSafetyHit[];
};

export type OAFBotTestGenerateResult = Partial<OAFBotSamples> & {
  scene: OAFBotSampleScene;
  content: string;
  provider: string;
  usage_consumed: number;
  raw_result?: string;
  safety_evaluation?: OAFBotSafetyEvaluation;
};

export type OAFBotCompleteProfileResult = {
  profile: OAFBotPayload;
  provider: string;
  usage_consumed: number;
  raw_result?: string;
};

export type OAFBotFeedbackProfileSuggestionResult = {
  profile: OAFBotPayload;
  provider: string;
  usage_consumed: number;
  feedback_count: number;
  raw_result?: string;
};

export type OAFBotGenerationUsage = {
  bot_id: number;
  scene: string;
  month: string;
  count: number;
  updated_at: string;
};

export type OAFBotGenerationFeedbackRating = "positive" | "negative";

export type OAFBotGenerationFeedbackPayload = {
  scene: OAFBotSampleScene;
  rating: OAFBotGenerationFeedbackRating;
  issue_tags: string[];
  comment: string;
  sample_context: string;
  generated_content: string;
  provider: string;
};

export type OAFBotGenerationFeedback = OAFBotGenerationFeedbackPayload & {
  id: number;
  bot_id: number;
  created_at: string;
};

export type OAFBotMatrixSignal = {
  bot_id: number;
  usages: OAFBotGenerationUsage[];
  feedback: OAFBotGenerationFeedback[];
};
