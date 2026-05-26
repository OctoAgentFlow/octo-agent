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
  const nextRun = t(module.nextRunKey, module.nextRunParams);
  const lastRun = t(module.lastRunKey, module.lastRunParams);

  return (
    <div className="min-w-0 flex-1 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-white">{t(module.nameKey)}</p>
          <p className="text-xs text-white/60">{t(module.descriptionKey)}</p>
        </div>
        <Badge variant={stateVariant(module.state)}>{t(`automation.state.${module.state}`)}</Badge>
      </div>

      <div className="grid gap-2 text-sm text-white/70 sm:grid-cols-3">
        <SummaryMetric
          label={t("automation.summary.status")}
          value={t(module.config.enabled ? "automation.summary.enabled" : "automation.summary.disabled")}
        />
        <SummaryMetric label={t("automation.summary.executionMode")} value={t(`automation.executionMode.${module.config.executionMode}`)} />
        <SummaryMetric label={t("automation.summary.nextRunShort")} value={nextRun} />
      </div>

      <p className="text-xs text-white/55">{t("automation.summary.lastRun", { time: lastRun })}</p>
    </div>
  );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-16 rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2">
      <p className="text-xs text-white/45">{label}</p>
      <p className="mt-1 truncate text-sm text-white/80" title={value}>{value}</p>
    </div>
  );
}
