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
  MessageCircle,
  MessagesSquare,
  RefreshCw,
  Rocket,
  Save,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  WalletCards,
  Workflow,
} from "lucide-react";

import { SectionCard } from "@/components/dashboard/section-card";
import { useConfirm } from "@/components/providers/confirm-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { BotPreview } from "@/components/oaf-bots/bot-preview-panel";
import {
  AccountSelect,
  ChipTextArea,
  SelectField,
  SingleChipField,
  TagPicker,
  TextArea,
  TextField,
  WizardPanel,
} from "@/components/oaf-bots/form-fields";
import { LearningRulesCenter } from "@/components/oaf-bots/learning-center-panel";
import { ProfileDiffPreview, SamplePanel, getFeedbackSuggestionDiffs, mergeFeedbackSuggestionProfile, normalizeSampleContent, splitMultiValue } from "@/components/oaf-bots/sample-learning-panels";
import { LanguageConfigPanel, SafetyRulesPanel } from "@/components/oaf-bots/safety-persona-panels";
import { AccountArchetypePicker, QuotaCard, StyleRecommendationPanel, TopicGuardrailRecommendationPanel } from "@/components/oaf-bots/strategy-persona-panels";
import { BotMatrixPanel, BotRelationshipCard, BotStatusPill, ListStat, OAFBotDangerZone, OAFBotFocusPanel } from "@/components/oaf-bots/workspace-panels";
import { useT } from "@/i18n/use-t";
import { broadcastDataSynced } from "@/lib/app-page-refresh";
import { formatDateTime, usePreferredTimeZone } from "@/lib/timezone";
import { accountService, type AccountListItem } from "@/services/account.service";
import { automationService, type AutomationModuleApi } from "@/services/automation.service";
import { contentDraftService, type ContentDraftPlanApi } from "@/services/content-drafts.service";
import { contentLibraryService, type ContentLibraryItemApi } from "@/services/content-library.service";
import { oafBotService } from "@/services/oaf-bot.service";
import { reviewQueueService, type ReviewQueueFeedbackIssueVerdictStatApi, type ReviewQueueItemApi } from "@/services/review-queue.service";
import type { PlanLimits, PlanUsage } from "@/types/billing";
import type {
  OAFBot,
  OAFBotCompleteProfileResult,
  OAFBotFeedbackProfileSuggestionResult,
  OAFBotGenerationFeedback,
  OAFBotGenerationFeedbackRating,
  OAFBotGenerationUsage,
  OAFBotLearningRulePreference,
  OAFBotMatrixInspectionSummary,
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
type ContentDraftReadinessStep = {
  key: "account" | "content" | "planner" | "autopilot";
  ready: boolean;
  href: string;
};
type FeedbackDraft = {
  rating: OAFBotGenerationFeedbackRating | "";
  issueTags: string[];
  comment: string;
};
type PendingAppliedFormChange = {
  source: "complete_profile" | "feedback_suggestion";
  count: number;
};
type SafetyRewritePreview = {
  before: string;
  result: OAFBotTestGenerateResult;
};
type SafetyRewriteMode = "natural" | "conservative" | "shorter";
type AccountArchetypeKey = "brand" | "founder" | "kol" | "community" | "agency";
type ProfileDiffItem = {
  key: keyof OAFBotPayload;
  before: OAFBotPayload[keyof OAFBotPayload];
  after: OAFBotPayload[keyof OAFBotPayload];
};
type MatrixFilterKey = "all" | "unbound" | "auto_post_not_ready" | "negative_feedback" | "review_backlog";
type BotMatrixRow = {
  bot: OAFBot;
  account?: AccountListItem;
  completion: number;
  activeContentCount: number;
  queueSummary: QueueSummary;
  plan?: ContentDraftPlanApi;
  contentDraftReady: boolean;
  monthlyUsage: number;
  negativeFeedback: number;
  inspectionFlags: string[];
};
type MatrixInspectionItem = {
  key: MatrixFilterKey;
  count: number;
  tone: "neutral" | "warning" | "danger";
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

const usageSceneOrder = ["oaf_bot_test_generate", "auto_post", "auto_comment", "auto_reply"] as const;
const automationTypes: BotAutomationType[] = ["post", "reply", "comment"];
const accountArchetypeKeys: AccountArchetypeKey[] = ["brand", "founder", "kol", "community", "agency"];
const profileAssistModes: OAFBotProfileAssistMode[] = ["fill_missing_only", "improve_all"];
const feedbackSuggestionDiffKeys: Array<keyof OAFBotPayload> = [
  "name",
  "twitter_account_id",
  "occupation",
  "industry",
  "personality_tags",
  "identity_summary",
  "voice_tone",
  "topics",
  "forbidden_topics",
  "growth_goal",
  "project_one_liner",
  "target_audience",
  "core_value_props",
  "product_features",
  "differentiators",
  "content_pillars",
  "content_objectives",
  "preferred_cta",
  "website_url",
  "telegram_url",
  "discord_url",
  "docs_url",
  "cta_policy",
  "hashtags",
  "keywords",
  "compliance_notes",
  "avoid_claims",
  "safety_mode",
  "primary_language",
  "language_strategy",
  "trend_regions",
  "trend_categories",
  "allow_general_trends",
  "sensitive_trend_policy",
];
const matrixFilters: MatrixFilterKey[] = ["all", "unbound", "auto_post_not_ready", "negative_feedback", "review_backlog"];
const safetyRewriteModes: SafetyRewriteMode[] = ["natural", "conservative", "shorter"];
const negativeFeedbackInspectionThreshold = 3;
const reviewBacklogInspectionThreshold = 5;
const trendRegionValues = ["1", "23424977"];
const trendCategoryValues = ["crypto", "finance", "tech", "sports", "entertainment", "gaming", "politics", "news", "culture", "lifestyle", "meme", "other"];
const sensitiveTrendPolicyValues = ["avoid", "review_only", "allow"];
const accountArchetypePresets: Record<AccountArchetypeKey, Partial<OAFBotPayload> & { occupation: string }> = {
  brand: {
    occupation: "Official brand account",
    personality_tags: ["Professional", "Restrained", "Helpful"],
    voice_tone:
      "Concise official-operator voice. Use short practical sentences. Explain social operations workflows clearly. Avoid hype, generic AI claims, and hard-selling CTAs.",
    identity_summary: "An official brand OAF Bot focused on controlled product updates, practical workflows, and review-first social operations.",
    growth_goal: "Build brand authority",
    content_pillars: ["Product value", "Use cases", "Market education"],
    content_objectives: "Explain product workflows, share useful updates, and keep brand messaging controlled.",
    avoid_claims: ["Guaranteed returns", "Absolute superiority claims", "Unverified official partnership"],
    safety_mode: "balanced",
  },
  founder: {
    occupation: "Founder / operator",
    personality_tags: ["Direct", "Curious", "Warm"],
    voice_tone:
      "Practical founder/operator voice. Start from an operator pain point, then show a concrete workflow or decision. Keep CTAs soft and avoid sounding like an ad.",
    identity_summary: "A founder/operator OAF Bot that speaks from hands-on product and growth experience.",
    growth_goal: "Build brand authority",
    content_pillars: ["Founder insight", "User pain points", "Product value"],
    content_objectives: "Share operational lessons, explain product decisions, and make the workflow feel concrete.",
    avoid_claims: ["Guaranteed returns", "Absolute superiority claims"],
    safety_mode: "balanced",
  },
  kol: {
    occupation: "KOL / creator",
    personality_tags: ["Casual", "Sharp", "Helpful"],
    voice_tone: "Natural creator voice with a clear point of view. Make specific observations, avoid product documentation, and keep the hook conversational.",
    identity_summary: "A KOL-style OAF Bot that turns trusted source material into opinionated but controlled X content.",
    growth_goal: "Grow followers",
    content_pillars: ["Market education", "Use cases", "Community proof"],
    content_objectives: "Create useful takes, explain why the topic matters, and avoid sounding like product documentation.",
    avoid_claims: ["Guaranteed returns", "Legal or financial advice", "Token price prediction"],
    safety_mode: "balanced",
  },
  community: {
    occupation: "Community operator",
    personality_tags: ["Warm", "Helpful", "Professional"],
    voice_tone: "Supportive community operations voice. Be clear, calm, and useful; invite participation without overpromising outcomes.",
    identity_summary: "A community OAF Bot focused on updates, member context, and safe engagement loops.",
    growth_goal: "Increase account activity",
    content_pillars: ["Community proof", "Roadmap updates", "Ecosystem collaborations"],
    content_objectives: "Keep the community informed, invite review, and avoid overpromising outcomes.",
    avoid_claims: ["Guaranteed returns", "Unverified official partnership"],
    safety_mode: "conservative",
  },
  agency: {
    occupation: "Agency operator",
    personality_tags: ["Professional", "Growth-oriented", "Restrained"],
    voice_tone:
      "Client-safe agency operator voice. Keep wording controlled, practical, and reusable; connect posts to workflow value without aggressive claims.",
    identity_summary: "An agency-managed OAF Bot that keeps account voice consistent while supporting repeatable review workflows.",
    growth_goal: "Capture leads",
    content_pillars: ["Use cases", "User pain points", "Product value"],
    content_objectives: "Produce reusable account-safe drafts, keep client messaging aligned, and support review-first operations.",
    avoid_claims: ["Guaranteed returns", "Absolute superiority claims", "Unverified official partnership"],
    safety_mode: "conservative",
  },
};
const styleRecommendationPresets: Record<AccountArchetypeKey, { personalityTags: string[]; voiceTone: string; mbti: string }> = {
  brand: {
    personalityTags: ["Professional", "Restrained", "Direct", "Helpful"],
    voiceTone:
      "Concise official-operator voice. Use short practical sentences. Explain social operations workflows clearly. Avoid hype, generic AI claims, and hard-selling CTAs.",
    mbti: "INTJ",
  },
  founder: {
    personalityTags: ["Direct", "Curious", "Growth-oriented", "Restrained"],
    voiceTone:
      "Practical founder/operator voice. Start from an operator pain point, then show a concrete workflow or decision. Keep CTAs soft and avoid sounding like an ad.",
    mbti: "ENTJ",
  },
  kol: {
    personalityTags: ["Curious", "Casual", "Sharp", "Direct"],
    voiceTone:
      "Natural creator voice with a clear point of view. Make specific observations, avoid product documentation, and keep the hook conversational.",
    mbti: "ENTP",
  },
  community: {
    personalityTags: ["Warm", "Helpful", "Restrained", "Professional"],
    voiceTone:
      "Supportive community operations voice. Be clear, calm, and useful; invite participation without overpromising outcomes.",
    mbti: "ENFJ",
  },
  agency: {
    personalityTags: ["Professional", "Restrained", "Growth-oriented", "Direct"],
    voiceTone:
      "Client-safe agency operator voice. Keep wording controlled, practical, and reusable; connect posts to workflow value without aggressive claims.",
    mbti: "ISTJ",
  },
};
type TopicGuardrailRecommendationPreset = {
  topics: string[];
  contentPillars: string[];
  forbiddenTopics: string[];
  avoidClaims: string[];
  complianceNotes: string;
  safetyMode: OAFBotPayload["safety_mode"];
};

const topicGuardrailRecommendationPresets: Record<AccountArchetypeKey, TopicGuardrailRecommendationPreset> = {
  brand: {
    topics: ["AI Agent", "X Marketing", "Product Launch", "Community Building"],
    contentPillars: ["Product value", "Use cases", "Market education", "Roadmap updates"],
    forbiddenTopics: ["Investment advice", "Profit promises", "Impersonating officials"],
    avoidClaims: ["Guaranteed returns", "Absolute superiority claims", "Unverified official partnership"],
    complianceNotes:
      "Do not promise guaranteed growth or engagement.\nDo not describe automation as spam at scale.\nDo not claim full replacement of human operators.\nDo not publish fake metrics or unverified partnerships.",
    safetyMode: "balanced",
  },
  founder: {
    topics: ["AI Agent", "Startup", "Product Launch", "X Marketing"],
    contentPillars: ["Founder insight", "User pain points", "Product value", "Market education"],
    forbiddenTopics: ["Investment advice", "Profit promises", "Price predictions"],
    avoidClaims: ["Guaranteed returns", "Absolute superiority claims", "Legal or financial advice"],
    complianceNotes:
      "Do not overstate product results before evidence exists.\nDo not use aggressive hard-sell CTAs.\nDo not turn personal operator lessons into guaranteed outcomes.",
    safetyMode: "balanced",
  },
  kol: {
    topics: ["AI Agent", "Web3 Growth", "Crypto Trends", "Startup"],
    contentPillars: ["Market education", "Use cases", "Community proof", "Founder insight"],
    forbiddenTopics: ["Investment advice", "Profit promises", "Price predictions"],
    avoidClaims: ["Guaranteed returns", "Token price prediction", "Legal or financial advice"],
    complianceNotes:
      "Separate opinion from facts.\nDo not imply inside information or official partnerships.\nDo not make token, price, or investment recommendations.",
    safetyMode: "balanced",
  },
  community: {
    topics: ["Community Building", "Product Launch", "SocialFi", "Web3 Growth"],
    contentPillars: ["Community proof", "Roadmap updates", "Ecosystem collaborations", "Use cases"],
    forbiddenTopics: ["Investment advice", "Profit promises", "Aggressive language"],
    avoidClaims: ["Guaranteed returns", "Unverified official partnership", "Absolute superiority claims"],
    complianceNotes:
      "Keep community expectations realistic.\nDo not promise roadmap delivery dates unless verified.\nDo not use confrontational language toward users or competitors.",
    safetyMode: "conservative",
  },
  agency: {
    topics: ["X Marketing", "Community Building", "Product Launch", "Web3 Growth"],
    contentPillars: ["Use cases", "User pain points", "Product value", "Market education"],
    forbiddenTopics: ["Investment advice", "Profit promises", "Impersonating officials"],
    avoidClaims: ["Guaranteed returns", "Absolute superiority claims", "Unverified official partnership"],
    complianceNotes:
      "Keep client-safe wording.\nDo not imply outcomes the client did not approve.\nDo not publish unsupported metrics, testimonials, or partnership claims.",
    safetyMode: "conservative",
  },
};
const accountArchetypeOccupationKeywords: Record<AccountArchetypeKey, string[]> = {
  brand: ["official brand", "brand account", "official account", "product account"],
  founder: ["founder", "operator", "product operator", "product manager", "builder", "product-led growth"],
  kol: ["kol", "creator", "influencer"],
  community: ["community"],
  agency: ["agency", "managed account", "client operator"],
};
const accountArchetypeDetectionOrder: AccountArchetypeKey[] = ["brand", "agency", "community", "kol", "founder"];

const emptyLimits: PlanLimits = {
  maxBots: 1,
  maxTwitterAccounts: 1,
  aiGenerationsMonthly: 100,
  monthlyXWrites: 10,
  monthlyXUrlPosts: 0,
  monthlyCostCapCents: 0,
  monthlyContentDrafts: 30,
  monthlyReplyDrafts: 150,
  monthlyOpportunityDrafts: 90,
  monthlyReviewCapacity: 150,
  contentMemorySources: 2,
  monthlyRadarRefreshes: 20,
  dailyContentDrafts: 1,
  dailyReplyDrafts: 5,
  dailyOpportunityDrafts: 3,
  dailyReviewCapacity: 5,
  monthlyAutoPosts: 30,
  monthlyAutoReplies: 150,
  monthlyAutoComments: 90,
  monthlyAutoDMs: 150,
  autoCommentTargets: 2,
  monthlyAutoCommentScans: 20,
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
  contentDraftsMonth: 0,
  replyDraftsMonth: 0,
  opportunityDraftsMonth: 0,
  reviewCapacityMonth: 0,
  autoPostsMonth: 0,
  autoRepliesMonth: 0,
  autoCommentsMonth: 0,
  autoDMsMonth: 0,
  contentDraftsToday: 0,
  replyDraftsToday: 0,
  opportunityDraftsToday: 0,
  reviewCapacityToday: 0,
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
    website_url: "",
    telegram_url: "",
    discord_url: "",
    docs_url: "",
    cta_policy: "",
    hashtags: [],
    keywords: [],
    compliance_notes: "",
    avoid_claims: [],
    safety_mode: "balanced",
    primary_language: defaultPrimaryLanguage,
    language_strategy: "follow_context",
    trend_regions: ["1", "23424977"],
    trend_categories: [],
    allow_general_trends: false,
    sensitive_trend_policy: "avoid",
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
    aiSocialOpsOperator: "AI social operations product operator",
    aiProductOperator: "AI product operator",
    saasFounderOperator: "SaaS founder / operator",
    founderOperatorAIWorkflows: "Founder/operator building AI workflows",
    web3GrowthManager: "Web3 Growth Manager",
    web3GrowthOperator: "Web3 Growth Operator",
    aiProductManager: "AI Product Manager",
    cryptoResearcher: "Crypto Researcher",
    communityGrowthLead: "Community Growth Lead",
    communityManager: "Community Manager",
    kolCreatorOperator: "KOL / Creator Operator",
    founder: "Founder",
    developerAdvocate: "Developer Advocate",
    contentCreator: "Content Creator",
    kolAssistant: "KOL Assistant",
    agencyClientOperator: "Agency Client Operator",
    productLedGrowthOperator: "Product-led Growth Operator",
  },
  industry: {
    ai: "AI",
    web3: "Web3",
    defi: "DeFi",
    socialfi: "SocialFi",
    b2bSoftware: "B2B Software",
    nft: "NFT / Digital Collectibles",
    gaming: "Gaming",
    saas: "SaaS",
    creatorEconomy: "Creator Economy",
    consumerApps: "Consumer Apps",
    fintech: "FinTech",
    ecommerce: "E-commerce",
    edtech: "Education / EdTech",
    mediaNewsletter: "Media / Newsletter",
    communityDao: "Community / DAO",
    marketingGrowth: "Marketing / Growth",
    agencyServices: "Agency / Services",
    cryptoTrading: "Crypto Trading",
    developerTools: "Developer Tools",
    realEstate: "Real Estate",
    healthWellness: "Health / Wellness",
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
    dmConversion: "Drive qualified conversations",
  },
  ctaPresets: {
    websiteIntro: "Use the website link only when explaining product capability or inviting users to try the product.",
    tryOafBot: "Use a soft CTA such as 'try OAF Bot' only after a concrete workflow or use case.",
    followCases: "Invite users to follow upcoming product cases or operator notes.",
    telegramCommunity: "Use Telegram only for community, support, or campaign questions.",
    noLinkEveryPost: "Do not attach links to every output; prefer value-first posts.",
  },
  voicePresets: {
    concise: "Concise professional voice. Use short sentences, clear structure, and practical product language. Avoid hype and vague AI claims.",
    natural: "Relaxed natural voice. Sound conversational and useful, but keep the message focused and avoid filler.",
    web3Native: "Web3-native operator voice. Use community-aware phrasing, but avoid degen hype, financial promises, and spammy CTAs.",
    founder: "Founder/operator perspective. Share practical observations, tradeoffs, and workflow lessons from building or operating the product.",
    technical: "Technical explainer voice. Make mechanisms clear, define terms when needed, and avoid overclaiming what the system can do.",
    growth: "Practical growth-operator voice. Connect posts to user pain, workflow value, or a next step. Use soft CTAs only when useful.",
    community: "Community operations voice. Be warm, clear, and responsive; invite participation while keeping expectations realistic.",
  },
};

export default function OAFBotsPage() {
  const { t, lang } = useT();
  const { pushToast } = useToast();
  const { confirm } = useConfirm();
  const defaultPrimaryLanguage = lang === "en" ? "en" : "zh-CN";
  const [loading, setLoading] = useState(true);
  const [bots, setBots] = useState<OAFBot[]>([]);
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [automationModules, setAutomationModules] = useState<AutomationModuleApi[]>([]);
  const [contentDraftPlans, setContentDraftPlans] = useState<ContentDraftPlanApi[]>([]);
  const [contentItems, setContentItems] = useState<ContentLibraryItemApi[]>([]);
  const [queueItems, setQueueItems] = useState<ReviewQueueItemApi[]>([]);
  const [relationshipLoading, setRelationshipLoading] = useState(true);
  const [limits, setLimits] = useState<PlanLimits>(emptyLimits);
  const [usage, setUsage] = useState<PlanUsage>(emptyUsage);
  const [selectedID, setSelectedID] = useState<number | null>(null);
  const [form, setForm] = useState<OAFBotPayload>(() => createEmptyForm(defaultPrimaryLanguage));
  const [activeStep, setActiveStep] = useState<WizardStep>("identity");
  const [sampleScene, setSampleScene] = useState<SampleScene>("tweet");
  const [safetyRewriteMode, setSafetyRewriteMode] = useState<SafetyRewriteMode>("natural");
  const [sampleContexts, setSampleContexts] = useState<OAFBotSampleContext>({});
  const [samples, setSamples] = useState<OAFBotTestGenerateResult | null>(null);
  const [learningComparison, setLearningComparison] = useState<OAFBotTestGenerateResult | null>(null);
  const [disabledLearningIssues, setDisabledLearningIssues] = useState<string[]>([]);
  const [learningRulePreferences, setLearningRulePreferences] = useState<OAFBotLearningRulePreference[]>([]);
  const [learningVerdictStats, setLearningVerdictStats] = useState<ReviewQueueFeedbackIssueVerdictStatApi[]>([]);
  const [generationUsages, setGenerationUsages] = useState<OAFBotGenerationUsage[]>([]);
  const [generationFeedback, setGenerationFeedback] = useState<OAFBotGenerationFeedback[]>([]);
  const [matrixUsageByBot, setMatrixUsageByBot] = useState<Record<number, OAFBotGenerationUsage[]>>({});
  const [matrixFeedbackByBot, setMatrixFeedbackByBot] = useState<Record<number, OAFBotGenerationFeedback[]>>({});
  const [matrixInspectionFlagsByBot, setMatrixInspectionFlagsByBot] = useState<Record<number, string[]>>({});
  const [matrixInspectionSummary, setMatrixInspectionSummary] = useState<OAFBotMatrixInspectionSummary | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixFilter, setMatrixFilter] = useState<MatrixFilterKey>("all");
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackDeletingID, setFeedbackDeletingID] = useState<number | null>(null);
  const [feedbackSuggestionLoading, setFeedbackSuggestionLoading] = useState(false);
  const [completeProfilePreview, setCompleteProfilePreview] = useState<OAFBotCompleteProfileResult | null>(null);
  const [feedbackSuggestionPreview, setFeedbackSuggestionPreview] = useState<OAFBotFeedbackProfileSuggestionResult | null>(null);
  const [safetyRewritePreview, setSafetyRewritePreview] = useState<SafetyRewritePreview | null>(null);
  const [pendingAppliedFormChange, setPendingAppliedFormChange] = useState<PendingAppliedFormChange | null>(null);
  const [feedbackDraft, setFeedbackDraft] = useState<FeedbackDraft>({ rating: "", issueTags: [], comment: "" });
  const [saving, setSaving] = useState(false);
  const [deletingBot, setDeletingBot] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [comparingLearning, setComparingLearning] = useState(false);
  const [rewritingSafety, setRewritingSafety] = useState(false);
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
  const completeProfileDiffs = useMemo(
    () => (completeProfilePreview ? getFeedbackSuggestionDiffs(form, completeProfilePreview.profile) : []),
    [completeProfilePreview, form],
  );

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

  const selectedContentDraftPlan = useMemo(() => {
    if (!selectedBot) return undefined;
    return contentDraftPlans.find((plan) => plan.bot_id === selectedBot.id || plan.x_account_id === selectedBot.twitter_account_id);
  }, [contentDraftPlans, selectedBot]);
  const selectedCompatibleContentItems = useMemo(() => {
    if (!selectedBot) return [];
    return contentItems.filter((item) => contentItemMatchesBot(item, selectedBot));
  }, [contentItems, selectedBot]);
  const selectedActiveContentItems = useMemo(
    () => selectedCompatibleContentItems.filter((item) => item.status === "active"),
    [selectedCompatibleContentItems],
  );
  const selectedContentDraftReadiness = useMemo<ContentDraftReadinessStep[]>(() => {
    const accountID = selectedBot?.twitter_account_id || 0;
    return [
      { key: "account", ready: Boolean(selectedAccount), href: "/accounts" },
      { key: "content", ready: selectedActiveContentItems.length > 0, href: accountID ? `/content-drafts?panel=content&account=${accountID}` : "/content-drafts?panel=content" },
      { key: "planner", ready: Boolean(selectedContentDraftPlan?.enabled), href: accountID ? `/content-drafts?panel=planner&account=${accountID}` : "/content-drafts?panel=planner" },
      { key: "autopilot", ready: Boolean(selectedContentDraftPlan?.enabled), href: accountID ? `/content-drafts?panel=planner&account=${accountID}` : "/content-drafts?panel=planner" },
    ];
  }, [selectedAccount, selectedActiveContentItems.length, selectedBot, selectedContentDraftPlan]);

  const selectedQueueItems = useMemo(() => {
    if (!selectedID) return [];
    return queueItems.filter((item) => item.bot_id === selectedID);
  }, [queueItems, selectedID]);

  const selectedQueueSummary = useMemo(() => summarizeQueue(selectedQueueItems), [selectedQueueItems]);

  const selectedAutomationStates = useMemo<BotAutomationState[]>(() => {
    return automationTypes.map((type) => {
      const automationModule = automationModules.find((item) => item.type === type);
      const mode = type === "post" ? selectedContentDraftPlan?.execution_mode || automationModule?.config.execution_mode || "review" : automationModule?.config.execution_mode || "review";
      return {
        type,
        enabled: type === "post" ? Boolean(selectedContentDraftPlan?.enabled) : Boolean(automationModule?.config.enabled),
        configured: type === "post" ? Boolean(selectedContentDraftPlan) : Boolean(automationModule),
        mode,
        href: automationHref(type),
      };
    });
  }, [automationModules, selectedContentDraftPlan]);
  const matrixRows = useMemo<BotMatrixRow[]>(() => {
    return bots.map((bot) => {
      const account = bot.twitter_account_id ? accountByID.get(bot.twitter_account_id) : undefined;
      const plan = contentDraftPlans.find((item) => item.bot_id === bot.id || item.x_account_id === bot.twitter_account_id);
      const compatibleContent = contentItems.filter((item) => contentItemMatchesBot(item, bot));
      const activeContentCount = compatibleContent.filter((item) => item.status === "active").length;
      const botQueueItems = queueItems.filter((item) => item.bot_id === bot.id);
      const usageByScene = aggregateMonthlyUsage(matrixUsageByBot[bot.id] || [], currentMonth);
      const monthlyUsage = usageSceneOrder.reduce((sum, scene) => sum + (usageByScene.get(scene)?.count ?? 0), 0);
      const feedback = matrixFeedbackByBot[bot.id] || [];
      const queueSummary = summarizeQueue(botQueueItems);
      const fallbackFlags = [
        ...(!account ? ["unbound"] : []),
        ...(!(account && plan?.enabled && activeContentCount > 0) ? ["auto_post_not_ready"] : []),
        ...(feedback.filter((item) => item.rating === "negative").length >= negativeFeedbackInspectionThreshold ? ["negative_feedback"] : []),
        ...(queueSummary.pendingReview >= reviewBacklogInspectionThreshold ? ["review_backlog"] : []),
      ];
      return {
        bot,
        account,
        completion: calculatePersonaCompleteness(botToPayload(bot, defaultPrimaryLanguage)),
        activeContentCount,
        queueSummary,
        plan,
        contentDraftReady: Boolean(account && plan?.enabled && activeContentCount > 0),
        monthlyUsage,
        negativeFeedback: feedback.filter((item) => item.rating === "negative").length,
        inspectionFlags: matrixInspectionFlagsByBot[bot.id] || fallbackFlags,
      };
    });
  }, [accountByID, contentDraftPlans, bots, contentItems, currentMonth, defaultPrimaryLanguage, matrixFeedbackByBot, matrixInspectionFlagsByBot, matrixUsageByBot, queueItems]);
  const matrixSummary = useMemo(() => {
    return matrixRows.reduce(
      (summary, row) => {
        summary.bound += row.account ? 1 : 0;
        summary.ready += row.contentDraftReady ? 1 : 0;
        summary.review += row.queueSummary.pendingReview;
        summary.usage += row.monthlyUsage;
        summary.negativeFeedback += row.negativeFeedback;
        return summary;
      },
      { bound: 0, ready: 0, review: 0, usage: 0, negativeFeedback: 0 },
    );
  }, [matrixRows]);
  const matrixInspectionItems = useMemo<MatrixInspectionItem[]>(() => {
    const unbound = matrixInspectionSummary?.unbound_count ?? matrixRows.filter((row) => !row.account).length;
    const contentDraftNotReady = matrixInspectionSummary?.auto_post_not_ready_count ?? matrixRows.filter((row) => !row.contentDraftReady).length;
    const negativeFeedback = matrixInspectionSummary?.negative_feedback_count ?? matrixRows.filter((row) => row.negativeFeedback >= negativeFeedbackInspectionThreshold).length;
    const reviewBacklog = matrixInspectionSummary?.review_backlog_count ?? matrixRows.filter((row) => row.queueSummary.pendingReview >= reviewBacklogInspectionThreshold).length;
    return [
      { key: "unbound", count: unbound, tone: unbound > 0 ? "warning" : "neutral" },
      { key: "auto_post_not_ready", count: contentDraftNotReady, tone: contentDraftNotReady > 0 ? "warning" : "neutral" },
      { key: "negative_feedback", count: negativeFeedback, tone: negativeFeedback > 0 ? "danger" : "neutral" },
      { key: "review_backlog", count: reviewBacklog, tone: reviewBacklog > 0 ? "danger" : "neutral" },
    ];
  }, [matrixInspectionSummary, matrixRows]);
  const filteredMatrixRows = useMemo(() => {
    if (matrixFilter === "all") return matrixRows;
    return matrixRows.filter((row) => {
      if (matrixFilter === "unbound") return row.inspectionFlags.includes("unbound");
      if (matrixFilter === "auto_post_not_ready") return row.inspectionFlags.includes("auto_post_not_ready");
      if (matrixFilter === "negative_feedback") return row.inspectionFlags.includes("negative_feedback");
      if (matrixFilter === "review_backlog") return row.inspectionFlags.includes("review_backlog");
      return true;
    });
  }, [matrixFilter, matrixRows]);

  const selectedAccountConflict = form.twitter_account_id ? accountBoundByOtherBot.get(form.twitter_account_id) : undefined;
  const personaCompleteness = useMemo(() => calculatePersonaCompleteness(form), [form]);
  const isDefaultLanguageConfig =
    (form.primary_language || defaultPrimaryLanguage) === defaultPrimaryLanguage && (form.language_strategy || "follow_context") === "follow_context";
  const activeStepIndex = wizardStepOrder.indexOf(activeStep);
  const personaChecklist = useMemo(() => getPersonaChecklist(form, t), [form, t]);
  const qualityDiagnostics = useMemo(() => getPersonaQualityDiagnostics(form, t), [form, t]);
  const stepCompletion = useMemo(() => getStepCompletion(form, Boolean(selectedID)), [form, selectedID]);
  const selectedAccountArchetype = useMemo(() => detectAccountArchetype(form), [form]);
  const styleRecommendationType = selectedAccountArchetype || "brand";
  const styleRecommendation = styleRecommendationPresets[styleRecommendationType];
  const topicGuardrailRecommendation = topicGuardrailRecommendationPresets[styleRecommendationType];
  const canTestBot = personaCompleteness >= 40;
  const nextSetupStep = wizardStepOrder.find((step) => !stepCompletion[step]) ?? "test";
  const showMatrixPanel = bots.length > 1;
  const usageNeedsAttention = usage.oafBots >= limits.maxBots || usage.aiGenerationsMonth >= limits.aiGenerationsMonthly;

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
      "aiSocialOpsOperator",
      "aiProductOperator",
      "saasFounderOperator",
      "founderOperatorAIWorkflows",
      "web3GrowthManager",
      "web3GrowthOperator",
      "aiProductManager",
      "cryptoResearcher",
      "communityGrowthLead",
      "communityManager",
      "kolCreatorOperator",
      "founder",
      "developerAdvocate",
      "contentCreator",
      "kolAssistant",
      "agencyClientOperator",
      "productLedGrowthOperator",
    ], t),
    [t],
  );
  const industryOptions = useMemo(
    () =>
      optionKeys(
        "industry",
        [
          "ai",
          "web3",
          "socialfi",
          "saas",
          "marketingGrowth",
          "creatorEconomy",
          "developerTools",
          "b2bSoftware",
          "fintech",
          "ecommerce",
          "edtech",
          "mediaNewsletter",
          "communityDao",
          "consumerApps",
          "agencyServices",
          "gaming",
          "cryptoTrading",
          "defi",
          "nft",
          "realEstate",
          "healthWellness",
        ],
        t,
      ),
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
  const ctaOptions = useMemo(
    () => optionKeys("ctaPresets", ["websiteIntro", "tryOafBot", "followCases", "telegramCommunity", "noLinkEveryPost"], t),
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
  const productizedLearningRules = useMemo(() => {
    const learned = learningVerdictStats
      .filter((stat) => stat.accurate > 0 && stat.accuracy_rate >= 0.66)
      .sort((a, b) => b.accuracy_rate - a.accuracy_rate || b.accurate - a.accurate)
      .slice(0, 6);
    const learnedIssues = new Set(learned.map((item) => item.feedback_issue));
    const preferenceOnly = learningRulePreferences
      .filter((item) => !learnedIssues.has(item.feedback_issue))
      .map((item) => ({
        feedback_issue: item.feedback_issue,
        accurate: 0,
        irrelevant: 0,
        total: 0,
        accuracy_rate: 0,
        reasons: [],
      }));
    return [...learned, ...preferenceOnly].slice(0, 8);
  }, [learningRulePreferences, learningVerdictStats]);

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
  const trendRegionOptions = useMemo<ChipOption[]>(
    () => trendRegionValues.map((value) => ({ value, label: t(`contentDrafts.trends.region.${value}`) })),
    [t],
  );
  const trendCategoryOptions = useMemo<ChipOption[]>(
    () => trendCategoryValues.map((value) => ({ value, label: t(`contentDrafts.trends.category.${value}`) })),
    [t],
  );
  const sensitiveTrendPolicyOptions = useMemo<SelectOption[]>(
    () => sensitiveTrendPolicyValues.map((value) => ({ value, label: t(`contentDrafts.trends.policy.${value}`) })),
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
        contentDraftService.plans(),
        reviewQueueService.list({ pageSize: 100 }),
        contentLibraryService.list({ limit: 100 }),
      ]);
      setAutomationModules(automationData.modules.filter((module) => module.type !== "dm"));
      setContentDraftPlans(planData.items);
      setQueueItems(queueData.items);
      setContentItems(contentData.items);
    } catch {
      setAutomationModules([]);
      setContentDraftPlans([]);
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
    try {
      const data = await oafBotService.generationUsages(botID);
      setGenerationUsages(data.items);
    } catch (error) {
      pushToast(errorMessage(error, t("oafBots.usages.loadFailed")));
      setGenerationUsages([]);
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

  const loadLearningRulePreferences = useCallback(async (botID: number) => {
    try {
      const data = await oafBotService.learningRulePreferences(botID);
      setLearningRulePreferences(data.items);
      setDisabledLearningIssues(data.items.filter((item) => item.status === "disabled").map((item) => item.feedback_issue));
    } catch {
      setLearningRulePreferences([]);
      setDisabledLearningIssues([]);
    }
  }, []);

  const loadLearningVerdictStats = useCallback(async () => {
    try {
      const data = await reviewQueueService.feedbackIssueVerdictStats();
      setLearningVerdictStats(data.issues || []);
    } catch {
      setLearningVerdictStats([]);
    }
  }, []);

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

  useEffect(() => {
    if (!selectedID) {
      setDisabledLearningIssues([]);
      setLearningRulePreferences([]);
      return;
    }
    void loadLearningRulePreferences(selectedID);
  }, [loadLearningRulePreferences, selectedID]);

  useEffect(() => {
    void loadLearningVerdictStats();
  }, [loadLearningVerdictStats]);

  const loadMatrixSignals = useCallback(async (items: OAFBot[]) => {
    if (items.length === 0) {
      setMatrixUsageByBot({});
      setMatrixFeedbackByBot({});
      setMatrixInspectionFlagsByBot({});
      setMatrixInspectionSummary(null);
      return;
    }
    setMatrixLoading(true);
    try {
      const signals = await oafBotService.matrixSignals();
      const knownIDs = new Set(items.map((bot) => bot.id));
      const usageByBot: Record<number, OAFBotGenerationUsage[]> = {};
      const feedbackByBot: Record<number, OAFBotGenerationFeedback[]> = {};
      const flagsByBot: Record<number, string[]> = {};
      signals.items.forEach((item) => {
        if (!knownIDs.has(item.bot_id)) return;
        usageByBot[item.bot_id] = item.usages || [];
        feedbackByBot[item.bot_id] = item.feedback || [];
        flagsByBot[item.bot_id] = item.inspection_flags || [];
      });
      items.forEach((bot) => {
        usageByBot[bot.id] ||= [];
        feedbackByBot[bot.id] ||= [];
        flagsByBot[bot.id] ||= [];
      });
      setMatrixUsageByBot(usageByBot);
      setMatrixFeedbackByBot(feedbackByBot);
      setMatrixInspectionFlagsByBot(flagsByBot);
      setMatrixInspectionSummary(signals.summary || null);
    } catch {
      setMatrixUsageByBot(Object.fromEntries(items.map((bot) => [bot.id, []])));
      setMatrixFeedbackByBot(Object.fromEntries(items.map((bot) => [bot.id, []])));
      setMatrixInspectionFlagsByBot({});
      setMatrixInspectionSummary(null);
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

  const applyAccountArchetype = (type: AccountArchetypeKey) => {
    setForm((prev) => applyAccountArchetypePreset(prev, type));
    pushToast(t("oafBots.accountType.applied", { type: t(`oafBots.accountType.${type}.title`) }));
  };

  const applyStyleRecommendation = () => {
    setForm((prev) => ({
      ...prev,
      personality_tags: styleRecommendation.personalityTags,
      voice_tone: styleRecommendation.voiceTone,
      mbti: styleRecommendation.mbti,
    }));
    pushToast(t("oafBots.styleRecommendation.applied"));
  };

  const applyTopicGuardrailRecommendation = () => {
    setForm((prev) => ({
      ...prev,
      topics: mergeUniqueValues(prev.topics, topicGuardrailRecommendation.topics),
      content_pillars: mergeUniqueValues(prev.content_pillars, topicGuardrailRecommendation.contentPillars),
      forbidden_topics: mergeUniqueValues(prev.forbidden_topics, topicGuardrailRecommendation.forbiddenTopics),
      avoid_claims: mergeUniqueValues(prev.avoid_claims, topicGuardrailRecommendation.avoidClaims),
      compliance_notes: mergeRuleText(prev.compliance_notes, topicGuardrailRecommendation.complianceNotes),
      safety_mode: topicGuardrailRecommendation.safetyMode || prev.safety_mode,
    }));
    pushToast(t("oafBots.topicGuardrailRecommendation.applied"));
  };

  const selectBot = (bot: OAFBot) => {
    setSelectedID(bot.id);
    setForm(botToPayload(bot, defaultPrimaryLanguage));
    setActiveStep("identity");
    setSamples(null);
    setLearningComparison(null);
    setSampleContexts({});
    setFeedbackDraft({ rating: "", issueTags: [], comment: "" });
    setCompleteProfilePreview(null);
    setFeedbackSuggestionPreview(null);
    setSafetyRewritePreview(null);
    setPendingAppliedFormChange(null);
    void loadLearningRulePreferences(bot.id);
  };

  const startCreate = () => {
    setSelectedID(null);
    setForm(createEmptyForm(defaultPrimaryLanguage));
    setActiveStep("identity");
    setSamples(null);
    setLearningComparison(null);
    setGenerationUsages([]);
    setGenerationFeedback([]);
    setDisabledLearningIssues([]);
    setLearningRulePreferences([]);
    setSampleContexts({});
    setFeedbackDraft({ rating: "", issueTags: [], comment: "" });
    setCompleteProfilePreview(null);
    setFeedbackSuggestionPreview(null);
    setSafetyRewritePreview(null);
    setPendingAppliedFormChange(null);
  };

  const goStep = (direction: "previous" | "next") => {
    const nextIndex = direction === "previous" ? Math.max(0, activeStepIndex - 1) : Math.min(wizardStepOrder.length - 1, activeStepIndex + 1);
    setActiveStep(wizardStepOrder[nextIndex]);
  };

  const goTestStep = () => {
    setActiveStep("test");
  };

  const toggleLearningIssue = async (issue: string) => {
    const key = issue.trim();
    if (!key) return;
    if (!selectedID) return;
    const nextStatus = disabledLearningIssues.includes(key) ? "enabled" : "disabled";
    setDisabledLearningIssues((current) => (nextStatus === "disabled" ? [...new Set([...current, key])] : current.filter((item) => item !== key)));
    setLearningRulePreferences((current) => {
      const rest = current.filter((item) => item.feedback_issue !== key);
      return [...rest, { bot_id: selectedID, feedback_issue: key, status: nextStatus }];
    });
    try {
      await oafBotService.saveLearningRulePreference(selectedID, key, nextStatus);
      pushToast(t(nextStatus === "disabled" ? "oafBots.samples.learningRuleSavedDisabled" : "oafBots.samples.learningRuleSavedEnabled"));
    } catch (error) {
      setDisabledLearningIssues((current) => (nextStatus === "disabled" ? current.filter((item) => item !== key) : [...new Set([...current, key])]));
      setLearningRulePreferences((current) => {
        const rest = current.filter((item) => item.feedback_issue !== key);
        return nextStatus === "disabled" ? rest : [...rest, { bot_id: selectedID, feedback_issue: key, status: "disabled" }];
      });
      pushToast(errorMessage(error, t("oafBots.samples.learningRuleSaveFailed")));
    }
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
      setCompleteProfilePreview(null);
      setFeedbackSuggestionPreview(null);
      setSafetyRewritePreview(null);
      setPendingAppliedFormChange(null);
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

  const deleteSelectedBot = async () => {
    if (!selectedBot || deletingBot) return;
    const name = selectedBot.name || t("oafBots.preview.unnamed");
    const confirmed = await confirm({
      title: t("oafBots.delete.confirmTitle"),
      description: t("oafBots.delete.confirm", { name }),
      confirmLabel: t("oafBots.delete.action"),
      tone: "destructive",
    });
    if (!confirmed) return;
    setDeletingBot(true);
    try {
      await oafBotService.delete(selectedBot.id);
      const remaining = bots.filter((item) => item.id !== selectedBot.id);
      setBots(remaining);
      setUsage((prev) => ({ ...prev, oafBots: Math.max(0, prev.oafBots - 1) }));
      setMatrixUsageByBot((current) => {
        const next = { ...current };
        delete next[selectedBot.id];
        return next;
      });
      setMatrixFeedbackByBot((current) => {
        const next = { ...current };
        delete next[selectedBot.id];
        return next;
      });
      setMatrixInspectionFlagsByBot((current) => {
        const next = { ...current };
        delete next[selectedBot.id];
        return next;
      });
      setSamples(null);
      setLearningComparison(null);
      setGenerationUsages([]);
      setGenerationFeedback([]);
      setDisabledLearningIssues([]);
      setLearningRulePreferences([]);
      setSampleContexts({});
      setFeedbackDraft({ rating: "", issueTags: [], comment: "" });
      setCompleteProfilePreview(null);
      setFeedbackSuggestionPreview(null);
      setSafetyRewritePreview(null);
      setPendingAppliedFormChange(null);
      const next = remaining[0] || null;
      if (next) {
        setSelectedID(next.id);
        setForm(botToPayload(next, defaultPrimaryLanguage));
        setActiveStep("identity");
        void loadLearningRulePreferences(next.id);
      } else {
        setSelectedID(null);
        setForm(createEmptyForm(defaultPrimaryLanguage));
        setActiveStep("identity");
      }
      void loadRelationshipContext();
      broadcastDataSynced(Date.now());
      pushToast(t("oafBots.delete.deleted"));
    } catch (error) {
      pushToast(errorMessage(error, t("oafBots.delete.failed")));
    } finally {
      setDeletingBot(false);
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
      setCompleteProfilePreview(result);
      setUsage((prev) => ({ ...prev, aiGenerationsMonth: prev.aiGenerationsMonth + (result.usage_consumed || 1) }));
      pushToast(t("oafBots.completeProfile.previewReady"));
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

  const applyCompleteProfilePreview = () => {
    if (!completeProfilePreview) return;
    const changedCount = getFeedbackSuggestionDiffs(form, completeProfilePreview.profile).length;
    setForm((prev) => mergeFeedbackSuggestionProfile(prev, completeProfilePreview.profile));
    setSamples(null);
    setCompleteProfilePreview(null);
    setPendingAppliedFormChange({ source: "complete_profile", count: changedCount });
    pushToast(t("oafBots.completeProfile.success"));
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
      const result = await oafBotService.testGenerate(selectedID, sampleScene, sampleContexts[sampleScene], disabledLearningIssues);
      setSamples(result);
      setLearningComparison(null);
      setSafetyRewritePreview(null);
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

  const compareWithoutLearningRules = async () => {
    if (!selectedID || !samples) return;
    const appliedIssues = (samples.feedback_signal_summary?.applied_learning_rules || []).map((rule) => rule.issue).filter(Boolean);
    if (appliedIssues.length === 0) {
      pushToast(t("oafBots.learningCompare.noRules"));
      return;
    }
    setComparingLearning(true);
    try {
      const disabledForCompare = Array.from(new Set([...disabledLearningIssues, ...appliedIssues]));
      const result = await oafBotService.testGenerate(selectedID, sampleScene, sampleContexts[sampleScene], disabledForCompare);
      setLearningComparison(result);
      await loadGenerationUsages(selectedID);
      setUsage((prev) => ({ ...prev, aiGenerationsMonth: prev.aiGenerationsMonth + (result.usage_consumed || 1) }));
      pushToast(t("oafBots.learningCompare.ready"));
    } catch (error) {
      const body = getErrorBody(error);
      if (body?.error_code === "ai_generation_quota_exceeded") {
        pushToast(t("oafBots.test.quotaExceeded"));
      } else {
        pushToast(body?.message || t("oafBots.learningCompare.failed"));
      }
    } finally {
      setComparingLearning(false);
    }
  };

  const rewriteSampleForSafety = async () => {
    if (!selectedID || !samples) return;
    const content = normalizeSampleContent(samples, sampleScene);
    if (!content.trim()) {
      pushToast(t("oafBots.safetyRewrite.needContent"));
      return;
    }
    setRewritingSafety(true);
    try {
      const result = await oafBotService.rewriteSafety(selectedID, {
        scene: sampleScene,
        content,
        sample_context: sampleContexts[sampleScene] || "",
        rewrite_mode: safetyRewriteMode,
        matched_hits: samples.safety_evaluation?.matched_hits || [],
        disabled_learning_issues: disabledLearningIssues,
      });
      setSafetyRewritePreview({ before: content, result });
      setUsage((prev) => ({ ...prev, aiGenerationsMonth: prev.aiGenerationsMonth + (result.usage_consumed || 1) }));
      await loadGenerationUsages(selectedID);
      void loadMatrixSignals(bots);
      pushToast(t("oafBots.safetyRewrite.previewReady"));
    } catch (error) {
      const body = getErrorBody(error);
      if (body?.error_code === "ai_generation_quota_exceeded") {
        pushToast(t("oafBots.test.quotaExceeded"));
      } else {
        pushToast(body?.message || t("oafBots.safetyRewrite.failed"));
      }
    } finally {
      setRewritingSafety(false);
    }
  };

  const applySafetyRewritePreview = () => {
    if (!safetyRewritePreview) return;
    setSamples(safetyRewritePreview.result);
    setSafetyRewritePreview(null);
    pushToast(t("oafBots.safetyRewrite.applied"));
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

  const deleteGenerationFeedback = async (feedbackID: number) => {
    if (!selectedID) return;
    setFeedbackDeletingID(feedbackID);
    try {
      await oafBotService.deleteGenerationFeedback(selectedID, feedbackID);
      setGenerationFeedback((items) => items.filter((item) => item.id !== feedbackID));
      setMatrixFeedbackByBot((prev) => ({ ...prev, [selectedID]: (prev[selectedID] || []).filter((item) => item.id !== feedbackID) }));
      pushToast(t("oafBots.feedback.deleted"));
    } catch (error) {
      pushToast(errorMessage(error, t("oafBots.feedback.deleteFailed")));
    } finally {
      setFeedbackDeletingID(null);
    }
  };

  const generateFeedbackProfileSuggestion = async () => {
    if (!selectedID) return;
    if (generationFeedback.filter((item) => item.rating === "negative").length === 0) {
      pushToast(t("oafBots.feedbackSuggestion.needNegative"));
      return;
    }
    setFeedbackSuggestionLoading(true);
    try {
      const result = await oafBotService.suggestProfileFromFeedback(selectedID);
      setFeedbackSuggestionPreview(result);
      setUsage((prev) => ({ ...prev, aiGenerationsMonth: prev.aiGenerationsMonth + (result.usage_consumed || 1) }));
      pushToast(t("oafBots.feedbackSuggestion.previewReady", { count: result.feedback_count || 0 }));
    } catch (error) {
      const body = getErrorBody(error);
      if (body?.error_code === "ai_generation_quota_exceeded") {
        pushToast(t("oafBots.test.quotaExceeded"));
      } else {
        pushToast(body?.message || t("oafBots.feedbackSuggestion.failed"));
      }
    } finally {
      setFeedbackSuggestionLoading(false);
    }
  };

  const applyFeedbackProfileSuggestion = () => {
    if (!feedbackSuggestionPreview) return;
    const changedCount = getFeedbackSuggestionDiffs(form, feedbackSuggestionPreview.profile).length;
    setForm((prev) => mergeFeedbackSuggestionProfile(prev, feedbackSuggestionPreview.profile));
    setActiveStep("goals");
    setSamples(null);
    setFeedbackSuggestionPreview(null);
    setPendingAppliedFormChange({ source: "feedback_suggestion", count: changedCount });
    pushToast(t("oafBots.feedbackSuggestion.applied", { count: feedbackSuggestionPreview.feedback_count || 0 }));
  };

  const handleSampleSceneChange = (scene: SampleScene) => {
    setSampleScene(scene);
    setSamples(null);
    setLearningComparison(null);
    setSafetyRewritePreview(null);
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

      <OAFBotFocusPanel
        t={t}
        bot={selectedBot}
        botCount={bots.length}
        account={selectedAccount}
        completion={personaCompleteness}
        nextStep={nextSetupStep}
        canCreate={canCreate}
        canTest={canTestBot}
        formChanged={formChanged}
        activeContentCount={selectedActiveContentItems.length}
        queueSummary={selectedQueueSummary}
        onCreate={startCreate}
        onStepChange={setActiveStep}
        onTest={handlePreviewTest}
      />

      <details open={usageNeedsAttention} className="rounded-2xl border border-[#2f3336] bg-black p-4 md:p-5">
        <summary className="cursor-pointer list-none">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#e7e9ea]">{t("oafBots.usageDetails.title")}</p>
              <p className="mt-1 text-sm leading-relaxed text-[#71767b]">{t("oafBots.usageDetails.description")}</p>
            </div>
            <span className="rounded-full border border-[#2f3336] bg-[#0f1419] px-3 py-1 text-xs text-[#71767b]">
              {usageNeedsAttention ? t("oafBots.usageDetails.needsAttention") : t("oafBots.usageDetails.expand")}
            </span>
          </div>
        </summary>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <QuotaCard label={t("oafBots.quota.oafBots")} used={usage.oafBots} limit={limits.maxBots} />
          <QuotaCard label={t("oafBots.quota.xAccounts")} used={usage.twitterAccounts} limit={limits.maxTwitterAccounts} />
          <QuotaCard label={t("oafBots.quota.aiMonthly")} used={usage.aiGenerationsMonth} limit={limits.aiGenerationsMonthly} />
          <QuotaCard
            label={t("oafBots.quota.opportunityDrafts")}
            used={usage.opportunityDraftsMonth ?? usage.autoCommentsMonth}
            limit={limits.monthlyOpportunityDrafts ?? limits.monthlyAutoComments}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#2f3336] bg-[#0f1419] px-4 py-3 text-sm text-[#e7e9ea]">
          <p className="min-w-0 break-words">{t("oafBots.planHint", { bots: limits.maxBots, accounts: limits.maxTwitterAccounts })}</p>
          <Link href="/billing" className="inline-flex shrink-0 items-center gap-1 font-semibold text-[#1d9bf0] hover:text-[#8ecdf8]">
            {t("oafBots.planHintCta")}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </details>

      {showMatrixPanel ? (
        <BotMatrixPanel
          t={t}
          rows={filteredMatrixRows}
          allRowsCount={matrixRows.length}
          summary={matrixSummary}
          inspectionItems={matrixInspectionItems}
          activeFilter={matrixFilter}
          onFilterChange={setMatrixFilter}
          loading={matrixLoading || relationshipLoading}
          enabled={limits.multiBotMatrix}
          selectedID={selectedID}
          onSelect={selectBot}
        />
      ) : null}

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

        <div id="oaf-bot-editor" className="grid min-w-0 scroll-mt-24 gap-5">
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
                <AccountArchetypePicker
                  t={t}
                  selected={selectedAccountArchetype}
                  onSelect={applyAccountArchetype}
                />
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
                    initialOptionCount={10}
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
                      <div className="md:col-span-3">
                        <TextArea
                          label={t("oafBots.fields.identitySummary")}
                          value={form.identity_summary}
                          onChange={(value) => updateForm("identity_summary", value)}
                          placeholder={t("oafBots.placeholders.identitySummary")}
                          helper={t("oafBots.helpers.identitySummary")}
                          minHeightClass="min-h-[140px]"
                        />
                      </div>
                    </div>
                  </details>
                </div>
              </WizardPanel>
            ) : null}

            {activeStep === "brand" ? (
              <WizardPanel title={t("oafBots.section.brand")} description={t("oafBots.section.brandDesc")}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="md:col-span-2 rounded-2xl border border-sky-400/20 bg-sky-400/[0.07] p-4 text-sm text-sky-50/85">
                    <div className="flex items-start gap-3">
                      <Info className="mt-0.5 size-4 shrink-0 text-[#1d9bf0]" />
                      <div className="space-y-1">
                        <p className="font-semibold text-[#e7e9ea]">{t("oafBots.brandLanguageHint.title")}</p>
                        <p className="text-xs leading-5 text-[#8b98a5]">{t("oafBots.brandLanguageHint.description")}</p>
                      </div>
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <TextArea
                      label={t("oafBots.fields.projectOneLiner")}
                      value={form.project_one_liner}
                      onChange={(value) => updateForm("project_one_liner", value)}
                      placeholder={t("oafBots.placeholders.projectOneLiner")}
                      helper={t("oafBots.helpers.projectOneLiner")}
                      minHeightClass="min-h-[150px]"
                      recommended
                    />
                  </div>
                  <div className="md:col-span-2">
                    <TextArea
                      label={t("oafBots.fields.targetAudience")}
                      value={form.target_audience}
                      onChange={(value) => updateForm("target_audience", value)}
                      placeholder={t("oafBots.placeholders.targetAudience")}
                      helper={t("oafBots.helpers.targetAudience")}
                      minHeightClass="min-h-[150px]"
                      recommended
                    />
                  </div>
                  <div className="md:col-span-2">
                    <TextArea
                      label={t("oafBots.fields.coreValueProps")}
                      value={form.core_value_props}
                      onChange={(value) => updateForm("core_value_props", value)}
                      placeholder={t("oafBots.placeholders.coreValueProps")}
                      helper={t("oafBots.helpers.coreValueProps")}
                      minHeightClass="min-h-[170px]"
                      recommended
                    />
                  </div>
                  <details className="md:col-span-2 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-5">
                    <summary className="cursor-pointer list-none text-sm font-semibold text-[#e7e9ea]">
                      {t("oafBots.advancedProduct.title")}
                    </summary>
                    <p className="mt-2 text-xs leading-5 text-[#71767b]">{t("oafBots.advancedProduct.description")}</p>
                    <div className="mt-5 space-y-5">
                      <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                        <div className="mb-4">
                          <p className="text-sm font-semibold text-[#e7e9ea]">{t("oafBots.advancedProduct.memoryTitle")}</p>
                          <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("oafBots.advancedProduct.memoryDescription")}</p>
                        </div>
                        <div className="grid gap-5">
                          <TextArea
                            label={t("oafBots.fields.productFeatures")}
                            value={form.product_features}
                            onChange={(value) => updateForm("product_features", value)}
                            placeholder={t("oafBots.placeholders.productFeatures")}
                            helper={t("oafBots.helpers.productFeatures")}
                            minHeightClass="min-h-[180px]"
                          />
                          <TextArea
                            label={t("oafBots.fields.differentiators")}
                            value={form.differentiators}
                            onChange={(value) => updateForm("differentiators", value)}
                            placeholder={t("oafBots.placeholders.differentiators")}
                            helper={t("oafBots.helpers.differentiators")}
                            minHeightClass="min-h-[180px]"
                          />
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                        <div className="mb-4">
                          <p className="text-sm font-semibold text-[#e7e9ea]">{t("oafBots.advancedProduct.routingTitle")}</p>
                          <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("oafBots.advancedProduct.routingDescription")}</p>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <TextField
                            label={t("oafBots.fields.websiteUrl")}
                            value={form.website_url}
                            onChange={(value) => updateForm("website_url", value)}
                            placeholder={t("oafBots.placeholders.websiteUrl")}
                            helper={t("oafBots.helpers.websiteUrl")}
                          />
                          <TextField
                            label={t("oafBots.fields.telegramUrl")}
                            value={form.telegram_url}
                            onChange={(value) => updateForm("telegram_url", value)}
                            placeholder={t("oafBots.placeholders.telegramUrl")}
                            helper={t("oafBots.helpers.telegramUrl")}
                          />
                          <TextField
                            label={t("oafBots.fields.discordUrl")}
                            value={form.discord_url}
                            onChange={(value) => updateForm("discord_url", value)}
                            placeholder={t("oafBots.placeholders.discordUrl")}
                            helper={t("oafBots.helpers.discordUrl")}
                          />
                          <TextField
                            label={t("oafBots.fields.docsUrl")}
                            value={form.docs_url}
                            onChange={(value) => updateForm("docs_url", value)}
                            placeholder={t("oafBots.placeholders.docsUrl")}
                            helper={t("oafBots.helpers.docsUrl")}
                          />
                        </div>
                        <div className="mt-5">
                          <TextArea
                            label={t("oafBots.fields.ctaPolicy")}
                            value={form.cta_policy}
                            onChange={(value) => updateForm("cta_policy", value)}
                            placeholder={t("oafBots.placeholders.ctaPolicy")}
                            helper={t("oafBots.helpers.ctaPolicy")}
                            minHeightClass="min-h-[170px]"
                          />
                          <div className="mt-3 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3">
                            <p className="text-xs font-semibold text-[#e7e9ea]">{t("oafBots.advancedProduct.ctaTipsTitle")}</p>
                            <div className="mt-2 grid gap-2 text-xs leading-5 text-[#8b98a5] sm:grid-cols-2">
                              <p>{t("oafBots.advancedProduct.ctaTipWebsite")}</p>
                              <p>{t("oafBots.advancedProduct.ctaTipTelegram")}</p>
                              <p>{t("oafBots.advancedProduct.ctaTipDocs")}</p>
                              <p>{t("oafBots.advancedProduct.ctaTipNoSpam")}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </details>
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
                <StyleRecommendationPanel
                  t={t}
                  type={styleRecommendationType}
                  preset={styleRecommendation}
                  personalityOptions={personalityOptions}
                  onApply={applyStyleRecommendation}
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
                <div className="mt-4">
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
                <details className="mt-4 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-[#e7e9ea]">
                    {t("oafBots.advancedStyle.title")}
                  </summary>
                  <p className="mt-2 text-xs leading-5 text-[#71767b]">{t("oafBots.advancedStyle.description")}</p>
                  <div className="mt-4">
                    <SelectField
                      label={t("oafBots.fields.mbti")}
                      value={form.mbti}
                      onChange={(value) => updateForm("mbti", value)}
                      options={mbtiOptions}
                      helper={t("oafBots.helpers.mbti")}
                    />
                  </div>
                </details>
              </WizardPanel>
            ) : null}

            {activeStep === "topics" ? (
              <WizardPanel title={t("oafBots.section.topics")} description={t("oafBots.section.topicsDesc")}>
                <TopicGuardrailRecommendationPanel
                  t={t}
                  type={styleRecommendationType}
                  preset={topicGuardrailRecommendation}
                  topicOptions={topicOptions}
                  contentPillarOptions={contentPillarOptions}
                  forbiddenTopicOptions={forbiddenTopicOptions}
                  avoidClaimOptions={avoidClaimOptions}
                  onApply={applyTopicGuardrailRecommendation}
                />
                <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                  <div className="min-w-0 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
                    <p className="text-sm font-semibold text-[#e7e9ea]">{t("oafBots.topicStructure.prioritizeTitle")}</p>
                    <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("oafBots.topicStructure.prioritizeDescription")}</p>
                    <div className="mt-4">
                      <TagPicker
                        label={t("oafBots.fields.topics")}
                        values={form.topics}
                        options={topicOptions}
                        onChange={(values) => updateForm("topics", values)}
                        helper={t("oafBots.helpers.topics")}
                        placeholder={t("oafBots.placeholders.tagInput")}
                        recommended
                      />
                    </div>
                  </div>
                  <div className="min-w-0 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
                    <p className="text-sm font-semibold text-[#e7e9ea]">{t("oafBots.topicStructure.pillarsTitle")}</p>
                    <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("oafBots.topicStructure.pillarsDescription")}</p>
                    <div className="mt-4">
                      <TagPicker
                        label={t("oafBots.fields.contentPillars")}
                        values={form.content_pillars}
                        options={contentPillarOptions}
                        onChange={(values) => updateForm("content_pillars", values)}
                        helper={t("oafBots.helpers.contentPillars")}
                        placeholder={t("oafBots.placeholders.tagInput")}
                        recommended
                      />
                    </div>
                  </div>
                </div>
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
                <details className="mt-4 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-[#e7e9ea]">
                    {t("oafBots.advancedTrends.title")}
                  </summary>
                  <p className="mt-2 text-xs leading-5 text-[#71767b]">{t("oafBots.advancedTrends.description")}</p>
                  <Link href="/exposure-radar?view=source-health" className="mt-3 inline-flex h-8 items-center justify-center rounded-full border border-[#2f3336] px-3 text-xs font-semibold text-[#8ecdf8] transition hover:bg-[#16181c]">
                    {t("oafBots.advancedTrends.viewCurrent")}
                  </Link>
                  <div className="mt-4 grid gap-4">
                    <TagPicker
                      label={t("oafBots.fields.trendRegions")}
                      values={form.trend_regions}
                      options={trendRegionOptions}
                      onChange={(values) => updateForm("trend_regions", values)}
                      helper={t("oafBots.helpers.trendRegions")}
                      placeholder={t("oafBots.placeholders.tagInput")}
                    />
                    <TagPicker
                      label={t("oafBots.fields.trendCategories")}
                      values={form.trend_categories}
                      options={trendCategoryOptions}
                      onChange={(values) => updateForm("trend_categories", values)}
                      helper={t("oafBots.helpers.trendCategories")}
                      placeholder={t("oafBots.placeholders.tagInput")}
                    />
                    <div className="grid gap-4 md:grid-cols-2">
                      <SelectField
                        label={t("oafBots.fields.sensitiveTrendPolicy")}
                        value={form.sensitive_trend_policy}
                        onChange={(value) => updateForm("sensitive_trend_policy", value as OAFBotPayload["sensitive_trend_policy"])}
                        options={sensitiveTrendPolicyOptions}
                        helper={t("oafBots.helpers.sensitiveTrendPolicy")}
                      />
                      <label className="flex items-start gap-3 rounded-[8px] border border-[#2f3336] bg-black p-3">
                        <input
                          type="checkbox"
                          checked={form.allow_general_trends}
                          onChange={(event) => updateForm("allow_general_trends", event.target.checked)}
                          className="mt-1 size-4 accent-[#1d9bf0]"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-[#e7e9ea]">{t("oafBots.fields.allowGeneralTrends")}</span>
                          <span className="mt-1 block text-xs leading-5 text-[#71767b]">{t("oafBots.helpers.allowGeneralTrends")}</span>
                        </span>
                      </label>
                    </div>
                  </div>
                </details>
              </WizardPanel>
            ) : null}

            {activeStep === "goals" ? (
              <WizardPanel title={t("oafBots.section.goals")} description={t("oafBots.section.goalsDesc")}>
                <div className="mb-4 rounded-2xl border border-[#1d9bf0]/25 bg-[#1d9bf0]/8 p-4">
                  <div className="flex items-start gap-3">
                    <Info className="mt-0.5 size-4 shrink-0 text-[#1d9bf0]" />
                    <div>
                      <p className="text-sm font-semibold text-[#e7e9ea]">{t("oafBots.growthRouting.title")}</p>
                      <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("oafBots.growthRouting.description")}</p>
                    </div>
                  </div>
                </div>
                <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                  <ChipTextArea
                    label={t("oafBots.fields.growthGoal")}
                    value={form.growth_goal}
                    onChange={(value) => updateForm("growth_goal", value)}
                    placeholder={t("oafBots.placeholders.growthGoal")}
                    helper={t("oafBots.helpers.growthGoal")}
                    options={growthGoalOptions}
                    recommended
                  />
                  <ChipTextArea
                    label={t("oafBots.fields.preferredCTA")}
                    value={form.preferred_cta}
                    onChange={(value) => updateForm("preferred_cta", value)}
                    placeholder={t("oafBots.placeholders.preferredCTA")}
                    helper={t("oafBots.helpers.preferredCTA")}
                    options={ctaOptions}
                  />
                  <details className="xl:col-span-2 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
                    <summary className="cursor-pointer list-none text-sm font-semibold text-[#e7e9ea]">
                      {t("oafBots.advancedGoals.title")}
                    </summary>
                    <p className="mt-2 text-xs leading-5 text-[#71767b]">{t("oafBots.advancedGoals.description")}</p>
                    <div className="mt-4 grid gap-4 xl:grid-cols-2">
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
                  </details>
                </div>
              </WizardPanel>
            ) : null}

            {activeStep === "test" ? (
              <WizardPanel title={t("oafBots.section.test")} description={t("oafBots.section.testDesc")}>
                <details className="mb-4 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-[#e7e9ea]">
                    {t("oafBots.learningCenter.advancedSummary")}
                  </summary>
                  <div className="mt-3">
                    <LearningRulesCenter
                      rules={productizedLearningRules}
                      preferences={learningRulePreferences}
                      disabledLearningIssues={disabledLearningIssues}
                      issueOptions={feedbackIssueOptions}
                      selectedBotName={selectedBot?.name || ""}
                      onToggleLearningIssue={toggleLearningIssue}
                    />
                  </div>
                </details>
                <SamplePanel
                  t={t}
                  samples={samples}
                  learningComparison={learningComparison}
                  scene={sampleScene}
                  onSceneChange={handleSampleSceneChange}
                  sampleContext={sampleContexts[sampleScene] || ""}
                  onSampleContextChange={(value) => setSampleContexts((prev) => ({ ...prev, [sampleScene]: value }))}
                  generating={generating}
                  comparingLearning={comparingLearning}
                  rewritingSafety={rewritingSafety}
                  safetyRewriteMode={safetyRewriteMode}
                  onSafetyRewriteModeChange={setSafetyRewriteMode}
                  onGenerate={testGenerate}
                  onCompareWithoutLearning={compareWithoutLearningRules}
                  onRewriteSafety={rewriteSampleForSafety}
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
                  feedbackDeletingID={feedbackDeletingID}
                  feedbackDraft={feedbackDraft}
                  feedbackSaving={feedbackSaving}
                  feedbackSuggestionLoading={feedbackSuggestionLoading}
                  feedbackSuggestionPreview={feedbackSuggestionPreview}
                  safetyRewritePreview={safetyRewritePreview}
                  feedbackIssueOptions={feedbackIssueOptions}
                  disabledLearningIssues={disabledLearningIssues}
                  onFeedbackDraftChange={setFeedbackDraft}
                  onFeedbackSubmit={submitGenerationFeedback}
                  onFeedbackDelete={deleteGenerationFeedback}
                  onFeedbackProfileSuggestion={generateFeedbackProfileSuggestion}
                  onApplyFeedbackSuggestion={applyFeedbackProfileSuggestion}
                  onDismissFeedbackSuggestion={() => setFeedbackSuggestionPreview(null)}
                  onApplySafetyRewrite={applySafetyRewritePreview}
                  onDismissSafetyRewrite={() => setSafetyRewritePreview(null)}
                  onToggleLearningIssue={toggleLearningIssue}
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
                  <div>
                    <p>{t("oafBots.test.unsavedHint")}</p>
                    {pendingAppliedFormChange ? (
                      <p className="mt-1 text-xs text-blue-100/80">
                        {t("oafBots.pendingAppliedChange.summary", {
                          source: t(`oafBots.pendingAppliedChange.source.${pendingAppliedFormChange.source}`),
                          count: pendingAppliedFormChange.count,
                        })}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            <ProfileDiffPreview
              t={t}
              visible={Boolean(completeProfilePreview)}
              title={t("oafBots.completeProfile.previewTitle")}
              description={completeProfileDiffs.length > 0 ? t("oafBots.completeProfile.previewDescription", { count: completeProfileDiffs.length }) : t("oafBots.completeProfile.noDiffDescription")}
              meta={t(`oafBots.completeProfile.mode.${profileAssistMode}`)}
              diffs={completeProfileDiffs}
              noDiff={t("oafBots.completeProfile.noDiff")}
              dismissLabel={t("oafBots.completeProfile.dismiss")}
              applyLabel={t("oafBots.completeProfile.apply")}
              onApply={applyCompleteProfilePreview}
              onDismiss={() => setCompleteProfilePreview(null)}
            />

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

          <div className="grid min-w-0 gap-5 xl:grid-cols-2">
            <BotRelationshipCard
              t={t}
              bot={selectedBot}
              account={selectedAccount}
              completion={personaCompleteness}
              automationStates={selectedAutomationStates}
              contentDraftPlan={selectedContentDraftPlan}
              activeContentCount={selectedActiveContentItems.length}
              totalContentCount={selectedCompatibleContentItems.length}
              contentDraftReadiness={selectedContentDraftReadiness}
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
              languageOptions={languageOptions}
              languageStrategyOptions={languageStrategyOptions}
              defaultPrimaryLanguage={defaultPrimaryLanguage}
              isDefaultLanguageConfig={isDefaultLanguageConfig}
            />
            {selectedBot ? (
              <div className="xl:col-span-2">
                <OAFBotDangerZone
                  t={t}
                  botName={selectedBot.name || t("oafBots.preview.unnamed")}
                  deleting={deletingBot}
                  onDelete={deleteSelectedBot}
                />
              </div>
            ) : null}
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
    website_url: bot.website_url || "",
    telegram_url: bot.telegram_url || "",
    discord_url: bot.discord_url || "",
    docs_url: bot.docs_url || "",
    cta_policy: bot.cta_policy || "",
    hashtags: bot.hashtags || [],
    keywords: bot.keywords || [],
    compliance_notes: bot.compliance_notes || "",
    avoid_claims: bot.avoid_claims || [],
    safety_mode: bot.safety_mode || "balanced",
    primary_language: bot.primary_language || defaultPrimaryLanguage,
    language_strategy: bot.language_strategy || "follow_context",
    trend_regions: bot.trend_regions?.length ? bot.trend_regions : ["1", "23424977"],
    trend_categories: bot.trend_categories || [],
    allow_general_trends: Boolean(bot.allow_general_trends),
    sensitive_trend_policy: bot.sensitive_trend_policy || "avoid",
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
    !form.website_url.trim() &&
    !form.telegram_url.trim() &&
    !form.discord_url.trim() &&
    !form.docs_url.trim() &&
    !form.cta_policy.trim() &&
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
  if (form.website_url.trim() || form.telegram_url.trim() || form.discord_url.trim() || form.docs_url.trim()) score += 4;
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
    goals: Boolean(form.growth_goal.trim()),
    test: hasSavedBot,
  };
}

function getPersonaChecklist(form: OAFBotPayload, t: (key: string) => string) {
  const completed = new Set<PersonaChecklistKey>();
  if (form.name.trim()) completed.add("name");
  if (form.twitter_account_id) completed.add("account");
  if (form.occupation.trim() || form.industry.trim()) completed.add("role");
  if (form.project_one_liner.trim() || form.core_value_props.trim() || form.website_url.trim() || form.telegram_url.trim() || form.discord_url.trim() || form.docs_url.trim()) completed.add("brand");
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

function joinMultiValues(values: string[]) {
  return values.map((item) => item.trim()).filter(Boolean).join(",");
}

function mergeUniqueValues(current: string[] = [], additions: string[] = []) {
  return Array.from(new Set([...current, ...additions].map((item) => item.trim()).filter(Boolean)));
}

function mergeRuleText(current = "", additions = "") {
  return mergeUniqueValues(current.split(/\n+/), additions.split(/\n+/)).join("\n");
}

function detectAccountArchetype(form: OAFBotPayload): AccountArchetypeKey | null {
  const matched = accountArchetypeKeys.find((key) => form.occupation === accountArchetypePresets[key].occupation);
  if (matched) return matched;
  const occupation = form.occupation.trim().toLowerCase();
  if (!occupation) return null;
  return accountArchetypeDetectionOrder.find((key) => accountArchetypeOccupationKeywords[key].some((keyword) => occupation.includes(keyword))) || null;
}

function applyAccountArchetypePreset(current: OAFBotPayload, type: AccountArchetypeKey): OAFBotPayload {
  const preset = accountArchetypePresets[type];
  return {
    ...current,
    occupation: preset.occupation,
    personality_tags: mergeUniqueValues(current.personality_tags, preset.personality_tags),
    content_pillars: mergeUniqueValues(current.content_pillars, preset.content_pillars),
    avoid_claims: mergeUniqueValues(current.avoid_claims, preset.avoid_claims),
    voice_tone: current.voice_tone.trim() || preset.voice_tone || "",
    identity_summary: current.identity_summary.trim() || preset.identity_summary || "",
    growth_goal: current.growth_goal.trim() || preset.growth_goal || "",
    content_objectives: current.content_objectives.trim() || preset.content_objectives || "",
    safety_mode: current.safety_mode || preset.safety_mode || "balanced",
  };
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
  if (type === "post") return "/content-drafts";
  if (type === "comment") return "/exposure-radar";
  return "/handling-list";
}

function getErrorBody(error: unknown): ApiErrorBody | undefined {
  if (!axios.isAxiosError(error)) return undefined;
  return error.response?.data as ApiErrorBody | undefined;
}

function errorMessage(error: unknown, fallback: string) {
  return getErrorBody(error)?.message || fallback;
}

function getChipLabel(value: string, options: ChipOption[]) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function getSelectLabel(value: string, options: SelectOption[]) {
  return options.find((option) => option.value === value)?.label ?? value;
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
