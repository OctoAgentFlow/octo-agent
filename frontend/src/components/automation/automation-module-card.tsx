"use client";

import Link from "next/link";
import { ArrowRight, Power } from "lucide-react";

import type { AutomationModule } from "@/types/automation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";

import { AutomationModuleSummary } from "./automation-module-summary";

type Props = {
  module: AutomationModule;
  onToggle: (type: AutomationModule["type"], enabled: boolean) => void;
};

const workspaceHref: Record<AutomationModule["type"], string> = {
  post: "/content-drafts",
  reply: "/handling-list",
  comment: "/exposure-radar",
  dm: "/handling-list",
};

export function AutomationModuleCard({ module, onToggle }: Props) {
  const { t } = useT();
  return (
    <Card className="p-5 md:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <AutomationModuleSummary module={module} />
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => onToggle(module.type, !module.config.enabled)}
          >
            <Power className="size-4" />
            {module.config.enabled ? t("automation.actions.disable") : t("automation.actions.enable")}
          </Button>
          <Link href={workspaceHref[module.type]} className="inline-flex">
            <Button type="button">
              {t("automation.actions.openWorkspace")}
              <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}
