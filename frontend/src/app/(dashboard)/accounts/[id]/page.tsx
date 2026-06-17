"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import axios from "axios";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, BarChart3, Bot, BrainCircuit, CheckCircle2, Database, ExternalLink, FileText, Gauge, Lock, RefreshCw, ShieldAlert, ShieldCheck, Sparkles, Target, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { accountService, type AccountIntelligenceApi, type AccountIntelligencePostApi } from "@/services/account.service";
import { exposureRadarService, type ExposureRadarGrowthStrategyPayload, type ExposureRadarRegion } from "@/services/exposure-radar.service";
import { oafBotService } from "@/services/oaf-bot.service";
import type { OAFBot, OAFBotPayload } from "@/types/oaf-bot";

type LoadState = "loading" | "ready" | "error";
type AccountDiagnosisStatus = "ready" | "needs_lane" | "needs_data";
type AccountDiagnosis = {
  score: number;
  status: AccountDiagnosisStatus;
  checks: Array<{ key: string; pass: boolean; value: string }>;
};

export default function AccountDetailPage() {
  const { t } = useT();
  const { pushToast } = useToast();
  const params = useParams<{ id: string }>();
  const accountID = Number(Array.isArray(params.id) ? params.id[0] : params.id);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [data, setData] = useState<AccountIntelligenceApi | null>(null);
  const [bots, setBots] = useState<OAFBot[]>([]);
  const [applying, setApplying] = useState(false);
  const [applyingStrategy, setApplyingStrategy] = useState(false);
  const [strategyAppliedAt, setStrategyAppliedAt] = useState("");

  const boundBot = useMemo(() => bots.find((bot) => bot.twitter_account_id === accountID), [accountID, bots]);
  const strategyRegion = useMemo(() => accountIntelligenceRegion(data), [data]);
  const strategyPreview = useMemo(() => data ? buildGrowthStrategyPayloadFromAccount(data, accountID, boundBot?.id || 0, strategyRegion) : null, [accountID, boundBot?.id, data, strategyRegion]);
  const radarHref = useMemo(() => {
    const query = new URLSearchParams({
      x_account_id: String(accountID || data?.account.id || 0),
      region: strategyRegion,
      tab: "today",
      activation: "first_day",
    });
    if (boundBot?.id) query.set("bot_id", String(boundBot.id));
    return `/exposure-radar?${query.toString()}`;
  }, [accountID, boundBot?.id, data?.account.id, strategyRegion]);
  const firstDayHref = `${radarHref}#first-day-path`;

  const load = useCallback(async () => {
    if (!Number.isFinite(accountID) || accountID <= 0) {
      setLoadState("error");
      setErrorMessage(t("accounts.intelligence.invalidAccount"));
      return;
    }
    setLoadState("loading");
    setErrorMessage("");
    try {
      const [next, botData] = await Promise.all([
        accountService.intelligence(accountID),
        oafBotService.list(),
      ]);
      setData(next);
      setBots(botData.items || []);
      setLoadState("ready");
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || t("accounts.intelligence.loadFailed")
        : t("accounts.intelligence.loadFailed");
      setErrorMessage(message);
      setLoadState("error");
    }
  }, [accountID, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyBotSuggestion = useCallback(async () => {
    if (!data || !Number.isFinite(accountID) || accountID <= 0) return;
    setApplying(true);
    try {
      const payload = normalizeBotPayload({ ...data.bot_suggestion, twitter_account_id: accountID });
      if (boundBot) {
        await oafBotService.update(boundBot.id, { ...payload, name: boundBot.name || payload.name });
        pushToast(t("accounts.intelligence.toast.botUpdated"));
      } else {
        await oafBotService.create(payload);
        pushToast(t("accounts.intelligence.toast.botCreated"));
      }
      const botData = await oafBotService.list();
      setBots(botData.items || []);
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("accounts.intelligence.toast.applyFailed") : t("accounts.intelligence.toast.applyFailed"));
    } finally {
      setApplying(false);
    }
  }, [accountID, boundBot, data, pushToast, t]);

  const applyGrowthStrategy = useCallback(async () => {
    if (!data || !strategyPreview || !Number.isFinite(accountID) || accountID <= 0) return;
    setApplyingStrategy(true);
    try {
      await exposureRadarService.saveGrowthStrategy(strategyPreview);
      setStrategyAppliedAt(new Date().toISOString());
      pushToast(t(boundBot ? "accounts.intelligence.toast.strategyApplied" : "accounts.intelligence.toast.strategyAppliedAccount"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("accounts.intelligence.toast.strategyFailed") : t("accounts.intelligence.toast.strategyFailed"));
    } finally {
      setApplyingStrategy(false);
    }
  }, [accountID, boundBot, data, pushToast, strategyPreview, t]);

  if (loadState === "loading") {
    return (
      <Card className="bg-[#0f1419]">
        <CardHeader title={t("accounts.intelligence.loading.title")} description={t("accounts.intelligence.loading.description")} />
      </Card>
    );
  }

  if (loadState === "error") {
    return (
      <Card className="bg-[#0f1419]">
        <CardHeader title={t("accounts.intelligence.error.title")} description={errorMessage || t("common.retryHint")} />
        <Button type="button" onClick={() => void load()}>
          <RefreshCw className="size-4" />
          {t("common.retry")}
        </Button>
      </Card>
    );
  }

  if (!data) return null;

  const accountLabel = `@${data.account.username}`;
  const sourceStatus = normalizeSourceStatus(data.source_status);
  const diagnosis = buildAccountDiagnosis(data, Boolean(boundBot), sourceStatus, t);

  return (
    <div className="space-y-4 md:space-y-5">
      <Card className="overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(29,155,240,0.16),transparent_32%),#0f1419]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${sourceStatusTone(sourceStatus)}`}>
                <BrainCircuit className="size-3.5" />
                {t(`accounts.intelligence.status.${sourceStatus}`)}
              </span>
              <span className="inline-flex h-8 items-center rounded-full border border-[#2f3336] bg-black px-3 text-xs font-semibold text-[#8b98a5]">
                {accountLabel}
              </span>
            </div>
            <h1 className="mt-4 text-2xl font-bold text-[#e7e9ea] md:text-3xl">{t("accounts.intelligence.title")}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#8b98a5]">{data.positioning.positioning_summary}</p>
            {data.limit_reason ? (
              <p className="mt-3 rounded-2xl border border-[#ffd400]/25 bg-[#ffd400]/10 px-4 py-3 text-sm leading-6 text-[#f6d96b]">{data.limit_reason}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void load()}>
              <RefreshCw className="size-4" />
              {t("common.refresh")}
            </Button>
            <Link href={radarHref} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#1d9bf0] px-3 text-sm font-semibold text-white hover:bg-[#1a8cd8]">
              <TrendingUp className="size-4" />
              {t("accounts.intelligence.openRadar")}
            </Link>
          </div>
        </div>
      </Card>

      <DataBoundaryPanel />

      <Card className="bg-[#0f1419]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <CardHeader
            title={t("accounts.intelligence.diagnosis.title")}
            description={t("accounts.intelligence.diagnosis.description")}
            className="mb-0"
          />
          <div className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${diagnosisStatusTone(diagnosis.status)}`}>
            <Gauge className="size-3.5" />
            {t(`accounts.intelligence.diagnosis.status.${diagnosis.status}`)}
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="rounded-2xl border border-[#1d9bf0]/25 bg-[#07111a] p-4">
            <p className="text-xs font-semibold text-[#8ecdf8]">{t("accounts.intelligence.diagnosis.score")}</p>
            <p className="mt-2 text-4xl font-semibold text-white">{diagnosis.score}</p>
            <p className="mt-2 text-xs leading-5 text-[#8b98a5]">{t("accounts.intelligence.diagnosis.scoreHint")}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {diagnosis.checks.map((check) => (
              <DiagnosisCheck key={check.key} title={t(`accounts.intelligence.diagnosis.check.${check.key}.title`)} detail={t(`accounts.intelligence.diagnosis.check.${check.key}.description`)} value={check.value} pass={check.pass} />
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
            <p className="text-sm font-semibold text-[#e7e9ea]">{t("accounts.intelligence.diagnosis.plan.title")}</p>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              {["one", "two", "three"].map((step, index) => (
                <div key={step} className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
                  <span className="inline-flex size-6 items-center justify-center rounded-full border border-[#1d9bf0]/35 bg-[#1d9bf0]/10 text-[11px] font-semibold text-[#8ecdf8]">{index + 1}</span>
                  <p className="mt-2 text-xs leading-5 text-[#8b98a5]">{t(`accounts.intelligence.diagnosis.plan.${step}`)}</p>
                </div>
              ))}
            </div>
          </div>
          <Link href={radarHref} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-[#1d9bf0] px-4 text-sm font-semibold text-white hover:bg-[#1a8cd8]">
            {t("accounts.intelligence.diagnosis.cta")}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <div className="space-y-4">
          <Card className="bg-[#0f1419]">
            <CardHeader title={t("accounts.intelligence.positioning.title")} description={t("accounts.intelligence.positioning.description")} />
            <div className="grid gap-3 md:grid-cols-4">
              <MetricTile label={t("accounts.intelligence.metric.confidence")} value={`${data.positioning.confidence}/100`} />
              <MetricTile label={t("accounts.intelligence.metric.language")} value={data.positioning.primary_language || "-"} />
              <MetricTile label={t("accounts.intelligence.metric.stage")} value={t(`accounts.intelligence.stage.${normalizeStage(data.positioning.maturity_stage)}`)} />
              <MetricTile label={t("accounts.intelligence.metric.voice")} value={data.positioning.voice_tone || "-"} />
            </div>
            <TagSection title={t("accounts.intelligence.topics")} values={data.positioning.detected_topics} />
            <TwoColumnList
              leftTitle={t("accounts.intelligence.strengths")}
              leftItems={data.positioning.strengths}
              rightTitle={t("accounts.intelligence.risks")}
              rightItems={data.positioning.risks}
            />
          </Card>

          <Card className="bg-[#0f1419]">
            <CardHeader title={t("accounts.intelligence.performance.title")} description={t("accounts.intelligence.performance.description")} />
            <div className="grid gap-3 md:grid-cols-4">
              <MetricTile label={t("accounts.intelligence.metric.posts")} value={formatCompact(data.metrics.post_count)} />
              <MetricTile label={t("accounts.intelligence.metric.impressions")} value={formatCompact(data.metrics.total_impressions)} />
              <MetricTile label={t("accounts.intelligence.metric.engagements")} value={formatCompact(data.metrics.total_engagements)} />
              <MetricTile label={t("accounts.intelligence.metric.engagementRate")} value={formatPercent(data.metrics.average_engagement_rate)} />
            </div>
            {data.metrics.best_post_text ? (
              <div className="mt-4 rounded-2xl border border-[#1d9bf0]/25 bg-[#07111a] p-4">
                <p className="text-xs font-semibold text-[#8ecdf8]">{t("accounts.intelligence.bestPost")}</p>
                <p className="mt-2 text-sm leading-6 text-[#e7e9ea]">{data.metrics.best_post_text}</p>
                {data.metrics.best_post_url ? (
                  <a href={data.metrics.best_post_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#1d9bf0] hover:text-[#8ecdf8]">
                    {t("accounts.intelligence.openPost")}
                    <ExternalLink className="size-3.5" />
                  </a>
                ) : null}
              </div>
            ) : null}
          </Card>

          <Card className="bg-[#0f1419]">
            <CardHeader title={t("accounts.intelligence.posts.title")} description={t("accounts.intelligence.posts.description")} />
            <div className="space-y-3">
              {data.recent_posts.slice(0, 8).map((post) => (
                <RecentPostRow key={post.id} post={post} />
              ))}
              {data.recent_posts.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#2f3336] px-4 py-8 text-center text-sm text-[#71767b]">
                  {t("accounts.intelligence.posts.empty")}
                </div>
              ) : null}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="bg-[#0f1419]">
            <CardHeader title={t("accounts.intelligence.bot.title")} description={boundBot ? t("accounts.intelligence.bot.bound", { bot: boundBot.name }) : t("accounts.intelligence.bot.unbound")} />
            <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
              <p className="text-sm font-semibold text-[#e7e9ea]">{data.bot_suggestion.name}</p>
              <p className="mt-2 text-sm leading-6 text-[#8b98a5]">{data.bot_suggestion.identity_summary}</p>
              <TagSection title={t("accounts.intelligence.bot.pillars")} values={data.bot_suggestion.content_pillars || []} compact />
            </div>
            <Button type="button" className="mt-4 w-full" disabled={applying} onClick={() => void applyBotSuggestion()}>
              {applying ? <RefreshCw className="size-4 animate-spin" /> : <Bot className="size-4" />}
              {boundBot ? t("accounts.intelligence.bot.update") : t("accounts.intelligence.bot.create")}
            </Button>
          </Card>

          <Card className="bg-[#0f1419]">
            <CardHeader title={t("accounts.intelligence.radar.title")} description={t("accounts.intelligence.radar.description")} />
            {strategyPreview ? (
              <div className="mb-4 rounded-2xl border border-[#1d9bf0]/25 bg-[#07111a] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[#e7e9ea]">{t("accounts.intelligence.strategyApply.title")}</p>
                    <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t(boundBot ? "accounts.intelligence.strategyApply.descriptionBound" : "accounts.intelligence.strategyApply.descriptionAccount")}</p>
                  </div>
                  <span className="inline-flex w-fit items-center gap-1 rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-2.5 py-1 text-[11px] font-semibold text-[#8ecdf8]">
                    <Target className="size-3.5" />
                    {t(`exposureRadar.region.${strategyPreview.region}`)}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <MiniStrategyField label={t("accounts.intelligence.strategyApply.audience")} value={strategyPreview.target_audience || "-"} />
                  <MiniStrategyField label={t("accounts.intelligence.strategyApply.safety")} value={t(`exposureRadar.strategy.safetyMode.${strategyPreview.safety_mode || "balanced"}`)} />
                  <MiniStrategyField label={t("accounts.intelligence.strategyApply.topics")} value={(strategyPreview.core_topics || []).slice(0, 5).join(", ") || "-"} />
                  <MiniStrategyField label={t("accounts.intelligence.strategyApply.avoid")} value={(strategyPreview.avoid_topics || []).slice(0, 5).join(", ") || "-"} />
                </div>
                <Button type="button" className="mt-4 w-full" disabled={applyingStrategy} onClick={() => void applyGrowthStrategy()}>
                  {applyingStrategy ? <RefreshCw className="size-4 animate-spin" /> : <BrainCircuit className="size-4" />}
                  {t("accounts.intelligence.strategyApply.button")}
                </Button>
                {strategyAppliedAt ? (
                  <div className="mt-3 rounded-2xl border border-[#00ba7c]/25 bg-[#00ba7c]/10 p-3">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#7ee0b5]" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#e7e9ea]">{t("accounts.intelligence.strategyApply.saved.title")}</p>
                        <p className="mt-1 text-[11px] leading-5 text-[#8b98a5]">{t("accounts.intelligence.strategyApply.saved.description")}</p>
                      </div>
                    </div>
                    <Link href={firstDayHref} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-[#00ba7c] px-3 text-sm font-semibold text-black hover:bg-[#7ee0b5]">
                      {t("accounts.intelligence.strategyApply.saved.cta")}
                      <ArrowRight className="size-4" />
                    </Link>
                  </div>
                ) : null}
              </div>
            ) : null}
            <TagSection title={t("accounts.intelligence.radar.fitKeywords")} values={data.radar_guidance.fit_keywords} compact />
            <TagSection title={t("accounts.intelligence.radar.avoidKeywords")} values={data.radar_guidance.avoid_keywords} compact tone="warning" />
            <BulletList title={t("accounts.intelligence.radar.rules")} items={data.radar_guidance.opportunity_fit_rules} icon="target" />
            <Link href={radarHref} className="mt-4 inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-[#1d9bf0] px-3 text-sm font-semibold text-white hover:bg-[#1a8cd8]">
              {t("accounts.intelligence.openRadar")}
              <ArrowRight className="size-4" />
            </Link>
          </Card>

          <Card className="bg-[#0f1419]">
            <CardHeader title={t("accounts.intelligence.weekly.title")} description={data.weekly_review.headline} />
            <BulletList title={t("accounts.intelligence.weekly.wins")} items={data.weekly_review.wins} icon="check" />
            <BulletList title={t("accounts.intelligence.weekly.next")} items={data.weekly_review.next_actions} icon="spark" />
          </Card>
        </div>
      </div>
    </div>
  );
}

function DataBoundaryPanel() {
  const { t } = useT();
  const items = [
    {
      key: "publicX",
      Icon: Database,
      tone: "border-[#1d9bf0]/25 bg-[#07111a] text-[#8ecdf8]",
    },
    {
      key: "userContext",
      Icon: FileText,
      tone: "border-[#a78bfa]/25 bg-[#171125] text-[#c4b5fd]",
    },
    {
      key: "workflowData",
      Icon: ShieldCheck,
      tone: "border-[#00ba7c]/25 bg-[#061a14] text-[#7ee0b5]",
    },
    {
      key: "notAvailable",
      Icon: Lock,
      tone: "border-[#ffd400]/25 bg-[#1f1a07] text-[#f6d96b]",
    },
  ];

  return (
    <Card className="bg-[#0f1419]">
      <CardHeader title={t("accounts.intelligence.dataBoundary.title")} description={t("accounts.intelligence.dataBoundary.description")} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <div key={item.key} className={`rounded-2xl border p-4 ${item.tone}`}>
            <div className="flex items-center gap-2">
              <span className="inline-flex size-8 items-center justify-center rounded-full border border-current/25 bg-black/35">
                <item.Icon className="size-4" />
              </span>
              <p className="text-sm font-semibold text-[#e7e9ea]">{t(`accounts.intelligence.dataBoundary.${item.key}.title`)}</p>
            </div>
            <p className="mt-3 text-xs leading-5 text-[#8b98a5]">{t(`accounts.intelligence.dataBoundary.${item.key}.description`)}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-[#2f3336] bg-black p-4">
      <p className="text-xs text-[#71767b]">{label}</p>
      <p className="mt-2 break-words text-lg font-semibold text-[#e7e9ea]">{value}</p>
    </div>
  );
}

function MiniStrategyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-[#2f3336] bg-black px-3 py-2">
      <p className="text-[11px] font-semibold text-[#71767b]">{label}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#e7e9ea]">{value}</p>
    </div>
  );
}

function DiagnosisCheck({ title, detail, value, pass }: { title: string; detail: string; value: string; pass: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${pass ? "border-[#00ba7c]/25 bg-[#061a14]" : "border-[#ffd400]/25 bg-[#1f1a07]"}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-[#e7e9ea]">{title}</p>
        {pass ? <CheckCircle2 className="size-4 text-[#7ee0b5]" /> : <ShieldAlert className="size-4 text-[#f6d96b]" />}
      </div>
      <p className="mt-2 text-xs leading-5 text-[#8b98a5]">{detail}</p>
      <p className="mt-3 text-xs font-semibold text-[#e7e9ea]">{value}</p>
    </div>
  );
}

function TagSection({ title, values, compact = false, tone = "default" }: { title: string; values: string[]; compact?: boolean; tone?: "default" | "warning" }) {
  const tags = (values || []).filter(Boolean);
  if (!tags.length) return null;
  return (
    <div className={compact ? "mt-3" : "mt-4"}>
      <p className="text-xs font-semibold text-[#71767b]">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {tags.map((value) => (
          <span key={value} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${tone === "warning" ? "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]" : "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]"}`}>
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

function TwoColumnList({ leftTitle, leftItems, rightTitle, rightItems }: { leftTitle: string; leftItems: string[]; rightTitle: string; rightItems: string[] }) {
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <BulletList title={leftTitle} items={leftItems} icon="check" />
      <BulletList title={rightTitle} items={rightItems} icon="risk" />
    </div>
  );
}

function BulletList({ title, items, icon }: { title: string; items: string[]; icon: "check" | "risk" | "target" | "spark" }) {
  const Icon = icon === "check" ? CheckCircle2 : icon === "risk" ? ShieldAlert : icon === "target" ? Target : Sparkles;
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-[#e7e9ea]">
        <Icon className="size-3.5 text-[#1d9bf0]" />
        {title}
      </p>
      <div className="mt-3 space-y-2">
        {(items || []).map((item) => (
          <p key={item} className="text-xs leading-5 text-[#8b98a5]">{item}</p>
        ))}
      </div>
    </div>
  );
}

function RecentPostRow({ post }: { post: AccountIntelligencePostApi }) {
  const { t } = useT();
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <p className="line-clamp-3 text-sm leading-6 text-[#e7e9ea]">{post.text}</p>
        <span className="inline-flex w-fit shrink-0 items-center gap-1 rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-2 py-1 text-xs font-semibold text-[#8ecdf8]">
          <Gauge className="size-3.5" />
          {post.score}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
        <MetricPill icon={<BarChart3 className="size-3.5" />} label={t("accounts.intelligence.postMetric.views")} value={formatCompact(post.impression_count)} />
        <MetricPill icon={<TrendingUp className="size-3.5" />} label={t("accounts.intelligence.postMetric.engagements")} value={formatCompact(post.engagements)} />
        <MetricPill icon={<Gauge className="size-3.5" />} label={t("accounts.intelligence.postMetric.rate")} value={formatPercent(post.engagement_rate)} />
        {post.url ? (
          <a href={post.url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-1 rounded-xl border border-[#2f3336] px-3 py-2 font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
            {t("accounts.intelligence.openPost")}
            <ExternalLink className="size-3.5" />
          </a>
        ) : <span />}
      </div>
    </div>
  );
}

function MetricPill({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2">
      <p className="flex items-center gap-1 text-[11px] text-[#71767b]">{icon}{label}</p>
      <p className="mt-1 text-sm font-semibold text-[#e7e9ea]">{value}</p>
    </div>
  );
}

function normalizeBotPayload(payload: OAFBotPayload): OAFBotPayload {
  const list = (values?: string[] | null) => Array.isArray(values) ? values.filter(Boolean) : [];
  return {
    ...payload,
    personality_tags: list(payload.personality_tags),
    topics: list(payload.topics),
    forbidden_topics: list(payload.forbidden_topics),
    content_pillars: list(payload.content_pillars),
    hashtags: list(payload.hashtags),
    keywords: list(payload.keywords),
    avoid_claims: list(payload.avoid_claims),
    trend_regions: list(payload.trend_regions),
    trend_categories: list(payload.trend_categories),
    safety_mode: payload.safety_mode || "balanced",
    primary_language: payload.primary_language || "en",
    language_strategy: payload.language_strategy || "follow_context",
    sensitive_trend_policy: payload.sensitive_trend_policy || "review_only",
  };
}

function accountIntelligenceRegion(data: AccountIntelligenceApi | null): ExposureRadarRegion {
  const language = data?.positioning.primary_language?.toLowerCase() || data?.bot_suggestion.primary_language?.toLowerCase() || "";
  return language.startsWith("zh") || language.includes("chinese") ? "zh" : "en";
}

function buildGrowthStrategyPayloadFromAccount(data: AccountIntelligenceApi, accountID: number, botID: number, region: ExposureRadarRegion): ExposureRadarGrowthStrategyPayload {
  const bot = normalizeBotPayload(data.bot_suggestion);
  const coreTopics = uniqueStrings([
    ...(data.radar_guidance.fit_keywords || []),
    ...(data.positioning.detected_topics || []),
    ...(data.positioning.content_pillars || []),
    ...(bot.topics || []),
    ...(bot.content_pillars || []),
    ...(bot.keywords || []),
  ], 20);
  const avoidTopics = uniqueStrings([
    ...(data.radar_guidance.avoid_keywords || []),
    ...(bot.forbidden_topics || []),
    ...(bot.avoid_claims || []),
  ], 20);
  return {
    bot_id: botID || undefined,
    x_account_id: accountID || data.account.id,
    region,
    target_audience: data.positioning.audience_guess || bot.target_audience || data.positioning.positioning_summary || "",
    primary_goal: inferGrowthStrategyGoal(data),
    core_topics: coreTopics,
    avoid_topics: avoidTopics,
    competitors: [],
    reply_style: inferReplyStyle(data),
    daily_move_limit: data.positioning.confidence >= 65 ? (region === "zh" ? 10 : 8) : 5,
    safety_mode: avoidTopics.length || data.positioning.risks?.length ? "conservative" : "balanced",
    operator_notes: compactStrategyNotes(data),
  };
}

function uniqueStrings(values: string[], limit: number) {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => {
      const key = value.toLowerCase();
      if (!value || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

function inferGrowthStrategyGoal(data: AccountIntelligenceApi) {
  const text = `${data.positioning.positioning_summary} ${data.positioning.audience_guess} ${(data.weekly_review.next_actions || []).join(" ")}`.toLowerCase();
  if (text.includes("community") || text.includes("社群") || text.includes("社区")) return "community";
  if (text.includes("traffic") || text.includes("website") || text.includes("转化") || text.includes("访问")) return "traffic";
  if (text.includes("research") || text.includes("learn") || text.includes("调研")) return "research";
  if (text.includes("relationship") || text.includes("network") || text.includes("关系")) return "relationships";
  return "awareness";
}

function inferReplyStyle(data: AccountIntelligenceApi) {
  const tone = `${data.positioning.voice_tone} ${data.bot_suggestion.voice_tone}`.toLowerCase();
  if (tone.includes("question") || tone.includes("curious") || tone.includes("提问")) return "light_question";
  if (tone.includes("caution") || tone.includes("careful") || tone.includes("谨慎")) return "caution_note";
  if (tone.includes("peer") || tone.includes("builder") || tone.includes("同行")) return "peer_experience";
  return "operator_observation";
}

function compactStrategyNotes(data: AccountIntelligenceApi) {
  const parts = [
    data.positioning.positioning_summary,
    data.radar_guidance.opportunity_fit_rules?.length ? `Fit rules: ${data.radar_guidance.opportunity_fit_rules.slice(0, 3).join("; ")}` : "",
    data.weekly_review.next_actions?.length ? `Next: ${data.weekly_review.next_actions.slice(0, 2).join("; ")}` : "",
  ].filter(Boolean);
  return parts.join("\n").slice(0, 500);
}

function normalizeSourceStatus(value?: string) {
  if (value === "ready" || value === "limited" || value === "empty" || value === "needs_reauth") return value;
  return "limited";
}

function sourceStatusTone(value: string) {
  if (value === "ready") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  if (value === "needs_reauth" || value === "empty") return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
  return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
}

function buildAccountDiagnosis(
  data: AccountIntelligenceApi,
  hasBoundBot: boolean,
  sourceStatus: string,
  t: (key: string, params?: Record<string, string | number>) => string,
): AccountDiagnosis {
  const confidence = Math.max(0, Math.min(100, data.positioning.confidence || 0));
  const postCount = data.metrics.post_count || data.recent_posts.length || 0;
  const hasPosts = postCount >= 3;
  const hasViews = (data.metrics.total_impressions || 0) > 0;
  const hasTopics = (data.positioning.detected_topics || []).length > 0;
  const ruleCount = (data.radar_guidance.opportunity_fit_rules || []).length;
  const hasRules = ruleCount > 0;
  const score = Math.round(
    confidence * 0.4
    + (hasBoundBot ? 18 : 0)
    + (hasPosts ? 14 : 0)
    + (hasViews ? 10 : 0)
    + (hasTopics ? 8 : 0)
    + (hasRules ? 10 : 0),
  );
  const status: AccountDiagnosisStatus =
    sourceStatus === "empty" || sourceStatus === "needs_reauth" || !hasPosts
      ? "needs_data"
      : !hasBoundBot || !hasRules || confidence < 50
        ? "needs_lane"
        : "ready";

  return {
    score: Math.max(0, Math.min(100, score)),
    status,
    checks: [
      {
        key: "positioning",
        pass: confidence >= 50 && hasTopics,
        value: t("accounts.intelligence.diagnosis.value.confidence", { score: confidence }),
      },
      {
        key: "bot",
        pass: hasBoundBot,
        value: t(hasBoundBot ? "accounts.intelligence.diagnosis.value.ready" : "accounts.intelligence.diagnosis.value.missing"),
      },
      {
        key: "content",
        pass: hasPosts && hasViews,
        value: t("accounts.intelligence.diagnosis.value.posts", { count: postCount }),
      },
      {
        key: "radar",
        pass: hasRules,
        value: t("accounts.intelligence.diagnosis.value.rules", { count: ruleCount }),
      },
    ],
  };
}

function diagnosisStatusTone(status: AccountDiagnosisStatus) {
  if (status === "ready") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  if (status === "needs_lane") return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
}

function normalizeStage(value?: string) {
  if (value === "warming_up" || value === "finding_repeatable_signals" || value === "ready_to_systematize" || value === "needs_recent_content") return value;
  return "warming_up";
}

function formatCompact(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (value >= 1000000) return `${(value / 1000000).toFixed(value >= 10000000 ? 0 : 1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
  return String(value);
}

function formatPercent(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  return `${Math.round(value * 1000) / 10}%`;
}
