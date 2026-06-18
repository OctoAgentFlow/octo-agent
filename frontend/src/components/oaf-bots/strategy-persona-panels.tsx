"use client";

import { CheckCircle2, Lock, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getChipLabel, type ChipOption } from "@/components/oaf-bots/form-fields";

type AccountArchetypeKey = "brand" | "founder" | "kol" | "community" | "agency";
type TopicGuardrailRecommendationPreset = {
  topics: string[];
  contentPillars: string[];
  forbiddenTopics: string[];
  avoidClaims: string[];
  complianceNotes: string;
  safetyMode: string;
};

const accountArchetypeKeys: AccountArchetypeKey[] = ["brand", "founder", "kol", "community", "agency"];

export function AccountArchetypePicker({
  t,
  selected,
  onSelect,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  selected: AccountArchetypeKey | null;
  onSelect: (type: AccountArchetypeKey) => void;
}) {
  return (
    <div className="mb-4 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
      <div className="mb-3">
        <p className="text-sm font-semibold text-[#e7e9ea]">{t("oafBots.accountType.title")}</p>
        <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("oafBots.accountType.description")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
        {accountArchetypeKeys.map((type) => {
          const active = selected === type;
          return (
            <button
              key={type}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(type)}
              className={`min-w-0 rounded-xl border p-3 text-left transition ${
                active ? "border-[#1d9bf0]/60 bg-[#1d9bf0]/12" : "border-[#2f3336] bg-black hover:bg-[#16181c]"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold leading-5 text-[#e7e9ea]">{t(`oafBots.accountType.${type}.title`)}</p>
                {active ? <CheckCircle2 className="size-4 shrink-0 text-[#1d9bf0]" /> : null}
              </div>
              <p className="mt-2 text-xs leading-5 text-[#71767b]">{t(`oafBots.accountType.${type}.description`)}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function StyleRecommendationPanel({
  t,
  type,
  preset,
  personalityOptions,
  onApply,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  type: AccountArchetypeKey;
  preset: { personalityTags: string[]; voiceTone: string; mbti: string };
  personalityOptions: ChipOption[];
  onApply: () => void;
}) {
  return (
    <div className="mb-4 rounded-2xl border border-[#1d9bf0]/25 bg-[#1d9bf0]/8 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-[#1d9bf0]" />
            <p className="text-sm font-semibold text-[#e7e9ea]">
              {t("oafBots.styleRecommendation.title", { type: t(`oafBots.accountType.${type}.title`) })}
            </p>
          </div>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("oafBots.styleRecommendation.description")}</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onApply} className="shrink-0">
          <Sparkles className="size-4" />
          {t("oafBots.styleRecommendation.apply")}
        </Button>
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_1.4fr_0.45fr]">
        <div className="rounded-xl border border-[#2f3336] bg-black p-3">
          <p className="text-[11px] font-semibold uppercase text-[#71767b]">{t("oafBots.fields.personalityTags")}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {preset.personalityTags.map((tag) => (
              <span key={tag} className="rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-2 py-0.5 text-[11px] text-[#8ecdf8]">
                {getChipLabel(tag, personalityOptions)}
              </span>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-[#2f3336] bg-black p-3">
          <p className="text-[11px] font-semibold uppercase text-[#71767b]">{t("oafBots.fields.voiceTone")}</p>
          <p className="mt-2 text-xs leading-5 text-[#e7e9ea]/82">{preset.voiceTone}</p>
        </div>
        <div className="rounded-xl border border-[#2f3336] bg-black p-3">
          <p className="text-[11px] font-semibold uppercase text-[#71767b]">{t("oafBots.fields.mbti")}</p>
          <p className="mt-2 text-sm font-semibold text-[#e7e9ea]">{preset.mbti}</p>
          <p className="mt-1 text-[11px] leading-4 text-[#71767b]">{t("oafBots.styleRecommendation.mbtiHint")}</p>
        </div>
      </div>
    </div>
  );
}

export function TopicGuardrailRecommendationPanel({
  t,
  type,
  preset,
  topicOptions,
  contentPillarOptions,
  forbiddenTopicOptions,
  avoidClaimOptions,
  onApply,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  type: AccountArchetypeKey;
  preset: TopicGuardrailRecommendationPreset;
  topicOptions: ChipOption[];
  contentPillarOptions: ChipOption[];
  forbiddenTopicOptions: ChipOption[];
  avoidClaimOptions: ChipOption[];
  onApply: () => void;
}) {
  const complianceRuleCount = preset.complianceNotes.split(/\n+/).filter((line) => line.trim()).length;
  return (
    <div className="mb-4 rounded-2xl border border-[#1d9bf0]/25 bg-[#1d9bf0]/8 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-[#1d9bf0]" />
            <p className="text-sm font-semibold text-[#e7e9ea]">
              {t("oafBots.topicGuardrailRecommendation.title", { type: t(`oafBots.accountType.${type}.title`) })}
            </p>
          </div>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("oafBots.topicGuardrailRecommendation.description")}</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={onApply} className="shrink-0">
          <Sparkles className="size-4" />
          {t("oafBots.topicGuardrailRecommendation.apply")}
        </Button>
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-3">
        <RecommendationPreviewCard
          title={t("oafBots.topicGuardrailRecommendation.prioritize")}
          values={preset.topics.map((item) => getChipLabel(item, topicOptions))}
        />
        <RecommendationPreviewCard
          title={t("oafBots.topicGuardrailRecommendation.pillars")}
          values={preset.contentPillars.map((item) => getChipLabel(item, contentPillarOptions))}
        />
        <RecommendationPreviewCard
          title={t("oafBots.topicGuardrailRecommendation.boundaries")}
          values={[
            ...preset.forbiddenTopics.map((item) => getChipLabel(item, forbiddenTopicOptions)),
            ...preset.avoidClaims.map((item) => getChipLabel(item, avoidClaimOptions)),
            t("oafBots.topicGuardrailRecommendation.ruleCount", { count: complianceRuleCount }),
          ]}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#8b98a5]">
        <Lock className="size-3.5 text-amber-300" />
        <span>{t("oafBots.topicGuardrailRecommendation.safetyMode", { mode: t(`oafBots.safetyRules.mode.${preset.safetyMode}.title`) })}</span>
      </div>
    </div>
  );
}

export function RecommendationPreviewCard({ title, values }: { title: string; values: string[] }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#2f3336] bg-black p-3">
      <p className="text-[11px] font-semibold uppercase text-[#71767b]">{title}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {values.map((value) => (
          <span key={value} className="max-w-full rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-2 py-0.5 text-[11px] text-[#8ecdf8] [overflow-wrap:anywhere]">
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

export function QuotaCard({ label, used, limit }: { label: string; used: number; limit: number }) {
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
      <p className="text-xs text-[#71767b]">{label}</p>
      <p className="mt-2 text-lg font-bold text-[#e7e9ea]">{used}<span className="text-sm font-normal text-[#71767b]"> / {limit}</span></p>
    </div>
  );
}
