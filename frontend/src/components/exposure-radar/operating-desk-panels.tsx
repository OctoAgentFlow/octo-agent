"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, Bookmark, CheckCircle2, Clipboard, Database, Eye, FileText, Gauge, Heart, Info, Repeat2, ShieldAlert, ShieldCheck, Sparkles, Target, Users, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";
import type { ContentDraftApi } from "@/services/content-draft.service";
import type { AccountHealthScore, GrowthExperiment, LoadState, PeopleRadarEntry, PeopleRadarStage } from "@/components/exposure-radar/types";

type EvidenceTopSignal = {
  title: string;
  views: string;
  speed: string;
  followers: string;
  nextStep: string;
};

type EvidenceDiagnostics = {
  maxViews: string;
  maxSpeed: string;
  coverage: string;
};

export function AccountHealthScoreCard({ health }: { health: AccountHealthScore }) {
  const { t } = useT();
  return (
    <Card className={`bg-[#0f1419] ${health.status === "risk" ? "border-[#f4212e]/25" : health.status === "watch" ? "border-[#ffd400]/25" : "border-[#00ba7c]/20"}`}>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <CardHeader title={t("exposureRadar.healthScore.title")} description={t("exposureRadar.healthScore.description")} className="mb-0" />
        <span className={`inline-flex h-9 w-fit items-center gap-2 rounded-full border px-3 text-xs font-semibold ${accountHealthTone(health.status)}`}>
          <ShieldCheck className="size-3.5" />
          {t(`exposureRadar.healthScore.status.${health.status}`)}
        </span>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[180px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-xs font-semibold text-[#71767b]">{t("exposureRadar.healthScore.score")}</p>
          <p className="mt-2 text-4xl font-semibold text-white">{health.score}</p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#202327]">
            <div className={`h-full rounded-full ${health.status === "healthy" ? "bg-[#00ba7c]" : health.status === "watch" ? "bg-[#ffd400]" : "bg-[#f4212e]"}`} style={{ width: `${health.score}%` }} />
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {health.checks.map((check) => (
            <div key={check.key} className="rounded-xl border border-[#2f3336] bg-black p-3">
              <div className="flex items-start gap-2">
                {check.pass ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#7ee0b5]" /> : <Info className="mt-0.5 size-4 shrink-0 text-[#f6d96b]" />}
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#e7e9ea]">{t(`exposureRadar.healthScore.check.${check.key}.title`)}</p>
                  <p className="mt-1 text-[11px] leading-5 text-[#71767b]">{t(`exposureRadar.healthScore.check.${check.key}.description`)}</p>
                  <p className="mt-2 truncate text-xs font-semibold text-[#8ecdf8]">{check.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function OpportunityEvidenceDeskCard({
  itemCount,
  loadState,
  strong,
  usable,
  thin,
  weak,
  topSignal,
  diagnostics,
}: {
  itemCount: number;
  loadState: LoadState;
  strong: number;
  usable: number;
  thin: number;
  weak: number;
  topSignal: EvidenceTopSignal | null;
  diagnostics: EvidenceDiagnostics;
}) {
  const { t } = useT();
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <CardHeader title={t("exposureRadar.evidenceDesk.title")} description={t("exposureRadar.evidenceDesk.description")} className="mb-0" />
        <span className="inline-flex h-9 w-fit items-center gap-2 rounded-full border border-[#2f3336] bg-black px-3 text-xs font-semibold text-[#8b98a5]">
          <Gauge className="size-3.5" />
          {loadState === "loading" ? t("exposureRadar.evidenceDesk.loading") : t("exposureRadar.evidenceDesk.count", { count: itemCount })}
        </span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <PanelMiniStat icon={<CheckCircle2 className="size-3.5" />} label={t("exposureRadar.evidenceDesk.strong")} value={String(strong)} />
        <PanelMiniStat icon={<Gauge className="size-3.5" />} label={t("exposureRadar.evidenceDesk.usable")} value={String(usable)} />
        <PanelMiniStat icon={<Info className="size-3.5" />} label={t("exposureRadar.evidenceDesk.thin")} value={String(thin)} />
        <PanelMiniStat icon={<ShieldAlert className="size-3.5" />} label={t("exposureRadar.evidenceDesk.weak")} value={String(weak)} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.evidenceDesk.topTitle")}</p>
          {topSignal ? (
            <>
              <p className="mt-2 line-clamp-2 text-sm font-semibold text-[#e7e9ea]">{topSignal.title}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <PanelMiniStat icon={<Eye className="size-3.5" />} label={t("exposureRadar.evidenceDesk.views")} value={topSignal.views} />
                <PanelMiniStat icon={<Zap className="size-3.5" />} label={t("exposureRadar.evidenceDesk.speed")} value={topSignal.speed} />
                <PanelMiniStat icon={<Users className="size-3.5" />} label={t("exposureRadar.evidenceDesk.followers")} value={topSignal.followers} />
              </div>
              <p className="mt-3 rounded-xl border border-[#1d9bf0]/20 bg-[#08131f] px-3 py-2 text-xs leading-5 text-[#8ecdf8]">{topSignal.nextStep}</p>
            </>
          ) : (
            <p className="mt-2 rounded-xl border border-dashed border-[#2f3336] px-3 py-6 text-center text-xs text-[#71767b]">{t("exposureRadar.evidenceDesk.empty")}</p>
          )}
        </div>
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.evidenceDesk.diagnosticTitle")}</p>
          <div className="mt-3 space-y-2 text-xs leading-5 text-[#8b98a5]">
            <p>{t("exposureRadar.evidenceDesk.maxViews", { value: diagnostics.maxViews })}</p>
            <p>{t("exposureRadar.evidenceDesk.maxSpeed", { value: diagnostics.maxSpeed })}</p>
            <p>{t("exposureRadar.evidenceDesk.coverage", { value: diagnostics.coverage })}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function GrowthExperimentCard({ experiments }: { experiments: GrowthExperiment[] }) {
  const { t } = useT();
  return (
    <Card className="bg-[#0f1419]">
      <CardHeader title={t("exposureRadar.experimentPanel.title")} description={t("exposureRadar.experimentPanel.description")} />
      <div className="grid gap-3">
        {experiments.map((experiment) => (
          <div key={experiment.key} className={`rounded-2xl border p-4 ${experimentTone(experiment.tone)}`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold">{experiment.title}</p>
                <p className="mt-1 text-xs leading-5 opacity-85">{experiment.hypothesis}</p>
              </div>
              <span className="inline-flex w-fit items-center gap-1 rounded-full border border-current/20 bg-black/20 px-2.5 py-1 text-[11px] font-semibold">
                <Target className="size-3.5" />
                {t("exposureRadar.experimentPanel.experiment")}
              </span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-current/15 bg-black/20 p-3">
                <p className="text-[11px] font-semibold opacity-80">{t("exposureRadar.experimentPanel.action")}</p>
                <p className="mt-1 text-xs leading-5 opacity-90">{experiment.action}</p>
              </div>
              <div className="rounded-xl border border-current/15 bg-black/20 p-3">
                <p className="text-[11px] font-semibold opacity-80">{t("exposureRadar.experimentPanel.metric")}</p>
                <p className="mt-1 text-xs leading-5 opacity-90">{experiment.metric}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function WeeklyOperatorReviewCard({
  handled,
  effective,
  negative,
  backfilled,
  topTopicItems,
  nextItems,
  onCopyReport,
}: {
  handled: number;
  effective: number;
  negative: number;
  backfilled: number;
  topTopicItems: string[];
  nextItems: string[];
  onCopyReport: () => void;
}) {
  const { t } = useT();
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <CardHeader title={t("exposureRadar.weeklyOps.title")} description={t("exposureRadar.weeklyOps.description")} className="mb-0" />
        <Button type="button" variant="outline" onClick={onCopyReport}>
          <Clipboard className="size-4" />
          {t("exposureRadar.weeklyOps.copy")}
        </Button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <PanelGrowthDeskMetric icon={<CheckCircle2 className="size-3.5" />} label={t("exposureRadar.weeklyOps.metric.handled")} value={String(handled)} detail={t("exposureRadar.weeklyOps.metric.handledDetail")} />
        <PanelGrowthDeskMetric icon={<Sparkles className="size-3.5" />} label={t("exposureRadar.weeklyOps.metric.effective")} value={String(effective)} detail={t("exposureRadar.weeklyOps.metric.effectiveDetail")} />
        <PanelGrowthDeskMetric icon={<ShieldAlert className="size-3.5" />} label={t("exposureRadar.weeklyOps.metric.negative")} value={String(negative)} detail={t("exposureRadar.weeklyOps.metric.negativeDetail")} />
        <PanelGrowthDeskMetric icon={<BarChart3 className="size-3.5" />} label={t("exposureRadar.weeklyOps.metric.backfilled")} value={String(backfilled)} detail={t("exposureRadar.weeklyOps.metric.backfilledDetail")} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <PanelReviewList title={t("exposureRadar.weeklyOps.topics")} items={topTopicItems} empty={t("exposureRadar.weeklyOps.empty")} />
        <PanelReviewList title={t("exposureRadar.weeklyOps.next")} items={nextItems} empty={t("exposureRadar.weeklyOps.empty")} />
      </div>
    </Card>
  );
}

export function PeopleRelationshipDeskCard({
  relationshipCount,
  priorityCount,
  repeatCount,
  engagedCount,
  avoidCount,
  topPeople,
  onFocus,
}: {
  relationshipCount: number;
  priorityCount: number;
  repeatCount: number;
  engagedCount: number;
  avoidCount: number;
  topPeople: PeopleRadarEntry[];
  onFocus: (itemID: string) => void;
}) {
  const { t } = useT();
  return (
    <Card className="mb-4 bg-[#0f1419]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <CardHeader title={t("exposureRadar.peopleDesk.title")} description={t("exposureRadar.peopleDesk.description")} className="mb-0" />
        <span className="inline-flex h-9 w-fit items-center gap-2 rounded-full border border-[#2f3336] bg-black px-3 text-xs font-semibold text-[#8b98a5]">
          <Users className="size-3.5" />
          {t("exposureRadar.peopleDesk.records", { count: relationshipCount })}
        </span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <PanelMiniStat icon={<Target className="size-3.5" />} label={t("exposureRadar.peopleDesk.priority")} value={String(priorityCount)} />
        <PanelMiniStat icon={<Repeat2 className="size-3.5" />} label={t("exposureRadar.peopleDesk.repeat")} value={String(repeatCount)} />
        <PanelMiniStat icon={<Heart className="size-3.5" />} label={t("exposureRadar.peopleDesk.engaged")} value={String(engagedCount)} />
        <PanelMiniStat icon={<ShieldAlert className="size-3.5" />} label={t("exposureRadar.peopleDesk.avoid")} value={String(avoidCount)} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {topPeople.length ? topPeople.map((person) => (
          <button key={person.key} type="button" onClick={() => onFocus(person.latestItem.id)} className="rounded-2xl border border-[#2f3336] bg-black p-4 text-left transition hover:border-[#1d9bf0]/45">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-[#e7e9ea]">{person.name}</p>
                {person.handle ? <p className="mt-0.5 text-xs text-[#71767b]">@{person.handle}</p> : null}
              </div>
              <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold ${peopleRadarStageTone(person.stage)}`}>{t(`exposureRadar.peopleRadar.stage.${person.stage}`)}</span>
            </div>
            <p className="mt-3 text-xs leading-5 text-[#8b98a5]">{t("exposureRadar.peopleDesk.nextAction", { count: person.count, score: person.maxScore })}</p>
          </button>
        )) : (
          <p className="rounded-2xl border border-dashed border-[#2f3336] bg-black px-4 py-8 text-center text-sm text-[#71767b] lg:col-span-3">{t("exposureRadar.peopleDesk.empty")}</p>
        )}
      </div>
    </Card>
  );
}

export function MemoryAssetDeskCard({
  savedSignalsCount,
  draftCount,
  enabledPlanCount,
  effectiveTopics,
  contentSeeds,
}: {
  savedSignalsCount: number;
  draftCount: number;
  enabledPlanCount: number;
  effectiveTopics: string[];
  contentSeeds: ContentDraftApi[];
}) {
  const { t } = useT();
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <CardHeader title={t("exposureRadar.memoryAssets.title")} description={t("exposureRadar.memoryAssets.description")} className="mb-0" />
        <Link href="/content-library" className="inline-flex h-9 w-fit items-center gap-1 rounded-full bg-[#1d9bf0] px-3 text-sm font-semibold text-white hover:bg-[#1a8cd8]">
          {t("exposureRadar.memoryAssets.open")}
          <ArrowRight className="size-4" />
        </Link>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <PanelGrowthDeskMetric icon={<Bookmark className="size-3.5" />} label={t("exposureRadar.memoryAssets.metric.savedSignals")} value={String(savedSignalsCount)} detail={t("exposureRadar.memoryAssets.metric.savedSignalsDetail")} />
        <PanelGrowthDeskMetric icon={<FileText className="size-3.5" />} label={t("exposureRadar.memoryAssets.metric.drafts")} value={String(draftCount)} detail={t("exposureRadar.memoryAssets.metric.draftsDetail")} />
        <PanelGrowthDeskMetric icon={<Database className="size-3.5" />} label={t("exposureRadar.memoryAssets.metric.plans")} value={String(enabledPlanCount)} detail={t("exposureRadar.memoryAssets.metric.plansDetail")} />
        <PanelGrowthDeskMetric icon={<Sparkles className="size-3.5" />} label={t("exposureRadar.memoryAssets.metric.effectiveTopics")} value={String(effectiveTopics.length)} detail={t("exposureRadar.memoryAssets.metric.effectiveTopicsDetail")} />
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <PanelReviewList title={t("exposureRadar.memoryAssets.topics")} items={effectiveTopics} empty={t("exposureRadar.memoryAssets.emptyTopics")} />
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.memoryAssets.seeds")}</p>
          <div className="mt-3 space-y-2">
            {contentSeeds.length ? contentSeeds.map((draft) => (
              <div key={draft.id} className="rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2">
                <p className="line-clamp-1 text-xs font-semibold text-[#e7e9ea]">{draft.content_title || draft.content_direction || t("exposureRadar.contentDesk.content.untitled")}</p>
                <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-[#71767b]">{draft.generated_content || draft.content_direction || "-"}</p>
              </div>
            )) : (
              <p className="rounded-xl border border-dashed border-[#2f3336] px-3 py-6 text-center text-xs text-[#71767b]">{t("exposureRadar.memoryAssets.emptySeeds")}</p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

export function peopleRadarStageTone(stage: PeopleRadarStage) {
  switch (stage) {
    case "priority":
      return "border-[#f59e0b]/25 bg-[#f59e0b]/10 text-[#f6d96b]";
    case "repeat":
      return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
    case "engaged":
      return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
    case "watch":
      return "border-[#7856ff]/25 bg-[#7856ff]/10 text-[#c4b5fd]";
    case "avoid":
      return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
    default:
      return "border-[#2f3336] bg-[#16181c] text-[#8b98a5]";
  }
}

function accountHealthTone(status: AccountHealthScore["status"]) {
  if (status === "healthy") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  if (status === "watch") return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
  return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
}

function experimentTone(tone: GrowthExperiment["tone"]) {
  if (tone === "green") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  if (tone === "amber") return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
  return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
}

function PanelMiniStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
      <p className="flex items-center gap-1 text-[11px] text-[#71767b]">{icon}{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[#e7e9ea]">{value}</p>
    </div>
  );
}

function PanelGrowthDeskMetric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-[#71767b]">{icon}{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs leading-5 text-[#71767b]">{detail}</p>
    </div>
  );
}

function PanelReviewList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
      <p className="text-sm font-semibold text-[#e7e9ea]">{title}</p>
      <div className="mt-3 space-y-2">
        {items.length ? items.map((item) => (
          <p key={item} className="rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2 text-xs leading-5 text-[#8b98a5]">{item}</p>
        )) : (
          <p className="rounded-xl border border-dashed border-[#2f3336] px-3 py-6 text-center text-xs text-[#71767b]">{empty}</p>
        )}
      </div>
    </div>
  );
}
