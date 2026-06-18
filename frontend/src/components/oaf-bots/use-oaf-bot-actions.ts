"use client";

import { useState, type Dispatch, type SetStateAction } from "react";

import { getErrorBody, errorMessage } from "@/components/oaf-bots/oaf-bot-errors";
import { botToPayload, createEmptyForm, hasProfileAssistSeed, validateBeforeGenerate } from "@/components/oaf-bots/oaf-bot-model";
import { normalizeSampleContent } from "@/components/oaf-bots/sample-learning-panels";
import { broadcastDataSynced } from "@/lib/app-page-refresh";
import { oafBotService } from "@/services/oaf-bot.service";
import type { PlanUsage } from "@/types/billing";
import type {
  OAFBot,
  OAFBotCompleteProfileResult,
  OAFBotFeedbackProfileSuggestionResult,
  OAFBotGenerationFeedbackRating,
  OAFBotPayload,
  OAFBotProfileAssistMode,
  OAFBotSampleContext,
  OAFBotSampleScene,
  OAFBotTestGenerateResult,
} from "@/types/oaf-bot";

type TranslationFn = (key: string, params?: Record<string, string | number>) => string;
type ToastFn = (message: string) => void;
type ConfirmFn = (options: { title: string; description: string; confirmLabel: string; tone: "destructive" }) => Promise<boolean>;
type FeedbackDraft = { rating: OAFBotGenerationFeedbackRating | ""; issueTags: string[]; comment: string };
type WizardStep = "identity" | "brand" | "style" | "topics" | "goals" | "test";

export type SafetyRewritePreview = {
  before: string;
  result: OAFBotTestGenerateResult;
};

type UseOAFBotActionsParams = {
  t: TranslationFn;
  pushToast: ToastFn;
  confirm: ConfirmFn;
  defaultPrimaryLanguage: string;
  selectedID: number | null;
  selectedBot: OAFBot | null;
  selectedAccountConflict?: OAFBot;
  bots: OAFBot[];
  form: OAFBotPayload;
  formChanged: boolean;
  sampleScene: OAFBotSampleScene;
  sampleContexts: OAFBotSampleContext;
  samples: OAFBotTestGenerateResult | null;
  disabledLearningIssues: string[];
  safetyRewriteMode: string;
  profileAssistMode: OAFBotProfileAssistMode;
  canTestBot: boolean;
  setBots: Dispatch<SetStateAction<OAFBot[]>>;
  setSelectedID: Dispatch<SetStateAction<number | null>>;
  setForm: Dispatch<SetStateAction<OAFBotPayload>>;
  setUsage: Dispatch<SetStateAction<PlanUsage>>;
  setActiveStep: Dispatch<SetStateAction<WizardStep>>;
  setSampleContexts: Dispatch<SetStateAction<OAFBotSampleContext>>;
  setSamples: Dispatch<SetStateAction<OAFBotTestGenerateResult | null>>;
  setLearningComparison: Dispatch<SetStateAction<OAFBotTestGenerateResult | null>>;
  setFeedbackDraft: Dispatch<SetStateAction<FeedbackDraft>>;
  setFeedbackSuggestionPreview: Dispatch<SetStateAction<OAFBotFeedbackProfileSuggestionResult | null>>;
  setPendingAppliedFormChange: Dispatch<SetStateAction<{ source: "complete_profile" | "feedback_suggestion"; count: number } | null>>;
  resetLearningData: () => void;
  loadGenerationUsages: (botID: number) => Promise<void>;
  refreshMatrixSignals: () => Promise<void>;
  removeBotFromMatrix: (botID: number) => void;
  loadRelationshipContext: () => Promise<void>;
};

export function useOAFBotActions({
  t,
  pushToast,
  confirm,
  defaultPrimaryLanguage,
  selectedID,
  selectedBot,
  selectedAccountConflict,
  bots,
  form,
  formChanged,
  sampleScene,
  sampleContexts,
  samples,
  disabledLearningIssues,
  safetyRewriteMode,
  profileAssistMode,
  canTestBot,
  setBots,
  setSelectedID,
  setForm,
  setUsage,
  setActiveStep,
  setSampleContexts,
  setSamples,
  setLearningComparison,
  setFeedbackDraft,
  setFeedbackSuggestionPreview,
  setPendingAppliedFormChange,
  resetLearningData,
  loadGenerationUsages,
  refreshMatrixSignals,
  removeBotFromMatrix,
  loadRelationshipContext,
}: UseOAFBotActionsParams) {
  const [completeProfilePreview, setCompleteProfilePreview] = useState<OAFBotCompleteProfileResult | null>(null);
  const [safetyRewritePreview, setSafetyRewritePreview] = useState<SafetyRewritePreview | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingBot, setDeletingBot] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [comparingLearning, setComparingLearning] = useState(false);
  const [rewritingSafety, setRewritingSafety] = useState(false);
  const [completingProfile, setCompletingProfile] = useState(false);

  const clearActionPreviews = () => {
    setCompleteProfilePreview(null);
    setSafetyRewritePreview(null);
    setPendingAppliedFormChange(null);
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
      clearActionPreviews();
      setFeedbackSuggestionPreview(null);
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
      removeBotFromMatrix(selectedBot.id);
      setSamples(null);
      setLearningComparison(null);
      resetLearningData();
      setSampleContexts({});
      setFeedbackDraft({ rating: "", issueTags: [], comment: "" });
      clearActionPreviews();
      setFeedbackSuggestionPreview(null);
      const next = remaining[0] || null;
      if (next) {
        setSelectedID(next.id);
        setForm(botToPayload(next, defaultPrimaryLanguage));
        setActiveStep("identity");
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
      void refreshMatrixSignals();
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
      void refreshMatrixSignals();
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

  return {
    completeProfilePreview,
    setCompleteProfilePreview,
    safetyRewritePreview,
    setSafetyRewritePreview,
    saving,
    deletingBot,
    generating,
    comparingLearning,
    rewritingSafety,
    completingProfile,
    clearActionPreviews,
    save,
    deleteSelectedBot,
    completeProfile,
    testGenerate,
    compareWithoutLearningRules,
    rewriteSampleForSafety,
    applySafetyRewritePreview,
    handlePreviewTest,
  };
}
