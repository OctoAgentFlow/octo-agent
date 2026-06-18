"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Bot, CheckCircle2, Clock3, FilePlus2, Info, ListChecks, Lock, RefreshCw, Rocket, Sparkles, Trash2, WalletCards, Workflow } from "lucide-react";

import { SectionCard } from "@/components/dashboard/section-card";
import { Button } from "@/components/ui/button";
import { formatDateTime, usePreferredTimeZone } from "@/lib/timezone";
import type { AccountListItem } from "@/services/account.service";
import type { ContentDraftPlanApi } from "@/services/content-drafts.service";
import type { ReviewQueueItemApi } from "@/services/review-queue.service";
import type { OAFBot } from "@/types/oaf-bot";

type TranslationFn = (key: string, params?: Record<string, string | number>) => string;
type WizardStep = "identity" | "brand" | "style" | "topics" | "goals" | "test";
type BotAutomationType = "post" | "reply" | "comment" | "dm";
type BotAutomationState = {
  type: BotAutomationType;
  enabled: boolean;
  configured: boolean;
  mode: "manual" | "review" | "autopilot";
  href: string;
};
type QueueSummary = { total: number; pendingReview: number; readyToPublish: number; failed: number; published: number };
type ContentDraftReadinessStep = { key: "account" | "content" | "planner" | "autopilot"; ready: boolean; href: string };
type MatrixFilterKey = "all" | "unbound" | "auto_post_not_ready" | "negative_feedback" | "review_backlog";
type BotMatrixRow = {
  bot: OAFBot;
  account?: AccountListItem;
  completion: number;
  activeContentCount: number;
  queueSummary: QueueSummary;
  plan?: ContentDraftPlanApi;
  contentDraftReady: boolean;
  monthlyUsage: number;
  negativeFeedback: number;
  inspectionFlags: string[];
};
type MatrixInspectionItem = { key: MatrixFilterKey; count: number; tone: "neutral" | "warning" | "danger" };

const matrixFilters: MatrixFilterKey[] = ["all", "unbound", "auto_post_not_ready", "negative_feedback", "review_backlog"];

