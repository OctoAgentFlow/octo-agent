import type { ConnectedXAccount } from "@/types/accounts";

export const accountsMock: ConnectedXAccount[] = [
  {
    id: "acc_1",
    avatarUrl: "https://api.dicebear.com/9.x/identicon/svg?seed=octo",
    username: "octoagent_ai",
    displayName: "Octo Agent",
    status: "connected",
    lastSyncedKey: "accounts.lastSync.minutesAgo",
    lastSyncedParams: { minutes: 2 },
    followers: "12.8K",
    xSubscriptionTier: "premium",
    xSubscriptionSource: "x_api",
  },
  {
    id: "acc_2",
    avatarUrl: "https://api.dicebear.com/9.x/identicon/svg?seed=ops",
    username: "growth_ops",
    displayName: "Growth Ops",
    status: "needs_reauth",
    lastSyncedKey: "accounts.lastSync.hoursAgo",
    lastSyncedParams: { hours: 3 },
    followers: "2.1K",
    xSubscriptionTier: "unknown",
    xSubscriptionSource: "manual",
  },
];

export const emptyAccountsMock: ConnectedXAccount[] = [];
