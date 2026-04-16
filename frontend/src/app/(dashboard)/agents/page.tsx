"use client";

import { useMemo, useState } from "react";

import { automationModulesMock, automationRuntimeStatusMock } from "@/mocks/automation/automation.mock";
import type { AutomationModule, AutomationModuleConfig } from "@/types/automation";

import { AutomationEditDialog } from "@/components/automation/automation-edit-dialog";
import { AutomationModuleCard } from "@/components/automation/automation-module-card";
import { AutomationPageHeader } from "@/components/automation/automation-page-header";
import { AutomationStatusPanel } from "@/components/automation/automation-status-panel";

export default function AgentsPage() {
  const [modules, setModules] = useState<AutomationModule[]>(automationModulesMock);
  const [editType, setEditType] = useState<AutomationModule["type"] | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const editing = useMemo(
    () => (editType ? modules.find((m) => m.type === editType) ?? null : null),
    [editType, modules]
  );

  const overallState = useMemo(() => {
    if (modules.some((m) => m.state === "Needs Review")) return "Needs Attention" as const;
    if (modules.every((m) => !m.config.enabled)) return "Paused" as const;
    return "Running" as const;
  }, [modules]);

  const onToggle = (type: AutomationModule["type"], enabled: boolean) => {
    setModules((prev) =>
      prev.map((m) => (m.type === type ? { ...m, config: { ...m.config, enabled }, state: enabled ? m.state : "Paused" } : m))
    );
  };

  const onEdit = (type: AutomationModule["type"]) => {
    setEditType(type);
    setEditOpen(true);
  };

  const onSave = (type: AutomationModule["type"], config: AutomationModuleConfig) => {
    setModules((prev) => prev.map((m) => (m.type === type ? { ...m, config } : m)));
  };

  return (
    <div className="space-y-4 md:space-y-5">
      <AutomationPageHeader overallState={overallState} />

      <div className="grid gap-4 xl:grid-cols-2">
        {modules.map((module) => (
          <AutomationModuleCard key={module.type} module={module} onToggle={onToggle} onEdit={onEdit} />
        ))}
      </div>

      <AutomationStatusPanel status={automationRuntimeStatusMock} />

      <AutomationEditDialog
        module={editing}
        open={editOpen}
        onOpenChange={(open) => setEditOpen(open)}
        onSave={onSave}
      />
    </div>
  );
}
