"use client";

import { useT } from "@/i18n/use-t";

export function AccountForm() {
  const { t } = useT();
  return <form className="space-y-4">{t("stubs.accountForm")}</form>;
}
