"use client";

import { Bot, MessageCircleReply, Send } from "lucide-react";

import type { ActivityRecord } from "@/types/activity";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";

function statusVariant(status: ActivityRecord["status"]) {
  if (status === "success") return "success";
  if (status === "review") return "warning";
  return "danger";
}

function typeMeta(type: ActivityRecord["type"]) {
  if (type === "post") return { labelKey: "activity.type.post", icon: Bot };
  if (type === "reply") return { labelKey: "activity.type.reply", icon: MessageCircleReply };
  return { labelKey: "activity.type.dm", icon: Send };
}

function relativeTime(iso: string, t: (key: string, params?: Record<string, string | number>) => string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return t("activity.relative.minutesAgo", { minutes: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("activity.relative.hoursAgo", { hours });
  const days = Math.floor(hours / 24);
  return t("activity.relative.daysAgo", { days });
}

export function ActivityItem({ record }: { record: ActivityRecord }) {
  const { t } = useT();
  const meta = typeMeta(record.type);
  const Icon = meta.icon;

  return (
    <Card className="p-4 transition-colors hover:bg-white/5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
            <Icon className="size-4 text-blue-200" />
          </span>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-white">{t(meta.labelKey)}</p>
              <Badge variant={statusVariant(record.status)}>{t(`activity.status.${record.status}`)}</Badge>
            </div>
            <p className="line-clamp-2 text-sm text-white/75">{t(record.previewKey)}</p>
            <div className="flex flex-wrap gap-4 text-xs text-white/55">
              <span>{record.accountHandle}</span>
              <span>{relativeTime(record.executedAt, t)}</span>
            </div>
          </div>
        </div>
        <span className="text-xs text-white/40">{new Date(record.executedAt).toLocaleString()}</span>
      </div>
    </Card>
  );
}

