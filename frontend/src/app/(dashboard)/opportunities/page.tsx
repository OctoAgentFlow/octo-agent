"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import {
  Activity,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Gauge,
  Inbox,
  MessageCircle,
  Radar,
  Reply,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { broadcastPageRefreshComplete, subscribePageRefreshRequest } from "@/lib/app-page-refresh";
import { formatDateTime, usePreferredTimeZone } from "@/lib/timezone";
import {
  automationService,
  type AutoCommentTargetApi,
  type AutoCommentTaskApi,
  type AutoReplyDraftApi,
} from "@/services/automation.service";

type LoadState = "loading" | "ready" | "error";
type OpportunityKind = "comment" | "reply" | "target";
type OpportunityCommandKey = "risk" | "review" | "growth" | "seed";

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
  ownerHref: string;
};

type OpportunityStats = {
  actionable: number;
  highScore: number;
  risky: number;
  average: number;
  generated: number;
  ready: number;
  published: number;
  targets: number;
  comments: number;
  replies: number;
};

const actionableStatuses = new Set(["draft", "review", "pending_review", "approved", "ready_to_publish", "failed"]);
const commentRecommendedScore = 75;
const maxRecommendedCommentOpportunities = 20;
const kindIcons: Record<OpportunityKind, LucideIcon> = {
  comment: MessageCircle,
  reply: Reply,
  target: Target,
};

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
  if (score >= 85) return "text-[#7ee0b5]";
  if (score >= commentRecommendedScore) return "text-[#8ecdf8]";
  if (score >= 65) return "text-[#f6d96b]";
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
    ownerHref: queueFocusHref("comment", item.id, status),
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
    ownerHref: queueFocusHref("reply", item.id, status),
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
    ownerHref: "/auto-comments",
  };
}