export function OAFBotFocusPanel({
  t,
  bot,
  botCount,
  account,
  completion,
  nextStep,
  canCreate,
  canTest,
  formChanged,
  activeContentCount,
  queueSummary,
  onCreate,
  onStepChange,
  onTest,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  bot: OAFBot | null;
  botCount: number;
  account?: AccountListItem;
  completion: number;
  nextStep: WizardStep;
  canCreate: boolean;
  canTest: boolean;
  formChanged: boolean;
  activeContentCount: number;
  queueSummary: QueueSummary;
  onCreate: () => void;
  onStepChange: (step: WizardStep) => void;
  onTest: () => void;
}) {
  const hasBot = Boolean(bot);
  const ready = hasBot && completion >= 60;
  const primaryAction = !hasBot
    ? t("oafBots.focus.action.create")
    : canTest && !formChanged
      ? t("oafBots.focus.action.test")
      : t("oafBots.focus.action.continue", { step: t(`oafBots.wizard.${nextStep}`) });
  const primaryDisabled = !hasBot && !canCreate;

  const handlePrimary = () => {
    if (!hasBot) {
      onCreate();
      return;
    }
    if (canTest && !formChanged) {
      onTest();
      return;
    }
    onStepChange(nextStep);
  };

  const signals = [
    {
      icon: <Bot className="size-4" />,
      title: t("oafBots.focus.signal.persona.title"),
      value: t(ready ? "oafBots.focus.signal.persona.ready" : "oafBots.focus.signal.persona.needsWork", { percent: completion }),
      tone: ready ? "success" : "warning",
    },
    {
      icon: <ListChecks className="size-4" />,
      title: t("oafBots.focus.signal.dailyQueue.title"),
      value: hasBot ? t("oafBots.focus.signal.dailyQueue.ready") : t("oafBots.focus.signal.dailyQueue.needsBot"),
      tone: hasBot ? "info" : "neutral",
    },
    {
      icon: <FilePlus2 className="size-4" />,
      title: t("oafBots.focus.signal.memory.title"),
      value: t("oafBots.focus.signal.memory.value", { count: activeContentCount }),
      tone: activeContentCount > 0 ? "success" : "neutral",
    },
    {
      icon: <Workflow className="size-4" />,
      title: t("oafBots.focus.signal.queue.title"),
      value: t("oafBots.focus.signal.queue.value", { count: queueSummary.pendingReview }),
      tone: queueSummary.pendingReview > 0 ? "warning" : "neutral",
    },
  ] as const;

  return (
    <section className="rounded-2xl border border-[#1d9bf0]/20 bg-[#06111d] p-5 md:p-6">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-[#8ecdf8]">
            <Sparkles className="size-4" />
            {t("oafBots.focus.kicker")}
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-normal text-[#e7e9ea]">
            {hasBot
              ? t("oafBots.focus.title.selected", { name: bot?.name || t("oafBots.preview.unnamed") })
              : t("oafBots.focus.title.empty")}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#8b98a5]">
            {t("oafBots.focus.description")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={handlePrimary} disabled={primaryDisabled}>
              <Sparkles className="size-4" />
              {primaryAction}
            </Button>
            <Link href={bot?.id ? `/content-drafts?panel=generate&bot_id=${bot.id}` : "/content-drafts?panel=generate"} className="inline-flex">
              <Button type="button" variant="outline">
                <ListChecks className="size-4" />
                {t("oafBots.focus.dailyQueueCta")}
              </Button>
            </Link>
            <Link href="/handling-list" className="inline-flex">
              <Button type="button" variant="outline">
                <Workflow className="size-4" />
                {t("oafBots.focus.queueCta")}
              </Button>
            </Link>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-[#8b98a5]">
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
              {t("oafBots.focus.meta.bots", { count: botCount })}
            </span>
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
              {account ? t("oafBots.focus.meta.account", { account: `@${account.username}` }) : t("oafBots.focus.meta.noAccount")}
            </span>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {signals.map((signal) => (
            <FocusSignal key={signal.title} icon={signal.icon} title={signal.title} value={signal.value} tone={signal.tone} />
          ))}
        </div>
      </div>
    </section>
  );
}

function FocusSignal({
  icon,
  title,
  value,
  tone,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  tone: "success" | "warning" | "info" | "neutral";
}) {
  const toneClass = {
    success: "border-emerald-300/20 bg-emerald-400/10 text-emerald-100",
    warning: "border-amber-300/20 bg-amber-400/10 text-amber-100",
    info: "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-blue-100",
    neutral: "border-white/10 bg-black/20 text-[#8b98a5]",
  }[tone];
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="flex items-center gap-2">
        <span className={`inline-flex size-8 shrink-0 items-center justify-center rounded-full border ${toneClass}`}>{icon}</span>
        <p className="truncate text-xs font-semibold text-[#e7e9ea]">{title}</p>
      </div>
      <p className="mt-2 text-sm leading-5 text-[#8b98a5]">{value}</p>
    </div>
  );
}

export function ListStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-black px-2.5 py-2">
      <p className="text-[11px] text-[#71767b]">{label}</p>
      <p className="mt-1 text-base font-bold text-[#e7e9ea]">{value}</p>
    </div>
  );
}

export function BotStatusPill({ tone, label }: { tone: "success" | "warning" | "neutral"; label: string }) {
  const toneClass =
    tone === "success"
      ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
      : tone === "warning"
        ? "border-amber-300/20 bg-amber-400/10 text-amber-100"
        : "border-[#2f3336] bg-black text-[#71767b]";
  return <span className={`rounded-full border px-2.5 py-1 text-[11px] leading-none ${toneClass}`}>{label}</span>;
}

export function BotMatrixPanel({
  t,
  rows,
  allRowsCount,
  summary,
  inspectionItems,
  activeFilter,
  onFilterChange,
  loading,
  enabled,
  selectedID,
  onSelect,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  rows: BotMatrixRow[];
  allRowsCount: number;
  summary: { bound: number; ready: number; review: number; usage: number; negativeFeedback: number };
  inspectionItems: MatrixInspectionItem[];
  activeFilter: MatrixFilterKey;
  onFilterChange: (filter: MatrixFilterKey) => void;
  loading: boolean;
  enabled: boolean;
  selectedID: number | null;
  onSelect: (bot: OAFBot) => void;
}) {
  return (
    <SectionCard title={t("oafBots.matrix.title")} description={t("oafBots.matrix.description")} className="bg-black p-4 md:p-5">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="grid gap-2 sm:grid-cols-5 lg:min-w-[720px]">
            <MatrixMetric label={t("oafBots.matrix.totalBots")} value={allRowsCount} />
            <MatrixMetric label={t("oafBots.matrix.boundBots")} value={summary.bound} />
            <MatrixMetric label={t("oafBots.matrix.readyBots")} value={summary.ready} />
            <MatrixMetric label={t("oafBots.matrix.pendingReview")} value={summary.review} />
            <MatrixMetric label={t("oafBots.matrix.aiUsage")} value={summary.usage} />
          </div>
          <div className={`rounded-2xl border p-3 text-sm leading-6 ${enabled ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100" : "border-amber-300/20 bg-amber-400/10 text-amber-100"}`}>
            <div className="flex items-start gap-2">
              {enabled ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <Lock className="mt-0.5 size-4 shrink-0" />}
              <div>
                <p className="font-semibold">{enabled ? t("oafBots.matrix.enabledTitle") : t("oafBots.matrix.lockedTitle")}</p>
                <p className="text-xs opacity-80">{enabled ? t("oafBots.matrix.enabledDescription") : t("oafBots.matrix.lockedDescription")}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-[#e7e9ea]">{t("oafBots.matrix.inspectionTitle")}</p>
              <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("oafBots.matrix.inspectionDescription")}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {matrixFilters.map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => onFilterChange(filter)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    activeFilter === filter
                      ? "border-[#1d9bf0] bg-[#1d9bf0]/15 text-[#8ecdf8]"
                      : "border-[#2f3336] bg-black text-[#b6bec5] hover:bg-[#16181c]"
                  }`}
                >
                  {t(`oafBots.matrix.filters.${filter}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-4">
            {inspectionItems.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onFilterChange(item.key)}
                className={`rounded-xl border p-3 text-left transition hover:bg-black ${
                  activeFilter === item.key
                    ? "border-[#1d9bf0] bg-[#1d9bf0]/10"
                    : item.tone === "danger"
                      ? "border-rose-300/25 bg-rose-400/8"
                      : item.tone === "warning"
                        ? "border-amber-300/25 bg-amber-400/8"
                        : "border-[#2f3336] bg-black"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[#e7e9ea]">{t(`oafBots.matrix.inspection.${item.key}.title`)}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${item.count > 0 ? "bg-[#1d9bf0]/15 text-[#8ecdf8]" : "bg-[#202327] text-[#71767b]"}`}>
                    {item.count}
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-[#71767b]">{t(`oafBots.matrix.inspection.${item.key}.description`)}</p>
              </button>
            ))}
          </div>
        </div>

        {loading ? <p className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3 text-sm text-[#71767b]">{t("oafBots.matrix.loading")}</p> : null}

        {allRowsCount === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#2f3336] bg-[#0f1419] p-5 text-sm leading-6 text-[#71767b]">
            {t("oafBots.matrix.empty")}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#2f3336] bg-[#0f1419] p-5 text-sm leading-6 text-[#71767b]">
            {t("oafBots.matrix.filteredEmpty")}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[#2f3336]">
            <div className="border-b border-[#2f3336] bg-[#0f1419] px-4 py-3 text-xs text-[#71767b]">
              {t("oafBots.matrix.filteredCount", { count: rows.length, total: allRowsCount })}
            </div>
            <table className="min-w-[980px] w-full text-left text-sm">
              <thead className="bg-[#0f1419] text-xs uppercase text-[#71767b]">
                <tr>
                  <th className="px-4 py-3 font-medium">{t("oafBots.matrix.columns.bot")}</th>
                  <th className="px-4 py-3 font-medium">{t("oafBots.matrix.columns.account")}</th>
                  <th className="px-4 py-3 font-medium">{t("oafBots.matrix.columns.persona")}</th>
                  <th className="px-4 py-3 font-medium">{t("oafBots.matrix.columns.contentDraft")}</th>
                  <th className="px-4 py-3 font-medium">{t("oafBots.matrix.columns.queue")}</th>
                  <th className="px-4 py-3 font-medium">{t("oafBots.matrix.columns.signals")}</th>
                  <th className="px-4 py-3 font-medium">{t("oafBots.matrix.columns.action")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2f3336]">
                {rows.map((row) => {
                  const selected = selectedID === row.bot.id;
                  return (
                    <tr key={row.bot.id} className={selected ? "bg-[#1d9bf0]/8" : "bg-black"}>
                      <td className="px-4 py-3 align-top">
                        <p className="max-w-56 truncate font-semibold text-[#e7e9ea]">{row.bot.name || t("oafBots.preview.unnamed")}</p>
                        <p className="mt-1 text-xs text-[#71767b]">{row.bot.primary_language || "zh-CN"} · {row.bot.language_strategy || "follow_context"}</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        {row.account ? (
                          <BotStatusPill tone="success" label={`@${row.account.username}`} />
                        ) : (
                          <BotStatusPill tone="warning" label={t("oafBots.matrix.unbound")} />
                        )}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-[#2f3336]">
                            <div className={`h-full ${row.completion >= 80 ? "bg-emerald-300" : row.completion >= 60 ? "bg-[#1d9bf0]" : "bg-amber-300"}`} style={{ width: `${row.completion}%` }} />
                          </div>
                          <span className="text-xs text-[#e7e9ea]">{row.completion}%</span>
                        </div>
                        <p className="mt-1 max-w-48 truncate text-xs text-[#71767b]">{row.bot.topics.slice(0, 3).join(" / ") || t("oafBots.matrix.noTopics")}</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <BotStatusPill tone={row.contentDraftReady ? "success" : "warning"} label={row.contentDraftReady ? t("oafBots.matrix.ready") : t("oafBots.matrix.needsSetup")} />
                        <p className="mt-1 text-xs text-[#71767b]">{t("oafBots.matrix.contentCount", { count: row.activeContentCount })}</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="text-xs text-[#e7e9ea]">{t("oafBots.matrix.queueValue", { review: row.queueSummary.pendingReview, ready: row.queueSummary.readyToPublish })}</p>
                        <p className="mt-1 text-xs text-[#71767b]">{t("oafBots.matrix.failedValue", { count: row.queueSummary.failed })}</p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="text-xs text-[#e7e9ea]">{t("oafBots.matrix.usageValue", { count: row.monthlyUsage })}</p>
                        <p className={`mt-1 text-xs ${row.negativeFeedback > 0 ? "text-amber-100" : "text-[#71767b]"}`}>
                          {t("oafBots.matrix.negativeFeedback", { count: row.negativeFeedback })}
                        </p>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <button type="button" onClick={() => onSelect(row.bot)} className="rounded-full border border-[#2f3336] px-3 py-1.5 text-xs font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
                          {selected ? t("oafBots.matrix.selected") : t("oafBots.matrix.inspect")}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function MatrixMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
      <p className="text-xs text-[#71767b]">{label}</p>
      <p className="mt-1 text-lg font-bold text-[#e7e9ea]">{value}</p>
    </div>
  );
}

export function BotRelationshipCard({
  t,
  bot,
  account,
  completion,
  automationStates,
  contentDraftPlan,
  activeContentCount,
  totalContentCount,
  contentDraftReadiness,
  queueItems,
  queueSummary,
  loading,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  bot: OAFBot | null;
  account?: AccountListItem;
  completion: number;
  automationStates: BotAutomationState[];
  contentDraftPlan?: ContentDraftPlanApi;
  activeContentCount: number;
  totalContentCount: number;
  contentDraftReadiness: ContentDraftReadinessStep[];
  queueItems: ReviewQueueItemApi[];
  queueSummary: QueueSummary;
  loading: boolean;
}) {
  const recentItems = queueItems.slice(0, 3);
  const enabledAutomationCount = automationStates.filter((item) => item.enabled).length;
  const contentDraftReady = contentDraftReadiness.length > 0 && contentDraftReadiness.every((item) => item.ready);
  const dailyQueueReady = Boolean(bot);
  const hasQueueActivity = queueSummary.pendingReview > 0 || queueSummary.readyToPublish > 0;

  return (
    <SectionCard title={t("oafBots.relationship.title")} description={t("oafBots.relationship.description")} className="bg-black p-4 md:p-5">
      {!bot ? (
        <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-amber-300/20 bg-amber-400/10 text-amber-100">
              <Info className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[#e7e9ea]">{t("oafBots.relationship.draftTitle")}</p>
              <p className="mt-1 text-sm leading-relaxed text-[#71767b]">{t("oafBots.relationship.draftDescription")}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#1d9bf0]">
                  <Bot className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-[#71767b]">{t("oafBots.relationship.currentBot")}</p>
                  <p className="mt-1 truncate text-sm font-semibold text-[#e7e9ea]">{bot.name}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#71767b]">
                    {account
                      ? t("oafBots.relationship.accountBoundDescription", { account: `@${account.username}` })
                      : t("oafBots.relationship.accountMissingDescription")}
                  </p>
                </div>
              </div>
              <Link href="/accounts" className="shrink-0 text-xs font-semibold text-[#1d9bf0] hover:text-[#8ecdf8]">
                {account ? t("oafBots.relationship.manageAccount") : t("oafBots.relationship.bindAccount")}
              </Link>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              <RelationshipMetric
                icon={<WalletCards className="size-4" />}
                label={t("oafBots.relationship.boundAccount")}
                value={account ? `@${account.username}` : t("oafBots.relationship.noAccount")}
                tone={account ? "success" : "warning"}
              />
              <RelationshipMetric
                icon={<Workflow className="size-4" />}
                label={t("oafBots.relationship.enabledAutomations")}
                value={t("oafBots.relationship.enabledAutomationsValue", { count: enabledAutomationCount })}
                tone={enabledAutomationCount > 0 ? "success" : "neutral"}
              />
              <RelationshipMetric
                icon={<ListChecks className="size-4" />}
                label={t("oafBots.relationship.queueItems")}
                value={t("oafBots.relationship.queueItemsValue", { count: queueSummary.total })}
                tone={queueSummary.failed > 0 ? "warning" : queueSummary.total > 0 ? "info" : "neutral"}
              />
            </div>
            {account ? (
              <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#2f3336] bg-black px-3 py-1 text-xs text-[#71767b]">
                <span className="size-1.5 rounded-full bg-[#1d9bf0]" />
                {t("oafBots.relationship.accountStatus", { status: t(accountStatusKey(account.status)) })}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
            <div className="mb-3">
              <p className="text-sm font-semibold text-[#e7e9ea]">{t("oafBots.relationship.coreReadinessTitle")}</p>
              <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("oafBots.relationship.coreReadinessDescription")}</p>
            </div>
            <div className="grid gap-2">
              <ContentDraftReadinessTile
                title={t("oafBots.relationship.readiness.persona")}
                description={completion >= 60 ? t("oafBots.relationship.readiness.personaValue", { percent: completion }) : t("oafBots.relationship.readiness.personaMissing", { percent: completion })}
                ready={completion >= 60}
                href="#oaf-bot-editor"
                action={completion >= 60 ? t("oafBots.relationship.readiness.manage") : t("oafBots.relationship.readiness.fix")}
              />
              <ContentDraftReadinessTile
                title={t("oafBots.relationship.readiness.content")}
                description={t("oafBots.relationship.readiness.contentValue", { active: activeContentCount, total: totalContentCount })}
                ready={activeContentCount > 0}
                href={account ? `/content-drafts?panel=content&account=${account.id}` : "/content-drafts?panel=content"}
                action={activeContentCount > 0 ? t("oafBots.relationship.readiness.manage") : t("oafBots.relationship.readiness.fix")}
              />
              <ContentDraftReadinessTile
                title={t("oafBots.relationship.readiness.dailyQueue")}
                description={dailyQueueReady ? t("oafBots.relationship.readiness.dailyQueueReady") : t("oafBots.relationship.readiness.dailyQueueMissing")}
                ready={dailyQueueReady}
                href={`/content-drafts?panel=generate&bot_id=${bot.id}`}
                action={t("oafBots.relationship.openDailyQueue")}
              />
              <ContentDraftReadinessTile
                title={t("oafBots.relationship.readiness.queue")}
                description={t("oafBots.relationship.readiness.queueValue", { review: queueSummary.pendingReview, ready: queueSummary.readyToPublish })}
                ready={hasQueueActivity}
                href="/handling-list"
                action={t("oafBots.relationship.openQueue")}
              />
            </div>
          </div>

          <div className="rounded-2xl border border-[#1d9bf0]/25 bg-[#06111d] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#d7ebff]">{t("oafBots.relationship.dailyQueueTitle")}</p>
                <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("oafBots.relationship.dailyQueueDescription")}</p>
              </div>
              <Link href={`/content-drafts?panel=generate&bot_id=${bot.id}`} className="shrink-0 text-xs font-semibold text-[#8ecdf8] hover:text-white">
                {t("oafBots.relationship.openDailyQueue")}
              </Link>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <DailyQueueSignal label={t("oafBots.relationship.dailyQueue.persona")} />
              <DailyQueueSignal label={t("oafBots.relationship.dailyQueue.guardrails")} />
              <DailyQueueSignal label={t("oafBots.relationship.dailyQueue.learning")} />
            </div>
          </div>

          <details className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
            <summary className="cursor-pointer list-none">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#e7e9ea]">{t("oafBots.relationship.advancedAutomationSummary")}</p>
                  <p className="mt-1 text-xs leading-5 text-[#71767b]">
                    {contentDraftReady ? t("oafBots.relationship.contentDraftReadyDescription") : t("oafBots.relationship.contentDraftNeedsSetupDescription")}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-[#2f3336] bg-black px-3 py-1 text-xs text-[#71767b]">
                  {t("oafBots.relationship.enabledAutomationsValue", { count: enabledAutomationCount })}
                </span>
              </div>
            </summary>
            <div className="mt-4 space-y-3">
              <div className={`rounded-2xl border p-4 ${contentDraftReady ? "border-emerald-300/20 bg-emerald-400/10" : "border-amber-300/20 bg-amber-400/10"}`}>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#e7e9ea]">
                      {contentDraftReady ? t("oafBots.relationship.contentDraftReadyTitle") : t("oafBots.relationship.contentDraftNeedsSetupTitle")}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-[#71767b]">
                      {contentDraftReady ? t("oafBots.relationship.contentDraftReadyDescription") : t("oafBots.relationship.contentDraftNeedsSetupDescription")}
                    </p>
                  </div>
                  <Link href={account ? `/content-drafts?panel=content&account=${account.id}` : "/content-drafts"} className="shrink-0 text-xs font-semibold text-[#1d9bf0] hover:text-[#8ecdf8]">
                    {t("oafBots.relationship.openContentDrafts")}
                  </Link>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <ContentDraftReadinessTile
                    title={t("oafBots.relationship.readiness.account")}
                    description={account ? `@${account.username}` : t("oafBots.relationship.readiness.accountMissing")}
                    ready={Boolean(account)}
                    href="/accounts"
                    action={account ? t("oafBots.relationship.readiness.manage") : t("oafBots.relationship.readiness.fix")}
                  />
                  <ContentDraftReadinessTile
                    title={t("oafBots.relationship.readiness.content")}
                    description={t("oafBots.relationship.readiness.contentValue", { active: activeContentCount, total: totalContentCount })}
                    ready={activeContentCount > 0}
                    href={account ? `/content-drafts?panel=content&account=${account.id}` : "/content-drafts?panel=content"}
                    action={activeContentCount > 0 ? t("oafBots.relationship.readiness.manage") : t("oafBots.relationship.readiness.fix")}
                  />
                  <ContentDraftReadinessTile
                    title={t("oafBots.relationship.readiness.planner")}
                    description={contentDraftPlan?.enabled ? t("oafBots.relationship.readiness.plannerEnabled") : t("oafBots.relationship.readiness.plannerMissing")}
                    ready={Boolean(contentDraftPlan?.enabled)}
                    href={account ? `/content-drafts?panel=planner&account=${account.id}` : "/content-drafts?panel=planner"}
                    action={contentDraftPlan?.enabled ? t("oafBots.relationship.readiness.manage") : t("oafBots.relationship.readiness.fix")}
                  />
                  <ContentDraftReadinessTile
                    title={t("oafBots.relationship.readiness.autopilot")}
                    description={t(`handlingList.executionMode.${contentDraftPlan?.execution_mode || "review"}`)}
                    ready={Boolean(contentDraftPlan?.enabled)}
                    href={account ? `/content-drafts?panel=planner&account=${account.id}` : "/content-drafts?panel=planner"}
                    action={contentDraftPlan?.enabled ? t("oafBots.relationship.readiness.manage") : t("oafBots.relationship.readiness.fix")}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#e7e9ea]">{t("oafBots.relationship.automationTitle")}</p>
                    <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("oafBots.relationship.automationDescription")}</p>
                  </div>
                  <Rocket className="size-5 shrink-0 text-[#1d9bf0]" />
                </div>
                {loading ? (
                  <p className="rounded-xl border border-[#2f3336] bg-black p-3 text-sm text-[#71767b]">{t("oafBots.relationship.loading")}</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {automationStates.map((item) => (
                      <BotAutomationTile key={item.type} item={item} t={t} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </details>

          <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#e7e9ea]">{t("oafBots.relationship.queueTitle")}</p>
                <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("oafBots.relationship.queueDescription")}</p>
              </div>
              <Link href="/handling-list" className="shrink-0 text-xs font-semibold text-[#1d9bf0] hover:text-[#8ecdf8]">
                {t("oafBots.relationship.openQueue")}
              </Link>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <QueueMiniMetric label={t("oafBots.relationship.pendingReview")} value={queueSummary.pendingReview} />
              <QueueMiniMetric label={t("oafBots.relationship.readyToPublish")} value={queueSummary.readyToPublish} />
              <QueueMiniMetric label={t("oafBots.relationship.failed")} value={queueSummary.failed} tone={queueSummary.failed > 0 ? "warning" : "default"} />
              <QueueMiniMetric label={t("oafBots.relationship.published")} value={queueSummary.published} />
            </div>
            <div className="mt-3 space-y-2">
              {recentItems.length === 0 ? (
                <p className="rounded-xl border border-[#2f3336] bg-black p-3 text-sm leading-relaxed text-[#71767b]">{t("oafBots.relationship.queueEmpty")}</p>
              ) : (
                recentItems.map((item) => <QueuePreviewLine key={`${item.type}-${item.id}`} item={item} t={t} />)
              )}
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

export function OAFBotDangerZone({
  t,
  botName,
  deleting,
  onDelete,
}: {
  t: (key: string, params?: Record<string, string | number>) => string;
  botName: string;
  deleting: boolean;
  onDelete: () => void;
}) {
  return (
    <SectionCard title={t("oafBots.delete.zoneTitle")} description={t("oafBots.delete.zoneDescription", { name: botName })} className="border-rose-500/20 bg-black p-4 md:p-5">
      <div className="flex flex-col gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/8 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-rose-400/25 bg-rose-500/10 text-rose-200">
            <AlertTriangle className="size-4" />
          </div>
          <p className="text-sm leading-6 text-rose-100/85">{t("oafBots.delete.zoneWarning")}</p>
        </div>
        <Button type="button" variant="destructive" onClick={onDelete} disabled={deleting} className="w-full sm:w-auto">
          {deleting ? <RefreshCw className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          {t(deleting ? "oafBots.delete.loading" : "oafBots.delete.action")}
        </Button>
      </div>
    </SectionCard>
  );
}

function DailyQueueSignal({ label }: { label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-xl border border-[#1d9bf0]/15 bg-black/25 px-3 py-2 text-xs text-[#8b98a5]">
      <CheckCircle2 className="size-3.5 shrink-0 text-emerald-300" />
      <span className="truncate">{label}</span>
    </div>
  );
}

function RelationshipMetric({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "success" | "warning" | "info" | "neutral";
}) {
  const toneClass = {
    success: "border-emerald-300/20 bg-emerald-400/10 text-emerald-100",
    warning: "border-amber-300/20 bg-amber-400/10 text-amber-100",
    info: "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-blue-100",
    neutral: "border-[#2f3336] bg-black text-[#71767b]",
  }[tone];
  return (
    <div className="min-w-0 rounded-xl border border-[#2f3336] bg-black p-3">
      <div className="mb-2 flex items-center gap-2 text-xs text-[#71767b]">
        <span className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full border ${toneClass}`}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <p className="truncate text-sm font-semibold text-[#e7e9ea]">{value}</p>
    </div>
  );
}

function ContentDraftReadinessTile({
  title,
  description,
  ready,
  href,
  action,
}: {
  title: string;
  description: string;
  ready: boolean;
  href: string;
  action: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-[#2f3336] bg-black p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {ready ? <CheckCircle2 className="size-4 shrink-0 text-emerald-300" /> : <AlertTriangle className="size-4 shrink-0 text-amber-300" />}
            <p className="truncate text-sm font-semibold text-[#e7e9ea]">{title}</p>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#71767b]">{description}</p>
        </div>
        <Link href={href} className="shrink-0 text-xs font-semibold text-[#1d9bf0] hover:text-[#8ecdf8]">
          {action}
        </Link>
      </div>
    </div>
  );
}

function BotAutomationTile({ item, t }: { item: BotAutomationState; t: (key: string, params?: Record<string, string | number>) => string }) {
  const tone = item.enabled
    ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100"
    : item.configured
      ? "border-[#2f3336] bg-black text-[#71767b]"
      : "border-amber-300/20 bg-amber-400/10 text-amber-100";
  const statusKey = item.enabled ? "accounts.automation.enabled" : item.configured ? "accounts.automation.paused" : "accounts.automation.notConfigured";

  return (
    <Link href={item.href} className={`min-w-0 rounded-2xl border p-3 transition-colors hover:border-[#1d9bf0]/45 ${tone}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#e7e9ea]">{t(`accounts.automation.type.${item.type}`)}</p>
          <p className="mt-1 truncate text-xs text-[#71767b]">{t("accounts.automation.mode", { mode: t(`handlingList.executionMode.${item.mode}`) })}</p>
        </div>
        <span className="shrink-0 rounded-full border border-current/20 px-2 py-0.5 text-[11px]">{t(statusKey)}</span>
      </div>
    </Link>
  );
}

function QueueMiniMetric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "warning" }) {
  return (
    <div className={`min-w-0 rounded-xl border border-[#2f3336] bg-black px-2 py-2 text-center ${tone === "warning" ? "text-amber-100" : "text-[#e7e9ea]"}`}>
      <p className="text-sm font-semibold">{value}</p>
      <p className="mt-1 truncate text-[11px] text-[#71767b]">{label}</p>
    </div>
  );
}

function QueuePreviewLine({ item, t }: { item: ReviewQueueItemApi; t: (key: string, params?: Record<string, string | number>) => string }) {
  const timeZone = usePreferredTimeZone();
  return (
    <Link href={`/handling-list?type=${item.type}`} className="block rounded-xl border border-[#2f3336] bg-black p-3 transition-colors hover:border-[#1d9bf0]/45">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-semibold text-[#e7e9ea]">{t(`accounts.automation.type.${item.type}`)}</p>
        <span className="shrink-0 rounded-full border border-[#2f3336] px-2 py-0.5 text-[11px] text-[#71767b]">{t(`handlingList.status.${item.status}`)}</span>
      </div>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#71767b]">{item.target_summary || item.content}</p>
      <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-[#71767b]">
        <Clock3 className="size-3" />
        {formatCompactDate(item.created_at, timeZone)}
      </p>
    </Link>
  );
}

function accountStatusKey(status: AccountListItem["status"]) {
  if (status === "connected") return "accounts.status.connected";
  if (status === "needs_reauth") return "accounts.status.needsReauth";
  return "accounts.status.disconnected";
}

function formatCompactDate(value: string, timeZone: string) {
  return formatDateTime(value, timeZone, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
