import type { ActivityRecord } from "@/types/activity";

export const activityRecordsMock: ActivityRecord[] = [
  {
    id: "evt_1",
    type: "post",
    status: "success",
    previewKey: "activity.preview.evt_1",
    accountHandle: "@octoagent_ai",
    executedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
  },
  {
    id: "evt_2",
    type: "reply",
    status: "review",
    previewKey: "activity.preview.evt_2",
    accountHandle: "@growth_ops",
    executedAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
  },
  {
    id: "evt_3",
    type: "dm",
    status: "failed",
    previewKey: "activity.preview.evt_3",
    accountHandle: "@octoagent_ai",
    executedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "evt_4",
    type: "reply",
    status: "success",
    previewKey: "activity.preview.evt_4",
    accountHandle: "@octoagent_ai",
    executedAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "evt_5",
    type: "post",
    status: "success",
    previewKey: "activity.preview.evt_5",
    accountHandle: "@growth_ops",
    executedAt: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
  },
];

