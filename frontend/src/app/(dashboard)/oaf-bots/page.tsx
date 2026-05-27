"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import axios from "axios";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  FilePlus2,
  Globe2,
  Info,
  ListChecks,
  Lock,
  Mail,
  MessageCircle,
  MessagesSquare,
  RefreshCw,
  Rocket,
  Save,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  WalletCards,
  Workflow,
} from "lucide-react";

import { SectionCard } from "@/components/dashboard/section-card";
import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";
import { broadcastDataSynced } from "@/lib/app-page-refresh";
import { accountService, type AccountListItem } from "@/services/account.service";
import { automationService, type AutomationModuleApi } from "@/services/automation.service";
import { autoPostService, type AutoPostPlanApi } from "@/services/auto-post.service";
import { contentLibraryService, type ContentLibraryItemApi } from "@/services/content-library.service";
import { oafBotService } from "@/services/oaf-bot.service";
import { reviewQueueService, type ReviewQueueItemApi } from "@/services/review-queue.service";
import type { PlanLimits, PlanUsage } from "@/types/billing";
import type {
  OAFBot,
  OAFBotGenerationFeedback,
  OAFBotGenerationFeedbackRating,
  OAFBotGenerationUsage,
  OAFBotPayload,
  OAFBotProfileAssistMode,
  OAFBotSampleContext,
  OAFBotSampleScene,
  OAFBotTestGenerateResult,
} from "@/types/oaf-bot";

type WizardStep = "identity" | "brand" | "style" | "topics" | "goals" | "test";
type SampleScene = OAFBotSampleScene;
type BotAutomationType = "post" | "reply" | "comment" | "dm";
type BotAutomationState = {
  type: BotAutomationType;
  enabled: boolean;
  configured: boolean;
  mode: "manual" | "review" | "autopilot";
  href: string;
};
type QueueSummary = {
  total: number;
  pendingReview: number;
  readyToPublish: number;
  failed: number;
  published: number;
};
type AutoPostReadinessStep = {
  key: "account" | "content" | "planner" | "autopilot";
  ready: boolean;
  href: string;
};
type FeedbackDraft = {
  rating: OAFBotGenerationFeedbackRating | "";
  issueTags: string[];
  comment: string;
};
type BotMatrixRow = {
  bot: OAFBot;
  account?: AccountListItem;
  completion: number;
  activeContentCount: number;
  queueSummary: QueueSummary;
  plan?: AutoPostPlanApi;
  autoPostReady: boolean;
  monthlyUsage: number;
  negativeFeedback: number;
};

type SelectOption = {
  value: string;
  label: string;
};

type ChipOption = SelectOption;

type ApiErrorBody = {
  message?: string;
  error_code?: string;
};

const wizardStepOrder: WizardStep[] = ["identity", "brand", "style", "topics", "goals", "test"];
const personaChecklistKeys = ["name", "account", "role", "brand", "audience", "language", "personality", "topics", "contentStrategy", "guardrails", "summary", "goal"] as const;
type PersonaChecklistKey = typeof personaChecklistKeys[number];

const usageSceneOrder = ["oaf_bot_test_generate", "auto_post", "auto_comment", "auto_reply", "auto_dm"] as const;
const automationTypes: BotAutomationType[] = ["post", "reply", "comment", "dm"];
const profileAssistModes: OAFBotProfileAssistMode[] = ["fill_missing_only", "improve_all"];

const emptyLimits: PlanLimits = {
  maxBots: 1,
  maxTwitterAccounts: 1,
  aiGenerationsMonthly: 100,
  monthlyXWrites: 10,
  monthlyXUrlPosts: 0,
  monthlyCostCapCents: 0,
  monthlyAutoPosts: 30,
  monthlyAutoReplies: 150,
  monthlyAutoComments: 90,
  monthlyAutoDMs: 150,
  dailyAutoPosts: 1,
  dailyAutoReplies: 5,
  dailyAutoComments: 3,
  dailyAutoDMs: 5,
  analyticsDays: 7,
  teamSeats: 1,
  fullPersonaFields: false,
  autoDMImport: false,
  advancedBotStrategy: false,
  bulkReview: false,
  botPerformance: false,
  dataExport: false,
  multiBotMatrix: false,
  abTesting: false,
  advancedFlowBuilder: false,
  advancedRiskRules: false,
  prioritySupport: false,
};

const emptyUsage: PlanUsage = {
  oafBots: 0,
  twitterAccounts: 0,
  aiGenerationsMonth: 0,
  autoPostsMonth: 0,
  autoRepliesMonth: 0,
  autoCommentsMonth: 0,
  autoDMsMonth: 0,
  autoPostsToday: 0,
  autoRepliesToday: 0,
  autoCommentsToday: 0,
  autoDMsToday: 0,
};

function createEmptyForm(defaultPrimaryLanguage: string): OAFBotPayload {
  return {
    name: "",
    twitter_account_id: 0,
    occupation: "",
    industry: "",
    age_range: "",
    gender: "",
    education: "",
    mbti: "",
    personality_tags: [],
    identity_summary: "",
    voice_tone: "",
    topics: [],
    forbidden_topics: [],
    growth_goal: "",
    project_one_liner: "",
    target_audience: "",
    core_value_props: "",
    product_features: "",
    differentiators: "",
    content_pillars: [],
    content_objectives: "",
    preferred_cta: "",
    hashtags: [],
    keywords: [],
    compliance_notes: "",
    avoid_claims: [],
    safety_mode: "balanced",
    primary_language: defaultPrimaryLanguage,
    language_strategy: "follow_context",
  };
}

const mbtiValues = [
  "not_set",
  "INTJ",
  "INTP",
  "ENTJ",
  "ENTP",
  "INFJ",
  "INFP",
  "ENFJ",
  "ENFP",
  "ISTJ",
  "ISFJ",
  "ESTJ",
  "ESFJ",
  "ISTP",
  "ISFP",
  "ESTP",
  "ESFP",
];

const recommendedOptionValues: Record<string, Record<string, string>> = {
  occupation: {
    web3GrowthManager: "Web3 Growth Manager",
    aiProductManager: "AI Product Manager",
    cryptoResearcher: "Crypto Researcher",
    communityManager: "Community Manager",
    founder: "Founder",
    developerAdvocate: "Developer Advocate",
    contentCreator: "Content Creator",
    kolAssistant: "KOL Assistant",
  },
  industry: {
    ai: "AI",
    web3: "Web3",
    defi: "DeFi",
    socialfi: "SocialFi",
    nft: "NFT / Digital Collectibles",
    gaming: "Gaming",
    saas: "SaaS",
    creatorEconomy: "Creator Economy",
    cryptoTrading: "Crypto Trading",
    developerTools: "Developer Tools",
  },
  personality: {
    professional: "Professional",
    casual: "Casual",
    humorous: "Humorous",
    restrained: "Restrained",
    direct: "Direct",
    warm: "Warm",
    sharp: "Sharp",
    curious: "Curious",
    helpful: "Helpful",
    growth: "Growth-oriented",
  },
  topics: {
    aiAgent: "AI Agent",
    web3Growth: "Web3 Growth",
    socialfi: "SocialFi",
    xMarketing: "X Marketing",
    communityBuilding: "Community Building",
    tokenEconomy: "Token Economy",
    productLaunch: "Product Launch",
    cryptoTrends: "Crypto Trends",
    startup: "Startup",
  },
  contentPillars: {
    productValue: "Product value",
    userPainPoints: "User pain points",
    useCases: "Use cases",
    founderInsight: "Founder insight",
    marketEducation: "Market education",
    communityProof: "Community proof",
    roadmap: "Roadmap updates",
    ecosystem: "Ecosystem collaborations",
  },
  hashtags: {
    ai: "#AI",
    web3: "#Web3",
    socialfi: "#SocialFi",
    aiAgent: "#AIAgent",
    crypto: "#Crypto",
    builders: "#BuildInPublic",
  },
  keywords: {
    automation: "automation",
    socialGrowth: "social growth",
    engagement: "engagement",
    creatorEconomy: "creator economy",
    tokenUtility: "token utility",
    communityOps: "community operations",
  },
  forbidden: {
    investmentAdvice: "Investment advice",
    profitPromise: "Profit promises",
    politics: "Political controversy",
    adult: "Adult content",
    attacks: "Aggressive language",
    impersonation: "Impersonating officials",
    pricePrediction: "Price predictions",
  },
  avoidClaims: {
    guaranteedReturns: "Guaranteed returns",
    tokenPrice: "Token price prediction",
    officialPartnership: "Unverified official partnership",
    legalAdvice: "Legal or financial advice",
    medicalClaims: "Medical or health claims",
    absoluteSuperiority: "Absolute superiority claims",
  },
  growthGoals: {
    activity: "Increase account activity",
    followers: "Grow followers",
    website: "Drive website visits",
    trial: "Drive free trials",
    leads: "Capture leads",
    brandAuthority: "Build brand authority",
    dmConversion: "Convert through DMs",
  },
  voicePresets: {
    concise: "Concise and professional",
    natural: "Relaxed and natural",
    web3Native: "Web3-native",
    founder: "Founder perspective",
    technical: "Technical explainer",
    growth: "Growth conversion",
    community: "Community operations",
  },
};

