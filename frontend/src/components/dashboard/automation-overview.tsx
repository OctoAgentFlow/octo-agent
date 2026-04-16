"use client";

import { automationModules } from "@/mocks/dashboard.mock";
import { useT } from "@/i18n/use-t";

import { SectionCard } from "./section-card";

export function AutomationOverview() {
  const { t } = useT();
  return (
    <SectionCard
      title={t("dashboard.automation.section.title")}
      description={t("dashboard.automation.section.description")}
    >
      <div className="grid gap-3 md:grid-cols-3">
        {automationModules.map((module) => (
          <article key={module.nameKey} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <module.icon className="size-4 text-violet-200" />
                <p className="text-sm font-medium text-white">{t(module.nameKey)}</p>
              </div>
              <span className="rounded-full border border-white/15 px-2 py-1 text-[11px] text-white/70">
                {t(module.statusKey)}
              </span>
            </div>
            <div className="mt-4 space-y-1 text-sm text-white/70">
              <p>{t("dashboard.automation.labels.executedToday", { count: module.todayExecuted })}</p>
              <p>{t("dashboard.automation.labels.nextRun", { minutes: module.nextRunMinutes })}</p>
            </div>
          </article>
        ))}
      </div>
    </SectionCard>
  );
}
