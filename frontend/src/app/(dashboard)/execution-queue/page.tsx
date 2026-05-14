"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Bot, CheckCircle2, Clock, FileText, MessageCircle, Pencil, Send, ShieldAlert, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { automationService } from "@/services/automation.service";
import {
  reviewQueueService,
  type ReviewQueueExecutionMode,
  type ReviewQueueItemApi,
  type ReviewQueueStatus,
  type ReviewQueueType,
} from "@/services/review-queue.service";

type LoadState = "loading" | "ready" | "error";

const typeOptions: ReviewQueueType[] = ["all", "post", "comment", "reply", "dm"];
const statusOptions: ReviewQueueStatus[] = ["all", "draft", "pending_review", "ready_to_publish", "approved", "rejected", "failed"];
const modeOptions: ReviewQueueExecutionMode[] = ["all", "manual", "review", "autopilot"];

function formatDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusTone(status: string) {
  if (status === "ready_to_publish") return "border-emerald-300/25 bg-emerald-500/10 text-emerald-100";
  if (status === "pending_review" || status === "draft") return "border-amber-300/25 bg-amber-500/10 text-amber-100";
  if (status === "approved" || status === "published") return "border-blue-300/25 bg-blue-500/10 text-blue-100";
  if (status === "rejected" || status === "failed") return "border-rose-300/25 bg-rose-500/10 text-rose-100";
  return "border-white/10 bg-white/[0.05] text-white/65";
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

  useEffect(() => {
    const type = new URLSearchParams(window.location.search).get("type") as ReviewQueueType | null;
    if (type && typeOptions.includes(type)) {
      setTypeFilter(type);
    }
  }, []);

  const loadQueue = useCallback(async () => {
    setLoadState("loading");
    try {
      const data = await reviewQueueService.list({
        type: typeFilter,
        status: statusFilter,
        executionMode: modeFilter,
        page: 1,
        pageSize: 50,
      });
      setItems(data.items);
      setStats(data.stats);
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
    if (!editingContent.trim() || (item.type !== "comment" && item.type !== "reply")) return;
    setBusyID(item.id);
    try {
      if (item.type === "comment") {
        const updated = await automationService.updateCommentDraft(item.source_id, editingContent.trim());
        updateLocalItem(item, {
          content: updated.generated_comment || editingContent.trim(),
          status: updated.status === "review" ? "pending_review" : updated.status === "sent" ? "published" : (updated.status as ReviewQueueItemApi["status"]),
        });
      } else {
        const updated = await automationService.updateReplyDraft(item.source_id, editingContent.trim());
        updateLocalItem(item, {
          content: updated.generated_reply || editingContent.trim(),
          status: updated.status === "review" ? "pending_review" : updated.status === "sent" ? "published" : (updated.status as ReviewQueueItemApi["status"]),
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
    if (item.type !== "comment" && item.type !== "reply") return;
    setBusyID(item.id);
    try {
      const updated = item.type === "comment"
        ? await automationService.approveCommentTask(item.source_id)
        : await automationService.approveReplyDraft(item.source_id);
      updateLocalItem(item, { status: updated.status === "review" ? "pending_review" : (updated.status as ReviewQueueItemApi["status"]) });
      pushToast(t("executionQueue.toast.approved"));
      void loadQueue();
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("executionQueue.errors.approve") : t("executionQueue.errors.approve"));
    } finally {
      setBusyID(null);
    }
  };

  const reject = async (item: ReviewQueueItemApi) => {
    if (item.type !== "comment" && item.type !== "reply") return;
    setBusyID(item.id);
    try {
      const updated = item.type === "comment"
        ? await automationService.rejectCommentDraft(item.source_id, "Rejected from execution queue.")
        : await automationService.rejectReplyDraft(item.source_id, "Rejected from execution queue.");
      updateLocalItem(item, { status: updated.status as ReviewQueueItemApi["status"] });
      pushToast(t("executionQueue.toast.rejected"));
      void loadQueue();
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("executionQueue.errors.reject") : t("executionQueue.errors.reject"));
    } finally {
      setBusyID(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-blue-100/75">{t("executionQueue.kicker")}</p>
        <h1 className="mt-2 text-3xl font-semibold text-white">{t("executionQueue.title")}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">{t("executionQueue.subtitle")}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {statCards.map((stat) => (
          <Card key={stat.key} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-white/50">{stat.label}</p>
                <p className="mt-2 text-2xl font-semibold text-white">{stat.value}</p>
              </div>
              <stat.icon className="size-4 text-blue-100/70" />
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="grid gap-3 md:grid-cols-3">
          <FilterSelect label={t("executionQueue.filters.type")} value={typeFilter} onChange={(value) => setTypeFilter(value as ReviewQueueType)} options={typeOptions} labelPrefix="executionQueue.type" />
          <FilterSelect label={t("executionQueue.filters.status")} value={statusFilter} onChange={(value) => setStatusFilter(value as ReviewQueueStatus)} options={statusOptions} labelPrefix="executionQueue.status" />
          <FilterSelect label={t("executionQueue.filters.executionMode")} value={modeFilter} onChange={(value) => setModeFilter(value as ReviewQueueExecutionMode)} options={modeOptions} labelPrefix="executionQueue.executionMode" />
        </div>
      </Card>

      <Card>
        <CardHeader title={t("executionQueue.list.title")} description={t("executionQueue.list.description")} />
        {loadState === "loading" ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-10 text-center text-sm text-white/55">{t("executionQueue.loading")}</div>
        ) : null}
        {loadState === "error" ? (
          <div className="rounded-xl border border-rose-300/20 bg-rose-500/10 px-4 py-10 text-center text-sm text-rose-100">
            {t("executionQueue.errors.load")}
          </div>
        ) : null}
        {loadState === "ready" && items.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-12 text-center">
            <p className="text-sm font-medium text-white">{t("executionQueue.empty.title")}</p>
            <p className="mt-2 text-sm text-white/55">{t("executionQueue.empty.description")}</p>
          </div>
        ) : null}
        {loadState === "ready" && items.length > 0 ? (
          <div className="space-y-3">
            {items.map((item) => {
              const Icon = typeIcon(item.type);
              const itemKey = `${item.type}-${item.id}`;
              const editing = editingKey === itemKey;
              const manageable = item.type === "comment" || item.type === "reply";
              const canReview = manageable && (item.status === "pending_review" || item.status === "draft");
              return (
                <div key={`${item.type}-${item.id}`} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-300/20 bg-blue-500/10 px-2.5 py-1 text-xs text-blue-100">
                          <Icon className="size-3.5" />
                          {t(`executionQueue.type.${item.type}`)}
                        </span>
                        <span className={`rounded-full border px-2.5 py-1 text-xs ${statusTone(item.status)}`}>{t(`executionQueue.status.${item.status}`)}</span>
                        <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs text-white/60">
                          {t(`executionQueue.executionMode.${item.execution_mode}`)}
                        </span>
                        {item.risk_level === "high" ? (
                          <span className="rounded-full border border-amber-300/25 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-100">
                            {t("executionQueue.riskFallback")}
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-4 rounded-xl border border-white/10 bg-black/15 p-3">
                        {editing ? (
                          <textarea
                            value={editingContent}
                            onChange={(event) => setEditingContent(event.target.value)}
                            rows={4}
                            className="w-full resize-y rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm leading-6 text-white outline-none"
                          />
                        ) : (
                          <p className="whitespace-pre-wrap text-sm leading-6 text-white/86">{item.content || "—"}</p>
                        )}
                      </div>

                      <div className="mt-3 grid gap-2 text-xs text-white/55 md:grid-cols-2">
                        <p>{t("executionQueue.item.bot")}: {item.bot_name || (item.bot_id ? `Bot #${item.bot_id}` : "—")}</p>
                        <p>{t("executionQueue.item.account")}: {item.twitter_account_name || `#${item.twitter_account_id}`}</p>
                        <p className="md:col-span-2">{t("executionQueue.item.target")}: {item.target_summary || "—"}</p>
                        <p>{t("executionQueue.item.createdAt")}: {formatDate(item.created_at)}</p>
                        <p>{t("executionQueue.item.risk")}: {item.risk_level || "low"}{item.risk_reasons?.length ? ` · ${item.risk_reasons.join(" / ")}` : ""}</p>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      {item.status === "ready_to_publish" ? (
                        <span className="inline-flex h-8 items-center rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-3 text-xs text-emerald-100">
                          {t("executionQueue.actions.waitingPublish")}
                        </span>
                      ) : null}
                      {editing ? (
                        <>
                          <Button size="sm" disabled={busyID === item.id} onClick={() => void saveEdit(item)}>{t("executionQueue.actions.save")}</Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingKey(null)}>{t("common.cancel")}</Button>
                        </>
                      ) : (
                        <>
                          {manageable ? (
                            <Button
                              size="sm"
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
                            <Button size="sm" disabled={busyID === item.id} onClick={() => void approve(item)}>
                              <CheckCircle2 className="size-4" />
                              {t("executionQueue.actions.approve")}
                            </Button>
                          ) : null}
                          {manageable && item.status !== "rejected" && item.status !== "published" ? (
                            <Button size="sm" variant="outline" disabled={busyID === item.id} onClick={() => void reject(item)}>
                              <XCircle className="size-4" />
                              {t("executionQueue.actions.reject")}
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
      <span className="text-xs font-medium text-white/60">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none"
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
