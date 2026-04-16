"use client";

import { useT } from "@/i18n/use-t";
import { faqs } from "@/mocks/landing.mock";

import { SectionShell } from "./section-shell";

export function FAQSection() {
  const { t } = useT();
  return (
    <SectionShell
      id="faq"
      badge={t("marketing.faq.badge")}
      title={t("marketing.faq.title")}
      description={t("marketing.faq.description")}
    >
      <div className="space-y-3">
        {faqs.map((item) => (
          <article key={item.qKey} className="surface-card rounded-2xl p-5">
            <h3 className="text-base font-semibold text-white">{t(item.qKey)}</h3>
            <p className="mt-2 text-sm text-white/65">{t(item.aKey)}</p>
          </article>
        ))}
      </div>
    </SectionShell>
  );
}
