"use client";

import { useState } from "react";
import { BarChart3, CheckCircle2, ExternalLink, RefreshCw, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";
import { formatDateTime } from "@/lib/timezone";
import type { ExposureRadarItemApi } from "@/services/exposure-radar.service";
import { manualOutcomeOptions } from "@/components/exposure-radar/constants";
import { extractTweetID, hasManualBackfill, isManualActionHandled } from "@/components/exposure-radar/radar-signal-utils";
import type { ManualActionState, ManualOutcome, SafetyReviewStatus } from "@/components/exposure-radar/types";

type ResultPayload = {
  impressions?: number;
  likes?: number;
  replies?: number;
  reposts?: number;
  quotes?: number;
  bookmarks?: number;
  notes?: string;
};

export function ManualWorkflowPanel({
  copied,
  opened,
  saved,
  handled,
  handling,
  resultResolving,
  publishedURL,
  commentURL,
  persisted,
  onPublishedURLChange,
  onResolveResult,
  onMarkHandled,
}: {
  copied: boolean;
  opened: boolean;
  saved: boolean;
  handled: boolean;
  handling: boolean;
  resultResolving: boolean;
  publishedURL: string;
  commentURL: string;
  persisted: boolean;
  onPublishedURLChange: (value: string) => void;
  onResolveResult: () => void;
  onMarkHandled: () => void;
}) {
  const { t } = useT();
  const replyURL = publishedURL.trim() || commentURL;

  return (
    <div className="mt-3 rounded-xl border border-[#1d9bf0]/20 bg-black/30 p-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.manualWorkflow.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("exposureRadar.manualWorkflow.description")}</p>
        </div>
        <Button type="button" size="sm" variant={handled ? "outline" : "default"} disabled={handling} onClick={onMarkHandled}>
          {handling ? <RefreshCw className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
          {handling ? t("exposureRadar.manualAction.saving") : handled ? t("exposureRadar.manualAction.handled") : t("exposureRadar.manualAction.markHandled")}
        </Button>
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
        <label className="min-w-0">
          <span className="sr-only">{t("exposureRadar.manualWorkflow.resultLabel")}</span>
          <input
            value={publishedURL}
            onChange={(event) => onPublishedURLChange(event.target.value)}
            placeholder={t("exposureRadar.manualWorkflow.resultPlaceholder")}
            disabled={handling}
            className="h-9 w-full rounded-full border border-[#2f3336] bg-black px-3 text-xs text-[#e7e9ea] outline-none transition focus:border-[#1d9bf0]"
          />
        </label>
        <Button type="button" size="sm" variant="outline" disabled={handling || resultResolving || !replyURL} onClick={onResolveResult} className="h-9">
          {resultResolving ? <RefreshCw className="size-3.5 animate-spin" /> : <BarChart3 className="size-3.5" />}
          {resultResolving ? t("exposureRadar.resultLookup.loading") : t("exposureRadar.resultLookup.button")}
        </Button>
        {replyURL ? (
          <a href={replyURL} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center gap-1 rounded-full border border-[#2f3336] px-3 text-xs font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
            {t("exposureRadar.manualWorkflow.openReply")}
            <ExternalLink className="size-3.5" />
          </a>
        ) : null}
      </div>
      <p className="mt-2 text-xs leading-5 text-[#71767b]">{persisted ? t("exposureRadar.manualWorkflow.persisted") : t("exposureRadar.manualWorkflow.resultHint")}</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <ManualWorkflowStep done={copied} label={t("exposureRadar.manualWorkflow.copy")} />
        <ManualWorkflowStep done={opened} label={t("exposureRadar.manualWorkflow.open")} />
        <ManualWorkflowStep done={saved} label={t("exposureRadar.manualWorkflow.save")} />
        <ManualWorkflowStep done={handled} label={t("exposureRadar.manualWorkflow.handle")} />
      </div>
    </div>
  );
}

export function ManualHandlingRecord({
  item,
  manualState,
  timeZone,
  feedbackSaving,
  onSubmitFeedback,
  onSubmitResult,
}: {
  item: ExposureRadarItemApi;
  manualState?: ManualActionState;
  timeZone: string;
  feedbackSaving: boolean;
  onSubmitFeedback: (outcome: ManualOutcome, comment: string) => void;
  onSubmitResult: (result: ResultPayload) => void;
}) {
  const { t } = useT();
  const replyURL = manualState?.publishedUrl || item.comment_url || "";
  const replyID = item.comment_tweet_id || extractTweetID(replyURL);
  const statusKey = manualRecordStatus(item, manualState);
  const updatedAt = manualState?.updatedAt ? formatDateTime(manualState.updatedAt, timeZone) : "-";
  const [feedbackComment, setFeedbackComment] = useState(manualState?.feedbackComment || "");
  const [resultForm, setResultForm] = useState(() => manualResultFormFromState(manualState));
  const saveResult = () => onSubmitResult({
    impressions: parseOptionalCount(resultForm.impressions),
    likes: parseOptionalCount(resultForm.likes),
    replies: parseOptionalCount(resultForm.replies),
    reposts: parseOptionalCount(resultForm.reposts),
    quotes: parseOptionalCount(resultForm.quotes),
    bookmarks: parseOptionalCount(resultForm.bookmarks),
    notes: resultForm.notes.trim(),
  });

  return (
    <div className="mt-3 rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.manualRecord.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.manualRecord.description")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {item.manual_action_url ? (
            <a href={item.manual_action_url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-full border border-[#2f3336] px-3 text-xs font-semibold text-[#e7e9ea] hover:bg-black">
              {t("exposureRadar.manualRecord.openOriginal")}
              <ExternalLink className="size-3.5" />
            </a>
          ) : null}
          {replyURL ? (
            <a href={replyURL} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-full border border-[#00ba7c]/30 bg-[#00ba7c]/10 px-3 text-xs font-semibold text-[#7ee0b5] hover:bg-[#00ba7c]/15">
              {t("exposureRadar.manualRecord.openReply")}
              <ExternalLink className="size-3.5" />
            </a>
          ) : null}
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <ManualRecordField label={t("exposureRadar.manualRecord.task")} value={item.review_task_id ? `#${item.review_task_id}` : "-"} />
        <ManualRecordField label={t("exposureRadar.manualRecord.status")} value={t(`exposureRadar.manualRecord.status.${statusKey}`)} />
        <ManualRecordField label={t("exposureRadar.manualRecord.replyId")} value={replyID || t("exposureRadar.manualRecord.noReply")} />
        <ManualRecordField label={t("exposureRadar.manualRecord.updated")} value={updatedAt} />
      </div>
      {manualState?.safetyStatus || manualState?.replyAngleTitle ? (
        <div className="mt-3 rounded-lg border border-[#2f3336] bg-black p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.manualRecord.safetyTitle")}</p>
              <p className="mt-1 text-xs leading-5 text-[#71767b]">{manualState.safetySummary || t("exposureRadar.manualRecord.safetyEmpty")}</p>
            </div>
            {manualState.safetyStatus ? (
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${safetyReviewBadgeTone(manualState.safetyStatus)}`}>
                <ShieldAlert className="size-3.5" />
                {t(`exposureRadar.safetyReview.status.${manualState.safetyStatus}`)}
              </span>
            ) : null}
          </div>
          {manualState.replyAngleTitle ? (
            <p className="mt-2 text-xs leading-5 text-[#8b98a5]">{t("exposureRadar.manualRecord.replyAngle", { angle: manualState.replyAngleTitle })}</p>
          ) : null}
        </div>
      ) : null}
      <div className="mt-3 rounded-lg border border-[#2f3336] bg-black p-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.resultTracking.title")}</p>
            <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.resultTracking.description")}</p>
          </div>
          {manualState?.resultCheckedAt ? (
            <span className="inline-flex h-7 items-center rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-2.5 text-xs font-semibold text-[#7ee0b5]">
              {t("exposureRadar.resultTracking.score", { score: manualState.resultScore || 0 })}
            </span>
          ) : null}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <ResultInput label={t("exposureRadar.resultTracking.impressions")} value={resultForm.impressions} onChange={(value) => setResultForm((current) => ({ ...current, impressions: value }))} />
          <ResultInput label={t("exposureRadar.resultTracking.likes")} value={resultForm.likes} onChange={(value) => setResultForm((current) => ({ ...current, likes: value }))} />
          <ResultInput label={t("exposureRadar.resultTracking.replies")} value={resultForm.replies} onChange={(value) => setResultForm((current) => ({ ...current, replies: value }))} />
          <ResultInput label={t("exposureRadar.resultTracking.reposts")} value={resultForm.reposts} onChange={(value) => setResultForm((current) => ({ ...current, reposts: value }))} />
          <ResultInput label={t("exposureRadar.resultTracking.quotes")} value={resultForm.quotes} onChange={(value) => setResultForm((current) => ({ ...current, quotes: value }))} />
          <ResultInput label={t("exposureRadar.resultTracking.bookmarks")} value={resultForm.bookmarks} onChange={(value) => setResultForm((current) => ({ ...current, bookmarks: value }))} />
        </div>
        <div className="mt-3 flex flex-col gap-2 md:flex-row">
          <input
            value={resultForm.notes}
            onChange={(event) => setResultForm((current) => ({ ...current, notes: event.target.value }))}
            placeholder={t("exposureRadar.resultTracking.notesPlaceholder")}
            className="h-9 min-w-0 flex-1 rounded-full border border-[#2f3336] bg-[#0f1419] px-3 text-xs text-[#e7e9ea] outline-none transition focus:border-[#1d9bf0]"
          />
          <Button type="button" size="sm" variant="outline" onClick={saveResult}>
            <BarChart3 className="size-3.5" />
            {t("exposureRadar.resultTracking.save")}
          </Button>
        </div>
      </div>
      <div className="mt-3 rounded-lg border border-[#2f3336] bg-black p-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.manualFeedback.title")}</p>
            <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.manualFeedback.description")}</p>
          </div>
          {manualState?.outcome ? (
            <span className="inline-flex h-7 items-center rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-2.5 text-xs font-semibold text-[#8ecdf8]">
              {t("exposureRadar.manualFeedback.recorded", { outcome: t(`exposureRadar.manualFeedback.outcome.${manualState.outcome}`) })}
            </span>
          ) : null}
        </div>
        <input
          value={feedbackComment}
          onChange={(event) => setFeedbackComment(event.target.value)}
          placeholder={t("exposureRadar.manualFeedback.placeholder")}
          disabled={feedbackSaving}
          className="mt-3 h-9 w-full rounded-full border border-[#2f3336] bg-[#0f1419] px-3 text-xs text-[#e7e9ea] outline-none transition focus:border-[#1d9bf0]"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {manualOutcomeOptions.map((outcome) => (
            <Button key={outcome} type="button" size="sm" variant={manualState?.outcome === outcome ? "default" : "outline"} disabled={feedbackSaving} onClick={() => onSubmitFeedback(outcome, feedbackComment)}>
              {feedbackSaving ? <RefreshCw className="size-3.5 animate-spin" /> : null}
              {t(`exposureRadar.manualFeedback.outcome.${outcome}`)}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function manualResultFormKey(state?: ManualActionState) {
  return [
    state?.resultImpressionCount ?? "",
    state?.resultLikeCount ?? "",
    state?.resultReplyCount ?? "",
    state?.resultRetweetCount ?? "",
    state?.resultQuoteCount ?? "",
    state?.resultBookmarkCount ?? "",
    state?.resultNotes ?? "",
    state?.resultCheckedAt ?? "",
  ].join(":");
}

function ManualRecordField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-[#2f3336] bg-black px-3 py-2">
      <p className="text-[11px] text-[#71767b]">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-[#e7e9ea]" title={value}>{value}</p>
    </div>
  );
}

function ResultInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="min-w-0">
      <span className="text-[11px] text-[#71767b]">{label}</span>
      <input
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/[^\d]/g, ""))}
        className="mt-1 h-9 w-full rounded-lg border border-[#2f3336] bg-[#0f1419] px-3 text-xs font-semibold text-[#e7e9ea] outline-none transition focus:border-[#1d9bf0]"
      />
    </label>
  );
}

function ManualWorkflowStep({ done, label }: { done: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-semibold ${done ? "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" : "border-[#2f3336] bg-[#0f1419] text-[#71767b]"}`}>
      <CheckCircle2 className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{label}</span>
    </div>
  );
}

function manualRecordStatus(item: ExposureRadarItemApi, state?: ManualActionState) {
  if (state?.taskStatus === "skipped") return "skipped";
  if (state?.taskStatus === "later") return "later";
  if (hasManualBackfill(item, state)) return "backfilled";
  if (isManualActionHandled(item, state)) return "handled";
  if (state?.copied || state?.opened || state?.saved) return "in_progress";
  return "generated";
}

function manualResultFormFromState(state?: ManualActionState) {
  return {
    impressions: formatOptionalCount(state?.resultImpressionCount),
    likes: formatOptionalCount(state?.resultLikeCount),
    replies: formatOptionalCount(state?.resultReplyCount),
    reposts: formatOptionalCount(state?.resultRetweetCount),
    quotes: formatOptionalCount(state?.resultQuoteCount),
    bookmarks: formatOptionalCount(state?.resultBookmarkCount),
    notes: state?.resultNotes || "",
  };
}

function parseOptionalCount(value: string): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function formatOptionalCount(value?: number) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function safetyReviewBadgeTone(status: SafetyReviewStatus) {
  switch (status) {
    case "block":
      return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
    case "watch":
      return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
    default:
      return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  }
}
