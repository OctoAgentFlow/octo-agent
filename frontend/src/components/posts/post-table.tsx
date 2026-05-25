"use client";

import { useT } from "@/i18n/use-t";

export function PostTable() {
  const { t } = useT();
  return <div>{t("stubs.postTable")}</div>;
}
