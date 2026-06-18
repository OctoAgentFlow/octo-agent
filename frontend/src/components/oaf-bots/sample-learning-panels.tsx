"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Copy, FilePlus2, ListChecks, MessageCircle, MessagesSquare, RefreshCw, Send, Sparkles, ThumbsDown, ThumbsUp, Trash2 } from "lucide-react";

import { getChipLabel, getSelectLabel, TextArea, type ChipOption, type SelectOption } from "@/components/oaf-bots/form-fields";
import { Button } from "@/components/ui/button";
import { formatDateTime, usePreferredTimeZone } from "@/lib/timezone";
import type { AccountListItem } from "@/services/account.service";
import type { OAFBotFeedbackProfileSuggestionResult, OAFBotGenerationFeedback, OAFBotGenerationFeedbackRating, OAFBotPayload, OAFBotSampleScene, OAFBotTestGenerateResult } from "@/types/oaf-bot";

type TranslationFn = (key: string, params?: Record<string, string | number>) => string;
type SampleScene = OAFBotSampleScene;
type FeedbackDraft = { rating: OAFBotGenerationFeedbackRating | ""; issueTags: string[]; comment: string };
type SafetyRewritePreview = { before: string; result: OAFBotTestGenerateResult };
type SafetyRewriteMode = "natural" | "conservative" | "shorter";
type ProfileDiffItem = { key: keyof OAFBotPayload; before: OAFBotPayload[keyof OAFBotPayload]; after: OAFBotPayload[keyof OAFBotPayload] };
const safetyRewriteModes: SafetyRewriteMode[] = ["natural", "conservative", "shorter"];
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

export function mergeFeedbackSuggestionProfile(current: OAFBotPayload, suggestion: OAFBotPayload): OAFBotPayload {
  return {
    ...current,
    ...suggestion,
    name: current.name || suggestion.name,
    twitter_account_id: current.twitter_account_id || suggestion.twitter_account_id,
  };
}

export function getFeedbackSuggestionDiffs(current: OAFBotPayload, suggestion: OAFBotPayload): ProfileDiffItem[] {
  const merged = mergeFeedbackSuggestionProfile(current, suggestion);
  return feedbackSuggestionDiffKeys
    .filter((key) => !profileValuesEqual(current[key], merged[key]))
    .map((key) => ({
      key,
      before: current[key],
      after: merged[key],
    }));
}

function profileValuesEqual(left: OAFBotPayload[keyof OAFBotPayload], right: OAFBotPayload[keyof OAFBotPayload]) {
  return normalizeProfileValue(left) === normalizeProfileValue(right);
}

function normalizeProfileValue(value: OAFBotPayload[keyof OAFBotPayload]) {
  if (Array.isArray(value)) {
    return JSON.stringify(value.map((item) => String(item).trim()).filter(Boolean));
  }
  if (typeof value === "number") return String(value || "");
  return String(value || "").trim();
}

function formatProfileValue(value: OAFBotPayload[keyof OAFBotPayload], t: (key: string, params?: Record<string, string | number>) => string) {
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : t("oafBots.feedbackSuggestion.emptyValue");
  if (typeof value === "number") return value > 0 ? String(value) : t("oafBots.feedbackSuggestion.emptyValue");
  if (typeof value === "boolean") return value ? "true" : "false";
  return value?.trim() || t("oafBots.feedbackSuggestion.emptyValue");
}

function fieldLabel(key: keyof OAFBotPayload, t: (key: string, params?: Record<string, string | number>) => string) {
  if (key === "twitter_account_id") return t("oafBots.fields.twitterAccount");
  const labelKey = `oafBots.fields.${snakeToCamel(String(key))}`;
  const label = t(labelKey);
  return label === labelKey ? String(key) : label;
}

