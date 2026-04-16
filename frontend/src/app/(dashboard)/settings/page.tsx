"use client";

import { useT } from "@/i18n/use-t";

export default function SettingsPage() {
  const { t } = useT();
  return (
    <section className="surface-card p-6">
      <h2 className="text-title">{t("settings.page.title")}</h2>
      <p className="text-subtitle mt-2">{t("settings.page.subtitle")}</p>
    </section>
  );
}
