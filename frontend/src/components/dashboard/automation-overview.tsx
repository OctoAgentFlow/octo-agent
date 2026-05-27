"use client";

import { Bot, MessageCircleReply, MessageSquareText, Send } from "lucide-react";

import { useT } from "@/i18n/use-t";
import type { AutomationModule } from "@/types/automation";

import { SectionCard } from "./section-card";

type AutomationOverviewProps = {
  modules?: AutomationModule[];
  loading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
  monthlyUsage?: Partial<Record<AutomationModule["type"], { used: number; limit: number }>>;
};

export function AutomationOverview({ modules = [], loading = false, errorMessage, onRetry, monthlyUsage = {} }: AutomationOverviewProps) {
  const { t } = useT();
  const iconByType = {
    post: Bot,
    reply: MessageCircleReply,
    dm: Send,
    comment: MessageSquareText,
  } as const;

  return (
    <SectionCard
      title={t("dashboard.automation.section.title")}
      description={t("dashboard.automation.section.description")}
    >
      {loading ? <p className="text-sm text-[#71767b]">{t("dashboard.automation.loading")}</p> : null}
      {errorMessage ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-300/25 bg-rose-500/10 p-3">
          <p className="text-sm text-rose-100">{errorMessage}</p>
          <button className="text-xs text-white underline underline-offset-2" onClick={onRetry} type="button">
            {t("common.retry")}
          </button>
        </div>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {modules.map((module) => {
          const ModuleIcon = iconByType[module.type];
          const quota = monthlyUsage[module.type];
          return (
            <article key={module.type} className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4 transition-colors hover:bg-[#16181c]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-full bg-[#1d9bf0]/10 text-[#1d9bf0]">
                  <ModuleIcon className="size-4" />
                </span>
                <p className="text-sm font-semibold text-[#e7e9ea]">{t(module.nameKey)}</p>
              </div>
              <span className="rounded-full border border-[#2f3336] px-2 py-1 text-[11px] text-[#71767b]">
                {t(`automation.state.${module.state}`)}
              </span>
            </div>
            <div className="mt-4 space-y-1 text-sm text-[#71767b]">
              <p>
                {quota
                  ? t("dashboard.automation.labels.executedMonth", { used: quota.used, limit: quota.limit })
                  : t("dashboard.automation.labels.executedMonthFallback", { count: module.executedToday })}
              </p>
              <p>{t("dashboard.automation.labels.nextRun", { time: t(module.nextRunKey, module.nextRunParams) })}</p>
            </div>
          </article>
          );
        })}
      </div>
    </SectionCard>
  );
}
