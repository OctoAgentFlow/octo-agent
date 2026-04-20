export type ActivityType = "post" | "reply" | "dm";
export type ActivityStatus = "success" | "review" | "failed";
export type ActivityRange = "24h" | "7d" | "30d";

export type ActivityRecord = {
  id: string;
  type: ActivityType;
  status: ActivityStatus;
  previewKey: string;
  accountHandle: string;
  executedAt: string; // ISO string for easy future API swap
  /** Server-side failure detail when present */
  errorMessage?: string;
  /** Reply automation: comment tweet id */
  replyCommentTweetId?: string;
  replyToUsername?: string;
  replyToTextPreview?: string;
  replyTextPreview?: string;
};

