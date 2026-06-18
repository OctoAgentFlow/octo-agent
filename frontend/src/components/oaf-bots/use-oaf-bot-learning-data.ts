"use client";

import { useCallback, useEffect, useState } from "react";

import { errorMessage } from "@/components/oaf-bots/oaf-bot-errors";
import { oafBotService } from "@/services/oaf-bot.service";
import { reviewQueueService, type ReviewQueueFeedbackIssueVerdictStatApi } from "@/services/review-queue.service";
import type { OAFBotGenerationFeedback, OAFBotGenerationFeedbackPayload, OAFBotGenerationUsage, OAFBotLearningRulePreference } from "@/types/oaf-bot";

type TranslationFn = (key: string, params?: Record<string, string | number>) => string;
type ToastFn = (message: string) => void;

type UseOAFBotLearningDataParams = {
  selectedID: number | null;
  pushToast: ToastFn;
  t: TranslationFn;
};

export function useOAFBotLearningData({ selectedID, pushToast, t }: UseOAFBotLearningDataParams) {
  const [generationUsages, setGenerationUsages] = useState<OAFBotGenerationUsage[]>([]);
  const [generationFeedback, setGenerationFeedback] = useState<OAFBotGenerationFeedback[]>([]);
  const [disabledLearningIssues, setDisabledLearningIssues] = useState<string[]>([]);
  const [learningRulePreferences, setLearningRulePreferences] = useState<OAFBotLearningRulePreference[]>([]);
  const [learningVerdictStats, setLearningVerdictStats] = useState<ReviewQueueFeedbackIssueVerdictStatApi[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [feedbackDeletingID, setFeedbackDeletingID] = useState<number | null>(null);

  const resetLearningData = useCallback(() => {
    setGenerationUsages([]);
    setGenerationFeedback([]);
    setDisabledLearningIssues([]);
    setLearningRulePreferences([]);
  }, []);

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

  const toggleLearningIssue = useCallback(async (issue: string) => {
    const key = issue.trim();
    if (!key || !selectedID) return;
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
  }, [disabledLearningIssues, pushToast, selectedID, t]);

  const createGenerationFeedback = useCallback(async (payload: OAFBotGenerationFeedbackPayload) => {
    if (!selectedID) return null;
    setFeedbackSaving(true);
    try {
      const saved = await oafBotService.createGenerationFeedback(selectedID, payload);
      setGenerationFeedback((items) => [saved, ...items].slice(0, 10));
      pushToast(t("oafBots.feedback.saved"));
      return saved;
    } catch (error) {
      pushToast(errorMessage(error, t("oafBots.feedback.saveFailed")));
      return null;
    } finally {
      setFeedbackSaving(false);
    }
  }, [pushToast, selectedID, t]);

  const deleteGenerationFeedback = useCallback(async (feedbackID: number) => {
    if (!selectedID) return false;
    setFeedbackDeletingID(feedbackID);
    try {
      await oafBotService.deleteGenerationFeedback(selectedID, feedbackID);
      setGenerationFeedback((items) => items.filter((item) => item.id !== feedbackID));
      pushToast(t("oafBots.feedback.deleted"));
      return true;
    } catch (error) {
      pushToast(errorMessage(error, t("oafBots.feedback.deleteFailed")));
      return false;
    } finally {
      setFeedbackDeletingID(null);
    }
  }, [pushToast, selectedID, t]);

  return {
    generationUsages,
    generationFeedback,
    disabledLearningIssues,
    learningRulePreferences,
    learningVerdictStats,
    feedbackLoading,
    feedbackSaving,
    feedbackDeletingID,
    resetLearningData,
    loadGenerationUsages,
    toggleLearningIssue,
    createGenerationFeedback,
    deleteGenerationFeedback,
  };
}
