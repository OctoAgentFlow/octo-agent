"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ReactNode, TextareaHTMLAttributes } from "react";
import { ArrowRight, Bot, CheckCircle2, Copy, Loader2, Sparkles } from "lucide-react";

import { MarketingFooter } from "@/components/marketing/footer";
import { MarketingNavbar } from "@/components/marketing/navbar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { apiErrorMessage } from "@/lib/request";
import { cn } from "@/lib/utils";
import { publicService, type OAFBotLaunchPlanOutput, type OAFBotLaunchPlanRequest, type OAFBotLaunchPlanResponse } from "@/services/public.service";

type Stage = OAFBotLaunchPlanRequest["stage"];
type AccountType = OAFBotLaunchPlanRequest["account_type"];

const stages: Stage[] = ["start_from_zero", "existing_account", "multi_account"];
const accountTypes: AccountType[] = ["brand", "founder_operator", "kol_creator", "community", "agency"];

const initialForm: OAFBotLaunchPlanRequest = {
  stage: "start_from_zero",
  account_type: "founder_operator",
  x_handle: "",
  project_summary: "",
  target_audience: "",
  desired_followers: "",
  industry: "",
  source_material: "",
  voice_preference: "",
  guardrails: "",
  website_url: "",
  output_language: "zh-CN",
};