function snakeToCamel(value: string) {
  return value.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

export function splitMultiValue(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getFeedbackIssueLabel(value: string, options: ChipOption[]) {
  const direct = getChipLabel(value, options);
  if (direct !== value) return direct;
  const normalized = value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
  const normalizedLabel = getChipLabel(normalized, options);
  if (normalizedLabel !== normalized) return normalizedLabel;
  return value.replace(/_/g, " ");
}

function topFeedbackCount(values: string[]): { key: string; count: number } | null {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    const key = value.trim();
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  let top: { key: string; count: number } | null = null;
  for (const [key, count] of counts.entries()) {
    if (!top || count > top.count || (count === top.count && key < top.key)) {
      top = { key, count };
    }
  }
  return top;
}

function formatFeedbackDate(value: string, timeZone: string) {
  if (!value) return "";
  return formatDateTime(value, timeZone);
}

export function SamplePanel({
  t,
  samples,
  learningComparison,
  scene,
  onSceneChange,
  sampleContext,
  onSampleContextChange,
  generating,
  comparingLearning,
  rewritingSafety,
  safetyRewriteMode,
  onGenerate,
  onCompareWithoutLearning,
  onSafetyRewriteModeChange,
  onRewriteSafety,
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
  feedbackDeletingID,
  feedbackDraft,
  feedbackSaving,
  feedbackSuggestionLoading,
  feedbackSuggestionPreview,
  safetyRewritePreview,
  feedbackIssueOptions,
  disabledLearningIssues,
  onFeedbackDraftChange,
  onFeedbackSubmit,
  onFeedbackDelete,
  onFeedbackProfileSuggestion,
  onApplyFeedbackSuggestion,
  onDismissFeedbackSuggestion,
  onApplySafetyRewrite,
  onDismissSafetyRewrite,
  onToggleLearningIssue,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  samples: OAFBotTestGenerateResult | null;
  learningComparison: OAFBotTestGenerateResult | null;
  scene: SampleScene;
  onSceneChange: (scene: SampleScene) => void;
  sampleContext: string;
  onSampleContextChange: (value: string) => void;
  generating: boolean;
  comparingLearning: boolean;
  rewritingSafety: boolean;
  safetyRewriteMode: SafetyRewriteMode;
  onGenerate: () => void;
  onCompareWithoutLearning: () => void;
  onSafetyRewriteModeChange: (mode: SafetyRewriteMode) => void;
  onRewriteSafety: () => void;
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
  feedbackDeletingID: number | null;
  feedbackDraft: FeedbackDraft;
  feedbackSaving: boolean;
  feedbackSuggestionLoading: boolean;
  feedbackSuggestionPreview: OAFBotFeedbackProfileSuggestionResult | null;
  safetyRewritePreview: SafetyRewritePreview | null;
  feedbackIssueOptions: ChipOption[];
  disabledLearningIssues: string[];
  onFeedbackDraftChange: (draft: FeedbackDraft) => void;
  onFeedbackSubmit: () => void;
  onFeedbackDelete: (feedbackID: number) => void;
  onFeedbackProfileSuggestion: () => void;
  onApplyFeedbackSuggestion: () => void;
  onDismissFeedbackSuggestion: () => void;
  onApplySafetyRewrite: () => void;
  onDismissSafetyRewrite: () => void;
  onToggleLearningIssue: (issue: string) => void;
}) {
  const sceneItems: Array<{ id: SampleScene; icon: ReactNode; title: string; description: string }> = [
    { id: "tweet", icon: <Send className="size-4" />, title: t("oafBots.samples.tweet"), description: t("oafBots.samples.tweetContext") },
    { id: "reply", icon: <MessageCircle className="size-4" />, title: t("oafBots.samples.reply"), description: t("oafBots.samples.replyContext") },
    { id: "comment", icon: <MessagesSquare className="size-4" />, title: t("oafBots.samples.comment"), description: t("oafBots.samples.commentContext") },
  ];
  const personaRows = getSamplePersonaRows(form, account, occupationOptions, industryOptions, safetyOptions, languageOptions, languageStrategyOptions, t);
  const selectedSceneItem = sceneItems.find((item) => item.id === scene) ?? sceneItems[0];
  const selectedContent = useMemo(() => normalizeSampleContent(samples, scene), [samples, scene]);
  const comparisonContent = useMemo(() => normalizeSampleContent(learningComparison, scene), [learningComparison, scene]);
  const providerLabel = samples?.provider ? providerSourceLabel(samples.provider, t) : "";
  const appliedLearningRuleIssues = (samples?.feedback_signal_summary?.applied_learning_rules || []).map((rule) => rule.issue).filter(Boolean);
  const suggestionDiffs = useMemo(
    () => (feedbackSuggestionPreview ? getFeedbackSuggestionDiffs(form, feedbackSuggestionPreview.profile) : []),
    [feedbackSuggestionPreview, form],
  );
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

      <div className="rounded-2xl border border-[#1d9bf0]/25 bg-[#06111d] p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]">
            {selectedSceneItem.icon}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#e7e9ea]">{t("oafBots.test.primarySceneTitle", { scene: selectedSceneItem.title })}</p>
            <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{selectedSceneItem.description}</p>
          </div>
        </div>
      </div>

      <details className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
        <summary className="cursor-pointer list-none text-sm font-semibold text-[#e7e9ea]">
          {t("oafBots.test.advancedScenes")}
        </summary>
        <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
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
      </details>

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
          <p className="mt-2 text-xs leading-5 text-[#8ecdf8]">{t("oafBots.test.feedbackLearningHint")}</p>
        </div>
        <Button type="button" onClick={onGenerate} disabled={generating || previewDisabled}>
          {generating ? <RefreshCw className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {generating ? t("oafBots.test.loadingShort") : t("oafBots.actions.generate")}
        </Button>
      </div>

      <details className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
        <summary className="cursor-pointer list-none text-sm font-semibold text-[#e7e9ea]">
          {t("oafBots.feedback.advancedSummary")}
        </summary>
        <div className="mt-3">
          <GenerationFeedbackHistory
            t={t}
            items={feedbackItems}
            loading={feedbackLoading}
            deletingID={feedbackDeletingID}
            issueOptions={feedbackIssueOptions}
            suggestionLoading={feedbackSuggestionLoading}
            onDelete={onFeedbackDelete}
            onSuggestProfile={onFeedbackProfileSuggestion}
          />
        </div>
      </details>

      {samples ? (
        <div className="grid min-w-0 grid-cols-1 gap-4">
          <div className="grid min-w-0 grid-cols-1 gap-3">
            <SampleCard
              title={selectedSceneItem.title}
              text={selectedContent || t("oafBots.samples.empty")}
              providerLabel={providerLabel}
              feedbackSignalCount={samples.feedback_signal_count || 0}
              feedbackSignalSummary={samples.feedback_signal_summary}
              issueOptions={feedbackIssueOptions}
              disabledLearningIssues={disabledLearningIssues}
              highlight
              onRegenerate={onGenerate}
              onToggleLearningIssue={onToggleLearningIssue}
              t={t}
            />
            {selectedID ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-[#1d9bf0]/25 bg-[#06111d] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#e7e9ea]">{t("oafBots.samples.dailyDraftTitle")}</p>
                  <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("oafBots.samples.dailyDraftHint")}</p>
                </div>
                <Link href={`/content-drafts?panel=generate&bot_id=${selectedID}`} className="inline-flex shrink-0">
                  <Button type="button" size="sm">
                    <ListChecks className="size-4" />
                    {t("oafBots.samples.dailyDraftCta")}
                  </Button>
                </Link>
              </div>
            ) : null}
            {appliedLearningRuleIssues.length > 0 ? (
              <LearningImpactCompare
                t={t}
                currentText={selectedContent}
                comparisonText={comparisonContent}
                issues={appliedLearningRuleIssues}
                issueOptions={feedbackIssueOptions}
                comparing={comparingLearning}
                onCompare={onCompareWithoutLearning}
              />
            ) : null}
          </div>
          <SampleSafetyExplanation
            t={t}
            evaluation={samples.safety_evaluation}
            rewriting={rewritingSafety}
            rewriteMode={safetyRewriteMode}
            onRewriteModeChange={onSafetyRewriteModeChange}
            onRewrite={onRewriteSafety}
          />
          <SafetyRewritePreviewPanel
            t={t}
            preview={safetyRewritePreview}
            sceneTitle={selectedSceneItem.title}
            onApply={onApplySafetyRewrite}
            onDismiss={onDismissSafetyRewrite}
          />
          <GenerationFeedbackPanel
            t={t}
            draft={feedbackDraft}
            saving={feedbackSaving}
            issueOptions={feedbackIssueOptions}
            onChange={onFeedbackDraftChange}
            onSubmit={onFeedbackSubmit}
          />
          <ProfileDiffPreview
            t={t}
            visible={Boolean(feedbackSuggestionPreview)}
            title={t("oafBots.feedbackSuggestion.previewTitle")}
            description={suggestionDiffs.length > 0 ? t("oafBots.feedbackSuggestion.previewDescription", { count: suggestionDiffs.length }) : t("oafBots.feedbackSuggestion.noDiffDescription")}
            meta={feedbackSuggestionPreview ? t("oafBots.feedbackSuggestion.feedbackCount", { count: feedbackSuggestionPreview.feedback_count || 0 }) : ""}
            diffs={suggestionDiffs}
            noDiff={t("oafBots.feedbackSuggestion.noDiff")}
            dismissLabel={t("oafBots.feedbackSuggestion.dismiss")}
            applyLabel={t("oafBots.feedbackSuggestion.apply")}
            onApply={onApplyFeedbackSuggestion}
            onDismiss={onDismissFeedbackSuggestion}
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
  feedbackSignalCount = 0,
  feedbackSignalSummary,
  issueOptions,
  disabledLearningIssues,
  highlight = false,
  onRegenerate,
  onToggleLearningIssue,
  t,
}: {
  title: string;
  text: string;
  providerLabel?: string;
  feedbackSignalCount?: number;
  feedbackSignalSummary?: OAFBotTestGenerateResult["feedback_signal_summary"];
  issueOptions: ChipOption[];
  disabledLearningIssues: string[];
  highlight?: boolean;
  onRegenerate: () => void;
  onToggleLearningIssue: (issue: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const content = cleanupGeneratedText(text);
  const isLong = content.length > 260;
  const visibleText = !expanded && isLong ? `${content.slice(0, 260).trim()}...` : content;
  const summaryIssueLabels = (feedbackSignalSummary?.issue_tags || []).map((tag) => getFeedbackIssueLabel(tag, issueOptions)).filter(Boolean);
  const summarySceneLabels = (feedbackSignalSummary?.scenes || []).map((item) => t(`oafBots.samples.${item}`)).filter(Boolean);
  const learningRules = feedbackSignalSummary?.applied_learning_rules || [];
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
            {feedbackSignalCount > 0 ? ` · ${t("oafBots.samples.feedbackSignalMeta", { count: feedbackSignalCount })}` : ""}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-[#2f3336] bg-[#0f1419] px-2.5 py-1 text-xs text-[#71767b]">
          {highlight ? t("oafBots.samples.selected") : t("oafBots.samples.generated")}
        </span>
      </div>
      {feedbackSignalSummary && feedbackSignalSummary.count > 0 ? (
        <div className="mt-3 rounded-xl border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 p-3">
          <p className="text-xs font-semibold text-[#8ecdf8]">{t("oafBots.samples.feedbackSignalSummaryTitle", { count: feedbackSignalSummary.count })}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {summaryIssueLabels.length > 0 ? (
              <span className="rounded-full border border-[#1d9bf0]/30 bg-black/30 px-2.5 py-1 text-xs text-[#c9eefc]">
                {t("oafBots.samples.feedbackSignalIssues", { issues: summaryIssueLabels.join(", ") })}
              </span>
            ) : null}
            {summarySceneLabels.length > 0 ? (
              <span className="rounded-full border border-[#1d9bf0]/30 bg-black/30 px-2.5 py-1 text-xs text-[#c9eefc]">
                {t("oafBots.samples.feedbackSignalScenes", { scenes: summarySceneLabels.join(", ") })}
              </span>
            ) : null}
          </div>
          {feedbackSignalSummary.latest_comment ? (
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#71767b]">{t("oafBots.samples.feedbackSignalLatest", { comment: feedbackSignalSummary.latest_comment })}</p>
          ) : null}
          {learningRules.length > 0 ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold text-[#d7ebff]">{t("oafBots.samples.learningRulesTitle")}</p>
              {learningRules.map((rule) => {
                const disabled = disabledLearningIssues.includes(rule.issue) || rule.preference_status === "disabled";
                return (
                  <div key={rule.issue} className={`rounded-lg border px-3 py-2 ${disabled ? "border-[#2f3336] bg-black/20 opacity-60" : "border-[#1d9bf0]/20 bg-black/30"}`}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#e7e9ea]">
                          {getFeedbackIssueLabel(rule.issue, issueOptions) || rule.issue} · {t("oafBots.samples.learningRuleMeta", { confidence: rule.confidence, count: rule.accurate_judgments })}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#8b98a5]">{rule.instruction}</p>
                      </div>
                      <button type="button" onClick={() => onToggleLearningIssue(rule.issue)} className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition ${disabled ? "border-[#2f3336] text-[#71767b] hover:text-[#e7e9ea]" : "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5] hover:bg-[#00ba7c]/15"}`}>
                        {disabled ? t("oafBots.samples.learningRuleDisabled") : t("oafBots.samples.learningRuleEnabled")}
                      </button>
                    </div>
                    {rule.evidence?.length ? <p className="mt-1 text-xs text-[#71767b]">{t("oafBots.samples.learningRuleEvidence", { evidence: rule.evidence.join(" / ") })}</p> : null}
                  </div>
                );
              })}
              <p className="text-xs leading-5 text-[#71767b]">{t("oafBots.samples.learningRuleToggleHint")}</p>
            </div>
          ) : null}
        </div>
      ) : null}
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

function SampleSafetyExplanation({
  t,
  evaluation,
  rewriting,
  rewriteMode,
  onRewriteModeChange,
  onRewrite,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  evaluation?: OAFBotTestGenerateResult["safety_evaluation"];
  rewriting: boolean;
  rewriteMode: SafetyRewriteMode;
  onRewriteModeChange: (mode: SafetyRewriteMode) => void;
  onRewrite: () => void;
}) {
  if (!evaluation) return null;
  const canRewrite = evaluation.action === "avoid" || evaluation.action === "review" || (evaluation.matched_hits?.length ?? 0) > 0;
  const tone =
    evaluation.action === "avoid"
      ? "border-rose-300/20 bg-rose-400/10 text-rose-100"
      : evaluation.action === "review"
        ? "border-amber-300/20 bg-amber-400/10 text-amber-100"
        : "border-emerald-300/20 bg-emerald-400/10 text-emerald-100";
  const icon = evaluation.action === "allow" ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />;
  const actionKey = `oafBots.safetyExplanation.action.${evaluation.action}`;
  const categoryKey = `oafBots.safetyExplanation.category.${evaluation.category}`;
  const reasonKey = `oafBots.safetyExplanation.reason.${evaluation.category}`;
  const actionLabel = t(actionKey) === actionKey ? evaluation.action : t(actionKey);
  const categoryLabel = t(categoryKey) === categoryKey ? evaluation.category : t(categoryKey);
  const reason = t(reasonKey) === reasonKey ? evaluation.reason : t(reasonKey);
  return (
    <div className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 shrink-0">{icon}</span>
          <div className="min-w-0">
            <p className="text-sm font-bold">{t("oafBots.safetyExplanation.title")}</p>
            <p className="mt-1 text-xs leading-5 opacity-80">{reason}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <span className="rounded-full border border-white/10 bg-black/15 px-2.5 py-1 text-xs">{actionLabel}</span>
          <span className="rounded-full border border-white/10 bg-black/15 px-2.5 py-1 text-xs">{categoryLabel}</span>
        </div>
      </div>
      {evaluation.matched_hits?.length ? (
        <div className="mt-3">
          <p className="text-xs font-semibold opacity-80">{t("oafBots.safetyExplanation.hits")}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {evaluation.matched_hits.map((hit, index) => (
              <span key={`${hit.source}-${hit.term}-${index}`} className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-xs">
                {t(`oafBots.safetyExplanation.source.${hit.source}`) === `oafBots.safetyExplanation.source.${hit.source}` ? hit.source : t(`oafBots.safetyExplanation.source.${hit.source}`)}: {hit.term}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-xs leading-5 opacity-75">{t("oafBots.safetyExplanation.noHits")}</p>
      )}
      {canRewrite ? (
        <div className="mt-4 rounded-xl border border-white/10 bg-black/15 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 opacity-85">{t("oafBots.safetyRewrite.hint")}</p>
            <Button type="button" size="sm" variant="outline" onClick={onRewrite} disabled={rewriting} className="shrink-0 border-white/15 bg-black/20 text-current hover:bg-black/35">
              {rewriting ? <RefreshCw className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {rewriting ? t("oafBots.safetyRewrite.loading") : t("oafBots.safetyRewrite.action")}
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {safetyRewriteModes.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onRewriteModeChange(mode)}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
                  rewriteMode === mode ? "border-white/20 bg-white/15 text-current" : "border-white/10 bg-black/15 opacity-75 hover:opacity-100"
                }`}
              >
                {t(`oafBots.safetyRewrite.mode.${mode}`)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LearningImpactCompare({
  t,
  currentText,
  comparisonText,
  issues,
  issueOptions,
  comparing,
  onCompare,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  currentText: string;
  comparisonText: string;
  issues: string[];
  issueOptions: ChipOption[];
  comparing: boolean;
  onCompare: () => void;
}) {
  const issueLabels = Array.from(new Set(issues)).map((issue) => getFeedbackIssueLabel(issue, issueOptions));
  return (
    <div className="rounded-2xl border border-[#1d9bf0]/25 bg-[#06111d] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#d7ebff]">{t("oafBots.learningCompare.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("oafBots.learningCompare.description", { issues: issueLabels.join(", ") })}</p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={comparing} onClick={onCompare}>
          {comparing ? <RefreshCw className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {comparing ? t("oafBots.learningCompare.running") : t("oafBots.learningCompare.action")}
        </Button>
      </div>
      <p className="mt-3 rounded-xl border border-[#1d9bf0]/20 bg-black/25 px-3 py-2 text-xs leading-5 text-[#8ecdf8]">
        {t("oafBots.learningCompare.costHint")}
      </p>
      {comparisonText ? (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <LearningComparePane title={t("oafBots.learningCompare.withRules")} text={currentText} />
          <LearningComparePane title={t("oafBots.learningCompare.withoutRules")} text={comparisonText} />
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-[#2f3336] bg-black/25 px-3 py-4 text-xs leading-5 text-[#71767b]">
          {t("oafBots.learningCompare.empty")}
        </p>
      )}
    </div>
  );
}

function LearningComparePane({ title, text }: { title: string; text: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#2f3336] bg-black p-3">
      <p className="text-xs font-semibold text-[#8ecdf8]">{title}</p>
      <p className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 text-[#e7e9ea] [overflow-wrap:anywhere]">{text || "—"}</p>
    </div>
  );
}

function SafetyRewritePreviewPanel({
  t,
  preview,
  sceneTitle,
  onApply,
  onDismiss,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  preview: SafetyRewritePreview | null;
  sceneTitle: string;
  onApply: () => void;
  onDismiss: () => void;
}) {
  if (!preview) return null;
  const after = normalizeSampleContent(preview.result, preview.result.scene);
  const evaluation = preview.result.safety_evaluation;
  const actionLabel = evaluation ? t(`oafBots.safetyExplanation.action.${evaluation.action}`) : "";
  return (
    <div className="rounded-2xl border border-[#1d9bf0]/35 bg-[#1d9bf0]/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-bold text-[#e7e9ea]">{t("oafBots.safetyRewrite.previewTitle")}</p>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("oafBots.safetyRewrite.previewDescription")}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <span className="rounded-full border border-[#2f3336] bg-black/50 px-2.5 py-1 text-xs text-[#8ecdf8]">{sceneTitle}</span>
          {evaluation ? (
            <span className="rounded-full border border-[#2f3336] bg-black/50 px-2.5 py-1 text-xs text-[#8ecdf8]">
              {actionLabel === `oafBots.safetyExplanation.action.${evaluation.action}` ? evaluation.action : actionLabel}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch">
        <RewriteValueBox label={t("oafBots.diff.before")} value={preview.before} tone="before" />
        <div className="hidden items-center justify-center text-[#71767b] lg:flex">
          <ArrowRight className="size-4" />
        </div>
        <RewriteValueBox label={t("oafBots.diff.after")} value={after || t("oafBots.samples.empty")} tone="after" />
      </div>

      {evaluation?.matched_hits?.length ? (
        <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-400/10 p-3 text-xs leading-5 text-amber-100">
          <p>{t("oafBots.safetyRewrite.remainingHits", { count: evaluation.matched_hits.length })}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {evaluation.matched_hits.map((hit, index) => (
              <span key={`${hit.source}-${hit.term}-${index}`} className="rounded-full border border-amber-100/10 bg-black/20 px-2 py-0.5">
                {t(`oafBots.safetyExplanation.source.${hit.source}`) === `oafBots.safetyExplanation.source.${hit.source}` ? hit.source : t(`oafBots.safetyExplanation.source.${hit.source}`)}: {hit.term}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-400/10 p-3 text-xs leading-5 text-emerald-100">
          {t("oafBots.safetyRewrite.noRemainingHits")}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onDismiss}>
          {t("oafBots.safetyRewrite.dismiss")}
        </Button>
        <Button type="button" size="sm" onClick={onApply}>
          <CheckCircle2 className="size-4" />
          {t("oafBots.safetyRewrite.apply")}
        </Button>
      </div>
    </div>
  );
}

function RewriteValueBox({ label, value, tone }: { label: string; value: string; tone: "before" | "after" }) {
  return (
    <div className={`min-w-0 rounded-xl border p-3 ${tone === "after" ? "border-emerald-300/20 bg-emerald-400/8" : "border-rose-300/15 bg-rose-400/6"}`}>
      <p className="text-[11px] font-semibold uppercase text-[#71767b]">{label}</p>
      <p className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-6 text-[#e7e9ea] [overflow-wrap:anywhere]">{value}</p>
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
  deletingID,
  issueOptions,
  suggestionLoading,
  onDelete,
  onSuggestProfile,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  items: OAFBotGenerationFeedback[];
  loading: boolean;
  deletingID: number | null;
  issueOptions: ChipOption[];
  suggestionLoading: boolean;
  onDelete: (feedbackID: number) => void;
  onSuggestProfile: () => void;
}) {
  const timeZone = usePreferredTimeZone();
  const negativeCount = items.filter((item) => item.rating === "negative").length;
  const negativeItems = items.filter((item) => item.rating === "negative");
  const topIssue = topFeedbackCount(negativeItems.flatMap((item) => item.issue_tags.length ? item.issue_tags : ["other"]));
  const topScene = topFeedbackCount(negativeItems.map((item) => item.scene || "unknown"));
  const latestAt = items[0]?.created_at ? formatFeedbackDate(items[0].created_at, timeZone) : "";
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-bold text-[#e7e9ea]">{t("oafBots.feedback.historyTitle")}</p>
          <p className="mt-1 text-xs text-[#71767b]">{t("oafBots.feedback.historyDescription")}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <span className="rounded-full border border-[#2f3336] bg-[#0f1419] px-2.5 py-1 text-xs text-[#71767b]">
            {t("oafBots.feedback.historyCount", { count: items.length })}
          </span>
          <Button type="button" size="sm" variant="outline" onClick={onSuggestProfile} disabled={suggestionLoading || negativeCount === 0}>
            {suggestionLoading ? <RefreshCw className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {suggestionLoading ? t("oafBots.feedbackSuggestion.loading") : t("oafBots.feedbackSuggestion.action")}
          </Button>
        </div>
      </div>
      <p className="mt-3 rounded-xl border border-[#2f3336] bg-[#0f1419] p-3 text-xs leading-5 text-[#71767b]">
        {negativeCount > 0 ? t("oafBots.feedbackSuggestion.hint", { count: negativeCount }) : t("oafBots.feedbackSuggestion.emptyHint")}
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <FeedbackLearningMetric label={t("oafBots.feedback.learning.negative")} value={String(negativeCount)} />
        <FeedbackLearningMetric label={t("oafBots.feedback.learning.topIssue")} value={topIssue ? getChipLabel(topIssue.key, issueOptions) : t("oafBots.feedback.learning.none")} />
        <FeedbackLearningMetric label={t("oafBots.feedback.learning.topScene")} value={topScene ? t(`oafBots.samples.${topScene.key}`) : t("oafBots.feedback.learning.none")} />
        <FeedbackLearningMetric label={t("oafBots.feedback.learning.latest")} value={latestAt || t("oafBots.feedback.learning.none")} />
      </div>
      {loading ? (
        <p className="mt-4 text-sm text-[#71767b]">{t("oafBots.feedback.loading")}</p>
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm leading-6 text-[#71767b]">{t("oafBots.feedback.empty")}</p>
      ) : (
        <div className="mt-4 space-y-3">
          {items.slice(0, 8).map((item) => (
            <div key={item.id} className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-wrap items-center gap-2 text-xs text-[#71767b]">
                  <span className={`rounded-full border px-2 py-0.5 ${item.rating === "positive" ? "border-emerald-300/20 text-emerald-100" : "border-amber-300/20 text-amber-100"}`}>
                    {t(`oafBots.feedback.rating.${item.rating}`)}
                  </span>
                  <span>{t(`oafBots.samples.${item.scene}`)}</span>
                  <span>{formatFeedbackDate(item.created_at, timeZone)}</span>
                </div>
                <Button type="button" size="sm" variant="outline" className="h-8 shrink-0 text-xs" onClick={() => onDelete(item.id)} disabled={deletingID === item.id}>
                  {deletingID === item.id ? <RefreshCw className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                  {t("oafBots.feedback.ignore")}
                </Button>
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

function FeedbackLearningMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
      <p className="truncate text-[11px] font-semibold uppercase text-[#71767b]">{label}</p>
      <p className="mt-1 truncate text-sm font-bold text-[#e7e9ea]">{value}</p>
    </div>
  );
}

export function ProfileDiffPreview({
  t,
  visible,
  title,
  description,
  meta,
  diffs,
  noDiff,
  dismissLabel,
  applyLabel,
  onApply,
  onDismiss,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  visible: boolean;
  title: string;
  description: string;
  meta?: string;
  diffs: ProfileDiffItem[];
  noDiff: string;
  dismissLabel: string;
  applyLabel: string;
  onApply: () => void;
  onDismiss: () => void;
}) {
  if (!visible) return null;
  return (
    <div className="rounded-2xl border border-[#1d9bf0]/35 bg-[#1d9bf0]/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-bold text-[#e7e9ea]">{title}</p>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{description}</p>
        </div>
        {meta ? (
          <span className="shrink-0 rounded-full border border-[#2f3336] bg-black/50 px-2.5 py-1 text-xs text-[#8ecdf8]">
            {meta}
          </span>
        ) : null}
      </div>

      {diffs.length > 0 ? (
        <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
          {diffs.map((diff) => (
            <div key={String(diff.key)} className="rounded-xl border border-[#2f3336] bg-black p-3">
              <p className="text-xs font-semibold text-[#e7e9ea]">{fieldLabel(diff.key, t)}</p>
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
                <DiffValueBox label={t("oafBots.diff.before")} value={formatProfileValue(diff.before, t)} tone="before" />
                <div className="hidden items-center justify-center text-[#71767b] md:flex">
                  <ArrowRight className="size-4" />
                </div>
                <DiffValueBox label={t("oafBots.diff.after")} value={formatProfileValue(diff.after, t)} tone="after" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-[#2f3336] bg-black p-3 text-sm leading-6 text-[#71767b]">{noDiff}</p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onDismiss}>
          {dismissLabel}
        </Button>
        <Button type="button" size="sm" onClick={onApply} disabled={diffs.length === 0}>
          <CheckCircle2 className="size-4" />
          {applyLabel}
        </Button>
      </div>
    </div>
  );
}

function DiffValueBox({ label, value, tone }: { label: string; value: string; tone: "before" | "after" }) {
  return (
    <div className={`min-w-0 rounded-xl border p-3 ${tone === "after" ? "border-emerald-300/20 bg-emerald-400/8" : "border-rose-300/15 bg-rose-400/6"}`}>
      <p className="text-[11px] font-semibold uppercase text-[#71767b]">{label}</p>
      <p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-5 text-[#e7e9ea] [overflow-wrap:anywhere]">{value}</p>
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

export function normalizeSampleContent(sample: OAFBotTestGenerateResult | null, scene: SampleScene): string {
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
    { label: t("oafBots.fields.websiteUrl"), value: form.website_url },
    { label: t("oafBots.fields.telegramUrl"), value: form.telegram_url },
    { label: t("oafBots.fields.discordUrl"), value: form.discord_url },
    { label: t("oafBots.fields.docsUrl"), value: form.docs_url },
    { label: t("oafBots.fields.ctaPolicy"), value: form.cta_policy },
    { label: t("oafBots.fields.voiceTone"), value: form.voice_tone },
    { label: t("oafBots.fields.topics"), value: form.topics.join(" / ") },
    { label: t("oafBots.fields.contentPillars"), value: form.content_pillars.join(" / ") },
    { label: t("oafBots.fields.preferredCTA"), value: form.preferred_cta },
    { label: t("oafBots.fields.growthGoal"), value: form.growth_goal },
    { label: t("oafBots.fields.safetyMode"), value: safetyOptions.find((option) => option.value === form.safety_mode)?.label || form.safety_mode },
  ].filter((row) => row.value.trim());
}
