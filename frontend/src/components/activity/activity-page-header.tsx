"use client";

import { Badge } from "@/components/ui/badge";
import { useT } from "@/i18n/use-t";

export function ActivityPageHeader({ count }: { count: number }) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-title">{t("activity.page.title")}</h2>
        <p className="text-subtitle mt-2">{t("activity.page.subtitle")}</p>
      </div>
      <Badge variant="info">{t("activity.page.badge", { count })}</Badge>
    </div>
  );
}

