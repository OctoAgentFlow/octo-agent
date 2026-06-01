import type { ActivityRecord } from "@/types/activity";

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Human-readable line for dashboard / activity list (prefers structured reply data when present). */
export function activityNarrativeLine(record: ActivityRecord, t: Translate): string {
  if (record.previewKey === "activity.preview.reviewQueueBulkAction") {
    return t("activity.reviewQueueBulk.story", {
      action: t(`executionQueue.bulk.action.${record.reviewQueueBulk?.action || "approve"}`),
      total: record.reviewQueueBulk?.total || 0,
      succeeded: record.reviewQueueBulk?.succeeded || 0,
      failed: record.reviewQueueBulk?.failed || 0,
    });
  }
  if (
    record.type === "reply" &&
    (record.replyToUsername || record.replyToTextPreview || record.replyTextPreview)
  ) {
    return t("activity.reply.story", {
      account: record.accountHandle,
      them: record.replyToUsername || "@…",
      incoming: record.replyToTextPreview || "…",
      outgoing: record.replyTextPreview || "…",
    });
  }
  if (record.type === "post") {
    return t("activity.post.story", { account: record.accountHandle });
  }
  return t(record.previewKey);
}
