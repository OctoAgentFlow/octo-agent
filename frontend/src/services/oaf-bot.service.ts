import { request } from "@/lib/request";
import type {
  OAFBot,
  OAFBotCompleteProfileResult,
  OAFBotFeedbackProfileSuggestionResult,
  OAFBotFeedbackSummary,
  OAFBotGenerationFeedback,
  OAFBotGenerationFeedbackPayload,
  OAFBotGenerationUsage,
  OAFBotLearningRulePreference,
  OAFBotListData,
  OAFBotMatrixInspectionSummary,
  OAFBotMatrixSignal,
  OAFBotPayload,
  OAFBotProfileAssistMode,
  OAFBotSafetyHit,
  OAFBotSampleScene,
  OAFBotTestGenerateResult,
} from "@/types/oaf-bot";
import type { ReviewQueueFeedbackIssueVerdictStatApi } from "@/services/review-queue.service";

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
  limits: {
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
};

type OAFBotGenerationUsagesApi = {
  items: OAFBotGenerationUsage[];
};

type OAFBotGenerationFeedbackApi = {
  items: OAFBotGenerationFeedback[];
};

type OAFBotMatrixSignalsApi = {
  items: OAFBotMatrixSignal[];
  summary?: OAFBotMatrixInspectionSummary;
};

type OAFBotFeedbackSummaryApi = OAFBotFeedbackSummary;
type OAFBotLearningRulePreferencesApi = {
  items: OAFBotLearningRulePreference[];
};
type OAFBotDashboardSummaryApi = {
  bots: OAFBot[];
  usage: OAFBotListApi["usage"];
  limits: OAFBotListApi["limits"];
  inspection_summary: OAFBotMatrixInspectionSummary;
  feedback_summary: OAFBotFeedbackSummary;
  verdict_stats: ReviewQueueFeedbackIssueVerdictStatApi[];
  learning_rule_preferences: OAFBotLearningRulePreference[];
};

