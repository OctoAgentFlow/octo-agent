"use client";

import { useT } from "@/i18n/use-t";

export function AgentConfigForm() {
  const { t } = useT();
  return <form>{t("stubs.agentConfigForm")}</form>;
}
