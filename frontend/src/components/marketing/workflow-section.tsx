"use client";

import { useT } from "@/i18n/use-t";
import { workflowSteps } from "@/mocks/landing.mock";

import { SectionShell } from "./section-shell";

export function WorkflowSection() {
  const { t } = useT();
  return (
    <SectionShell
      id="workflow"
      badge={t("marketing.workflow.badge")}
      title={t("marketing.workflow.title")}
      description={t("marketing.workflow.description")}
    >
      <div className="grid gap-4 md:grid-cols-4">
        {workflowSteps.map((step, idx) => (
          <article key={step.titleKey} className="surface-card relative rounded-2xl p-5">
            <span className="mb-3 inline-flex size-8 items-center justify-center rounded-full border border-white/15 text-sm text-white/80">
              {idx + 1}
            </span>
            <h3 className="text-base font-semibold text-white">{t(step.titleKey)}</h3>
            <p className="mt-2 text-sm text-white/65">{t(step.descriptionKey)}</p>
          </article>
        ))}
      </div>
    </SectionShell>
  );
}
