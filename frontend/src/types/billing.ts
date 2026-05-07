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

export type PaymentRecord = {
  id: string;
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
};
