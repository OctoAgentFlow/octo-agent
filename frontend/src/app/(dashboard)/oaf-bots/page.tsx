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
  Copy,
  FilePlus2,
  Globe2,
  Info,
  Lock,
  Mail,
  MessageCircle,
  MessagesSquare,
  RefreshCw,
  Save,
  Send,
  Sparkles,
  WalletCards,
} from "lucide-react";

import { SectionCard } from "@/components/dashboard/section-card";
import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";
import { broadcastDataSynced } from "@/lib/app-page-refresh";
import { accountService, type AccountListItem } from "@/services/account.service";
import { oafBotService } from "@/services/oaf-bot.service";
import type { PlanLimits, PlanUsage } from "@/types/billing";
import type { OAFBot, OAFBotGenerationUsage, OAFBotPayload, OAFBotSamples } from "@/types/oaf-bot";

type WizardStep = "identity" | "style" | "topics" | "goals" | "test";
type SampleScene = keyof OAFBotSamples;

type SelectOption = {
  value: string;
  label: string;
};

type ChipOption = SelectOption;

type ApiErrorBody = {
  message?: string;
  error_code?: string;
};

const wizardStepOrder: WizardStep[] = ["identity", "style", "topics", "goals", "test"];
const personaChecklistKeys = ["name", "account", "role", "language", "personality", "topics", "guardrails", "summary", "goal"] as const;
type PersonaChecklistKey = typeof personaChecklistKeys[number];

