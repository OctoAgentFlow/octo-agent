"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import axios from "axios";
import { ArrowRight, Bot, CheckCircle2, Clock, FileText, MessageCircle, Pencil, Send, ShieldAlert, Sparkles, XCircle, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { apiErrorCode, apiErrorMessage } from "@/lib/request";
import { formatDateTime, usePreferredTimeZone } from "@/lib/timezone";
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
type ModuleType = "post" | "comment" | "reply" | "dm";

const typeOptions: ReviewQueueType[] = ["all", "post", "comment", "reply", "dm"];
const statusOptions: ReviewQueueStatus[] = ["all", "draft", "pending_review", "ready_to_publish", "processing", "published", "approved", "rejected", "failed"];
const modeOptions: ReviewQueueExecutionMode[] = ["all", "manual", "review", "autopilot"];

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

function sourceTone(type: string) {
  if (type === "post") return "border-[#1d9bf0]/35 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  if (type === "comment") return "border-[#7856ff]/30 bg-[#7856ff]/12 text-[#b8a7ff]";
  if (type === "reply") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
}

function sourceLabelKey(type: string) {
  if (type === "post") return "executionQueue.source.autoPost";
  if (type === "comment") return "executionQueue.source.autoComment";
  if (type === "reply") return "executionQueue.source.autoReply";
  return "executionQueue.source.autoDm";
}

function sourceDescriptionKey(type: string) {
  if (type === "post") return "executionQueue.sourceDesc.post";
  if (type === "comment") return "executionQueue.sourceDesc.comment";
  if (type === "reply") return "executionQueue.sourceDesc.reply";
  return "executionQueue.sourceDesc.dm";
}

function canManualPublish(item: ReviewQueueItemApi) {
  if (!item.publish_job_id) return false;
  if (item.status === "ready_to_publish" || item.status === "failed") return true;
  return item.status === "published" && (item.publish_mode === "simulated" || item.publish_mode === "dry_run");
}

function targetLabelKey(type: string) {
  if (type === "post") return "executionQueue.item.contentSource";
  if (type === "comment") return "executionQueue.item.targetTweet";
  if (type === "reply") return "executionQueue.item.replyTarget";
  return "executionQueue.item.target";
}

function normalizeTargetSummary(type: string, value: string | undefined, t: (key: string, values?: Record<string, string | number>) => string) {
  const summary = (value || "").trim();
  if (!summary) return "—";
  if (type === "post" && summary === "Content Library Item") return t("executionQueue.target.contentLibraryItem");
  if (type === "post" && summary === "Auto Post") return t("executionQueue.target.autoPostPlanner");
  return summary;
}

function publishStatusKey(status?: string) {
  if (!status) return "executionQueue.publishState.notCreated";
  if (status === "pending") return "executionQueue.publishState.pending";
  if (status === "processing") return "executionQueue.publishState.processing";
  if (status === "published") return "executionQueue.publishState.published";
  if (status === "failed") return "executionQueue.publishState.failed";
  if (status === "cancelled") return "executionQueue.publishState.cancelled";
  return "executionQueue.publishState.unknown";
}

function publishTone(status?: string) {
  if (status === "published") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  if (status === "processing") return "border-[#1d9bf0]/35 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  if (status === "failed" || status === "cancelled") return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
  if (status === "pending") return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
  return "border-[#2f3336] bg-[#16181c] text-[#71767b]";
}

function automationPausedToast(t: (key: string, values?: Record<string, string | number>) => string, error: unknown, fallback: string) {
  return apiErrorCode(error) === "automation_module_paused" ? t("automation.pausedNotice.toast") : apiErrorMessage(error) || fallback;
}

function moduleNameKey(type: string) {
  if (type === "post") return "automation.module.post.name";
  if (type === "comment") return "automation.module.comment.name";
  if (type === "reply") return "automation.module.reply.name";
  return "automation.module.dm.name";
}

function normalizedTypeFilter(value: string | null): ReviewQueueType {
  return value && typeOptions.includes(value as ReviewQueueType) ? (value as ReviewQueueType) : "all";
}

function normalizedStatusFilter(value: string | null): ReviewQueueStatus {
  return value && statusOptions.includes(value as ReviewQueueStatus) ? (value as ReviewQueueStatus) : "all";
}

function normalizedModeFilter(value: string | null): ReviewQueueExecutionMode {
  return value && modeOptions.includes(value as ReviewQueueExecutionMode) ? (value as ReviewQueueExecutionMode) : "all";
}

export default function ExecutionQueuePage() {
  const { t } = useT();
  const timeZone = usePreferredTimeZone();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const urlFilters = useMemo(() => {
    const params = new URLSearchParams(searchKey);
    return {
      type: normalizedTypeFilter(params.get("type")),
      status: normalizedStatusFilter(params.get("status")),
      mode: normalizedModeFilter(params.get("mode")),
    };
  }, [searchKey]);
  const { pushToast } = useToast();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [items, setItems] = useState<ReviewQueueItemApi[]>([]);
  const [stats, setStats] = useState({ pending_review: 0, ready_to_publish: 0, approved: 0, rejected: 0, failed: 0 });
  const [typeFilter, setTypeFilter] = useState<ReviewQueueType>(() => urlFilters.type);
  const [statusFilter, setStatusFilter] = useState<ReviewQueueStatus>(() => urlFilters.status);
  const [modeFilter, setModeFilter] = useState<ReviewQueueExecutionMode>(() => urlFilters.mode);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [busyID, setBusyID] = useState<number | null>(null);
  const [publisherStatus, setPublisherStatus] = useState<XPublisherStatusApi | null>(null);
  const loadSeqRef = useRef(0);
  const [moduleEnabled, setModuleEnabled] = useState<Record<ModuleType, boolean>>({
    post: true,
    comment: true,
    reply: true,
    dm: true,
  });

  useEffect(() => {
    setTypeFilter((current) => (current === urlFilters.type ? current : urlFilters.type));
    setStatusFilter((current) => (current === urlFilters.status ? current : urlFilters.status));
    setModeFilter((current) => (current === urlFilters.mode ? current : urlFilters.mode));
  }, [urlFilters.mode, urlFilters.status, urlFilters.type]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (typeFilter !== "all") next.set("type", typeFilter);
    if (statusFilter !== "all") next.set("status", statusFilter);
    if (modeFilter !== "all") next.set("mode", modeFilter);
    const query = next.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    const currentHref = searchKey ? `${pathname}?${searchKey}` : pathname;
    if (href !== currentHref) {
      router.replace(href, { scroll: false });
    }
  }, [modeFilter, pathname, router, searchKey, statusFilter, typeFilter]);

  const loadQueue = useCallback(async () => {
    const seq = loadSeqRef.current + 1;
    loadSeqRef.current = seq;
    setLoadState("loading");
    try {
      const [data, publishingStatus, automationData] = await Promise.all([
        reviewQueueService.list({
          type: typeFilter,
          status: statusFilter,
          executionMode: modeFilter,
          page: 1,
          pageSize: 50,
        }),
        publishingService.status(),
        automationService.list(),
      ]);
      if (loadSeqRef.current !== seq) return;
      setItems(data.items);
      setStats(data.stats);
      setPublisherStatus(publishingStatus);
      setModuleEnabled({
        post: automationData.modules.find((item) => item.type === "post")?.config.enabled ?? true,
        comment: automationData.modules.find((item) => item.type === "comment")?.config.enabled ?? true,
        reply: automationData.modules.find((item) => item.type === "reply")?.config.enabled ?? true,
        dm: automationData.modules.find((item) => item.type === "dm")?.config.enabled ?? true,
      });
      setLoadState("ready");
    } catch (error) {
      if (loadSeqRef.current !== seq) return;
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
  const disabledModuleTypes = useMemo(
    () =>
      (Object.keys(moduleEnabled) as ModuleType[]).filter((type) => {
        if (moduleEnabled[type]) return false;
        return typeFilter === "all" || typeFilter === type;
      }),
    [moduleEnabled, typeFilter]
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
      pushToast(automationPausedToast(t, error, t("executionQueue.errors.approve")));
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
      pushToast(automationPausedToast(t, error, t("executionQueue.errors.retry")));
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
      pushToast(automationPausedToast(t, error, t("executionQueue.errors.preparePublish")));
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
      pushToast(automationPausedToast(t, error, t("executionQueue.errors.realPublish")));
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

      {disabledModuleTypes.length > 0 ? (
        <Card className="border-amber-300/25 bg-amber-500/10 p-4">
          <p className="text-sm font-semibold text-amber-50">{t("executionQueue.pausedNotice.title")}</p>
          <p className="mt-1 text-sm leading-6 text-amber-50/75">
            {t("executionQueue.pausedNotice.description", {
              modules: disabledModuleTypes.map((type) => t(moduleNameKey(type))).join(" / "),
            })}
          </p>
        </Card>
      ) : null}

      <Card className="overflow-hidden bg-[#0f1419] p-0">
        <div className="border-b border-[#2f3336] p-5 md:p-6">
          <CardHeader title={t("executionQueue.list.title")} description={t("executionQueue.list.description")} />
        </div>
        {loadState === "loading" ? (
          <div className="m-5 rounded-2xl border border-[#2f3336] bg-black px-4 py-10 text-center text-sm text-[#71767b]">{t("executionQueue.loading")}</div>
        ) : null}
        {loadState === "error" ? (
          <div className="m-5 rounded-2xl border border-[#f4212e]/25 bg-[#f4212e]/10 px-4 py-10 text-center text-sm text-[#ff8a91]">
            <p>{t("executionQueue.errors.load")}</p>
            <Button className="mt-4" size="sm" variant="outline" onClick={() => void loadQueue()}>
              {t("common.retry")}
            </Button>
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
              const displayTarget = normalizeTargetSummary(item.type, item.target_summary, t);
              const publishStatusLabel = t(publishStatusKey(item.publish_status));
              const modulePaused = moduleEnabled[item.type as ModuleType] === false;
              const modulePausedTip = modulePaused
                ? t("automation.pausedNotice.actionDisabled", { module: t(moduleNameKey(item.type)) })
                : "";
              return (
                <div key={`${item.type}-${item.id}`} className="bg-black p-4 transition-colors hover:bg-[#080808] md:p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${sourceTone(item.type)}`}>
                          <Icon className="size-3.5" />
                          {t(sourceLabelKey(item.type))}
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

                      <div className="mt-4 grid gap-3 lg:grid-cols-3">
                        <QueueInfoCard
                          icon={Sparkles}
                          label={t("executionQueue.item.source")}
                          title={t(sourceLabelKey(item.type))}
                          description={t(sourceDescriptionKey(item.type))}
                          tone={sourceTone(item.type)}
                        />
                        <QueueInfoCard
                          icon={ShieldAlert}
                          label={t("executionQueue.item.executionPath")}
                          title={t(`executionQueue.executionMode.${item.execution_mode}`)}
                          description={t(`executionQueue.executionPath.${item.execution_mode}`)}
                          tone={statusTone(item.status)}
                        />
                        <QueueInfoCard
                          icon={Send}
                          label={t("executionQueue.item.publishState")}
                          title={publishStatusLabel}
                          description={item.publish_job_id ? t("executionQueue.publishState.withJob", { id: item.publish_job_id }) : t("executionQueue.publishState.withoutJob")}
                          tone={publishTone(item.publish_status)}
                        />
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

                      {modulePaused ? (
                        <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100/80">
                          {modulePausedTip}
                        </p>
                      ) : null}

                      <div className="mt-3 grid gap-2 text-xs text-[#71767b] md:grid-cols-2">
                        <MetaLine label={t("executionQueue.item.bot")} value={item.bot_name || (item.bot_id ? t("executionQueue.item.botFallback", { id: item.bot_id }) : "—")} />
                        <MetaLine label={t("executionQueue.item.account")} value={item.twitter_account_name || `#${item.twitter_account_id}`} />
                        <MetaLine className="md:col-span-2" label={t(targetLabelKey(item.type))} value={displayTarget} />
                        <MetaLine label={t("executionQueue.item.createdAt")} value={formatDateTime(item.created_at, timeZone)} />
                        <MetaLine
                          label={t("executionQueue.item.risk")}
                          value={`${item.risk_level ? t(`executionQueue.riskLevel.${item.risk_level}`) : t("executionQueue.riskLevel.low")}${item.risk_reasons?.length ? ` · ${item.risk_reasons.join(" / ")}` : ""}`}
                        />
                        {item.publish_job_id ? (
                          <MetaLine
                            className="md:col-span-2"
                            label={t("executionQueue.item.publishJob")}
                            value={[
                              `#${item.publish_job_id}`,
                              item.publish_status ? t(`executionQueue.publishStatus.${item.publish_status}`) : "",
                              item.publish_mode ? t(`executionQueue.publishMode.${item.publish_mode}`) : "",
                              item.publish_last_error || "",
                            ].filter(Boolean).join(" · ")}
                          />
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
                          {item.publish_job_id ? t("executionQueue.actions.inPublishQueue") : t("executionQueue.actions.readyForPublishJob")}
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
                            <Button
                              size="sm"
                              className="w-full sm:w-auto"
                              disabled={busyID === item.id || modulePaused}
                              title={modulePausedTip}
                              onClick={() => void approve(item)}
                            >
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
                            <Button
                              size="sm"
                              className="w-full sm:w-auto"
                              disabled={busyID === item.id || modulePaused}
                              title={modulePausedTip}
                              onClick={() => void retryPublish(item)}
                            >
                              <Send className="size-4" />
                              {t("executionQueue.actions.retryPublish")}
                            </Button>
                          ) : null}
                          {item.type === "post" && !item.publish_job_id && (item.status === "ready_to_publish" || item.status === "approved") ? (
                            <Button
                              size="sm"
                              className="w-full sm:w-auto"
                              disabled={busyID === item.id || modulePaused}
                              title={modulePausedTip}
                              onClick={() => void preparePostPublish(item)}
                            >
                              <Send className="size-4" />
                              {t("executionQueue.actions.preparePublish")}
                            </Button>
                          ) : null}
                          {canManualPublish(item) ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full sm:w-auto"
                              disabled={busyID === item.id || modulePaused || !publisherStatus?.manual_publish_enabled || (!publisherStatus?.real_publish_enabled && !publisherStatus?.dry_run)}
                              title={modulePaused ? modulePausedTip : !publisherStatus?.real_publish_enabled && !publisherStatus?.dry_run ? t("executionQueue.actions.realPublishDisabledTip") : ""}
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

function QueueInfoCard({
  icon: Icon,
  label,
  title,
  description,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  title: string;
  description: string;
  tone: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className={`inline-flex size-9 shrink-0 items-center justify-center rounded-2xl border ${tone}`}>
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#71767b]">{label}</p>
          <p className="mt-1 truncate text-sm font-semibold text-white">{title}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#71767b]">{description}</p>
        </div>
      </div>
    </div>
  );
}

function MetaLine({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <p className={`min-w-0 break-words [overflow-wrap:anywhere] ${className}`}>
      <span className="text-[#71767b]">{label}</span>
      <ArrowRight className="mx-1.5 inline size-3 text-[#2f3336]" />
      <span className="text-[#aeb4bb]">{value || "—"}</span>
    </p>
  );
}
