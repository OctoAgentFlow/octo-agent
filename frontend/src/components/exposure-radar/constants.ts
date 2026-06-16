import type { ExposureRadarWorkspaceTab, ManualOutcome, RadarViewFilter, ReplyAngleGenerationGuide, ReplyAngleID } from "@/components/exposure-radar/types";

export const hourOptions = [1, 2, 4, 8];
export const fanOptions = [5000, 10000, 20000, 50000, 100000];
export const hotCountOptions = [0, 2, 3, 5, 10];
export const exposureRadarWorkspaceTabs: ExposureRadarWorkspaceTab[] = ["today", "signals", "people", "strategy", "diagnostics"];
export const radarViewFilters: RadarViewFilter[] = ["priority", "all", "act_now", "watch", "expired", "hot", "rising", "sampling", "topic", "tweet", "high_score", "needs_review", "saved", "drafted", "pending_handling", "handled", "backfilled"];
export const manualOutcomeOptions: ManualOutcome[] = ["effective", "neutral", "ineffective", "not_suitable"];
export const manualOutcomeFeedbackMeta: Record<ManualOutcome, { rating: "positive" | "negative"; issueTags: string[] }> = {
  effective: { rating: "positive", issueTags: ["effective", "good"] },
  neutral: { rating: "negative", issueTags: ["neutral"] },
  ineffective: { rating: "negative", issueTags: ["ineffective", "irrelevant"] },
  not_suitable: { rating: "negative", issueTags: ["not_suitable", "irrelevant"] },
};
export const replyAngleGenerationGuides: Record<ReplyAngleID, ReplyAngleGenerationGuide> = {
  operatorObservation: {
    label: "Operator observation",
    tone: "concrete viewpoint",
    instruction: "Anchor on one specific detail from the post, then add one short, verifiable operator or builder observation. Do not turn it into a product pitch.",
  },
  lightQuestion: {
    label: "Light question",
    tone: "low-pressure question",
    instruction: "Ask one natural question about a detail in the post. Keep it light, not interrogative, and do not steer the thread into the product.",
  },
  peerExperience: {
    label: "Peer experience",
    tone: "peer-to-peer experience",
    instruction: "Respond to the author's point first, then add one short experience or caution that fits their context. Talk less about yourself.",
  },
  cautionNote: {
    label: "Caution note",
    tone: "careful boundary",
    instruction: "Add one conservative reminder, condition, or boundary. Avoid exaggerated claims, sensitive judgments, and unverified facts.",
  },
  topicResearch: {
    label: "Find a specific post first",
    tone: "research first",
    instruction: "This is a topic-level lead. Do not conclude from the topic alone; find a specific post first, then write a short contextual reply.",
  },
};