export default function LaunchPlanPage() {
  const { lang, t } = useT();
  const { pushToast } = useToast();
  const [form, setForm] = useState<OAFBotLaunchPlanRequest>({ ...initialForm, output_language: lang === "zh-CN" ? "zh-CN" : "en" });
  const [result, setResult] = useState<OAFBotLaunchPlanResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const completion = useMemo(() => {
    const fields = [form.project_summary, form.target_audience, form.desired_followers, form.industry, form.source_material, form.voice_preference, form.guardrails];
    return fields.filter((value) => value && value.trim().length > 0).length;
  }, [form]);

  const update = (key: keyof OAFBotLaunchPlanRequest, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const generate = async () => {
    if (!form.project_summary.trim()) {
      pushToast(t("launchPlan.toast.summaryRequired"));
      return;
    }
    setLoading(true);
    try {
      const payload: OAFBotLaunchPlanRequest = { ...form, output_language: lang === "zh-CN" ? "zh-CN" : "en" };
      const data = await publicService.generateOAFBotLaunchPlan(payload);
      setResult(data);
      pushToast(t("launchPlan.toast.generated"));
    } catch (error) {
      pushToast(apiErrorMessage(error) || t("launchPlan.toast.failed"));
    } finally {
      setLoading(false);
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      pushToast(t("launchPlan.toast.copied"));
    } catch {
      pushToast(t("launchPlan.toast.copyFailed"));
    }
  };

  return (
    <div className="surface-page min-h-screen">
      <MarketingNavbar />
      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <section className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start">
          <div className="space-y-6">
            <header className="space-y-4">
              <Badge variant="info" className="w-fit">
                {t("launchPlan.badge")}
              </Badge>
              <div className="space-y-3">
                <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-white md:text-5xl">{t("launchPlan.title")}</h1>
                <p className="max-w-2xl text-base leading-7 text-white/62 md:text-lg">{t("launchPlan.subtitle")}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-white/65">
                <Badge>{t("launchPlan.promise.noLogin")}</Badge>
                <Badge>{t("launchPlan.promise.noOAuth")}</Badge>
                <Badge>{t("launchPlan.promise.noPublish")}</Badge>
              </div>
            </header>

            <section className="surface-card p-5 md:p-6">
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-white">{t("launchPlan.form.title")}</h2>
                  <p className="mt-1 text-sm text-white/55">{t("launchPlan.form.description")}</p>
                </div>
                <Badge variant={completion >= 5 ? "success" : "default"}>{t("launchPlan.form.contextCount", { count: completion })}</Badge>
              </div>

              <div className="space-y-5">
                <FieldGroup label={t("launchPlan.form.stage")}>
                  <SegmentedControl
                    values={stages}
                    active={form.stage}
                    label={(value) => t(`launchPlan.stage.${value}`)}
                    onChange={(value) => update("stage", value)}
                  />
                </FieldGroup>

                <FieldGroup label={t("launchPlan.form.accountType")}>
                  <SegmentedControl
                    values={accountTypes}
                    active={form.account_type}
                    label={(value) => t(`launchPlan.accountType.${value}`)}
                    onChange={(value) => update("account_type", value)}
                  />
                </FieldGroup>

                <div className="grid gap-4 md:grid-cols-2">
                  <FieldGroup label={t("launchPlan.form.xHandle")} helper={t("launchPlan.form.xHandleHelper")}>
                    <Input value={form.x_handle || ""} onChange={(event) => update("x_handle", event.target.value)} placeholder={t("launchPlan.placeholder.xHandle")} />
                  </FieldGroup>
                  <FieldGroup label={t("launchPlan.form.website")} helper={t("launchPlan.form.websiteHelper")}>
                    <Input value={form.website_url || ""} onChange={(event) => update("website_url", event.target.value)} placeholder="https://..." />
                  </FieldGroup>
                </div>

                <FieldGroup label={t("launchPlan.form.projectSummary")} helper={t("launchPlan.form.projectSummaryHelper")} required>
                  <Textarea
                    value={form.project_summary}
                    onChange={(event) => update("project_summary", event.target.value)}
                    placeholder={t("launchPlan.placeholder.projectSummary")}
                    minRows="min-h-[116px]"
                  />
                </FieldGroup>

                <div className="grid gap-4 md:grid-cols-2">
                  <FieldGroup label={t("launchPlan.form.targetAudience")}>
                    <Textarea value={form.target_audience || ""} onChange={(event) => update("target_audience", event.target.value)} placeholder={t("launchPlan.placeholder.targetAudience")} />
                  </FieldGroup>
                  <FieldGroup label={t("launchPlan.form.desiredFollowers")}>
                    <Textarea value={form.desired_followers || ""} onChange={(event) => update("desired_followers", event.target.value)} placeholder={t("launchPlan.placeholder.desiredFollowers")} />
                  </FieldGroup>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FieldGroup label={t("launchPlan.form.industry")}>
                    <Input value={form.industry || ""} onChange={(event) => update("industry", event.target.value)} placeholder={t("launchPlan.placeholder.industry")} />
                  </FieldGroup>
                  <FieldGroup label={t("launchPlan.form.voice")}>
                    <Input value={form.voice_preference || ""} onChange={(event) => update("voice_preference", event.target.value)} placeholder={t("launchPlan.placeholder.voice")} />
                  </FieldGroup>
                </div>

                <FieldGroup label={t("launchPlan.form.source")} helper={t("launchPlan.form.sourceHelper")}>
                  <Textarea
                    value={form.source_material || ""}
                    onChange={(event) => update("source_material", event.target.value)}
                    placeholder={t("launchPlan.placeholder.source")}
                    minRows="min-h-[120px]"
                  />
                </FieldGroup>

                <FieldGroup label={t("launchPlan.form.guardrails")}>
                  <Textarea value={form.guardrails || ""} onChange={(event) => update("guardrails", event.target.value)} placeholder={t("launchPlan.placeholder.guardrails")} />
                </FieldGroup>

                <Button type="button" className="h-11 w-full" onClick={generate} disabled={loading}>
                  {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                  {loading ? t("launchPlan.action.generating") : t("launchPlan.action.generate")}
                </Button>
              </div>
            </section>
          </div>

          <section className="space-y-4 lg:sticky lg:top-24">
            {result ? (
              <LaunchPlanResult result={result} plan={result.plan} onCopy={copyText} />
            ) : (
              <EmptyPreview />
            )}
          </section>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}

function FieldGroup({ label, helper, required, children }: { label: string; helper?: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="flex items-center gap-1 text-sm font-medium text-white/82">
        {label}
        {required ? <span className="text-blue-300">*</span> : null}
      </span>
      {children}
      {helper ? <span className="block text-xs leading-5 text-white/45">{helper}</span> : null}
    </label>
  );
}

function SegmentedControl<T extends string>({ values, active, label, onChange }: { values: T[]; active: T; label: (value: T) => string; onChange: (value: T) => void }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {values.map((value) => (
        <button
          key={value}
          type="button"
          className={cn(
            "min-h-[46px] rounded-lg border px-3 py-2 text-left text-sm transition-colors",
            active === value ? "border-blue-400/80 bg-blue-500/15 text-white" : "border-white/10 bg-white/[0.025] text-white/65 hover:border-white/22 hover:text-white"
          )}
          onClick={() => onChange(value)}
        >
          {label(value)}
        </button>
      ))}
    </div>
  );
}

function Textarea({ className, minRows = "min-h-[92px]", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: string }) {
  return <textarea className={cn("form-input resize-y leading-6", minRows, className)} {...props} />;
}

function EmptyPreview() {
  const { t } = useT();
  return (
    <div className="surface-card p-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid size-11 place-items-center rounded-xl border border-blue-300/20 bg-blue-500/10 text-blue-200">
          <Bot className="size-5" />
        </span>
        <div>
          <h2 className="text-lg font-semibold text-white">{t("launchPlan.preview.title")}</h2>
          <p className="text-sm text-white/52">{t("launchPlan.preview.description")}</p>
        </div>
      </div>
      <div className="grid gap-3">
        {["positioning", "bot", "posts", "comments"].map((key) => (
          <div key={key} className="rounded-lg border border-white/10 bg-white/[0.025] p-4">
            <p className="text-sm font-medium text-white/78">{t(`launchPlan.preview.${key}.title`)}</p>
            <p className="mt-1 text-sm leading-6 text-white/45">{t(`launchPlan.preview.${key}.desc`)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function LaunchPlanResult({ result, plan, onCopy }: { result: OAFBotLaunchPlanResponse; plan: OAFBotLaunchPlanOutput; onCopy: (text: string) => void }) {
  const { t } = useT();
  return (
    <>
      <div className="surface-card p-5 md:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <Badge variant="success" className="mb-3">
              <CheckCircle2 className="mr-1 size-3" />
              {t("launchPlan.result.ready")}
            </Badge>
            <h2 className="text-2xl font-semibold text-white">{t("launchPlan.result.title")}</h2>
            <p className="mt-2 text-sm leading-6 text-white/55">{plan.account_positioning}</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Metric label={t("launchPlan.result.botType")} value={plan.recommended_bot_type} />
          <Metric label={t("launchPlan.result.occupation")} value={plan.recommended_occupation} />
        </div>
        <TagList title={t("launchPlan.result.industries")} items={plan.recommended_industries} />
        <TagList title={t("launchPlan.result.themes")} items={plan.content_themes} />
        <TagList title={t("launchPlan.result.guardrails")} items={plan.safety_guardrails} variant="warning" />
        <div className="mt-5 rounded-xl border border-blue-300/20 bg-blue-500/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-200/85">{t("launchPlan.result.bio")}</p>
          <p className="mt-2 text-sm leading-6 text-white/80">{plan.bio_suggestion}</p>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Link href={result.create_oaf_bot_url} className={cn(buttonVariants({ variant: "default" }), "h-11 flex-1")}>
            {plan.create_oaf_bot_cta || t("launchPlan.result.createBot")}
            <ArrowRight className="size-4" />
          </Link>
          <Button variant="outline" className="h-11" onClick={() => onCopy(plan.bio_suggestion)}>
            <Copy className="size-4" />
            {t("launchPlan.action.copyBio")}
          </Button>
        </div>
      </div>

      <ResultSection title={t("launchPlan.result.posts")} description={t("launchPlan.result.postsDesc")}>
        {plan.first_posts.map((draft, index) => (
          <DraftCard key={`${draft.label}-${index}`} draft={draft} onCopy={onCopy} />
        ))}
      </ResultSection>

      <ResultSection title={t("launchPlan.result.comments")} description={t("launchPlan.result.commentsDesc")}>
        {plan.comment_examples.map((draft, index) => (
          <DraftCard key={`${draft.label}-${index}`} draft={draft} onCopy={onCopy} />
        ))}
      </ResultSection>

      <div className="surface-card p-5">
        <h3 className="text-lg font-semibold text-white">{t("launchPlan.result.sevenDay")}</h3>
        <div className="mt-4 grid gap-3">
          {plan.seven_day_plan.map((day) => (
            <div key={`${day.day}-${day.theme}`} className="rounded-lg border border-white/10 bg-white/[0.025] p-4">
              <p className="text-sm font-semibold text-white">{t("launchPlan.result.day", { day: day.day })}: {day.theme}</p>
              <p className="mt-2 text-sm leading-6 text-white/58">{day.action}</p>
              {day.outcome ? <p className="mt-2 text-xs text-emerald-200/80">{day.outcome}</p> : null}
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-lg border border-white/10 bg-black/18 p-4 text-sm leading-6 text-white/62">{plan.operating_cadence}</div>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
      <p className="text-xs text-white/45">{label}</p>
      <p className="mt-1 text-sm font-semibold text-white">{value || "-"}</p>
    </div>
  );
}

function TagList({ title, items, variant = "info" }: { title: string; items: string[]; variant?: "info" | "warning" }) {
  if (!items?.length) return null;
  return (
    <div className="mt-5">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/45">{title}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <Badge key={item} variant={variant}>{item}</Badge>
        ))}
      </div>
    </div>
  );
}

function ResultSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="surface-card p-5">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="mt-1 text-sm text-white/50">{description}</p>
      <div className="mt-4 grid gap-3">{children}</div>
    </div>
  );
}

function DraftCard({ draft, onCopy }: { draft: { label: string; content: string; why: string }; onCopy: (text: string) => void }) {
  const { t } = useT();
  return (
    <article className="rounded-xl border border-white/10 bg-black/22 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">{draft.label}</p>
          {draft.why ? <p className="mt-1 text-xs leading-5 text-white/45">{draft.why}</p> : null}
        </div>
        <Button variant="outline" size="sm" onClick={() => onCopy(draft.content)}>
          <Copy className="size-3.5" />
          {t("launchPlan.action.copy")}
        </Button>
      </div>
      <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-white/82">{draft.content}</p>
    </article>
  );
}
