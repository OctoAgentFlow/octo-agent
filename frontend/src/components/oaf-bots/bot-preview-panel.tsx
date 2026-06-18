"use client";

import { Bot, RefreshCw, Sparkles } from "lucide-react";

import { SectionCard } from "@/components/dashboard/section-card";
import { getSelectLabel, type SelectOption } from "@/components/oaf-bots/form-fields";
import { Button } from "@/components/ui/button";
import type { AccountListItem } from "@/services/account.service";
import type { OAFBotPayload } from "@/types/oaf-bot";

type TranslationFn = (key: string, params?: Record<string, string | number>) => string;

export function BotPreview({
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
  languageOptions,
  languageStrategyOptions,
  defaultPrimaryLanguage,
  isDefaultLanguageConfig,
}: {
  t: TranslationFn;
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
  return (
    <SectionCard title={t("oafBots.preview.title")} description={t("oafBots.preview.description")} className="bg-black p-4 md:p-5">
      <div className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-4">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[#2f3336] bg-black text-[#1d9bf0]">
            <Bot className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-[#e7e9ea]">{form.name || t("oafBots.preview.unnamed")}</p>
            <p className="text-xs text-[#71767b]">{account ? `@${account.username}` : t("oafBots.preview.noAccount")}</p>
          </div>
        </div>

        <div className="mt-4">
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

        <div className={`mt-4 rounded-xl border p-3 ${modeClass}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs opacity-75">{t(`oafBots.preview.mode.${modeTone}.title`)}</p>
              <p className="mt-1 text-sm leading-relaxed text-white/78">{t(`oafBots.preview.mode.${modeTone}.description`)}</p>
            </div>
            <span className="shrink-0 rounded-full border border-white/10 bg-black/15 px-2.5 py-1 text-xs text-white/70">
              {readyCompletion ? t("oafBots.preview.readyBadge") : t("oafBots.preview.setupBadge")}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          {languageSummaryRows.map((row) => (
            <PreviewRow key={row.label} label={row.label} value={row.value} />
          ))}
        </div>

        <div className="mt-4 grid gap-3">
          <ChecklistBlock title={t("oafBots.preview.missing")} items={checklist.missing} empty={t("oafBots.preview.noMissing")} tone="warning" maxItems={5} compact />
          {showDetails ? (
            <ChecklistBlock title={t("oafBots.preview.configured")} items={checklist.configured} empty={t("oafBots.preview.noneConfigured")} tone="success" maxItems={4} compact />
          ) : null}
          <div className="rounded-xl border border-blue-300/15 bg-blue-400/10 p-3">
            <p className="text-xs text-[#8ecdf8]">{t("oafBots.preview.nextSuggestion")}</p>
            <p className="mt-1 text-sm leading-relaxed text-[#e7e9ea]/78">{checklist.nextSuggestion}</p>
          </div>
          <QualityDiagnosticsBlock title={t("oafBots.quality.title")} items={qualityDiagnostics.slice(0, 2)} empty={t("oafBots.quality.empty")} />
          <Button type="button" onClick={onTest} disabled={!canTest || generating} className="w-full disabled:opacity-50">
            {generating ? <RefreshCw className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {testButtonLabel}
          </Button>
          <p className="text-xs leading-relaxed text-[#71767b]">
            {!canTest ? t("oafBots.test.disabledHint") : selectedID && !formChanged ? t("oafBots.preview.testReadyHint") : t("oafBots.preview.testNeedsSaveHint")}
          </p>
        </div>
      </div>
    </SectionCard>
  );
}

function ChecklistBlock({
  title,
  items,
  empty,
  tone,
  maxItems = 5,
  compact = false,
}: {
  title: string;
  items: string[];
  empty: string;
  tone: "success" | "warning";
  maxItems?: number;
  compact?: boolean;
}) {
  const toneClass = tone === "success" ? "border-emerald-300/15 bg-emerald-400/10 text-emerald-100" : "border-amber-300/15 bg-amber-400/10 text-amber-100";
  const hiddenCount = Math.max(items.length - maxItems, 0);
  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <p className="text-xs opacity-75">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-white/70">{empty}</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {items.slice(0, maxItems).map((item) => (
            <span key={item} className={`rounded-full border border-white/10 bg-black/15 text-xs text-white/78 ${compact ? "px-2 py-0.5" : "px-2.5 py-1"}`}>
              {item}
            </span>
          ))}
          {hiddenCount > 0 ? (
            <span className={`rounded-full border border-white/10 bg-black/15 text-xs text-white/60 ${compact ? "px-2 py-0.5" : "px-2.5 py-1"}`}>
              +{hiddenCount}
            </span>
          ) : null}
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
