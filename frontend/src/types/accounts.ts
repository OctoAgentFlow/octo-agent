import type { TranslateParams } from "@/i18n/types";

export type AccountStatus = "connected" | "needs_reauth" | "disconnected";
export type XSubscriptionTier = "unknown" | "free" | "premium" | "premium_plus";

export type ConnectedXAccount = {
  id: string;
  avatarUrl: string;
  username: string;
  displayName: string;
  status: AccountStatus;
  lastSyncedKey?: string;
  lastSyncedParams?: TranslateParams;
  followers?: string;
  xSubscriptionTier: XSubscriptionTier;
  xSubscriptionSource: "manual" | "x_api";
  publishReady?: boolean;
  publishReauthRequired?: boolean;
  publishIssue?: string;
  missingScopes?: string[];
  oauthScopes?: string[];
};
