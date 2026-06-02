"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clipboard, Loader2, Pencil, RefreshCw, Sparkles, ThumbsDown, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { apiErrorMessage } from "@/lib/request";
import { dailyXQueueService, type DailyXQueueDraftApi, type DailyXQueueOverviewApi } from "@/services/daily-x-queue.service";

type LoadState = "loading" | "ready" | "error";
type BusyAction = "setup" | "source" | "generate" | `edit-${number}` | `approve-${number}` | `reject-${number}` | `rewrite-${number}` | `copy-${number}` | "";

const rejectReasons = ["irrelevant", "too_salesy", "wrong_tone", "fact_risk", "weak_context", "duplicate", "other"];
const defaultVoicePreferences = ["Concise founder/operator voice", "简洁的创始人 / 运营者语气"];

function statusTone(status: string) {
  if (status === "approved") return "border-emerald-300/25 bg-emerald-500/10 text-emerald-100";
  if (status === "rejected") return "border-rose-300/25 bg-rose-500/10 text-rose-100";
  if (status === "pending_review" || status === "draft") return "border-amber-300/25 bg-amber-500/10 text-amber-100";
  return "border-[#2f3336] bg-[#16181c] text-[#8b98a5]";
}

function riskTone(risk: string) {
  if (risk === "high") return "border-rose-300/25 bg-rose-500/10 text-rose-100";
  if (risk === "medium") return "border-amber-300/25 bg-amber-500/10 text-amber-100";
  return "border-emerald-300/25 bg-emerald-500/10 text-emerald-100";
}