export default function OpportunitiesPage() {
  const { t } = useT();
  const timeZone = usePreferredTimeZone();
  const { pushToast } = useToast();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [items, setItems] = useState<OpportunityItem[]>([]);

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const [commentData, replyData, targetData] = await Promise.all([
        automationService.commentDrafts({ pageSize: 200 }),
        automationService.replyDrafts(),
        automationService.commentTargets(),
      ]);
      const commentItems = commentData.items
        .map(commentToOpportunity)
        .filter((item) => item.score >= commentRecommendedScore)
        .slice(0, maxRecommendedCommentOpportunities);
      const next = [
        ...commentItems,
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

  const stats = useMemo<OpportunityStats>(() => {
    const actionable = items.filter((item) => item.kind !== "target" && actionableStatuses.has(item.status)).length;
    const highScore = items.filter((item) => item.score >= 75).length;
    const risky = items.filter((item) => item.riskLevel === "high" || item.riskLevel === "medium").length;
    const generated = items.filter((item) => item.generated?.trim()).length;
    const ready = items.filter((item) => item.status === "approved" || item.status === "ready_to_publish").length;
    const published = items.filter((item) => item.status === "published" || item.status === "sent" || item.status === "handled").length;
    const average = items.length ? Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length) : 0;
    return {
      actionable,
      highScore,
      risky,
      average,
      generated,
      ready,
      published,
      targets: items.filter((item) => item.kind === "target").length,
      comments: items.filter((item) => item.kind === "comment").length,
      replies: items.filter((item) => item.kind === "reply").length,
    };
  }, [items]);

  const todayPlan = useMemo(() => {
    const topHighScore = items.filter((item) => item.score >= 75).slice(0, 4);
    const reviewable = items.filter((item) => item.kind !== "target" && actionableStatuses.has(item.status)).slice(0, 4);
    const risky = items.filter((item) => item.riskLevel === "high" || item.riskLevel === "medium").slice(0, 4);
    return { topHighScore, reviewable, risky };
  }, [items]);

  const command = useMemo(() => {
    if (stats.risky > 0) return { key: "risk" as OpportunityCommandKey, count: stats.risky, href: "/execution-queue?status=pending_review", icon: ShieldAlert, tone: "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]" };
    if (stats.actionable > 0) return { key: "review" as OpportunityCommandKey, count: stats.actionable, href: "/execution-queue?status=pending_review", icon: CheckCircle2, tone: "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]" };
    if (stats.highScore > 0) return { key: "growth" as OpportunityCommandKey, count: stats.highScore, href: "/auto-comments", icon: Sparkles, tone: "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" };
    return { key: "seed" as OpportunityCommandKey, count: stats.targets, href: "/auto-comments", icon: Target, tone: "border-[#2f3336] bg-black text-[#8b98a5]" };
  }, [stats.actionable, stats.highScore, stats.risky, stats.targets]);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[28px] border border-[#2f3336] bg-[#f7f3ea] text-[#171412] shadow-sm">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          <div className="p-5 md:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#171412]/10 bg-white px-3 py-1 text-xs font-semibold text-[#171412]">
                <Radar className="size-3.5" />
                {t("opportunities.kicker")}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#2563eb]/20 bg-[#dbeafe] px-3 py-1 text-xs font-semibold text-[#1d4ed8]">
                <Target className="size-3.5" />
                {t("opportunities.sprint.badge")}
              </span>
            </div>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight tracking-tight text-[#171412] md:text-5xl">
              {t("opportunities.title")}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-[#5f5a52] md:text-base">{t("opportunities.subtitle")}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/trends" className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[#171412] px-4 text-sm font-semibold text-white transition hover:bg-[#2b2824]">
                <TrendingUp className="size-4" />
                {t("opportunities.actions.openRadar")}
              </Link>
              <Link href="/execution-queue?status=pending_review" className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[#171412]/15 bg-white px-4 text-sm font-semibold text-[#171412] transition hover:bg-[#efe8dc]">
                <Inbox className="size-4" />
                {t("opportunities.actions.openQueue")}
              </Link>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <LightMetric icon={Target} label={t("opportunities.sprint.target")} value="5M" />
              <LightMetric icon={CalendarClock} label={t("opportunities.sprint.window")} value={t("opportunities.sprint.windowValue")} />
              <LightMetric icon={Gauge} label={t("opportunities.sprint.dailyNeed")} value="357K" />
            </div>
          </div>
          <div className="border-t border-[#171412]/10 bg-white/68 p-5 md:p-7 lg:border-l lg:border-t-0">
            <p className="text-sm font-semibold text-[#171412]">{t("opportunities.sprint.title")}</p>
            <p className="mt-2 text-xs leading-5 text-[#6f695f]">{t("opportunities.sprint.description")}</p>
            <div className="mt-5 grid gap-2">
              <SprintStep index="01" title={t("opportunities.sprint.step1.title")} description={t("opportunities.sprint.step1.description")} />
              <SprintStep index="02" title={t("opportunities.sprint.step2.title")} description={t("opportunities.sprint.step2.description")} />
              <SprintStep index="03" title={t("opportunities.sprint.step3.title")} description={t("opportunities.sprint.step3.description")} />
              <SprintStep index="04" title={t("opportunities.sprint.step4.title")} description={t("opportunities.sprint.step4.description")} />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric icon={Sparkles} label={t("opportunities.stats.average")} value={String(stats.average)} />
        <Metric icon={CheckCircle2} label={t("opportunities.stats.actionable")} value={String(stats.actionable)} />
        <Metric icon={Search} label={t("opportunities.stats.highScore")} value={String(stats.highScore)} />
        <Metric icon={ShieldAlert} label={t("opportunities.stats.risky")} value={String(stats.risky)} />
      </div>

      <ExposureStrategyCard stats={stats} />

      <SignalRadarCard stats={stats} />

      <GrowthPublishPathCard stats={stats} />

      <ResourceGuardCard />

      <OpportunityCommandCard command={command} />

      <OwnershipCard stats={stats} />

      <TodayPlanCard plan={todayPlan} timeZone={timeZone} loadState={loadState} onRetry={() => void load()} />
    </div>
  );
}

function LightMetric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#171412]/10 bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-[#6f695f]">
        <Icon className="size-4 text-[#2563eb]" />
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-[#171412]">{value}</p>
    </div>
  );
}

function SprintStep({ index, title, description }: { index: string; title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-[#171412]/10 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[#171412] text-xs font-semibold text-white">{index}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#171412]">{title}</p>
          <p className="mt-1 text-xs leading-5 text-[#6f695f]">{description}</p>
        </div>
      </div>
    </div>
  );
}

function ExposureStrategyCard({ stats }: { stats: OpportunityStats }) {
  const { t } = useT();
  const lanes = [
    {
      key: "trend",
      value: stats.highScore,
      href: "/trends",
      icon: Activity,
      tone: "border-[#f59e0b]/25 bg-[#f59e0b]/10 text-[#f7c56a]",
    },
    {
      key: "kol",
      value: stats.targets,
      href: "/auto-comments",
      icon: Users,
      tone: "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]",
    },
    {
      key: "reply",
      value: stats.replies,
      href: "/auto-replies",
      icon: Reply,
      tone: "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]",
    },
    {
      key: "publish",
      value: stats.ready + stats.published,
      href: "/execution-queue?status=ready_to_publish",
      icon: Send,
      tone: "border-[#7856ff]/25 bg-[#7856ff]/10 text-[#b8a7ff]",
    },
  ];
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <CardHeader title={t("opportunities.strategy.title")} description={t("opportunities.strategy.description")} />
        <Link href="/daily-x-queue" className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-[#2f3336] px-3 text-sm font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
          <Sparkles className="size-4" />
          {t("opportunities.strategy.cta")}
        </Link>
      </div>
      <div className="mt-4 grid gap-3 xl:grid-cols-4">
        {lanes.map((lane) => {
          const Icon = lane.icon;
          return (
            <Link key={lane.key} href={lane.href} className="rounded-2xl border border-[#2f3336] bg-black p-4 transition hover:border-[#1d9bf0]/50">
              <div className="flex items-start justify-between gap-3">
                <span className={`inline-flex size-10 items-center justify-center rounded-full border ${lane.tone}`}>
                  <Icon className="size-5" />
                </span>
                <span className="text-2xl font-semibold text-white">{lane.value}</span>
              </div>
              <p className="mt-4 text-sm font-semibold text-[#e7e9ea]">{t(`opportunities.strategy.${lane.key}.title`)}</p>
              <p className="mt-1 text-xs leading-5 text-[#71767b]">{t(`opportunities.strategy.${lane.key}.description`)}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#8ecdf8]">
                {t(`opportunities.strategy.${lane.key}.cta`)}
                <ArrowRight className="size-3.5" />
              </span>
            </Link>
          );
        })}
      </div>
    </Card>
  );
}

function SignalRadarCard({ stats }: { stats: OpportunityStats }) {
  const { t } = useT();
  const signals = [
    { key: "velocity", value: stats.highScore, icon: Zap },
    { key: "breakout", value: stats.targets, icon: TrendingUp },
    { key: "memory", value: stats.generated, icon: Sparkles },
    { key: "guardrail", value: stats.risky, icon: ShieldAlert },
  ];
  return (
    <Card className="border-[#f59e0b]/20 bg-[#17120a]">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div>
          <CardHeader title={t("opportunities.radar.title")} description={t("opportunities.radar.description")} />
          <div className="mt-4 rounded-2xl border border-[#f59e0b]/20 bg-black/35 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#f7c56a]">{t("opportunities.radar.operatingRule")}</p>
            <p className="mt-2 text-sm leading-6 text-[#f1dfbd]">{t("opportunities.radar.ruleText")}</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {signals.map((signal) => {
            const Icon = signal.icon;
            return (
              <div key={signal.key} className="rounded-2xl border border-[#2f3336] bg-black p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="inline-flex size-9 items-center justify-center rounded-full border border-[#f59e0b]/25 bg-[#f59e0b]/10 text-[#f7c56a]">
                    <Icon className="size-4" />
                  </span>
                  <span className="text-xl font-semibold text-white">{signal.value}</span>
                </div>
                <p className="mt-3 text-sm font-semibold text-[#e7e9ea]">{t(`opportunities.radar.${signal.key}.title`)}</p>
                <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t(`opportunities.radar.${signal.key}.description`)}</p>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function TodayPlanCard({
  plan,
  timeZone,
  loadState,
  onRetry,
}: {
  plan: { topHighScore: OpportunityItem[]; risky: OpportunityItem[]; reviewable: OpportunityItem[] };
  timeZone: string;
  loadState: LoadState;
  onRetry: () => void;
}) {
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
        <Link href="/execution-queue?status=pending_review" className="inline-flex h-9 items-center justify-center gap-2 rounded-full border border-[#2f3336] px-3 text-sm font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
          <Inbox className="size-4" />
          {t("opportunities.actions.openQueue")}
        </Link>
      </div>
      {loadState === "loading" ? (
        <div className="mt-4 rounded-2xl border border-[#2f3336] bg-black px-4 py-10 text-center text-sm text-[#71767b]">{t("opportunities.loading")}</div>
      ) : null}
      {loadState === "error" ? (
        <div className="mt-4 rounded-2xl border border-[#f4212e]/25 bg-[#f4212e]/10 px-4 py-10 text-center text-sm text-[#ff8a91]">
          <p>{t("opportunities.errors.load")}</p>
          <Button className="mt-4" size="sm" variant="outline" onClick={onRetry}>{t("common.retry")}</Button>
        </div>
      ) : null}
      {loadState === "ready" ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {groups.map((group) => (
            <div key={group.key} className="rounded-2xl border border-[#2f3336] bg-black p-3">
              <p className="text-xs font-semibold text-[#e7e9ea]">{t(`opportunities.today.${group.key}`)}</p>
              <div className="mt-3 space-y-2">
                {group.items.length ? group.items.map((item) => (
                  <OpportunityPreviewLink key={`${group.key}-${item.id}`} item={item} timeZone={timeZone} />
                )) : (
                  <p className="rounded-xl border border-dashed border-[#2f3336] px-3 py-5 text-center text-xs text-[#71767b]">{t("opportunities.today.empty")}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function OpportunityPreviewLink({ item, timeZone }: { item: OpportunityItem; timeZone: string }) {
  const { t } = useT();
  const Icon = kindIcons[item.kind];
  const href = item.ownerHref;
  const reason = item.reason.startsWith("opportunities.") ? t(item.reason) : item.reason || t("opportunities.reason.default");
  return (
    <Link href={href} className="block rounded-xl border border-[#2f3336] bg-[#0f1419] p-3 transition hover:border-[#1d9bf0]/60">
      <span className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${kindTone(item.kind)}`}>
          <Icon className="size-3.5" />
          {t(`opportunities.kind.${item.kind}`)}
        </span>
        <span className={`rounded-full border px-2 py-0.5 ${riskTone(item.riskLevel)}`}>
          {t(`opportunities.risk.${item.riskLevel === "high" || item.riskLevel === "medium" ? item.riskLevel : "low"}`)}
        </span>
        <span className={scoreTone(item.score)}>{item.score}</span>
      </span>
      <span className="mt-2 block truncate text-sm font-medium text-white">{item.title}</span>
      <span className="mt-1 line-clamp-2 block text-xs leading-5 text-[#8b98a5]">{item.body || reason}</span>
      <span className="mt-2 flex items-center justify-between gap-2 text-xs text-[#71767b]">
        <span>{item.createdAt ? formatDateTime(item.createdAt, timeZone) : "—"}</span>
        <span className="inline-flex items-center gap-1 font-semibold text-[#8ecdf8]">
          {item.kind === "target" ? t("opportunities.actions.manageTargets") : t("opportunities.actions.openQueue")}
          <ArrowRight className="size-3.5" />
        </span>
      </span>
    </Link>
  );
}

function ResourceGuardCard() {
  const { t } = useT();
  return (
    <Card className="border-[#00ba7c]/20 bg-[#061710] p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]">
          <ShieldAlert className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#d7fbe8]">{t("opportunities.resourceGuard.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#8bb9a5]">{t("opportunities.resourceGuard.description")}</p>
        </div>
      </div>
    </Card>
  );
}

function OpportunityCommandCard({
  command,
}: {
  command: { key: OpportunityCommandKey; count: number; href: string; icon: LucideIcon; tone: string };
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

function GrowthPublishPathCard({ stats }: { stats: Pick<OpportunityStats, "highScore" | "generated" | "actionable" | "ready" | "published"> }) {
  const { t } = useT();
  const steps = [
    {
      key: "discover",
      value: stats.highScore,
      href: "/auto-comments",
      icon: Search,
    },
    {
      key: "draft",
      value: stats.generated,
      href: "/auto-comments",
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

function OwnershipCard({ stats }: { stats: OpportunityStats }) {
  const { t } = useT();
  const items = [
    {
      key: "targets",
      value: stats.targets,
      href: "/auto-comments",
      icon: Target,
    },
    {
      key: "actions",
      value: stats.actionable,
      href: "/execution-queue?status=pending_review",
      icon: Inbox,
    },
    {
      key: "replies",
      value: stats.replies,
      href: "/auto-replies",
      icon: Reply,
    },
  ];
  return (
    <Card className="bg-[#0f1419]">
      <CardHeader title={t("opportunities.ownership.title")} description={t("opportunities.ownership.description")} />
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.key} href={item.href} className="rounded-2xl border border-[#2f3336] bg-black p-4 transition hover:border-[#1d9bf0]/45">
              <div className="flex items-start justify-between gap-3">
                <span className="grid size-10 place-items-center rounded-full border border-[#1d9bf0]/20 bg-[#1d9bf0]/10 text-[#8ecdf8]">
                  <Icon className="size-5" />
                </span>
                <span className="text-2xl font-semibold text-white">{item.value}</span>
              </div>
              <p className="mt-4 text-sm font-semibold text-[#e7e9ea]">{t(`opportunities.ownership.${item.key}.title`)}</p>
              <p className="mt-1 text-xs leading-5 text-[#71767b]">{t(`opportunities.ownership.${item.key}.description`)}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#8ecdf8]">
                {t(`opportunities.ownership.${item.key}.cta`)}
                <ArrowRight className="size-3.5" />
              </span>
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
