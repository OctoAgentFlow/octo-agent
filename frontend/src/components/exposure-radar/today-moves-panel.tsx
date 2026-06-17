"use client";

import { BookmarkPlus, CheckCircle2, Clock3, MessageCircle, MessageSquarePlus, Search, ShieldAlert, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";
import type { ExposureRadarItemApi } from "@/services/exposure-radar.service";
import { formatCompact, formatVelocityLabel, normalizeQualityStage, qualityStageClass } from "@/components/exposure-radar/radar-utils";
import type { DailyActionPlanItem, DailyActionType, DailyTaskStatus, WorkbenchStats } from "@/components/exposure-radar/types";

type TodayMovesPanelProps = {
  moves: DailyActionPlanItem[];
  stats: WorkbenchStats;
  activeID: string;
  onFocus: (itemID: string) => void;
  onTaskStatus: (item: ExposureRadarItemApi, taskStatus: DailyTaskStatus) => void;
  getReplyAngle: (item: ExposureRadarItemApi) => { title: string; tone: string } | undefined;
};

export function TodayMovesPanel({
  moves,
  stats,
  activeID,
  onFocus,
  onTaskStatus,
  getReplyAngle,
}: TodayMovesPanelProps) {
  const { t } = useT();
  const replyMoves = moves.filter((entry) => entry.action === "publish_reply" || entry.action === "generate_reply").length;
  const memoryMoves = moves.filter((entry) => entry.action === "save_memory").length;
  const inspectMoves = moves.length - replyMoves - memoryMoves;

  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <CardHeader title={t("exposureRadar.todayMoves.title")} description={t("exposureRadar.todayMoves.description")} className="mb-0" />
        <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
          <ActionPlanMetric label={t("exposureRadar.todayMoves.metric.moves")} value={moves.length} />
          <ActionPlanMetric label={t("exposureRadar.todayMoves.metric.actNow")} value={stats.actNow} />
          <ActionPlanMetric label={t("exposureRadar.todayMoves.metric.handled")} value={stats.handled} />
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <LeaderboardPill label={t("exposureRadar.actionPlan.metric.reply")} value={replyMoves} tone="border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]" />
        <LeaderboardPill label={t("exposureRadar.actionPlan.metric.save")} value={memoryMoves} tone="border-[#7856ff]/25 bg-[#7856ff]/10 text-[#c4b5fd]" />
        <LeaderboardPill label={t("exposureRadar.actionPlan.metric.inspect")} value={inspectMoves} tone="border-[#2f3336] bg-[#16181c] text-[#8b98a5]" />
      </div>
      {moves.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-[#2f3336] bg-black px-4 py-8 text-center text-sm text-[#71767b]">
          {t("exposureRadar.todayMoves.empty")}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {moves.map((entry, index) => {
            const item = entry.item;
            const replyAngle = getReplyAngle(item);
            const qualityStage = normalizeQualityStage(item.quality_stage, item);
            const selected = activeID === item.id;
            return (
              <div key={item.id} className={`rounded-2xl border p-4 transition ${selected ? "border-[#1d9bf0]/55 bg-[#1d9bf0]/10" : "border-[#2f3336] bg-black"}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex size-7 items-center justify-center rounded-full border border-[#1d9bf0]/35 bg-[#1d9bf0]/10 text-xs font-bold text-[#8ecdf8]">{index + 1}</span>
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${actionPlanTone(entry.action)}`}>
                        {actionPlanIcon(entry.action)}
                        {t(`exposureRadar.actionPlan.action.${entry.action}`)}
                      </span>
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${qualityStageClass(qualityStage)}`}>
                        <Zap className="size-3.5" />
                        {t(`exposureRadar.qualityStage.${qualityStage}`)}
                      </span>
                    </div>
                    <h2 className="mt-3 line-clamp-2 text-sm font-semibold leading-5 text-[#e7e9ea]">{item.title}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[#71767b]">
                      {item.author_handle ? <span>@{item.author_handle}</span> : null}
                      <span>{item.score} {t("exposureRadar.card.score")}</span>
                      <span>{formatVelocityLabel(item.views_per_min, t("exposureRadar.card.velocitySampling"))}</span>
                      {typeof item.followers_count === "number" && item.followers_count > 0 ? <span>{formatCompact(item.followers_count)} {t("exposureRadar.todayMoves.followers")}</span> : null}
                    </div>
                  </div>
                  <Button type="button" size="sm" variant={selected ? "default" : "outline"} onClick={() => onFocus(item.id)}>
                    <Search className="size-3.5" />
                    {t("exposureRadar.todayMoves.focus")}
                  </Button>
                </div>
                <div className="mt-3 rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#71767b]">{t("exposureRadar.todayMoves.why")}</p>
                  <p className="mt-1 text-xs leading-5 text-[#c9d1d9]">{t(`exposureRadar.actionPlan.reason.${entry.reason}`)}</p>
                </div>
                {replyAngle ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#1d9bf0]/20 bg-[#08131f] px-3 py-2">
                    <MessageCircle className="size-3.5 text-[#8ecdf8]" />
                    <span className="text-[11px] font-semibold text-[#8ecdf8]">{t("exposureRadar.todayMoves.replyAngle")}</span>
                    <span className="text-xs text-[#e7e9ea]">{replyAngle.title}</span>
                    <span className="text-[11px] text-[#71767b]">{replyAngle.tone}</span>
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2 border-t border-[#2f3336] pt-3">
                  <Button type="button" size="sm" variant="outline" onClick={() => onTaskStatus(item, "done")}>
                    <CheckCircle2 className="size-3.5" />
                    {t("exposureRadar.todayMoves.done")}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => onTaskStatus(item, "later")}>
                    <Clock3 className="size-3.5" />
                    {t("exposureRadar.todayMoves.later")}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => onTaskStatus(item, "skipped")}>
                    <ShieldAlert className="size-3.5" />
                    {t("exposureRadar.todayMoves.skip")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function ActionPlanMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#2f3336] bg-black px-3 py-2">
      <p className="truncate text-[11px] text-[#71767b]">{label}</p>
      <p className="text-sm font-semibold text-[#e7e9ea]">{value}</p>
    </div>
  );
}

function LeaderboardPill({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>
      <span>{label}</span>
      <span className="rounded-full bg-black/25 px-1.5 py-0.5 text-[10px]">{value}</span>
    </span>
  );
}

function actionPlanTone(action: DailyActionType) {
  switch (action) {
    case "publish_reply":
      return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
    case "generate_reply":
      return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
    case "save_memory":
      return "border-[#7856ff]/25 bg-[#7856ff]/10 text-[#c4b5fd]";
    case "review_fit":
      return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
    default:
      return "border-[#2f3336] bg-[#16181c] text-[#8b98a5]";
  }
}

function actionPlanIcon(action: DailyActionType) {
  switch (action) {
    case "publish_reply":
      return <CheckCircle2 className="size-3.5" />;
    case "generate_reply":
      return <MessageSquarePlus className="size-3.5" />;
    case "save_memory":
      return <BookmarkPlus className="size-3.5" />;
    case "review_fit":
      return <ShieldAlert className="size-3.5" />;
    default:
      return <Search className="size-3.5" />;
  }
}
