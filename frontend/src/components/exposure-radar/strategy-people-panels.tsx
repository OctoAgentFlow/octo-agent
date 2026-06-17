"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Database, ExternalLink, Flame, Heart, RefreshCw, Search, SlidersHorizontal, Target, Users, Zap } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";
import { formatDateTime } from "@/lib/timezone";
import type { ExposureRadarGrowthStrategyApi, ExposureRadarManualRecordApi, ExposureRadarRegion, ExposureRadarSafetyCenterData, ExposureRadarWeeklyReviewData } from "@/services/exposure-radar.service";
import { peopleRadarStageTone } from "@/components/exposure-radar/operating-desk-panels";
import { ActionPlanMetric, MiniStat, ReviewList, StrategyInput } from "@/components/exposure-radar/panel-primitives";
import { buildPeopleRadarNextTouch, buildPeopleRadarPlaybook, peopleRadarPlaybookTone } from "@/components/exposure-radar/people-radar-utils";
import { formatCompact } from "@/components/exposure-radar/radar-utils";
import { buildStarterStrategyTemplates, strategyFormFromApi } from "@/components/exposure-radar/strategy-form-utils";
import type { PeopleRadarEntry, StarterStrategyTemplate, StrategyFormState } from "@/components/exposure-radar/types";

export function StrategySetupPanel({ strategy, region, saving, onSave }: { strategy: ExposureRadarGrowthStrategyApi | null; region: ExposureRadarRegion; saving: boolean; onSave: (form: StrategyFormState) => void }) {
  const { t } = useT();
  const [form, setForm] = useState<StrategyFormState>(() => strategyFormFromApi(strategy));
  const templates = useMemo(() => buildStarterStrategyTemplates(t, region), [region, t]);
  useEffect(() => {
    setForm(strategyFormFromApi(strategy));
  }, [strategy]);
  const setField = <K extends keyof StrategyFormState,>(key: K, value: StrategyFormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const applyTemplate = (template: StarterStrategyTemplate) => {
    setForm((current) => ({
      ...current,
      ...template.form,
    }));
  };
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <CardHeader title={t("exposureRadar.strategy.title")} description={t("exposureRadar.strategy.description")} className="mb-0" />
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-3 py-1 text-xs font-semibold text-[#8ecdf8]">
          <SlidersHorizontal className="size-3.5" />
          {t(`exposureRadar.region.${region}`)}
        </span>
      </div>
      <div className="mt-4 rounded-2xl border border-[#2f3336] bg-black p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[#e7e9ea]">{t("exposureRadar.strategy.templates.title")}</p>
            <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("exposureRadar.strategy.templates.description")}</p>
          </div>
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[#2f3336] bg-[#16181c] px-3 py-1 text-xs font-semibold text-[#8b98a5]">
            <Target className="size-3.5" />
            {t("exposureRadar.strategy.templates.badge")}
          </span>
        </div>
        <div className="mt-3 grid gap-2 lg:grid-cols-4">
          {templates.map((template) => (
            <button key={template.key} type="button" onClick={() => applyTemplate(template)} className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3 text-left transition hover:border-[#1d9bf0]/45 hover:bg-[#1d9bf0]/10">
              <p className="text-sm font-semibold text-[#e7e9ea]">{t(`exposureRadar.strategy.templates.${template.key}.name`)}</p>
              <p className="mt-1 min-h-10 text-xs leading-5 text-[#8b98a5]">{t(`exposureRadar.strategy.templates.${template.key}.description`)}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#8ecdf8]">
                {t("exposureRadar.strategy.templates.apply")}
                <ArrowRight className="size-3.5" />
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <StrategyInput label={t("exposureRadar.strategy.targetAudience")} value={form.targetAudience} onChange={(value) => setField("targetAudience", value)} placeholder={t("exposureRadar.strategy.targetAudiencePlaceholder")} />
        <label>
          <span className="text-xs font-semibold text-[#8b98a5]">{t("exposureRadar.strategy.primaryGoal")}</span>
          <select value={form.primaryGoal} onChange={(event) => setField("primaryGoal", event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none focus:border-[#1d9bf0]">
            {["awareness", "relationships", "traffic", "community", "research"].map((option) => (
              <option key={option} value={option}>{t(`exposureRadar.strategy.goal.${option}`)}</option>
            ))}
          </select>
        </label>
        <StrategyInput label={t("exposureRadar.strategy.coreTopics")} value={form.coreTopics} onChange={(value) => setField("coreTopics", value)} placeholder={t("exposureRadar.strategy.coreTopicsPlaceholder")} />
        <StrategyInput label={t("exposureRadar.strategy.avoidTopics")} value={form.avoidTopics} onChange={(value) => setField("avoidTopics", value)} placeholder={t("exposureRadar.strategy.avoidTopicsPlaceholder")} />
        <StrategyInput label={t("exposureRadar.strategy.competitors")} value={form.competitors} onChange={(value) => setField("competitors", value)} placeholder={t("exposureRadar.strategy.competitorsPlaceholder")} />
        <div className="grid gap-3 sm:grid-cols-3">
          <label>
            <span className="text-xs font-semibold text-[#8b98a5]">{t("exposureRadar.strategy.replyStyle")}</span>
            <select value={form.replyStyle} onChange={(event) => setField("replyStyle", event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none focus:border-[#1d9bf0]">
              {["operator_observation", "light_question", "peer_experience", "caution_note"].map((option) => (
                <option key={option} value={option}>{t(`exposureRadar.strategy.replyStyle.${option}`)}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-xs font-semibold text-[#8b98a5]">{t("exposureRadar.strategy.dailyMoveLimit")}</span>
            <input inputMode="numeric" value={String(form.dailyMoveLimit)} onChange={(event) => setField("dailyMoveLimit", Math.max(1, Math.min(50, Number(event.target.value.replace(/[^\d]/g, "")) || 1)))} className="mt-2 h-10 w-full rounded-xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none focus:border-[#1d9bf0]" />
          </label>
          <label>
            <span className="text-xs font-semibold text-[#8b98a5]">{t("exposureRadar.strategy.safetyMode")}</span>
            <select value={form.safetyMode} onChange={(event) => setField("safetyMode", event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none focus:border-[#1d9bf0]">
              {["conservative", "balanced", "growth"].map((option) => (
                <option key={option} value={option}>{t(`exposureRadar.strategy.safetyMode.${option}`)}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-end">
        <StrategyInput label={t("exposureRadar.strategy.operatorNotes")} value={form.operatorNotes} onChange={(value) => setField("operatorNotes", value)} placeholder={t("exposureRadar.strategy.operatorNotesPlaceholder")} />
        <Button type="button" disabled={saving} onClick={() => onSave(form)} className="shrink-0">
          {saving ? <RefreshCw className="size-4 animate-spin" /> : <Target className="size-4" />}
          {t("exposureRadar.strategy.save")}
        </Button>
      </div>
    </Card>
  );
}

export function GrowthReviewPanel({ review, safety, recentRecords, timeZone }: { review: ExposureRadarWeeklyReviewData | null; safety: ExposureRadarSafetyCenterData | null; recentRecords: ExposureRadarManualRecordApi[]; timeZone: string }) {
  const { t } = useT();
  const latestResult = recentRecords.find((record) => record.result_checked_at || record.result_score);
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Card className="bg-[#0f1419]">
        <CardHeader title={t("exposureRadar.weeklyReview.title")} description={t("exposureRadar.weeklyReview.description")} />
        <div className="grid gap-3 sm:grid-cols-4">
          <ActionPlanMetric label={t("exposureRadar.weeklyReview.metric.handled")} value={review?.handled_count || 0} />
          <ActionPlanMetric label={t("exposureRadar.weeklyReview.metric.published")} value={review?.published_count || 0} />
          <ActionPlanMetric label={t("exposureRadar.weeklyReview.metric.effective")} value={review ? `${Math.round((review.effective_rate || 0) * 100)}%` : "0%"} />
          <ActionPlanMetric label={t("exposureRadar.weeklyReview.metric.resultScore")} value={review ? Math.round(review.average_result_score || 0) : 0} />
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <ReviewList title={t("exposureRadar.weeklyReview.topTopics")} items={(review?.top_topics || []).map((topic) => `${topic.topic_name} · ${topic.count}/${topic.effective}`)} empty={t("exposureRadar.weeklyReview.empty")} />
          <ReviewList title={t("exposureRadar.weeklyReview.recommendations")} items={review?.recommendations || []} empty={t("exposureRadar.weeklyReview.empty")} />
        </div>
      </Card>
      <Card className="bg-[#0f1419]">
        <CardHeader title={t("exposureRadar.safetyCenter.title")} description={t("exposureRadar.safetyCenter.description")} />
        <div className="grid grid-cols-3 gap-2">
          <ActionPlanMetric label={t("exposureRadar.safetyCenter.pass")} value={safety?.pass_count || 0} />
          <ActionPlanMetric label={t("exposureRadar.safetyCenter.watch")} value={safety?.watch_count || 0} />
          <ActionPlanMetric label={t("exposureRadar.safetyCenter.block")} value={safety?.block_count || 0} />
        </div>
        <ReviewList title={t("exposureRadar.safetyCenter.warnings")} items={safety?.warnings || []} empty={t("exposureRadar.safetyCenter.empty")} />
        {latestResult ? (
          <p className="mt-3 text-xs leading-5 text-[#71767b]">
            {t("exposureRadar.weeklyReview.latestResult", { time: latestResult.result_checked_at ? formatDateTime(latestResult.result_checked_at, timeZone) : "-", score: latestResult.result_score || 0 })}
          </p>
        ) : null}
      </Card>
    </div>
  );
}

export function PeopleRadarPanel({
  people,
  savingKey,
  onSaveNote,
  onFocus,
}: {
  people: PeopleRadarEntry[];
  savingKey: string;
  onSaveNote: (person: PeopleRadarEntry, stage: string, notes: string, tags: string) => void;
  onFocus: (itemID: string) => void;
}) {
  const { t } = useT();
  const priorityCount = people.filter((person) => person.stage === "priority").length;
  const repeatCount = people.filter((person) => person.stage === "repeat").length;
  const engagedCount = people.filter((person) => person.stage === "engaged").length;
  const avoidCount = people.filter((person) => person.stage === "avoid" || person.crmStage === "avoid").length;
  const playbook = buildPeopleRadarPlaybook(people, t);
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <CardHeader title={t("exposureRadar.peopleRadar.title")} description={t("exposureRadar.peopleRadar.description")} className="mb-0" />
        <div className="grid grid-cols-4 gap-2 sm:flex sm:flex-wrap">
          <ActionPlanMetric label={t("exposureRadar.peopleRadar.metric.people")} value={people.length} />
          <ActionPlanMetric label={t("exposureRadar.peopleRadar.metric.priority")} value={priorityCount} />
          <ActionPlanMetric label={t("exposureRadar.peopleRadar.metric.engaged")} value={engagedCount} />
          <ActionPlanMetric label={t("exposureRadar.peopleRadar.metric.avoid")} value={avoidCount} />
        </div>
      </div>
      <div className={`mt-4 rounded-2xl border p-4 ${peopleRadarPlaybookTone(playbook.tone)}`}>
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Target className="size-4" />
          {playbook.title}
        </p>
        <p className="mt-2 text-xs leading-5 opacity-85">{playbook.detail}</p>
      </div>
      {people.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-[#2f3336] bg-black px-4 py-8 text-center text-sm text-[#71767b]">
          {t("exposureRadar.peopleRadar.empty")}
        </div>
      ) : (
        <div className="mt-4 grid gap-3 xl:grid-cols-3">
          {people.slice(0, 6).map((person) => (
            <PeopleRadarCard key={`${person.key}-${person.crmStage || person.stage}-${person.notes || ""}-${(person.tags || []).join("|")}`} person={person} saving={savingKey === person.key} onSaveNote={onSaveNote} onFocus={onFocus} />
          ))}
        </div>
      )}
      {repeatCount > 0 ? (
        <p className="mt-3 text-xs leading-5 text-[#71767b]">{t("exposureRadar.peopleRadar.repeatHint", { count: repeatCount })}</p>
      ) : null}
    </Card>
  );
}

export function PeopleRadarCard({ person, saving, onSaveNote, onFocus }: { person: PeopleRadarEntry; saving: boolean; onSaveNote: (person: PeopleRadarEntry, stage: string, notes: string, tags: string) => void; onFocus: (itemID: string) => void }) {
  const { t } = useT();
  const [stage, setStage] = useState(person.crmStage || person.stage || "new");
  const [notes, setNotes] = useState(person.notes || "");
  const [tags, setTags] = useState((person.tags || []).join(", "));
  const nextTouch = buildPeopleRadarNextTouch(person, t);
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#e7e9ea]">{person.name}</p>
                  {person.handle ? <p className="mt-0.5 text-xs text-[#71767b]">@{person.handle}</p> : null}
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold ${peopleRadarStageTone(person.stage)}`}>
                  <Users className="size-3.5" />
                  {t(`exposureRadar.peopleRadar.stage.${person.stage}`)}
                </span>
                {person.persisted ? (
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#7856ff]/25 bg-[#7856ff]/10 px-2 py-1 text-[11px] font-semibold text-[#c4b5fd]">
                    <Database className="size-3.5" />
                    {t("exposureRadar.peopleRadar.history")}
                  </span>
                ) : null}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <MiniStat icon={<Zap className="size-3.5" />} label={t("exposureRadar.peopleRadar.count")} value={String(person.count)} />
                <MiniStat icon={<Flame className="size-3.5" />} label={t("exposureRadar.peopleRadar.score")} value={String(person.maxScore)} />
                <MiniStat icon={<Heart className="size-3.5" />} label={t("exposureRadar.peopleRadar.engagement")} value={formatCompact(person.totalEngagement)} />
              </div>
	              <div className="mt-3 rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
	                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#71767b]">{t("exposureRadar.peopleRadar.latest")}</p>
	                <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#c9d1d9]">{person.latestItem.title}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#71767b]">
                  <span>{person.drafted} {t("exposureRadar.peopleRadar.drafted")}</span>
                  <span>{person.saved} {t("exposureRadar.peopleRadar.saved")}</span>
                  <span>{person.handled} {t("exposureRadar.peopleRadar.handled")}</span>
                  {person.feedback ? <span>{person.feedback} {t("exposureRadar.peopleRadar.feedback")}</span> : null}
	                  {typeof person.followers === "number" && person.followers > 0 ? <span>{formatCompact(person.followers)} {t("exposureRadar.todayMoves.followers")}</span> : null}
	                </div>
	              </div>
              <div className="mt-3 rounded-xl border border-[#1d9bf0]/20 bg-[#07111a] p-3">
                <p className="text-[11px] font-semibold text-[#8ecdf8]">{t("exposureRadar.peopleRadar.nextTouch")}</p>
                <p className="mt-1 text-xs leading-5 text-[#c9d1d9]">{nextTouch}</p>
              </div>
	              <div className="mt-3 flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => onFocus(person.latestItem.id)}>
                  <Search className="size-3.5" />
                  {t("exposureRadar.peopleRadar.focus")}
                </Button>
                {person.handle ? (
                  <a href={`https://x.com/${person.handle}`} target="_blank" rel="noreferrer" className="inline-flex h-7 items-center gap-1 rounded-full border border-[#2f3336] px-2.5 text-[0.8rem] font-semibold text-white hover:bg-[#16181c]">
                    {t("exposureRadar.peopleRadar.openProfile")}
                    <ExternalLink className="size-3.5" />
                  </a>
                ) : null}
              </div>
              <div className="mt-3 rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label>
                    <span className="text-[11px] text-[#71767b]">{t("exposureRadar.peopleRadar.crmStage")}</span>
                    <select value={stage} onChange={(event) => setStage(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-[#2f3336] bg-black px-2 text-xs font-semibold text-[#e7e9ea] outline-none focus:border-[#1d9bf0]">
                      {["priority", "watch", "engaged", "avoid", "new"].map((option) => (
                        <option key={option} value={option}>{t(`exposureRadar.peopleRadar.crm.${option}`)}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="text-[11px] text-[#71767b]">{t("exposureRadar.peopleRadar.tags")}</span>
                    <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder={t("exposureRadar.peopleRadar.tagsPlaceholder")} className="mt-1 h-9 w-full rounded-lg border border-[#2f3336] bg-black px-2 text-xs text-[#e7e9ea] outline-none focus:border-[#1d9bf0]" />
                  </label>
                </div>
                <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={t("exposureRadar.peopleRadar.notesPlaceholder")} className="mt-2 h-9 w-full rounded-lg border border-[#2f3336] bg-black px-2 text-xs text-[#e7e9ea] outline-none focus:border-[#1d9bf0]" />
                <Button type="button" size="sm" variant="outline" disabled={saving || !person.handle} onClick={() => onSaveNote(person, stage, notes, tags)} className="mt-2">
                  {saving ? <RefreshCw className="size-3.5 animate-spin" /> : <Database className="size-3.5" />}
                  {t("exposureRadar.peopleRadar.saveNote")}
                </Button>
              </div>
    </div>
  );
}
