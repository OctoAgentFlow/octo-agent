"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Bookmark, BookmarkPlus, BrainCircuit, CheckCircle2, Clipboard, Clock3, Database, ExternalLink, Eye, FileText, Flame, Gauge, Heart, MessageCircle, MessageSquarePlus, Quote, RefreshCw, Repeat2, Sparkles, TrendingUp, Users, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";
import { formatDateTime } from "@/lib/timezone";
import type { ExposureRadarItemApi } from "@/services/exposure-radar.service";
import { formatCompact, formatVelocityLabel, normalizeDataConfidence, normalizeOpportunityTier, normalizeQualityStage, normalizeVelocityState, qualityStageClass } from "@/components/exposure-radar/radar-utils";
import type { RankChange } from "@/components/exposure-radar/types";
import { MetricPill, VelocitySparkline } from "@/components/exposure-radar/radar-card-metrics";

export function RadarCardBadges({
  item,
  rank,
  rankChange,
  savedMemoryID,
  handledDone,
}: {
  item: ExposureRadarItemApi;
  rank: number;
  rankChange?: RankChange;
  savedMemoryID: number;
  handledDone: boolean;
}) {
  const { t } = useT();
  const riskClass = item.risk_level === "high" || item.risk_level === "medium" ? "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]" : "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  const velocityState = normalizeVelocityState(item.velocity_state, item.status);
  const opportunityTier = normalizeOpportunityTier(item.opportunity_tier);
  const qualityStage = normalizeQualityStage(item.quality_stage, item);
  const dataConfidence = normalizeDataConfidence(item.data_confidence, item.data_quality);
  const rankTone = rank <= 3 ? "border-[#f59e0b]/35 bg-[#f59e0b]/15 text-[#f6d96b]" : "border-[#2f3336] bg-[#16181c] text-[#8b98a5]";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`inline-flex h-7 min-w-8 items-center justify-center rounded-full border px-2 text-xs font-bold ${rankTone}`}>
        #{rank}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-2 py-1 text-xs font-semibold text-[#8ecdf8]">
        <TrendingUp className="size-3.5" />
        {item.signal_label || item.status}
      </span>
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${velocityStateClass(velocityState)}`}>
        <span className="size-1.5 rounded-full bg-current" />
        {t(`exposureRadar.velocityState.${velocityState}`)}
      </span>
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${opportunityTierClass(opportunityTier)}`} title={item.tier_reason || undefined}>
        <Flame className="size-3.5" />
        {t(`exposureRadar.tier.${opportunityTier}`)}
      </span>
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${qualityStageClass(qualityStage)}`} title={item.quality_reason || undefined}>
        <Zap className="size-3.5" />
        {t(`exposureRadar.qualityStage.${qualityStage}`)}
      </span>
      {rankChange ? (
        <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${rankChange.kind === "up" ? "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" : rankChange.kind === "down" ? "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]" : "border-[#f59e0b]/25 bg-[#f59e0b]/10 text-[#f6d96b]"}`}>
          {rankChange.kind === "new" ? "NEW" : rankChange.kind === "up" ? `↑${rankChange.delta}` : `↓${rankChange.delta}`}
        </span>
      ) : null}
      <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${riskClass}`}>
        {t(`exposureRadar.risk.${item.risk_level === "medium" || item.risk_level === "high" ? item.risk_level : "low"}`)}
      </span>
      <span className="rounded-full border border-[#2f3336] bg-[#16181c] px-2 py-1 text-xs font-semibold text-[#8b98a5]">
        {item.data_quality === "tweet_level" ? t("exposureRadar.quality.tweet") : t("exposureRadar.quality.topic")}
      </span>
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${dataConfidenceClass(dataConfidence)}`} title={item.data_confidence_reason || undefined}>
        <Database className="size-3.5" />
        {t(`exposureRadar.confidence.${dataConfidence}`)}
      </span>
      {item.account_fit_score ? (
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${accountFitClass(item.account_fit_label)}`} title={item.account_fit_reason || undefined}>
          <BrainCircuit className="size-3.5" />
          {t(`exposureRadar.accountFit.${normalizeAccountFitLabel(item.account_fit_label)}`, { score: item.account_fit_score })}
        </span>
      ) : null}
      {item.ranking_delta ? (
        <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${item.ranking_delta > 0 ? "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" : "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]"}`}>
          {item.ranking_delta > 0 ? `+${item.ranking_delta}` : item.ranking_delta}
        </span>
      ) : null}
      {savedMemoryID > 0 ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-2 py-1 text-xs font-semibold text-[#7ee0b5]">
          <BookmarkPlus className="size-3.5" />
          {t("exposureRadar.card.savedMemory")}
        </span>
      ) : null}
      {handledDone ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-2 py-1 text-xs font-semibold text-[#7ee0b5]">
          <CheckCircle2 className="size-3.5" />
          {t("exposureRadar.manualAction.handledBadge")}
        </span>
      ) : null}
    </div>
  );
}

