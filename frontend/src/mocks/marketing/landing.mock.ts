import { Bot, MessageCircleReply, Send, Sparkles, Users, Wallet } from "lucide-react";

import type {
  DashboardPreview,
  FAQItem,
  FeatureCard,
  HeroStat,
  NavItem,
  PricingPlan,
  TrustBadge,
  WorkflowStep,
} from "@/types/marketing";

export const navItems: NavItem[] = [
  { labelKey: "marketing.nav.capabilities", href: "#capabilities" },
  { labelKey: "marketing.nav.workflow", href: "#workflow" },
  { labelKey: "marketing.nav.pricing", href: "#pricing" },
  { labelKey: "marketing.nav.faq", href: "#faq" },
];

export const heroStats: HeroStat[] = [
  { labelKey: "marketing.hero.stats.teamsOnboarded", value: "200+" },
  { labelKey: "marketing.hero.stats.tasksAutomated", value: "1.2M+" },
  { labelKey: "marketing.hero.stats.avgResponseSpeed", value: "18s" },
];

export const features: FeatureCard[] = [
  {
    titleKey: "marketing.features.autoPost.title",
    descriptionKey: "marketing.features.autoPost.description",
    bulletKeys: [
      "marketing.features.autoPost.bullets.queue",
      "marketing.features.autoPost.bullets.bestTime",
      "marketing.features.autoPost.bullets.tonePresets",
    ],
    icon: Bot,
    statusKey: "marketing.features.status.running",
  },
  {
    titleKey: "marketing.features.autoReply.title",
    descriptionKey: "marketing.features.autoReply.description",
    bulletKeys: [
      "marketing.features.autoReply.bullets.templates",
      "marketing.features.autoReply.bullets.triggers",
      "marketing.features.autoReply.bullets.guardrails",
    ],
    icon: MessageCircleReply,
    statusKey: "marketing.features.status.queued",
  },
  {
    titleKey: "marketing.features.autoDm.title",
    descriptionKey: "marketing.features.autoDm.description",
    bulletKeys: [
      "marketing.features.autoDm.bullets.sequences",
      "marketing.features.autoDm.bullets.segmentation",
      "marketing.features.autoDm.bullets.takeover",
    ],
    icon: Send,
    statusKey: "marketing.features.status.running",
  },
];

export const workflowSteps: WorkflowStep[] = [
  {
    titleKey: "marketing.workflow.steps.connect.title",
    descriptionKey: "marketing.workflow.steps.connect.description",
  },
  {
    titleKey: "marketing.workflow.steps.configure.title",
    descriptionKey: "marketing.workflow.steps.configure.description",
  },
  {
    titleKey: "marketing.workflow.steps.approve.title",
    descriptionKey: "marketing.workflow.steps.approve.description",
  },
  {
    titleKey: "marketing.workflow.steps.run.title",
    descriptionKey: "marketing.workflow.steps.run.description",
  },
];

export const dashboardPreviewData: DashboardPreview = {
  kpis: [
    { labelKey: "marketing.preview.kpis.postsSent", value: "124", delta: "+18%" },
    { labelKey: "marketing.preview.kpis.repliesHandled", value: "847", delta: "+31%" },
    { labelKey: "marketing.preview.kpis.dmConversions", value: "63", delta: "+12%" },
  ],
  tasks: [
    { time: "09:00", taskKey: "marketing.preview.tasks.t1", statusKey: "marketing.preview.status.completed" },
    { time: "12:30", taskKey: "marketing.preview.tasks.t2", statusKey: "marketing.preview.status.running" },
    { time: "16:00", taskKey: "marketing.preview.tasks.t3", statusKey: "marketing.preview.status.scheduled" },
  ],
};

export const pricingPlans: PricingPlan[] = [
  {
    nameKey: "marketing.pricing.freeTrial.name",
    price: "0",
    unit: "USDT",
    period: "7 days",
    descriptionKey: "marketing.pricing.freeTrial.description",
    featureKeys: [
      "marketing.pricing.freeTrial.features.autoPost",
      "marketing.pricing.freeTrial.features.autoReply",
      "marketing.pricing.freeTrial.features.basicDashboard",
      "marketing.pricing.freeTrial.features.communitySupport",
    ],
    ctaKey: "marketing.pricing.freeTrial.cta",
    highlight: false,
  },
  {
    nameKey: "marketing.pricing.basic.name",
    price: "10",
    unit: "USDT",
    period: "/ month",
    descriptionKey: "marketing.pricing.basic.description",
    featureKeys: [
      "marketing.pricing.basic.features.allAutomations",
      "marketing.pricing.basic.features.unlimitedWorkflows",
      "marketing.pricing.basic.features.prioritySupport",
      "marketing.pricing.basic.features.advancedAnalytics",
    ],
    ctaKey: "marketing.pricing.basic.cta",
    highlight: true,
  },
];

export const faqs: FAQItem[] = [
  {
    qKey: "marketing.faq.q1.q",
    aKey: "marketing.faq.q1.a",
  },
  {
    qKey: "marketing.faq.q2.q",
    aKey: "marketing.faq.q2.a",
  },
  {
    qKey: "marketing.faq.q3.q",
    aKey: "marketing.faq.q3.a",
  },
];

export const trustBadges: TrustBadge[] = [
  { labelKey: "marketing.hero.trust.aiNative", icon: Sparkles },
  { labelKey: "marketing.hero.trust.builtForTeams", icon: Users },
  { labelKey: "marketing.hero.trust.cryptoBilling", icon: Wallet },
];

