"use client";

import { useT } from "@/i18n/use-t";

export function AgentCard() {
  const { t } = useT();
  return <div className="rounded border p-4">{t("stubs.agentCard")}</div>;
}
