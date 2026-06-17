import type { ReactNode } from "react";

import type { ContentDraftApi, ContentDraftPlanApi } from "@/services/content-draft.service";
import type { ExposureRadarItemApi } from "@/services/exposure-radar.service";

export type LoadState = "loading" | "ready" | "error";
export type MaybePromise<T> = T | Promise<T>;
export type RankChange = { kind: "new" | "up" | "down"; delta?: number };
export type RadarViewFilter = "priority" | "all" | "act_now" | "watch" | "expired" | "hot" | "rising" | "sampling" | "topic" | "tweet" | "high_score" | "needs_review" | "saved" | "drafted" | "pending_handling" | "handled" | "backfilled";
export type ManualOutcome = "effective" | "neutral" | "ineffective" | "not_suitable";
export type LeaderboardStatus = "new" | "burst" | "rising" | "steady" | "cooling" | "unknown";
export type LeaderboardStats = Record<LeaderboardStatus, number> & { newCount: number; movers: number };
export type WorkbenchStats = { pending: number; actNow: number; handled: number };
export type DailyDeskFocusKey = "setup" | "strategy" | "handle" | "backfill" | "review";
export type SignalQualityStatus = "ready" | "warming" | "empty" | "limited";
export type DailyActionType = "publish_reply" | "generate_reply" | "save_memory" | "inspect" | "review_fit";
export type DailyActionReason = "generated" | "quality" | "expired" | "velocity" | "low_fans" | "learned" | "risk" | "topic" | "score";
export type DailyActionPlanItem = {
  item: ExposureRadarItemApi;
  action: DailyActionType;
  reason: DailyActionReason;
  priority: number;
};
export type ExposureLearningProfile = {
  boostedTopics: Set<string>;
  cautiousTopics: Set<string>;
  preferredAngles: Set<string>;
};
export type ContentDraftBridgeData = {
  plans: ContentDraftPlanApi[];
  drafts: ContentDraftApi[];
};
export type LearningImpactRow = {
  label: string;
  detail: string;
  tone: "positive" | "negative" | "neutral";
};
export type DailyTaskStatus = "todo" | "in_progress" | "done" | "skipped" | "later";
export type SessionFocusKey = "relationships" | "research" | "traffic" | "memory";
export type FirstDayStepKey = "analysis" | "strategy" | "desk" | "reply" | "result";
export type FirstDayActivationMode = "setup" | "strategy" | "signals" | "handle" | "result" | "complete";
export type FirstDayActivationAction = { key: string; href?: string; icon: ReactNode; onClick?: () => void; disabled?: boolean; primary?: boolean };
export type ExposureRadarWorkspaceTab = "today" | "signals" | "people" | "strategy" | "diagnostics";
export type PeopleRadarStage = "priority" | "repeat" | "engaged" | "watch" | "avoid" | "new";
export type PeopleRadarEntry = {
  key: string;
  name: string;
  handle?: string;
  count: number;
  handled: number;
  drafted: number;
  saved: number;
  maxScore: number;
  totalEngagement: number;
  followers?: number;
  stage: PeopleRadarStage;
  latestItem: ExposureRadarItemApi;
  persisted?: boolean;
  feedback?: number;
  crmStage?: string;
  notes?: string;
  tags?: string[];
  lastInteractionAt?: string;
};
export type OpportunityExplanation = {
  fit: string;
  reasons: string[];
  angles: string[];
  avoid: string[];
};
export type SignalDecisionSummary = {
  mode: "act_now" | "watch" | "research" | "skip";
  title: string;
  detail: string;
  proof: string[];
};
export type SignalCredibilityStatus = "strong" | "usable" | "thin" | "weak";
export type SignalCredibility = {
  status: SignalCredibilityStatus;
  score: number;
  proof: string[];
  missing: string[];
  nextStep: string;
};
export type AccountFitLabel = "strong" | "good" | "weak" | "avoid";
export type AccountFitSummary = {
  label: AccountFitLabel;
  score: number;
  title: string;
  detail: string;
  keywords: string[];
  guardrails: string[];
};
export type MemoryReplyCue = {
  key: string;
  title: string;
  detail: string;
  tone: "blue" | "green" | "amber" | "neutral";
};
export type ResultLearningMove = {
  key: string;
  title: string;
  detail: string;
  tone: "positive" | "warning" | "neutral";
  actionLabel?: string;
  metric?: string;
};
export type ResultLearningSummary = ResultLearningMove;
export type AccountHealthStatus = "healthy" | "watch" | "risk";
export type AccountHealthScore = {
  score: number;
  status: AccountHealthStatus;
  checks: Array<{ key: string; pass: boolean; value: string }>;
};
export type GrowthExperiment = {
  key: string;
  title: string;
  hypothesis: string;
  action: string;
  metric: string;
  tone: "blue" | "green" | "amber";
};
export type ReplyQualityScore = {
  score: number;
  status: "ready" | "needs_edit" | "research";
  checks: Array<{ key: string; pass: boolean }>;
};
export type ReplyAngleID = "operatorObservation" | "lightQuestion" | "peerExperience" | "cautionNote" | "topicResearch";
export type ReplyAngleSuggestion = {
  id: ReplyAngleID;
  title: string;
  description: string;
  prompt: string;
  tone: string;
};
export type ReplyPlan = {
  bestFor: string;
  steps: string[];
  safety: string[];
  readyNote: string;
};
export type SafetyReviewStatus = "pass" | "watch" | "block";
export type SafetyReviewCheck = {
  key: string;
  status: SafetyReviewStatus;
  title: string;
  detail: string;
};
export type SafetyReview = {
  status: SafetyReviewStatus;
  summary: string;
  checks: SafetyReviewCheck[];
};
export type ReplyAngleGenerationGuide = { label: string; tone: string; instruction: string };
export type ManualActionState = {
  copied?: boolean;
  opened?: boolean;
  saved?: boolean;
  handled?: boolean;
  persisted?: boolean;
  publishedUrl?: string;
  outcome?: ManualOutcome;
  feedbackComment?: string;
  feedbackAt?: string;
  taskStatus?: DailyTaskStatus;
  safetyStatus?: SafetyReviewStatus;
  safetySummary?: string;
  replyAngleID?: string;
  replyAngleTitle?: string;
  resultImpressionCount?: number;
  resultLikeCount?: number;
  resultReplyCount?: number;
  resultRetweetCount?: number;
  resultQuoteCount?: number;
  resultBookmarkCount?: number;
  resultNotes?: string;
  resultScore?: number;
  resultCheckedAt?: string;
  updatedAt?: string;
};
export type OperatorSessionNote = {
  text: string;
  updatedAt: string;
};
export type PublishGateKey = "context" | "persona" | "nonPromo" | "claim";
export type PublishGateState = Partial<Record<PublishGateKey, boolean>> & { updatedAt?: string };

export type StrategyFormState = {
  targetAudience: string;
  primaryGoal: string;
  coreTopics: string;
  avoidTopics: string;
  competitors: string;
  replyStyle: string;
  dailyMoveLimit: number;
  safetyMode: string;
  operatorNotes: string;
};
export type StarterStrategyTemplate = {
  key: string;
  form: StrategyFormState;
};
