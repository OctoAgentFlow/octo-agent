export type ActivityType = "post" | "reply" | "dm" | "comment" | "system";
export type ActivitySourceModule = Exclude<ActivityType, "system">;
export type ActivityStatus = "success" | "review" | "failed";
export type ActivityRange = "24h" | "7d" | "30d";
export type ActivityEventScope = "all" | "execution" | "system";

export type ActivityRecord = {
  id: string;
  xAccountId?: number;
  type: ActivityType;
  status: ActivityStatus;
  previewKey: string;
  accountHandle: string;
  sourceModule?: ActivitySourceModule;
  executedAt: string; // ISO string for easy future API swap
  /** Server-side failure detail when present */
  errorMessage?: string;
  /** Reply automation: comment tweet id */
  replyCommentTweetId?: string;
  replyToUsername?: string;
  replyToTextPreview?: string;
  replyTextPreview?: string;
};
