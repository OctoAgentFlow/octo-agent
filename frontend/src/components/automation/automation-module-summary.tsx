import type { AutomationModule } from "@/types/automation";

import { Badge } from "@/components/ui/badge";
import { useT } from "@/i18n/use-t";

function stateVariant(state: AutomationModule["state"]) {
  if (state === "Running") return "success";
  if (state === "Needs Review") return "warning";
  if (state === "Queued") return "info";
  return "default";
}

export function AutomationModuleSummary({ module }: { module: AutomationModule }) {
  const { t } = useT();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">{t(module.nameKey)}</p>
          <p className="text-xs text-white/60">{t(module.descriptionKey)}</p>
        </div>
        <Badge variant={stateVariant(module.state)}>{t(`automation.state.${module.state}`)}</Badge>
      </div>

      <div className="grid gap-2 text-sm text-white/70 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-white/55">{t("automation.summary.frequency")}</p>
          <p className="mt-1">
            {t("automation.summary.frequencyValue", {
              minutes: module.config.frequency.intervalMinutes,
              daily: module.config.frequency.dailyLimit,
            })}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-white/55">{t("automation.summary.style")}</p>
          <p className="mt-1">{t(`automation.tone.${module.config.tone}`)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs text-white/55">{t("automation.summary.safety")}</p>
          <p className="mt-1">
            {t(module.config.safety.requireApproval ? "automation.summary.approval" : "automation.summary.auto")} •{" "}
            {t("automation.summary.maxPerHour", { count: module.config.safety.maxPerHour })}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-white/55">
        <span>{t("automation.summary.lastRun", { time: t(module.lastRunKey, module.lastRunParams) })}</span>
        <span>{t("automation.summary.nextRun", { time: t(module.nextRunKey, module.nextRunParams) })}</span>
      </div>

      {module.type === "reply" && module.replyUsage ? (
        <div className="grid gap-2 text-sm text-white/70 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-white/55">{t("automation.summary.reply.today")}</p>
            <p className="mt-1">{module.replyUsage.todayCount}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-white/55">{t("automation.summary.reply.remaining")}</p>
            <p className="mt-1">{module.replyUsage.remainingToday} / {module.replyUsage.dailyLimit}</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-white/55">{t("automation.summary.reply.lastExecution")}</p>
            <p className="mt-1">
              {module.replyLastRelativeKey
                ? t(module.replyLastRelativeKey, module.replyLastRelativeParams)
                : t("automation.time.paused")}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

