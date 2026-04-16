import { Activity, Bot, CheckCircle2, Crown, MessageCircleReply, Send, ShieldCheck, Sparkles, UserRound } from "lucide-react";

import type { AutomationModule, ConnectedAccount, Membership, OverviewStat, RecentActivity, UpgradePrompt } from "@/types/dashboard";

export const overviewStats: OverviewStat[] = [
  {
    titleKey: "dashboard.overview.membership.title",
    valueKey: "dashboard.membership.plan.freeTrial",
    subValueKey: "dashboard.membership.trialDaysLeft",
    subValueParams: { days: 5 },
    icon: Crown,
  },
  {
    titleKey: "dashboard.overview.accounts.title",
    valueKey: "dashboard.overview.accounts.count",
    valueParams: { count: 1 },
    subValueKey: "dashboard.overview.accounts.subLinked",
    subValueParams: { count: 1 },
    icon: UserRound,
  },
  {
    titleKey: "dashboard.overview.executions.title",
    valueKey: "dashboard.overview.executions.count",
    valueParams: { count: 126 },
    subValueKey: "dashboard.overview.executions.delta",
    subValueParams: { delta: 24 },
    icon: Activity,
  },
  {
    titleKey: "dashboard.overview.success.title",
    valueKey: "dashboard.overview.success.rate",
    valueParams: { rate: "96.4%" },
    subValueKey: "dashboard.overview.success.stableDays",
    subValueParams: { days: 7 },
    icon: ShieldCheck,
  },
];

export const connectedAccounts: ConnectedAccount[] = [
  {
    platformKey: "dashboard.accounts.platform.x",
    handle: "@octoagent_ai",
    statusKey: "dashboard.accounts.status.connected",
    followers: "12.8K",
    following: "304",
    lastSyncMinutes: 2,
  },
];

export const automationModules: AutomationModule[] = [
  {
    nameKey: "dashboard.automation.autoPost.name",
    statusKey: "dashboard.automation.status.running",
    todayExecuted: 12,
    nextRunMinutes: 24,
    icon: Bot,
  },
  {
    nameKey: "dashboard.automation.autoReply.name",
    statusKey: "dashboard.automation.status.running",
    todayExecuted: 93,
    nextRunMinutes: 6,
    icon: MessageCircleReply,
  },
  {
    nameKey: "dashboard.automation.autoDm.name",
    statusKey: "dashboard.automation.status.queued",
    todayExecuted: 21,
    nextRunMinutes: 42,
    icon: Send,
  },
];

export const recentActivities: RecentActivity[] = [
  {
    id: "act-1",
    time: "10:23",
    titleKey: "dashboard.activity.act1.title",
    detailKey: "dashboard.activity.act1.detail",
    statusKey: "dashboard.activity.status.success",
  },
  {
    id: "act-2",
    time: "10:11",
    titleKey: "dashboard.activity.act2.title",
    detailKey: "dashboard.activity.act2.detail",
    statusKey: "dashboard.activity.status.success",
  },
  {
    id: "act-3",
    time: "09:58",
    titleKey: "dashboard.activity.act3.title",
    detailKey: "dashboard.activity.act3.detail",
    statusKey: "dashboard.activity.status.review",
  },
  {
    id: "act-4",
    time: "09:31",
    titleKey: "dashboard.activity.act4.title",
    detailKey: "dashboard.activity.act4.detail",
    statusKey: "dashboard.activity.status.recovered",
  },
];

export const upgradePrompt: UpgradePrompt = {
  titleKey: "dashboard.upgrade.title",
  descriptionKey: "dashboard.upgrade.description",
  ctaKey: "dashboard.upgrade.cta",
  perksKeys: ["dashboard.upgrade.perk.unlimited", "dashboard.upgrade.perk.priority", "dashboard.upgrade.perk.analytics"],
  icon: Sparkles,
};

export const membership: Membership = {
  planKey: "dashboard.membership.plan.freeTrial",
  trialDaysLeft: 5,
  billingHintKey: "dashboard.membership.billingHint.basic",
  billingHintParams: { price: 10 },
  badge: CheckCircle2,
};

