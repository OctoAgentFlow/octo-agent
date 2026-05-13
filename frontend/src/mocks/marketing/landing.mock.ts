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
  { labelKey: "marketing.nav.autoPost", href: "#auto-post" },
  { labelKey: "marketing.nav.capabilities", href: "#capabilities" },
  { labelKey: "marketing.nav.workflow", href: "#workflow" },
  { labelKey: "marketing.nav.pricing", href: "#pricing" },
  { labelKey: "marketing.nav.faq", href: "#faq" },
];

export const heroStats: HeroStat[] = [
  { labelKey: "marketing.hero.stats.teamsOnboarded", value: "1" },
  { labelKey: "marketing.hero.stats.tasksAutomated", value: "3" },
  { labelKey: "marketing.hero.stats.avgResponseSpeed", value: "300s" },
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
    code: "basic",
    name: "Basic",
    monthlyPrice: 10,
    yearlyPrice: 96,
    unit: "USDT",
    audience: "For one creator or a single project account.",
    features: [
      "1 OAF Bot and 1 X account",
      "1,000 AI generations / month",
      "Daily Auto Post 3, Reply 20, Comment 10, DM 20",
      "7-day basic Analytics",
    ],
    highlight: false,
  },
  {
    code: "plus",
    name: "Plus",
    monthlyPrice: 29,
    yearlyPrice: 279,
    unit: "USDT",
    audience: "For small teams running several social accounts.",
    badge: "Most Popular",
    features: [
      "3 OAF Bots and 3 X accounts",
      "10,000 AI generations / month",
      "Full persona fields and Auto DM import",
      "30-day Analytics",
    ],
    highlight: true,
  },
  {
    code: "pro",
    name: "Pro",
    monthlyPrice: 79,
    yearlyPrice: 759,
    unit: "USDT",
    audience: "For content teams and matrix operators.",
    badge: "Best for Teams",
    features: [
      "10 OAF Bots and 10 X accounts",
      "50,000 AI generations / month",
      "Bulk review and bot performance analytics",
      "3 team seats, 90-day Analytics and export",
    ],
    highlight: false,
  },
  {
    code: "pro_plus",
    name: "Pro+",
    monthlyPrice: 199,
    yearlyPrice: 1910,
    unit: "USDT",
    audience: "For high-frequency multi-bot growth operations.",
    features: [
      "30 OAF Bots and 30 X accounts",
      "200,000 AI generations / month",
      "A/B testing and advanced Flow Builder",
      "10 team seats, 365-day Analytics and priority support",
    ],
    highlight: false,
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
