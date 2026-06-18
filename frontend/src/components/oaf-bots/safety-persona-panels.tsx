"use client";

import { AlertTriangle, CheckCircle2, Globe2, Lock } from "lucide-react";

import { SelectField, TagPicker, TextArea, getChipLabel, getSelectLabel, type ChipOption, type SelectOption } from "@/components/oaf-bots/form-fields";

type TranslationFn = (key: string, params?: Record<string, string | number>) => string;

export function LanguageConfigPanel({
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
  t: TranslationFn;
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
    <div className="mb-5 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[#2f3336] bg-[#1d9bf0]/10 text-[#1d9bf0]">
            <Globe2 className="size-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-[#e7e9ea]">{t("oafBots.languageConfig.title")}</h3>
              {isDefault ? (
                <span className="rounded-full border border-[#2f3336] bg-black px-2 py-0.5 text-[11px] text-[#71767b]">
                  {t("oafBots.languageConfig.defaultBadge")}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[#71767b]">{t("oafBots.languageConfig.description")}</p>
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
        <div className="rounded-xl border border-[#2f3336] bg-black p-3">
          <p className="text-xs text-[#71767b]">{t("oafBots.languageConfig.primaryHint")}</p>
          <p className="mt-1 text-sm font-semibold text-[#e7e9ea]">{getSelectLabel(currentPrimaryLanguage, languageOptions)}</p>
        </div>
        <div className="rounded-xl border border-[#2f3336] bg-black p-3">
          <p className="text-xs text-[#71767b]">{t("oafBots.languageConfig.strategyHint")}</p>
          <p className="mt-1 text-sm font-semibold text-[#e7e9ea]">{getSelectLabel(currentLanguageStrategy, languageStrategyOptions)}</p>
          <p className="mt-1 text-xs leading-relaxed text-[#71767b]">{t(`oafBots.languageStrategy.helper.${currentLanguageStrategy}`)}</p>
        </div>
      </div>
    </div>
  );
}

export function SafetyRulesPanel({
  t,
  safetyMode,
  forbiddenTopics,
  avoidClaims,
  complianceNotes,
  safetyOptions,
  forbiddenTopicOptions,
  avoidClaimOptions,
  onSafetyModeChange,
  onForbiddenTopicsChange,
  onAvoidClaimsChange,
  onComplianceNotesChange,
}: {
  t: TranslationFn;
  safetyMode: string;
  forbiddenTopics: string[];
  avoidClaims: string[];
  complianceNotes: string;
  safetyOptions: SelectOption[];
  forbiddenTopicOptions: ChipOption[];
  avoidClaimOptions: ChipOption[];
  onSafetyModeChange: (value: string) => void;
  onForbiddenTopicsChange: (values: string[]) => void;
  onAvoidClaimsChange: (values: string[]) => void;
  onComplianceNotesChange: (value: string) => void;
}) {
  const selectedSafety = safetyOptions.find((option) => option.value === safetyMode)?.label || safetyMode || t("oafBots.safety.balanced");
  const complianceRuleCount = complianceNotes
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean).length;
  const configuredCount = Number(Boolean(safetyMode)) + Number(forbiddenTopics.length > 0) + Number(avoidClaims.length > 0) + Number(complianceRuleCount > 0);

  return (
    <div className="mt-4 min-w-0 space-y-4 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
      <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("oafBots.safetyRules.title")}</p>
          <p className="mt-1 text-sm leading-6 text-[#71767b]">{t("oafBots.safetyRules.description")}</p>
        </div>
        <div className="grid min-w-0 grid-cols-3 gap-2 text-center xl:w-80 xl:shrink-0">
          <SafetyRuleMetric label={t("oafBots.safetyRules.metricMode")} value={selectedSafety} />
          <SafetyRuleMetric label={t("oafBots.safetyRules.metricHardBlocks")} value={forbiddenTopics.length + avoidClaims.length} />
          <SafetyRuleMetric label={t("oafBots.safetyRules.metricConfigured")} value={`${configuredCount}/4`} />
        </div>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <SelectField
            label={t("oafBots.fields.safetyMode")}
            value={safetyMode}
            onChange={onSafetyModeChange}
            options={safetyOptions}
            helper={t("oafBots.helpers.safetyMode")}
          />
          <div className="grid gap-2">
            {["conservative", "balanced", "autopilot"].map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onSafetyModeChange(mode)}
                className={`rounded-xl border p-3 text-left transition ${
                  safetyMode === mode ? "border-[#1d9bf0]/50 bg-[#1d9bf0]/10" : "border-[#2f3336] bg-black hover:bg-[#16181c]"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-[#e7e9ea]">{t(`oafBots.safetyRules.mode.${mode}.title`)}</span>
                  {safetyMode === mode ? <CheckCircle2 className="size-4 text-[#1d9bf0]" /> : null}
                </div>
                <p className="mt-1 text-xs leading-5 text-[#71767b]">{t(`oafBots.safetyRules.mode.${mode}.description`)}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <TagPicker
            label={t("oafBots.fields.forbiddenTopics")}
            values={forbiddenTopics}
            options={forbiddenTopicOptions}
            onChange={onForbiddenTopicsChange}
            helper={t("oafBots.helpers.forbiddenTopics")}
            placeholder={t("oafBots.placeholders.tagInput")}
          />
          <TagPicker
            label={t("oafBots.fields.avoidClaims")}
            values={avoidClaims}
            options={avoidClaimOptions}
            onChange={onAvoidClaimsChange}
            helper={t("oafBots.helpers.avoidClaims")}
            placeholder={t("oafBots.placeholders.tagInput")}
          />
        </div>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <TextArea
          label={t("oafBots.fields.complianceNotes")}
          value={complianceNotes}
          onChange={onComplianceNotesChange}
          placeholder={t("oafBots.placeholders.complianceNotesStructured")}
          helper={t("oafBots.helpers.complianceNotesStructured")}
        />
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <div className="mb-3 flex items-center gap-2">
            <Lock className="size-4 text-amber-300" />
            <p className="text-sm font-semibold text-[#e7e9ea]">{t("oafBots.safetyRules.previewTitle")}</p>
          </div>
          <div className="space-y-3">
            <SafetyRulePreviewRow
              ready={forbiddenTopics.length > 0}
              title={t("oafBots.safetyRules.previewForbiddenTitle")}
              description={forbiddenTopics.length > 0 ? forbiddenTopics.map((item) => getChipLabel(item, forbiddenTopicOptions)).join(" / ") : t("oafBots.safetyRules.previewEmpty")}
            />
            <SafetyRulePreviewRow
              ready={avoidClaims.length > 0}
              title={t("oafBots.safetyRules.previewClaimsTitle")}
              description={avoidClaims.length > 0 ? avoidClaims.map((item) => getChipLabel(item, avoidClaimOptions)).join(" / ") : t("oafBots.safetyRules.previewEmpty")}
            />
            <SafetyRulePreviewRow
              ready={complianceRuleCount > 0}
              title={t("oafBots.safetyRules.previewComplianceTitle")}
              description={t("oafBots.safetyRules.previewComplianceValue", { count: complianceRuleCount })}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SafetyRuleMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#2f3336] bg-black p-3">
      <p className="truncate text-[11px] text-[#71767b]">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[#e7e9ea]">{value}</p>
    </div>
  );
}

function SafetyRulePreviewRow({ ready, title, description }: { ready: boolean; title: string; description: string }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
      <div className="flex items-center gap-2">
        {ready ? <CheckCircle2 className="size-4 shrink-0 text-emerald-300" /> : <AlertTriangle className="size-4 shrink-0 text-amber-300" />}
        <p className="text-sm font-semibold text-[#e7e9ea]">{title}</p>
      </div>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#71767b]">{description}</p>
    </div>
  );
}
