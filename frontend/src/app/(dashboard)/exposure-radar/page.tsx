"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import axios from "axios";
import Link from "next/link";
import { Activity, BarChart3, BookmarkPlus, Bot, CalendarClock, CheckCircle2, Clock3, Database, ExternalLink, Flame, Gauge, Info, MessageSquarePlus, RefreshCw, Search, ShieldAlert, Sparkles, TrendingUp, Users, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { broadcastPageRefreshComplete, subscribePageRefreshRequest } from "@/lib/app-page-refresh";
import { formatDateTime, usePreferredTimeZone } from "@/lib/timezone";
import { accountService, type AccountListItem } from "@/services/account.service";
import { contentLibraryService, type ContentLibraryItemPayload } from "@/services/content-library.service";
import { exposureRadarService, type ExposureRadarArchiveData, type ExposureRadarBriefData, type ExposureRadarBriefItemApi, type ExposureRadarData, type ExposureRadarItemApi, type ExposureRadarPerformanceData, type ExposureRadarRegion } from "@/services/exposure-radar.service";
import { oafBotService } from "@/services/oaf-bot.service";
import type { OAFBot } from "@/types/oaf-bot";

type LoadState = "loading" | "ready" | "error";
type RankChange = { kind: "new" | "up" | "down"; delta?: number };
type RadarViewFilter = "all" | "tweet" | "high_score" | "needs_review" | "saved" | "drafted";

const hourOptions = [1, 2, 4, 8];
const fanOptions = [5000, 10000, 20000, 50000, 100000];
const hotCountOptions = [0, 2, 3, 5, 10];
const radarViewFilters: RadarViewFilter[] = ["all", "tweet", "high_score", "needs_review", "saved", "drafted"];

export default function ExposureRadarPage() {
  const { t } = useT();
  const { pushToast } = useToast();
  const timeZone = usePreferredTimeZone();
  const [region, setRegion] = useState<ExposureRadarRegion>("zh");
  const [hours, setHours] = useState(4);
  const [maxFans, setMaxFans] = useState(10000);
  const [minHotCount, setMinHotCount] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [data, setData] = useState<ExposureRadarData | null>(null);
  const [performance, setPerformance] = useState<ExposureRadarPerformanceData | null>(null);
  const [brief, setBrief] = useState<ExposureRadarBriefData | null>(null);
  const [archive, setArchive] = useState<ExposureRadarArchiveData | null>(null);
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [bots, setBots] = useState<OAFBot[]>([]);
  const [selectedAccountID, setSelectedAccountID] = useState(0);
  const [selectedBotID, setSelectedBotID] = useState(0);
  const [draftingID, setDraftingID] = useState<string | null>(null);
  const [savingMemoryID, setSavingMemoryID] = useState<string | null>(null);
  const [radarView, setRadarView] = useState<RadarViewFilter>("all");
  const [savedMemoryIDs, setSavedMemoryIDs] = useState<Set<string>>(() => new Set());
  const previousRanksRef = useRef<Map<string, number>>(new Map());
  const [rankChanges, setRankChanges] = useState<Map<string, RankChange>>(new Map());

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const [next, perf, hourlyBrief, dailyArchive] = await Promise.all([
        exposureRadarService.list({ region, botId: selectedBotID, xAccountId: selectedAccountID, hours, maxFans, minHotCount, limit: 60 }),
        exposureRadarService.performance({ region, botId: selectedBotID, xAccountId: selectedAccountID, days: 7 }),
        exposureRadarService.brief({ region, botId: selectedBotID, xAccountId: selectedAccountID, hours: Math.min(hours, 4), limit: 10 }),
        exposureRadarService.archive({ region, botId: selectedBotID, xAccountId: selectedAccountID, days: 7 }),
      ]);
      const nextRanks = new Map(next.items.map((item, index) => [item.id, index + 1]));
      const previousRanks = previousRanksRef.current;
      const changes = new Map<string, RankChange>();
      if (previousRanks.size > 0) {
        next.items.forEach((item, index) => {
          const nextRank = index + 1;
          const previousRank = previousRanks.get(item.id);
          if (!previousRank) {
            changes.set(item.id, { kind: "new" });
            return;
          }
          const delta = previousRank - nextRank;
          if (delta > 0) changes.set(item.id, { kind: "up", delta });
          if (delta < 0) changes.set(item.id, { kind: "down", delta: Math.abs(delta) });
        });
      }
      previousRanksRef.current = nextRanks;
      setRankChanges(changes);
      setData(next);
      setPerformance(perf);
      setBrief(hourlyBrief);
      setArchive(dailyArchive);
      setLoadState("ready");
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("exposureRadar.toast.loadFailed") : t("exposureRadar.toast.loadFailed"));
      setLoadState("error");
    }
  }, [hours, maxFans, minHotCount, pushToast, region, selectedAccountID, selectedBotID, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const [accountData, botData] = await Promise.all([accountService.list(), oafBotService.list()]);
        const connectedAccounts = accountData.items.filter((account) => account.status !== "disconnected");
        setAccounts(connectedAccounts);
        setBots(botData.items);
        setSelectedAccountID((current) => current || connectedAccounts[0]?.id || 0);
        setSelectedBotID((current) => current || botData.items[0]?.id || 0);
      } catch (error) {
        pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("exposureRadar.toast.configLoadFailed") : t("exposureRadar.toast.configLoadFailed"));
      }
    })();
  }, [pushToast, t]);

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

  const items = useMemo(() => data?.items || [], [data?.items]);
  const metrics = useMemo(() => {
    const tweetLevel = items.filter((item) => item.data_quality === "tweet_level").length;
    const highScore = items.filter((item) => item.score >= 75).length;
    const risky = items.filter((item) => item.risk_level === "medium" || item.risk_level === "high").length;
    const avgVelocity = items.length ? Math.round(items.reduce((sum, item) => sum + (item.views_per_min || 0), 0) / items.length) : 0;
    return { tweetLevel, highScore, risky, avgVelocity };
  }, [items]);
  const radarViewCounts = useMemo(() => {
    return radarViewFilters.reduce<Record<RadarViewFilter, number>>((acc, filter) => {
      acc[filter] = filter === "all" ? items.length : items.filter((item) => radarItemMatchesFilter(item, filter, savedMemoryIDs)).length;
      return acc;
    }, { all: 0, tweet: 0, high_score: 0, needs_review: 0, saved: 0, drafted: 0 });
  }, [items, savedMemoryIDs]);
  const displayedItems = useMemo(() => {
    return radarView === "all" ? items : items.filter((item) => radarItemMatchesFilter(item, radarView, savedMemoryIDs));
  }, [items, radarView, savedMemoryIDs]);

  const createDraft = useCallback(async (item: ExposureRadarItemApi) => {
    if (!selectedAccountID || !selectedBotID) {
      pushToast(t("exposureRadar.toast.selectBotAccount"));
      return;
    }
    if (item.data_quality !== "tweet_level") {
      pushToast(t("exposureRadar.toast.tweetLevelRequired"));
      return;
    }
    setDraftingID(item.id);
    try {
      const task = await exposureRadarService.createCommentDraft({
        bot_id: selectedBotID,
        x_account_id: selectedAccountID,
        signal_id: item.id,
        region: item.region,
        data_source: item.data_source,
        data_quality: item.data_quality,
        tweet_id: extractTweetID(item.url || item.id),
        url: item.url,
        title: item.title,
        author_handle: item.author_handle,
        author_name: item.author_name,
        content: item.content,
        topic_name: item.topic_name,
        score: item.score,
        risk_level: item.risk_level,
        opportunity_type: item.opportunity_type,
        recommended_use: item.recommended_use,
        reason: item.reason,
      });
      setData((current) => current ? {
        ...current,
        items: current.items.map((row) => row.id === item.id ? {
          ...row,
          review_task_id: task.id,
          review_status: task.status,
          review_queue_url: `/execution-queue?type=comment&status=${encodeURIComponent(task.status === "review" ? "pending_review" : task.status)}&focus_type=comment&focus_source_id=${task.id}`,
        } : row),
      } : current);
      pushToast(task.status === "pending_review" ? t("exposureRadar.toast.draftQueued") : t("exposureRadar.toast.draftCreated"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("exposureRadar.toast.draftFailed") : t("exposureRadar.toast.draftFailed"));
    } finally {
      setDraftingID(null);
    }
  }, [pushToast, selectedAccountID, selectedBotID, t]);

  const saveRadarMemory = useCallback(async (item: ExposureRadarItemApi) => {
    if (!selectedAccountID || !selectedBotID) {
      pushToast(t("exposureRadar.toast.selectBotAccountForMemory"));
      return;
    }
    setSavingMemoryID(item.id);
    try {
      await contentLibraryService.create(buildRadarMemoryPayload(item, selectedAccountID, selectedBotID));
      setSavedMemoryIDs((current) => new Set(current).add(item.id));
      pushToast(t("exposureRadar.toast.memorySaved"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("exposureRadar.toast.memoryFailed") : t("exposureRadar.toast.memoryFailed"));
    } finally {
      setSavingMemoryID(null);
    }
  }, [pushToast, selectedAccountID, selectedBotID, t]);

  const saveBriefMemory = useCallback(async (item: ExposureRadarBriefItemApi) => {
    if (!selectedAccountID || !selectedBotID) {
      pushToast(t("exposureRadar.toast.selectBotAccountForMemory"));
      return;
    }
    const memoryID = `brief:${item.signal_id}`;
    setSavingMemoryID(memoryID);
    try {
      await contentLibraryService.create(buildBriefMemoryPayload(item, selectedAccountID, selectedBotID));
      pushToast(t("exposureRadar.toast.memorySaved"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("exposureRadar.toast.memoryFailed") : t("exposureRadar.toast.memoryFailed"));
    } finally {
      setSavingMemoryID(null);
    }
  }, [pushToast, selectedAccountID, selectedBotID, t]);

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-2xl border border-[#2f3336] bg-[#0f1419]">
        <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="p-5 md:p-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#1d9bf0]/30 bg-[#1d9bf0]/10 px-3 py-1 text-xs font-semibold text-[#8ecdf8]">
                <Zap className="size-3.5" />
                {t("exposureRadar.hero.kicker")}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-3 py-1 text-xs font-semibold text-[#7ee0b5]">
                <Sparkles className="size-3.5" />
                {t("exposureRadar.hero.free")}
              </span>
            </div>
            <h1 className="mt-5 max-w-3xl text-3xl font-semibold leading-tight tracking-tight text-[#e7e9ea] md:text-4xl">{t("exposureRadar.hero.title")}</h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[#8b98a5] md:text-base">{t("exposureRadar.hero.subtitle")}</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-4">
              <LightMetric icon={<Search className="size-4" />} label={t("exposureRadar.metrics.items")} value={String(items.length)} />
              <LightMetric icon={<Flame className="size-4" />} label={t("exposureRadar.metrics.highScore")} value={String(metrics.highScore)} />
              <LightMetric icon={<Gauge className="size-4" />} label={t("exposureRadar.metrics.velocity")} value={metrics.avgVelocity ? `${metrics.avgVelocity}/min` : "-"} />
              <LightMetric icon={<ShieldAlert className="size-4" />} label={t("exposureRadar.metrics.risky")} value={String(metrics.risky)} />
            </div>
          </div>
          <div className="border-t border-[#2f3336] bg-black/30 p-5 md:p-6 xl:border-l xl:border-t-0">
            <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.playbook.title")}</p>
            <div className="mt-4 space-y-2">
              {["velocity", "lowFans", "review", "memory"].map((key, index) => (
                <div key={key} className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
                  <div className="flex items-start gap-3">
                    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-[#2f3336] bg-black text-[11px] font-semibold text-[#8ecdf8]">0{index + 1}</span>
                    <div>
                      <p className="text-sm font-semibold text-[#e7e9ea]">{t(`exposureRadar.playbook.${key}.title`)}</p>
                      <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t(`exposureRadar.playbook.${key}.description`)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <Card className="bg-[#0f1419]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <CardHeader title={t("exposureRadar.filters.title")} description={t("exposureRadar.filters.description")} className="mb-0" />
          <Button type="button" variant="outline" onClick={() => void load()} disabled={loadState === "loading"}>
            <RefreshCw className={`size-4 ${loadState === "loading" ? "animate-spin" : ""}`} />
            {t("common.refresh")}
          </Button>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          <SegmentedControl
            label={t("exposureRadar.filters.region")}
            options={[
              { value: "zh", label: t("exposureRadar.region.zh") },
              { value: "en", label: t("exposureRadar.region.en") },
            ]}
            value={region}
            onChange={(value) => setRegion(value as ExposureRadarRegion)}
          />
          <NumberButtons label={t("exposureRadar.filters.hours")} values={hourOptions} value={hours} suffix="h" onChange={setHours} disabled={region === "en"} />
          <NumberButtons label={t("exposureRadar.filters.maxFans")} values={fanOptions} value={maxFans} formatter={formatCompact} onChange={setMaxFans} disabled={region === "en"} />
          <NumberButtons label={t("exposureRadar.filters.hotCount")} values={hotCountOptions} value={minHotCount} formatter={(value) => (value === 0 ? t("common.all") : `>=${value}`)} onChange={setMinHotCount} disabled={region === "en"} />
        </div>
        {data ? <SourceHealthPanel data={data} timeZone={timeZone} /> : null}
        <div className="mt-4 border-t border-[#2f3336] pt-4">
          <CardHeader title={t("exposureRadar.draft.title")} description={t("exposureRadar.draft.description")} className="mb-3" />
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
            <SelectField
              icon={<Users className="size-4" />}
              label={t("exposureRadar.draft.account")}
              value={selectedAccountID}
              onChange={setSelectedAccountID}
              emptyLabel={t("exposureRadar.draft.noAccounts")}
              options={accounts.map((account) => ({ value: account.id, label: `@${account.username}` }))}
            />
            <SelectField
              icon={<Bot className="size-4" />}
              label={t("exposureRadar.draft.bot")}
              value={selectedBotID}
              onChange={setSelectedBotID}
              emptyLabel={t("exposureRadar.draft.noBots")}
              options={bots.map((bot) => ({ value: bot.id, label: bot.name || t("oafBots.botNumber", { id: bot.id }) }))}
            />
            <Link href="/execution-queue?type=comment&status=pending_review" className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[#2f3336] px-4 text-sm font-semibold text-[#e7e9ea] transition hover:bg-[#16181c]">
              <MessageSquarePlus className="size-4" />
              {t("exposureRadar.draft.openQueue")}
            </Link>
          </div>
        </div>
      </Card>

      <HourlyBriefPanel
        data={brief}
        timeZone={timeZone}
        savingMemoryID={savingMemoryID}
        memoryDisabled={!selectedAccountID || !selectedBotID}
        onSaveMemory={saveBriefMemory}
      />

      <Card className="bg-[#0f1419]">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <CardHeader title={t("exposureRadar.list.title")} description={t(region === "zh" ? "exposureRadar.list.descriptionZh" : "exposureRadar.list.descriptionEn")} />
          <span className="inline-flex items-center gap-2 rounded-full border border-[#2f3336] px-3 py-1 text-xs font-semibold text-[#8b98a5]">
            <Activity className="size-3.5" />
            {data?.data_quality || "-"}
          </span>
        </div>
        <RadarViewTabs value={radarView} counts={radarViewCounts} onChange={setRadarView} />
        {loadState === "loading" ? (
          <div className="rounded-2xl border border-[#2f3336] bg-black px-4 py-10 text-center text-sm text-[#71767b]">{t("exposureRadar.loading")}</div>
        ) : null}
        {loadState === "error" ? (
          <div className="rounded-2xl border border-[#f4212e]/25 bg-[#f4212e]/10 px-4 py-10 text-center text-sm text-[#ff8a91]">{t("exposureRadar.toast.loadFailed")}</div>
        ) : null}
        {loadState === "ready" && items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#2f3336] bg-black px-4 py-10 text-center text-sm text-[#71767b]">{t("exposureRadar.empty")}</div>
        ) : null}
        {loadState === "ready" && items.length > 0 && displayedItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#2f3336] bg-black px-4 py-10 text-center text-sm text-[#71767b]">{t("exposureRadar.list.filteredEmpty")}</div>
        ) : null}
        {loadState === "ready" && displayedItems.length ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {displayedItems.map((item) => (
              <RadarCard
                key={item.id}
                item={item}
                timeZone={timeZone}
                rankChange={rankChanges.get(item.id)}
                savedMemory={savedMemoryIDs.has(item.id)}
                drafting={draftingID === item.id}
                draftDisabled={!selectedAccountID || !selectedBotID}
                onCreateDraft={createDraft}
                savingMemory={savingMemoryID === item.id}
                memoryDisabled={!selectedAccountID || !selectedBotID}
                onSaveMemory={saveRadarMemory}
              />
            ))}
          </div>
        ) : null}
      </Card>

      <PerformancePanel data={performance} timeZone={timeZone} />

      <TopicHistoryPanel data={archive} timeZone={timeZone} />
    </div>
  );
}

function LightMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-black p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-[#71767b]">{icon}{label}</div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</p>
    </div>
  );
}

function SegmentedControl({ label, options, value, onChange }: { label: string; options: Array<{ value: string; label: string }>; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <p className="text-xs font-semibold text-[#8b98a5]">{label}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 rounded-2xl border border-[#2f3336] bg-black p-1">
        {options.map((option) => (
          <button key={option.value} type="button" onClick={() => onChange(option.value)} className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${value === option.value ? "bg-[#1d9bf0] text-white" : "text-[#8b98a5] hover:bg-[#16181c] hover:text-[#e7e9ea]"}`}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function NumberButtons({ label, values, value, suffix, formatter, onChange, disabled }: { label: string; values: number[]; value: number; suffix?: string; formatter?: (value: number) => string; onChange: (value: number) => void; disabled?: boolean }) {
  return (
    <div className={disabled ? "opacity-45" : ""}>
      <p className="text-xs font-semibold text-[#8b98a5]">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {values.map((option) => (
          <button key={option} type="button" disabled={disabled} onClick={() => onChange(option)} className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${value === option ? "border-[#1d9bf0] bg-[#1d9bf0]/15 text-[#8ecdf8]" : "border-[#2f3336] bg-black text-[#8b98a5] hover:border-[#1d9bf0]/45"}`}>
            {formatter ? formatter(option) : `${option}${suffix || ""}`}
          </button>
        ))}
      </div>
    </div>
  );
}

function RadarViewTabs({ value, counts, onChange }: { value: RadarViewFilter; counts: Record<RadarViewFilter, number>; onChange: (value: RadarViewFilter) => void }) {
  const { t } = useT();
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {radarViewFilters.map((filter) => (
        <button
          key={filter}
          type="button"
          onClick={() => onChange(filter)}
          className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition ${value === filter ? "border-[#1d9bf0] bg-[#1d9bf0]/15 text-[#8ecdf8]" : "border-[#2f3336] bg-black text-[#8b98a5] hover:border-[#1d9bf0]/45 hover:text-[#e7e9ea]"}`}
        >
          {t(`exposureRadar.list.filter.${filter}`)}
          <span className="rounded-full bg-[#16181c] px-1.5 py-0.5 text-[10px] text-[#71767b]">{counts[filter] || 0}</span>
        </button>
      ))}
    </div>
  );
}

function SelectField({ icon, label, value, options, emptyLabel, onChange }: { icon: ReactNode; label: string; value: number; options: Array<{ value: number; label: string }>; emptyLabel: string; onChange: (value: number) => void }) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center gap-2 text-xs font-semibold text-[#8b98a5]">{icon}{label}</span>
      <select value={value} onChange={(event) => onChange(Number(event.target.value))} className="h-10 w-full rounded-xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none transition focus:border-[#1d9bf0]">
        {options.length === 0 ? <option value={0}>{emptyLabel}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function SourceHealthPanel({ data, timeZone }: { data: ExposureRadarData; timeZone: string }) {
  const { t } = useT();
  const status = normalizeSourceStatus(data.source_status);
  const statusClass = sourceStatusClass(status);
  return (
    <div className="mt-4 rounded-2xl border border-[#2f3336] bg-black p-4">
      <div className="grid gap-3 md:grid-cols-4">
        <SourceMetaItem
          icon={<Database className="size-4" />}
          label={t("exposureRadar.source.type")}
          value={t(`exposureRadar.sourceType.${normalizeSourceType(data.source_type)}`)}
        />
        <SourceMetaItem
          icon={<CheckCircle2 className="size-4" />}
          label={t("exposureRadar.source.status")}
          value={t(`exposureRadar.sourceStatus.${status}`)}
          valueClassName={statusClass}
        />
        <SourceMetaItem
          icon={<Clock3 className="size-4" />}
          label={t("exposureRadar.source.lastCollected")}
          value={data.last_collected_at || data.updated_at ? formatDateTime(data.last_collected_at || data.updated_at || "", timeZone) : "-"}
        />
        <SourceMetaItem
          icon={<Activity className="size-4" />}
          label={t("exposureRadar.source.quality")}
          value={data.data_quality === "tweet_level" ? t("exposureRadar.quality.tweet") : t("exposureRadar.quality.topic")}
        />
      </div>
      <div className="mt-3 flex items-start gap-2 rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2 text-xs leading-5 text-[#8b98a5]">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <p>{data.source_notice || t("exposureRadar.source.noNotice")}</p>
      </div>
    </div>
  );
}

function SourceMetaItem({ icon, label, value, valueClassName }: { icon: ReactNode; label: string; value: string; valueClassName?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-normal text-[#71767b]">{icon}{label}</p>
      <p className={`mt-1 truncate text-sm font-semibold text-[#e7e9ea] ${valueClassName || ""}`}>{value}</p>
    </div>
  );
}

function HourlyBriefPanel({
  data,
  timeZone,
  savingMemoryID,
  memoryDisabled,
  onSaveMemory,
}: {
  data: ExposureRadarBriefData | null;
  timeZone: string;
  savingMemoryID: string | null;
  memoryDisabled: boolean;
  onSaveMemory: (item: ExposureRadarBriefItemApi) => void;
}) {
  const { t } = useT();
  const items = data?.items || [];
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <CardHeader title={t("exposureRadar.brief.title")} description={data?.summary || t("exposureRadar.brief.description")} className="mb-0" />
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#2f3336] px-3 py-1 text-xs font-semibold text-[#8b98a5]">
            <Clock3 className="size-3.5" />
            {data?.generated_at ? formatDateTime(data.generated_at, timeZone) : "-"}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#2f3336] px-3 py-1 text-xs font-semibold text-[#8b98a5]">
            <Activity className="size-3.5" />
            {data?.data_quality || "-"}
          </span>
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {items.length ? items.slice(0, 6).map((item) => (
          <div key={`${item.rank}:${item.signal_id}`} className="rounded-2xl border border-[#2f3336] bg-black p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex size-7 items-center justify-center rounded-full bg-[#1d9bf0] text-xs font-semibold text-white">{item.rank}</span>
                  <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${velocityStateClass(normalizeVelocityState(item.velocity_state))}`}>
                    {t(`exposureRadar.velocityState.${normalizeVelocityState(item.velocity_state)}`)}
                  </span>
                  <span className="rounded-full border border-[#2f3336] px-2 py-1 text-xs font-semibold text-[#8b98a5]">{item.best_use}</span>
                </div>
                <h3 className="mt-3 line-clamp-2 text-sm font-semibold text-[#e7e9ea]">{item.title}</h3>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xl font-semibold text-white">{item.score}</p>
                <p className="text-[11px] text-[#71767b]">{t("exposureRadar.card.score")}</p>
              </div>
            </div>
            <p className="mt-3 line-clamp-3 text-xs leading-5 text-[#c9d1d9]">{item.summary}</p>
            <div className="mt-3 rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-normal text-[#71767b]">{t("exposureRadar.brief.why")}</p>
              <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{item.why_it_matters}</p>
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-normal text-[#71767b]">{t("exposureRadar.brief.action")}</p>
              <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{item.suggested_action}</p>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="outline" disabled={memoryDisabled || savingMemoryID === `brief:${item.signal_id}`} onClick={() => onSaveMemory(item)}>
                <BookmarkPlus className="size-3.5" />
                {savingMemoryID === `brief:${item.signal_id}` ? t("exposureRadar.card.savingMemory") : t("exposureRadar.card.saveMemory")}
              </Button>
              {item.source_url ? (
                <a href={item.source_url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-full border border-[#2f3336] px-3 text-xs font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
                  {t("exposureRadar.card.openPost")}
                  <ExternalLink className="size-3.5" />
                </a>
              ) : null}
            </div>
          </div>
        )) : (
          <p className="rounded-2xl border border-dashed border-[#2f3336] px-4 py-8 text-center text-sm text-[#71767b] lg:col-span-2">{t("exposureRadar.brief.empty")}</p>
        )}
      </div>
    </Card>
  );
}

function PerformancePanel({ data, timeZone }: { data: ExposureRadarPerformanceData | null; timeZone: string }) {
  const { t } = useT();
  const topics = data?.top_topics || [];
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <CardHeader title={t("exposureRadar.performance.title")} description={t("exposureRadar.performance.description", { days: data?.range_days || 7 })} className="mb-0" />
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#2f3336] px-3 py-1 text-xs font-semibold text-[#8b98a5]">
            <Bot className="size-3.5" />
            {data?.bot_id || data?.x_account_id ? t("exposureRadar.performance.scopePersonalized") : t("exposureRadar.performance.scopeWorkspace")}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#2f3336] px-3 py-1 text-xs font-semibold text-[#8b98a5]">
            <BarChart3 className="size-3.5" />
            {data?.generated_at ? formatDateTime(data.generated_at, timeZone) : "-"}
          </span>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <PerformanceMetric label={t("exposureRadar.performance.signals")} value={formatCompact(data?.owned_signal_count || 0)} detail={t("exposureRadar.performance.signalsDetail")} />
        <PerformanceMetric label={t("exposureRadar.performance.drafts")} value={formatCompact(data?.draft_count || 0)} detail={t("exposureRadar.performance.draftsDetail", { count: data?.pending_review_count || 0 })} />
        <PerformanceMetric label={t("exposureRadar.performance.approval")} value={formatPercent(data?.approval_rate || 0)} detail={t("exposureRadar.performance.approvalDetail", { count: data?.approved_count || 0 })} />
        <PerformanceMetric label={t("exposureRadar.performance.completion")} value={formatPercent(data?.completion_rate || 0)} detail={t("exposureRadar.performance.completionDetail", { count: (data?.published_count || 0) + (data?.handled_count || 0) })} />
      </div>
      <LearningControlsStrip data={data} />
      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.performance.regionTitle")}</p>
          <div className="mt-3 space-y-2">
            {(data?.regions || []).length ? data?.regions.map((row) => (
              <div key={row.region} className="flex items-center justify-between gap-3 rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="font-semibold text-[#e7e9ea]">{t(`exposureRadar.region.${row.region === "zh" ? "zh" : "en"}`)}</p>
                  <p className="mt-0.5 truncate text-[#71767b]">{row.latest_collected_at ? formatDateTime(row.latest_collected_at, timeZone) : t("exposureRadar.performance.noCollection")}</p>
                </div>
                <div className="shrink-0 text-right text-[#8b98a5]">
                  <p>{t("exposureRadar.performance.regionSignals", { count: row.owned_signal_count })}</p>
                  <p>{t("exposureRadar.performance.regionDrafts", { count: row.draft_count })}</p>
                </div>
              </div>
            )) : (
              <p className="rounded-xl border border-dashed border-[#2f3336] px-3 py-6 text-center text-xs text-[#71767b]">{t("exposureRadar.performance.empty")}</p>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.performance.topicTitle")}</p>
          <div className="mt-3 space-y-2">
            {topics.length ? topics.slice(0, 5).map((row) => (
              <div key={`${row.region}:${row.topic_name}`} className="rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <p className="min-w-0 truncate font-semibold text-[#e7e9ea]">{row.topic_name}</p>
                  <span className="shrink-0 rounded-full border border-[#2f3336] px-2 py-0.5 text-[#8b98a5]">{row.region}</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-[#71767b]">
                  <span>{t("exposureRadar.performance.topicSignals", { count: row.signal_count })}</span>
                  <span>{t("exposureRadar.performance.topicDrafts", { count: row.draft_count })}</span>
                  <span>{t("exposureRadar.performance.topicWins", { count: row.success_count })}</span>
                </div>
              </div>
            )) : (
              <p className="rounded-xl border border-dashed border-[#2f3336] px-3 py-6 text-center text-xs text-[#71767b]">{t("exposureRadar.performance.empty")}</p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function LearningControlsStrip({ data }: { data: ExposureRadarPerformanceData | null }) {
  const { t } = useT();
  const controls = data?.learning_controls;
  return (
    <div className="mt-4 grid gap-2 md:grid-cols-4">
      <LearningBadge label={t("exposureRadar.learning.ranking")} value={controls?.ranking_enabled ? t("exposureRadar.learning.on") : t("exposureRadar.learning.off")} active={Boolean(controls?.ranking_enabled)} />
      <LearningBadge label={t("exposureRadar.learning.collector")} value={controls?.collector_enabled ? t("exposureRadar.learning.on") : t("exposureRadar.learning.off")} active={Boolean(controls?.collector_enabled)} />
      <LearningBadge label={t("exposureRadar.learning.mode")} value={t(`exposureRadar.learningMode.${normalizeLearningMode(controls?.mode)}`)} />
      <LearningBadge label={t("exposureRadar.learning.window")} value={t("exposureRadar.learning.days", { days: controls?.window_days || 30 })} />
      <div className="md:col-span-4 rounded-xl border border-[#2f3336] bg-black px-3 py-2 text-xs leading-5 text-[#8b98a5]">
        {t("exposureRadar.learning.scope", { scope: t(`exposureRadar.learningScope.${normalizeLearningScope(controls?.ranking_scope)}`) })}
      </div>
    </div>
  );
}

function LearningBadge({ label, value, active }: { label: string; value: string; active?: boolean }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-black px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-normal text-[#71767b]">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${active === undefined ? "text-[#e7e9ea]" : active ? "text-[#7ee0b5]" : "text-[#ff8a91]"}`}>{value}</p>
    </div>
  );
}

function PerformanceMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
      <p className="text-xs font-semibold text-[#71767b]">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-[#8b98a5]">{detail}</p>
    </div>
  );
}

function TopicHistoryPanel({ data, timeZone }: { data: ExposureRadarArchiveData | null; timeZone: string }) {
  const { t } = useT();
  const days = useMemo(() => data?.days || [], [data?.days]);
  const totals = useMemo(() => {
    return days.reduce(
      (acc, row) => ({
        signals: acc.signals + row.signal_count,
        drafts: acc.drafts + row.draft_count,
        positives: acc.positives + row.positive_count,
        memories: acc.memories + row.saved_memory_count,
      }),
      { signals: 0, drafts: 0, positives: 0, memories: 0 },
    );
  }, [days]);
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <CardHeader title={t("exposureRadar.archive.title")} description={t("exposureRadar.archive.description", { days: data?.range_days || 7 })} className="mb-0" />
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#2f3336] px-3 py-1 text-xs font-semibold text-[#8b98a5]">
            <CalendarClock className="size-3.5" />
            {data?.generated_at ? formatDateTime(data.generated_at, timeZone) : "-"}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#2f3336] px-3 py-1 text-xs font-semibold text-[#8b98a5]">
            <Activity className="size-3.5" />
            {data?.region && data.region !== "all" ? t(`exposureRadar.region.${data.region === "zh" ? "zh" : "en"}`) : t("common.all")}
          </span>
        </div>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <PerformanceMetric label={t("exposureRadar.archive.totalSignals")} value={formatCompact(totals.signals)} detail={t("exposureRadar.archive.totalSignalsDetail")} />
        <PerformanceMetric label={t("exposureRadar.archive.totalDrafts")} value={formatCompact(totals.drafts)} detail={t("exposureRadar.archive.totalDraftsDetail")} />
        <PerformanceMetric label={t("exposureRadar.archive.totalPositive")} value={formatCompact(totals.positives)} detail={t("exposureRadar.archive.totalPositiveDetail")} />
        <PerformanceMetric label={t("exposureRadar.archive.totalMemory")} value={formatCompact(totals.memories)} detail={t("exposureRadar.archive.totalMemoryDetail")} />
      </div>
      <div className="mt-4 space-y-2">
        {days.length ? days.map((day) => {
          const total = day.signal_count + day.draft_count + day.saved_memory_count;
          const positiveRate = day.draft_count > 0 ? Math.round((day.positive_count / day.draft_count) * 100) : 0;
          return (
            <div key={`${day.date_key}:${day.region}`} className="rounded-2xl border border-[#2f3336] bg-black p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full border border-[#2f3336] px-2.5 py-1 text-xs font-semibold text-[#e7e9ea]">
                      <CalendarClock className="size-3.5 text-[#8ecdf8]" />
                      {formatArchiveDate(day.date_key, timeZone)}
                    </span>
                    <span className="rounded-full border border-[#2f3336] px-2.5 py-1 text-xs font-semibold text-[#8b98a5]">
                      {t(`exposureRadar.region.${day.region === "zh" ? "zh" : "en"}`)}
                    </span>
                    {total === 0 ? <span className="rounded-full border border-[#2f3336] px-2.5 py-1 text-xs font-semibold text-[#71767b]">{t("exposureRadar.archive.noActivity")}</span> : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#8b98a5]">
                    <span>{t("exposureRadar.archive.signals", { count: day.signal_count })}</span>
                    <span>{t("exposureRadar.archive.drafts", { count: day.draft_count })}</span>
                    <span>{t("exposureRadar.archive.positive", { count: day.positive_count })}</span>
                    <span>{t("exposureRadar.archive.memory", { count: day.saved_memory_count })}</span>
                    {day.draft_count ? <span>{t("exposureRadar.archive.positiveRate", { rate: positiveRate })}</span> : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {day.top_topics.length ? day.top_topics.map((topic) => (
                    <span key={`${day.date_key}:${topic.region}:${topic.topic_name}`} className="rounded-full border border-[#2f3336] bg-[#0f1419] px-2.5 py-1 text-xs font-semibold text-[#c9d1d9]">
                      {topic.topic_name}
                    </span>
                  )) : (
                    <span className="text-xs text-[#71767b]">{t("exposureRadar.archive.noTopics")}</span>
                  )}
                </div>
              </div>
            </div>
          );
        }) : (
          <p className="rounded-2xl border border-dashed border-[#2f3336] px-4 py-8 text-center text-sm text-[#71767b]">{t("exposureRadar.archive.empty")}</p>
        )}
      </div>
    </Card>
  );
}

function RadarCard({
  item,
  timeZone,
  rankChange,
  savedMemory,
  drafting,
  draftDisabled,
  savingMemory,
  memoryDisabled,
  onCreateDraft,
  onSaveMemory,
}: {
  item: ExposureRadarItemApi;
  timeZone: string;
  rankChange?: RankChange;
  savedMemory: boolean;
  drafting: boolean;
  draftDisabled: boolean;
  savingMemory: boolean;
  memoryDisabled: boolean;
  onCreateDraft: (item: ExposureRadarItemApi) => void;
  onSaveMemory: (item: ExposureRadarItemApi) => void;
}) {
  const { t } = useT();
  const riskClass = item.risk_level === "high" || item.risk_level === "medium" ? "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]" : "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  const hasReviewTask = Boolean(item.review_task_id);
  const canDraft = item.data_quality === "tweet_level" && !draftDisabled && !hasReviewTask;
  const velocityState = normalizeVelocityState(item.velocity_state, item.status);
  return (
    <article className={`rounded-2xl border p-4 ${item.cooling || velocityState === "cooling" ? "border-[#64748b]/35 bg-[#0b0f14] opacity-85" : "border-[#2f3336] bg-black"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-2 py-1 text-xs font-semibold text-[#8ecdf8]">
          <TrendingUp className="size-3.5" />
          {item.signal_label || item.status}
        </span>
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold ${velocityStateClass(velocityState)}`}>
          <span className="size-1.5 rounded-full bg-current" />
          {t(`exposureRadar.velocityState.${velocityState}`)}
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
        {hasReviewTask ? (
          <span className="rounded-full border border-[#1d9bf0]/35 bg-[#1d9bf0]/10 px-2 py-1 text-xs font-semibold text-[#8ecdf8]">
            {t("exposureRadar.card.reviewStatus", { status: t(`executionQueue.status.${normalizeReviewStatus(item.review_status)}`) })}
          </span>
        ) : null}
        {item.ranking_delta ? (
          <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${item.ranking_delta > 0 ? "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" : "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]"}`}>
            {item.ranking_delta > 0 ? `+${item.ranking_delta}` : item.ranking_delta}
          </span>
        ) : null}
        {savedMemory ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-2 py-1 text-xs font-semibold text-[#7ee0b5]">
            <BookmarkPlus className="size-3.5" />
            {t("exposureRadar.card.savedMemory")}
          </span>
        ) : null}
      </div>
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
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <MiniStat icon={<Gauge className="size-3.5" />} label={t("exposureRadar.card.velocity")} value={item.views_per_min ? `${Math.round(item.views_per_min)}/min` : "-"} />
        <MiniStat icon={<Users className="size-3.5" />} label={t("exposureRadar.card.followers")} value={item.followers_count ? formatCompact(item.followers_count) : "-"} />
        <MiniStat icon={<Flame className="size-3.5" />} label={t("exposureRadar.card.heat")} value={item.heat_count ? formatCompact(item.heat_count) : "-"} />
      </div>
      {item.velocity_history?.length ? (
        <VelocitySparkline values={item.velocity_history} />
      ) : null}
      <div className="mt-4 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3">
        <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.card.recommended")}</p>
        <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{item.recommended_use}</p>
        <p className="mt-2 text-xs leading-5 text-[#71767b]">{item.reason}</p>
        {item.ranking_reason ? <p className="mt-2 text-xs leading-5 text-[#8ecdf8]">{item.ranking_reason}</p> : null}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-[#71767b]">
        <span className="inline-flex items-center gap-1">
          <Clock3 className="size-3.5" />
          {item.age_label || (item.updated_at ? formatDateTime(item.updated_at, timeZone) : "-")}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {hasReviewTask ? (
            <Link href={item.review_queue_url || `/execution-queue?type=comment&status=pending_review&focus_type=comment&focus_source_id=${item.review_task_id}`} className="inline-flex h-8 items-center gap-1 rounded-full border border-[#2f3336] px-3 font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
              <MessageSquarePlus className="size-3.5" />
              {t("exposureRadar.card.openReview")}
            </Link>
          ) : (
            <Button type="button" size="sm" variant="outline" disabled={!canDraft || drafting} title={!canDraft && item.data_quality !== "tweet_level" ? t("exposureRadar.card.topicDraftDisabled") : undefined} onClick={() => onCreateDraft(item)}>
              <MessageSquarePlus className="size-3.5" />
              {drafting ? t("exposureRadar.card.drafting") : t("exposureRadar.card.createDraft")}
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" disabled={memoryDisabled || savingMemory} onClick={() => onSaveMemory(item)}>
            <BookmarkPlus className="size-3.5" />
            {savingMemory ? t("exposureRadar.card.savingMemory") : t("exposureRadar.card.saveMemory")}
          </Button>
          {item.url ? (
            <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-full bg-[#1d9bf0] px-3 font-semibold text-white hover:bg-[#1a8cd8]">
              {item.data_quality === "tweet_level" ? t("exposureRadar.card.openPost") : t("exposureRadar.card.openSearch")}
              <ExternalLink className="size-3.5" />
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function MiniStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
      <p className="flex items-center gap-1 text-[11px] text-[#71767b]">{icon}{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[#e7e9ea]">{value}</p>
    </div>
  );
}

function VelocitySparkline({ values }: { values: number[] }) {
  const normalized = values.filter((value) => Number.isFinite(value)).slice(-8);
  if (normalized.length < 2) return null;
  const max = Math.max(...normalized, 1);
  return (
    <div className="mt-3 rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2">
      <div className="flex h-8 items-end gap-1">
        {normalized.map((value, index) => (
          <span
            key={`${value}:${index}`}
            className="flex-1 rounded-t bg-[#1d9bf0]/70"
            style={{ height: `${Math.max(12, Math.round((value / max) * 100))}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function buildRadarMemoryPayload(item: ExposureRadarItemApi, twitterAccountID: number, botID: number): ContentLibraryItemPayload {
  const velocityState = normalizeVelocityState(item.velocity_state, item.status);
  const title = compactTitle(item.topic_name || item.title || "Exposure Radar signal");
  const bodyLines = [
    `Signal: ${item.title}`,
    item.author_handle ? `Author: @${item.author_handle}${item.author_name ? ` (${item.author_name})` : ""}` : "",
    item.content ? `Context: ${item.content}` : "",
    item.reason ? `Why it matters: ${item.reason}` : "",
    item.recommended_use ? `Suggested operator action: ${item.recommended_use}` : "",
    item.ranking_reason ? `Ranking note: ${item.ranking_reason}` : "",
    `Radar metadata: region=${item.region}; quality=${item.data_quality}; score=${item.score}; velocity=${velocityState}; risk=${item.risk_level || "unknown"}.`,
  ].filter(Boolean);
  return {
    twitter_account_id: twitterAccountID,
    bot_id: botID,
    title,
    item_type: "data_insight",
    body: bodyLines.join("\n"),
    source_url: item.url || undefined,
    topics: uniqueList(["exposure-radar", item.region, item.topic_name, velocityState, item.opportunity_type, item.data_quality]),
    growth_goal: "Use as OAF Bot memory for context-aware X replies and posts.",
    cta_preference: "Use only when relevant. Keep replies review-first and do not force product promotion.",
    priority: clampPriority(item.score),
    status: "active",
  };
}

function radarItemMatchesFilter(item: ExposureRadarItemApi, filter: RadarViewFilter, savedMemoryIDs: Set<string>) {
  switch (filter) {
    case "tweet":
      return item.data_quality === "tweet_level";
    case "high_score":
      return item.score >= 75;
    case "needs_review":
      return item.risk_level === "medium" || item.risk_level === "high";
    case "saved":
      return savedMemoryIDs.has(item.id);
    case "drafted":
      return Boolean(item.review_task_id);
    default:
      return true;
  }
}

function buildBriefMemoryPayload(item: ExposureRadarBriefItemApi, twitterAccountID: number, botID: number): ContentLibraryItemPayload {
  const velocityState = normalizeVelocityState(item.velocity_state);
  const title = compactTitle(item.topic_name || item.title || "Hourly opportunity brief");
  const bodyLines = [
    `Brief item: ${item.title}`,
    item.summary ? `Summary: ${item.summary}` : "",
    item.why_it_matters ? `Why it matters: ${item.why_it_matters}` : "",
    item.suggested_action ? `Suggested operator action: ${item.suggested_action}` : "",
    item.best_use ? `Best use: ${item.best_use}` : "",
    `Radar metadata: region=${item.region}; score=${item.score}; velocity=${velocityState}; risk=${item.risk_level || "unknown"}.`,
  ].filter(Boolean);
  return {
    twitter_account_id: twitterAccountID,
    bot_id: botID,
    title,
    item_type: "data_insight",
    body: bodyLines.join("\n"),
    source_url: item.source_url || undefined,
    topics: uniqueList(["exposure-radar", "hourly-brief", item.region, item.topic_name, velocityState, item.best_use]),
    growth_goal: "Use as OAF Bot memory for context-aware X replies and posts.",
    cta_preference: "Use only when relevant. Keep replies review-first and do not force product promotion.",
    priority: clampPriority(item.score),
    status: "active",
  };
}

function compactTitle(value: string) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 96) return normalized;
  return `${normalized.slice(0, 93).trim()}...`;
}

function uniqueList(values: Array<string | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))).slice(0, 12);
}

function clampPriority(score: number) {
  if (!Number.isFinite(score)) return 50;
  return Math.max(50, Math.min(100, Math.round(score)));
}

function formatArchiveDate(value: string, timeZone: string) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone }).format(date);
}

function formatCompact(value: number) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(value >= 10000000 ? 0 : 1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
  return String(value);
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function extractTweetID(raw: string) {
  const match = raw.match(/\/status(?:es)?\/(\d+)/);
  return match?.[1] || "";
}

function normalizeReviewStatus(status?: string) {
  if (!status || status === "review") return "pending_review";
  if (status === "sent" || status === "handled") return "published";
  return status;
}

function normalizeSourceType(value?: string) {
  if (value === "owned_collector" || value === "tl1_fallback" || value === "x_trends_cache") return value;
  return "unknown";
}

function normalizeSourceStatus(value?: string) {
  if (value === "fresh" || value === "stale" || value === "fallback" || value === "cache" || value === "empty") return value;
  return "unknown";
}

function normalizeLearningMode(value?: string) {
  if (value === "hybrid" || value === "workspace" || value === "scoped") return value;
  return "hybrid";
}

function normalizeLearningScope(value?: string) {
  if (value === "selected_bot_account" || value === "workspace" || value === "disabled" || value === "no_memory") return value;
  return "no_memory";
}

function normalizeVelocityState(value?: string, fallback?: string) {
  const raw = (value || fallback || "").toLowerCase();
  if (raw === "new" || raw === "burst" || raw === "rising" || raw === "steady" || raw === "cooling") return raw;
  if (raw === "fire") return "burst";
  if (raw === "hot") return "rising";
  if (raw === "observed" || raw === "normal") return "steady";
  return "unknown";
}

function velocityStateClass(state: string) {
  if (state === "burst") return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
  if (state === "rising" || state === "new") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  if (state === "cooling") return "border-[#64748b]/30 bg-[#64748b]/10 text-[#94a3b8]";
  return "border-[#2f3336] bg-[#16181c] text-[#8b98a5]";
}

function sourceStatusClass(status: string) {
  if (status === "fresh") return "text-[#7ee0b5]";
  if (status === "stale" || status === "fallback") return "text-[#f6d96b]";
  if (status === "empty") return "text-[#ff8a91]";
  return "text-[#8ecdf8]";
}
