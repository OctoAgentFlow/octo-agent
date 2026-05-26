"use client";

import { Bot, MessageCircle, MessageCircleReply, Send, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";
import type { ActivityRecord } from "@/types/activity";
import { activityNarrativeLine } from "@/lib/activity-narrative";

import { SectionCard } from "./section-card";

type RecentActivityListProps = {
  records: ActivityRecord[];
  loading?: boolean;
  errorMessage?: string | null;
  onRetry?: () => void;
};

function typeIcon(type: ActivityRecord["type"]) {
  if (type === "post") return Bot;
  if (type === "reply") return MessageCircleReply;
  if (type === "comment") return MessageCircle;
  if (type === "system") return Settings;
  return Send;
}

function typeLabelKey(type: ActivityRecord["type"]) {
  if (type === "post") return "activity.type.post";
  if (type === "reply") return "activity.type.reply";
  if (type === "comment") return "activity.type.comment";
  if (type === "system") return "activity.type.system";
  return "activity.type.dm";
}

function formatClock(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function RecentActivityList({ records, loading, errorMessage, onRetry }: RecentActivityListProps) {
  const { t } = useT();

  return (
    <SectionCard
      title={t("dashboard.activity.section.title")}
      description={t("dashboard.activity.section.description")}
    >
      {loading ? (
        <p className="text-sm text-white/60">{t("dashboard.activity.loading")}</p>
      ) : errorMessage ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-red-200/90">{errorMessage}</p>
          {onRetry ? (
            <Button variant="outline" size="sm" type="button" onClick={onRetry}>
              {t("profile.retry")}
            </Button>
          ) : null}
        </div>
      ) : records.length === 0 ? (
        <p className="text-sm text-[#71767b]">{t("dashboard.activity.empty")}</p>
      ) : (
        <div className="-mx-5 divide-y divide-[#2f3336] md:-mx-6">
          {records.map((activity) => {
            const Icon = typeIcon(activity.type);
            return (
              <article
                key={activity.id}
                className="grid gap-2 px-5 py-4 text-sm transition-colors hover:bg-[#080808] md:grid-cols-[76px_1fr_96px] md:px-6"
              >
                <span className="flex items-center gap-2 text-[#71767b]">
                  <Icon className="size-3.5 shrink-0 text-[#1d9bf0]" />
                  {formatClock(activity.executedAt)}
                </span>
                <div>
                  <p className="font-semibold text-[#e7e9ea]">{t(typeLabelKey(activity.type))}</p>
                  <p className="line-clamp-3 text-xs leading-5 text-[#e7e9ea]/78">{activityNarrativeLine(activity, t)}</p>
                  {activity.errorMessage ? (
                    <p className="mt-1 line-clamp-2 text-xs text-rose-200/85">{activity.errorMessage}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-[#71767b]">{activity.accountHandle}</p>
                </div>
                <span className="text-right text-[#71767b]">{t(`activity.status.${activity.status}`)}</span>
              </article>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
