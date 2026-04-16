"use client";

import { useT } from "@/i18n/use-t";
import { features } from "@/mocks/landing.mock";

import { SectionShell } from "./section-shell";

export function FeatureCardsSection() {
  const { t } = useT();
  return (
    <SectionShell
      id="capabilities"
      badge={t("marketing.capabilities.badge")}
      title={t("marketing.capabilities.title")}
      description={t("marketing.capabilities.description")}
    >
      <div className="grid gap-4 md:grid-cols-3">
        {features.map((feature) => (
          <article key={feature.titleKey} className="surface-card rounded-2xl p-5">
            <div className="mb-4 flex items-center justify-between">
              <feature.icon className="size-5 text-blue-300" />
              <span className="rounded-full border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/70">
                {t(feature.statusKey)}
              </span>
            </div>
            <h3 className="text-lg font-semibold text-white">{t(feature.titleKey)}</h3>
            <p className="mt-2 text-sm text-white/65">{t(feature.descriptionKey)}</p>
            <ul className="mt-4 space-y-2 text-sm text-white/70">
              {feature.bulletKeys.map((bulletKey) => (
                <li key={bulletKey} className="flex items-center gap-2">
                  <span className="inline-block size-1.5 rounded-full bg-blue-300/80" />
                  {t(bulletKey)}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </SectionShell>
  );
}
