"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, Copy, ExternalLink, Inbox, MessageCircle, Reply, Search, Send, ShieldAlert, Sparkles, Target, ThumbsDown, ThumbsUp, XCircle, type LucideIcon } from "lucide-react";
import axios from "axios";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { broadcastPageRefreshComplete, subscribePageRefreshRequest } from "@/lib/app-page-refresh";
import { apiErrorCode, apiErrorMessage } from "@/lib/request";
import { formatDateTime, usePreferredTimeZone } from "@/lib/timezone";
import {
  automationService,
  type AutoCommentTargetApi,
  type AutoCommentTaskApi,
  type AutoReplyDraftApi,
} from "@/services/automation.service";

type LoadState = "loading" | "ready" | "error";
type OpportunityKind = "comment" | "reply" | "target";
type OpportunityFilter = "all" | OpportunityKind;
type OpportunityUrgency = "all" | "actionable" | "high_score" | "risky";

type OpportunityItem = {
  id: string;
  kind: OpportunityKind;
  sourceID: number;
  title: string;
  target: string;
  targetURL?: string;
  body: string;
  generated?: string;
  reason: string;
  actionKey: string;
  score: number;
  status: string;
  riskLevel: string;
  createdAt?: string;
  meta: string[];
  queueHref: string;
};

type FeedbackDraft = {
  rating: "positive" | "negative" | "";
  issueTag: string;
  comment: string;
};

const kindOptions: OpportunityFilter[] = ["all", "comment", "reply", "target"];
const urgencyOptions: OpportunityUrgency[] = ["all", "actionable", "high_score", "risky"];
const actionableStatuses = new Set(["draft", "review", "pending_review", "approved", "ready_to_publish", "failed"]);
const feedbackIssueTags = ["irrelevant", "too_salesy", "wrong_tone", "weak_context"];
const kindIcons: Record<OpportunityKind, LucideIcon> = {
  comment: MessageCircle,
  reply: Reply,
  target: Target,
};

function normalizedKindFilter(value: string | null): OpportunityFilter {
  return value && kindOptions.includes(value as OpportunityFilter) ? (value as OpportunityFilter) : "all";
}

function normalizedUrgencyFilter(value: string | null): OpportunityUrgency {
  return value && urgencyOptions.includes(value as OpportunityUrgency) ? (value as OpportunityUrgency) : "all";
}

function normalizeQueueStatus(status: string) {
  if (status === "review") return "pending_review";
  if (["draft", "pending_review", "approved", "ready_to_publish", "processing", "published", "rejected", "failed"].includes(status)) return status;
  return "all";
}

function queueFocusHref(kind: "comment" | "reply", sourceID: number, status: string) {
  const params = new URLSearchParams({ type: kind, focus_type: kind, focus_source_id: String(sourceID) });
  if (status !== "all") params.set("status", status);
  return `/execution-queue?${params.toString()}`;
}

function kindTone(kind: OpportunityKind) {
  if (kind === "comment") return "border-[#7856ff]/30 bg-[#7856ff]/12 text-[#b8a7ff]";
  if (kind === "reply") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  return "border-[#1d9bf0]/35 bg-[#1d9bf0]/10 text-[#8ecdf8]";
}

function riskTone(risk: string) {
  if (risk === "high") return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
  if (risk === "medium") return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
  return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
}

function scoreTone(score: number) {
  if (score >= 80) return "text-[#7ee0b5]";
  if (score >= 55) return "text-[#f6d96b]";
  return "text-[#8b98a5]";
}

function commentActionKey(item: AutoCommentTaskApi) {
  if (item.delivery_mode === "quote_post") return "opportunities.action.quotePost";
  if (item.delivery_mode === "manual_comment") return "opportunities.action.manualComment";
  if (item.delivery_mode === "skip") return "opportunities.action.skip";
  return "opportunities.action.comment";
}

function commentToOpportunity(item: AutoCommentTaskApi): OpportunityItem {
  const status = normalizeQueueStatus(item.status);
  return {
    id: `comment-${item.id}`,
    kind: "comment",
    sourceID: item.id,
    title: item.target_username ? `@${item.target_username}` : item.target_tweet_author || "Auto Comment",
    target: item.target_tweet_author || item.target_username || "",
    targetURL: item.manual_action_url || (item.target_tweet_id ? `https://x.com/i/web/status/${item.target_tweet_id}` : undefined),
    body: item.target_tweet_text || "",
    generated: item.generated_comment || item.quote_post_candidate || "",
    reason: item.generation_reason || item.delivery_reason || "",
    actionKey: commentActionKey(item),
    score: Math.max(0, Math.min(100, Math.round(item.opportunity_score || 0))),
    status,
    riskLevel: item.risk_level || "low",
    createdAt: item.generated_at || item.detected_at,
    meta: [item.delivery_mode || "", item.matched_keywords?.length ? item.matched_keywords.join(", ") : ""].filter(Boolean),
    queueHref: queueFocusHref("comment", item.id, status),
  };
}

