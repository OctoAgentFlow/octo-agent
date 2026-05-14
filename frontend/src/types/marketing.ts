import type { PlanLimits } from "@/types/billing";
import type { LucideIcon } from "lucide-react";

export type NavItem = { labelKey: string; href: string };

export type HeroStat = { labelKey: string; value: string };

export type TrustBadge = { labelKey: string; icon: LucideIcon };

export type FeatureCard = {
  titleKey: string;
  descriptionKey: string;
  bulletKeys: string[];
  icon: LucideIcon;
  statusKey: string;
};

export type WorkflowStep = { titleKey: string; descriptionKey: string };

export type PricingPlan = {
  code: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  unit: string;
  limits: PlanLimits;
  highlight: boolean;
};

export type FAQItem = { qKey: string; aKey: string };

export type DashboardPreview = {
  kpis: Array<{ labelKey: string; value: string; delta: string }>;
  tasks: Array<{ time: string; taskKey: string; statusKey: string }>;
};
