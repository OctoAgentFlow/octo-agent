export type AutomationModuleType = "post" | "reply" | "dm";
export type AutomationTone = "Professional" | "Friendly" | "Degen" | "Web3-native";
export type AutomationRunState = "Running" | "Queued" | "Paused" | "Needs Review";

export type AutomationSafetyLimits = {
  requireApproval: boolean;
  maxPerHour: number;
  blockedKeywords: string[];
};

export type AutomationFrequency = {
  intervalMinutes: number;
  dailyLimit: number;
};

export type AutomationModuleConfig = {
  enabled: boolean;
  frequency: AutomationFrequency;
  tone: AutomationTone;
  safety: AutomationSafetyLimits;
};

export type AutomationReplyUsage = {
  todayCount: number;
  dailyLimit: number;
  remainingToday: number;
  lastExecutedAt?: string;
};

export type AutomationModule = {
  type: AutomationModuleType;
  nameKey: string;
  descriptionKey: string;
  state: AutomationRunState;
  config: AutomationModuleConfig;
  lastRunKey: string;
  lastRunParams?: Record<string, string | number>;
  nextRunKey: string;
  nextRunParams?: Record<string, string | number>;
  executedToday: number;
  /** Present for Auto Reply when API returns usage stats */
  replyUsage?: AutomationReplyUsage;
  /** Relative time label for last reply execution (reply module only) */
  replyLastRelativeKey?: string;
  replyLastRelativeParams?: Record<string, string | number>;
};

export type AutomationRuntimeStatus = {
  queueDepth: number;
  lastSuccessKey: string;
  lastSuccessParams?: Record<string, string | number>;
  retriesLast24h: number;
  needsReview: number;
};

