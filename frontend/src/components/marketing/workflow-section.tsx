"use client";

import { ArrowRight } from "lucide-react";

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
      <div className="grid gap-4 md:grid-cols-3">
        {workflowSteps.map((step, idx) => (
          <article key={step.titleKey} className="surface-card relative min-h-[220px] overflow-hidden rounded-2xl p-5">
            <div className="pointer-events-none absolute -top-10 -right-10 size-24 rounded-full bg-blue-500/10 blur-2xl" />
            {idx < workflowSteps.length - 1 ? (
              <ArrowRight className="absolute top-8 right-5 hidden size-4 text-white/22 md:block" />
            ) : null}
            <div className="mb-4 flex items-center gap-3">
              <span className="inline-flex size-9 items-center justify-center rounded-full border border-blue-300/25 bg-blue-400/10 text-sm font-medium text-blue-100">
                0{idx + 1}
              </span>
              <span className="h-px flex-1 bg-gradient-to-r from-blue-300/30 to-transparent" />
            </div>
            <h3 className="text-base font-semibold text-white">{t(step.titleKey)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/65">{t(step.descriptionKey)}</p>
          </article>
        ))}
      </div>
    </SectionShell>
  );
}