export default function OAFBotsPage() {
  const { t, lang } = useT();
  const { pushToast } = useToast();
  const defaultPrimaryLanguage = lang === "en" ? "en" : "zh-CN";
  const [loading, setLoading] = useState(true);
  const [bots, setBots] = useState<OAFBot[]>([]);
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [automationModules, setAutomationModules] = useState<AutomationModuleApi[]>([]);
  const [autoPostPlans, setAutoPostPlans] = useState<AutoPostPlanApi[]>([]);
  const [contentItems, setContentItems] = useState<ContentLibraryItemApi[]>([]);
  const [queueItems, setQueueItems] = useState<ReviewQueueItemApi[]>([]);
  const [relationshipLoading, setRelationshipLoading] = useState(true);
  const [limits, setLimits] = useState<PlanLimits>(emptyLimits);
  const [usage, setUsage] = useState<PlanUsage>(emptyUsage);
  const [selectedID, setSelectedID] = useState<number | null>(null);
  const [form, setForm] = useState<OAFBotPayload>(() => createEmptyForm(defaultPrimaryLanguage));
  const [activeStep, setActiveStep] = useState<WizardStep>("identity");
  const [sampleScene, setSampleScene] = useState<SampleScene>("tweet");
  const [sampleContexts, setSampleContexts] = useState<OAFBotSampleContext>({});
  const [samples, setSamples] = useState<OAFBotTestGenerateResult | null>(null);
  const [generationUsages, setGenerationUsages] = useState<OAFBotGenerationUsage[]>([]);
  const [generationFeedback, setGenerationFeedback] = useState<OAFBotGenerationFeedback[]>([]);
  const [matrixUsageByBot, setMatrixUsageByBot] = useState<Record<number, OAFBotGenerationUsage[]>>({});
  const [matrixFeedbackByBot, setMatrixFeedbackByBot] = useState<Record<number, OAFBotGenerationFeedback[]>>({});
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [generationUsagesLoading, setGenerationUsagesLoading] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackDraft, setFeedbackDraft] = useState<FeedbackDraft>({ rating: "", issueTags: [], comment: "" });
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [completingProfile, setCompletingProfile] = useState(false);
  const [profileAssistMode, setProfileAssistMode] = useState<OAFBotProfileAssistMode>("fill_missing_only");

  const currentMonth = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const selectedBot = useMemo(() => bots.find((bot) => bot.id === selectedID) ?? null, [bots, selectedID]);
  const botListStats = useMemo(() => {
    const bound = bots.filter((bot) => Boolean(bot.twitter_account_id)).length;
    const ready = bots.filter((bot) => calculatePersonaCompleteness(botToPayload(bot, defaultPrimaryLanguage)) >= 60).length;
    return { bound, ready };
  }, [bots, defaultPrimaryLanguage]);
  const selectedMonthlyUsageTotal = useMemo(() => {
    if (!selectedID) return 0;
    const usageByScene = aggregateMonthlyUsage(generationUsages, currentMonth);
    return usageSceneOrder.reduce((sum, scene) => sum + (usageByScene.get(scene)?.count ?? 0), 0);
  }, [currentMonth, generationUsages, selectedID]);
  const canCreate = usage.oafBots < limits.maxBots;
  const formChanged = useMemo(() => {
    if (!selectedBot) return false;
    return JSON.stringify(botToPayload(selectedBot, defaultPrimaryLanguage)) !== JSON.stringify(form);
  }, [defaultPrimaryLanguage, form, selectedBot]);

  const accountByID = useMemo(() => {
    return new Map(accounts.map((account) => [account.id, account]));
  }, [accounts]);
  const selectedAccount = useMemo(() => {
    if (!selectedBot?.twitter_account_id) return undefined;
    return accountByID.get(selectedBot.twitter_account_id);
  }, [accountByID, selectedBot]);

  const accountBoundByOtherBot = useMemo(() => {
    const map = new Map<number, OAFBot>();
    bots.forEach((bot) => {
      if (bot.twitter_account_id && bot.id !== selectedID) {
        map.set(bot.twitter_account_id, bot);
      }
    });
    return map;
  }, [bots, selectedID]);

  const selectedPostPlan = useMemo(() => {
    if (!selectedBot) return undefined;
    return autoPostPlans.find((plan) => plan.bot_id === selectedBot.id || plan.x_account_id === selectedBot.twitter_account_id);
  }, [autoPostPlans, selectedBot]);
  const selectedCompatibleContentItems = useMemo(() => {
    if (!selectedBot) return [];
    return contentItems.filter((item) => contentItemMatchesBot(item, selectedBot));
  }, [contentItems, selectedBot]);
  const selectedActiveContentItems = useMemo(
    () => selectedCompatibleContentItems.filter((item) => item.status === "active"),
    [selectedCompatibleContentItems],
  );
  const selectedAutoPostReadiness = useMemo<AutoPostReadinessStep[]>(() => {
    const accountID = selectedBot?.twitter_account_id || 0;
    return [
      { key: "account", ready: Boolean(selectedAccount), href: "/accounts" },
      { key: "content", ready: selectedActiveContentItems.length > 0, href: accountID ? `/auto-post?panel=content&account=${accountID}` : "/auto-post?panel=content" },
      { key: "planner", ready: Boolean(selectedPostPlan?.enabled), href: accountID ? `/auto-post?panel=planner&account=${accountID}` : "/auto-post?panel=planner" },
      { key: "autopilot", ready: selectedPostPlan?.execution_mode === "autopilot", href: accountID ? `/auto-post?panel=planner&account=${accountID}` : "/auto-post?panel=planner" },
    ];
  }, [selectedAccount, selectedActiveContentItems.length, selectedBot, selectedPostPlan]);

  const selectedQueueItems = useMemo(() => {
    if (!selectedID) return [];
    return queueItems.filter((item) => item.bot_id === selectedID);
  }, [queueItems, selectedID]);

  const selectedQueueSummary = useMemo(() => summarizeQueue(selectedQueueItems), [selectedQueueItems]);

  const selectedAutomationStates = useMemo<BotAutomationState[]>(() => {
    return automationTypes.map((type) => {
      const automationModule = automationModules.find((item) => item.type === type);
      const mode = type === "post" ? selectedPostPlan?.execution_mode || automationModule?.config.execution_mode || "review" : automationModule?.config.execution_mode || "review";
      return {
        type,
        enabled: type === "post" ? Boolean(selectedPostPlan?.enabled) : Boolean(automationModule?.config.enabled),
        configured: type === "post" ? Boolean(selectedPostPlan) : Boolean(automationModule),
        mode,
        href: automationHref(type),
      };
    });
  }, [automationModules, selectedPostPlan]);
  const matrixRows = useMemo<BotMatrixRow[]>(() => {
    return bots.map((bot) => {
      const account = bot.twitter_account_id ? accountByID.get(bot.twitter_account_id) : undefined;
      const plan = autoPostPlans.find((item) => item.bot_id === bot.id || item.x_account_id === bot.twitter_account_id);
      const compatibleContent = contentItems.filter((item) => contentItemMatchesBot(item, bot));
      const activeContentCount = compatibleContent.filter((item) => item.status === "active").length;
      const botQueueItems = queueItems.filter((item) => item.bot_id === bot.id);
      const usageByScene = aggregateMonthlyUsage(matrixUsageByBot[bot.id] || [], currentMonth);
      const monthlyUsage = usageSceneOrder.reduce((sum, scene) => sum + (usageByScene.get(scene)?.count ?? 0), 0);
      const feedback = matrixFeedbackByBot[bot.id] || [];
      return {
        bot,
        account,
        completion: calculatePersonaCompleteness(botToPayload(bot, defaultPrimaryLanguage)),
        activeContentCount,
        queueSummary: summarizeQueue(botQueueItems),
        plan,
        autoPostReady: Boolean(account && plan?.enabled && plan.execution_mode === "autopilot" && activeContentCount > 0),
        monthlyUsage,
        negativeFeedback: feedback.filter((item) => item.rating === "negative").length,
      };
    });
  }, [accountByID, autoPostPlans, bots, contentItems, currentMonth, defaultPrimaryLanguage, matrixFeedbackByBot, matrixUsageByBot, queueItems]);
  const matrixSummary = useMemo(() => {
    return matrixRows.reduce(
      (summary, row) => {
        summary.bound += row.account ? 1 : 0;
        summary.ready += row.autoPostReady ? 1 : 0;
        summary.review += row.queueSummary.pendingReview;
        summary.usage += row.monthlyUsage;
        summary.negativeFeedback += row.negativeFeedback;
        return summary;
      },
      { bound: 0, ready: 0, review: 0, usage: 0, negativeFeedback: 0 },
    );
  }, [matrixRows]);

  const selectedAccountConflict = form.twitter_account_id ? accountBoundByOtherBot.get(form.twitter_account_id) : undefined;
  const personaCompleteness = useMemo(() => calculatePersonaCompleteness(form), [form]);
  const isDefaultLanguageConfig =
    (form.primary_language || defaultPrimaryLanguage) === defaultPrimaryLanguage && (form.language_strategy || "follow_context") === "follow_context";
  const activeStepIndex = wizardStepOrder.indexOf(activeStep);
  const personaChecklist = useMemo(() => getPersonaChecklist(form, t), [form, t]);
  const qualityDiagnostics = useMemo(() => getPersonaQualityDiagnostics(form, t), [form, t]);
  const stepCompletion = useMemo(() => getStepCompletion(form, Boolean(selectedID)), [form, selectedID]);
  const canTestBot = personaCompleteness >= 40;

  const wizardSteps = useMemo<Array<{ id: WizardStep; label: string; description: string }>>(
    () => [
      { id: "identity", label: t("oafBots.wizard.identity"), description: t("oafBots.wizard.identityDesc") },
      { id: "brand", label: t("oafBots.wizard.brand"), description: t("oafBots.wizard.brandDesc") },
      { id: "style", label: t("oafBots.wizard.style"), description: t("oafBots.wizard.styleDesc") },
      { id: "topics", label: t("oafBots.wizard.topics"), description: t("oafBots.wizard.topicsDesc") },
      { id: "goals", label: t("oafBots.wizard.goals"), description: t("oafBots.wizard.goalsDesc") },
      { id: "test", label: t("oafBots.wizard.test"), description: t("oafBots.wizard.testDesc") },
    ],
    [t],
  );
  const activeStepMeta = wizardSteps.find((step) => step.id === activeStep);

  const occupationOptions = useMemo(
    () => optionKeys("occupation", [
      "web3GrowthManager",
      "aiProductManager",
      "cryptoResearcher",
      "communityManager",
      "founder",
      "developerAdvocate",
      "contentCreator",
      "kolAssistant",
    ], t),
    [t],
  );
  const industryOptions = useMemo(
    () => optionKeys("industry", ["ai", "web3", "defi", "socialfi", "nft", "gaming", "saas", "creatorEconomy", "cryptoTrading", "developerTools"], t),
    [t],
  );
  const personalityOptions = useMemo(
    () => optionKeys("personality", ["professional", "casual", "humorous", "restrained", "direct", "warm", "sharp", "curious", "helpful", "growth"], t),
    [t],
  );
  const topicOptions = useMemo(
    () => optionKeys("topics", ["aiAgent", "web3Growth", "socialfi", "xMarketing", "communityBuilding", "tokenEconomy", "productLaunch", "cryptoTrends", "startup"], t),
    [t],
  );
  const contentPillarOptions = useMemo(
    () => optionKeys("contentPillars", ["productValue", "userPainPoints", "useCases", "founderInsight", "marketEducation", "communityProof", "roadmap", "ecosystem"], t),
    [t],
  );
  const hashtagOptions = useMemo(
    () => optionKeys("hashtags", ["ai", "web3", "socialfi", "aiAgent", "crypto", "builders"], t),
    [t],
  );
  const keywordOptions = useMemo(
    () => optionKeys("keywords", ["automation", "socialGrowth", "engagement", "creatorEconomy", "tokenUtility", "communityOps"], t),
    [t],
  );
  const forbiddenTopicOptions = useMemo(
    () => optionKeys("forbidden", ["investmentAdvice", "profitPromise", "politics", "adult", "attacks", "impersonation", "pricePrediction"], t),
    [t],
  );
  const avoidClaimOptions = useMemo(
    () => optionKeys("avoidClaims", ["guaranteedReturns", "tokenPrice", "officialPartnership", "legalAdvice", "medicalClaims", "absoluteSuperiority"], t),
    [t],
  );
  const growthGoalOptions = useMemo(
    () => optionKeys("growthGoals", ["activity", "followers", "website", "trial", "leads", "brandAuthority", "dmConversion"], t),
    [t],
  );
  const voicePresetOptions = useMemo(
    () => optionKeys("voicePresets", ["concise", "natural", "web3Native", "founder", "technical", "growth", "community"], t),
    [t],
  );
  const feedbackIssueOptions = useMemo(
    () => optionKeys("feedbackIssues", ["offPersona", "tooGeneric", "tooSalesy", "unsafeClaim", "wrongLanguage", "tooLong", "weakCTA", "missingContext"], t),
    [t],
  );

  const ageOptions = useMemo<SelectOption[]>(
    () => [
      { value: "", label: t("oafBots.options.unset") },
      { value: "18-24", label: "18-24" },
      { value: "25-30", label: "25-30" },
      { value: "31-40", label: "31-40" },
      { value: "40+", label: "40+" },
    ],
    [t],
  );
  const genderOptions = useMemo<SelectOption[]>(
    () => [
      { value: "", label: t("oafBots.options.unset") },
      { value: "feminine", label: t("oafBots.options.gender.feminine") },
      { value: "masculine", label: t("oafBots.options.gender.masculine") },
      { value: "neutral", label: t("oafBots.options.gender.neutral") },
      { value: "brand", label: t("oafBots.options.gender.brand") },
    ],
    [t],
  );
  const educationOptions = useMemo<SelectOption[]>(
    () => [
      { value: "", label: t("oafBots.options.unset") },
      { value: "bachelor", label: t("oafBots.options.education.bachelor") },
      { value: "master", label: t("oafBots.options.education.master") },
      { value: "phd", label: t("oafBots.options.education.phd") },
      { value: "self_taught", label: t("oafBots.options.education.selfTaught") },
      { value: "serial_founder", label: t("oafBots.options.education.serialFounder") },
      { value: "tech_community", label: t("oafBots.options.education.techCommunity") },
    ],
    [t],
  );
  const mbtiOptions = useMemo<SelectOption[]>(
    () => mbtiValues.map((value) => ({ value: value === "not_set" ? "" : value, label: value === "not_set" ? t("oafBots.options.unset") : value })),
    [t],
  );
  const safetyOptions = useMemo<SelectOption[]>(
    () => [
      { value: "conservative", label: t("oafBots.safety.conservative") },
      { value: "balanced", label: t("oafBots.safety.balanced") },
      { value: "autopilot", label: t("oafBots.safety.autopilot") },
    ],
    [t],
  );
  const languageOptions = useMemo<SelectOption[]>(
    () => [
      { value: "zh-CN", label: t("oafBots.language.zhCN") },
      { value: "zh-TW", label: t("oafBots.language.zhTW") },
      { value: "en", label: t("oafBots.language.en") },
      { value: "ja", label: t("oafBots.language.ja") },
      { value: "ko", label: t("oafBots.language.ko") },
      { value: "mixed_zh_en", label: t("oafBots.language.mixedZhEn") },
    ],
    [t],
  );
  const languageStrategyOptions = useMemo<SelectOption[]>(
    () => [
      { value: "always_primary", label: t("oafBots.languageStrategy.alwaysPrimary") },
      { value: "follow_context", label: t("oafBots.languageStrategy.followContext") },
      { value: "bilingual", label: t("oafBots.languageStrategy.bilingual") },
      { value: "mixed_style", label: t("oafBots.languageStrategy.mixedStyle") },
    ],
    [t],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [botData, accountData] = await Promise.all([oafBotService.list(), accountService.list()]);
      setBots(botData.items);
      setLimits(botData.limits);
      setUsage({ ...botData.usage, oafBots: botData.items.length });
      setAccounts(accountData.items);
      if (!selectedID && botData.items[0]) {
        setSelectedID(botData.items[0].id);
        setForm(botToPayload(botData.items[0], defaultPrimaryLanguage));
      }
      broadcastDataSynced(Date.now());
    } catch (error) {
      pushToast(errorMessage(error, t("oafBots.toast.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [defaultPrimaryLanguage, pushToast, selectedID, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadRelationshipContext = useCallback(async () => {
    setRelationshipLoading(true);
    try {
      const [automationData, planData, queueData, contentData] = await Promise.all([
        automationService.list(),
        autoPostService.plans(),
        reviewQueueService.list({ pageSize: 100 }),
        contentLibraryService.list({ limit: 100 }),
      ]);
      setAutomationModules(automationData.modules);
      setAutoPostPlans(planData.items);
      setQueueItems(queueData.items);
      setContentItems(contentData.items);
    } catch {
      setAutomationModules([]);
      setAutoPostPlans([]);
      setQueueItems([]);
      setContentItems([]);
    } finally {
      setRelationshipLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRelationshipContext();
  }, [loadRelationshipContext]);

  useEffect(() => {
    if (selectedID) return;
    setForm((prev) => {
      if (!isUnconfiguredDraft(prev)) return prev;
      if (prev.primary_language === defaultPrimaryLanguage && prev.language_strategy === "follow_context") return prev;
      return createEmptyForm(defaultPrimaryLanguage);
    });
  }, [defaultPrimaryLanguage, selectedID]);

  const loadGenerationUsages = useCallback(async (botID: number) => {
    setGenerationUsagesLoading(true);
    try {
      const data = await oafBotService.generationUsages(botID);
      setGenerationUsages(data.items);
    } catch (error) {
      pushToast(errorMessage(error, t("oafBots.usages.loadFailed")));
      setGenerationUsages([]);
    } finally {
      setGenerationUsagesLoading(false);
    }
  }, [pushToast, t]);

  const loadGenerationFeedback = useCallback(async (botID: number) => {
    setFeedbackLoading(true);
    try {
      const data = await oafBotService.generationFeedback(botID);
      setGenerationFeedback(data.items);
    } catch (error) {
      pushToast(errorMessage(error, t("oafBots.feedback.loadFailed")));
      setGenerationFeedback([]);
    } finally {
      setFeedbackLoading(false);
    }
  }, [pushToast, t]);

  useEffect(() => {
    if (!selectedID) {
      setGenerationUsages([]);
      return;
    }
    void loadGenerationUsages(selectedID);
  }, [loadGenerationUsages, selectedID]);

  useEffect(() => {
    if (!selectedID) {
      setGenerationFeedback([]);
      return;
    }
    void loadGenerationFeedback(selectedID);
  }, [loadGenerationFeedback, selectedID]);

  const loadMatrixSignals = useCallback(async (items: OAFBot[]) => {
    if (items.length === 0) {
      setMatrixUsageByBot({});
      setMatrixFeedbackByBot({});
      return;
    }
    setMatrixLoading(true);
    try {
      const pairs = await Promise.all(
        items.map(async (bot) => {
          const [usageData, feedbackData] = await Promise.all([
            oafBotService.generationUsages(bot.id).catch(() => ({ items: [] as OAFBotGenerationUsage[] })),
            oafBotService.generationFeedback(bot.id).catch(() => ({ items: [] as OAFBotGenerationFeedback[] })),
          ]);
          return [bot.id, usageData.items, feedbackData.items] as const;
        }),
      );
      setMatrixUsageByBot(Object.fromEntries(pairs.map(([id, usageItems]) => [id, usageItems])));
      setMatrixFeedbackByBot(Object.fromEntries(pairs.map(([id, , feedbackItems]) => [id, feedbackItems])));
    } finally {
      setMatrixLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMatrixSignals(bots);
  }, [bots, loadMatrixSignals]);

  const updateForm = <K extends keyof OAFBotPayload>(key: K, value: OAFBotPayload[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const selectBot = (bot: OAFBot) => {
    setSelectedID(bot.id);
    setForm(botToPayload(bot, defaultPrimaryLanguage));
    setActiveStep("identity");
    setSamples(null);
    setSampleContexts({});
    setFeedbackDraft({ rating: "", issueTags: [], comment: "" });
  };

  const startCreate = () => {
    setSelectedID(null);
    setForm(createEmptyForm(defaultPrimaryLanguage));
    setActiveStep("identity");
    setSamples(null);
    setGenerationUsages([]);
    setGenerationFeedback([]);
    setSampleContexts({});
    setFeedbackDraft({ rating: "", issueTags: [], comment: "" });
  };

  const goStep = (direction: "previous" | "next") => {
    const nextIndex = direction === "previous" ? Math.max(0, activeStepIndex - 1) : Math.min(wizardStepOrder.length - 1, activeStepIndex + 1);
    setActiveStep(wizardStepOrder[nextIndex]);
  };

  const goTestStep = () => {
    setActiveStep("test");
  };

  const save = async () => {
    if (selectedAccountConflict) {
      pushToast(t("oafBots.toast.accountAlreadyBound", { name: selectedAccountConflict.name }));
      return;
    }
    setSaving(true);
    try {
      const saved = selectedID ? await oafBotService.update(selectedID, form) : await oafBotService.create(form);
      setBots((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
      setSelectedID(saved.id);
      setForm(botToPayload(saved, defaultPrimaryLanguage));
      setUsage((prev) => ({ ...prev, oafBots: selectedID ? prev.oafBots : prev.oafBots + 1 }));
      pushToast(t("oafBots.toast.saved"));
    } catch (error) {
      const body = getErrorBody(error);
      if (body?.error_code === "oaf_bot_twitter_account_already_bound") {
        pushToast(t("oafBots.toast.accountBoundError"));
      } else {
        pushToast(body?.message || t("oafBots.toast.saveFailed"));
      }
    } finally {
      setSaving(false);
    }
  };

  const completeProfile = async () => {
    if (!hasProfileAssistSeed(form)) {
      pushToast(t("oafBots.completeProfile.needSeed"));
      return;
    }
    setCompletingProfile(true);
    try {
      const result = await oafBotService.completeProfile(form, profileAssistMode);
      setForm((prev) => ({
        ...prev,
        ...result.profile,
        name: prev.name || result.profile.name,
        twitter_account_id: prev.twitter_account_id || result.profile.twitter_account_id,
      }));
      setSamples(null);
      setUsage((prev) => ({ ...prev, aiGenerationsMonth: prev.aiGenerationsMonth + (result.usage_consumed || 1) }));
      pushToast(t("oafBots.completeProfile.success"));
    } catch (error) {
      const body = getErrorBody(error);
      if (body?.error_code === "ai_generation_quota_exceeded") {
        pushToast(t("oafBots.test.quotaExceeded"));
      } else {
        pushToast(body?.message || t("oafBots.completeProfile.failed"));
      }
    } finally {
      setCompletingProfile(false);
    }
  };

  const testGenerate = async () => {
    if (!selectedID) {
      pushToast(t("oafBots.test.saveFirst"));
      return;
    }
    if (formChanged) {
      pushToast(t("oafBots.test.saveChangesFirst"));
      return;
    }
    const validationMessage = validateBeforeGenerate(form, t);
    if (validationMessage) {
      pushToast(validationMessage);
      return;
    }
    setGenerating(true);
    try {
      const result = await oafBotService.testGenerate(selectedID, sampleScene, sampleContexts[sampleScene]);
      setSamples(result);
      setFeedbackDraft({ rating: "", issueTags: [], comment: "" });
      await loadGenerationUsages(selectedID);
      void loadMatrixSignals(bots);
      void loadRelationshipContext();
      setUsage((prev) => ({ ...prev, aiGenerationsMonth: prev.aiGenerationsMonth + (result.usage_consumed || 1) }));
      pushToast(t("oafBots.test.success"));
    } catch (error) {
      const body = getErrorBody(error);
      if (body?.error_code === "ai_generation_quota_exceeded") {
        pushToast(t("oafBots.test.quotaExceeded"));
      } else {
        pushToast(body?.message || t("oafBots.test.failed"));
      }
    } finally {
      setGenerating(false);
    }
  };

  const handlePreviewTest = () => {
    if (!canTestBot) {
      pushToast(t("oafBots.test.disabledHint"));
      return;
    }
    setActiveStep("test");
    if (!selectedID) {
      pushToast(t("oafBots.test.saveFirst"));
      return;
    }
    if (formChanged) {
      pushToast(t("oafBots.test.saveChangesFirst"));
      return;
    }
    void testGenerate();
  };

  const submitGenerationFeedback = async () => {
    if (!selectedID || !samples) return;
    if (!feedbackDraft.rating) {
      pushToast(t("oafBots.feedback.needRating"));
      return;
    }
    const generatedContent = normalizeSampleContent(samples, sampleScene);
    if (!generatedContent.trim()) {
      pushToast(t("oafBots.feedback.needSample"));
      return;
    }
    setFeedbackSaving(true);
    try {
      const saved = await oafBotService.createGenerationFeedback(selectedID, {
        scene: sampleScene,
        rating: feedbackDraft.rating,
        issue_tags: feedbackDraft.issueTags,
        comment: feedbackDraft.comment,
        sample_context: sampleContexts[sampleScene] || "",
        generated_content: generatedContent,
        provider: samples.provider || "",
      });
      setGenerationFeedback((items) => [saved, ...items].slice(0, 10));
      setMatrixFeedbackByBot((prev) => ({ ...prev, [selectedID]: [saved, ...(prev[selectedID] || [])].slice(0, 10) }));
      setFeedbackDraft({ rating: "", issueTags: [], comment: "" });
      pushToast(t("oafBots.feedback.saved"));
    } catch (error) {
      pushToast(errorMessage(error, t("oafBots.feedback.saveFailed")));
    } finally {
      setFeedbackSaving(false);
    }
  };

  const handleSampleSceneChange = (scene: SampleScene) => {
    setSampleScene(scene);
    setSamples(null);
  };

  if (loading) {
    return <Card><CardHeader title={t("oafBots.loading.title")} description={t("oafBots.loading.description")} /></Card>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm text-[#1d9bf0]"><Bot className="size-4" /> OAF Bot</p>
          <h1 className="mt-2 text-2xl font-bold text-[#e7e9ea]">{t("oafBots.page.title")}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#71767b]">{t("oafBots.page.subtitle")}</p>
        </div>
        <Button
          type="button"
          disabled={!canCreate}
          onClick={startCreate}
          className="w-full sm:w-auto"
        >
          {t("oafBots.actions.new")}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <QuotaCard label={t("oafBots.quota.oafBots")} used={usage.oafBots} limit={limits.maxBots} />
        <QuotaCard label={t("oafBots.quota.xAccounts")} used={usage.twitterAccounts} limit={limits.maxTwitterAccounts} />
        <QuotaCard label={t("oafBots.quota.aiMonthly")} used={usage.aiGenerationsMonth} limit={limits.aiGenerationsMonthly} />
        <QuotaCard label={t("oafBots.quota.autoComments")} used={usage.autoCommentsMonth} limit={limits.monthlyAutoComments} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#2f3336] bg-[#0f1419] px-4 py-3 text-sm text-[#e7e9ea]">
        <p className="min-w-0 break-words">{t("oafBots.planHint", { bots: limits.maxBots, accounts: limits.maxTwitterAccounts })}</p>
        <Link href="/billing" className="inline-flex shrink-0 items-center gap-1 font-semibold text-[#1d9bf0] hover:text-[#8ecdf8]">
          {t("oafBots.planHintCta")}
          <ArrowRight className="size-4" />
        </Link>
      </div>

      <BotMatrixPanel
        t={t}
        rows={matrixRows}
        summary={matrixSummary}
        loading={matrixLoading || relationshipLoading}
        enabled={limits.multiBotMatrix}
        selectedID={selectedID}
        onSelect={selectBot}
      />

      {!canCreate ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100">
          <Lock className="size-4" />
          {t("oafBots.limitReached")}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)]">
        <SectionCard title={t("oafBots.list.title")} description={t("oafBots.list.description")} className="bg-black p-4 md:p-5">
          <div className="space-y-2">
            {bots.length === 0 ? (
              <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
                <div className="flex size-10 items-center justify-center rounded-full border border-[#2f3336] bg-[#1d9bf0]/10 text-[#1d9bf0]">
                  <Bot className="size-5" />
                </div>
                <p className="mt-3 text-sm font-semibold text-[#e7e9ea]">{t("oafBots.list.emptyTitle")}</p>
                <p className="mt-2 text-sm leading-relaxed text-[#71767b]">{t("oafBots.list.emptyDescription")}</p>
                <div className="mt-4">
                  {accounts.length === 0 ? (
                    <Link href="/accounts" className="inline-flex">
                      <Button type="button" size="sm" variant="outline">
                        <WalletCards className="size-4" />
                        {t("oafBots.list.bindAccountCta")}
                      </Button>
                    </Link>
                  ) : (
                    <Button type="button" size="sm" onClick={startCreate}>
                      <Sparkles className="size-4" />
                      {t("oafBots.list.createFirstCta")}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="mb-3 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3">
                  <p className="text-sm font-semibold text-[#e7e9ea]">{t("oafBots.list.configuredOverview")}</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <ListStat label={t("oafBots.list.totalBots")} value={bots.length} />
                    <ListStat label={t("oafBots.list.boundBots")} value={botListStats.bound} />
                    <ListStat label={t("oafBots.list.readyBots")} value={botListStats.ready} />
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-[#71767b]">{t("oafBots.list.configuredHint")}</p>
                </div>
                {bots.map((bot) => {
                  const account = bot.twitter_account_id ? accountByID.get(bot.twitter_account_id) : null;
                  const botCompletion = calculatePersonaCompleteness(botToPayload(bot, defaultPrimaryLanguage));
                  const ready = botCompletion >= 60;
                  const selected = selectedID === bot.id;
                  const selectedUsageTotal = selected ? selectedMonthlyUsageTotal : null;
                  return (
                    <button
                      key={bot.id}
                      type="button"
                      onClick={() => selectBot(bot)}
                      className={`w-full rounded-xl border p-3.5 text-left transition ${
                        selected ? "border-[#1d9bf0]/50 bg-[#1d9bf0]/10" : "border-[#2f3336] bg-[#0f1419] hover:bg-[#16181c]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[#e7e9ea]">{bot.name}</p>
                          <p className="mt-1 truncate text-xs text-[#71767b]">
                            {account ? `@${account.username}` : t("oafBots.list.unbound")}
                          </p>
                        </div>
                        <ChevronRight className="mt-1 size-4 shrink-0 text-[#71767b]" />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <BotStatusPill tone={account ? "success" : "warning"} label={account ? t("oafBots.list.status.bound") : t("oafBots.list.status.unbound")} />
                        <BotStatusPill tone={ready ? "success" : "warning"} label={ready ? t("oafBots.list.status.ready") : t("oafBots.list.status.needsSetup")} />
                        <BotStatusPill tone="neutral" label={t("oafBots.list.status.completeness", { percent: botCompletion })} />
                      </div>
                      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-[#e7e9ea]/72">
                        {bot.identity_summary || t("oafBots.list.noSummary")}
                      </p>
                      <div className="mt-3 rounded-xl border border-[#2f3336] bg-black/40 px-3 py-2 text-xs text-[#71767b]">
                        {selectedUsageTotal === null
                          ? t("oafBots.list.usageSelectHint")
                          : t("oafBots.list.usageCurrentMonth", { count: selectedUsageTotal })}
                      </div>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </SectionCard>

        <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
          <SectionCard
            title={selectedBot ? t("oafBots.form.editTitle") : t("oafBots.form.createTitle")}
            description={t("oafBots.form.description")}
          >
            <div className="mb-5 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-[#71767b]">{t("oafBots.wizard.progress", { current: activeStepIndex + 1, total: wizardStepOrder.length })}</p>
                  <h2 className="mt-1 text-base font-bold text-[#e7e9ea] md:text-lg">{activeStepMeta?.label}</h2>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#71767b]">{t(`oafBots.wizard.goal.${activeStep}`)}</p>
                </div>
                <span className="rounded-full border border-[#2f3336] bg-black px-3 py-1 text-xs text-[#71767b]">
                  {Math.round(((activeStepIndex + 1) / wizardStepOrder.length) * 100)}%
                </span>
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#2f3336]">
                <div
                  className="h-full rounded-full bg-[#1d9bf0] transition-all"
                  style={{ width: `${((activeStepIndex + 1) / wizardStepOrder.length) * 100}%` }}
                />
              </div>
              <div className="-mx-1 mt-4 overflow-x-auto px-1 pb-1">
                <div className="flex min-w-max gap-2">
                  {wizardSteps.map((step, index) => {
                    const completed = stepCompletion[step.id];
                    const active = activeStep === step.id;
                    return (
                      <button
                        key={step.id}
                        type="button"
                        onClick={() => setActiveStep(step.id)}
                        className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${
                          active
                            ? "border-[#1d9bf0]/55 bg-[#1d9bf0]/12 text-[#e7e9ea]"
                            : completed
                              ? "border-emerald-300/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/14"
                              : "border-[#2f3336] bg-black text-[#71767b] hover:bg-[#16181c]"
                        }`}
                      >
                        {completed ? <CheckCircle2 className="size-3.5 shrink-0" /> : <span className="size-1.5 shrink-0 rounded-full bg-current opacity-60" />}
                        <span className="whitespace-nowrap">{step.label}</span>
                        <span className="text-xs opacity-50">{index + 1}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {activeStep === "identity" ? (
              <WizardPanel title={t("oafBots.section.identity")} description={t("oafBots.section.identityDesc")}>
                <div className="grid gap-4 md:grid-cols-2">
                  <TextField
                    label={t("oafBots.fields.name")}
                    value={form.name}
                    onChange={(value) => updateForm("name", value)}
                    placeholder={t("oafBots.placeholders.name")}
                    helper={t("oafBots.helpers.name")}
                    recommended
                  />
                  <AccountSelect
                    label={t("oafBots.fields.twitterAccount")}
                    helper={t("oafBots.helpers.twitterAccount")}
                    accounts={accounts}
                    value={form.twitter_account_id}
                    boundByOtherBot={accountBoundByOtherBot}
                    onChange={(value) => updateForm("twitter_account_id", value)}
                    noneLabel={t("oafBots.account.none")}
                    connectedLabel={t("oafBots.account.connected")}
                    boundLabel={t("oafBots.account.bound")}
                  />
                  <SingleChipField
                    label={t("oafBots.fields.occupation")}
                    value={form.occupation}
                    onChange={(value) => updateForm("occupation", value)}
                    placeholder={t("oafBots.placeholders.occupation")}
                    helper={t("oafBots.helpers.occupation")}
                    options={occupationOptions}
                  />
                  <TagPicker
                    label={t("oafBots.fields.industry")}
                    values={splitMultiValue(form.industry)}
                    onChange={(values) => updateForm("industry", joinMultiValues(values))}
                    placeholder={t("oafBots.placeholders.industry")}
                    helper={t("oafBots.helpers.industry")}
                    options={industryOptions}
                    maxValues={5}
                    limitText={t("oafBots.industry.maxHint")}
                  />
                  <details className="md:col-span-2 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                    <summary className="cursor-pointer text-sm font-medium text-white">{t("oafBots.advancedIdentity.title")}</summary>
                    <p className="mt-2 text-xs leading-relaxed text-white/45">{t("oafBots.advancedIdentity.description")}</p>
                    <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <SelectField
                    label={t("oafBots.fields.ageRange")}
                    value={form.age_range}
                    onChange={(value) => updateForm("age_range", value)}
                    options={ageOptions}
                    helper={t("oafBots.helpers.ageRange")}
                  />
                  <SelectField
                    label={t("oafBots.fields.gender")}
                    value={form.gender}
                    onChange={(value) => updateForm("gender", value)}
                    options={genderOptions}
                    helper={t("oafBots.helpers.gender")}
                  />
                  <SelectField
                    label={t("oafBots.fields.education")}
                    value={form.education}
                    onChange={(value) => updateForm("education", value)}
                    options={educationOptions}
                    helper={t("oafBots.helpers.education")}
                  />
                    </div>
                  </details>
                </div>
              </WizardPanel>
            ) : null}

            {activeStep === "brand" ? (
              <WizardPanel title={t("oafBots.section.brand")} description={t("oafBots.section.brandDesc")}>
                <div className="grid gap-4 md:grid-cols-2">
                  <TextArea
                    label={t("oafBots.fields.projectOneLiner")}
                    value={form.project_one_liner}
                    onChange={(value) => updateForm("project_one_liner", value)}
                    placeholder={t("oafBots.placeholders.projectOneLiner")}
                    helper={t("oafBots.helpers.projectOneLiner")}
                    recommended
                  />
                  <TextArea
                    label={t("oafBots.fields.targetAudience")}
                    value={form.target_audience}
                    onChange={(value) => updateForm("target_audience", value)}
                    placeholder={t("oafBots.placeholders.targetAudience")}
                    helper={t("oafBots.helpers.targetAudience")}
                    recommended
                  />
                  <TextArea
                    label={t("oafBots.fields.coreValueProps")}
                    value={form.core_value_props}
                    onChange={(value) => updateForm("core_value_props", value)}
                    placeholder={t("oafBots.placeholders.coreValueProps")}
                    helper={t("oafBots.helpers.coreValueProps")}
                    recommended
                  />
                  <TextArea
                    label={t("oafBots.fields.productFeatures")}
                    value={form.product_features}
                    onChange={(value) => updateForm("product_features", value)}
                    placeholder={t("oafBots.placeholders.productFeatures")}
                    helper={t("oafBots.helpers.productFeatures")}
                  />
                  <div className="md:col-span-2">
                    <TextArea
                      label={t("oafBots.fields.differentiators")}
                      value={form.differentiators}
                      onChange={(value) => updateForm("differentiators", value)}
                      placeholder={t("oafBots.placeholders.differentiators")}
                      helper={t("oafBots.helpers.differentiators")}
                    />
                  </div>
                </div>
              </WizardPanel>
            ) : null}

            {activeStep === "style" ? (
              <WizardPanel title={t("oafBots.section.style")} description={t("oafBots.section.styleDesc")}>
                <LanguageConfigPanel
                  t={t}
                  primaryLanguage={form.primary_language || defaultPrimaryLanguage}
                  languageStrategy={form.language_strategy || "follow_context"}
                  defaultPrimaryLanguage={defaultPrimaryLanguage}
                  isDefault={isDefaultLanguageConfig}
                  languageOptions={languageOptions}
                  languageStrategyOptions={languageStrategyOptions}
                  onPrimaryLanguageChange={(value) => updateForm("primary_language", value)}
                  onLanguageStrategyChange={(value) => updateForm("language_strategy", value)}
                />
                <TagPicker
                  label={t("oafBots.fields.personalityTags")}
                  values={form.personality_tags}
                  options={personalityOptions}
                  onChange={(values) => updateForm("personality_tags", values)}
                  helper={t("oafBots.helpers.personalityTags")}
                  placeholder={t("oafBots.placeholders.tagInput")}
                  recommended
                />
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <SelectField
                    label={t("oafBots.fields.mbti")}
                    value={form.mbti}
                    onChange={(value) => updateForm("mbti", value)}
                    options={mbtiOptions}
                    helper={t("oafBots.helpers.mbti")}
                  />
                  <ChipTextArea
                    label={t("oafBots.fields.voiceTone")}
                    value={form.voice_tone}
                    onChange={(value) => updateForm("voice_tone", value)}
                    placeholder={t("oafBots.placeholders.voiceTone")}
                    helper={t("oafBots.helpers.voiceTone")}
                    options={voicePresetOptions}
                    recommended
                  />
                </div>
              </WizardPanel>
            ) : null}

            {activeStep === "topics" ? (
              <WizardPanel title={t("oafBots.section.topics")} description={t("oafBots.section.topicsDesc")}>
                <TagPicker
                  label={t("oafBots.fields.topics")}
                  values={form.topics}
                  options={topicOptions}
                  onChange={(values) => updateForm("topics", values)}
                  helper={t("oafBots.helpers.topics")}
                  placeholder={t("oafBots.placeholders.tagInput")}
                  recommended
                />
                <SafetyRulesPanel
                  t={t}
                  safetyMode={form.safety_mode}
                  forbiddenTopics={form.forbidden_topics}
                  avoidClaims={form.avoid_claims}
                  complianceNotes={form.compliance_notes}
                  safetyOptions={safetyOptions}
                  forbiddenTopicOptions={forbiddenTopicOptions}
                  avoidClaimOptions={avoidClaimOptions}
                  onSafetyModeChange={(value) => updateForm("safety_mode", value)}
                  onForbiddenTopicsChange={(values) => updateForm("forbidden_topics", values)}
                  onAvoidClaimsChange={(values) => updateForm("avoid_claims", values)}
                  onComplianceNotesChange={(value) => updateForm("compliance_notes", value)}
                />
              </WizardPanel>
            ) : null}

            {activeStep === "goals" ? (
              <WizardPanel title={t("oafBots.section.goals")} description={t("oafBots.section.goalsDesc")}>
                <div className="grid gap-4 md:grid-cols-2">
                  <TextArea
                    label={t("oafBots.fields.identitySummary")}
                    value={form.identity_summary}
                    onChange={(value) => updateForm("identity_summary", value)}
                    placeholder={t("oafBots.placeholders.identitySummary")}
                    helper={t("oafBots.helpers.identitySummary")}
                    recommended
                  />
                  <ChipTextArea
                    label={t("oafBots.fields.growthGoal")}
                    value={form.growth_goal}
                    onChange={(value) => updateForm("growth_goal", value)}
                    placeholder={t("oafBots.placeholders.growthGoal")}
                    helper={t("oafBots.helpers.growthGoal")}
                    options={growthGoalOptions}
                    recommended
                  />
                  <TagPicker
                    label={t("oafBots.fields.contentPillars")}
                    values={form.content_pillars}
                    options={contentPillarOptions}
                    onChange={(values) => updateForm("content_pillars", values)}
                    helper={t("oafBots.helpers.contentPillars")}
                    placeholder={t("oafBots.placeholders.tagInput")}
                    recommended
                  />
                  <TextArea
                    label={t("oafBots.fields.contentObjectives")}
                    value={form.content_objectives}
                    onChange={(value) => updateForm("content_objectives", value)}
                    placeholder={t("oafBots.placeholders.contentObjectives")}
                    helper={t("oafBots.helpers.contentObjectives")}
                  />
                  <ChipTextArea
                    label={t("oafBots.fields.preferredCTA")}
                    value={form.preferred_cta}
                    onChange={(value) => updateForm("preferred_cta", value)}
                    placeholder={t("oafBots.placeholders.preferredCTA")}
                    helper={t("oafBots.helpers.preferredCTA")}
                    options={growthGoalOptions}
                  />
                  <TagPicker
                    label={t("oafBots.fields.hashtags")}
                    values={form.hashtags}
                    options={hashtagOptions}
                    onChange={(values) => updateForm("hashtags", values)}
                    helper={t("oafBots.helpers.hashtags")}
                    placeholder={t("oafBots.placeholders.tagInput")}
                  />
                  <TagPicker
                    label={t("oafBots.fields.keywords")}
                    values={form.keywords}
                    options={keywordOptions}
                    onChange={(values) => updateForm("keywords", values)}
                    helper={t("oafBots.helpers.keywords")}
                    placeholder={t("oafBots.placeholders.tagInput")}
                  />
                </div>
              </WizardPanel>
            ) : null}

            {activeStep === "test" ? (
              <WizardPanel title={t("oafBots.section.test")} description={t("oafBots.section.testDesc")}>
                <SamplePanel
                  t={t}
                  samples={samples}
                  scene={sampleScene}
                  onSceneChange={handleSampleSceneChange}
                  sampleContext={sampleContexts[sampleScene] || ""}
                  onSampleContextChange={(value) => setSampleContexts((prev) => ({ ...prev, [sampleScene]: value }))}
                  generating={generating}
                  onGenerate={testGenerate}
                  selectedID={selectedID}
                  formChanged={formChanged}
                  previewDisabled={!canTestBot}
                  form={form}
                  account={form.twitter_account_id ? accountByID.get(form.twitter_account_id) : undefined}
                  occupationOptions={occupationOptions}
                  industryOptions={industryOptions}
                  safetyOptions={safetyOptions}
                  languageOptions={languageOptions}
                  languageStrategyOptions={languageStrategyOptions}
                  feedbackItems={generationFeedback}
                  feedbackLoading={feedbackLoading}
                  feedbackDraft={feedbackDraft}
                  feedbackSaving={feedbackSaving}
                  feedbackIssueOptions={feedbackIssueOptions}
                  onFeedbackDraftChange={setFeedbackDraft}
                  onFeedbackSubmit={submitGenerationFeedback}
                />
              </WizardPanel>
            ) : null}

            {selectedAccountConflict ? (
              <div className="mt-5 rounded-xl border border-amber-300/25 bg-amber-400/10 p-4 text-sm leading-relaxed text-amber-100">
                <div className="flex gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <p>{t("oafBots.account.conflict", { name: selectedAccountConflict.name })}</p>
                </div>
              </div>
            ) : null}

            {formChanged && selectedID ? (
              <div className="mt-5 rounded-xl border border-blue-300/20 bg-blue-400/10 p-4 text-sm leading-relaxed text-blue-100">
                <div className="flex gap-2">
                  <Info className="mt-0.5 size-4 shrink-0" />
                  <p>{t("oafBots.test.unsavedHint")}</p>
                </div>
              </div>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => goStep("previous")} disabled={activeStepIndex === 0}>
                  <ArrowLeft className="size-4" />
                  {t("oafBots.actions.previous")}
                </Button>
                <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => goStep("next")} disabled={activeStepIndex === wizardStepOrder.length - 1}>
                  {t("oafBots.actions.next")}
                  <ArrowRight className="size-4" />
                </Button>
              </div>
              <div className="grid gap-2 sm:flex sm:flex-wrap sm:justify-end">
                <div className="grid grid-cols-2 gap-1 rounded-full border border-[#2f3336] bg-black p-1">
                  {profileAssistModes.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={profileAssistMode === mode}
                      onClick={() => setProfileAssistMode(mode)}
                      className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                        profileAssistMode === mode ? "bg-[#1d9bf0] text-white" : "text-[#71767b] hover:bg-[#16181c] hover:text-[#e7e9ea]"
                      }`}
                      title={t(`oafBots.completeProfile.mode.${mode}.helper`)}
                    >
                      {t(`oafBots.completeProfile.mode.${mode}`)}
                    </button>
                  ))}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={completeProfile}
                  disabled={completingProfile || saving || generating}
                  className="w-full sm:w-auto"
                >
                  <Sparkles className="size-4" />
                  {completingProfile ? t("oafBots.completeProfile.loading") : t("oafBots.completeProfile.action")}
                </Button>
                <Button
                  type="button"
                  variant={activeStep === "test" ? "default" : "outline"}
                  onClick={activeStep === "test" ? testGenerate : goTestStep}
                  disabled={generating || !canTestBot}
                  className="w-full sm:w-auto"
                >
                  <Sparkles className="size-4" />
                  {generating ? t("oafBots.actions.generating") : t("oafBots.actions.testBot")}
                </Button>
                <Button
                  type="button"
                  onClick={save}
                  disabled={saving || Boolean(selectedAccountConflict) || (!selectedID && !canCreate)}
                  className="w-full sm:w-auto"
                >
                  <Save className="size-4" />
                  {saving ? t("oafBots.actions.saving") : t("oafBots.actions.save")}
                </Button>
              </div>
            </div>
          </SectionCard>

          <div className="space-y-5">
            <BotRelationshipCard
              t={t}
              bot={selectedBot}
              account={selectedAccount}
              automationStates={selectedAutomationStates}
              autoPostPlan={selectedPostPlan}
              activeContentCount={selectedActiveContentItems.length}
              totalContentCount={selectedCompatibleContentItems.length}
              autoPostReadiness={selectedAutoPostReadiness}
              queueItems={selectedQueueItems}
              queueSummary={selectedQueueSummary}
              loading={relationshipLoading}
            />
            <BotPreview
              t={t}
              form={form}
              account={form.twitter_account_id ? accountByID.get(form.twitter_account_id) : undefined}
              completion={personaCompleteness}
              checklist={personaChecklist}
              qualityDiagnostics={qualityDiagnostics}
              selectedID={selectedID}
              formChanged={formChanged}
              generating={generating}
              onTest={handlePreviewTest}
              canTest={canTestBot}
              occupationOptions={occupationOptions}
              industryOptions={industryOptions}
              languageOptions={languageOptions}
              languageStrategyOptions={languageStrategyOptions}
              defaultPrimaryLanguage={defaultPrimaryLanguage}
              isDefaultLanguageConfig={isDefaultLanguageConfig}
            />
            <GenerationUsageCard
              t={t}
              selectedID={selectedID}
              generationUsages={generationUsages}
              loading={generationUsagesLoading}
              usage={usage}
              limits={limits}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function botToPayload(bot: OAFBot, defaultPrimaryLanguage = "zh-CN"): OAFBotPayload {
  return {
    name: bot.name,
    twitter_account_id: bot.twitter_account_id,
    occupation: bot.occupation,
    industry: bot.industry,
    age_range: bot.age_range,
    gender: bot.gender,
    education: bot.education,
    mbti: bot.mbti,
    personality_tags: bot.personality_tags || [],
    identity_summary: bot.identity_summary,
    voice_tone: bot.voice_tone,
    topics: bot.topics || [],
    forbidden_topics: bot.forbidden_topics || [],
    growth_goal: bot.growth_goal,
    project_one_liner: bot.project_one_liner || "",
    target_audience: bot.target_audience || "",
    core_value_props: bot.core_value_props || "",
    product_features: bot.product_features || "",
    differentiators: bot.differentiators || "",
    content_pillars: bot.content_pillars || [],
    content_objectives: bot.content_objectives || "",
    preferred_cta: bot.preferred_cta || "",
    hashtags: bot.hashtags || [],
    keywords: bot.keywords || [],
    compliance_notes: bot.compliance_notes || "",
    avoid_claims: bot.avoid_claims || [],
    safety_mode: bot.safety_mode || "balanced",
    primary_language: bot.primary_language || defaultPrimaryLanguage,
    language_strategy: bot.language_strategy || "follow_context",
  };
}

function isUnconfiguredDraft(form: OAFBotPayload) {
  return (
    !form.name.trim() &&
    !form.twitter_account_id &&
    !form.occupation.trim() &&
    !form.industry.trim() &&
    !form.age_range.trim() &&
    !form.gender.trim() &&
    !form.education.trim() &&
    !form.mbti.trim() &&
    form.personality_tags.length === 0 &&
    !form.identity_summary.trim() &&
    !form.voice_tone.trim() &&
    form.topics.length === 0 &&
    form.forbidden_topics.length === 0 &&
    !form.growth_goal.trim() &&
    !form.project_one_liner.trim() &&
    !form.target_audience.trim() &&
    !form.core_value_props.trim() &&
    !form.product_features.trim() &&
    !form.differentiators.trim() &&
    form.content_pillars.length === 0 &&
    !form.content_objectives.trim() &&
    !form.preferred_cta.trim() &&
    form.hashtags.length === 0 &&
    form.keywords.length === 0 &&
    !form.compliance_notes.trim() &&
    form.avoid_claims.length === 0 &&
    form.safety_mode === "balanced"
  );
}

function optionKeys(namespace: string, keys: string[], t: (key: string, params?: Record<string, string | number>) => string): ChipOption[] {
  return keys.map((key) => ({
    value: recommendedOptionValues[namespace]?.[key] ?? key,
    label: t(`oafBots.options.${namespace}.${key}`),
  }));
}

function calculatePersonaCompleteness(form: OAFBotPayload) {
  let score = 0;
  if (form.name.trim()) score += 10;
  if (form.twitter_account_id) score += 10;
  if (form.occupation.trim() || form.industry.trim()) score += 10;
  if (form.project_one_liner.trim()) score += 10;
  if (form.target_audience.trim() || form.core_value_props.trim()) score += 10;
  if (form.primary_language.trim() && form.language_strategy.trim()) score += 8;
  if (form.personality_tags.length > 0) score += 8;
  if (form.topics.length > 0) score += 10;
  if (form.content_pillars.length > 0 || form.content_objectives.trim()) score += 8;
  if (form.forbidden_topics.length > 0 || form.avoid_claims.length > 0 || form.compliance_notes.trim()) score += 8;
  if (form.identity_summary.trim()) score += 10;
  if (form.growth_goal.trim()) score += 8;
  return Math.min(score, 100);
}

function getStepCompletion(form: OAFBotPayload, hasSavedBot: boolean): Record<WizardStep, boolean> {
  return {
    identity: Boolean(form.name.trim() && form.twitter_account_id && (form.occupation.trim() || form.industry.trim())),
    brand: Boolean(form.project_one_liner.trim() && (form.target_audience.trim() || form.core_value_props.trim())),
    style: Boolean((form.primary_language.trim() && form.language_strategy.trim()) || form.personality_tags.length > 0 || form.voice_tone.trim() || form.mbti.trim()),
    topics: Boolean(form.topics.length > 0 && form.safety_mode.trim()),
    goals: Boolean(form.identity_summary.trim() && form.growth_goal.trim() && (form.content_pillars.length > 0 || form.content_objectives.trim())),
    test: hasSavedBot,
  };
}

function getPersonaChecklist(form: OAFBotPayload, t: (key: string) => string) {
  const completed = new Set<PersonaChecklistKey>();
  if (form.name.trim()) completed.add("name");
  if (form.twitter_account_id) completed.add("account");
  if (form.occupation.trim() || form.industry.trim()) completed.add("role");
  if (form.project_one_liner.trim() || form.core_value_props.trim()) completed.add("brand");
  if (form.target_audience.trim()) completed.add("audience");
  if (form.primary_language.trim() && form.language_strategy.trim()) completed.add("language");
  if (form.personality_tags.length > 0 || form.voice_tone.trim() || form.mbti.trim()) completed.add("personality");
  if (form.topics.length > 0) completed.add("topics");
  if (form.content_pillars.length > 0 || form.content_objectives.trim() || form.preferred_cta.trim()) completed.add("contentStrategy");
  if (form.forbidden_topics.length > 0 || form.avoid_claims.length > 0 || form.compliance_notes.trim() || form.safety_mode.trim()) completed.add("guardrails");
  if (form.identity_summary.trim()) completed.add("summary");
  if (form.growth_goal.trim()) completed.add("goal");

  const configured = personaChecklistKeys
    .filter((key) => completed.has(key))
    .map((key) => t(`oafBots.checklist.${key}`));
  const missing = personaChecklistKeys
    .filter((key) => !completed.has(key))
    .map((key) => t(`oafBots.checklist.${key}`));
  const nextKey = personaChecklistKeys.find((key) => !completed.has(key)) ?? "test";

  return {
    configured,
    missing,
    nextSuggestion: t(`oafBots.preview.next.${nextKey}`),
  };
}

function getPersonaQualityDiagnostics(form: OAFBotPayload, t: (key: string) => string) {
  const diagnostics: Array<{ tone: "warning" | "info"; message: string }> = [];
  const weakSummary = form.identity_summary.trim().length > 0 && form.identity_summary.trim().length < 40;
  const weakGoal = form.growth_goal.trim().length > 0 && form.growth_goal.trim().length < 30;
  const broadTopics = form.topics.length > 6;
  const missingProductContext = !form.project_one_liner.trim() && !form.core_value_props.trim() && !form.product_features.trim();
  const missingAudience = !form.target_audience.trim();
  const missingGuardrails = form.forbidden_topics.length === 0 && form.avoid_claims.length === 0 && !form.compliance_notes.trim();
  const missingVoice = form.personality_tags.length === 0 && !form.voice_tone.trim();
  const strongCTA = /(buy now|moon|guarantee|guaranteed|airdrop|claim|暴富|稳赚|空投|领取|立即购买)/i.test(form.preferred_cta);

  if (!form.identity_summary.trim()) diagnostics.push({ tone: "warning", message: t("oafBots.quality.missingSummary") });
  else if (weakSummary) diagnostics.push({ tone: "info", message: t("oafBots.quality.weakSummary") });
  if (!form.growth_goal.trim()) diagnostics.push({ tone: "warning", message: t("oafBots.quality.missingGoal") });
  else if (weakGoal) diagnostics.push({ tone: "info", message: t("oafBots.quality.weakGoal") });
  if (missingProductContext) diagnostics.push({ tone: "warning", message: t("oafBots.quality.missingProductContext") });
  if (missingAudience) diagnostics.push({ tone: "info", message: t("oafBots.quality.missingAudience") });
  if (missingVoice) diagnostics.push({ tone: "info", message: t("oafBots.quality.missingVoice") });
  if (broadTopics) diagnostics.push({ tone: "info", message: t("oafBots.quality.tooManyTopics") });
  if (missingGuardrails) diagnostics.push({ tone: "warning", message: t("oafBots.quality.missingGuardrails") });
  if (strongCTA) diagnostics.push({ tone: "warning", message: t("oafBots.quality.strongCTA") });

  return diagnostics.slice(0, 5);
}

function validateBeforeGenerate(form: OAFBotPayload, t: (key: string) => string) {
  if (!form.name.trim()) return t("oafBots.test.needName");
  if (form.topics.length === 0) return t("oafBots.test.needTopic");
  if (!form.identity_summary.trim() && !form.voice_tone.trim()) return t("oafBots.test.needPersona");
  return "";
}

function hasProfileAssistSeed(form: OAFBotPayload) {
  return Boolean(
    form.name.trim() ||
      form.occupation.trim() ||
      form.industry.trim() ||
      form.project_one_liner.trim() ||
      form.target_audience.trim() ||
      form.core_value_props.trim() ||
      form.product_features.trim() ||
      form.topics.length > 0,
  );
}

function splitMultiValue(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function joinMultiValues(values: string[]) {
  return values.map((item) => item.trim()).filter(Boolean).join(",");
}

function summarizeQueue(items: ReviewQueueItemApi[]): QueueSummary {
  return items.reduce<QueueSummary>(
    (summary, item) => {
      summary.total += 1;
      if (item.status === "pending_review") summary.pendingReview += 1;
      if (item.status === "ready_to_publish") summary.readyToPublish += 1;
      if (item.status === "failed") summary.failed += 1;
      if (item.status === "published") summary.published += 1;
      return summary;
    },
    { total: 0, pendingReview: 0, readyToPublish: 0, failed: 0, published: 0 },
  );
}

function contentItemMatchesBot(item: ContentLibraryItemApi, bot: OAFBot) {
  const accountID = bot.twitter_account_id || 0;
  if (item.twitter_account_id && item.twitter_account_id !== accountID) return false;
  if (item.bot_id && item.bot_id !== bot.id) return false;
  return true;
}

function automationHref(type: BotAutomationType) {
  if (type === "post") return "/auto-post";
  if (type === "reply") return "/auto-replies";
  if (type === "comment") return "/auto-comments";
  return "/auto-dms";
}

function getErrorBody(error: unknown): ApiErrorBody | undefined {
  if (!axios.isAxiosError(error)) return undefined;
  return error.response?.data as ApiErrorBody | undefined;
}

function errorMessage(error: unknown, fallback: string) {
  return getErrorBody(error)?.message || fallback;
}

function QuotaCard({ label, used, limit }: { label: string; used: number; limit: number }) {
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
      <p className="text-xs text-[#71767b]">{label}</p>
      <p className="mt-2 text-lg font-bold text-[#e7e9ea]">{used}<span className="text-sm font-normal text-[#71767b]"> / {limit}</span></p>
    </div>
  );
}

function ListStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-black px-2.5 py-2">
      <p className="text-[11px] text-[#71767b]">{label}</p>
      <p className="mt-1 text-base font-bold text-[#e7e9ea]">{value}</p>
    </div>
  );
}

function BotStatusPill({ tone, label }: { tone: "success" | "warning" | "neutral"; label: string }) {
  const toneClass =
    tone === "success"
      ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
      : tone === "warning"
        ? "border-amber-300/20 bg-amber-400/10 text-amber-100"
        : "border-[#2f3336] bg-black text-[#71767b]";
  return <span className={`rounded-full border px-2.5 py-1 text-[11px] leading-none ${toneClass}`}>{label}</span>;
}

function BotMatrixPanel({
  t,
  rows,
  summary,
  loading,
  enabled,
  selectedID,
  onSelect,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  rows: BotMatrixRow[];
  summary: { bound: number; ready: number; review: number; usage: number; negativeFeedback: number };
  loading: boolean;
  enabled: boolean;
  selectedID: number | null;
  onSelect: (bot: OAFBot) => void;
}) {
  return (
    <SectionCard title={t("oafBots.matrix.title")} description={t("oafBots.matrix.description")} className="bg-black p-4 md:p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="grid gap-2 sm:grid-cols-5 lg:min-w-[720px]">
            <MatrixMetric label={t("oafBots.matrix.totalBots")} value={rows.length} />
            <MatrixMetric label={t("oafBots.matrix.boundBots")} value={summary.bound} />
            <MatrixMetric label={t("oafBots.matrix.readyBots")} value={summary.ready} />
            <MatrixMetric label={t("oafBots.matrix.pendingReview")} value={summary.review} />
            <MatrixMetric label={t("oafBots.matrix.aiUsage")} value={summary.usage} />
          </div>
          <div className={`rounded-2xl border p-3 text-sm leading-6 ${enabled ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100" : "border-amber-300/20 bg-amber-400/10 text-amber-100"}`}>
            <div className="flex items-start gap-2">
              {enabled ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <Lock className="mt-0.5 size-4 shrink-0" />}
              <div>
                <p className="font-semibold">{enabled ? t("oafBots.matrix.enabledTitle") : t("oafBots.matrix.lockedTitle")}</p>
                <p className="text-xs opacity-80">{enabled ? t("oafBots.matrix.enabledDescription") : t("oafBots.matrix.lockedDescription")}</p>
              </div>
            </div>
          </div>
        </div>

        {loading ? <p className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3 text-sm text-[#71767b]">{t("oafBots.matrix.loading")}</p> : null}

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#2f3336] bg-[#0f1419] p-5 text-sm leading-6 text-[#71767b]">
            {t("oafBots.matrix.empty")}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[#2f3336]">
            <table className="min-w-[980px] w-full text-left text-sm">
              <thead className="bg-[#0f1419] text-xs uppercase text-[#71767b]">
                <tr>
                  <th className="px-4 py-3 font-medium">{t("oafBots.matrix.columns.bot")}</th>
                  <th className="px-4 py-3 font-medium">{t("oafBots.matrix.columns.account")}</th>
                  <th className="px-4 py-3 font-medium">{t("oafBots.matrix.columns.persona")}</th>
                  <th className="px-4 py-3 font-medium">{t("oafBots.matrix.columns.autoPost")}</th>
                  <th className="px-4 py-3 font-medium">{t("oafBots.matrix.columns.queue")}</th>
                  <th className="px-4 py-3 font-medium">{t("oafBots.matrix.columns.signals")}</th>
                  <th className="px-4 py-3 font-medium">{t("oafBots.matrix.columns.action")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2f3336]">
                {rows.map((row) => {
                  const selected = selectedID === row.bot.id;
                  return (
                    <tr key={row.bot.id} className={selected ? "bg-[#1d9bf0]/8" : "bg-black"}>
                      <td className="px-4 py-3 align-top">
                        <p className="max-w-56 truncate font-semibold text-[#e7e9ea]">{row.bot.name || t("oafBots.preview.unnamed")}</p>
                        <p className="mt-1 text-xs text-[#71767b]">{row.bot.primary_language || "zh-CN"} · {row.bot.language_strategy || "follow_context"}</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        {row.account ? (
                          <BotStatusPill tone="success" label={`@${row.account.username}`} />
                        ) : (
                          <BotStatusPill tone="warning" label={t("oafBots.matrix.unbound")} />
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-[#2f3336]">
                            <div className={`h-full ${row.completion >= 80 ? "bg-emerald-300" : row.completion >= 60 ? "bg-[#1d9bf0]" : "bg-amber-300"}`} style={{ width: `${row.completion}%` }} />
                          </div>
                          <span className="text-xs text-[#e7e9ea]">{row.completion}%</span>
                        </div>
                        <p className="mt-1 max-w-48 truncate text-xs text-[#71767b]">{row.bot.topics.slice(0, 3).join(" / ") || t("oafBots.matrix.noTopics")}</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <BotStatusPill tone={row.autoPostReady ? "success" : "warning"} label={row.autoPostReady ? t("oafBots.matrix.ready") : t("oafBots.matrix.needsSetup")} />
                        <p className="mt-1 text-xs text-[#71767b]">{t("oafBots.matrix.contentCount", { count: row.activeContentCount })}</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="text-xs text-[#e7e9ea]">{t("oafBots.matrix.queueValue", { review: row.queueSummary.pendingReview, ready: row.queueSummary.readyToPublish })}</p>
                        <p className="mt-1 text-xs text-[#71767b]">{t("oafBots.matrix.failedValue", { count: row.queueSummary.failed })}</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="text-xs text-[#e7e9ea]">{t("oafBots.matrix.usageValue", { count: row.monthlyUsage })}</p>
                        <p className={`mt-1 text-xs ${row.negativeFeedback > 0 ? "text-amber-100" : "text-[#71767b]"}`}>
                          {t("oafBots.matrix.negativeFeedback", { count: row.negativeFeedback })}
                        </p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <button type="button" onClick={() => onSelect(row.bot)} className="rounded-full border border-[#2f3336] px-3 py-1.5 text-xs font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
                          {selected ? t("oafBots.matrix.selected") : t("oafBots.matrix.inspect")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function MatrixMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
      <p className="text-xs text-[#71767b]">{label}</p>
      <p className="mt-1 text-lg font-bold text-[#e7e9ea]">{value}</p>
    </div>
  );
}

function BotRelationshipCard({
  t,
  bot,
  account,
  automationStates,
  autoPostPlan,
  activeContentCount,
  totalContentCount,
  autoPostReadiness,
  queueItems,
  queueSummary,
  loading,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  bot: OAFBot | null;
  account?: AccountListItem;
  automationStates: BotAutomationState[];
  autoPostPlan?: AutoPostPlanApi;
  activeContentCount: number;
  totalContentCount: number;
  autoPostReadiness: AutoPostReadinessStep[];
  queueItems: ReviewQueueItemApi[];
  queueSummary: QueueSummary;
  loading: boolean;
}) {
  const recentItems = queueItems.slice(0, 3);
  const enabledAutomationCount = automationStates.filter((item) => item.enabled).length;
  const autoPostReady = autoPostReadiness.length > 0 && autoPostReadiness.every((item) => item.ready);

  return (
    <SectionCard title={t("oafBots.relationship.title")} description={t("oafBots.relationship.description")} className="bg-black p-4 md:p-5">
      {!bot ? (
        <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-amber-300/20 bg-amber-400/10 text-amber-100">
              <Info className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#e7e9ea]">{t("oafBots.relationship.draftTitle")}</p>
              <p className="mt-1 text-sm leading-relaxed text-[#71767b]">{t("oafBots.relationship.draftDescription")}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#1d9bf0]">
                  <Bot className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-[#71767b]">{t("oafBots.relationship.currentBot")}</p>
                  <p className="mt-1 truncate text-sm font-semibold text-[#e7e9ea]">{bot.name}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#71767b]">
                    {account
                      ? t("oafBots.relationship.accountBoundDescription", { account: `@${account.username}` })
                      : t("oafBots.relationship.accountMissingDescription")}
                  </p>
                </div>
              </div>
              <Link href="/accounts" className="shrink-0 text-xs font-semibold text-[#1d9bf0] hover:text-[#8ecdf8]">
                {account ? t("oafBots.relationship.manageAccount") : t("oafBots.relationship.bindAccount")}
              </Link>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <RelationshipMetric
                icon={<WalletCards className="size-4" />}
                label={t("oafBots.relationship.boundAccount")}
                value={account ? `@${account.username}` : t("oafBots.relationship.noAccount")}
                tone={account ? "success" : "warning"}
              />
              <RelationshipMetric
                icon={<Workflow className="size-4" />}
                label={t("oafBots.relationship.enabledAutomations")}
                value={t("oafBots.relationship.enabledAutomationsValue", { count: enabledAutomationCount })}
                tone={enabledAutomationCount > 0 ? "success" : "neutral"}
              />
              <RelationshipMetric
                icon={<ListChecks className="size-4" />}
                label={t("oafBots.relationship.queueItems")}
                value={t("oafBots.relationship.queueItemsValue", { count: queueSummary.total })}
                tone={queueSummary.failed > 0 ? "warning" : queueSummary.total > 0 ? "info" : "neutral"}
              />
            </div>
            {account ? (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#2f3336] bg-black px-3 py-1 text-xs text-[#71767b]">
                <span className="size-1.5 rounded-full bg-[#1d9bf0]" />
                {t("oafBots.relationship.accountStatus", { status: t(accountStatusKey(account.status)) })}
              </div>
            ) : null}
          </div>

          <div className={`rounded-2xl border p-4 ${autoPostReady ? "border-emerald-300/20 bg-emerald-400/10" : "border-amber-300/20 bg-amber-400/10"}`}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#e7e9ea]">
                  {autoPostReady ? t("oafBots.relationship.autoPostReadyTitle") : t("oafBots.relationship.autoPostNeedsSetupTitle")}
                </p>
                <p className="mt-1 text-xs leading-5 text-[#71767b]">
                  {autoPostReady ? t("oafBots.relationship.autoPostReadyDescription") : t("oafBots.relationship.autoPostNeedsSetupDescription")}
                </p>
              </div>
              <Link href={account ? `/auto-post?panel=content&account=${account.id}` : "/auto-post"} className="shrink-0 text-xs font-semibold text-[#1d9bf0] hover:text-[#8ecdf8]">
                {t("oafBots.relationship.openAutoPost")}
              </Link>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <AutoPostReadinessTile
                title={t("oafBots.relationship.readiness.account")}
                description={account ? `@${account.username}` : t("oafBots.relationship.readiness.accountMissing")}
                ready={Boolean(account)}
                href="/accounts"
                action={account ? t("oafBots.relationship.readiness.manage") : t("oafBots.relationship.readiness.fix")}
              />
              <AutoPostReadinessTile
                title={t("oafBots.relationship.readiness.content")}
                description={t("oafBots.relationship.readiness.contentValue", { active: activeContentCount, total: totalContentCount })}
                ready={activeContentCount > 0}
                href={account ? `/auto-post?panel=content&account=${account.id}` : "/auto-post?panel=content"}
                action={activeContentCount > 0 ? t("oafBots.relationship.readiness.manage") : t("oafBots.relationship.readiness.fix")}
              />
              <AutoPostReadinessTile
                title={t("oafBots.relationship.readiness.planner")}
                description={autoPostPlan?.enabled ? t("oafBots.relationship.readiness.plannerEnabled") : t("oafBots.relationship.readiness.plannerMissing")}
                ready={Boolean(autoPostPlan?.enabled)}
                href={account ? `/auto-post?panel=planner&account=${account.id}` : "/auto-post?panel=planner"}
                action={autoPostPlan?.enabled ? t("oafBots.relationship.readiness.manage") : t("oafBots.relationship.readiness.fix")}
              />
              <AutoPostReadinessTile
                title={t("oafBots.relationship.readiness.autopilot")}
                description={t(`executionQueue.executionMode.${autoPostPlan?.execution_mode || "review"}`)}
                ready={autoPostPlan?.execution_mode === "autopilot"}
                href={account ? `/auto-post?panel=planner&account=${account.id}` : "/auto-post?panel=planner"}
                action={autoPostPlan?.execution_mode === "autopilot" ? t("oafBots.relationship.readiness.manage") : t("oafBots.relationship.readiness.fix")}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#e7e9ea]">{t("oafBots.relationship.automationTitle")}</p>
                <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("oafBots.relationship.automationDescription")}</p>
              </div>
              <Rocket className="size-5 shrink-0 text-[#1d9bf0]" />
            </div>
            {loading ? (
              <p className="rounded-xl border border-[#2f3336] bg-black p-3 text-sm text-[#71767b]">{t("oafBots.relationship.loading")}</p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {automationStates.map((item) => (
                  <BotAutomationTile key={item.type} item={item} t={t} />
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#e7e9ea]">{t("oafBots.relationship.queueTitle")}</p>
                <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("oafBots.relationship.queueDescription")}</p>
              </div>
              <Link href="/execution-queue" className="shrink-0 text-xs font-semibold text-[#1d9bf0] hover:text-[#8ecdf8]">
                {t("oafBots.relationship.openQueue")}
              </Link>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <QueueMiniMetric label={t("oafBots.relationship.pendingReview")} value={queueSummary.pendingReview} />
              <QueueMiniMetric label={t("oafBots.relationship.readyToPublish")} value={queueSummary.readyToPublish} />
              <QueueMiniMetric label={t("oafBots.relationship.failed")} value={queueSummary.failed} tone={queueSummary.failed > 0 ? "warning" : "default"} />
              <QueueMiniMetric label={t("oafBots.relationship.published")} value={queueSummary.published} />
            </div>
            <div className="mt-3 space-y-2">
              {recentItems.length === 0 ? (
                <p className="rounded-xl border border-[#2f3336] bg-black p-3 text-sm leading-relaxed text-[#71767b]">{t("oafBots.relationship.queueEmpty")}</p>
              ) : (
                recentItems.map((item) => <QueuePreviewLine key={`${item.type}-${item.id}`} item={item} t={t} />)
              )}
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function RelationshipMetric({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "success" | "warning" | "info" | "neutral";
}) {
  const toneClass = {
    success: "border-emerald-300/20 bg-emerald-400/10 text-emerald-100",
    warning: "border-amber-300/20 bg-amber-400/10 text-amber-100",
    info: "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-blue-100",
    neutral: "border-[#2f3336] bg-black text-[#71767b]",
  }[tone];
  return (
    <div className="min-w-0 rounded-xl border border-[#2f3336] bg-black p-3">
      <div className="mb-2 flex items-center gap-2 text-xs text-[#71767b]">
        <span className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full border ${toneClass}`}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <p className="truncate text-sm font-semibold text-[#e7e9ea]">{value}</p>
    </div>
  );
}

function AutoPostReadinessTile({
  title,
  description,
  ready,
  href,
  action,
}: {
  title: string;
  description: string;
  ready: boolean;
  href: string;
  action: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-[#2f3336] bg-black p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {ready ? <CheckCircle2 className="size-4 shrink-0 text-emerald-300" /> : <AlertTriangle className="size-4 shrink-0 text-amber-300" />}
            <p className="truncate text-sm font-semibold text-[#e7e9ea]">{title}</p>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#71767b]">{description}</p>
        </div>
        <Link href={href} className="shrink-0 text-xs font-semibold text-[#1d9bf0] hover:text-[#8ecdf8]">
          {action}
        </Link>
      </div>
    </div>
  );
}

function BotAutomationTile({ item, t }: { item: BotAutomationState; t: (key: string, params?: Record<string, string | number>) => string }) {
  const tone = item.enabled
    ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
    : item.configured
      ? "border-[#2f3336] bg-black text-[#71767b]"
      : "border-amber-300/20 bg-amber-400/10 text-amber-100";
  const statusKey = item.enabled ? "accounts.automation.enabled" : item.configured ? "accounts.automation.paused" : "accounts.automation.notConfigured";

  return (
    <Link href={item.href} className={`min-w-0 rounded-2xl border p-3 transition-colors hover:border-[#1d9bf0]/45 ${tone}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#e7e9ea]">{t(`accounts.automation.type.${item.type}`)}</p>
          <p className="mt-1 truncate text-xs text-[#71767b]">{t("accounts.automation.mode", { mode: t(`executionQueue.executionMode.${item.mode}`) })}</p>
        </div>
        <span className="shrink-0 rounded-full border border-current/20 px-2 py-0.5 text-[11px]">{t(statusKey)}</span>
      </div>
    </Link>
  );
}

function QueueMiniMetric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "warning" }) {
  return (
    <div className={`min-w-0 rounded-xl border border-[#2f3336] bg-black px-2 py-2 text-center ${tone === "warning" ? "text-amber-100" : "text-[#e7e9ea]"}`}>
      <p className="text-sm font-semibold">{value}</p>
      <p className="mt-1 truncate text-[11px] text-[#71767b]">{label}</p>
    </div>
  );
}

function QueuePreviewLine({ item, t }: { item: ReviewQueueItemApi; t: (key: string, params?: Record<string, string | number>) => string }) {
  return (
    <Link href={`/execution-queue?type=${item.type}`} className="block rounded-xl border border-[#2f3336] bg-black p-3 transition-colors hover:border-[#1d9bf0]/45">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-semibold text-[#e7e9ea]">{t(`accounts.automation.type.${item.type}`)}</p>
        <span className="shrink-0 rounded-full border border-[#2f3336] px-2 py-0.5 text-[11px] text-[#71767b]">{t(`executionQueue.status.${item.status}`)}</span>
      </div>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#71767b]">{item.target_summary || item.content}</p>
      <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-[#71767b]">
        <Clock3 className="size-3" />
        {formatCompactDate(item.created_at)}
      </p>
    </Link>
  );
}

function accountStatusKey(status: AccountListItem["status"]) {
  if (status === "connected") return "accounts.status.connected";
  if (status === "needs_reauth") return "accounts.status.needsReauth";
  return "accounts.status.disconnected";
}

function formatCompactDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function WizardPanel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-4 md:p-5">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-[#e7e9ea]">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-[#71767b]">{description}</p>
      </div>
      {children}
    </div>
  );
}

function FieldShell({
  label,
  helper,
  recommended,
  children,
}: {
  label: string;
  helper?: string;
  recommended?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5 text-sm text-[#e7e9ea]/78">
      <span className="flex items-center gap-2">
        {label}
        {recommended ? (
          <span className="inline-flex size-5 items-center justify-center rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#1d9bf0]">
            <CheckCircle2 className="size-3" />
          </span>
        ) : null}
      </span>
      {children}
      {helper ? <span className="block text-xs leading-relaxed text-[#71767b]">{helper}</span> : null}
    </label>
  );
}

function LanguageConfigPanel({
  t,
  primaryLanguage,
  languageStrategy,
  defaultPrimaryLanguage,
  isDefault,
  languageOptions,
  languageStrategyOptions,
  onPrimaryLanguageChange,
  onLanguageStrategyChange,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  primaryLanguage: string;
  languageStrategy: string;
  defaultPrimaryLanguage: string;
  isDefault: boolean;
  languageOptions: SelectOption[];
  languageStrategyOptions: SelectOption[];
  onPrimaryLanguageChange: (value: string) => void;
  onLanguageStrategyChange: (value: string) => void;
}) {
  const currentPrimaryLanguage = primaryLanguage || defaultPrimaryLanguage;
  const currentLanguageStrategy = languageStrategy || "follow_context";
  return (
    <div className="mb-5 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[#2f3336] bg-[#1d9bf0]/10 text-[#1d9bf0]">
            <Globe2 className="size-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-[#e7e9ea]">{t("oafBots.languageConfig.title")}</h3>
              {isDefault ? (
                <span className="rounded-full border border-[#2f3336] bg-black px-2 py-0.5 text-[11px] text-[#71767b]">
                  {t("oafBots.languageConfig.defaultBadge")}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[#71767b]">{t("oafBots.languageConfig.description")}</p>
          </div>
        </div>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <SelectField
          label={t("oafBots.fields.primaryLanguage")}
          value={currentPrimaryLanguage}
          onChange={onPrimaryLanguageChange}
          options={languageOptions}
          helper={t("oafBots.helpers.primaryLanguage")}
        />
        <SelectField
          label={t("oafBots.fields.languageStrategy")}
          value={currentLanguageStrategy}
          onChange={onLanguageStrategyChange}
          options={languageStrategyOptions}
          helper={t("oafBots.helpers.languageStrategy")}
        />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-[#2f3336] bg-black p-3">
          <p className="text-xs text-[#71767b]">{t("oafBots.languageConfig.primaryHint")}</p>
          <p className="mt-1 text-sm font-semibold text-[#e7e9ea]">{getSelectLabel(currentPrimaryLanguage, languageOptions)}</p>
        </div>
        <div className="rounded-xl border border-[#2f3336] bg-black p-3">
          <p className="text-xs text-[#71767b]">{t("oafBots.languageConfig.strategyHint")}</p>
          <p className="mt-1 text-sm font-semibold text-[#e7e9ea]">{getSelectLabel(currentLanguageStrategy, languageStrategyOptions)}</p>
          <p className="mt-1 text-xs leading-relaxed text-[#71767b]">{t(`oafBots.languageStrategy.helper.${currentLanguageStrategy}`)}</p>
        </div>
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  helper,
  recommended,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helper?: string;
  recommended?: boolean;
}) {
  return (
    <FieldShell label={label} helper={helper} recommended={recommended}>
      <input className="form-input" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </FieldShell>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
  helper,
  recommended,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  helper?: string;
  recommended?: boolean;
}) {
  return (
    <FieldShell label={label} helper={helper} recommended={recommended}>
      <textarea className="form-input min-h-32 resize-y leading-relaxed" value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </FieldShell>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  helper,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  helper?: string;
}) {
  const hasCurrentValue = value && !options.some((option) => option.value === value);
  return (
    <FieldShell label={label} helper={helper}>
      <select className="form-input" value={value} onChange={(event) => onChange(event.target.value)}>
        {hasCurrentValue ? <option value={value}>{value}</option> : null}
        {options.map((option) => (
          <option key={option.value || "empty"} value={option.value}>{option.label}</option>
        ))}
      </select>
    </FieldShell>
  );
}

function SafetyRulesPanel({
  t,
  safetyMode,
  forbiddenTopics,
  avoidClaims,
  complianceNotes,
  safetyOptions,
  forbiddenTopicOptions,
  avoidClaimOptions,
  onSafetyModeChange,
  onForbiddenTopicsChange,
  onAvoidClaimsChange,
  onComplianceNotesChange,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  safetyMode: string;
  forbiddenTopics: string[];
  avoidClaims: string[];
  complianceNotes: string;
  safetyOptions: SelectOption[];
  forbiddenTopicOptions: ChipOption[];
  avoidClaimOptions: ChipOption[];
  onSafetyModeChange: (value: string) => void;
  onForbiddenTopicsChange: (values: string[]) => void;
  onAvoidClaimsChange: (values: string[]) => void;
  onComplianceNotesChange: (value: string) => void;
}) {
  const selectedSafety = safetyOptions.find((option) => option.value === safetyMode)?.label || safetyMode || t("oafBots.safety.balanced");
  const complianceRuleCount = complianceNotes
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean).length;
  const configuredCount = Number(Boolean(safetyMode)) + Number(forbiddenTopics.length > 0) + Number(avoidClaims.length > 0) + Number(complianceRuleCount > 0);

  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("oafBots.safetyRules.title")}</p>
          <p className="mt-1 text-sm leading-6 text-[#71767b]">{t("oafBots.safetyRules.description")}</p>
        </div>
        <div className="grid shrink-0 grid-cols-3 gap-2 text-center sm:min-w-80">
          <SafetyRuleMetric label={t("oafBots.safetyRules.metricMode")} value={selectedSafety} />
          <SafetyRuleMetric label={t("oafBots.safetyRules.metricHardBlocks")} value={forbiddenTopics.length + avoidClaims.length} />
          <SafetyRuleMetric label={t("oafBots.safetyRules.metricConfigured")} value={`${configuredCount}/4`} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <SelectField
            label={t("oafBots.fields.safetyMode")}
            value={safetyMode}
            onChange={onSafetyModeChange}
            options={safetyOptions}
            helper={t("oafBots.helpers.safetyMode")}
          />
          <div className="grid gap-2">
            {["conservative", "balanced", "autopilot"].map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onSafetyModeChange(mode)}
                className={`rounded-xl border p-3 text-left transition ${
                  safetyMode === mode ? "border-[#1d9bf0]/50 bg-[#1d9bf0]/10" : "border-[#2f3336] bg-black hover:bg-[#16181c]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-[#e7e9ea]">{t(`oafBots.safetyRules.mode.${mode}.title`)}</span>
                  {safetyMode === mode ? <CheckCircle2 className="size-4 text-[#1d9bf0]" /> : null}
                </div>
                <p className="mt-1 text-xs leading-5 text-[#71767b]">{t(`oafBots.safetyRules.mode.${mode}.description`)}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <TagPicker
            label={t("oafBots.fields.forbiddenTopics")}
            values={forbiddenTopics}
            options={forbiddenTopicOptions}
            onChange={onForbiddenTopicsChange}
            helper={t("oafBots.helpers.forbiddenTopics")}
            placeholder={t("oafBots.placeholders.tagInput")}
          />
          <TagPicker
            label={t("oafBots.fields.avoidClaims")}
            values={avoidClaims}
            options={avoidClaimOptions}
            onChange={onAvoidClaimsChange}
            helper={t("oafBots.helpers.avoidClaims")}
            placeholder={t("oafBots.placeholders.tagInput")}
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <TextArea
          label={t("oafBots.fields.complianceNotes")}
          value={complianceNotes}
          onChange={onComplianceNotesChange}
          placeholder={t("oafBots.placeholders.complianceNotesStructured")}
          helper={t("oafBots.helpers.complianceNotesStructured")}
        />
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <div className="mb-3 flex items-center gap-2">
            <Lock className="size-4 text-amber-300" />
            <p className="text-sm font-semibold text-[#e7e9ea]">{t("oafBots.safetyRules.previewTitle")}</p>
          </div>
          <div className="space-y-3">
            <SafetyRulePreviewRow
              ready={forbiddenTopics.length > 0}
              title={t("oafBots.safetyRules.previewForbiddenTitle")}
              description={forbiddenTopics.length > 0 ? forbiddenTopics.map((item) => getChipLabel(item, forbiddenTopicOptions)).join(" / ") : t("oafBots.safetyRules.previewEmpty")}
            />
            <SafetyRulePreviewRow
              ready={avoidClaims.length > 0}
              title={t("oafBots.safetyRules.previewClaimsTitle")}
              description={avoidClaims.length > 0 ? avoidClaims.map((item) => getChipLabel(item, avoidClaimOptions)).join(" / ") : t("oafBots.safetyRules.previewEmpty")}
            />
            <SafetyRulePreviewRow
              ready={complianceRuleCount > 0}
              title={t("oafBots.safetyRules.previewComplianceTitle")}
              description={t("oafBots.safetyRules.previewComplianceValue", { count: complianceRuleCount })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SafetyRuleMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#2f3336] bg-black p-3">
      <p className="truncate text-[11px] text-[#71767b]">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[#e7e9ea]">{value}</p>
    </div>
  );
}

function SafetyRulePreviewRow({ ready, title, description }: { ready: boolean; title: string; description: string }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
      <div className="flex items-center gap-2">
        {ready ? <CheckCircle2 className="size-4 shrink-0 text-emerald-300" /> : <AlertTriangle className="size-4 shrink-0 text-amber-300" />}
        <p className="text-sm font-semibold text-[#e7e9ea]">{title}</p>
      </div>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#71767b]">{description}</p>
    </div>
  );
}

function AccountSelect({
  label,
  helper,
  accounts,
  value,
  boundByOtherBot,
  onChange,
  noneLabel,
  connectedLabel,
  boundLabel,
}: {
  label: string;
  helper?: string;
  accounts: AccountListItem[];
  value: number;
  boundByOtherBot: Map<number, OAFBot>;
  onChange: (value: number) => void;
  noneLabel: string;
  connectedLabel: string;
  boundLabel: string;
}) {
  return (
    <FieldShell label={label} helper={helper} recommended>
      <select className="form-input" value={value || 0} onChange={(event) => onChange(Number(event.target.value))}>
        <option value={0}>{noneLabel}</option>
        {accounts.map((account) => {
          const boundBot = boundByOtherBot.get(account.id);
          return (
            <option key={account.id} value={account.id} disabled={Boolean(boundBot)}>
              @{account.username} · {boundBot ? `${boundLabel}: ${boundBot.name}` : connectedLabel}
            </option>
          );
        })}
      </select>
    </FieldShell>
  );
}

function SingleChipField({
  label,
  value,
  onChange,
  options,
  placeholder,
  helper,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ChipOption[];
  placeholder?: string;
  helper?: string;
}) {
  const selectedLabel = getChipLabel(value, options);
  const hasRecommendedValue = Boolean(value && selectedLabel !== value);
  return (
    <div className="space-y-2">
      <FieldShell label={label} helper={helper}>
        <div className="rounded-2xl border border-[#2f3336] bg-black p-3">
          {hasRecommendedValue ? (
            <button
              type="button"
              onClick={() => onChange("")}
              className="mb-3 rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-3 py-1 text-xs text-[#8ecdf8] hover:bg-[#1d9bf0]/18"
            >
              {selectedLabel} ×
            </button>
          ) : null}
          <input
            className="w-full bg-transparent text-sm text-[#e7e9ea] outline-none placeholder:text-[#71767b]"
            value={hasRecommendedValue ? "" : value}
            placeholder={placeholder}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
      </FieldShell>
      <ChipOptions options={options} onPick={onChange} selected={value ? [value] : []} />
    </div>
  );
}

function ChipTextArea({
  label,
  value,
  onChange,
  options,
  placeholder,
  helper,
  recommended,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ChipOption[];
  placeholder?: string;
  helper?: string;
  recommended?: boolean;
}) {
  return (
    <div className="space-y-2">
      <TextArea label={label} value={value} onChange={onChange} placeholder={placeholder} helper={helper} recommended={recommended} />
      <ChipOptions options={options} onPick={onChange} selected={value ? [value] : []} />
    </div>
  );
}

function TagPicker({
  label,
  values,
  options,
  onChange,
  helper,
  placeholder,
  recommended,
  maxValues,
  limitText,
}: {
  label: string;
  values: string[];
  options: ChipOption[];
  onChange: (values: string[]) => void;
  helper?: string;
  placeholder?: string;
  recommended?: boolean;
  maxValues?: number;
  limitText?: string;
}) {
  const { t } = useT();
  const [input, setInput] = useState("");
  const maxReached = Boolean(maxValues && values.length >= maxValues);
  const addValue = (value: string) => {
    const next = value.trim();
    if (!next || values.includes(next)) return;
    if (maxValues && values.length >= maxValues) return;
    onChange([...values, next]);
    setInput("");
  };
  const removeValue = (value: string) => {
    onChange(values.filter((item) => item !== value));
  };
  return (
    <div className="space-y-2">
      <FieldShell label={label} helper={helper} recommended={recommended}>
        <div className="rounded-2xl border border-[#2f3336] bg-black p-3">
          <div className="flex flex-wrap gap-2">
            {values.length === 0 ? <span className="text-sm text-[#71767b]">{placeholder}</span> : null}
            {values.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => removeValue(value)}
                className="rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-3 py-1 text-xs text-[#8ecdf8] hover:bg-[#1d9bf0]/18"
              >
                {getChipLabel(value, options)} ×
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              className="min-w-0 flex-1 bg-transparent text-sm text-[#e7e9ea] outline-none placeholder:text-[#71767b]"
              value={input}
              placeholder={placeholder}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addValue(input);
                }
              }}
            />
            <button
              type="button"
              disabled={maxReached}
              className="h-9 shrink-0 rounded-full border border-[#2f3336] px-3 text-xs text-[#e7e9ea]/75 hover:bg-[#16181c] disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => addValue(input)}
            >
              {t("oafBots.chips.addCustom")}
            </button>
          </div>
        </div>
      </FieldShell>
      <ChipOptions options={options} onPick={addValue} selected={values} disableUnselected={maxReached} />
      {limitText ? <p className={`text-xs leading-relaxed ${maxReached ? "text-amber-100/80" : "text-[#71767b]"}`}>{limitText}</p> : null}
    </div>
  );
}

function ChipOptions({
  options,
  selected,
  onPick,
  maxInitial = 6,
  disableUnselected,
}: {
  options: ChipOption[];
  selected: string[];
  onPick: (value: string) => void;
  maxInitial?: number;
  disableUnselected?: boolean;
}) {
  const { t } = useT();
  const [expanded, setExpanded] = useState(false);
  const orderedOptions = useMemo(() => {
    return [...options].sort((a, b) => Number(selected.includes(b.value)) - Number(selected.includes(a.value)));
  }, [options, selected]);
  const visibleOptions = expanded ? orderedOptions : orderedOptions.slice(0, maxInitial);
  const hasMore = orderedOptions.length > maxInitial;
  return (
    <div className="flex min-w-0 flex-wrap gap-2">
      {visibleOptions.map((option) => {
        const active = selected.includes(option.value);
        const disabled = Boolean(disableUnselected && !active);
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onPick(option.value)}
            className={`max-w-full rounded-full border px-3 py-1.5 text-left text-xs leading-5 transition [overflow-wrap:anywhere] ${
              active
                ? "border-[#1d9bf0]/55 bg-[#1d9bf0]/14 text-[#e7e9ea]"
                : disabled
                  ? "cursor-not-allowed border-[#2f3336] bg-black text-[#71767b]/45"
                  : "border-[#2f3336] bg-black text-[#71767b] hover:bg-[#16181c] hover:text-[#e7e9ea]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
      {hasMore ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="rounded-full border border-[#2f3336] bg-black px-3 py-1.5 text-xs text-[#71767b] hover:bg-[#16181c] hover:text-[#e7e9ea]"
        >
          {expanded ? t("oafBots.chips.less") : t("oafBots.chips.more")}
        </button>
      ) : null}
    </div>
  );
}

function getChipLabel(value: string, options: ChipOption[]) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function getSelectLabel(value: string, options: SelectOption[]) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function formatFeedbackDate(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function BotPreview({
  t,
  form,
  account,
  completion,
  checklist,
  qualityDiagnostics,
  selectedID,
  formChanged,
  generating,
  onTest,
  canTest,
  occupationOptions,
  industryOptions,
  languageOptions,
  languageStrategyOptions,
  defaultPrimaryLanguage,
  isDefaultLanguageConfig,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  form: OAFBotPayload;
  account?: AccountListItem;
  completion: number;
  checklist: {
    configured: string[];
    missing: string[];
    nextSuggestion: string;
  };
  qualityDiagnostics: Array<{ tone: "warning" | "info"; message: string }>;
  selectedID: number | null;
  formChanged: boolean;
  generating: boolean;
  onTest: () => void;
  canTest: boolean;
  occupationOptions: ChipOption[];
  industryOptions: ChipOption[];
  languageOptions: SelectOption[];
  languageStrategyOptions: SelectOption[];
  defaultPrimaryLanguage: string;
  isDefaultLanguageConfig: boolean;
}) {
  const lowCompletion = completion < 60;
  const readyCompletion = completion >= 80;
  const showDetails = completion >= 30;
  const currentPrimaryLanguage = form.primary_language || defaultPrimaryLanguage;
  const currentLanguageStrategy = form.language_strategy || "follow_context";
  const defaultBadge = isDefaultLanguageConfig ? ` · ${t("oafBots.languageConfig.defaultBadge")}` : "";
  const modeTone = !selectedID ? "draft" : formChanged ? "unsaved" : "ready";
  const modeClass =
    modeTone === "ready"
      ? "border-emerald-300/15 bg-emerald-400/10 text-emerald-100"
      : modeTone === "unsaved"
        ? "border-blue-300/15 bg-blue-400/10 text-blue-100"
        : "border-amber-300/15 bg-amber-400/10 text-amber-100";
  const testButtonLabel = !selectedID
    ? t("oafBots.preview.saveBeforeTest")
    : formChanged
      ? t("oafBots.preview.saveChangesBeforeTest")
      : generating
        ? t("oafBots.actions.generating")
        : t("oafBots.actions.generate");
  const languageSummaryRows = [
    { label: t("oafBots.fields.primaryLanguage"), value: `${getSelectLabel(currentPrimaryLanguage, languageOptions)}${defaultBadge}` },
    { label: t("oafBots.fields.languageStrategy"), value: `${getSelectLabel(currentLanguageStrategy, languageStrategyOptions)}${defaultBadge}` },
  ];
  const previewRows = [
    { label: t("oafBots.fields.occupation"), value: getChipLabel(form.occupation, occupationOptions) },
    { label: t("oafBots.fields.industry"), value: splitMultiValue(form.industry).map((item) => getChipLabel(item, industryOptions)).join(" / ") },
    { label: t("oafBots.fields.projectOneLiner"), value: form.project_one_liner },
    { label: t("oafBots.fields.targetAudience"), value: form.target_audience },
    { label: t("oafBots.fields.coreValueProps"), value: form.core_value_props },
    { label: t("oafBots.fields.personalityTags"), value: form.personality_tags.join(" / ") },
    { label: t("oafBots.fields.topics"), value: form.topics.join(" / ") },
    { label: t("oafBots.fields.contentPillars"), value: form.content_pillars.join(" / ") },
    { label: t("oafBots.fields.preferredCTA"), value: form.preferred_cta },
    { label: t("oafBots.fields.safetyMode"), value: form.safety_mode },
    { label: t("oafBots.fields.growthGoal"), value: form.growth_goal },
  ].filter((row) => row.value.trim());
  return (
    <SectionCard title={t("oafBots.preview.title")} description={t("oafBots.preview.description")} className="bg-black p-4 md:p-5">
      <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-full border border-[#2f3336] bg-black text-[#1d9bf0]">
            <Bot className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-[#e7e9ea]">{form.name || t("oafBots.preview.unnamed")}</p>
            <p className="text-xs text-[#71767b]">{account ? `@${account.username}` : t("oafBots.preview.noAccount")}</p>
          </div>
        </div>

        <div className={`mt-4 rounded-xl border p-3 ${modeClass}`}>
          <p className="text-xs opacity-75">{t(`oafBots.preview.mode.${modeTone}.title`)}</p>
          <p className="mt-1 text-sm leading-relaxed text-white/78">{t(`oafBots.preview.mode.${modeTone}.description`)}</p>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-xs text-[#71767b]">
            <span>{t("oafBots.preview.completeness")}</span>
            <span className="text-[#e7e9ea]">{completion}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#2f3336]">
            <div
              className={`h-full rounded-full ${lowCompletion ? "bg-amber-300" : "bg-[#1d9bf0]"}`}
              style={{ width: `${completion}%` }}
            />
          </div>
          <p className={`mt-2 text-xs leading-relaxed ${readyCompletion ? "text-emerald-100/85" : "text-amber-100/85"}`}>
            {readyCompletion ? t("oafBots.preview.readyCompleteness") : lowCompletion ? t("oafBots.preview.lowCompleteness") : t("oafBots.preview.mediumCompleteness")}
          </p>
        </div>

        <div className="mt-4 grid gap-3">
          {languageSummaryRows.map((row) => (
            <PreviewRow key={row.label} label={row.label} value={row.value} />
          ))}
        </div>

        <div className="mt-5 grid gap-3">
          {showDetails ? (
            <ChecklistBlock title={t("oafBots.preview.configured")} items={checklist.configured} empty={t("oafBots.preview.noneConfigured")} tone="success" />
          ) : null}
          <ChecklistBlock title={t("oafBots.preview.missing")} items={checklist.missing} empty={t("oafBots.preview.noMissing")} tone="warning" maxItems={4} />
          <div className="rounded-xl border border-blue-300/15 bg-blue-400/10 p-3">
            <p className="text-xs text-[#8ecdf8]">{t("oafBots.preview.nextSuggestion")}</p>
            <p className="mt-1 text-sm leading-relaxed text-[#e7e9ea]/78">{checklist.nextSuggestion}</p>
          </div>
          <QualityDiagnosticsBlock title={t("oafBots.quality.title")} items={qualityDiagnostics} empty={t("oafBots.quality.empty")} />
          <Button type="button" onClick={onTest} disabled={!canTest || generating} className="w-full disabled:opacity-50">
            {generating ? <RefreshCw className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {testButtonLabel}
          </Button>
          <p className="text-xs leading-relaxed text-[#71767b]">
            {!canTest ? t("oafBots.test.disabledHint") : selectedID && !formChanged ? t("oafBots.preview.testReadyHint") : t("oafBots.preview.testNeedsSaveHint")}
          </p>
        </div>

        {showDetails && previewRows.length > 0 ? (
          <div className="mt-5 space-y-3">
            {previewRows.map((row) => (
              <PreviewRow key={row.label} label={row.label} value={row.value} />
            ))}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

function ChecklistBlock({ title, items, empty, tone, maxItems = 5 }: { title: string; items: string[]; empty: string; tone: "success" | "warning"; maxItems?: number }) {
  const toneClass = tone === "success" ? "border-emerald-300/15 bg-emerald-400/10 text-emerald-100" : "border-amber-300/15 bg-amber-400/10 text-amber-100";
  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <p className="text-xs opacity-75">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-white/70">{empty}</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {items.slice(0, maxItems).map((item) => (
            <span key={item} className="rounded-full border border-white/10 bg-black/15 px-2.5 py-1 text-xs text-white/78">
              {item}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function QualityDiagnosticsBlock({ title, items, empty }: { title: string; items: Array<{ tone: "warning" | "info"; message: string }>; empty: string }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-black p-3">
      <p className="text-xs text-[#71767b]">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm leading-relaxed text-emerald-100/85">{empty}</p>
      ) : (
        <div className="mt-2 space-y-2">
          {items.map((item) => (
            <div
              key={item.message}
              className={`rounded-xl border px-3 py-2 text-xs leading-relaxed ${
                item.tone === "warning" ? "border-amber-300/15 bg-amber-400/10 text-amber-100" : "border-blue-300/15 bg-blue-400/10 text-blue-100"
              }`}
            >
              {item.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-3">
      <p className="text-xs text-[#71767b]">{label}</p>
      <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-[#e7e9ea]/78">{value}</p>
    </div>
  );
}

function SamplePanel({
  t,
  samples,
  scene,
  onSceneChange,
  sampleContext,
  onSampleContextChange,
  generating,
  onGenerate,
  selectedID,
  formChanged,
  previewDisabled,
  form,
  account,
  occupationOptions,
  industryOptions,
  safetyOptions,
  languageOptions,
  languageStrategyOptions,
  feedbackItems,
  feedbackLoading,
  feedbackDraft,
  feedbackSaving,
  feedbackIssueOptions,
  onFeedbackDraftChange,
  onFeedbackSubmit,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  samples: OAFBotTestGenerateResult | null;
  scene: SampleScene;
  onSceneChange: (scene: SampleScene) => void;
  sampleContext: string;
  onSampleContextChange: (value: string) => void;
  generating: boolean;
  onGenerate: () => void;
  selectedID: number | null;
  formChanged: boolean;
  previewDisabled: boolean;
  form: OAFBotPayload;
  account?: AccountListItem;
  occupationOptions: ChipOption[];
  industryOptions: ChipOption[];
  safetyOptions: SelectOption[];
  languageOptions: SelectOption[];
  languageStrategyOptions: SelectOption[];
  feedbackItems: OAFBotGenerationFeedback[];
  feedbackLoading: boolean;
  feedbackDraft: FeedbackDraft;
  feedbackSaving: boolean;
  feedbackIssueOptions: ChipOption[];
  onFeedbackDraftChange: (draft: FeedbackDraft) => void;
  onFeedbackSubmit: () => void;
}) {
  const sceneItems: Array<{ id: SampleScene; icon: ReactNode; title: string; description: string }> = [
    { id: "tweet", icon: <Send className="size-4" />, title: t("oafBots.samples.tweet"), description: t("oafBots.samples.tweetContext") },
    { id: "reply", icon: <MessageCircle className="size-4" />, title: t("oafBots.samples.reply"), description: t("oafBots.samples.replyContext") },
    { id: "comment", icon: <MessagesSquare className="size-4" />, title: t("oafBots.samples.comment"), description: t("oafBots.samples.commentContext") },
    { id: "dm", icon: <Mail className="size-4" />, title: t("oafBots.samples.dm"), description: t("oafBots.samples.dmContext") },
  ];
  const personaRows = getSamplePersonaRows(form, account, occupationOptions, industryOptions, safetyOptions, languageOptions, languageStrategyOptions, t);
  const selectedSceneItem = sceneItems.find((item) => item.id === scene) ?? sceneItems[0];
  const selectedContent = useMemo(() => normalizeSampleContent(samples, scene), [samples, scene]);
  const providerLabel = samples?.provider ? providerSourceLabel(samples.provider, t) : "";
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4 text-sm leading-relaxed text-[#e7e9ea]">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-[#1d9bf0]" />
          <div>
            <p>{generating ? t("oafBots.test.loading") : t("oafBots.test.costHint")}</p>
            <p className="mt-1 text-xs text-[#71767b]">{t("oafBots.test.sceneHint")}</p>
          </div>
        </div>
      </div>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        {sceneItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSceneChange(item.id)}
            className={`min-w-0 overflow-hidden rounded-2xl border p-4 text-left transition ${
              scene === item.id ? "border-[#1d9bf0]/55 bg-[#1d9bf0]/12 text-[#e7e9ea]" : "border-[#2f3336] bg-black text-[#71767b] hover:bg-[#16181c] hover:text-[#e7e9ea]"
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border border-[#2f3336] bg-[#0f1419] text-[#1d9bf0]">
                {item.icon}
              </span>
              <div className="min-w-0">
                <p className="truncate whitespace-nowrap text-sm font-medium">{item.title}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#71767b] [overflow-wrap:anywhere]">{item.description}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {!selectedID ? (
        <p className="rounded-xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100">{t("oafBots.test.saveFirst")}</p>
      ) : formChanged ? (
        <p className="rounded-xl border border-blue-300/20 bg-blue-400/10 p-4 text-sm text-blue-100">{t("oafBots.test.saveChangesFirst")}</p>
      ) : previewDisabled ? (
        <p className="rounded-xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100">{t("oafBots.test.disabledHint")}</p>
      ) : null}

      <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
        <TextArea
          label={t(`oafBots.test.context.${scene}.label`)}
          value={sampleContext}
          onChange={onSampleContextChange}
          placeholder={t(`oafBots.test.context.${scene}.placeholder`)}
          helper={t(`oafBots.test.context.${scene}.helper`)}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
        <div>
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("oafBots.test.panelTitle")}</p>
          <p className="mt-1 text-xs text-[#71767b]">{t("oafBots.test.panelDescription")}</p>
        </div>
        <Button type="button" onClick={onGenerate} disabled={generating || previewDisabled}>
          {generating ? <RefreshCw className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {generating ? t("oafBots.test.loadingShort") : t("oafBots.actions.generate")}
        </Button>
      </div>

      {samples ? (
        <div className="grid min-w-0 grid-cols-1 gap-4">
          <div className="grid min-w-0 grid-cols-1 gap-3">
            <SampleCard
              title={selectedSceneItem.title}
              text={selectedContent || t("oafBots.samples.empty")}
              providerLabel={providerLabel}
              highlight
              onRegenerate={onGenerate}
              t={t}
            />
          </div>
          <GenerationFeedbackPanel
            t={t}
            draft={feedbackDraft}
            saving={feedbackSaving}
            issueOptions={feedbackIssueOptions}
            onChange={onFeedbackDraftChange}
            onSubmit={onFeedbackSubmit}
          />
          <GenerationFeedbackHistory
            t={t}
            items={feedbackItems}
            loading={feedbackLoading}
            issueOptions={feedbackIssueOptions}
          />
          <PersonaBasisCard title={t("oafBots.test.personaBasis")} rows={personaRows} empty={t("oafBots.test.personaBasisEmpty")} />
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[#2f3336] bg-black p-6 text-center">
          <Sparkles className="mx-auto size-6 text-[#1d9bf0]" />
          <p className="mt-3 text-sm font-semibold text-[#e7e9ea]">{t("oafBots.samples.emptyTitle")}</p>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-[#71767b]">{t("oafBots.samples.emptyDescription")}</p>
        </div>
      )}
    </div>
  );
}

function SampleCard({
  title,
  text,
  providerLabel,
  highlight = false,
  onRegenerate,
  t,
}: {
  title: string;
  text: string;
  providerLabel?: string;
  highlight?: boolean;
  onRegenerate: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const content = cleanupGeneratedText(text);
  const isLong = content.length > 260;
  const visibleText = !expanded && isLong ? `${content.slice(0, 260).trim()}...` : content;
  const copy = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div className={`flex min-h-[260px] w-full min-w-0 max-w-full flex-col overflow-hidden rounded-2xl border p-4 ${highlight ? "border-[#1d9bf0]/45 bg-[#1d9bf0]/10" : "border-[#2f3336] bg-black"}`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate whitespace-nowrap text-sm font-bold text-[#e7e9ea]">{title}</p>
          <p className="mt-1 text-xs text-[#71767b]">
            {t("oafBots.samples.characters", { count: content.length })}
            {providerLabel ? ` · ${t("oafBots.samples.providerMeta", { provider: providerLabel })}` : ""}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-[#2f3336] bg-[#0f1419] px-2.5 py-1 text-xs text-[#71767b]">
          {highlight ? t("oafBots.samples.selected") : t("oafBots.samples.generated")}
        </span>
      </div>
      <div className="mt-4 max-w-full flex-1 overflow-hidden rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
        <p className="max-h-[280px] whitespace-pre-wrap break-words text-[15px] leading-7 text-[#e7e9ea] [overflow-wrap:anywhere] overflow-y-auto">{visibleText || t("oafBots.samples.empty")}</p>
        {isLong ? (
          <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-3 text-xs font-semibold text-[#1d9bf0] hover:text-[#8ecdf8]">
            {expanded ? t("oafBots.samples.collapse") : t("oafBots.samples.expand")}
          </button>
        ) : null}
      </div>
      <div className="mt-4 flex min-w-0 flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" className="w-full sm:w-auto" onClick={copy}>
          <Copy className="size-4" />
          {copied ? t("oafBots.samples.copied") : t("oafBots.samples.copy")}
        </Button>
        <Button type="button" size="sm" variant="outline" className="w-full sm:w-auto" onClick={onRegenerate}>
          <RefreshCw className="size-4" />
          {t("oafBots.samples.regenerate")}
        </Button>
        <Button type="button" size="sm" variant="outline" className="w-full sm:w-auto" disabled title={t("oafBots.samples.saveDraftDisabled")}>
          <FilePlus2 className="size-4" />
          {t("oafBots.samples.saveDraft")}
        </Button>
      </div>
    </div>
  );
}

function GenerationFeedbackPanel({
  t,
  draft,
  saving,
  issueOptions,
  onChange,
  onSubmit,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  draft: FeedbackDraft;
  saving: boolean;
  issueOptions: ChipOption[];
  onChange: (draft: FeedbackDraft) => void;
  onSubmit: () => void;
}) {
  const toggleIssue = (value: string) => {
    const exists = draft.issueTags.includes(value);
    onChange({ ...draft, issueTags: exists ? draft.issueTags.filter((item) => item !== value) : [...draft.issueTags, value] });
  };
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-bold text-[#e7e9ea]">{t("oafBots.feedback.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("oafBots.feedback.description")}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => onChange({ ...draft, rating: "positive", issueTags: [] })}
            className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold ${
              draft.rating === "positive" ? "border-emerald-300/30 bg-emerald-400/15 text-emerald-100" : "border-[#2f3336] bg-black text-[#71767b] hover:text-[#e7e9ea]"
            }`}
          >
            <ThumbsUp className="size-4" />
            {t("oafBots.feedback.positive")}
          </button>
          <button
            type="button"
            onClick={() => onChange({ ...draft, rating: "negative" })}
            className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold ${
              draft.rating === "negative" ? "border-amber-300/30 bg-amber-400/15 text-amber-100" : "border-[#2f3336] bg-black text-[#71767b] hover:text-[#e7e9ea]"
            }`}
          >
            <ThumbsDown className="size-4" />
            {t("oafBots.feedback.negative")}
          </button>
        </div>
      </div>

      {draft.rating === "negative" ? (
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold text-[#e7e9ea]">{t("oafBots.feedback.issueTitle")}</p>
          <div className="flex flex-wrap gap-2">
            {issueOptions.map((option) => {
              const selected = draft.issueTags.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggleIssue(option.value)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    selected ? "border-[#1d9bf0]/45 bg-[#1d9bf0]/12 text-[#8ecdf8]" : "border-[#2f3336] bg-black text-[#71767b] hover:text-[#e7e9ea]"
                  }`}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        <textarea
          className="form-input min-h-24 resize-y leading-relaxed"
          value={draft.comment}
          placeholder={draft.rating === "positive" ? t("oafBots.feedback.commentPositivePlaceholder") : t("oafBots.feedback.commentPlaceholder")}
          onChange={(event) => onChange({ ...draft, comment: event.target.value })}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs leading-5 text-[#71767b]">{t("oafBots.feedback.loopHint")}</p>
        <Button type="button" size="sm" onClick={onSubmit} disabled={saving || !draft.rating}>
          {saving ? <RefreshCw className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          {saving ? t("oafBots.feedback.saving") : t("oafBots.feedback.submit")}
        </Button>
      </div>
    </div>
  );
}

function GenerationFeedbackHistory({
  t,
  items,
  loading,
  issueOptions,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  items: OAFBotGenerationFeedback[];
  loading: boolean;
  issueOptions: ChipOption[];
}) {
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[#e7e9ea]">{t("oafBots.feedback.historyTitle")}</p>
          <p className="mt-1 text-xs text-[#71767b]">{t("oafBots.feedback.historyDescription")}</p>
        </div>
        <span className="rounded-full border border-[#2f3336] bg-[#0f1419] px-2.5 py-1 text-xs text-[#71767b]">
          {t("oafBots.feedback.historyCount", { count: items.length })}
        </span>
      </div>
      {loading ? (
        <p className="mt-4 text-sm text-[#71767b]">{t("oafBots.feedback.loading")}</p>
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm leading-6 text-[#71767b]">{t("oafBots.feedback.empty")}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {items.slice(0, 5).map((item) => (
            <div key={item.id} className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-[#71767b]">
                <span className={`rounded-full border px-2 py-0.5 ${item.rating === "positive" ? "border-emerald-300/20 text-emerald-100" : "border-amber-300/20 text-amber-100"}`}>
                  {t(`oafBots.feedback.rating.${item.rating}`)}
                </span>
                <span>{t(`oafBots.samples.${item.scene}`)}</span>
                <span>{formatFeedbackDate(item.created_at)}</span>
              </div>
              {item.issue_tags.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {item.issue_tags.map((tag) => (
                    <span key={tag} className="rounded-full border border-[#2f3336] bg-black px-2 py-0.5 text-[11px] text-[#8ecdf8]">
                      {getChipLabel(tag, issueOptions)}
                    </span>
                  ))}
                </div>
              ) : null}
              {item.comment ? <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#e7e9ea]/75">{item.comment}</p> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PersonaBasisCard({ title, rows, empty }: { title: string; rows: Array<{ label: string; value: string }>; empty: string }) {
  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
      <p className="text-sm font-bold text-[#e7e9ea]">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm leading-relaxed text-[#71767b]">{empty}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((row) => (
            <div key={row.label} className="min-w-0 rounded-xl border border-[#2f3336] bg-black p-3">
              <p className="text-xs text-[#71767b]">{row.label}</p>
              <p className="mt-1 break-words text-sm leading-relaxed text-[#e7e9ea]/78 [overflow-wrap:anywhere]">{row.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function normalizeSampleContent(sample: OAFBotTestGenerateResult | null, scene: SampleScene): string {
  if (!sample) return "";
  const direct = sample.scene === scene ? sample.content : "";
  return cleanupGeneratedTextForScene(direct || sample[scene] || sample.content || sample.raw_result || "", scene);
}

function parseGeneratedPayload(raw: string): string | Partial<Record<SampleScene | "content" | "text" | "message" | "body", unknown>> {
  const text = cleanupCodeFence(raw);
  if (!looksLikeJSON(text)) return text;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Partial<Record<SampleScene, unknown>>;
    }
    return stringifyGeneratedValue(parsed);
  } catch {
    return text;
  }
}

function looksLikeJSON(value: string) {
  const text = value.trim();
  return (text.startsWith("{") && text.endsWith("}")) || (text.startsWith("[") && text.endsWith("]"));
}

function cleanupCodeFence(raw: string) {
  return raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
}

function stringifyGeneratedValue(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    const preferred = object.content ?? object.text ?? object.message ?? object.body;
    if (typeof preferred === "string") return preferred;
    return Object.values(object).filter((item): item is string => typeof item === "string").join("\n\n");
  }
  return String(value);
}

function cleanupGeneratedText(raw: string) {
  const text = cleanupCodeFence(raw);
  const parsed = parseGeneratedPayload(text);
  if (typeof parsed === "string") return parsed.trim();
  return stringifyGeneratedValue(parsed).trim();
}

function cleanupGeneratedTextForScene(raw: string, scene: SampleScene) {
  const text = cleanupCodeFence(raw);
  const parsed = parseGeneratedPayload(text);
  if (typeof parsed === "string") return parsed.trim();
  return (
    stringifyGeneratedValue(parsed[scene]) ||
    stringifyGeneratedValue(parsed.content) ||
    stringifyGeneratedValue(parsed.text) ||
    stringifyGeneratedValue(parsed.message) ||
    stringifyGeneratedValue(parsed.body) ||
    stringifyGeneratedValue(parsed)
  ).trim();
}

function providerSourceLabel(provider: string, t: (key: string, params?: Record<string, string | number>) => string) {
  const normalized = provider.trim() || "unknown";
  const key = `oafBots.samples.provider.${normalized}`;
  const label = t(key);
  return label === key ? normalized : label;
}

function getSamplePersonaRows(
  form: OAFBotPayload,
  account: AccountListItem | undefined,
  occupationOptions: ChipOption[],
  industryOptions: ChipOption[],
  safetyOptions: SelectOption[],
  languageOptions: SelectOption[],
  languageStrategyOptions: SelectOption[],
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  return [
    { label: t("oafBots.fields.name"), value: form.name },
    { label: t("oafBots.fields.twitterAccount"), value: account ? `@${account.username}` : "" },
    { label: t("oafBots.fields.occupation"), value: getChipLabel(form.occupation, occupationOptions) },
    { label: t("oafBots.fields.industry"), value: splitMultiValue(form.industry).map((item) => getChipLabel(item, industryOptions)).join(" / ") },
    { label: t("oafBots.fields.primaryLanguage"), value: getSelectLabel(form.primary_language, languageOptions) },
    { label: t("oafBots.fields.languageStrategy"), value: getSelectLabel(form.language_strategy, languageStrategyOptions) },
    { label: t("oafBots.fields.projectOneLiner"), value: form.project_one_liner },
    { label: t("oafBots.fields.targetAudience"), value: form.target_audience },
    { label: t("oafBots.fields.coreValueProps"), value: form.core_value_props },
    { label: t("oafBots.fields.voiceTone"), value: form.voice_tone },
    { label: t("oafBots.fields.topics"), value: form.topics.join(" / ") },
    { label: t("oafBots.fields.contentPillars"), value: form.content_pillars.join(" / ") },
    { label: t("oafBots.fields.preferredCTA"), value: form.preferred_cta },
    { label: t("oafBots.fields.growthGoal"), value: form.growth_goal },
    { label: t("oafBots.fields.safetyMode"), value: safetyOptions.find((option) => option.value === form.safety_mode)?.label || form.safety_mode },
  ].filter((row) => row.value.trim());
}

function GenerationUsageCard({
  t,
  selectedID,
  generationUsages,
  loading,
  usage,
  limits,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  selectedID: number | null;
  generationUsages: OAFBotGenerationUsage[];
  loading: boolean;
  usage: PlanUsage;
  limits: PlanLimits;
}) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const usageByScene = useMemo(() => aggregateMonthlyUsage(generationUsages, currentMonth), [currentMonth, generationUsages]);
  const total = usageSceneOrder.reduce((sum, scene) => sum + (usageByScene.get(scene)?.count ?? 0), 0);
  const planLimit = limits.aiGenerationsMonthly;
  const planUsed = usage.aiGenerationsMonth;
  const planRemaining = Math.max(planLimit - planUsed, 0);
  return (
    <SectionCard title={t("oafBots.usages.title")} description={t("oafBots.usages.description")}>
      {!selectedID ? (
        <p className="rounded-2xl border border-[#2f3336] bg-black p-4 text-sm text-[#71767b]">
          {t("oafBots.usages.selectBot")}
        </p>
      ) : loading ? (
        <p className="rounded-2xl border border-[#2f3336] bg-black p-4 text-sm text-[#71767b]">
          {t("oafBots.usages.loading")}
        </p>
      ) : total === 0 ? (
        <p className="rounded-2xl border border-[#2f3336] bg-black p-4 text-sm text-[#71767b]">
          {t("oafBots.usages.empty")}
        </p>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2 rounded-2xl border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 p-3">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-[#8ecdf8]">{t("oafBots.usages.botMonthlyTotal")}</span>
              <span className="font-semibold text-[#e7e9ea]">{t("oafBots.usages.countWithUnit", { count: total })}</span>
            </div>
            <p className="text-xs leading-relaxed text-[#e7e9ea]/68">
              {t("oafBots.usages.sharedQuotaHint", {
                limit: planLimit,
                used: planUsed,
                remaining: planRemaining,
              })}
            </p>
          </div>
          {usageSceneOrder.map((scene) => {
            const item = usageByScene.get(scene);
            const count = item?.count ?? 0;
            const ratio = total > 0 ? Math.round((count / total) * 100) : 0;
            return (
              <div key={scene} className="min-w-0 rounded-2xl border border-[#2f3336] bg-black p-4 text-sm text-[#e7e9ea]/72">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#e7e9ea]">{usageSceneLabel(scene, t)}</p>
                    <p className="mt-1 text-xs text-[#71767b]">{t("oafBots.usages.latestMonth", { month: item?.month ?? currentMonth })}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-[#2f3336] px-3 py-1 text-xs text-[#71767b]">
                    {t("oafBots.usages.countWithUnit", { count })}
                  </span>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#2f3336]">
                  <div className="h-full rounded-full bg-[#1d9bf0]" style={{ width: `${ratio}%` }} />
                </div>
                <p className="mt-2 text-xs text-[#71767b]">{t("oafBots.usages.sceneShare", { percent: ratio })}</p>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

function normalizeUsageScene(scene: string) {
  return scene === "test_generate" ? "oaf_bot_test_generate" : scene;
}

function aggregateMonthlyUsage(items: OAFBotGenerationUsage[], currentMonth: string) {
  const usageByScene = new Map<string, OAFBotGenerationUsage>();
  items.forEach((item) => {
    const scene = normalizeUsageScene(item.scene);
    if (item.month !== currentMonth) return;
    const existing = usageByScene.get(scene);
    usageByScene.set(scene, {
      ...item,
      scene,
      count: (existing?.count ?? 0) + item.count,
    });
  });
  return usageByScene;
}

function usageSceneLabel(scene: string, t: (key: string, params?: Record<string, string | number>) => string) {
  const key = `oafBots.usages.scene.${scene}`;
  const label = t(key);
  return label === key ? scene : label;
}