function mapList(data: OAFBotListApi): OAFBotListData {
  const contentDraftsMonth = data.usage.content_drafts_month ?? data.usage.auto_posts_month;
  const replyDraftsMonth = data.usage.reply_drafts_month ?? data.usage.auto_replies_month;
  const opportunityDraftsMonth = data.usage.opportunity_drafts_month ?? data.usage.auto_comments_month;
  const reviewCapacityMonth = data.usage.review_capacity_month ?? data.usage.auto_dms_month;
  const contentDraftsToday = data.usage.content_drafts_today ?? data.usage.auto_posts_today;
  const replyDraftsToday = data.usage.reply_drafts_today ?? data.usage.auto_replies_today;
  const opportunityDraftsToday = data.usage.opportunity_drafts_today ?? data.usage.auto_comments_today;
  const reviewCapacityToday = data.usage.review_capacity_today ?? data.usage.auto_dms_today;
  const monthlyContentDrafts = data.limits.monthly_content_drafts ?? data.limits.monthly_auto_posts;
  const monthlyReplyDrafts = data.limits.monthly_reply_drafts ?? data.limits.monthly_auto_replies;
  const monthlyOpportunityDrafts = data.limits.monthly_opportunity_drafts ?? data.limits.monthly_auto_comments;
  const monthlyReviewCapacity = data.limits.monthly_review_capacity ?? data.limits.monthly_auto_dms;
  const contentMemorySources = data.limits.content_memory_sources ?? data.limits.auto_comment_targets;
  const monthlyRadarRefreshes = data.limits.monthly_radar_refreshes ?? data.limits.monthly_auto_comment_scans;
  const dailyContentDrafts = data.limits.daily_content_drafts ?? data.limits.daily_auto_posts;
  const dailyReplyDrafts = data.limits.daily_reply_drafts ?? data.limits.daily_auto_replies;
  const dailyOpportunityDrafts = data.limits.daily_opportunity_drafts ?? data.limits.daily_auto_comments;
  const dailyReviewCapacity = data.limits.daily_review_capacity ?? data.limits.daily_auto_dms;

  return {
    items: data.items,
    usage: {
      oafBots: data.usage.oaf_bots,
      twitterAccounts: data.usage.twitter_accounts,
      aiGenerationsMonth: data.usage.ai_generations_month,
      contentDraftsMonth,
      replyDraftsMonth,
      opportunityDraftsMonth,
      reviewCapacityMonth,
      autoPostsMonth: contentDraftsMonth,
      autoRepliesMonth: replyDraftsMonth,
      autoCommentsMonth: opportunityDraftsMonth,
      autoDMsMonth: reviewCapacityMonth,
      contentDraftsToday,
      replyDraftsToday,
      opportunityDraftsToday,
      reviewCapacityToday,
      autoPostsToday: contentDraftsToday,
      autoRepliesToday: replyDraftsToday,
      autoCommentsToday: opportunityDraftsToday,
      autoDMsToday: reviewCapacityToday,
    },
    limits: {
      maxBots: data.limits.max_bots,
      maxTwitterAccounts: data.limits.max_twitter_accounts,
      aiGenerationsMonthly: data.limits.ai_generations_monthly,
      monthlyXWrites: data.limits.monthly_x_writes,
      monthlyXUrlPosts: data.limits.monthly_x_url_posts,
      monthlyCostCapCents: data.limits.monthly_cost_cap_cents,
      monthlyContentDrafts,
      monthlyReplyDrafts,
      monthlyOpportunityDrafts,
      monthlyReviewCapacity,
      contentMemorySources,
      monthlyRadarRefreshes,
      dailyContentDrafts,
      dailyReplyDrafts,
      dailyOpportunityDrafts,
      dailyReviewCapacity,
      monthlyAutoPosts: monthlyContentDrafts,
      monthlyAutoReplies: monthlyReplyDrafts,
      monthlyAutoComments: monthlyOpportunityDrafts,
      monthlyAutoDMs: monthlyReviewCapacity,
      autoCommentTargets: contentMemorySources,
      monthlyAutoCommentScans: monthlyRadarRefreshes,
      dailyAutoPosts: dailyContentDrafts,
      dailyAutoReplies: dailyReplyDrafts,
      dailyAutoComments: dailyOpportunityDrafts,
      dailyAutoDMs: dailyReviewCapacity,
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
  async delete(id: number) {
    const res = await request.delete<ApiResponse<{ deleted: boolean }>>(`/oaf-bots/${id}`);
    return res.data.data;
  },
  async completeProfile(draft: OAFBotPayload, mode: OAFBotProfileAssistMode = "fill_missing_only") {
    const res = await request.post<ApiResponse<OAFBotCompleteProfileResult>>("/oaf-bots/complete-profile", { draft, mode });
    return res.data.data;
  },
  async suggestProfileFromFeedback(id: number) {
    const res = await request.post<ApiResponse<OAFBotFeedbackProfileSuggestionResult>>(`/oaf-bots/${id}/feedback-profile-suggestion`, {});
    return res.data.data;
  },
  async testGenerate(id: number, scene: OAFBotSampleScene, sampleContext?: string, disabledLearningIssues?: string[]) {
    const res = await request.post<ApiResponse<OAFBotTestGenerateResult>>(`/oaf-bots/${id}/test-generate`, { scene, sample_context: sampleContext, disabled_learning_issues: disabledLearningIssues || [] });
    return res.data.data;
  },
  async rewriteSafety(id: number, body: { scene: OAFBotSampleScene; content: string; sample_context?: string; rewrite_mode?: string; matched_hits?: OAFBotSafetyHit[]; disabled_learning_issues?: string[] }) {
    const res = await request.post<ApiResponse<OAFBotTestGenerateResult>>(`/oaf-bots/${id}/rewrite-safety`, body);
    return res.data.data;
  },
  async generationUsages(id: number) {
    const res = await request.get<ApiResponse<OAFBotGenerationUsagesApi>>(`/oaf-bots/${id}/generation-usages`);
    return res.data.data;
  },
  async generationFeedback(id: number) {
    const res = await request.get<ApiResponse<OAFBotGenerationFeedbackApi>>(`/oaf-bots/${id}/generation-feedback`);
    return res.data.data;
  },
  async matrixSignals() {
    const res = await request.get<ApiResponse<OAFBotMatrixSignalsApi>>("/oaf-bots/matrix-signals");
    return res.data.data;
  },
  async feedbackSummary(days = 7) {
    const res = await request.get<ApiResponse<OAFBotFeedbackSummaryApi>>("/oaf-bots/feedback-summary", { params: { days } });
    return res.data.data;
  },
  async dashboardSummary(days = 7) {
    const res = await request.get<ApiResponse<OAFBotDashboardSummaryApi>>("/oaf-bots/dashboard-summary", { params: { days } });
    const data = res.data.data;
    const mapped = mapList({ items: data.bots, usage: data.usage, limits: data.limits });
    return {
      ...data,
      bots: mapped.items,
      usage: mapped.usage,
      limits: mapped.limits,
    };
  },
  async learningRulePreferences(id: number) {
    const res = await request.get<ApiResponse<OAFBotLearningRulePreferencesApi>>(`/oaf-bots/${id}/learning-rule-preferences`);
    return res.data.data;
  },
  async saveLearningRulePreference(id: number, feedbackIssue: string, status: "enabled" | "disabled") {
    const res = await request.post<ApiResponse<OAFBotLearningRulePreference>>(`/oaf-bots/${id}/learning-rule-preferences`, {
      feedback_issue: feedbackIssue,
      status,
    });
    return res.data.data;
  },
  async createGenerationFeedback(id: number, body: OAFBotGenerationFeedbackPayload) {
    const res = await request.post<ApiResponse<OAFBotGenerationFeedback>>(`/oaf-bots/${id}/generation-feedback`, body);
    return res.data.data;
  },
  async deleteGenerationFeedback(id: number, feedbackID: number) {
    const res = await request.delete<ApiResponse<{ deleted: boolean }>>(`/oaf-bots/${id}/generation-feedback/${feedbackID}`);
    return res.data.data;
  },
};
