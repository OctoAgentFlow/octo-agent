"use client";

import { useT } from "@/i18n/use-t";

export default function PostDetailPage() {
  const { t } = useT();
  return (
    <section className="surface-card p-6">
      <h2 className="text-title">{t("posts.detail.title")}</h2>
      <p className="text-subtitle mt-2">{t("posts.detail.subtitle")}</p>
    </section>
  );
}
