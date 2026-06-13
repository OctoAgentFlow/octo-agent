"use client";

import Link from "next/link";
import { Bot, ChevronRight, ClipboardList, MessageCircle, MessageCircleReply, Send, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";
import type { ActivityRecord } from "@/types/activity";
import { activityNarrativeLine } from "@/lib/activity-narrative";
import { formatTimeOnly, usePreferredTimeZone } from "@/lib/timezone";

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

function sourceModuleLabelKey(sourceModule: ActivityRecord["sourceModule"]) {
  if (sourceModule === "post") return "activity.source.post";
  if (sourceModule === "reply") return "activity.source.reply";
  if (sourceModule === "comment") return "activity.source.comment";
  if (sourceModule === "dm") return "activity.source.dm";
  return "";
}

function failureCategoryLabelKey(category: ActivityRecord["failureCategory"]) {
  if (category === "x_auth") return "activity.failureCategory.x_auth";
  if (category === "rate_limit") return "activity.failureCategory.rate_limit";
  if (category === "safety") return "activity.failureCategory.safety";
  if (category === "configuration") return "activity.failureCategory.configuration";
  if (category === "network") return "activity.failureCategory.network";
  if (category === "system") return "activity.failureCategory.system";
  if (category === "unknown") return "activity.failureCategory.unknown";
  return "";
}

export function RecentActivityList({ records, loading, errorMessage, onRetry }: RecentActivityListProps) {
  const { t } = useT();
  const timeZone = usePreferredTimeZone();

  return (
    <SectionCard
      title={t("dashboard.activity.section.title")}
      description={t("dashboard.activity.section.description")}
    >
      {loading ? (
        <div className="-mx-5 divide-y divide-[#2f3336] md:-mx-6">
          {Array.from({ length: 3 }).map((_, index) => (
            <article key={index} className="grid gap-2 px-5 py-4 md:grid-cols-[76px_1fr_96px] md:px-6">
              <span className="h-4 w-14 animate-pulse rounded-full bg-[#2f3336]" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-4 w-20 animate-pulse rounded-full bg-[#2f3336]" />
                  <span className="h-5 w-16 animate-pulse rounded-full bg-[#1d9bf0]/10" />
                </div>
                <span className="mt-3 block h-3 w-full max-w-md animate-pulse rounded-full bg-[#2f3336]" />
                <span className="mt-2 block h-3 w-40 animate-pulse rounded-full bg-[#2f3336]" />
              </div>
              <span className="ml-auto h-4 w-16 animate-pulse rounded-full bg-[#2f3336]" />
            </article>
          ))}
        </div>
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
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <div className="flex gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#1d9bf0]/10 text-[#1d9bf0]">
              <ClipboardList className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="font-semibold text-[#e7e9ea]">{t("dashboard.activity.emptyTitle")}</p>
              <p className="mt-1 text-sm leading-6 text-[#71767b]">{t("dashboard.activity.empty")}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/automations" className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-[#1d9bf0] px-3 text-sm font-semibold text-white transition hover:bg-[#1a8cd8]">
                  {t("dashboard.activity.emptyAutomationCta")}
                  <ChevronRight className="size-4" />
                </Link>
                <Link href="/handling-list" className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-[#2f3336] px-3 text-sm font-semibold text-[#e7e9ea] transition hover:bg-[#16181c]">
                  {t("dashboard.activity.emptyQueueCta")}
                  <ChevronRight className="size-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
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
                    {formatTimeOnly(activity.executedAt, timeZone)}
                </span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-[#e7e9ea]">{t(typeLabelKey(activity.type))}</p>
                    {activity.sourceModule ? (
                      <span className="rounded-full border border-blue-300/25 bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-200">
                        {t(sourceModuleLabelKey(activity.sourceModule))}
                      </span>
                    ) : null}
                    {activity.failureCategory ? (
                      <span className="rounded-full border border-rose-300/25 bg-rose-500/10 px-2 py-0.5 text-[11px] text-rose-200">
                        {t(failureCategoryLabelKey(activity.failureCategory))}
                      </span>
                    ) : null}
                  </div>
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
