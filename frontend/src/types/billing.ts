import type { TranslateParams } from "@/i18n/types";

export type CurrentSubscription = {
  planKey: string;
  expirationDate: string;
  remainingTrialDays: number;
  statusKey: string;
};

export type Plan = {
  nameKey: string;
  price: string;
  periodKey: string;
  descriptionKey: string;
  featureKeys: string[];
  priceNoteKey?: string;
  priceNoteParams?: TranslateParams;
  highlight: boolean;
};

export type PaymentMethodOption = {
  methodKey: string;
  networkKey: string;
  /** API value e.g. BEP20 — used when creating orders */
  networkCode: string;
  receiverMasked: string;
  tokenMasked: string;
  chainId: number;
  note: string;
  isDefault: boolean;
};

export type PaymentStatus = "paid" | "pending" | "failed" | "expired";
export type BillingReconciliationStatus = "unchecked" | "matched" | "mismatch" | "needs_review";
export type BillingReviewStatus = "unreviewed" | "review_needed" | "reviewed";
export type BillingRefundStatus = "none" | "requested" | "refunded" | "rejected";
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
  refund_none: number;
  refund_requested: number;
  refunded: number;
  refund_rejected: number;
};

export type BillingOrderFilterState = {
  status: PaymentStatus | "all";
  reviewStatus: BillingReviewStatus | "all";
  refundStatus: BillingRefundStatus | "all";
  scope: BillingOrderScope;
};

export type BillingOpsAction = "mark_reviewed" | "mark_review_needed" | "request_refund" | "mark_refunded" | "reject_refund";

export type PaymentRecord = {
  id: string;
  userId: number;
  date: string;
  planKey: string;
  amount: string;
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
  refundStatus: BillingRefundStatus;
  refundReason: string;
  reviewedAt: string;
  refundMarkedAt: string;
  opsNote: string;
  lastAuditAction: string;
  lastAuditAt: string;
  lastAuditOperatorId: number;
};
