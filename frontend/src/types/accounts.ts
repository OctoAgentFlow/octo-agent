import type { TranslateParams } from "@/i18n/types";

export type AccountStatus = "connected" | "needs_reauth" | "disconnected";

export type ConnectedXAccount = {
  id: string;
  avatarUrl: string;
  username: string;
  displayName: string;
  status: AccountStatus;
  lastSyncedKey?: string;
  lastSyncedParams?: TranslateParams;
  followers?: string;
  publishReady?: boolean;
  publishReauthRequired?: boolean;
  publishIssue?: string;
  missingScopes?: string[];
};
