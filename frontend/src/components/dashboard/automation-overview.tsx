"use client";

import { Bot, MessageCircleReply, Send } from "lucide-react";

import { useT } from "@/i18n/use-t";
import type { AutomationModule } from "@/types/automation";

import { SectionCard } from "./section-card";

type AutomationOverviewProps = {
  modules?: AutomationModule[];
  loading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
};

export function AutomationOverview({ modules = [], loading = false, errorMessage, onRetry }: AutomationOverviewProps) {
  const { t } = useT();
  const iconByType = {
    post: Bot,
    reply: MessageCircleReply,
    dm: Send,
  } as const;

  return (
    <SectionCard
      title={t("dashboard.automation.section.title")}
      description={t("dashboard.automation.section.description")}
    >
      {loading ? <p className="text-sm text-white/70">Loading automation status...</p> : null}
      {errorMessage ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-300/25 bg-rose-500/10 p-3">
          <p className="text-sm text-rose-100">{errorMessage}</p>
          <button className="text-xs text-white underline underline-offset-2" onClick={onRetry} type="button">
            Retry
          </button>
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-3">
        {modules.map((module) => {
          const ModuleIcon = iconByType[module.type];
          return (
            <article key={module.type} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ModuleIcon className="size-4 text-violet-200" />
                <p className="text-sm font-medium text-white">{t(module.nameKey)}</p>
              </div>
              <span className="rounded-full border border-white/15 px-2 py-1 text-[11px] text-white/70">
                {t(`automation.state.${module.state}`)}
              </span>
            </div>
            <div className="mt-4 space-y-1 text-sm text-white/70">
              <p>{t("dashboard.automation.labels.executedToday", { count: module.executedToday })}</p>
              <p>{t("dashboard.automation.labels.nextRun", { time: t(module.nextRunKey, module.nextRunParams) })}</p>
            </div>
          </article>
          );
        })}
      </div>
    </SectionCard>
  );
}