export function RadarCardHeader({ item }: { item: ExposureRadarItemApi }) {
  const { t } = useT();
  return (
    <>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="line-clamp-2 text-base font-semibold text-[#e7e9ea]">{item.title}</h2>
          {item.author_handle ? <p className="mt-1 text-xs text-[#71767b]">@{item.author_handle}</p> : null}
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold text-white">{item.score}</p>
          <p className="text-[11px] text-[#71767b]">{t("exposureRadar.card.score")}</p>
        </div>
      </div>
      <p className="mt-3 line-clamp-4 text-sm leading-6 text-[#c9d1d9]">{item.content}</p>
    </>
  );
}

export function RadarCardPrimaryMetrics({ item }: { item: ExposureRadarItemApi }) {
  const { t } = useT();
  return (
    <div className="mt-4 grid gap-2 sm:grid-cols-3">
      <RadarMiniStat icon={<Gauge className="size-3.5" />} label={t("exposureRadar.card.velocity")} value={formatVelocityLabel(item.views_per_min, t("exposureRadar.card.velocitySampling"))} />
      <RadarMiniStat icon={<Users className="size-3.5" />} label={t("exposureRadar.card.followers")} value={item.followers_count ? formatCompact(item.followers_count) : "-"} />
      <RadarMiniStat icon={<Flame className="size-3.5" />} label={t("exposureRadar.card.heat")} value={item.heat_count ? formatCompact(item.heat_count) : "-"} />
    </div>
  );
}

export function RadarCardPublicMetrics({ item }: { item: ExposureRadarItemApi }) {
  const { t } = useT();
  if (!hasEngagementMetrics(item)) return null;

  return (
    <div className="mt-3 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3">
      <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.card.publicMetrics")}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <MetricPill icon={<MessageCircle className="size-3.5" />} label={t("exposureRadar.card.replies")} value={item.reply_count} />
        <MetricPill icon={<Repeat2 className="size-3.5" />} label={t("exposureRadar.card.reposts")} value={item.retweet_count} />
        <MetricPill icon={<Heart className="size-3.5" />} label={t("exposureRadar.card.likes")} value={item.like_count} />
        <MetricPill icon={<Quote className="size-3.5" />} label={t("exposureRadar.card.quotes")} value={item.quote_count} />
        <MetricPill icon={<Bookmark className="size-3.5" />} label={t("exposureRadar.card.bookmarks")} value={item.bookmark_count} />
        <MetricPill icon={<Eye className="size-3.5" />} label={t("exposureRadar.card.impressions")} value={item.impression_count} />
      </div>
    </div>
  );
}

export function RadarCardVelocityTrend({ item }: { item: ExposureRadarItemApi }) {
  return item.velocity_history?.length ? <VelocitySparkline values={item.velocity_history} /> : null;
}

export function RadarCardRecommendedUse({ item }: { item: ExposureRadarItemApi }) {
  const { t } = useT();
  return (
    <div className="mt-4 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3">
      <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.card.recommended")}</p>
      <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{item.recommended_use}</p>
      <p className="mt-2 text-xs leading-5 text-[#71767b]">{item.reason}</p>
      {item.ranking_reason ? <p className="mt-2 text-xs leading-5 text-[#8ecdf8]">{item.ranking_reason}</p> : null}
    </div>
  );
}

export function RadarCardGeneratedCommentBlock({
  generatedComment,
  workflow,
  record,
}: {
  generatedComment: string;
  workflow: ReactNode;
  record: ReactNode;
}) {
  const { t } = useT();
  if (!generatedComment) return null;

  return (
    <div className="mt-4 rounded-2xl border border-[#1d9bf0]/35 bg-[#07111a] p-3">
      <p className="text-xs font-semibold text-[#8ecdf8]">{t("exposureRadar.card.generatedComment")}</p>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#e7e9ea]">{generatedComment}</p>
      <p className="mt-2 text-xs leading-5 text-[#8b98a5]">{t("exposureRadar.card.manualPublishHint")}</p>
      {workflow}
      {record}
    </div>
  );
}

