"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Bot, CheckCircle2, Clock, FileText, MessageCircle, Pencil, Send, ShieldAlert, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { automationService } from "@/services/automation.service";
import { autoPostService } from "@/services/auto-post.service";
import { publishingService, type XPublisherStatusApi } from "@/services/publishing.service";
import {
  reviewQueueService,
  type ReviewQueueExecutionMode,
  type ReviewQueueItemApi,
  type ReviewQueueStatus,
  type ReviewQueueType,
} from "@/services/review-queue.service";

type LoadState = "loading" | "ready" | "error";

const typeOptions: ReviewQueueType[] = ["all", "post", "comment", "reply", "dm"];
const statusOptions: ReviewQueueStatus[] = ["all", "draft", "pending_review", "ready_to_publish", "processing", "published", "approved", "rejected", "failed"];
const modeOptions: ReviewQueueExecutionMode[] = ["all", "manual", "review", "autopilot"];

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusTone(status: string) {
  if (status === "ready_to_publish") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  if (status === "processing") return "border-[#1d9bf0]/35 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  if (status === "pending_review" || status === "draft") return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
  if (status === "approved" || status === "published") return "border-[#1d9bf0]/35 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  if (status === "rejected" || status === "failed") return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
  return "border-[#2f3336] bg-[#16181c] text-[#71767b]";
}

function typeIcon(type: string) {
  if (type === "comment") return MessageCircle;
  if (type === "post") return FileText;
  if (type === "dm") return Send;
  return Bot;
}

