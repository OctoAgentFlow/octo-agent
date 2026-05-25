"use client";

import { useT } from "@/i18n/use-t";

export function AppFooter() {
  const { t } = useT();
  return <footer className="h-12 border-t px-4 flex items-center text-sm">{t("stubs.footer")}</footer>;
}
