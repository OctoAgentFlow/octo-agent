import { request } from "@/lib/request";
import type { OAFBot, OAFBotGenerationUsage, OAFBotListData, OAFBotPayload, OAFBotSamples } from "@/types/oaf-bot";

type ApiResponse<T> = {
  code: number;
  message: string;
  data: T;
};

type OAFBotListApi = {
  items: OAFBot[];
  usage: {
    oaf_bots: number;
    twitter_accounts: number;
    ai_generations_month: number;
    auto_posts_today: number;
    auto_replies_today: number;
    auto_comments_today: number;
    auto_dms_today: number;
  };
  limits: {
    max_bots: number;
    max_twitter_accounts: number;
    ai_generations_monthly: number;
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
};

type OAFBotGenerationUsagesApi = {
  items: OAFBotGenerationUsage[];
};

function mapList(data: OAFBotListApi): OAFBotListData {
  return {
    items: data.items,
    usage: {
      oafBots: data.usage.oaf_bots,
      twitterAccounts: data.usage.twitter_accounts,
      aiGenerationsMonth: data.usage.ai_generations_month,
      autoPostsToday: data.usage.auto_posts_today,
      autoRepliesToday: data.usage.auto_replies_today,
      autoCommentsToday: data.usage.auto_comments_today,
      autoDMsToday: data.usage.auto_dms_today,
    },
    limits: {
      maxBots: data.limits.max_bots,
      maxTwitterAccounts: data.limits.max_twitter_accounts,
      aiGenerationsMonthly: data.limits.ai_generations_monthly,
      dailyAutoPosts: data.limits.daily_auto_posts,
      dailyAutoReplies: data.limits.daily_auto_replies,
      dailyAutoComments: data.limits.daily_auto_comments,
      dailyAutoDMs: data.limits.daily_auto_dms,
      analyticsDays: data.limits.analytics_days,
      teamSeats: data.limits.team_seats,
      fullPersonaFields: data.limits.full_persona_fields,
      autoDMImport: data.limits.auto_dm_import,
      advancedBotStrategy: data.limits.advanced_bot_strategy,
      bulkReview: data.limits.bulk_review,
      botPerformance: data.limits.bot_performance,
      dataExport: data.limits.data_export,
      multiBotMatrix: data.limits.multi_bot_matrix,
      abTesting: data.limits.ab_testing,
      advancedFlowBuilder: data.limits.advanced_flow_builder,
      advancedRiskRules: data.limits.advanced_risk_rules,
      prioritySupport: data.limits.priority_support,
    },
  };
}

export const oafBotService = {
  async list() {
    const res = await request.get<ApiResponse<OAFBotListApi>>("/oaf-bots");
    return mapList(res.data.data);
  },
  async create(body: OAFBotPayload) {
    const res = await request.post<ApiResponse<OAFBot>>("/oaf-bots", body);
    return res.data.data;
  },
  async update(id: number, body: OAFBotPayload) {
    const res = await request.put<ApiResponse<OAFBot>>(`/oaf-bots/${id}`, body);
    return res.data.data;
  },
  async testGenerate(id: number) {
    const res = await request.post<ApiResponse<OAFBotSamples>>(`/oaf-bots/${id}/test-generate`, {});
    return res.data.data;
  },
  async generationUsages(id: number) {
    const res = await request.get<ApiResponse<OAFBotGenerationUsagesApi>>(`/oaf-bots/${id}/generation-usages`);
    return res.data.data;
  },
};