const emptyLimits: PlanLimits = {
  maxBots: 1,
  maxTwitterAccounts: 1,
  aiGenerationsMonthly: 100,
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
  forbidden: {
    investmentAdvice: "Investment advice",
    profitPromise: "Profit promises",
    politics: "Political controversy",
    adult: "Adult content",
    attacks: "Aggressive language",
    impersonation: "Impersonating officials",
    pricePrediction: "Price predictions",
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
  const [limits, setLimits] = useState<PlanLimits>(emptyLimits);
  const [usage, setUsage] = useState<PlanUsage>(emptyUsage);
  const [selectedID, setSelectedID] = useState<number | null>(null);
  const [form, setForm] = useState<OAFBotPayload>(() => createEmptyForm(defaultPrimaryLanguage));
  const [activeStep, setActiveStep] = useState<WizardStep>("identity");
  const [sampleScene, setSampleScene] = useState<SampleScene>("tweet");
  const [samples, setSamples] = useState<OAFBotSamples | null>(null);
  const [generationUsages, setGenerationUsages] = useState<OAFBotGenerationUsage[]>([]);
  const [generationUsagesLoading, setGenerationUsagesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const selectedBot = useMemo(() => bots.find((bot) => bot.id === selectedID) ?? null, [bots, selectedID]);
  const canCreate = usage.oafBots < limits.maxBots;
  const formChanged = useMemo(() => {
    if (!selectedBot) return false;
    return JSON.stringify(botToPayload(selectedBot, defaultPrimaryLanguage)) !== JSON.stringify(form);
  }, [defaultPrimaryLanguage, form, selectedBot]);

  const accountByID = useMemo(() => {
    return new Map(accounts.map((account) => [account.id, account]));
  }, [accounts]);

  const accountBoundByOtherBot = useMemo(() => {
    const map = new Map<number, OAFBot>();
    bots.forEach((bot) => {
      if (bot.twitter_account_id && bot.id !== selectedID) {
        map.set(bot.twitter_account_id, bot);
      }
    });
    return map;
  }, [bots, selectedID]);

  const selectedAccountConflict = form.twitter_account_id ? accountBoundByOtherBot.get(form.twitter_account_id) : undefined;
  const personaCompleteness = useMemo(() => calculatePersonaCompleteness(form), [form]);
  const isDefaultLanguageConfig =
    (form.primary_language || defaultPrimaryLanguage) === defaultPrimaryLanguage && (form.language_strategy || "follow_context") === "follow_context";
  const activeStepIndex = wizardStepOrder.indexOf(activeStep);
  const personaChecklist = useMemo(() => getPersonaChecklist(form, t), [form, t]);
  const stepCompletion = useMemo(() => getStepCompletion(form, Boolean(selectedID)), [form, selectedID]);
  const canTestBot = personaCompleteness >= 40;

  const wizardSteps = useMemo<Array<{ id: WizardStep; label: string; description: string }>>(
    () => [
      { id: "identity", label: t("oafBots.wizard.identity"), description: t("oafBots.wizard.identityDesc") },
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
  const forbiddenTopicOptions = useMemo(
    () => optionKeys("forbidden", ["investmentAdvice", "profitPromise", "politics", "adult", "attacks", "impersonation", "pricePrediction"], t),
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

  useEffect(() => {
    if (!selectedID) {
      setGenerationUsages([]);
      return;
    }
    void loadGenerationUsages(selectedID);
  }, [loadGenerationUsages, selectedID]);

  const updateForm = <K extends keyof OAFBotPayload>(key: K, value: OAFBotPayload[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const selectBot = (bot: OAFBot) => {
    setSelectedID(bot.id);
    setForm(botToPayload(bot, defaultPrimaryLanguage));
    setActiveStep("identity");
    setSamples(null);
  };

  const startCreate = () => {
    setSelectedID(null);
    setForm(createEmptyForm(defaultPrimaryLanguage));
    setActiveStep("identity");
    setSamples(null);
    setGenerationUsages([]);
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
      setSamples(await oafBotService.testGenerate(selectedID));
      await loadGenerationUsages(selectedID);
      setUsage((prev) => ({ ...prev, aiGenerationsMonth: prev.aiGenerationsMonth + 1 }));
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

  if (loading) {
    return <Card><CardHeader title={t("oafBots.loading.title")} description={t("oafBots.loading.description")} /></Card>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm text-violet-100/80"><Bot className="size-4" /> OAF Bot</p>
          <h1 className="mt-2 text-2xl font-semibold text-white">{t("oafBots.page.title")}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-white/60">{t("oafBots.page.subtitle")}</p>
        </div>
        <Button
          type="button"
          disabled={!canCreate}
          onClick={startCreate}
          className="bg-gradient-to-r from-blue-500 to-violet-500 text-white"
        >
          {t("oafBots.actions.new")}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <QuotaCard label="OAF Bots" used={usage.oafBots} limit={limits.maxBots} />
        <QuotaCard label={t("oafBots.quota.xAccounts")} used={usage.twitterAccounts} limit={limits.maxTwitterAccounts} />
        <QuotaCard label={t("oafBots.quota.aiMonthly")} used={usage.aiGenerationsMonth} limit={limits.aiGenerationsMonthly} />
        <QuotaCard label={t("oafBots.quota.autoComments")} used={usage.autoCommentsToday} limit={limits.dailyAutoComments} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-300/15 bg-blue-400/10 px-4 py-3 text-sm text-blue-50">
        <p>{t("oafBots.planHint", { bots: limits.maxBots, accounts: limits.maxTwitterAccounts })}</p>
        <Link href="/billing" className="inline-flex items-center gap-1 font-medium text-white hover:text-blue-100">
          {t("oafBots.planHintCta")}
          <ArrowRight className="size-4" />
        </Link>
      </div>

      {!canCreate ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100">
          <Lock className="size-4" />
          {t("oafBots.limitReached")}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)]">
        <SectionCard title={t("oafBots.list.title")} description={t("oafBots.list.description")} className="border-white/[0.08] bg-white/[0.025] p-4 md:p-5">
          <div className="space-y-2">
            {bots.length === 0 ? (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4">
                <div className="flex size-10 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-100">
                  <Bot className="size-5" />
                </div>
                <p className="mt-3 text-sm font-medium text-white">{t("oafBots.list.emptyTitle")}</p>
                <p className="mt-2 text-sm leading-relaxed text-white/55">{t("oafBots.list.emptyDescription")}</p>
                <div className="mt-4">
                  {accounts.length === 0 ? (
                    <Link href="/accounts" className="inline-flex">
                      <Button type="button" size="sm" variant="outline">
                        <WalletCards className="size-4" />
                        {t("oafBots.list.bindAccountCta")}
                      </Button>
                    </Link>
                  ) : (
                    <Button type="button" size="sm" onClick={startCreate} className="bg-gradient-to-r from-blue-500 to-violet-500 text-white">
                      <Sparkles className="size-4" />
                      {t("oafBots.list.createFirstCta")}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              bots.map((bot) => {
                const account = bot.twitter_account_id ? accountByID.get(bot.twitter_account_id) : null;
                return (
                  <button
                    key={bot.id}
                    type="button"
                    onClick={() => selectBot(bot)}
                    className={`w-full rounded-xl border p-3.5 text-left transition ${
                      selectedID === bot.id ? "border-violet-300/45 bg-violet-500/12" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.07]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-white">{bot.name}</p>
                        <p className="mt-1 text-xs text-white/55">
                          {account ? `@${account.username}` : t("oafBots.list.unbound")}
                        </p>
                      </div>
                      <ChevronRight className="mt-1 size-4 shrink-0 text-white/35" />
                    </div>
                    <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-white/65">
                      {bot.identity_summary || t("oafBots.list.noSummary")}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </SectionCard>

        <div className="grid min-w-0 gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
          <SectionCard
            title={selectedBot ? t("oafBots.form.editTitle") : t("oafBots.form.createTitle")}
            description={t("oafBots.form.description")}
          >
            <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-white/45">{t("oafBots.wizard.progress", { current: activeStepIndex + 1, total: wizardStepOrder.length })}</p>
                  <h2 className="mt-1 text-base font-semibold text-white md:text-lg">{activeStepMeta?.label}</h2>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-white/62">{t(`oafBots.wizard.goal.${activeStep}`)}</p>
                </div>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs text-white/55">
                  {Math.round(((activeStepIndex + 1) / wizardStepOrder.length) * 100)}%
                </span>
              </div>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-400 transition-all"
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
                            ? "border-violet-300/45 bg-violet-500/18 text-white shadow-[0_0_22px_rgba(139,92,246,0.16)]"
                            : completed
                              ? "border-cyan-300/25 bg-cyan-400/10 text-cyan-50 hover:bg-cyan-400/14"
                              : "border-white/10 bg-white/[0.025] text-white/55 hover:bg-white/[0.06]"
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
                <div className="mt-4">
                  <TagPicker
                    label={t("oafBots.fields.forbiddenTopics")}
                    values={form.forbidden_topics}
                    options={forbiddenTopicOptions}
                    onChange={(values) => updateForm("forbidden_topics", values)}
                    helper={t("oafBots.helpers.forbiddenTopics")}
                    placeholder={t("oafBots.placeholders.tagInput")}
                  />
                </div>
                <div className="mt-4">
                  <SelectField
                    label={t("oafBots.fields.safetyMode")}
                    value={form.safety_mode}
                    onChange={(value) => updateForm("safety_mode", value)}
                    options={safetyOptions}
                    helper={t("oafBots.helpers.safetyMode")}
                  />
                </div>
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
                </div>
              </WizardPanel>
            ) : null}

            {activeStep === "test" ? (
              <WizardPanel title={t("oafBots.section.test")} description={t("oafBots.section.testDesc")}>
                <SamplePanel
                  t={t}
                  samples={samples}
                  scene={sampleScene}
                  onSceneChange={setSampleScene}
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

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => goStep("previous")} disabled={activeStepIndex === 0}>
                  <ArrowLeft className="size-4" />
                  {t("oafBots.actions.previous")}
                </Button>
                <Button type="button" variant="outline" onClick={() => goStep("next")} disabled={activeStepIndex === wizardStepOrder.length - 1}>
                  {t("oafBots.actions.next")}
                  <ArrowRight className="size-4" />
                </Button>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant={activeStep === "test" ? "default" : "outline"}
                onClick={activeStep === "test" ? testGenerate : goTestStep}
                disabled={generating || !canTestBot}
                className={activeStep === "test" ? "bg-gradient-to-r from-blue-500 to-violet-500 text-white" : ""}
              >
                <Sparkles className="size-4" />
                {generating ? t("oafBots.actions.generating") : t("oafBots.actions.testBot")}
              </Button>
              <Button
                type="button"
                onClick={save}
                disabled={saving || Boolean(selectedAccountConflict) || (!selectedID && !canCreate)}
                className="bg-gradient-to-r from-blue-500 to-violet-500 text-white"
              >
                <Save className="size-4" />
                {saving ? t("oafBots.actions.saving") : t("oafBots.actions.save")}
              </Button>
              </div>
            </div>
          </SectionCard>

          <div className="space-y-5">
            <BotPreview
              t={t}
              form={form}
              account={form.twitter_account_id ? accountByID.get(form.twitter_account_id) : undefined}
              completion={personaCompleteness}
              checklist={personaChecklist}
              onTest={goTestStep}
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
  if (form.primary_language.trim() && form.language_strategy.trim()) score += 10;
  if (form.personality_tags.length > 0) score += 10;
  if (form.topics.length > 0) score += 15;
  if (form.forbidden_topics.length > 0) score += 10;
  if (form.identity_summary.trim()) score += 15;
  if (form.growth_goal.trim()) score += 10;
  return score;
}

function getStepCompletion(form: OAFBotPayload, hasSavedBot: boolean): Record<WizardStep, boolean> {
  return {
    identity: Boolean(form.name.trim() && form.twitter_account_id && (form.occupation.trim() || form.industry.trim())),
    style: Boolean((form.primary_language.trim() && form.language_strategy.trim()) || form.personality_tags.length > 0 || form.voice_tone.trim() || form.mbti.trim()),
    topics: Boolean(form.topics.length > 0 && form.safety_mode.trim()),
    goals: Boolean(form.identity_summary.trim() && form.growth_goal.trim()),
    test: hasSavedBot,
  };
}

function getPersonaChecklist(form: OAFBotPayload, t: (key: string) => string) {
  const completed = new Set<PersonaChecklistKey>();
  if (form.name.trim()) completed.add("name");
  if (form.twitter_account_id) completed.add("account");
  if (form.occupation.trim() || form.industry.trim()) completed.add("role");
  if (form.primary_language.trim() && form.language_strategy.trim()) completed.add("language");
  if (form.personality_tags.length > 0 || form.voice_tone.trim() || form.mbti.trim()) completed.add("personality");
  if (form.topics.length > 0) completed.add("topics");
  if (form.forbidden_topics.length > 0 || form.safety_mode.trim()) completed.add("guardrails");
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

function validateBeforeGenerate(form: OAFBotPayload, t: (key: string) => string) {
  if (!form.name.trim()) return t("oafBots.test.needName");
  if (form.topics.length === 0) return t("oafBots.test.needTopic");
  if (!form.identity_summary.trim() && !form.voice_tone.trim()) return t("oafBots.test.needPersona");
  return "";
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

function getErrorBody(error: unknown): ApiErrorBody | undefined {
  if (!axios.isAxiosError(error)) return undefined;
  return error.response?.data as ApiErrorBody | undefined;
}

function errorMessage(error: unknown, fallback: string) {
  return getErrorBody(error)?.message || fallback;
}

function QuotaCard({ label, used, limit }: { label: string; used: number; limit: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-xs text-white/55">{label}</p>
      <p className="mt-2 text-lg font-semibold text-white">{used}<span className="text-sm font-normal text-white/45"> / {limit}</span></p>
    </div>
  );
}

function WizardPanel({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/15 p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-white/55">{description}</p>
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
    <label className="block space-y-1.5 text-sm text-white/70">
      <span className="flex items-center gap-2">
        {label}
        {recommended ? (
          <span className="inline-flex size-5 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-400/10 text-cyan-100">
            <CheckCircle2 className="size-3" />
          </span>
        ) : null}
      </span>
      {children}
      {helper ? <span className="block text-xs leading-relaxed text-white/42">{helper}</span> : null}
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
    <div className="mb-5 rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-cyan-400/10 via-white/[0.035] to-violet-500/10 p-4 shadow-[0_18px_60px_rgba(56,189,248,0.08)]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-100">
            <Globe2 className="size-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-white">{t("oafBots.languageConfig.title")}</h3>
              {isDefault ? (
                <span className="rounded-full border border-white/10 bg-white/[0.06] px-2 py-0.5 text-[11px] text-white/55">
                  {t("oafBots.languageConfig.defaultBadge")}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-white/52">{t("oafBots.languageConfig.description")}</p>
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
        <div className="rounded-xl border border-white/10 bg-black/15 p-3">
          <p className="text-xs text-white/40">{t("oafBots.languageConfig.primaryHint")}</p>
          <p className="mt-1 text-sm font-medium text-white">{getSelectLabel(currentPrimaryLanguage, languageOptions)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/15 p-3">
          <p className="text-xs text-white/40">{t("oafBots.languageConfig.strategyHint")}</p>
          <p className="mt-1 text-sm font-medium text-white">{getSelectLabel(currentLanguageStrategy, languageStrategyOptions)}</p>
          <p className="mt-1 text-xs leading-relaxed text-white/50">{t(`oafBots.languageStrategy.helper.${currentLanguageStrategy}`)}</p>
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
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
          {hasRecommendedValue ? (
            <button
              type="button"
              onClick={() => onChange("")}
              className="mb-3 rounded-full border border-violet-300/25 bg-violet-400/10 px-3 py-1 text-xs text-violet-50 hover:bg-violet-400/18"
            >
              {selectedLabel} ×
            </button>
          ) : null}
          <input
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/35"
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
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
          <div className="flex flex-wrap gap-2">
            {values.length === 0 ? <span className="text-sm text-white/35">{placeholder}</span> : null}
            {values.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => removeValue(value)}
                className="rounded-full border border-violet-300/25 bg-violet-400/10 px-3 py-1 text-xs text-violet-50 hover:bg-violet-400/18"
              >
                {getChipLabel(value, options)} ×
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/35"
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
              className="rounded-lg border border-white/10 px-3 text-xs text-white/70 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
              onClick={() => addValue(input)}
            >
              {t("oafBots.chips.addCustom")}
            </button>
          </div>
        </div>
      </FieldShell>
      <ChipOptions options={options} onPick={addValue} selected={values} disableUnselected={maxReached} />
      {limitText ? <p className={`text-xs leading-relaxed ${maxReached ? "text-amber-100/80" : "text-white/42"}`}>{limitText}</p> : null}
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
    <div className="flex flex-wrap gap-2">
      {visibleOptions.map((option) => {
        const active = selected.includes(option.value);
        const disabled = Boolean(disableUnselected && !active);
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onPick(option.value)}
            className={`rounded-full border px-3 py-1.5 text-xs transition ${
              active
                ? "border-cyan-200/55 bg-cyan-400/18 text-cyan-50 shadow-[0_0_16px_rgba(34,211,238,0.14)]"
                : disabled
                  ? "cursor-not-allowed border-white/10 bg-white/[0.02] text-white/28"
                  : "border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.07]"
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
          className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/65 hover:bg-white/[0.07]"
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

function BotPreview({
  t,
  form,
  account,
  completion,
  checklist,
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
  const languageSummaryRows = [
    { label: t("oafBots.fields.primaryLanguage"), value: `${getSelectLabel(currentPrimaryLanguage, languageOptions)}${defaultBadge}` },
    { label: t("oafBots.fields.languageStrategy"), value: `${getSelectLabel(currentLanguageStrategy, languageStrategyOptions)}${defaultBadge}` },
  ];
  const previewRows = [
    { label: t("oafBots.fields.occupation"), value: getChipLabel(form.occupation, occupationOptions) },
    { label: t("oafBots.fields.industry"), value: splitMultiValue(form.industry).map((item) => getChipLabel(item, industryOptions)).join(" / ") },
    { label: t("oafBots.fields.personalityTags"), value: form.personality_tags.join(" / ") },
    { label: t("oafBots.fields.topics"), value: form.topics.join(" / ") },
    { label: t("oafBots.fields.safetyMode"), value: form.safety_mode },
    { label: t("oafBots.fields.growthGoal"), value: form.growth_goal },
  ].filter((row) => row.value.trim());
  return (
    <SectionCard title={t("oafBots.preview.title")} description={t("oafBots.preview.description")} className="border-white/[0.08] bg-white/[0.025] p-4 md:p-5">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-blue-500/10 via-white/[0.035] to-violet-500/10 p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-100 shadow-[0_0_24px_rgba(56,189,248,0.18)]">
            <Bot className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-white">{form.name || t("oafBots.preview.unnamed")}</p>
            <p className="text-xs text-white/50">{account ? `@${account.username}` : t("oafBots.preview.noAccount")}</p>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-center justify-between text-xs text-white/55">
            <span>{t("oafBots.preview.completeness")}</span>
            <span className="text-white">{completion}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full ${lowCompletion ? "bg-amber-300" : "bg-gradient-to-r from-cyan-400 to-violet-400"}`}
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
            <p className="text-xs text-blue-100/70">{t("oafBots.preview.nextSuggestion")}</p>
            <p className="mt-1 text-sm leading-relaxed text-white/78">{checklist.nextSuggestion}</p>
          </div>
          <Button type="button" onClick={onTest} disabled={!canTest} className="w-full bg-gradient-to-r from-blue-500 to-violet-500 text-white disabled:opacity-50">
            <Sparkles className="size-4" />
            {t("oafBots.actions.testBot")}
          </Button>
          {!canTest ? <p className="text-xs leading-relaxed text-white/45">{t("oafBots.test.disabledHint")}</p> : null}
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

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/15 p-3">
      <p className="text-xs text-white/40">{label}</p>
      <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-white/75">{value}</p>
    </div>
  );
}

function SamplePanel({
  t,
  samples,
  scene,
  onSceneChange,
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
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  samples: OAFBotSamples | null;
  scene: SampleScene;
  onSceneChange: (scene: SampleScene) => void;
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
}) {
  const normalizedSamples = useMemo(() => normalizeSamples(samples), [samples]);
  const sceneItems: Array<{ id: SampleScene; icon: ReactNode; title: string; description: string }> = [
    { id: "tweet", icon: <Send className="size-4" />, title: t("oafBots.samples.tweet"), description: t("oafBots.samples.tweetContext") },
    { id: "reply", icon: <MessageCircle className="size-4" />, title: t("oafBots.samples.reply"), description: t("oafBots.samples.replyContext") },
    { id: "comment", icon: <MessagesSquare className="size-4" />, title: t("oafBots.samples.comment"), description: t("oafBots.samples.commentContext") },
    { id: "dm", icon: <Mail className="size-4" />, title: t("oafBots.samples.dm"), description: t("oafBots.samples.dmContext") },
  ];
  const personaRows = getSamplePersonaRows(form, account, occupationOptions, industryOptions, safetyOptions, languageOptions, languageStrategyOptions, t);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/10 p-4 text-sm leading-relaxed text-cyan-50">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 size-4 shrink-0" />
          <div>
            <p>{generating ? t("oafBots.test.loading") : t("oafBots.test.costHint")}</p>
            <p className="mt-1 text-xs text-cyan-50/65">{t("oafBots.test.sceneHint")}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {sceneItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSceneChange(item.id)}
            className={`rounded-2xl border p-4 text-left transition ${
              scene === item.id ? "border-cyan-300/35 bg-cyan-400/12 text-white" : "border-white/10 bg-white/[0.035] text-white/60 hover:bg-white/[0.07]"
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-cyan-100">
                {item.icon}
              </span>
              <div className="min-w-0">
                <p className="whitespace-nowrap text-sm font-medium">{item.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-white/45">{item.description}</p>
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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.035] p-4">
        <div>
          <p className="text-sm font-medium text-white">{t("oafBots.test.panelTitle")}</p>
          <p className="mt-1 text-xs text-white/45">{t("oafBots.test.panelDescription")}</p>
        </div>
        <Button type="button" onClick={onGenerate} disabled={generating || previewDisabled} className="bg-gradient-to-r from-blue-500 to-violet-500 text-white">
          {generating ? <RefreshCw className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {generating ? t("oafBots.test.loadingShort") : t("oafBots.actions.generate")}
        </Button>
      </div>

      {samples ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div className="grid gap-3 md:grid-cols-2">
            {sceneItems.map((item) => (
              <SampleCard
                key={item.id}
                title={item.title}
                text={normalizedSamples[item.id] || t("oafBots.samples.empty")}
                highlight={scene === item.id}
                onRegenerate={onGenerate}
                t={t}
              />
            ))}
          </div>
          <PersonaBasisCard title={t("oafBots.test.personaBasis")} rows={personaRows} empty={t("oafBots.test.personaBasisEmpty")} />
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.025] p-6 text-center">
          <Sparkles className="mx-auto size-6 text-violet-200/75" />
          <p className="mt-3 text-sm font-medium text-white">{t("oafBots.samples.emptyTitle")}</p>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-white/50">{t("oafBots.samples.emptyDescription")}</p>
        </div>
      )}
    </div>
  );
}

function SampleCard({
  title,
  text,
  highlight = false,
  onRegenerate,
  t,
}: {
  title: string;
  text: string;
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
    <div className={`flex min-h-[260px] flex-col rounded-2xl border p-4 ${highlight ? "border-violet-300/30 bg-violet-500/12" : "border-white/10 bg-black/20"}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="mt-1 text-xs text-white/40">{t("oafBots.samples.characters", { count: content.length })}</p>
        </div>
        <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/45">
          {highlight ? t("oafBots.samples.selected") : t("oafBots.samples.generated")}
        </span>
      </div>
      <div className="mt-4 flex-1 rounded-xl border border-white/10 bg-black/20 p-4">
        <p className="whitespace-pre-wrap break-words text-sm leading-7 text-white/82">{visibleText || t("oafBots.samples.empty")}</p>
        {isLong ? (
          <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-3 text-xs font-medium text-cyan-100 hover:text-white">
            {expanded ? t("oafBots.samples.collapse") : t("oafBots.samples.expand")}
          </button>
        ) : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={copy}>
          <Copy className="size-4" />
          {copied ? t("oafBots.samples.copied") : t("oafBots.samples.copy")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onRegenerate}>
          <RefreshCw className="size-4" />
          {t("oafBots.samples.regenerate")}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled title={t("oafBots.samples.saveDraftDisabled")}>
          <FilePlus2 className="size-4" />
          {t("oafBots.samples.saveDraft")}
        </Button>
      </div>
    </div>
  );
}

function PersonaBasisCard({ title, rows, empty }: { title: string; rows: Array<{ label: string; value: string }>; empty: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
      <p className="text-sm font-semibold text-white">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm leading-relaxed text-white/50">{empty}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((row) => (
            <div key={row.label} className="rounded-xl border border-white/10 bg-black/15 p-3">
              <p className="text-xs text-white/40">{row.label}</p>
              <p className="mt-1 text-sm leading-relaxed text-white/75">{row.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function normalizeSamples(samples: OAFBotSamples | null): OAFBotSamples {
  const normalized: OAFBotSamples = { tweet: "", reply: "", comment: "", dm: "" };
  if (!samples) return normalized;

  (Object.keys(normalized) as SampleScene[]).forEach((scene) => {
    const raw = samples[scene] || "";
    const parsed = parseGeneratedPayload(raw);
    if (typeof parsed === "string") {
      normalized[scene] ||= parsed;
      return;
    }
    normalized[scene] ||= stringifyGeneratedValue(parsed[scene]);
    (Object.keys(normalized) as SampleScene[]).forEach((key) => {
      const value = stringifyGeneratedValue(parsed[key]);
      if (value) normalized[key] = value;
    });
  });

  (Object.keys(normalized) as SampleScene[]).forEach((scene) => {
    normalized[scene] = cleanupGeneratedText(normalized[scene] || samples[scene] || "");
  });
  return normalized;
}

function parseGeneratedPayload(raw: string): string | Partial<Record<SampleScene, unknown>> {
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
    { label: t("oafBots.fields.voiceTone"), value: form.voice_tone },
    { label: t("oafBots.fields.topics"), value: form.topics.join(" / ") },
    { label: t("oafBots.fields.growthGoal"), value: form.growth_goal },
    { label: t("oafBots.fields.safetyMode"), value: safetyOptions.find((option) => option.value === form.safety_mode)?.label || form.safety_mode },
  ].filter((row) => row.value.trim());
}

function GenerationUsageCard({
  t,
  selectedID,
  generationUsages,
  loading,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  selectedID: number | null;
  generationUsages: OAFBotGenerationUsage[];
  loading: boolean;
}) {
  return (
    <SectionCard title={t("oafBots.usages.title")} description={t("oafBots.usages.description")}>
      {!selectedID ? (
        <p className="rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm text-white/55">
          {t("oafBots.usages.selectBot")}
        </p>
      ) : loading ? (
        <p className="rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm text-white/55">
          {t("oafBots.usages.loading")}
        </p>
      ) : generationUsages.length === 0 ? (
        <p className="rounded-lg border border-white/10 bg-white/[0.04] p-4 text-sm text-white/55">
          {t("oafBots.usages.empty")}
        </p>
      ) : (
        <div className="space-y-2">
          {generationUsages.map((item) => (
            <div key={`${item.bot_id}-${item.scene}-${item.month}`} className="rounded-xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/72">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-white/45">{t("oafBots.usages.scene")}</p>
                  <p className="mt-1 font-medium text-white">{t(`oafBots.usages.scene.${item.scene}`)}</p>
                </div>
                <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/65">{item.count}</span>
              </div>
              <p className="mt-3 text-xs text-white/45">{item.month}</p>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
