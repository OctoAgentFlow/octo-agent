"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import axios from "axios";
import Link from "next/link";
import { Bot, Clock3, ExternalLink, Flame, Hash, RefreshCw, Search, ShieldAlert, Sparkles } from "lucide-react";

import { SectionCard } from "@/components/dashboard/section-card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { formatDateTime, usePreferredTimeZone } from "@/lib/timezone";
import { contentDraftService, type TrendTopicApi } from "@/services/content-drafts.service";
import { oafBotService } from "@/services/oaf-bot.service";
import type { OAFBot } from "@/types/oaf-bot";

const trendCategoryValues = ["crypto", "finance", "tech", "sports", "entertainment", "gaming", "politics", "news", "culture", "lifestyle", "meme", "other"];
const riskValues = ["low", "medium", "high"];

export default function TrendsPage() {
  const { t } = useT();
  const { pushToast } = useToast();
  const timeZone = usePreferredTimeZone();
  const [topics, setTopics] = useState<TrendTopicApi[]>([]);
  const [matchedTopics, setMatchedTopics] = useState<TrendTopicApi[]>([]);
  const [bots, setBots] = useState<OAFBot[]>([]);
  const [selectedBotID, setSelectedBotID] = useState(0);
  const [region, setRegion] = useState("");
  const [category, setCategory] = useState("");
  const [riskLevel, setRiskLevel] = useState("");
  const [regionOptions, setRegionOptions] = useState<string[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(true);
  const [loadingMatch, setLoadingMatch] = useState(false);
  const [loadingBots, setLoadingBots] = useState(true);
  const [error, setError] = useState("");

  const selectedBot = useMemo(() => bots.find((bot) => bot.id === selectedBotID), [bots, selectedBotID]);
  const latestFetchedAt = useMemo(() => latestTrendTime(topics), [topics]);
  const regionCount = useMemo(() => new Set(topics.map((item) => item.region_name).filter(Boolean)).size, [topics]);
  const lowRiskCount = useMemo(() => topics.filter((item) => item.risk_level === "low").length, [topics]);

  const loadTopics = useCallback(async () => {
    setLoadingTopics(true);
    setError("");
    try {
      const data = await contentDraftService.trendTopics({
        limit: 100,
        region,
        category,
        riskLevel,
      });
      setTopics(data.items || []);
      setRegionOptions((current) => mergeOptions(current, data.items.map((item) => item.region_name).filter(Boolean)));
    } catch (loadError) {
      const message = axios.isAxiosError(loadError) ? loadError.response?.data?.message || t("trends.toast.loadFailed") : t("trends.toast.loadFailed");
      setError(message);
      pushToast(message);
    } finally {
      setLoadingTopics(false);
    }
  }, [category, pushToast, region, riskLevel, t]);

  const loadBots = useCallback(async () => {
    setLoadingBots(true);
    try {
      const data = await oafBotService.list();
      setBots(data.items);
      setSelectedBotID((current) => current || data.items[0]?.id || 0);
    } catch {
      setBots([]);
    } finally {
      setLoadingBots(false);
    }
  }, []);

  const loadMatchedTopics = useCallback(async () => {
    if (!selectedBotID) {
      setMatchedTopics([]);
      return;
    }
    setLoadingMatch(true);
    try {
      const data = await contentDraftService.selectedTrends({ botID: selectedBotID, limit: 5 });
      setMatchedTopics(data.items || []);
    } catch (loadError) {
      pushToast(axios.isAxiosError(loadError) ? loadError.response?.data?.message || t("trends.toast.matchFailed") : t("trends.toast.matchFailed"));
      setMatchedTopics([]);
    } finally {
      setLoadingMatch(false);
    }
  }, [pushToast, selectedBotID, t]);

  useEffect(() => {
    void loadBots();
  }, [loadBots]);

  useEffect(() => {
    void loadTopics();
  }, [loadTopics]);

  useEffect(() => {
    void loadMatchedTopics();
  }, [loadMatchedTopics]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-[#1d9bf0]">
            <Flame className="size-4" />
            {t("trends.page.eyebrow")}
          </p>
          <h1 className="mt-2 text-2xl font-bold text-[#e7e9ea] md:text-3xl">{t("trends.page.title")}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#8b98a5]">{t("trends.page.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void loadTopics()} disabled={loadingTopics}>
            {loadingTopics ? <RefreshCw className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {t("trends.actions.refreshCache")}
          </Button>
          <Link href="/oaf-bots" className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[#2f3336] px-4 text-sm font-semibold text-[#e7e9ea] transition hover:bg-[#16181c]">
            <Bot className="size-4" />
            {t("trends.actions.editBotPrefs")}
          </Link>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TrendMetric icon={<Hash className="size-4" />} label={t("trends.metrics.cached")} value={String(topics.length)} />
        <TrendMetric icon={<Search className="size-4" />} label={t("trends.metrics.regions")} value={String(regionCount)} />
        <TrendMetric icon={<ShieldAlert className="size-4" />} label={t("trends.metrics.lowRisk")} value={String(lowRiskCount)} />
        <TrendMetric icon={<Clock3 className="size-4" />} label={t("trends.metrics.latest")} value={latestFetchedAt ? formatDateTime(latestFetchedAt, timeZone) : t("trends.metrics.none")} />
      </div>

      <SectionCard title={t("trends.match.title")} description={t("trends.match.description")}>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <label className="block">
            <span className="text-xs font-semibold text-[#8b98a5]">{t("trends.match.botLabel")}</span>
            <select className="form-input mt-2" value={selectedBotID} onChange={(event) => setSelectedBotID(Number(event.target.value))} disabled={loadingBots || bots.length === 0}>
              {bots.length === 0 ? <option value={0}>{t("trends.match.noBots")}</option> : null}
              {bots.map((bot) => (
                <option key={bot.id} value={bot.id}>{bot.name}</option>
              ))}
            </select>
          </label>
          <Button type="button" variant="outline" onClick={() => void loadMatchedTopics()} disabled={!selectedBotID || loadingMatch}>
            {loadingMatch ? <RefreshCw className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {t("trends.actions.refreshMatch")}
          </Button>
        </div>
        <div className="mt-4">
          {loadingMatch ? (
            <p className="rounded-2xl border border-[#2f3336] bg-black p-4 text-sm text-[#71767b]">{t("trends.match.loading")}</p>
          ) : matchedTopics.length === 0 ? (
            <p className="rounded-2xl border border-[#2f3336] bg-black p-4 text-sm leading-6 text-[#71767b]">
              {selectedBot ? t("trends.match.empty") : t("trends.match.needBot")}
            </p>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {matchedTopics.map((topic) => (
                <TrendCard key={`matched-${topic.woeid}-${topic.normalized_name || topic.trend_name}-${topic.id}`} topic={topic} t={t} timeZone={timeZone} matched />
              ))}
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title={t("trends.cache.title")} description={t("trends.cache.description")}>
        <div className="grid gap-3 lg:grid-cols-4">
          <TrendSelect label={t("trends.filters.region")} value={region} onChange={setRegion} options={regionOptions.map((value) => ({ value, label: value }))} allLabel={t("trends.filters.allRegions")} />
          <TrendSelect
            label={t("trends.filters.category")}
            value={category}
            onChange={setCategory}
            options={trendCategoryValues.map((value) => ({ value, label: trendCategoryLabel(value, t) }))}
            allLabel={t("trends.filters.allCategories")}
          />
          <TrendSelect
            label={t("trends.filters.risk")}
            value={riskLevel}
            onChange={setRiskLevel}
            options={riskValues.map((value) => ({ value, label: riskLabel(value, t) }))}
            allLabel={t("trends.filters.allRisks")}
          />
          <div className="flex items-end">
            <Button type="button" variant="outline" className="w-full" onClick={clearFilters} disabled={!region && !category && !riskLevel}>
              {t("trends.filters.clear")}
            </Button>
          </div>
        </div>

        {error ? <p className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-500/10 p-4 text-sm text-rose-100">{error}</p> : null}

        <div className="mt-4">
          {loadingTopics ? (
            <p className="rounded-2xl border border-[#2f3336] bg-black p-4 text-sm text-[#71767b]">{t("trends.cache.loading")}</p>
          ) : topics.length === 0 ? (
            <p className="rounded-2xl border border-[#2f3336] bg-black p-4 text-sm leading-6 text-[#71767b]">{t("trends.cache.empty")}</p>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {topics.map((topic) => (
                <TrendCard key={`cache-${topic.woeid}-${topic.normalized_name || topic.trend_name}-${topic.id}`} topic={topic} t={t} timeZone={timeZone} />
              ))}
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );

  function clearFilters() {
    setRegion("");
    setCategory("");
    setRiskLevel("");
  }
}

function TrendMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
      <div className="flex items-center gap-2 text-xs text-[#71767b]">
        <span className="inline-flex size-8 items-center justify-center rounded-full border border-[#1d9bf0]/20 bg-[#1d9bf0]/10 text-[#8ecdf8]">{icon}</span>
        <span>{label}</span>
      </div>
      <p className="mt-3 truncate text-lg font-bold text-[#e7e9ea]">{value}</p>
    </div>
  );
}

function TrendSelect({
  label,
  value,
  allLabel,
  options,
  onChange,
}: {
  label: string;
  value: string;
  allLabel: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-[#8b98a5]">{label}</span>
      <select className="form-input mt-2" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  );
}

function TrendCard({
  topic,
  t,
  timeZone,
  matched,
}: {
  topic: TrendTopicApi;
  t: (key: string, params?: Record<string, string | number>) => string;
  timeZone: string;
  matched?: boolean;
}) {
  const xHref = `https://x.com/search?q=${encodeURIComponent(topic.trend_name)}&src=typed_query`;
  return (
    <article className="rounded-2xl border border-[#2f3336] bg-black p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-base font-semibold text-[#e7e9ea]">{topic.trend_name}</h3>
            {matched ? <span className="rounded-full border border-[#1d9bf0]/30 bg-[#1d9bf0]/10 px-2 py-0.5 text-[11px] text-[#8ecdf8]">{t("trends.card.matched")}</span> : null}
          </div>
          <p className="mt-1 text-xs text-[#71767b]">{topic.region_name || t("admin.trends.unknownRegion")} · {trendCategoryLabel(topic.category, t)}</p>
        </div>
        <a href={xHref} target="_blank" rel="noreferrer" className="inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full border border-[#2f3336] px-3 text-xs font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
          <ExternalLink className="size-3.5" />
          {t("trends.card.openX")}
        </a>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className={`rounded-full border px-2.5 py-1 ${riskTone(topic.risk_level)}`}>{riskLabel(topic.risk_level, t)}</span>
        <span className="rounded-full border border-[#2f3336] bg-[#0f1419] px-2.5 py-1 text-[#8b98a5]">{t("trends.card.heat", { count: formatHeat(topic.tweet_count) })}</span>
        <span className="rounded-full border border-[#2f3336] bg-[#0f1419] px-2.5 py-1 text-[#8b98a5]">{formatDateTime(topic.fetched_at, timeZone)}</span>
      </div>

      {topic.relevance_reason ? <p className="mt-3 text-sm leading-6 text-[#c9d1d9]">{topic.relevance_reason}</p> : null}
      {topic.matched_keywords?.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {topic.matched_keywords.map((keyword) => (
            <span key={keyword} className="rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-2 py-0.5 text-[11px] text-[#8ecdf8]">
              {keyword}
            </span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function mergeOptions(current: string[], additions: string[]) {
  return Array.from(new Set([...current, ...additions].map((item) => item.trim()).filter(Boolean))).sort();
}

function latestTrendTime(items: TrendTopicApi[]) {
  const value = items
    .map((item) => Date.parse(item.fetched_at))
    .filter((time) => Number.isFinite(time))
    .sort((a, b) => b - a)[0];
  return value ? new Date(value).toISOString() : "";
}

function trendCategoryLabel(category: string, t: (key: string) => string) {
  const key = `contentDrafts.trends.category.${category || "other"}`;
  const label = t(key);
  return label === key ? category || t("contentDrafts.trends.category.other") : label;
}

function riskLabel(risk: string, t: (key: string) => string) {
  const normalized = risk === "high" || risk === "medium" || risk === "low" ? risk : "low";
  return t(`trends.risk.${normalized}`);
}

function riskTone(risk: string) {
  if (risk === "high") return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
  if (risk === "medium") return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
  return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
}

function formatHeat(count: number) {
  if (!count) return "n/a";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(count);
}
