import { Activity, AlertTriangle, RotateCcw } from "lucide-react";

import type { AutomationRuntimeStatus } from "@/types/automation";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";

export function AutomationStatusPanel({ status }: { status: AutomationRuntimeStatus }) {
  const { t } = useT();
  return (
    <Card className="border border-violet-400/20 bg-violet-500/8">
      <CardHeader
        title={t("automation.runtime.title")}
        description={t("automation.runtime.description")}
        right={
          <Badge variant={status.needsReview > 0 ? "warning" : "success"}>
            {status.needsReview > 0 ? t("automation.runtime.badge.needsAttention") : t("automation.runtime.badge.healthy")}
          </Badge>
        }
      />
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-white/55">{t("automation.runtime.queueDepth")}</p>
          <p className="mt-2 flex items-center gap-2 text-lg font-semibold text-white">
            <Activity className="size-4 text-blue-200" />
            {status.queueDepth}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-white/55">{t("automation.runtime.lastSuccess")}</p>
          <p className="mt-2 text-sm font-medium text-white">{t(status.lastSuccessKey, status.lastSuccessParams)}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-white/55">{t("automation.runtime.retries24h")}</p>
          <p className="mt-2 flex items-center gap-2 text-lg font-semibold text-white">
            <RotateCcw className="size-4 text-violet-200" />
            {status.retriesLast24h}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs text-white/55">{t("automation.runtime.needsReview")}</p>
          <p className="mt-2 flex items-center gap-2 text-lg font-semibold text-white">
            <AlertTriangle className="size-4 text-amber-200" />
            {status.needsReview}
          </p>
        </div>
      </div>
    </Card>
  );
}

