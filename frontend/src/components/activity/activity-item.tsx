"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Bot, CheckCircle2, ChevronDown, Clipboard, MessageCircle, MessageCircleReply, Send, Settings } from "lucide-react";

import type { ActivityRecord } from "@/types/activity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { activityNarrativeLine } from "@/lib/activity-narrative";
import { formatDateTime, usePreferredTimeZone } from "@/lib/timezone";

function statusVariant(status: ActivityRecord["status"]) {
  if (status === "success") return "success";
  if (status === "review") return "warning";
  return "danger";
}

function typeMeta(type: ActivityRecord["type"]) {
  if (type === "post") return { labelKey: "activity.type.post", icon: Bot };
  if (type === "reply") return { labelKey: "activity.type.reply", icon: MessageCircleReply };
  if (type === "comment") return { labelKey: "activity.type.comment", icon: MessageCircle };
  if (type === "system") return { labelKey: "activity.type.system", icon: Settings };
  return { labelKey: "activity.type.dm", icon: Send };
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

function failureCategoryAdviceKey(category: ActivityRecord["failureCategory"]) {
  if (category === "x_auth") return "activity.failureAdvice.x_auth";
  if (category === "rate_limit") return "activity.failureAdvice.rate_limit";
  if (category === "safety") return "activity.failureAdvice.safety";
  if (category === "configuration") return "activity.failureAdvice.configuration";
  if (category === "network") return "activity.failureAdvice.network";
  if (category === "system") return "activity.failureAdvice.system";
  if (category === "unknown") return "activity.failureAdvice.unknown";
  return "";
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

function reviewQueueBulkHref(record: ActivityRecord) {
  if (record.previewKey !== "activity.preview.reviewQueueBulkAction") return "/handling-list";
  if ((record.reviewQueueBulk?.failed || 0) > 0) return "/handling-list?status=failed";
  if (record.reviewQueueBulk?.action === "approve") return "/handling-list?status=ready_to_publish";
  if (record.reviewQueueBulk?.action === "reject") return "/handling-list?status=rejected";
  return "/handling-list";
}

function compactActivityError(message: string) {
  const normalized = message.trim();
  if (normalized.length <= 180) return normalized;
  return `${normalized.slice(0, 180).trimEnd()}...`;
}

export function ActivityItem({ record }: { record: ActivityRecord }) {
  const { t } = useT();
  const timeZone = usePreferredTimeZone();
  const { pushToast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const meta = typeMeta(record.type);
  const Icon = meta.icon;
  const isReviewQueueBulk = record.previewKey === "activity.preview.reviewQueueBulkAction";
  const canInspect = record.status !== "success" || Boolean(record.errorMessage) || isReviewQueueBulk;

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
    <article className="relative border-b border-[#2f3336] bg-black p-4 transition-colors last:border-b-0 hover:bg-[#080808] md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="relative inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-[#2f3336] bg-[#16181c]">
            <Icon className="size-4 text-[#1d9bf0]" />
            <span className="absolute -bottom-1 -right-1 inline-flex size-5 items-center justify-center rounded-full border border-black bg-[#0f1419]">
              {record.status === "success" ? <CheckCircle2 className="size-3 text-[#e7e9ea]" /> : null}
              {record.status === "review" ? <Bot className="size-3 text-[#e7e9ea]" /> : null}
              {record.status === "failed" ? <AlertTriangle className="size-3 text-[#e7e9ea]" /> : null}
            </span>
          </span>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-white">{t(meta.labelKey)}</p>
              {record.sourceModule ? <Badge variant="info">{t(sourceModuleLabelKey(record.sourceModule))}</Badge> : null}
              {record.failureCategory ? <Badge variant="danger">{t(failureCategoryLabelKey(record.failureCategory))}</Badge> : null}
              <Badge variant={statusVariant(record.status)}>{t(`activity.status.${record.status}`)}</Badge>
              <span className="text-xs text-[#71767b]">{relativeTime(record.executedAt, t)}</span>
            </div>
            <p className="line-clamp-3 break-words text-sm leading-6 text-[#e7e9ea]">{activityNarrativeLine(record, t)}</p>
            {record.errorMessage ? (
              <p className="rounded-2xl border border-[#f4212e]/20 bg-[#f4212e]/10 px-3 py-2 text-xs leading-relaxed text-[#ffb6bb]">
                {compactActivityError(record.errorMessage)}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#71767b]">
              <span className="rounded-full border border-[#2f3336] bg-[#16181c] px-2.5 py-1">{record.accountHandle || t("activity.detail.noAccount")}</span>
              <span className="rounded-full border border-[#2f3336] bg-[#16181c] px-2.5 py-1">{formatDateTime(record.executedAt, timeZone)}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {record.status === "review" || isReviewQueueBulk ? (
            <Link href={reviewQueueBulkHref(record)} className="text-sm font-semibold text-[#1d9bf0] hover:underline">
              {t("activity.actions.openQueue")}
            </Link>
          ) : null}
          {record.status === "failed" ? (
            <Link href="/automations" className="text-sm font-semibold text-[#ff8a91] hover:underline">
              {t("activity.actions.troubleshoot")}
            </Link>
          ) : null}
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
        <div className="mt-4 space-y-3 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <DetailField label={t("activity.detail.fields.id")} value={`#${record.id}`} />
            <DetailField label={t("activity.detail.fields.account")} value={record.accountHandle || "—"} />
            {record.sourceModule ? (
              <DetailField label={t("activity.detail.fields.sourceModule")} value={t(sourceModuleLabelKey(record.sourceModule))} />
            ) : null}
            {record.failureCategory ? (
              <DetailField label={t("activity.detail.fields.failureCategory")} value={t(failureCategoryLabelKey(record.failureCategory))} />
            ) : null}
            <DetailField label={t("activity.detail.fields.type")} value={t(meta.labelKey)} />
            <DetailField label={t("activity.detail.fields.status")} value={t(`activity.status.${record.status}`)} />
            <DetailField label={t("activity.detail.fields.executedAt")} value={formatDateTime(record.executedAt, timeZone)} />
            {record.xAccountId ? (
              <DetailField label={t("activity.detail.fields.accountId")} value={String(record.xAccountId)} />
            ) : null}
            {record.replyCommentTweetId ? (
              <DetailField label={t("activity.detail.fields.commentTweet")} value={record.replyCommentTweetId} />
            ) : null}
          </div>

          {record.errorMessage ? (
            <div className="rounded-2xl border border-[#f4212e]/25 bg-[#f4212e]/10 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-normal text-[#ff8a91]">{t("activity.detail.error")}</p>
                <Button type="button" size="sm" variant="ghost" className="h-7 text-[#ff8a91]" onClick={() => void copyError()}>
                  <Clipboard className="size-3.5" />
                  {t("activity.detail.copy")}
                </Button>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[#ffdadd]">{record.errorMessage}</p>
              {record.failureCategory ? (
                <p className="mt-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs leading-5 text-[#ffdadd]">
                  {t(failureCategoryAdviceKey(record.failureCategory))}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="rounded-2xl border border-[#2f3336] bg-black px-3 py-2 text-sm text-[#71767b]">
              {t("activity.detail.noError")}
            </p>
          )}

          {record.type === "reply" && (record.replyToUsername || record.replyToTextPreview || record.replyTextPreview) ? (
            <div className="grid gap-3 md:grid-cols-2">
              <DetailText label={t("activity.detail.reply.incoming")} value={record.replyToTextPreview || "—"} />
              <DetailText label={t("activity.detail.reply.outgoing")} value={record.replyTextPreview || "—"} />
            </div>
          ) : null}
          {isReviewQueueBulk ? (
            <div className="grid gap-3 md:grid-cols-4">
              <DetailField label={t("activity.reviewQueueBulk.action")} value={t(`handlingList.bulk.action.${record.reviewQueueBulk?.action || "approve"}`)} />
              <DetailField label={t("activity.reviewQueueBulk.total")} value={String(record.reviewQueueBulk?.total || 0)} />
              <DetailField label={t("activity.reviewQueueBulk.succeeded")} value={String(record.reviewQueueBulk?.succeeded || 0)} />
              <DetailField label={t("activity.reviewQueueBulk.failed")} value={String(record.reviewQueueBulk?.failed || 0)} />
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-[#71767b]">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-[#e7e9ea]">{value}</p>
    </div>
  );
}

function DetailText({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-3">
      <p className="text-xs text-[#71767b]">{label}</p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-[#d5d9dc]">{value}</p>
    </div>
  );
}
