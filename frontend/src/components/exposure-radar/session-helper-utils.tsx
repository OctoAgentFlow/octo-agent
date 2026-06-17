import { BarChart3, BookmarkPlus, MessageCircle, Target } from "lucide-react";

import type { ExposureRadarItemApi, ExposureRadarManualRecordApi } from "@/services/exposure-radar.service";
import { formatDateTime } from "@/lib/timezone";
import { compactTitle, isManualActionHandled, isRadarItemSaved } from "@/components/exposure-radar/radar-signal-utils";
import { type TranslationFn } from "@/components/exposure-radar/radar-utils";
import type { ManualActionState, SessionFocusKey, WorkbenchStats } from "@/components/exposure-radar/types";

export function buildOperatorScratchpadSuggestions(
  item: ExposureRadarItemApi | undefined,
  manualState: ManualActionState | undefined,
  t: TranslationFn,
) {
  if (!item) {
    return [
      t("exposureRadar.scratchpad.suggestion.strategy"),
      t("exposureRadar.scratchpad.suggestion.sample"),
      t("exposureRadar.scratchpad.suggestion.refresh"),
    ];
  }
  const topic = compactTitle(item.topic_name || item.title);
  return [
    item.generated_comment ? t("exposureRadar.scratchpad.suggestion.copy", { topic }) : t("exposureRadar.scratchpad.suggestion.inspect", { topic }),
    manualState?.handled ? t("exposureRadar.scratchpad.suggestion.backfill", { topic }) : t("exposureRadar.scratchpad.suggestion.handle", { topic }),
    t("exposureRadar.scratchpad.suggestion.memory", { topic }),
  ];
}

export function buildNextSessionCarryovers(
  items: ExposureRadarItemApi[],
  manualActionStates: Record<string, ManualActionState>,
  sessionFocus: SessionFocusKey,
  operatorNote: string,
  t: TranslationFn,
) {
  const byPriority = [...items].sort((a, b) => b.score - a.score);
  const needsBackfill = byPriority.find((item) => isManualActionHandled(item, manualActionStates[item.id]) && !manualActionStates[item.id]?.resultCheckedAt);
  const needsMemory = byPriority.find((item) => (item.generated_comment || manualActionStates[item.id]?.handled) && !manualActionStates[item.id]?.saved && !item.saved_memory_id);
  const nextOpportunity = byPriority.find((item) => !isManualActionHandled(item, manualActionStates[item.id]));
  return [
    {
      key: "focus",
      icon: <Target className="size-4" />,
      title: t("exposureRadar.carryover.focus.title"),
      detail: t(`exposureRadar.carryover.focus.${sessionFocus}`),
    },
    {
      key: "backfill",
      icon: <BarChart3 className="size-4" />,
      title: t("exposureRadar.carryover.backfill.title"),
      detail: needsBackfill ? t("exposureRadar.carryover.backfill.detail", { signal: compactTitle(needsBackfill.title) }) : t("exposureRadar.carryover.backfill.empty"),
      itemID: needsBackfill?.id,
    },
    {
      key: "next",
      icon: needsMemory ? <BookmarkPlus className="size-4" /> : <MessageCircle className="size-4" />,
      title: needsMemory ? t("exposureRadar.carryover.memory.title") : t("exposureRadar.carryover.next.title"),
      detail: needsMemory
        ? t("exposureRadar.carryover.memory.detail", { signal: compactTitle(needsMemory.title) })
        : nextOpportunity
          ? t("exposureRadar.carryover.next.detail", { signal: compactTitle(nextOpportunity.title) })
          : operatorNote.trim()
            ? t("exposureRadar.carryover.next.note")
            : t("exposureRadar.carryover.next.empty"),
      itemID: needsMemory?.id || nextOpportunity?.id,
    },
  ];
}

export function buildDailyRecapText({
  items,
  stats,
  manualActionStates,
  recentRecords,
  operatorNote,
  usingSampleMode,
  timeZone,
  t,
}: {
  items: ExposureRadarItemApi[];
  stats: WorkbenchStats;
  manualActionStates: Record<string, ManualActionState>;
  recentRecords: ExposureRadarManualRecordApi[];
  operatorNote: string;
  usingSampleMode: boolean;
  timeZone: string;
  t: TranslationFn;
}) {
  const reviewed = items.filter((item) => {
    const state = manualActionStates[item.id];
    return Boolean(state?.opened || state?.copied || state?.saved || state?.handled || item.generated_comment || item.review_task_id);
  }).length;
  const saved = items.filter((item) => isRadarItemSaved(item, new Set()) || manualActionStates[item.id]?.saved).length;
  const backfilled = items.filter((item) => manualActionStates[item.id]?.resultCheckedAt).length + recentRecords.filter((record) => record.result_checked_at || record.result_score).length;
  const topSignals = items.slice(0, 3).map((item, index) => `${index + 1}. ${compactTitle(item.title)} (${item.score})`);
  return [
    t("exposureRadar.dailyRecap.text.title"),
    t("exposureRadar.dailyRecap.text.generatedAt", { time: formatDateTime(new Date().toISOString(), timeZone) }),
    t("exposureRadar.dailyRecap.text.mode", { mode: usingSampleMode ? t("exposureRadar.sample.badge") : t("exposureRadar.dailyRecap.text.realMode") }),
    "",
    t("exposureRadar.dailyRecap.text.metrics"),
    `- ${t("exposureRadar.dailyRecap.text.signals", { count: items.length })}`,
    `- ${t("exposureRadar.dailyRecap.text.reviewed", { count: reviewed })}`,
    `- ${t("exposureRadar.dailyRecap.text.pending", { count: stats.pending })}`,
    `- ${t("exposureRadar.dailyRecap.text.handled", { count: stats.handled })}`,
    `- ${t("exposureRadar.dailyRecap.text.saved", { count: saved })}`,
    `- ${t("exposureRadar.dailyRecap.text.backfilled", { count: backfilled })}`,
    "",
    t("exposureRadar.dailyRecap.text.topSignals"),
    ...(topSignals.length ? topSignals : [`- ${t("exposureRadar.dailyRecap.text.noSignals")}`]),
    "",
    t("exposureRadar.dailyRecap.text.operatorNotes"),
    operatorNote.trim() || t("exposureRadar.dailyRecap.text.noNotes"),
    "",
    t("exposureRadar.dailyRecap.text.next"),
  ].join("\n");
}

export function firstLoopStepKey(item?: ExposureRadarItemApi, manualState?: ManualActionState, firstLoopDone?: boolean) {
  if (firstLoopDone || manualState?.resultCheckedAt) return "done";
  if (!item) return "recover";
  if (!item.generated_comment) return "generate";
  if (!manualState?.copied) return "copy";
  if (!manualState?.opened) return "open";
  if (!isManualActionHandled(item, manualState)) return "handle";
  return "backfill";
}
