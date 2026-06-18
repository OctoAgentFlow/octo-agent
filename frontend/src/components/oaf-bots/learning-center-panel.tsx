"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";

import { getChipLabel, type ChipOption } from "@/components/oaf-bots/form-fields";
import { useT } from "@/i18n/use-t";
import type { ReviewQueueFeedbackIssueVerdictStatApi } from "@/services/review-queue.service";
import type { OAFBotLearningRulePreference } from "@/types/oaf-bot";

type TranslationFn = (key: string, params?: Record<string, string | number>) => string;

export function LearningRulesCenter({
  rules,
  preferences,
  disabledLearningIssues,
  issueOptions,
  selectedBotName,
  onToggleLearningIssue,
}: {
  rules: ReviewQueueFeedbackIssueVerdictStatApi[];
  preferences: OAFBotLearningRulePreference[];
  disabledLearningIssues: string[];
  issueOptions: ChipOption[];
  selectedBotName: string;
  onToggleLearningIssue: (issue: string) => void;
}) {
  const { t } = useT();
  const preferenceByIssue = new Map(preferences.map((item) => [item.feedback_issue, item.status]));
  const enabledCount = rules.filter((rule) => !disabledLearningIssues.includes(rule.feedback_issue) && preferenceByIssue.get(rule.feedback_issue) !== "disabled").length;
  return (
    <div className="mb-4 rounded-2xl border border-[#1d9bf0]/25 bg-[#06111d] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-[#8ecdf8]" />
            <p className="text-sm font-semibold text-[#d7ebff]">{t("oafBots.learningCenter.title")}</p>
          </div>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">
            {selectedBotName ? t("oafBots.learningCenter.descriptionForBot", { name: selectedBotName }) : t("oafBots.learningCenter.description")}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <div className="rounded-xl border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-3 py-2">
            <p className="text-lg font-semibold text-[#7ee0b5]">{enabledCount}</p>
            <p className="text-[11px] text-[#8b98a5]">{t("oafBots.learningCenter.enabled")}</p>
          </div>
          <div className="rounded-xl border border-[#f59e0b]/25 bg-[#f59e0b]/10 px-3 py-2">
            <p className="text-lg font-semibold text-[#facc15]">{disabledLearningIssues.length}</p>
            <p className="text-[11px] text-[#8b98a5]">{t("oafBots.learningCenter.disabled")}</p>
          </div>
        </div>
      </div>
      {rules.length > 0 ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {rules.map((rule) => {
            const disabled = disabledLearningIssues.includes(rule.feedback_issue) || preferenceByIssue.get(rule.feedback_issue) === "disabled";
            const confidence = rule.total > 0 ? Math.round(rule.accuracy_rate * 100) : 0;
            return (
              <div key={rule.feedback_issue} className={`rounded-xl border p-3 ${disabled ? "border-[#2f3336] bg-black/30 opacity-70" : "border-[#1d9bf0]/20 bg-black/35"}`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#e7e9ea]">{learningIssueLabel(rule.feedback_issue, issueOptions, t)}</p>
                    <p className="mt-1 text-xs leading-5 text-[#8b98a5]">
                      {rule.total > 0
                        ? t("oafBots.learningCenter.ruleMeta", { confidence, count: rule.accurate })
                        : t("oafBots.learningCenter.preferenceOnly")}
                    </p>
                  </div>
                  <button type="button" onClick={() => onToggleLearningIssue(rule.feedback_issue)} className={`h-8 shrink-0 rounded-full border px-3 text-xs font-semibold transition ${disabled ? "border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#facc15]" : "border-[#00ba7c]/40 bg-[#00ba7c]/10 text-[#9ff2c9]"}`}>
                    {disabled ? t("oafBots.samples.learningRuleDisabled") : t("oafBots.samples.learningRuleEnabled")}
                  </button>
                </div>
                {rule.reasons?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {rule.reasons.slice(0, 3).map((reason) => (
                      <span key={reason.reason} className="rounded-full border border-[#2f3336] px-2 py-0.5 text-[11px] text-[#8b98a5]">
                        {handlingListReasonLabel(reason.reason, t)}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-[#2f3336] bg-black/25 px-3 py-4 text-xs leading-5 text-[#71767b]">
          {t("oafBots.learningCenter.empty")}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link href="/dashboard" className="inline-flex h-8 items-center justify-center rounded-full border border-[#2f3336] px-3 text-xs font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
          {t("oafBots.learningCenter.openDashboard")}
        </Link>
        <Link href="/handling-list?status=pending_review" className="inline-flex h-8 items-center justify-center rounded-full border border-[#1d9bf0]/35 bg-[#1d9bf0]/10 px-3 text-xs font-semibold text-[#8ecdf8] hover:bg-[#1d9bf0]/15">
          {t("oafBots.learningCenter.openQueue")}
        </Link>
      </div>
    </div>
  );
}

function learningIssueLabel(issue: string, issueOptions: ChipOption[], t: TranslationFn) {
  const mapped = getFeedbackIssueLabel(issue, issueOptions);
  if (mapped !== issue && mapped !== issue.replace(/_/g, " ")) return mapped;
  return t(`dashboard.feedbackLearning.issue.${issue}`);
}

function getFeedbackIssueLabel(value: string, options: ChipOption[]) {
  const direct = getChipLabel(value, options);
  if (direct !== value) return direct;
  const normalized = value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
  const normalizedLabel = getChipLabel(normalized, options);
  if (normalizedLabel !== normalized) return normalizedLabel;
  return value.replace(/_/g, " ");
}

function handlingListReasonLabel(reason: string, t: TranslationFn) {
  const key = reason.startsWith("executionQueue.") ? reason.replace("executionQueue.", "handlingList.") : reason;
  return key.startsWith("handlingList.") ? t(key) : reason;
}
