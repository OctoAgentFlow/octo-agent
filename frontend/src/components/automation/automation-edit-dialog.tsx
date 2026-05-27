"use client";

import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import type { AutomationModule, AutomationModuleConfig, AutomationTone } from "@/types/automation";
import { autoCommentSchema, autoDmSchema, autoPostSchema, autoReplySchema } from "@/schemas/automation.schema";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/use-t";

type Props = {
  module: AutomationModule | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (type: AutomationModule["type"], config: AutomationModuleConfig) => Promise<void> | void;
};

function schemaForType(type: AutomationModule["type"]) {
  if (type === "post") return autoPostSchema;
  if (type === "reply") return autoReplySchema;
  if (type === "comment") return autoCommentSchema;
  return autoDmSchema;
}

export function AutomationEditDialog({ module, open, onOpenChange, onSave }: Props) {
  const { t } = useT();
  const [saved, setSaved] = useState(false);

  const schema = useMemo(() => (module ? schemaForType(module.type) : autoPostSchema), [module]);
  type Values = AutomationModuleConfig;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: (module?.config ?? {
      enabled: false,
      frequency: { intervalMinutes: 60, dailyLimit: 0 },
      tone: "Professional",
      executionMode: "review",
      safety: { requireApproval: true, maxPerHour: 0, blockedKeywords: [] },
    }) as Values,
  });

  if (!module) {
    return null;
  }

  const submit = form.handleSubmit(async (values) => {
    setSaved(false);
    await onSave(module.type, values as unknown as AutomationModuleConfig);
    setSaved(true);
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setSaved(false);
      }}
      title={t("automation.edit.title", { name: t(module.nameKey) })}
      description={t("automation.edit.description")}
      className="max-w-lg"
    >
      <form className="space-y-4" onSubmit={submit}>
        <div className="grid gap-2">
          <label className="text-xs text-white/70">
            {t("automation.edit.intervalMinutes")}
            <Input
              type="number"
              min={1}
              max={1440}
              defaultValue={module.config.frequency.intervalMinutes}
              error={form.formState.errors.frequency?.intervalMinutes?.message as string | undefined}
              {...form.register("frequency.intervalMinutes", { valueAsNumber: true })}
            />
          </label>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-wide text-white/70 uppercase">{t("automation.edit.style")}</p>
          <select
            className="form-input"
            defaultValue={module.config.tone}
            {...form.register("tone")}
          >
            {(["Professional", "Friendly", "Degen", "Web3-native"] as AutomationTone[]).map((tone) => (
              <option key={tone} value={tone}>
                {t(`automation.tone.${tone}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-wide text-white/70 uppercase">{t("automation.edit.executionMode")}</p>
          <select className="form-input" defaultValue={module.config.executionMode || "review"} {...form.register("executionMode")}>
            {(["manual", "review", "autopilot"] as const).map((mode) => (
              <option key={mode} value={mode}>
                {t(`automation.executionMode.${mode}`)}
              </option>
            ))}
          </select>
          <p className="text-xs leading-5 text-white/45">{t("automation.edit.executionModeHint")}</p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-wide text-white/70 uppercase">{t("automation.edit.safety")}</p>
          <label className="flex items-center gap-2 text-sm text-white/75">
            <input type="checkbox" className="accent-blue-400" defaultChecked={module.config.safety.requireApproval} {...form.register("safety.requireApproval")} />
            {t("automation.edit.requireApproval")}
          </label>

          <label className="text-xs text-white/70">
            {t("automation.edit.blockedKeywords")}
            <Input
              placeholder={t("automation.edit.blockedKeywordsPlaceholder")}
              defaultValue={module.config.safety.blockedKeywords.join(", ")}
              onChange={(e) => {
                const raw = e.target.value;
                const list = raw
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                form.setValue("safety.blockedKeywords", list, { shouldValidate: true });
              }}
            />
          </label>
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-emerald-300">{saved ? t("automation.edit.saved") : ""}</p>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? t("automation.edit.saving") : t("automation.edit.save")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