function replyToOpportunity(item: AutoReplyDraftApi): OpportunityItem {
  const status = normalizeQueueStatus(item.status);
  const score = item.risk_level === "high" ? 45 : item.status === "ready_to_publish" || item.status === "approved" ? 82 : 68;
  return {
    id: `reply-${item.id}`,
    kind: "reply",
    sourceID: item.id,
    title: item.comment_author_handle || "Auto Reply",
    target: item.comment_author_handle,
    targetURL: item.comment_url,
    body: item.comment_text || item.root_tweet_text || "",
    generated: item.generated_reply || "",
    reason: item.root_tweet_text ? "opportunities.reason.replyWithRoot" : "opportunities.reason.replyDefault",
    actionKey: "opportunities.action.reply",
    score,
    status,
    riskLevel: item.risk_level || "low",
    createdAt: item.generated_at || item.created_at,
    meta: [item.comment_tweet_id ? `tweet ${item.comment_tweet_id}` : ""].filter(Boolean),
    queueHref: queueFocusHref("reply", item.id, status),
  };
}

function targetToOpportunity(item: AutoCommentTargetApi): OpportunityItem {
  const score = Math.max(20, Math.min(95, item.priority * 18 + (item.status === "active" ? 10 : 0)));
  return {
    id: `target-${item.id}`,
    kind: "target",
    sourceID: item.id,
    title: item.target_display_name || `@${item.target_username}`,
    target: item.target_username,
    targetURL: item.target_tweet_url || (item.target_username ? `https://x.com/${item.target_username}` : undefined),
    body: item.target_text || item.notes || "",
    reason: item.last_failure_reason || "opportunities.reason.targetDefault",
    actionKey: "opportunities.action.watchTarget",
    score,
    status: item.status,
    riskLevel: item.last_failure_reason ? "medium" : "low",
    createdAt: item.last_seen_tweet_at || item.last_checked_at,
    meta: [item.target_category, item.last_checked_at ? "checked" : ""].filter(Boolean),
    queueHref: "/auto-comments",
  };
}

