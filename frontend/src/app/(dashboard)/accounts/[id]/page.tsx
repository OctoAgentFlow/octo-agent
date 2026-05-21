"use client";

import { useT } from "@/i18n/use-t";

export default function AccountDetailPage() {
  const { t } = useT();
  return (
    <section className="surface-card bg-[#0f1419] p-6">
      <h2 className="text-title">{t("accounts.detail.title")}</h2>
      <p className="text-subtitle mt-2">{t("accounts.detail.subtitle")}</p>
    </section>
  );
}
