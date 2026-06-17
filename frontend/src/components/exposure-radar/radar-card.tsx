"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";

import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { exposureRadarService, type ExposureRadarItemApi } from "@/services/exposure-radar.service";
import { buildResolvedManualResultPatch, buildSampleResolvedResultPatch, normalizeResultLookupStatus } from "@/components/exposure-radar/manual-record-utils";
import { ManualHandlingRecord, ManualWorkflowPanel, manualResultFormKey } from "@/components/exposure-radar/radar-card-manual-workflow";
import { RadarCardActionFooter, RadarCardBadges, RadarCardGeneratedCommentBlock, RadarCardHeader, RadarCardPrimaryMetrics, RadarCardPublicMetrics, RadarCardRecommendedUse, RadarCardVelocityTrend } from "@/components/exposure-radar/radar-card-sections";
import { extractTweetID, isManualActionHandled, isSampleRadarItem, radarCardAnchorID } from "@/components/exposure-radar/radar-signal-utils";
import { normalizeOpportunityTier, normalizeQualityStage, normalizeVelocityState } from "@/components/exposure-radar/radar-utils";
import { AccountFitPanel, SignalCredibilityPanel, SignalDecisionCard } from "@/components/exposure-radar/signal-analysis-cards";
import { buildAccountFitSummary, buildSignalCredibility, buildSignalDecisionSummary } from "@/components/exposure-radar/signal-analysis-utils";
import type { ManualActionState, ManualOutcome, RankChange, ReplyAngleSuggestion } from "@/components/exposure-radar/types";