export default function OpportunitiesPage() {
  const { t } = useT();
  const timeZone = usePreferredTimeZone();
  const { pushToast } = useToast();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const urlFilters = useMemo(() => {
    const params = new URLSearchParams(searchKey);
    return {
      kind: normalizedKindFilter(params.get("kind")),
      urgency: normalizedUrgencyFilter(params.get("urgency")),
    };
  }, [searchKey]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [items, setItems] = useState<OpportunityItem[]>([]);
  const [kindFilter, setKindFilter] = useState<OpportunityFilter>(() => urlFilters.kind);
  const [urgencyFilter, setUrgencyFilter] = useState<OpportunityUrgency>(() => urlFilters.urgency);
  const [busyKey, setBusyKey] = useState("");
  const [selectedItem, setSelectedItem] = useState<OpportunityItem | null>(null);
  const [feedbackByItem, setFeedbackByItem] = useState<Record<string, string>>({});
  const [feedbackDraft, setFeedbackDraft] = useState<FeedbackDraft>({ rating: "", issueTag: "", comment: "" });
  const [detailsDraftContent, setDetailsDraftContent] = useState("");

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const [commentData, replyData, targetData] = await Promise.all([
        automationService.commentDrafts({ pageSize: 200 }),
        automationService.replyDrafts(),
        automationService.commentTargets(),
      ]);
      const next = [
        ...commentData.items.map(commentToOpportunity),
        ...replyData.items.map(replyToOpportunity),
        ...targetData.items.slice(0, 24).map(targetToOpportunity),
      ].sort((a, b) => {
        const scoreDelta = b.score - a.score;
        if (Math.abs(scoreDelta) > 12) return scoreDelta;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });
      setItems(next);
      setLoadState("ready");
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("opportunities.errors.load") : t("opportunities.errors.load"));
      setLoadState("error");
    }
  }, [pushToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setKindFilter((current) => (current === urlFilters.kind ? current : urlFilters.kind));
    setUrgencyFilter((current) => (current === urlFilters.urgency ? current : urlFilters.urgency));
  }, [urlFilters.kind, urlFilters.urgency]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (kindFilter !== "all") next.set("kind", kindFilter);
    if (urgencyFilter !== "all") next.set("urgency", urgencyFilter);
    const query = next.toString();
    const href = query ? `${pathname}?${query}` : pathname;
    const currentHref = searchKey ? `${pathname}?${searchKey}` : pathname;
    if (href !== currentHref) {
      router.replace(href, { scroll: false });
    }
  }, [kindFilter, pathname, router, searchKey, urgencyFilter]);

  useEffect(() => {
    return subscribePageRefreshRequest(() => {
      void (async () => {
        try {
          await load();
        } finally {
          broadcastPageRefreshComplete();
        }
      })();
    });
  }, [load]);

  const filteredItems = useMemo(
    () =>
      items
        .filter((item) => kindFilter === "all" || item.kind === kindFilter)
        .filter((item) => {
          if (urgencyFilter === "all") return true;
          if (urgencyFilter === "actionable") return actionableStatuses.has(item.status);
          if (urgencyFilter === "high_score") return item.score >= 75;
          return item.riskLevel === "high" || item.riskLevel === "medium";
        }),
    [items, kindFilter, urgencyFilter]
  );

  const stats = useMemo(() => {
    const actionable = items.filter((item) => actionableStatuses.has(item.status)).length;
    const highScore = items.filter((item) => item.score >= 75).length;
    const risky = items.filter((item) => item.riskLevel === "high" || item.riskLevel === "medium").length;
    const generated = items.filter((item) => item.generated?.trim()).length;
    const ready = items.filter((item) => item.status === "approved" || item.status === "ready_to_publish").length;
    const published = items.filter((item) => item.status === "published" || item.status === "sent" || item.status === "handled").length;
    const average = items.length ? Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length) : 0;
    return { actionable, highScore, risky, average, generated, ready, published };
  }, [items]);

  const todayPlan = useMemo(() => {
    const topHighScore = items.filter((item) => item.score >= 75).slice(0, 3);
    const risky = items.filter((item) => item.riskLevel === "high" || item.riskLevel === "medium").slice(0, 2);
    const reviewable = items.filter((item) => item.kind !== "target" && actionableStatuses.has(item.status)).slice(0, 3);
    return { topHighScore, risky, reviewable };
  }, [items]);

  const command = useMemo(() => {
    const risky = items.filter((item) => item.riskLevel === "high" || item.riskLevel === "medium").length;
    const actionable = items.filter((item) => item.kind !== "target" && actionableStatuses.has(item.status)).length;
    const highScore = items.filter((item) => item.score >= 75).length;
    const targets = items.filter((item) => item.kind === "target").length;
    if (risky > 0) return { key: "risk", count: risky, href: "/opportunities?urgency=risky", icon: ShieldAlert, tone: "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]" };
    if (actionable > 0) return { key: "review", count: actionable, href: "/opportunities?urgency=actionable", icon: CheckCircle2, tone: "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]" };
    if (highScore > 0) return { key: "growth", count: highScore, href: "/opportunities?urgency=high_score", icon: Sparkles, tone: "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" };
    return { key: "seed", count: targets, href: "/auto-comments", icon: Target, tone: "border-[#2f3336] bg-black text-[#8b98a5]" };
  }, [items]);

  const approve = async (item: OpportunityItem) => {
    if (item.kind === "target") return;
    setBusyKey(item.id);
    try {
      if (item.kind === "comment") {
        await automationService.approveCommentTask(item.sourceID);
      } else {
        await automationService.approveReplyDraft(item.sourceID);
      }
      pushToast(t("opportunities.toast.approved"));
      await load();
    } catch (error) {
      pushToast(apiErrorCode(error) === "automation_module_paused" ? t("automation.pausedNotice.toast") : apiErrorMessage(error) || t("opportunities.errors.approve"));
    } finally {
      setBusyKey("");
    }
  };

  const reject = async (item: OpportunityItem) => {
    if (item.kind === "target") return;
    setBusyKey(item.id);
    try {
      if (item.kind === "comment") {
        await automationService.rejectCommentDraft(item.sourceID, t("opportunities.rejectReason"));
      } else {
        await automationService.rejectReplyDraft(item.sourceID, t("opportunities.rejectReason"));
      }
      pushToast(t("opportunities.toast.rejected"));
      await load();
    } catch (error) {
      pushToast(apiErrorMessage(error) || t("opportunities.errors.reject"));
    } finally {
      setBusyKey("");
    }
  };

  const markHandled = async (item: OpportunityItem) => {
    if (item.kind !== "comment") return;
    setBusyKey(item.id);
    try {
      await automationService.markCommentHandled(item.sourceID);
      pushToast(t("opportunities.toast.handled"));
      await load();
    } catch (error) {
      pushToast(apiErrorMessage(error) || t("opportunities.errors.handled"));
    } finally {
      setBusyKey("");
    }
  };

  const quickGenerate = async (item: OpportunityItem) => {
    if (item.kind === "comment") return;
    setBusyKey(item.id);
    try {
      if (item.kind === "target") {
        await automationService.generateCommentDraft(item.sourceID);
        pushToast(t("opportunities.toast.generated"));
      } else {
        await automationService.retryReplyDraft(item.sourceID);
        pushToast(t("opportunities.toast.regenerated"));
      }
      await load();
    } catch (error) {
      pushToast(apiErrorMessage(error) || t("opportunities.errors.generate"));
    } finally {
      setBusyKey("");
    }
  };

  const openDetails = (item: OpportunityItem) => {
    setSelectedItem(item);
    setFeedbackDraft({ rating: "", issueTag: "", comment: "" });
    setDetailsDraftContent(item.generated || "");
  };

  const saveAndApprove = async () => {
    if (!selectedItem || selectedItem.kind === "target" || !detailsDraftContent.trim()) return;
    setBusyKey(selectedItem.id);
    try {
      if (selectedItem.kind === "comment") {
        await automationService.updateCommentDraft(selectedItem.sourceID, detailsDraftContent.trim());
        await automationService.approveCommentTask(selectedItem.sourceID);
      } else {
        await automationService.updateReplyDraft(selectedItem.sourceID, detailsDraftContent.trim());
        await automationService.approveReplyDraft(selectedItem.sourceID);
      }
      pushToast(t("opportunities.toast.savedAndApproved"));
      setSelectedItem(null);
      await load();
    } catch (error) {
      pushToast(apiErrorCode(error) === "automation_module_paused" ? t("automation.pausedNotice.toast") : apiErrorMessage(error) || t("opportunities.errors.saveAndApprove"));
    } finally {
      setBusyKey("");
    }
  };

  const submitFeedback = async () => {
    if (!selectedItem || !feedbackDraft.rating) return;
    setBusyKey(selectedItem.id);
    try {
      if (selectedItem.kind === "comment") {
        await automationService.createCommentFeedback(selectedItem.sourceID, {
          rating: feedbackDraft.rating,
          issue_tags: feedbackDraft.issueTag ? [feedbackDraft.issueTag] : [],
          comment: feedbackDraft.comment || t(`opportunities.feedback.comment.${feedbackDraft.rating}`),
        });
      }
      setFeedbackByItem((prev) => ({ ...prev, [selectedItem.id]: feedbackDraft.rating }));
      pushToast(t("opportunities.toast.feedbackSaved"));
      setFeedbackDraft({ rating: "", issueTag: "", comment: "" });
    } catch (error) {
      pushToast(apiErrorMessage(error) || t("opportunities.errors.feedback"));
    } finally {
      setBusyKey("");
    }
  };

  const copyGenerated = async (item: OpportunityItem) => {
    if (!item.generated) return;
    await navigator.clipboard.writeText(item.generated);
    pushToast(t("opportunities.toast.copied"));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-[#1d9bf0]">{t("opportunities.kicker")}</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">{t("opportunities.title")}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#71767b]">{t("opportunities.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/auto-comments" className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[#2f3336] px-4 text-sm font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
            <Target className="size-4" />
            {t("opportunities.actions.manageTargets")}
          </Link>
          <Link href="/execution-queue" className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#1d9bf0] px-4 text-sm font-semibold text-white hover:bg-[#1a8cd8]">
            <Inbox className="size-4" />
            {t("opportunities.actions.openQueue")}
          </Link>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric icon={Sparkles} label={t("opportunities.stats.average")} value={String(stats.average)} />
        <Metric icon={CheckCircle2} label={t("opportunities.stats.actionable")} value={String(stats.actionable)} />
        <Metric icon={Search} label={t("opportunities.stats.highScore")} value={String(stats.highScore)} />
        <Metric icon={ShieldAlert} label={t("opportunities.stats.risky")} value={String(stats.risky)} />
      </div>

      <GrowthPublishPathCard stats={stats} />

      <OpportunityCommandCard command={command} />

      <TodayPlanCard
        plan={todayPlan}
        onSelect={openDetails}
      />

      <Card className="bg-[#0f1419]">
        <div className="grid gap-3 md:grid-cols-2">
          <FilterSelect label={t("opportunities.filters.kind")} value={kindFilter} options={kindOptions} labelPrefix="opportunities.kind" onChange={(value) => setKindFilter(value as OpportunityFilter)} />
          <FilterSelect label={t("opportunities.filters.urgency")} value={urgencyFilter} options={urgencyOptions} labelPrefix="opportunities.urgency" onChange={(value) => setUrgencyFilter(value as OpportunityUrgency)} />
        </div>
      </Card>

      <Card className="overflow-hidden bg-[#0f1419] p-0">
        <div className="border-b border-[#2f3336] p-5 md:p-6">
          <CardHeader title={t("opportunities.list.title")} description={t("opportunities.list.description")} />
        </div>
        {loadState === "loading" ? (
          <div className="m-5 rounded-2xl border border-[#2f3336] bg-black px-4 py-10 text-center text-sm text-[#71767b]">{t("opportunities.loading")}</div>
        ) : null}
        {loadState === "error" ? (
          <div className="m-5 rounded-2xl border border-[#f4212e]/25 bg-[#f4212e]/10 px-4 py-10 text-center text-sm text-[#ff8a91]">
            <p>{t("opportunities.errors.load")}</p>
            <Button className="mt-4" size="sm" variant="outline" onClick={() => void load()}>{t("common.retry")}</Button>
          </div>
        ) : null}
        {loadState === "ready" && filteredItems.length === 0 ? (
          <div className="m-5 rounded-2xl border border-[#2f3336] bg-black px-4 py-12 text-center">
            <p className="text-sm font-medium text-white">{t("opportunities.empty.title")}</p>
            <p className="mt-2 text-sm text-[#71767b]">{t("opportunities.empty.description")}</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Link href="/auto-comments" className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-[#1d9bf0] px-3 text-sm font-semibold text-white transition hover:bg-[#1a8cd8]">
                <Target className="size-4" />
                {t("opportunities.empty.addTargets")}
              </Link>
              <Link href="/auto-replies" className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-[#2f3336] px-3 text-sm font-semibold text-[#e7e9ea] transition hover:bg-[#16181c]">
                <Reply className="size-4" />
                {t("opportunities.empty.configureReplies")}
              </Link>
              <Link href="/execution-queue" className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-[#2f3336] px-3 text-sm font-semibold text-[#e7e9ea] transition hover:bg-[#16181c]">
                <Inbox className="size-4" />
                {t("opportunities.empty.openQueue")}
              </Link>
            </div>
          </div>
        ) : null}
        {loadState === "ready" && filteredItems.length > 0 ? (
          <div className="divide-y divide-[#2f3336]">
            {filteredItems.map((item) => (
              <OpportunityRow
                key={item.id}
                item={item}
                busy={busyKey === item.id}
                timeZone={timeZone}
                feedback={feedbackByItem[item.id]}
                onOpenDetails={() => openDetails(item)}
                onApprove={() => void approve(item)}
                onReject={() => void reject(item)}
                onHandled={() => void markHandled(item)}
              />
            ))}
          </div>
        ) : null}
      </Card>

      <OpportunityDetailsDialog
        item={selectedItem}
        busy={selectedItem ? busyKey === selectedItem.id : false}
        feedback={selectedItem ? feedbackByItem[selectedItem.id] : undefined}
        draft={feedbackDraft}
        draftContent={detailsDraftContent}
        timeZone={timeZone}
        onDraftChange={setFeedbackDraft}
        onDraftContentChange={setDetailsDraftContent}
        onClose={() => setSelectedItem(null)}
        onCopy={() => selectedItem ? void copyGenerated(selectedItem) : undefined}
        onFeedback={() => void submitFeedback()}
        onSaveAndApprove={() => void saveAndApprove()}
        onQuickGenerate={() => selectedItem ? void quickGenerate(selectedItem) : undefined}
        onApprove={() => selectedItem ? void approve(selectedItem) : undefined}
        onReject={() => selectedItem ? void reject(selectedItem) : undefined}
        onHandled={() => selectedItem ? void markHandled(selectedItem) : undefined}
      />
    </div>
  );
}

function TodayPlanCard({ plan, onSelect }: { plan: { topHighScore: OpportunityItem[]; risky: OpportunityItem[]; reviewable: OpportunityItem[] }; onSelect: (item: OpportunityItem) => void }) {
  const { t } = useT();
  const groups = [
    { key: "highScore", items: plan.topHighScore },
    { key: "reviewable", items: plan.reviewable },
    { key: "risky", items: plan.risky },
  ];
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <CardHeader title={t("opportunities.today.title")} description={t("opportunities.today.description")} />
        <Link href="/execution-queue" className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-[#2f3336] px-3 text-sm font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
          <Inbox className="size-4" />
          {t("opportunities.actions.openQueue")}
        </Link>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {groups.map((group) => (
          <div key={group.key} className="rounded-2xl border border-[#2f3336] bg-black p-3">
            <p className="text-xs font-semibold text-[#e7e9ea]">{t(`opportunities.today.${group.key}`)}</p>
            <div className="mt-3 space-y-2">
              {group.items.length ? group.items.map((item) => (
                <button key={`${group.key}-${item.id}`} type="button" className="w-full rounded-xl border border-[#2f3336] bg-[#0f1419] p-3 text-left hover:border-[#1d9bf0]/60" onClick={() => onSelect(item)}>
                  <span className="flex items-center justify-between gap-2 text-xs text-[#71767b]">
                    <span>{t(`opportunities.kind.${item.kind}`)}</span>
                    <span className={scoreTone(item.score)}>{item.score}</span>
                  </span>
                  <span className="mt-1 block truncate text-sm font-medium text-white">{item.title}</span>
                </button>
              )) : (
                <p className="rounded-xl border border-dashed border-[#2f3336] px-3 py-5 text-center text-xs text-[#71767b]">{t("opportunities.today.empty")}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function OpportunityCommandCard({
  command,
}: {
  command: { key: string; count: number; href: string; icon: LucideIcon; tone: string };
}) {
  const { t } = useT();
  return (
    <Card className="border-[#2f3336] bg-[#0f1419] p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className={`grid size-10 shrink-0 place-items-center rounded-full border ${command.tone}`}>
            <command.icon className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#e7e9ea]">{t("opportunities.command.title")}</p>
            <p className="mt-1 text-sm font-semibold text-[#d7ebff]">{t(`opportunities.command.${command.key}.title`, { count: command.count })}</p>
            <p className="mt-1 text-xs leading-5 text-[#71767b]">{t(`opportunities.command.${command.key}.description`)}</p>
          </div>
        </div>
        <Link href={command.href} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-[#1d9bf0] px-4 text-sm font-semibold text-white transition hover:bg-[#1a8cd8]">
          {t(`opportunities.command.${command.key}.cta`)}
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </Card>
  );
}

function GrowthPublishPathCard({ stats }: { stats: { highScore: number; generated: number; actionable: number; ready: number; published: number } }) {
  const { t } = useT();
  const steps = [
    {
      key: "discover",
      value: stats.highScore,
      href: "/opportunities?urgency=high_score",
      icon: Search,
    },
    {
      key: "draft",
      value: stats.generated,
      href: "/opportunities?urgency=actionable",
      icon: Sparkles,
    },
    {
      key: "review",
      value: stats.actionable,
      href: "/execution-queue?status=pending_review",
      icon: CheckCircle2,
    },
    {
      key: "publish",
      value: stats.ready + stats.published,
      href: "/execution-queue?status=ready_to_publish",
      icon: Send,
    },
  ];
  return (
    <Card className="border-[#1d9bf0]/20 bg-[#06111d] p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#d7ebff]">{t("opportunities.publishPath.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("opportunities.publishPath.description")}</p>
        </div>
        <Link href="/execution-queue?status=pending_review" className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full bg-[#1d9bf0] px-3 text-sm font-semibold text-white hover:bg-[#1a8cd8]">
          {t("opportunities.publishPath.cta")}
          <ArrowRight className="size-4" />
        </Link>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-4">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <Link key={step.key} href={step.href} className="group rounded-xl border border-[#1d9bf0]/15 bg-black/35 p-3 transition hover:border-[#1d9bf0]/45">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex size-8 items-center justify-center rounded-full border border-[#1d9bf0]/20 bg-[#1d9bf0]/10 text-[#8ecdf8]">
                  <Icon className="size-4" />
                </span>
                <span className="text-xs text-[#71767b]">{index + 1}</span>
              </div>
              <p className="mt-3 text-xl font-semibold text-white">{step.value}</p>
              <p className="mt-1 text-xs font-semibold text-[#d7ebff]">{t(`opportunities.publishPath.${step.key}.title`)}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#71767b]">{t(`opportunities.publishPath.${step.key}.description`)}</p>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <Card className="bg-[#0f1419] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-[#71767b]">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
        </div>
        <Icon className="size-4 text-[#1d9bf0]" />
      </div>
    </Card>
  );
}

function FilterSelect({ label, value, options, labelPrefix, onChange }: { label: string; value: string; options: string[]; labelPrefix: string; onChange: (value: string) => void }) {
  const { t } = useT();
  return (
    <label className="block space-y-2">
      <span className="text-xs font-medium text-[#71767b]">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="form-input h-10 py-0">
        {options.map((option) => (
          <option key={option} value={option}>{t(`${labelPrefix}.${option}`)}</option>
        ))}
      </select>
    </label>
  );
}

function OpportunityRow({
  item,
  busy,
  timeZone,
  feedback,
  onOpenDetails,
  onApprove,
  onReject,
  onHandled,
}: {
  item: OpportunityItem;
  busy: boolean;
  timeZone: string;
  feedback?: string;
  onOpenDetails: () => void;
  onApprove: () => void;
  onReject: () => void;
  onHandled: () => void;
}) {
  const { t } = useT();
  const Icon = kindIcons[item.kind];
  const canReview = item.kind !== "target" && (item.status === "draft" || item.status === "pending_review" || item.status === "review");
  return (
    <div className="bg-black p-4 transition-colors hover:bg-[#080808] md:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${kindTone(item.kind)}`}>
              <Icon className="size-3.5" />
              {t(`opportunities.kind.${item.kind}`)}
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-xs ${riskTone(item.riskLevel)}`}>{t(`opportunities.risk.${item.riskLevel === "high" || item.riskLevel === "medium" ? item.riskLevel : "low"}`)}</span>
            <span className="rounded-full border border-[#2f3336] bg-[#16181c] px-2.5 py-1 text-xs text-[#8b98a5]">{item.status}</span>
            {feedback ? <span className="rounded-full border border-[#1d9bf0]/30 bg-[#1d9bf0]/10 px-2.5 py-1 text-xs text-[#8ecdf8]">{t(`opportunities.feedback.${feedback}`)}</span> : null}
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px]">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">{item.title}</p>
              <p className="mt-1 text-xs leading-5 text-[#71767b]">
                {t("opportunities.item.recommended")} <span className="text-[#d7ebff]">{t(item.actionKey)}</span>
              </p>
              <p className="mt-2 line-clamp-3 break-words text-sm leading-6 text-[#cfd9e2]">{item.body || item.reason || "—"}</p>
            </div>
            <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3">
              <p className="text-xs text-[#71767b]">{t("opportunities.item.score")}</p>
              <p className={`mt-1 text-3xl font-semibold ${scoreTone(item.score)}`}>{item.score}</p>
              <p className="mt-2 text-xs leading-5 text-[#71767b]">{item.createdAt ? formatDateTime(item.createdAt, timeZone) : "—"}</p>
            </div>
          </div>

          {item.generated ? (
            <div className="mt-3 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3">
              <p className="mb-1 text-xs font-medium text-[#8ecdf8]">{t("opportunities.item.generated")}</p>
              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[#e7e9ea] [overflow-wrap:anywhere]">{item.generated}</p>
            </div>
          ) : null}

          <div className="mt-3 grid gap-2 text-xs text-[#71767b] md:grid-cols-2">
            <MetaLine label={t("opportunities.item.reason")} value={item.reason.startsWith("opportunities.") ? t(item.reason) : item.reason || t("opportunities.reason.default")} />
            <MetaLine label={t("opportunities.item.target")} value={item.target || "—"} />
            {item.meta.length ? <MetaLine className="md:col-span-2" label={t("opportunities.item.context")} value={item.meta.join(" · ")} /> : null}
          </div>
        </div>

        <div className="grid shrink-0 gap-2 sm:flex sm:flex-wrap xl:max-w-[300px] xl:justify-end">
          <Button size="sm" variant="outline" onClick={onOpenDetails}>
            <Search className="size-4" />
            {t("opportunities.actions.details")}
          </Button>
          <Link href={item.queueHref} className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-[#2f3336] px-3 text-sm font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
            <ArrowRight className="size-4" />
            {t("opportunities.actions.inspect")}
          </Link>
          {item.targetURL ? (
            <a href={item.targetURL} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-[#2f3336] px-3 text-sm font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
              <ExternalLink className="size-4" />
              {t("opportunities.actions.openTarget")}
            </a>
          ) : null}
          {canReview ? (
            <Button size="sm" disabled={busy} onClick={onApprove}>
              <CheckCircle2 className="size-4" />
              {t("opportunities.actions.approve")}
            </Button>
          ) : null}
          {item.kind === "comment" && item.status !== "handled" && item.status !== "published" && item.status !== "sent" ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={onHandled}>
              <CheckCircle2 className="size-4" />
              {t("opportunities.actions.handled")}
            </Button>
          ) : null}
          {item.kind !== "target" && item.status !== "rejected" && item.status !== "published" && item.status !== "sent" ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={onReject}>
              <XCircle className="size-4" />
              {t("opportunities.actions.reject")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function OpportunityDetailsDialog({
  item,
  busy,
  feedback,
  draft,
  draftContent,
  timeZone,
  onDraftChange,
  onDraftContentChange,
  onClose,
  onCopy,
  onFeedback,
  onSaveAndApprove,
  onQuickGenerate,
  onApprove,
  onReject,
  onHandled,
}: {
  item: OpportunityItem | null;
  busy: boolean;
  feedback?: string;
  draft: FeedbackDraft;
  draftContent: string;
  timeZone: string;
  onDraftChange: (draft: FeedbackDraft) => void;
  onDraftContentChange: (content: string) => void;
  onClose: () => void;
  onCopy: () => void;
  onFeedback: () => void;
  onSaveAndApprove: () => void;
  onQuickGenerate: () => void;
  onApprove: () => void;
  onReject: () => void;
  onHandled: () => void;
}) {
  const { t } = useT();
  if (!item) return null;
  const Icon = kindIcons[item.kind];
  const canReview = item.kind !== "target" && (item.status === "draft" || item.status === "pending_review" || item.status === "review");
  const actionHref = item.kind === "target" ? "/auto-comments" : item.queueHref;
  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => !open && onClose()} className="max-h-[90vh] max-w-3xl overflow-y-auto border border-[#2f3336] bg-[#0f1419]" title={t("opportunities.details.title")} description={t("opportunities.details.description")} closeLabel={t("common.close")}>
      <div className="space-y-4">
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${kindTone(item.kind)}`}>
              <Icon className="size-3.5" />
              {t(`opportunities.kind.${item.kind}`)}
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-xs ${riskTone(item.riskLevel)}`}>{t(`opportunities.risk.${item.riskLevel === "high" || item.riskLevel === "medium" ? item.riskLevel : "low"}`)}</span>
            <span className="rounded-full border border-[#2f3336] bg-[#16181c] px-2.5 py-1 text-xs text-[#8b98a5]">{item.status}</span>
            {feedback ? <span className="rounded-full border border-[#1d9bf0]/30 bg-[#1d9bf0]/10 px-2.5 py-1 text-xs text-[#8ecdf8]">{t(`opportunities.feedback.${feedback}`)}</span> : null}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_160px]">
            <div className="min-w-0">
              <p className="text-lg font-semibold text-white">{item.title}</p>
              <p className="mt-1 text-sm leading-6 text-[#71767b]">{t("opportunities.item.recommended")} <span className="text-[#d7ebff]">{t(item.actionKey)}</span></p>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[#cfd9e2] [overflow-wrap:anywhere]">{item.body || item.reason || "—"}</p>
            </div>
            <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3">
              <p className="text-xs text-[#71767b]">{t("opportunities.item.score")}</p>
              <p className={`mt-1 text-4xl font-semibold ${scoreTone(item.score)}`}>{item.score}</p>
              <p className="mt-2 text-xs leading-5 text-[#71767b]">{item.createdAt ? formatDateTime(item.createdAt, timeZone) : "—"}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <DetailBlock title={t("opportunities.details.why")} body={item.reason.startsWith("opportunities.") ? t(item.reason) : item.reason || t("opportunities.reason.default")} />
          <DetailBlock title={t("opportunities.details.safety")} body={t(`opportunities.details.safety.${item.riskLevel === "high" || item.riskLevel === "medium" ? item.riskLevel : "low"}`)} />
        </div>

        {item.generated ? (
          <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[#8ecdf8]">{t("opportunities.item.generated")}</p>
              <Button size="sm" variant="outline" onClick={onCopy}>
                <Copy className="size-4" />
                {t("opportunities.actions.copy")}
              </Button>
            </div>
            {canReview ? (
              <>
                <textarea
                  value={draftContent}
                  onChange={(event) => onDraftContentChange(event.target.value)}
                  rows={4}
                  className="form-input mt-3 min-h-28 resize-y text-sm leading-6"
                />
                <div className="mt-3 flex justify-end">
                  <Button size="sm" disabled={busy || !draftContent.trim()} onClick={onSaveAndApprove}>
                    <CheckCircle2 className="size-4" />
                    {t("opportunities.actions.saveAndApprove")}
                  </Button>
                </div>
              </>
            ) : (
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[#e7e9ea] [overflow-wrap:anywhere]">{item.generated}</p>
            )}
          </div>
        ) : null}

        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-white">{t("opportunities.details.nextStep")}</p>
          <p className="mt-1 text-xs leading-5 text-[#71767b]">{t(`opportunities.details.nextStep.${item.kind}`)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {item.kind === "target" || item.kind === "reply" ? (
              <Button size="sm" disabled={busy} onClick={onQuickGenerate}>
                <Sparkles className="size-4" />
                {t(item.kind === "target" ? "opportunities.actions.generateComment" : "opportunities.actions.regenerateReply")}
              </Button>
            ) : null}
            <Link href={actionHref} className="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-[#1d9bf0] px-3 text-sm font-semibold text-white hover:bg-[#1a8cd8]">
              <ArrowRight className="size-4" />
              {item.kind === "target" ? t("opportunities.actions.manageTargets") : t("opportunities.actions.openQueue")}
            </Link>
            {item.targetURL ? (
              <a href={item.targetURL} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-[#2f3336] px-3 text-sm font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
                <ExternalLink className="size-4" />
                {t("opportunities.actions.openTarget")}
              </a>
            ) : null}
            {canReview ? <Button size="sm" disabled={busy} onClick={onApprove}><CheckCircle2 className="size-4" />{t("opportunities.actions.approve")}</Button> : null}
            {item.kind === "comment" && item.status !== "handled" && item.status !== "published" && item.status !== "sent" ? <Button size="sm" variant="outline" disabled={busy} onClick={onHandled}><CheckCircle2 className="size-4" />{t("opportunities.actions.handled")}</Button> : null}
            {item.kind !== "target" && item.status !== "rejected" && item.status !== "published" && item.status !== "sent" ? <Button size="sm" variant="outline" disabled={busy} onClick={onReject}><XCircle className="size-4" />{t("opportunities.actions.reject")}</Button> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-white">{t("opportunities.feedback.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#71767b]">{item.kind === "comment" ? t("opportunities.feedback.description") : t("opportunities.feedback.localDescription")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant={draft.rating === "positive" ? "default" : "outline"} onClick={() => onDraftChange({ ...draft, rating: "positive" })}>
              <ThumbsUp className="size-4" />
              {t("opportunities.feedback.positive")}
            </Button>
            <Button size="sm" variant={draft.rating === "negative" ? "default" : "outline"} onClick={() => onDraftChange({ ...draft, rating: "negative" })}>
              <ThumbsDown className="size-4" />
              {t("opportunities.feedback.negative")}
            </Button>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-[220px_1fr]">
            <select value={draft.issueTag} onChange={(event) => onDraftChange({ ...draft, issueTag: event.target.value })} className="form-input h-10 py-0">
              <option value="">{t("opportunities.feedback.issuePlaceholder")}</option>
              {feedbackIssueTags.map((tag) => <option key={tag} value={tag}>{t(`opportunities.feedback.issue.${tag}`)}</option>)}
            </select>
            <input className="form-input h-10" value={draft.comment} placeholder={t("opportunities.feedback.commentPlaceholder")} onChange={(event) => onDraftChange({ ...draft, comment: event.target.value })} />
          </div>
          <div className="mt-3 flex justify-end">
            <Button size="sm" disabled={busy || !draft.rating} onClick={onFeedback}>{t("opportunities.feedback.submit")}</Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function DetailBlock({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
      <p className="text-sm font-semibold text-white">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[#aeb4bb]">{body || "—"}</p>
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
