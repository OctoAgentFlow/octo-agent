"use client";

import { useT } from "@/i18n/use-t";

export default function CreatePostPage() {
  const { t } = useT();
  return (
    <section className="surface-card p-6">
      <h2 className="text-title">{t("posts.create.title")}</h2>
      <p className="text-subtitle mt-2">{t("posts.create.subtitle")}</p>
    </section>
  );
}