export function RadarCardActionFooter({
  item,
  timeZone,
  generatedComment,
  canDraft,
  drafting,
  savedMemoryID,
  memoryAccountID,
  memoryDisabled,
  savingMemory,
  savingSeed,
  generatingSeedDraft,
  onCopyComment,
  onOpenPost,
  onCreateDraft,
  onSaveMemory,
  onSaveContentSeed,
  onGenerateContentDraft,
}: {
  item: ExposureRadarItemApi;
  timeZone: string;
  generatedComment: string;
  canDraft: boolean;
  drafting: boolean;
  savedMemoryID: number;
  memoryAccountID: number;
  memoryDisabled: boolean;
  savingMemory: boolean;
  savingSeed: boolean;
  generatingSeedDraft: boolean;
  onCopyComment: () => void | Promise<void>;
  onOpenPost: () => void;
  onCreateDraft: () => void;
  onSaveMemory: () => void;
  onSaveContentSeed: () => void;
  onGenerateContentDraft: () => void;
}) {
  const { t } = useT();

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#71767b]">
      <span className="inline-flex items-center gap-1">
        <Clock3 className="size-3.5" />
        {item.age_label || (item.updated_at ? formatDateTime(item.updated_at, timeZone) : "-")}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {generatedComment ? (
          <>
            <Button type="button" size="sm" variant="outline" onClick={() => void onCopyComment()}>
              <Clipboard className="size-3.5" />
              {t("exposureRadar.manualAction.copy")}
            </Button>
            {item.url ? (
              <a href={item.url} target="_blank" rel="noreferrer" onClick={onOpenPost} className="inline-flex h-8 items-center gap-1 rounded-full bg-[#1d9bf0] px-3 font-semibold text-white hover:bg-[#1a8cd8]">
                {item.data_quality === "tweet_level" ? t("exposureRadar.card.openPost") : t("exposureRadar.card.openSearch")}
                <ExternalLink className="size-3.5" />
              </a>
            ) : null}
          </>
        ) : (
          <Button type="button" size="sm" variant="outline" disabled={!canDraft || drafting} title={!canDraft && item.data_quality !== "tweet_level" ? t("exposureRadar.card.topicDraftDisabled") : undefined} onClick={onCreateDraft}>
            <MessageSquarePlus className="size-3.5" />
            {drafting ? t("exposureRadar.card.drafting") : t("exposureRadar.card.createDraft")}
          </Button>
        )}
        {savedMemoryID > 0 ? (
          <Link href={memoryLink(savedMemoryID, memoryAccountID)} className="inline-flex h-8 items-center gap-1 rounded-full border border-[#2f3336] px-3 font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
            <BookmarkPlus className="size-3.5" />
            {t("exposureRadar.card.openMemory")}
          </Link>
        ) : (
          <Button type="button" size="sm" variant="outline" disabled={memoryDisabled || savingMemory} onClick={onSaveMemory}>
            <BookmarkPlus className="size-3.5" />
            {savingMemory ? t("exposureRadar.card.savingMemory") : t("exposureRadar.card.saveMemory")}
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" disabled={memoryDisabled || savingSeed} onClick={onSaveContentSeed}>
          {savingSeed ? <RefreshCw className="size-3.5 animate-spin" /> : <FileText className="size-3.5" />}
          {savingSeed ? t("exposureRadar.card.savingSeed") : t("exposureRadar.card.saveSeed")}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={memoryDisabled || generatingSeedDraft} onClick={onGenerateContentDraft}>
          {generatingSeedDraft ? <RefreshCw className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          {generatingSeedDraft ? t("exposureRadar.card.generatingSeedDraft") : t("exposureRadar.card.generateSeedDraft")}
        </Button>
        {!generatedComment && item.url ? (
          <a href={item.url} target="_blank" rel="noreferrer" onClick={onOpenPost} className="inline-flex h-8 items-center gap-1 rounded-full bg-[#1d9bf0] px-3 font-semibold text-white hover:bg-[#1a8cd8]">
            {item.data_quality === "tweet_level" ? t("exposureRadar.card.openPost") : t("exposureRadar.card.openSearch")}
            <ExternalLink className="size-3.5" />
          </a>
        ) : null}
      </div>
    </div>
  );
}

function RadarMiniStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
      <p className="flex items-center gap-1 text-[11px] text-[#71767b]">{icon}{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[#e7e9ea]">{value}</p>
    </div>
  );
}

function hasEngagementMetrics(item: ExposureRadarItemApi) {
  return [item.reply_count, item.retweet_count, item.like_count, item.quote_count, item.bookmark_count, item.impression_count].some((value) => typeof value === "number");
}

function memoryLink(id: number, accountID: number) {
  const params = new URLSearchParams();
  params.set("memory_id", String(id));
  if (accountID) params.set("account_id", String(accountID));
  return `/content-library?${params.toString()}`;
}

function velocityStateClass(state: string) {
  if (state === "burst") return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
  if (state === "rising" || state === "new") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  if (state === "cooling") return "border-[#64748b]/30 bg-[#64748b]/10 text-[#94a3b8]";
  return "border-[#2f3336] bg-[#16181c] text-[#8b98a5]";
}

function opportunityTierClass(tier: string) {
  if (tier === "hot_opportunity") return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
  if (tier === "rising_opportunity") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  if (tier === "topic_lead") return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  return "border-[#f59e0b]/25 bg-[#f59e0b]/10 text-[#f6d96b]";
}

function dataConfidenceClass(confidence: string) {
  if (confidence === "real_impressions") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  if (confidence === "engagement_estimate") return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  if (confidence === "topic_level") return "border-[#8b5cf6]/25 bg-[#8b5cf6]/10 text-[#c4b5fd]";
  return "border-[#f59e0b]/25 bg-[#f59e0b]/10 text-[#f6d96b]";
}

function normalizeAccountFitLabel(value?: string) {
  if (value === "strong" || value === "good" || value === "weak" || value === "avoid") return value;
  return "weak";
}

function accountFitClass(value?: string) {
  switch (normalizeAccountFitLabel(value)) {
    case "strong":
      return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
    case "good":
      return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
    case "avoid":
      return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
    default:
      return "border-[#64748b]/35 bg-[#64748b]/10 text-[#94a3b8]";
  }
}
