"use client";

import { FileText, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";

type AutomationPageHeaderProps = {
  overallState: "Running" | "Paused" | "Needs Attention";
};

export function AutomationPageHeader({ overallState }: AutomationPageHeaderProps) {
  const { t } = useT();
  const badgeVariant =
    overallState === "Running" ? "success" : overallState === "Paused" ? "default" : "warning";

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 className="text-title">{t("automation.page.title")}</h2>
        <p className="text-subtitle mt-2">
          {t("automation.page.subtitle")}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={badgeVariant}>{t(`automation.overallState.${overallState}`)}</Badge>
        <Button variant="outline">
          <ShieldCheck className="size-4" />
          {t("automation.page.actions.safetyPolicy")}
        </Button>
        <Button variant="outline">
          <FileText className="size-4" />
          {t("automation.page.actions.viewLogs")}
        </Button>
      </div>
    </div>
  );
}

