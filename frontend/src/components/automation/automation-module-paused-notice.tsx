"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { AlertTriangle, ArrowRight, Loader2, Power } from "lucide-react";

import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";
import { automationService, type AutomationModuleApi } from "@/services/automation.service";

type AutomationModuleType = AutomationModuleApi["type"];

function workspaceHref(type: AutomationModuleType) {
  if (type === "post") return "/content-drafts?panel=planner";
  if (type === "comment") return "/exposure-radar";
  return "/handling-list";
}

export function AutomationModulePausedNotice({
  type,
  onEnabledChange,
}: {
  type: AutomationModuleType;
  onEnabledChange?: (enabled: boolean) => void;
}) {
  const { t } = useT();
  const { pushToast } = useToast();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [enabling, setEnabling] = useState(false);
  const moduleName = t(`automation.module.${type}.name`);

  const loadStatus = useCallback(async () => {
    try {
      const data = await automationService.list();
      const automationModule = data.modules.find((item) => item.type === type);
      const nextEnabled = automationModule?.config.enabled ?? true;
      setEnabled(nextEnabled);
      onEnabledChange?.(nextEnabled);
    } catch {
      setEnabled(true);
      onEnabledChange?.(true);
    }
  }, [onEnabledChange, type]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const enableModule = async () => {
    setEnabling(true);
    try {
      const updated = await automationService.toggle(type, true);
      setEnabled(updated.config.enabled);
      onEnabledChange?.(updated.config.enabled);
      pushToast(t("automation.pausedNotice.enabledToast", { module: moduleName }));
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || t("automation.pausedNotice.enableFailed")
        : t("automation.pausedNotice.enableFailed");
      pushToast(message);
    } finally {
      setEnabling(false);
    }
  };

  if (enabled !== false) return null;

  return (
    <Card className="border-amber-300/25 bg-amber-500/10 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-amber-300/25 bg-amber-500/15 text-amber-100">
            <AlertTriangle className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-amber-50">
              {t("automation.pausedNotice.title", { module: moduleName })}
            </p>
            <p className="mt-1 text-sm leading-6 text-amber-50/75">
              {t("automation.pausedNotice.description", { module: moduleName })}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button type="button" onClick={enableModule} disabled={enabling}>
            {enabling ? <Loader2 className="size-4 animate-spin" /> : <Power className="size-4" />}
            {t("automation.pausedNotice.enable")}
          </Button>
          <Link href={workspaceHref(type)} className="inline-flex">
            <Button type="button" variant="outline">
              {t("automation.actions.openWorkspace")}
              <ArrowRight className="size-4" />
            </Button>
          </Link>
        </div>
      </div>
    </Card>
  );
}
