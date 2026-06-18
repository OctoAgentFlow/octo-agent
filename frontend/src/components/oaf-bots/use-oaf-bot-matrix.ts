"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { aggregateMonthlyUsage, botToPayload, calculatePersonaCompleteness, contentItemMatchesBot, summarizeQueue, usageSceneOrder, type QueueSummary } from "@/components/oaf-bots/oaf-bot-model";
import type { AccountListItem } from "@/services/account.service";
import type { ContentDraftPlanApi } from "@/services/content-drafts.service";
import type { ContentLibraryItemApi } from "@/services/content-library.service";
import { oafBotService } from "@/services/oaf-bot.service";
import type { ReviewQueueItemApi } from "@/services/review-queue.service";
import type { OAFBot, OAFBotGenerationFeedback, OAFBotGenerationUsage, OAFBotMatrixInspectionSummary } from "@/types/oaf-bot";

export type MatrixFilterKey = "all" | "unbound" | "auto_post_not_ready" | "negative_feedback" | "review_backlog";

export type BotMatrixRow = {
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

export type MatrixInspectionItem = {
  key: MatrixFilterKey;
  count: number;
  tone: "neutral" | "warning" | "danger";
};

export const matrixFilters: MatrixFilterKey[] = ["all", "unbound", "auto_post_not_ready", "negative_feedback", "review_backlog"];

const negativeFeedbackInspectionThreshold = 3;
const reviewBacklogInspectionThreshold = 5;

type UseOAFBotMatrixParams = {
  bots: OAFBot[];
  accounts: AccountListItem[];
  contentDraftPlans: ContentDraftPlanApi[];
  contentItems: ContentLibraryItemApi[];
  queueItems: ReviewQueueItemApi[];
  currentMonth: string;
  defaultPrimaryLanguage: string;
  matrixFilter: MatrixFilterKey;
};

export function useOAFBotMatrix({
  bots,
  accounts,
  contentDraftPlans,
  contentItems,
  queueItems,
  currentMonth,
  defaultPrimaryLanguage,
  matrixFilter,
}: UseOAFBotMatrixParams) {
  const [matrixUsageByBot, setMatrixUsageByBot] = useState<Record<number, OAFBotGenerationUsage[]>>({});
  const [matrixFeedbackByBot, setMatrixFeedbackByBot] = useState<Record<number, OAFBotGenerationFeedback[]>>({});
  const [matrixInspectionFlagsByBot, setMatrixInspectionFlagsByBot] = useState<Record<number, string[]>>({});
  const [matrixInspectionSummary, setMatrixInspectionSummary] = useState<OAFBotMatrixInspectionSummary | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);

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

  const refreshMatrixSignals = useCallback(async () => {
    await loadMatrixSignals(bots);
  }, [bots, loadMatrixSignals]);

  useEffect(() => {
    void refreshMatrixSignals();
  }, [refreshMatrixSignals]);

  const accountByID = useMemo(() => {
    return new Map(accounts.map((account) => [account.id, account]));
  }, [accounts]);

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

  const removeBotFromMatrix = useCallback((botID: number) => {
    setMatrixUsageByBot((current) => {
      const next = { ...current };
      delete next[botID];
      return next;
    });
    setMatrixFeedbackByBot((current) => {
      const next = { ...current };
      delete next[botID];
      return next;
    });
    setMatrixInspectionFlagsByBot((current) => {
      const next = { ...current };
      delete next[botID];
      return next;
    });
  }, []);

  const prependBotFeedback = useCallback((botID: number, feedback: OAFBotGenerationFeedback) => {
    setMatrixFeedbackByBot((prev) => ({ ...prev, [botID]: [feedback, ...(prev[botID] || [])].slice(0, 10) }));
  }, []);

  const removeBotFeedback = useCallback((botID: number, feedbackID: number) => {
    setMatrixFeedbackByBot((prev) => ({ ...prev, [botID]: (prev[botID] || []).filter((item) => item.id !== feedbackID) }));
  }, []);

  return {
    matrixLoading,
    matrixRows,
    matrixSummary,
    matrixInspectionItems,
    filteredMatrixRows,
    refreshMatrixSignals,
    removeBotFromMatrix,
    prependBotFeedback,
    removeBotFeedback,
  };
}
