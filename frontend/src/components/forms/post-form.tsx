"use client";

import { useT } from "@/i18n/use-t";

export function PostForm() {
  const { t } = useT();
  return <form className="space-y-4">{t("stubs.postForm")}</form>;
}
