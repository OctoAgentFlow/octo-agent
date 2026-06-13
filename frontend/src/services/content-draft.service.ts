export * from "@/services/auto-post.service";
export { autoPostService as contentDraftService } from "@/services/auto-post.service";

export type {
  AutoPostDraftApi as ContentDraftApi,
  AutoPostDraftsData as ContentDraftsData,
  AutoPostExecutionMode as ContentDraftHandlingMode,
  AutoPostGenerationRunApi as ContentDraftGenerationRunApi,
  AutoPostGenerationRunsData as ContentDraftGenerationRunsData,
  AutoPostLengthMode as ContentDraftLengthMode,
  AutoPostPlanApi as ContentDraftPlanApi,
  AutoPostPlansData as ContentDraftPlansData,
  AutoPostRewriteMode as ContentDraftRewriteMode,
  ExposureSourceTraceApi,
  TrendSelectionData,
  TrendTopicListData,
  TrendFeedbackPayload,
  TrendFeedbackApi,
  TrendFeedbackListData,
  TrendFeedbackRating,
  TrendTopicApi,
} from "@/services/auto-post.service";