export default function ExecutionQueuePage() {
  const { t } = useT();
  const { pushToast } = useToast();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [items, setItems] = useState<ReviewQueueItemApi[]>([]);
  const [stats, setStats] = useState({ pending_review: 0, ready_to_publish: 0, approved: 0, rejected: 0, failed: 0 });
  const [typeFilter, setTypeFilter] = useState<ReviewQueueType>("all");
  const [statusFilter, setStatusFilter] = useState<ReviewQueueStatus>("all");
  const [modeFilter, setModeFilter] = useState<ReviewQueueExecutionMode>("all");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [busyID, setBusyID] = useState<number | null>(null);
  const [publisherStatus, setPublisherStatus] = useState<XPublisherStatusApi | null>(null);

  useEffect(() => {
    const type = new URLSearchParams(window.location.search).get("type") as ReviewQueueType | null;
    if (type && typeOptions.includes(type)) {
      setTypeFilter(type);
    }
  }, []);

  const loadQueue = useCallback(async () => {
    setLoadState("loading");
    try {
      const [data, publishingStatus] = await Promise.all([
        reviewQueueService.list({
          type: typeFilter,
          status: statusFilter,
          executionMode: modeFilter,
          page: 1,
          pageSize: 50,
        }),
        publishingService.status(),
      ]);
      setItems(data.items);
      setStats(data.stats);
      setPublisherStatus(publishingStatus);
      setLoadState("ready");
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || t("executionQueue.errors.load")
        : t("executionQueue.errors.load");
      pushToast(message);
      setLoadState("error");
    }
  }, [modeFilter, pushToast, statusFilter, t, typeFilter]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  const statCards = useMemo(
    () => [
      { key: "pendingReview", value: stats.pending_review, label: t("executionQueue.stats.pendingReview"), icon: Clock },
      { key: "readyToPublish", value: stats.ready_to_publish, label: t("executionQueue.stats.readyToPublish"), icon: Send },
      { key: "approved", value: stats.approved, label: t("executionQueue.stats.approved"), icon: CheckCircle2 },
      { key: "rejected", value: stats.rejected, label: t("executionQueue.stats.rejected"), icon: XCircle },
      { key: "failed", value: stats.failed, label: t("executionQueue.stats.failed"), icon: ShieldAlert },
    ],
    [stats, t]
  );

  const updateLocalItem = (updated: ReviewQueueItemApi, patch: Partial<ReviewQueueItemApi>) => {
    setItems((current) => current.map((item) => (item.id === updated.id && item.type === updated.type ? { ...item, ...patch } : item)));
  };

  const saveEdit = async (item: ReviewQueueItemApi) => {
    if (!editingContent.trim() || (item.type !== "comment" && item.type !== "reply" && item.type !== "post")) return;
    setBusyID(item.id);
    try {
      if (item.type === "comment") {
        const updated = await automationService.updateCommentDraft(item.source_id, editingContent.trim());
        updateLocalItem(item, {
          content: updated.generated_comment || editingContent.trim(),
          status: updated.status === "review" ? "pending_review" : updated.status === "sent" ? "published" : (updated.status as ReviewQueueItemApi["status"]),
        });
      } else if (item.type === "reply") {
        const updated = await automationService.updateReplyDraft(item.source_id, editingContent.trim());
        updateLocalItem(item, {
          content: updated.generated_reply || editingContent.trim(),
          status: updated.status === "review" ? "pending_review" : updated.status === "sent" ? "published" : (updated.status as ReviewQueueItemApi["status"]),
        });
      } else {
        const updated = await autoPostService.updateDraft(item.source_id, editingContent.trim());
        updateLocalItem(item, {
          content: updated.generated_content || editingContent.trim(),
          status: updated.status as ReviewQueueItemApi["status"],
        });
      }
      setEditingKey(null);
      setEditingContent("");
      pushToast(t("executionQueue.toast.saved"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("executionQueue.errors.save") : t("executionQueue.errors.save"));
    } finally {
      setBusyID(null);
    }
  };

  const approve = async (item: ReviewQueueItemApi) => {
    if (item.type !== "comment" && item.type !== "reply" && item.type !== "post") return;
    setBusyID(item.id);
    try {
      const updated = item.type === "comment"
        ? await automationService.approveCommentTask(item.source_id)
        : item.type === "reply"
          ? await automationService.approveReplyDraft(item.source_id)
          : await autoPostService.approveDraft(item.source_id);
      updateLocalItem(item, { status: updated.status === "review" ? "pending_review" : (updated.status as ReviewQueueItemApi["status"]) });
      pushToast(t(item.type === "post" ? "executionQueue.toast.postPublishJobCreated" : "executionQueue.toast.approved"));
      void loadQueue();
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("executionQueue.errors.approve") : t("executionQueue.errors.approve"));
    } finally {
      setBusyID(null);
    }
  };

  const reject = async (item: ReviewQueueItemApi) => {
    if (item.type !== "comment" && item.type !== "reply" && item.type !== "post") return;
    setBusyID(item.id);
    try {
      const updated = item.type === "comment"
        ? await automationService.rejectCommentDraft(item.source_id, t("executionQueue.rejectReason"))
        : item.type === "reply"
          ? await automationService.rejectReplyDraft(item.source_id, t("executionQueue.rejectReason"))
          : await autoPostService.rejectDraft(item.source_id, t("executionQueue.rejectReason"));
      updateLocalItem(item, { status: updated.status as ReviewQueueItemApi["status"] });
      pushToast(t("executionQueue.toast.rejected"));
      void loadQueue();
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("executionQueue.errors.reject") : t("executionQueue.errors.reject"));
    } finally {
      setBusyID(null);
    }
  };

  const retryPublish = async (item: ReviewQueueItemApi) => {
    if (!item.publish_job_id) return;
    setBusyID(item.id);
    try {
      await publishingService.retry(item.publish_job_id);
      pushToast(t("executionQueue.toast.retryQueued"));
      void loadQueue();
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("executionQueue.errors.retry") : t("executionQueue.errors.retry"));
    } finally {
      setBusyID(null);
    }
  };

  const preparePostPublish = async (item: ReviewQueueItemApi) => {
    if (item.type !== "post") return;
    setBusyID(item.id);
    try {
      await autoPostService.preparePublish(item.source_id);
      pushToast(t("executionQueue.toast.postPublishJobCreated"));
      void loadQueue();
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("executionQueue.errors.preparePublish") : t("executionQueue.errors.preparePublish"));
    } finally {
      setBusyID(null);
    }
  };

  const realPublish = async (item: ReviewQueueItemApi) => {
    if (!item.publish_job_id) return;
    const confirmKey = publisherStatus?.dry_run ? "executionQueue.confirm.dryRunPublish" : "executionQueue.confirm.realPublish";
    if (!window.confirm(t(confirmKey))) return;
    setBusyID(item.id);
    try {
      const updated = await publishingService.publishNow(item.publish_job_id);
      pushToast(updated.publish_mode === "dry_run" ? t("executionQueue.toast.dryRunPublish") : t("executionQueue.toast.realPublish"));
      void loadQueue();
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("executionQueue.errors.realPublish") : t("executionQueue.errors.realPublish"));
    } finally {
      setBusyID(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-[#1d9bf0]">{t("executionQueue.kicker")}</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">{t("executionQueue.title")}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-[#71767b]">{t("executionQueue.subtitle")}</p>
        {publisherStatus ? (
          <div className="mt-4 flex min-w-0 flex-wrap items-center gap-2 text-xs">
            <span className="max-w-full rounded-full border border-[#2f3336] bg-[#0f1419] px-3 py-1 text-[#71767b]">
              {t("executionQueue.publisherMode.label")}
            </span>
            <span className={`max-w-full rounded-full border px-3 py-1 ${
              publisherStatus.real_publish_enabled && !publisherStatus.dry_run
                ? "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]"
                : publisherStatus.dry_run
                  ? "border-[#1d9bf0]/35 bg-[#1d9bf0]/10 text-[#8ecdf8]"
                  : "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]"
            }`}>
              {publisherStatus.real_publish_enabled && !publisherStatus.dry_run
                ? t("executionQueue.publisherMode.real")
                : publisherStatus.dry_run
                  ? t("executionQueue.publisherMode.dryRun")
                  : t("executionQueue.publisherMode.simulated")}
            </span>
            <span className="max-w-full break-words rounded-full border border-[#2f3336] bg-[#0f1419] px-3 py-1 text-[#71767b] [overflow-wrap:anywhere]">
              {t("executionQueue.publisherMode.limits", {
                daily: publisherStatus.per_account_daily_limit,
                cooldown: publisherStatus.per_account_min_interval_seconds,
              })}
            </span>
            {publisherStatus.accounts_missing_tweet_write_count > 0 ? (
              <span className="max-w-full break-words rounded-full border border-[#ffd400]/25 bg-[#ffd400]/10 px-3 py-1 text-[#f6d96b] [overflow-wrap:anywhere]">
                {t("executionQueue.publisherMode.missingScope", { count: publisherStatus.accounts_missing_tweet_write_count })}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {statCards.map((stat) => (
          <Card key={stat.key} className="bg-[#0f1419] p-4 transition-colors hover:bg-[#16181c]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-[#71767b]">{stat.label}</p>
                <p className="mt-2 text-2xl font-semibold text-white">{stat.value}</p>
              </div>
              <stat.icon className="size-4 text-[#1d9bf0]" />
            </div>
          </Card>
        ))}
      </div>

      <Card className="bg-[#0f1419]">
        <div className="grid gap-3 md:grid-cols-3">
          <FilterSelect label={t("executionQueue.filters.type")} value={typeFilter} onChange={(value) => setTypeFilter(value as ReviewQueueType)} options={typeOptions} labelPrefix="executionQueue.type" />
          <FilterSelect label={t("executionQueue.filters.status")} value={statusFilter} onChange={(value) => setStatusFilter(value as ReviewQueueStatus)} options={statusOptions} labelPrefix="executionQueue.status" />
          <FilterSelect label={t("executionQueue.filters.executionMode")} value={modeFilter} onChange={(value) => setModeFilter(value as ReviewQueueExecutionMode)} options={modeOptions} labelPrefix="executionQueue.executionMode" />
        </div>
      </Card>

      <Card className="overflow-hidden bg-[#0f1419] p-0">
        <div className="border-b border-[#2f3336] p-5 md:p-6">
        <CardHeader title={t("executionQueue.list.title")} description={t("executionQueue.list.description")} />
        </div>
        {loadState === "loading" ? (
          <div className="m-5 rounded-2xl border border-[#2f3336] bg-black px-4 py-10 text-center text-sm text-[#71767b]">{t("executionQueue.loading")}</div>
        ) : null}
        {loadState === "error" ? (
          <div className="m-5 rounded-2xl border border-[#f4212e]/25 bg-[#f4212e]/10 px-4 py-10 text-center text-sm text-[#ff8a91]">
            {t("executionQueue.errors.load")}
          </div>
        ) : null}
        {loadState === "ready" && items.length === 0 ? (
          <div className="m-5 rounded-2xl border border-[#2f3336] bg-black px-4 py-12 text-center">
            <p className="text-sm font-medium text-white">{t("executionQueue.empty.title")}</p>
            <p className="mt-2 text-sm text-[#71767b]">{t("executionQueue.empty.description")}</p>
          </div>
        ) : null}
        {loadState === "ready" && items.length > 0 ? (
          <div className="divide-y divide-[#2f3336]">
            {items.map((item) => {
              const Icon = typeIcon(item.type);
              const itemKey = `${item.type}-${item.id}`;
              const editing = editingKey === itemKey;
              const manageable = item.type === "comment" || item.type === "reply" || item.type === "post";
              const canReview = manageable && (item.status === "pending_review" || item.status === "draft");
              return (
                <div key={`${item.type}-${item.id}`} className="bg-black p-4 transition-colors hover:bg-[#080808] md:p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#1d9bf0]/35 bg-[#1d9bf0]/10 px-2.5 py-1 text-xs text-[#8ecdf8]">
                          <Icon className="size-3.5" />
                          {t(`executionQueue.type.${item.type}`)}
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 text-xs ${statusTone(item.status)}`}>{t(`executionQueue.status.${item.status}`)}</span>
                        <span className="rounded-full border border-[#2f3336] bg-[#16181c] px-2.5 py-1 text-xs text-[#71767b]">
                          {t(`executionQueue.executionMode.${item.execution_mode}`)}
                        </span>
                        {item.risk_level === "high" ? (
                          <span className="rounded-full border border-[#ffd400]/25 bg-[#ffd400]/10 px-2.5 py-1 text-xs text-[#f6d96b]">
                            {t("executionQueue.riskFallback")}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-4 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
                        {editing ? (
                          <textarea
                            value={editingContent}
                            onChange={(event) => setEditingContent(event.target.value)}
                            rows={4}
                            className="form-input min-h-28 resize-y leading-6"
                          />
                        ) : (
                          <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-[#e7e9ea] [overflow-wrap:anywhere]">{item.content || "—"}</p>
                        )}
                      </div>

                      <div className="mt-3 grid gap-2 text-xs text-[#71767b] md:grid-cols-2">
                        <p>{t("executionQueue.item.bot")}: {item.bot_name || (item.bot_id ? `Bot #${item.bot_id}` : "—")}</p>
                        <p>{t("executionQueue.item.account")}: {item.twitter_account_name || `#${item.twitter_account_id}`}</p>
                        <p className="md:col-span-2">{t("executionQueue.item.target")}: {item.target_summary || "—"}</p>
                        <p>{t("executionQueue.item.createdAt")}: {formatDate(item.created_at)}</p>
                        <p>{t("executionQueue.item.risk")}: {item.risk_level || "low"}{item.risk_reasons?.length ? ` · ${item.risk_reasons.join(" / ")}` : ""}</p>
                        {item.publish_job_id ? (
                          <p className="md:col-span-2">
                            {t("executionQueue.item.publishJob")}: #{item.publish_job_id}
                            {item.publish_status ? ` · ${t(`executionQueue.publishStatus.${item.publish_status}`)}` : ""}
                            {item.publish_mode ? ` · ${t(`executionQueue.publishMode.${item.publish_mode}`)}` : ""}
                            {item.publish_last_error ? ` · ${item.publish_last_error}` : ""}
                          </p>
                        ) : null}
                        {item.publish_external_url ? (
                          <a className="md:col-span-2 break-words text-[#1d9bf0] hover:underline" href={item.publish_external_url} target="_blank" rel="noreferrer">
                            {item.publish_external_url}
                          </a>
                        ) : null}
                      </div>
                    </div>

                    <div className="grid shrink-0 gap-2 sm:flex sm:flex-wrap sm:justify-start xl:max-w-[300px] xl:justify-end">
                      {item.status === "ready_to_publish" ? (
                        <span className="inline-flex h-8 items-center rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-3 text-xs text-[#7ee0b5]">
                          {t("executionQueue.actions.simulatedMode")}
                        </span>
                      ) : null}
                      {item.status === "processing" ? (
                        <span className="inline-flex h-8 items-center rounded-full border border-[#1d9bf0]/35 bg-[#1d9bf0]/10 px-3 text-xs text-[#8ecdf8]">
                          {t("executionQueue.actions.processing")}
                        </span>
                      ) : null}
                      {editing ? (
                        <>
                          <Button size="sm" className="w-full sm:w-auto" disabled={busyID === item.id} onClick={() => void saveEdit(item)}>{t("executionQueue.actions.save")}</Button>
                          <Button size="sm" className="w-full sm:w-auto" variant="outline" onClick={() => setEditingKey(null)}>{t("common.cancel")}</Button>
                        </>
                      ) : (
                        <>
                          {manageable ? (
                            <Button
                              size="sm"
                              className="w-full sm:w-auto"
                              variant="outline"
                              onClick={() => {
                                setEditingKey(itemKey);
                                setEditingContent(item.content || "");
                              }}
                            >
                              <Pencil className="size-4" />
                              {t("executionQueue.actions.edit")}
                            </Button>
                          ) : null}
                          {canReview ? (
                            <Button size="sm" className="w-full sm:w-auto" disabled={busyID === item.id} onClick={() => void approve(item)}>
                              <CheckCircle2 className="size-4" />
                              {t("executionQueue.actions.approve")}
                            </Button>
                          ) : null}
                          {manageable && item.status !== "rejected" && item.status !== "published" ? (
                            <Button size="sm" className="w-full sm:w-auto" variant="outline" disabled={busyID === item.id} onClick={() => void reject(item)}>
                              <XCircle className="size-4" />
                              {t("executionQueue.actions.reject")}
                            </Button>
                          ) : null}
                          {item.status === "failed" && item.publish_job_id ? (
                            <Button size="sm" className="w-full sm:w-auto" disabled={busyID === item.id} onClick={() => void retryPublish(item)}>
                              <Send className="size-4" />
                              {t("executionQueue.actions.retryPublish")}
                            </Button>
                          ) : null}
                          {item.type === "post" && !item.publish_job_id && (item.status === "ready_to_publish" || item.status === "approved") ? (
                            <Button size="sm" className="w-full sm:w-auto" disabled={busyID === item.id} onClick={() => void preparePostPublish(item)}>
                              <Send className="size-4" />
                              {t("executionQueue.actions.preparePublish")}
                            </Button>
                          ) : null}
                          {(item.status === "ready_to_publish" || item.status === "failed") && item.publish_job_id ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full sm:w-auto"
                              disabled={busyID === item.id || !publisherStatus?.manual_publish_enabled || (!publisherStatus?.real_publish_enabled && !publisherStatus?.dry_run)}
                              title={!publisherStatus?.real_publish_enabled && !publisherStatus?.dry_run ? t("executionQueue.actions.realPublishDisabledTip") : ""}
                              onClick={() => void realPublish(item)}
                            >
                              <Send className="size-4" />
                              {publisherStatus?.dry_run ? t("executionQueue.actions.dryRunPublish") : t("executionQueue.actions.realPublish")}
                            </Button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  labelPrefix,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  labelPrefix: string;
}) {
  const { t } = useT();
  return (
    <label className="block space-y-2">
      <span className="text-xs font-medium text-[#71767b]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="form-input h-10 py-0"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {t(`${labelPrefix}.${option}`)}
          </option>
        ))}
      </select>
    </label>
  );
}
