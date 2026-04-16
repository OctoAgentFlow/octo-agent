import type { CurrentSubscription, PaymentMethod, PaymentRecord, Plan } from "@/types/billing";

export const currentSubscription: CurrentSubscription = {
  planKey: "billing.plan.freeTrial",
  expirationDate: "2026-04-22",
  remainingTrialDays: 5,
  statusKey: "billing.subscription.status.active",
};

export const plans: Plan[] = [
  {
    nameKey: "billing.plan.freeTrial",
    price: "0",
    periodKey: "billing.plan.period.sevenDays",
    descriptionKey: "billing.plan.freeTrial.description",
    featureKeys: [
      "billing.plan.features.autoPost",
      "billing.plan.features.autoReply",
      "billing.plan.features.basicAutoDm",
      "billing.plan.features.communitySupport",
    ],
    highlight: false,
  },
  {
    nameKey: "billing.plan.basic",
    price: "10 USDT",
    periodKey: "billing.plan.period.month",
    descriptionKey: "billing.plan.basic.description",
    featureKeys: [
      "billing.plan.features.allAutomations",
      "billing.plan.features.unlimitedRuns",
      "billing.plan.features.priorityQueue",
      "billing.plan.features.advancedAnalytics",
    ],
    highlight: true,
  },
];

export const paymentMethod: PaymentMethod = {
  methodKey: "billing.payment.method.usdt",
  networkKey: "billing.payment.network.trc20",
  addressMask: "TQ8f...4Rz9",
  noteKey: "billing.payment.note",
};

export const paymentRecords: PaymentRecord[] = [
  {
    date: "2026-04-10",
    planKey: "billing.plan.basic",
    amount: "10 USDT",
    methodKey: "billing.payment.method.usdt_trc20",
    status: "paid",
    txHash: "0x8f2c...9ab1",
  },
  {
    date: "2026-03-10",
    planKey: "billing.plan.basic",
    amount: "10 USDT",
    methodKey: "billing.payment.method.usdt_trc20",
    status: "paid",
    txHash: "0xa312...e2c9",
  },
  {
    date: "2026-02-10",
    planKey: "billing.plan.basic",
    amount: "10 USDT",
    methodKey: "billing.payment.method.usdt_trc20",
    status: "pending",
    txHash: "0xc73d...1fa3",
  },
];

