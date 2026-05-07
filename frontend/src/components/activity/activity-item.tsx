"use client";

import { useState } from "react";
import { Bot, ChevronDown, Clipboard, MessageCircleReply, Send } from "lucide-react";

import type { ActivityRecord } from "@/types/activity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { activityNarrativeLine } from "@/lib/activity-narrative";

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
  if (mins < 1) return t("activity.relative.justNow");
  if (mins < 60) return t("activity.relative.minutesAgo", { minutes: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("activity.relative.hoursAgo", { hours });
  const days = Math.floor(hours / 24);
  return t("activity.relative.daysAgo", { days });
}

export function ActivityItem({ record }: { record: ActivityRecord }) {
  const { t } = useT();
  const { pushToast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const meta = typeMeta(record.type);
  const Icon = meta.icon;
  const canInspect = record.status !== "success" || Boolean(record.errorMessage);

  const copyError = async () => {
    if (!record.errorMessage) return;
    try {
      await navigator.clipboard.writeText(record.errorMessage);
      pushToast(t("activity.detail.copied"));
    } catch {
      pushToast(t("activity.detail.copyFailed"));
    }
  };

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
            <p className="line-clamp-3 text-sm text-white/80">{activityNarrativeLine(record, t)}</p>
            {record.errorMessage ? (
              <p className="line-clamp-2 text-xs leading-snug text-rose-200/90">{record.errorMessage}</p>
            ) : null}
            <div className="flex flex-wrap gap-4 text-xs text-white/55">
              <span>{record.accountHandle}</span>
              <span>{relativeTime(record.executedAt, t)}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className="text-xs text-white/40">{new Date(record.executedAt).toLocaleString()}</span>
          {canInspect ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              <ChevronDown className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
              {expanded ? t("activity.detail.hide") : t("activity.detail.show")}
            </Button>
          ) : null}
        </div>
      </div>
      {expanded ? (
        <div className="mt-4 space-y-3 rounded-lg border border-white/8 bg-black/20 p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <DetailField label={t("activity.detail.fields.id")} value={`#${record.id}`} />
            <DetailField label={t("activity.detail.fields.account")} value={record.accountHandle || "—"} />
            <DetailField label={t("activity.detail.fields.type")} value={t(meta.labelKey)} />
            <DetailField label={t("activity.detail.fields.executedAt")} value={new Date(record.executedAt).toLocaleString()} />
            {record.xAccountId ? (
              <DetailField label={t("activity.detail.fields.accountId")} value={String(record.xAccountId)} />
            ) : null}
            {record.replyCommentTweetId ? (
              <DetailField label={t("activity.detail.fields.commentTweet")} value={record.replyCommentTweetId} />
            ) : null}
          </div>

          {record.errorMessage ? (
            <div className="rounded-md border border-rose-300/15 bg-rose-400/10 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-normal text-rose-100/80">{t("activity.detail.error")}</p>
                <Button type="button" size="sm" variant="ghost" className="h-7 text-rose-100/80" onClick={() => void copyError()}>
                  <Clipboard className="size-3.5" />
                  {t("activity.detail.copy")}
                </Button>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-rose-50">{record.errorMessage}</p>
            </div>
          ) : (
            <p className="rounded-md border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-white/55">
              {t("activity.detail.noError")}
            </p>
          )}

          {record.type === "reply" && (record.replyToUsername || record.replyToTextPreview || record.replyTextPreview) ? (
            <div className="grid gap-3 md:grid-cols-2">
              <DetailText label={t("activity.detail.reply.incoming")} value={record.replyToTextPreview || "—"} />
              <DetailText label={t("activity.detail.reply.outgoing")} value={record.replyTextPreview || "—"} />
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-white/45">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-white/82">{value}</p>
    </div>
  );
}

function DetailText({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/8 bg-white/[0.03] p-3">
      <p className="text-xs text-white/45">{label}</p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-white/75">{value}</p>
    </div>
  );
}
