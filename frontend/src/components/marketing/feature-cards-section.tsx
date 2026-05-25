"use client";

import { ArrowRight } from "lucide-react";

import { useT } from "@/i18n/use-t";
import { features } from "@/mocks/landing.mock";

import { SectionShell } from "./section-shell";

const flowTags = [
  "marketing.capabilities.flow.persona",
  "marketing.capabilities.flow.voice",
  "marketing.capabilities.flow.guardrails",
  "marketing.capabilities.flow.goal",
  "marketing.capabilities.flow.actions",
];

export function FeatureCardsSection() {
  const { t } = useT();
  return (
    <SectionShell
      id="capabilities"
      badge={t("marketing.capabilities.badge")}
      title={t("marketing.capabilities.title")}
      description={t("marketing.capabilities.description")}
    >
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] p-3 text-xs text-white/64">
        {flowTags.map((tagKey, index) => (
          <div key={tagKey} className="flex items-center gap-2">
            <span className="rounded-full border border-blue-200/10 bg-blue-400/[0.08] px-3 py-1.5 text-blue-100/85">
              {t(tagKey)}
            </span>
            {index < flowTags.length - 1 ? <ArrowRight className="size-3.5 text-white/28" /> : null}
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {features.map((feature) => (
          <article key={feature.titleKey} className="surface-card flex h-full min-h-[310px] flex-col rounded-2xl p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="grid size-10 place-items-center rounded-xl border border-violet-300/20 bg-violet-400/10 text-violet-100">
                <feature.icon className="size-5" />
              </span>
              <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/70">
                {t(feature.statusKey)}
              </span>
            </div>
            <h3 className="text-lg font-semibold text-white">{t(feature.titleKey)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/65">{t(feature.descriptionKey)}</p>
            <ul className="mt-auto space-y-2 pt-5 text-sm text-white/70">
              {feature.bulletKeys.map((bulletKey) => (
                <li key={bulletKey} className="flex items-start gap-2">
                  <span className="mt-2 inline-block size-1.5 shrink-0 rounded-full bg-blue-300/80" />
                  <span>{t(bulletKey)}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </SectionShell>
  );
}