export function RadarCard({
  item,
  rank,
  timeZone,
  rankChange,
  savedMemoryID,
  drafting,
  draftDisabled,
  handling,
  savingMemory,
  memoryDisabled,
  memoryAccountID,
  onCreateDraft,
  onMarkHandled,
  onSaveMemory,
  onSaveContentSeed,
  savingSeed,
  onGenerateContentDraft,
  generatingSeedDraft,
  manualState,
  onManualAction,
  feedbackSaving,
  onSubmitFeedback,
  onSubmitResult,
}: {
  item: ExposureRadarItemApi;
  rank: number;
  timeZone: string;
  rankChange?: RankChange;
  savedMemoryID: number;
  drafting: boolean;
  draftDisabled: boolean;
  handling: boolean;
  savingMemory: boolean;
  memoryDisabled: boolean;
  memoryAccountID: number;
  onCreateDraft: (item: ExposureRadarItemApi) => void;
  onMarkHandled: (item: ExposureRadarItemApi, publishedURL: string) => void;
  onSaveMemory: (item: ExposureRadarItemApi, replyAngle?: ReplyAngleSuggestion) => void;
  onSaveContentSeed: (item: ExposureRadarItemApi) => void;
  savingSeed: boolean;
  onGenerateContentDraft: (item: ExposureRadarItemApi) => void;
  generatingSeedDraft: boolean;
  manualState?: ManualActionState;
  onManualAction: (patch: Partial<ManualActionState>) => void;
  feedbackSaving: boolean;
  onSubmitFeedback: (item: ExposureRadarItemApi, outcome: ManualOutcome, comment: string) => void;
  onSubmitResult: (item: ExposureRadarItemApi, result: { impressions?: number; likes?: number; replies?: number; reposts?: number; quotes?: number; bookmarks?: number; notes?: string }) => void;
}) {
  const { t } = useT();
  const { pushToast } = useToast();
  const generatedComment = item.generated_comment?.trim() || "";
  const canDraft = item.data_quality === "tweet_level" && !draftDisabled;
  const velocityState = normalizeVelocityState(item.velocity_state, item.status);
  const opportunityTier = normalizeOpportunityTier(item.opportunity_tier);
  const qualityStage = normalizeQualityStage(item.quality_stage, item);
  const cardToneClass = qualityStage === "expired" || item.cooling || velocityState === "cooling"
    ? "border-[#64748b]/35 bg-[#0b0f14] opacity-85"
    : qualityStage === "act_now"
      ? "border-[#00ba7c]/35 bg-black shadow-[0_0_0_1px_rgba(0,186,124,0.18)]"
      : opportunityTier === "needs_sampling" || opportunityTier === "topic_lead"
        ? "border-[#2f3336] bg-[#070a0d] opacity-80"
        : "border-[#2f3336] bg-black";
  const savedDone = savedMemoryID > 0 || Boolean(manualState?.saved);
  const handledDone = isManualActionHandled(item, manualState);
  const [publishedURL, setPublishedURL] = useState(manualState?.publishedUrl || item.comment_url || "");
  const [resultResolving, setResultResolving] = useState(false);
  const lastHydratedPublishedURLRef = useRef(manualState?.publishedUrl || item.comment_url || "");
  const highlightClass = rankChange?.kind === "up" || rankChange?.kind === "new"
    ? "shadow-[0_0_0_1px_rgba(0,186,124,0.24),0_18px_46px_rgba(0,186,124,0.08)]"
    : rankChange?.kind === "down"
      ? "shadow-[0_0_0_1px_rgba(244,33,46,0.20)]"
      : "";
  useEffect(() => {
    const nextURL = manualState?.publishedUrl || item.comment_url || "";
    if (nextURL && nextURL !== lastHydratedPublishedURLRef.current) {
      lastHydratedPublishedURLRef.current = nextURL;
      setPublishedURL(nextURL);
    }
  }, [item.comment_url, manualState?.publishedUrl]);
  const copyComment = async () => {
    if (!generatedComment) return;
    try {
      await navigator.clipboard.writeText(generatedComment);
      onManualAction({ copied: true, taskStatus: "in_progress" });
      pushToast(t("exposureRadar.manualAction.copied"));
    } catch {
      pushToast(t("exposureRadar.manualAction.copyFailed"));
    }
  };
  const resolvePublishedResult = async () => {
    const nextURL = publishedURL.trim();
    const commentTweetID = item.comment_tweet_id || extractTweetID(nextURL);
    if (isSampleRadarItem(item)) {
      const resolvedURL = nextURL || item.url || "";
      if (resolvedURL) setPublishedURL(resolvedURL);
      onManualAction(buildSampleResolvedResultPatch(resolvedURL, handledDone));
      pushToast(t("exposureRadar.sample.toast.resultSaved"));
      return;
    }
    if (!nextURL && !commentTweetID) {
      pushToast(t("exposureRadar.resultLookup.missing"));
      return;
    }
    setResultResolving(true);
    try {
      const result = await exposureRadarService.resolveManualResult({
        published_url: nextURL || undefined,
        comment_tweet_id: commentTweetID || undefined,
      });
      const { patch, resolvedURL } = buildResolvedManualResultPatch(result, nextURL, handledDone);
      if (resolvedURL) {
        setPublishedURL(resolvedURL);
      }
      onManualAction(patch);
      const status = normalizeResultLookupStatus(result.status);
      pushToast(t(`exposureRadar.resultLookup.${status}`));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("exposureRadar.resultLookup.failed") : t("exposureRadar.resultLookup.failed"));
    } finally {
      setResultResolving(false);
    }
  };

  return (
    <article id={radarCardAnchorID(item.id)} className={`scroll-mt-24 rounded-2xl border p-4 transition-shadow ${highlightClass} ${cardToneClass}`}>
      <RadarCardBadges item={item} rank={rank} rankChange={rankChange} savedMemoryID={savedMemoryID} handledDone={handledDone} />
      <RadarCardHeader item={item} />
      <RadarCardPrimaryMetrics item={item} />
      <RadarCardPublicMetrics item={item} />
      <RadarCardVelocityTrend item={item} />
      <SignalDecisionCard summary={buildSignalDecisionSummary(item, t)} />
      <SignalCredibilityPanel credibility={buildSignalCredibility(item, t)} compact />
      <AccountFitPanel fit={buildAccountFitSummary(item, null, t)} compact />
      <RadarCardRecommendedUse item={item} />
      <RadarCardGeneratedCommentBlock
        generatedComment={generatedComment}
        workflow={(
          <ManualWorkflowPanel
            copied={Boolean(manualState?.copied)}
            opened={Boolean(manualState?.opened)}
            saved={savedDone}
            handled={handledDone}
            handling={handling}
            resultResolving={resultResolving}
            publishedURL={publishedURL}
            commentURL={manualState?.publishedUrl || item.comment_url || ""}
            persisted={Boolean(manualState?.persisted || item.review_status === "handled" || item.comment_tweet_id || item.comment_url)}
            onPublishedURLChange={setPublishedURL}
            onResolveResult={() => void resolvePublishedResult()}
            onMarkHandled={() => onMarkHandled(item, publishedURL)}
          />
        )}
        record={(
          <ManualHandlingRecord
            key={`${item.id}:${manualResultFormKey(manualState)}`}
            item={item}
            manualState={manualState}
            timeZone={timeZone}
            feedbackSaving={feedbackSaving}
            onSubmitFeedback={(outcome, comment) => onSubmitFeedback(item, outcome, comment)}
            onSubmitResult={(result) => onSubmitResult(item, result)}
          />
        )}
      />
      <RadarCardActionFooter
        item={item}
        timeZone={timeZone}
        generatedComment={generatedComment}
        canDraft={canDraft}
        drafting={drafting}
        savedMemoryID={savedMemoryID}
        memoryAccountID={memoryAccountID}
        memoryDisabled={memoryDisabled}
        savingMemory={savingMemory}
        savingSeed={savingSeed}
        generatingSeedDraft={generatingSeedDraft}
        onCopyComment={copyComment}
        onOpenPost={() => onManualAction({ opened: true, taskStatus: "in_progress" })}
        onCreateDraft={() => onCreateDraft(item)}
        onSaveMemory={() => onSaveMemory(item)}
        onSaveContentSeed={() => onSaveContentSeed(item)}
        onGenerateContentDraft={() => onGenerateContentDraft(item)}
      />
    </article>
  );
}