function splitTopics(value: string) {
  return value
    .split(/[,，\n;]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function knownDailyXQueueErrorKey(message: string) {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return "";
  if (normalized.includes("setup is required")) return "dailyXQueue.toast.error.setupRequired";
  if (normalized.includes("source material is required")) return "dailyXQueue.toast.error.sourceRequired";
  if (normalized.includes("reject reason is required")) return "dailyXQueue.toast.error.rejectReasonRequired";
  if (normalized.includes("x_handle is required")) return "dailyXQueue.toast.error.handleRequired";
  if (normalized.includes("openai api key is empty")) return "dailyXQueue.toast.error.llmConfig";
  return "";
}

function directionKey(value?: string) {
  const text = (value || "").trim();
  if (text.startsWith("Product value:")) return "dailyXQueue.direction.productValue";
  if (text.startsWith("User pain point:")) return "dailyXQueue.direction.userPain";
  if (text.startsWith("Operational proof:")) return "dailyXQueue.direction.operationalProof";
  if (text.startsWith("Operator insight:")) return "dailyXQueue.direction.operatorInsight";
  if (text.startsWith("Workflow proof:")) return "dailyXQueue.direction.workflowProof";
  if (text.startsWith("Founder/operator note:")) return "dailyXQueue.direction.founderOperatorNote";
  return "";
}

export default function DailyXQueuePage() {
  const { t } = useT();
  const { pushToast } = useToast();
  const defaultVoicePreference = t("dailyXQueue.defaults.voicePreference");
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [overview, setOverview] = useState<DailyXQueueOverviewApi | null>(null);
  const [busy, setBusy] = useState<BusyAction>("");
  const [setupForm, setSetupForm] = useState({
    x_handle: "",
    website_url: "",
    product_context: "",
    target_audience: "",
    voice_preference: defaultVoicePreference,
    guardrails: "",
  });
  const [sourceForm, setSourceForm] = useState({
    title: "",
    body: "",
    source_url: "",
    topics: "",
    growth_goal: "",
    cta_preference: "",
  });
  const [draftEdits, setDraftEdits] = useState<Record<number, string>>({});
  const [rejectByDraft, setRejectByDraft] = useState<Record<number, string>>({});
  const [rewriteFeedback, setRewriteFeedback] = useState<Record<number, string>>({});

  const setupReady = Boolean(overview?.context?.bot_id);
  const sourceReady = Boolean(overview?.context?.content_library_id);
  const drafts = useMemo(() => overview?.drafts || [], [overview?.drafts]);
  const botName = overview?.bot?.name || "OAF Bot";
  const localizedError = useCallback((error: unknown, fallbackKey: string) => {
    const message = apiErrorMessage(error);
    const knownKey = message ? knownDailyXQueueErrorKey(message) : "";
    return knownKey ? t(knownKey) : t(fallbackKey);
  }, [t]);

  const directionLabel = useCallback((value?: string) => {
    const key = directionKey(value);
    return key ? t(key) : value || t("dailyXQueue.fallback.direction");
  }, [t]);

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const data = await dailyXQueueService.overview();
      setOverview(data);
      if (data.context) {
        setSetupForm({
          x_handle: data.context.x_handle || "",
          website_url: data.context.website_url || "",
          product_context: data.context.product_context || "",
          target_audience: data.context.target_audience || "",
          voice_preference: data.context.voice_preference || defaultVoicePreference,
          guardrails: data.context.guardrails || "",
        });
      }
      if (data.source_material) {
        setSourceForm({
          title: data.source_material.title || "",
          body: data.source_material.body || "",
          source_url: data.source_material.source_url || "",
          topics: (data.source_material.topics || []).join(", "),
          growth_goal: data.source_material.growth_goal || "",
          cta_preference: data.source_material.cta_preference || "",
        });
      }
      setLoadState("ready");
    } catch (error) {
      pushToast(localizedError(error, "dailyXQueue.toast.error.load"));
      setLoadState("error");
    }
  }, [defaultVoicePreference, localizedError, pushToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSetupForm((current) => {
      if (current.voice_preference && !defaultVoicePreferences.includes(current.voice_preference)) return current;
      return { ...current, voice_preference: defaultVoicePreference };
    });
  }, [defaultVoicePreference]);

  useEffect(() => {
    const next: Record<number, string> = {};
    drafts.forEach((draft) => {
      next[draft.id] = draft.generated_content;
    });
    setDraftEdits((current) => ({ ...next, ...current }));
  }, [drafts]);

  const upsertDraft = useCallback((draft: DailyXQueueDraftApi, actionData?: { review_actions_count: number; approved_or_copied_count: number; activated: boolean }) => {
    setOverview((current) => {
      if (!current) return current;
      return {
        ...current,
        drafts: current.drafts.map((item) => (item.id === draft.id ? draft : item)),
        review_actions_count: actionData?.review_actions_count ?? current.review_actions_count,
        approved_or_copied_count: actionData?.approved_or_copied_count ?? current.approved_or_copied_count,
        activated: actionData?.activated ?? current.activated,
      };
    });
    setDraftEdits((current) => ({ ...current, [draft.id]: draft.generated_content }));
  }, []);

  const handleSetup = async () => {
    setBusy("setup");
    try {
      const data = await dailyXQueueService.setup(setupForm);
      setOverview((current) => ({ ...(current || emptyOverview()), context: data.context, bot: data.bot }));
      pushToast(t("dailyXQueue.toast.setupSaved"));
    } catch (error) {
      pushToast(localizedError(error, "dailyXQueue.toast.error.setup"));
    } finally {
      setBusy("");
    }
  };

  const handleSource = async () => {
    setBusy("source");
    try {
      const data = await dailyXQueueService.saveSourceMaterial({
        title: sourceForm.title,
        body: sourceForm.body,
        source_url: sourceForm.source_url,
        topics: splitTopics(sourceForm.topics),
        growth_goal: sourceForm.growth_goal,
        cta_preference: sourceForm.cta_preference,
      });
      setOverview((current) => ({ ...(current || emptyOverview()), context: data.context, source_material: data.source_material }));
      pushToast(t("dailyXQueue.toast.sourceSaved"));
    } catch (error) {
      pushToast(localizedError(error, "dailyXQueue.toast.error.source"));
    } finally {
      setBusy("");
    }
  };

  const handleGenerate = async () => {
    setBusy("generate");
    try {
      const data = await dailyXQueueService.generate();
      setOverview((current) => ({
        ...(current || emptyOverview()),
        context: data.context,
        drafts: data.drafts,
        learning_applied_count: data.learning_applied_count,
        learning_summary: data.learning_summary,
      }));
      pushToast(t("dailyXQueue.toast.generated"));
    } catch (error) {
      pushToast(localizedError(error, "dailyXQueue.toast.error.generate"));
    } finally {
      setBusy("");
    }
  };

  const handleEdit = async (draft: DailyXQueueDraftApi) => {
    setBusy(`edit-${draft.id}`);
    try {
      const data = await dailyXQueueService.updateDraft(draft.id, draftEdits[draft.id] || draft.generated_content);
      upsertDraft(data.draft, data);
      pushToast(t("dailyXQueue.toast.editCaptured"));
    } catch (error) {
      pushToast(localizedError(error, "dailyXQueue.toast.error.edit"));
    } finally {
      setBusy("");
    }
  };

  const handleApprove = async (draft: DailyXQueueDraftApi) => {
    setBusy(`approve-${draft.id}`);
    try {
      const data = await dailyXQueueService.approveDraft(draft.id);
      upsertDraft(data.draft, data);
      pushToast(t("dailyXQueue.toast.approved"));
    } catch (error) {
      pushToast(localizedError(error, "dailyXQueue.toast.error.approve"));
    } finally {
      setBusy("");
    }
  };

  const handleReject = async (draft: DailyXQueueDraftApi) => {
    const reason = rejectByDraft[draft.id] || "weak_context";
    setBusy(`reject-${draft.id}`);
    try {
      const data = await dailyXQueueService.rejectDraft(draft.id, reason);
      upsertDraft(data.draft, data);
      pushToast(t("dailyXQueue.toast.feedbackCaptured"));
    } catch (error) {
      pushToast(localizedError(error, "dailyXQueue.toast.error.reject"));
    } finally {
      setBusy("");
    }
  };

  const handleRewrite = async (draft: DailyXQueueDraftApi) => {
    setBusy(`rewrite-${draft.id}`);
    try {
      const data = await dailyXQueueService.rewriteDraft(draft.id, "more_specific", rewriteFeedback[draft.id]);
      upsertDraft(data.draft, data);
      pushToast(t("dailyXQueue.toast.rewritten"));
    } catch (error) {
      pushToast(localizedError(error, "dailyXQueue.toast.error.rewrite"));
    } finally {
      setBusy("");
    }
  };

  const handleCopy = async (draft: DailyXQueueDraftApi) => {
    setBusy(`copy-${draft.id}`);
    try {
      await navigator.clipboard.writeText(draftEdits[draft.id] || draft.generated_content);
      const data = await dailyXQueueService.copyDraft(draft.id);
      upsertDraft(data.draft, data);
      pushToast(t("dailyXQueue.toast.copied"));
    } catch (error) {
      pushToast(localizedError(error, "dailyXQueue.toast.error.copy"));
    } finally {
      setBusy("");
    }
  };

  const progress = useMemo(() => {
    const steps = [setupReady, sourceReady, drafts.length === 3, (overview?.review_actions_count || 0) >= 3, (overview?.approved_or_copied_count || 0) >= 1];
    return steps.filter(Boolean).length;
  }, [drafts.length, overview?.approved_or_copied_count, overview?.review_actions_count, setupReady, sourceReady]);

  if (loadState === "loading") {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <Loader2 className="size-6 animate-spin text-[#1d9bf0]" />
        <span className="sr-only">{t("dailyXQueue.loading")}</span>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 md:p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#1d9bf0]">{t("dailyXQueue.eyebrow")}</p>
          <h1 className="mt-1 text-2xl font-bold text-[#e7e9ea] md:text-3xl">{t("dailyXQueue.title")}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#8b98a5]">
            {t("dailyXQueue.subtitle")}
          </p>
        </div>
        <div className="rounded-2xl border border-[#2f3336] bg-black px-4 py-3 text-sm text-[#8b98a5]">
          <span className="font-semibold text-[#e7e9ea]">{progress}/5</span> {t("dailyXQueue.activationSteps")}
          {overview?.activated ? <span className="ml-3 text-emerald-200">{t("dailyXQueue.activated")}</span> : null}
        </div>
      </header>

      {overview?.learning_summary ? (
        <Card className="border-emerald-300/20 bg-emerald-400/10">
          <div className="flex items-start gap-3 text-sm text-emerald-50">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            <p>{t("dailyXQueue.learning.applied", { count: overview.learning_applied_count || 0 })}</p>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="border-[#2f3336] bg-black">
          <CardHeader title={t("dailyXQueue.setup.title")} description={t("dailyXQueue.setup.description")} />
          <div className="grid gap-3">
            <Input placeholder={t("dailyXQueue.setup.handlePlaceholder")} value={setupForm.x_handle} onChange={(event) => setSetupForm((v) => ({ ...v, x_handle: event.target.value }))} />
            <Input placeholder={t("dailyXQueue.setup.websitePlaceholder")} value={setupForm.website_url} onChange={(event) => setSetupForm((v) => ({ ...v, website_url: event.target.value }))} />
            <textarea className="form-input min-h-28 resize-y" placeholder={t("dailyXQueue.setup.productPlaceholder")} value={setupForm.product_context} onChange={(event) => setSetupForm((v) => ({ ...v, product_context: event.target.value }))} />
            <Input placeholder={t("dailyXQueue.setup.audiencePlaceholder")} value={setupForm.target_audience} onChange={(event) => setSetupForm((v) => ({ ...v, target_audience: event.target.value }))} />
            <Input placeholder={t("dailyXQueue.setup.voicePlaceholder")} value={setupForm.voice_preference} onChange={(event) => setSetupForm((v) => ({ ...v, voice_preference: event.target.value }))} />
            <textarea className="form-input min-h-20 resize-y" placeholder={t("dailyXQueue.setup.guardrailsPlaceholder")} value={setupForm.guardrails} onChange={(event) => setSetupForm((v) => ({ ...v, guardrails: event.target.value }))} />
            <Button type="button" disabled={busy === "setup" || !setupForm.x_handle.trim() || !setupForm.product_context.trim()} onClick={handleSetup}>
              {busy === "setup" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {t("dailyXQueue.setup.save")}
            </Button>
          </div>
        </Card>

        <Card className="border-[#2f3336] bg-black">
          <CardHeader title={t("dailyXQueue.source.title")} description={t("dailyXQueue.source.description")} />
          <div className="grid gap-3">
            <Input placeholder={t("dailyXQueue.source.titlePlaceholder")} value={sourceForm.title} onChange={(event) => setSourceForm((v) => ({ ...v, title: event.target.value }))} />
            <textarea className="form-input min-h-32 resize-y" placeholder={t("dailyXQueue.source.bodyPlaceholder")} value={sourceForm.body} onChange={(event) => setSourceForm((v) => ({ ...v, body: event.target.value }))} />
            <Input placeholder={t("dailyXQueue.source.urlPlaceholder")} value={sourceForm.source_url} onChange={(event) => setSourceForm((v) => ({ ...v, source_url: event.target.value }))} />
            <Input placeholder={t("dailyXQueue.source.topicsPlaceholder")} value={sourceForm.topics} onChange={(event) => setSourceForm((v) => ({ ...v, topics: event.target.value }))} />
            <Input placeholder={t("dailyXQueue.source.goalPlaceholder")} value={sourceForm.growth_goal} onChange={(event) => setSourceForm((v) => ({ ...v, growth_goal: event.target.value }))} />
            <Input placeholder={t("dailyXQueue.source.ctaPlaceholder")} value={sourceForm.cta_preference} onChange={(event) => setSourceForm((v) => ({ ...v, cta_preference: event.target.value }))} />
            <Button type="button" disabled={busy === "source" || !setupReady || !sourceForm.title.trim() || !sourceForm.body.trim()} onClick={handleSource}>
              {busy === "source" ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />}
              {t("dailyXQueue.source.save")}
            </Button>
          </div>
        </Card>
      </div>

      <Card className="border-[#1d9bf0]/25 bg-[#06111d]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#e7e9ea]">{t("dailyXQueue.generate.title")}</h2>
            <p className="mt-1 text-sm text-[#8b98a5]">{t("dailyXQueue.generate.description")}</p>
          </div>
          <Button type="button" disabled={busy === "generate" || !setupReady || !sourceReady} onClick={handleGenerate}>
            {busy === "generate" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {t("dailyXQueue.generate.button")}
          </Button>
        </div>
      </Card>

      <section className="grid gap-4">
        {drafts.length === 0 ? (
          <Card className="border-[#2f3336] bg-black">
            <p className="text-sm text-[#8b98a5]">{t("dailyXQueue.empty")}</p>
          </Card>
        ) : null}
        {drafts.slice(0, 3).map((draft, index) => (
          <Card key={draft.id} className="border-[#2f3336] bg-black">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#e7e9ea]">{t("dailyXQueue.draft.title", { number: index + 1 })}</p>
                  <p className="mt-1 text-xs text-[#71767b]">{directionLabel(draft.why_generated || draft.content_direction)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(draft.status)}`}>{t(`dailyXQueue.status.${draft.status}`)}</span>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${riskTone(draft.risk_level)}`}>{t("dailyXQueue.risk.label", { level: t(`dailyXQueue.risk.${draft.risk_level || "low"}`) })}</span>
                </div>
              </div>
              <textarea
                className="form-input min-h-32 resize-y leading-relaxed"
                value={draftEdits[draft.id] ?? draft.generated_content}
                onChange={(event) => setDraftEdits((current) => ({ ...current, [draft.id]: event.target.value }))}
              />
              <div className="grid gap-2 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3 text-xs leading-5 text-[#8b98a5] md:grid-cols-2 xl:grid-cols-4">
                <p><span className="text-[#e7e9ea]">{t("dailyXQueue.draft.generatedByLabel")}</span> {botName}</p>
                <p><span className="text-[#e7e9ea]">{t("dailyXQueue.draft.sourceLabel")}</span> {draft.source_used || draft.content_title || t("dailyXQueue.fallback.source")}</p>
                <p><span className="text-[#e7e9ea]">{t("dailyXQueue.draft.whyLabel")}</span> {directionLabel(draft.why_generated)}</p>
                <p><span className="text-[#e7e9ea]">{t("dailyXQueue.draft.riskReasonsLabel")}</span> {draft.failure_reason || t("dailyXQueue.risk.none")}</p>
              </div>
              <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" disabled={busy === `edit-${draft.id}`} onClick={() => void handleEdit(draft)}>
                    {busy === `edit-${draft.id}` ? <Loader2 className="size-4 animate-spin" /> : <Pencil className="size-4" />}
                    {t("dailyXQueue.actions.edit")}
                  </Button>
                  <Button type="button" disabled={busy === `approve-${draft.id}`} onClick={() => void handleApprove(draft)}>
                    {busy === `approve-${draft.id}` ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                    {t("dailyXQueue.actions.approve")}
                  </Button>
                  <Button type="button" variant="outline" disabled={busy === `rewrite-${draft.id}`} onClick={() => void handleRewrite(draft)}>
                    {busy === `rewrite-${draft.id}` ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                    {t("dailyXQueue.actions.rewrite")}
                  </Button>
                  <Button type="button" variant="outline" disabled={busy === `copy-${draft.id}`} onClick={() => void handleCopy(draft)}>
                    {busy === `copy-${draft.id}` ? <Loader2 className="size-4 animate-spin" /> : <Clipboard className="size-4" />}
                    {t("dailyXQueue.actions.copy")}
                  </Button>
                </div>
                <div className="flex min-w-0 gap-2">
                  <select
                    className="form-input h-10 min-w-0 py-0 text-sm"
                    value={rejectByDraft[draft.id] || "weak_context"}
                    onChange={(event) => setRejectByDraft((current) => ({ ...current, [draft.id]: event.target.value }))}
                  >
                    {rejectReasons.map((reason) => <option key={reason} value={reason}>{t(`dailyXQueue.rejectReason.${reason}`)}</option>)}
                  </select>
                  <Button type="button" variant="destructive" disabled={busy === `reject-${draft.id}`} onClick={() => void handleReject(draft)}>
                    {busy === `reject-${draft.id}` ? <Loader2 className="size-4 animate-spin" /> : <ThumbsDown className="size-4" />}
                    {t("dailyXQueue.actions.reject")}
                  </Button>
                </div>
              </div>
              <Input
                placeholder={t("dailyXQueue.rewriteFeedbackPlaceholder")}
                value={rewriteFeedback[draft.id] || ""}
                onChange={(event) => setRewriteFeedback((current) => ({ ...current, [draft.id]: event.target.value }))}
              />
            </div>
          </Card>
        ))}
      </section>
    </div>
  );
}

function emptyOverview(): DailyXQueueOverviewApi {
  return {
    drafts: [],
    review_actions_count: 0,
    approved_or_copied_count: 0,
    activated: false,
    learning_applied_count: 0,
  };
}
