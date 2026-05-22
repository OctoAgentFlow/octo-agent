export type CurrentSubscription = {
  plan: string;
  planName: string;
  billingCycle: BillingCycle;
  expirationDate: string;
  remainingTrialDays: number;
  statusKey: string;
  limits: PlanLimits;
  usage: PlanUsage;
};

export type BillingCycle = "monthly" | "yearly";

export type PlanLimits = {
  maxBots: number;
  maxTwitterAccounts: number;
  aiGenerationsMonthly: number;
  dailyAutoPosts: number;
  dailyAutoReplies: number;
  dailyAutoComments: number;
  dailyAutoDMs: number;
  analyticsDays: number;
  teamSeats: number;
  fullPersonaFields: boolean;
  autoDMImport: boolean;
  advancedBotStrategy: boolean;
  bulkReview: boolean;
  botPerformance: boolean;
  dataExport: boolean;
  multiBotMatrix: boolean;
  abTesting: boolean;
  advancedFlowBuilder: boolean;
  advancedRiskRules: boolean;
  prioritySupport: boolean;
};

export type PlanUsage = {
  oafBots: number;
  twitterAccounts: number;
  aiGenerationsMonth: number;
  autoPostsToday: number;
  autoRepliesToday: number;
  autoCommentsToday: number;
  autoDMsToday: number;
};

export type PlanFeature = {
  key: string;
  label: string;
  available: boolean;
  minPlan?: string;
};

export type Plan = {
  code: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  currency: string;
  audience: string;
  badge?: string;
  description: string;
  features: string[];
  featureFlags: PlanFeature[];
  limits: PlanLimits;
  highlight: boolean;
};

export type PaymentMethodOption = {
  methodKey: string;
  networkKey: string;
  /** API value e.g. BEP20 — used when creating orders */
  networkCode: string;
  receiverAddress: string;
  tokenAddress: string;
  receiverMasked: string;
  tokenMasked: string;
  chainId: number;
  note: string;
  isDefault: boolean;
};

export type PaymentStatus = "paid" | "pending" | "failed" | "expired";
export type BillingReconciliationStatus = "unchecked" | "matched" | "mismatch" | "needs_review";
export type BillingReviewStatus = "unreviewed" | "review_needed" | "reviewed";
export type BillingOrderScope = "own" | "all";

export type BillingOpsSummary = {
  total: number;
  pending: number;
  paid: number;
  failed: number;
  expired: number;
  unchecked: number;
  matched: number;
  mismatch: number;
  needs_review: number;
  review_needed: number;
  reviewed: number;
};

export type BillingOrderFilterState = {
  status: PaymentStatus | "all";
  reviewStatus: BillingReviewStatus | "all";
  scope: BillingOrderScope;
};

export type BillingOpsAction = "mark_reviewed" | "mark_review_needed";

export type PaymentRecord = {
  id: string;
  userId: number;
  date: string;
  planKey: string;
  amount: string;
  originalAmount: string;
  creditAmount: string;
  payableAmount: string;
  orderType: string;
  currency: string;
  methodKey: string;
  network: string;
  status: PaymentStatus;
  txHash: string;
  failureReason: string;
  lastCheckedAt: string;
  canRetry: boolean;
  nextAction: string;
  reconciliationStatus: BillingReconciliationStatus;
  reviewStatus: BillingReviewStatus;
  reviewedAt: string;
  opsNote: string;
  lastAuditAction: string;
  lastAuditAt: string;
  lastAuditOperatorId: number;
};
