"use client";

import { Activity } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";

export function ActivityEmptyState() {
  const { t } = useT();
  return (
    <Card>
      <CardHeader
        title={t("activity.empty.title")}
        description={t("activity.empty.description")}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-sm text-white/65">
          <span className="inline-flex size-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
            <Activity className="size-4 text-violet-200" />
          </span>
          <p>{t("activity.empty.tip")}</p>
        </div>
        <Button variant="outline">{t("activity.empty.cta")}</Button>
      </div>
    </Card>
  );
}

