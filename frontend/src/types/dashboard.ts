import type { LucideIcon } from "lucide-react";
import type { TranslateParams } from "@/i18n/types";

export type OverviewStat = {
  titleKey: string;
  valueKey: string;
  subValueKey: string;
  valueParams?: TranslateParams;
  subValueParams?: TranslateParams;
  icon: LucideIcon;
};

export type ConnectedAccount = {
  platformKey: string;
  handle: string;
  statusKey: string;
  followers: string;
  following: string;
  lastSyncMinutes: number;
};

export type AutomationModule = {
  nameKey: string;
  statusKey: string;
  todayExecuted: number;
  nextRunMinutes: number;
  icon: LucideIcon;
};

export type RecentActivity = {
  id: string;
  time: string;
  titleKey: string;
  detailKey: string;
  statusKey: string;
};

export type UpgradePrompt = {
  titleKey: string;
  descriptionKey: string;
  ctaKey: string;
  perksKeys: string[];
  icon: LucideIcon;
};

export type Membership = {
  planKey: string;
  trialDaysLeft: number;
  billingHintKey: string;
  billingHintParams?: TranslateParams;
  badge: LucideIcon;
};

