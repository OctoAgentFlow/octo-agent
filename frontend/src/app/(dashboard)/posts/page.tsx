"use client";

import { useT } from "@/i18n/use-t";

export default function PostsPage() {
  const { t } = useT();
  return (
    <section className="surface-card p-6">
      <h2 className="text-title">{t("posts.page.title")}</h2>
      <p className="text-subtitle mt-2">{t("posts.page.subtitle")}</p>
    </section>
  );
}
