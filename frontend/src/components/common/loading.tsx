"use client";

import { useT } from "@/i18n/use-t";

export function Loading() {
  const { t } = useT();
  return <div className="text-sm text-muted-foreground">{t("common.loading")}</div>;
}
