"use client";

import { Pencil, Power } from "lucide-react";

import type { AutomationModule } from "@/types/automation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";

import { AutomationModuleSummary } from "./automation-module-summary";

type Props = {
  module: AutomationModule;
  onToggle: (type: AutomationModule["type"], enabled: boolean) => void;
  onEdit: (type: AutomationModule["type"]) => void;
};

export function AutomationModuleCard({ module, onToggle, onEdit }: Props) {
  const { t } = useT();
  return (
    <Card className="p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AutomationModuleSummary module={module} />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => onToggle(module.type, !module.config.enabled)}
          >
            <Power className="size-4" />
            {module.config.enabled ? t("automation.actions.disable") : t("automation.actions.enable")}
          </Button>
          <Button onClick={() => onEdit(module.type)}>
            <Pencil className="size-4" />
            {t("automation.actions.edit")}
          </Button>
        </div>
      </div>
    </Card>
  );
}

