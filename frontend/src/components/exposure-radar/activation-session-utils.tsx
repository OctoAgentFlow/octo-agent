import type { ReactNode } from "react";
import { BarChart3, Bot, CheckCircle2, Database, MessageCircle, RefreshCw, Search, SlidersHorizontal, Sparkles, Target, TrendingUp, Users } from "lucide-react";

import type { DailyActionPlanItem, DailyDeskFocusKey, FirstDayActivationAction, FirstDayActivationMode, LoadState, SessionFocusKey, WorkbenchStats } from "@/components/exposure-radar/types";

export function dailyDeskFocusKey({
  selectedAccountID,
  selectedBotID,
  strategyReady,
  stats,
  moves,
  recentBackfilled,
}: {
  selectedAccountID: number;
  selectedBotID: number;
  strategyReady: boolean;
  stats: WorkbenchStats;
  moves: DailyActionPlanItem[];
  recentBackfilled: number;
}): DailyDeskFocusKey {
  if (!selectedAccountID || !selectedBotID) return "setup";
  if (!strategyReady) return "strategy";
  if (stats.actNow > 0 || moves.length > 0) return "handle";
  if (stats.handled > 0 && recentBackfilled === 0) return "backfill";
  return "review";
}

export function dailyDeskFocusAnchor(key: DailyDeskFocusKey) {
  if (key === "setup") return "#radar-setup";
  if (key === "strategy") return "#radar-strategy";
  if (key === "backfill" || key === "review") return "#radar-results";
  return "#radar-workbench";
}

export function dailyDeskRhythmAnchor(step: string) {
  if (step === "scan") return "#radar-setup";
  if (step === "save") return "#radar-people";
  if (step === "review") return "#radar-results";
  return "#radar-workbench";
}

export function firstDayActivationMode({
  selectedAccountID,
  selectedBotID,
  strategyReady,
  itemsCount,
  movesCount,
  handledCount,
  resultCount,
}: {
  selectedAccountID: number;
  selectedBotID: number;
  strategyReady: boolean;
  itemsCount: number;
  movesCount: number;
  handledCount: number;
  resultCount: number;
}): FirstDayActivationMode {
  if (!selectedAccountID || !selectedBotID) return "setup";
  if (!strategyReady) return "strategy";
  if (!itemsCount && !movesCount) return "signals";
  if (!handledCount) return "handle";
  if (!resultCount) return "result";
  return "complete";
}

export function firstDayActivationActions(mode: FirstDayActivationMode, onRefresh: () => void, loadState: LoadState, onStartSample: () => void): FirstDayActivationAction[] {
  const refreshAction = { key: "refresh", icon: <RefreshCw className={`size-4 ${loadState === "loading" ? "animate-spin" : ""}`} />, onClick: onRefresh, disabled: loadState === "loading", primary: true };
  const sampleAction = { key: "sample", icon: <Sparkles className="size-4" />, onClick: onStartSample };
  switch (mode) {
    case "setup":
      return [
        { key: "accounts", href: "/accounts", icon: <Users className="size-4" />, primary: true },
        { key: "bots", href: "/oaf-bots", icon: <Bot className="size-4" /> },
        { key: "selectors", href: "#radar-setup", icon: <Target className="size-4" /> },
      ];
    case "strategy":
      return [
        { key: "strategy", href: "#radar-strategy", icon: <Target className="size-4" />, primary: true },
        { key: "refresh", icon: <RefreshCw className={`size-4 ${loadState === "loading" ? "animate-spin" : ""}`} />, onClick: onRefresh, disabled: loadState === "loading" },
      ];
    case "signals":
      return [
        refreshAction,
        sampleAction,
        { key: "filters", href: "#radar-setup", icon: <SlidersHorizontal className="size-4" /> },
        { key: "strategy", href: "#radar-strategy", icon: <Target className="size-4" /> },
      ];
    case "handle":
      return [
        { key: "workbench", href: "#radar-workbench", icon: <MessageCircle className="size-4" />, primary: true },
        { key: "people", href: "#radar-people", icon: <Users className="size-4" /> },
      ];
    case "result":
      return [
        { key: "results", href: "#radar-results", icon: <BarChart3 className="size-4" />, primary: true },
        { key: "workbench", href: "#radar-workbench", icon: <MessageCircle className="size-4" /> },
      ];
    default:
      return [
        { key: "review", href: "#radar-results", icon: <CheckCircle2 className="size-4" />, primary: true },
        refreshAction,
      ];
  }
}

export function sessionFocusOptions(t: (key: string) => string): Array<{ key: SessionFocusKey; icon: ReactNode; title: string; description: string }> {
  return [
    { key: "relationships", icon: <Users className="size-4" />, title: t("exposureRadar.sessionFocus.relationships.title"), description: t("exposureRadar.sessionFocus.relationships.description") },
    { key: "research", icon: <Search className="size-4" />, title: t("exposureRadar.sessionFocus.research.title"), description: t("exposureRadar.sessionFocus.research.description") },
    { key: "traffic", icon: <TrendingUp className="size-4" />, title: t("exposureRadar.sessionFocus.traffic.title"), description: t("exposureRadar.sessionFocus.traffic.description") },
    { key: "memory", icon: <Database className="size-4" />, title: t("exposureRadar.sessionFocus.memory.title"), description: t("exposureRadar.sessionFocus.memory.description") },
  ];
}

export function appendOperatorNote(current: string, addition: string) {
  const trimmed = current.trim();
  return trimmed ? `${trimmed}\n- ${addition}` : `- ${addition}`;
}
