"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { ArrowRight, Bot, CheckCircle2, Loader2, Sparkles, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { accountService, type AccountListItem } from "@/services/account.service";
import { autoPostService, type AutoPostDraftApi, type AutoPostExecutionMode, type AutoPostPlanApi } from "@/services/auto-post.service";
import { billingService, type BillingSubscriptionApi } from "@/services/billing.service";
import { oafBotService } from "@/services/oaf-bot.service";
import type { OAFBot } from "@/types/oaf-bot";

type LoadState = "loading" | "ready" | "error";

type PlannerForm = {
  enabled: boolean;
  executionMode: AutoPostExecutionMode;
  dailyLimit: number;
  minIntervalMinutes: number;
  postingWindows: string;
  timezone: string;
};

const timezones = ["UTC", "Asia/Shanghai", "America/New_York", "Europe/London"];
const executionModes: AutoPostExecutionMode[] = ["manual", "review", "autopilot"];

function defaultForm(limit?: number): PlannerForm {
  return {
    enabled: false,
    executionMode: "review",
    dailyLimit: limit && limit > 0 ? limit : 3,
    minIntervalMinutes: 120,
    postingWindows: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  };
}

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function statusTone(status: string) {
  if (status === "ready_to_publish") return "border-emerald-300/25 bg-emerald-500/10 text-emerald-100";
  if (status === "pending_review" || status === "draft") return "border-amber-300/25 bg-amber-500/10 text-amber-100";
  if (status === "approved" || status === "published") return "border-blue-300/25 bg-blue-500/10 text-blue-100";
  if (status === "rejected" || status === "failed") return "border-rose-300/25 bg-rose-500/10 text-rose-100";
  return "border-white/10 bg-white/[0.05] text-white/65";
}

export default function AutoPostPage() {
  const { t } = useT();
  const { pushToast } = useToast();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [bots, setBots] = useState<OAFBot[]>([]);
  const [plans, setPlans] = useState<AutoPostPlanApi[]>([]);
  const [drafts, setDrafts] = useState<AutoPostDraftApi[]>([]);
  const [subscription, setSubscription] = useState<BillingSubscriptionApi | null>(null);
  const [selectedAccountID, setSelectedAccountID] = useState(0);
  const [form, setForm] = useState<PlannerForm>(() => defaultForm());
  const [contentDirection, setContentDirection] = useState("");
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoadState("loading");
    try {
      const [accountData, botData, planData, draftData, subscriptionData] = await Promise.all([
        accountService.list(),
        oafBotService.list(),
        autoPostService.plans(),
        autoPostService.drafts(),
        billingService.subscription(),
      ]);
      const connected = accountData.items.filter((account) => account.status !== "disconnected");
      setAccounts(connected);
      setBots(botData.items);
      setPlans(planData.items);
      setDrafts(draftData.items);
      setSubscription(subscriptionData);
      const firstAccountID = selectedAccountID || connected[0]?.id || 0;
      setSelectedAccountID(firstAccountID);
      const currentPlan = planData.items.find((item) => item.x_account_id === firstAccountID);
      setForm(currentPlan ? formFromPlan(currentPlan) : defaultForm(subscriptionData.limits.daily_auto_posts));
      setLoadState("ready");
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoPost.errors.load") : t("autoPost.errors.load"));
      setLoadState("error");
    }
  }, [pushToast, selectedAccountID, t]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedBot = useMemo(() => bots.find((bot) => bot.twitter_account_id === selectedAccountID) || null, [bots, selectedAccountID]);
  const selectedPlan = useMemo(() => plans.find((plan) => plan.x_account_id === selectedAccountID) || null, [plans, selectedAccountID]);
  const accountDrafts = useMemo(() => drafts.filter((draft) => draft.x_account_id === selectedAccountID).slice(0, 5), [drafts, selectedAccountID]);
  const aiLimit = subscription?.limits.ai_generations_monthly || 0;
  const aiUsed = subscription?.usage.ai_generations_month || 0;
  const aiRemaining = Math.max(aiLimit - aiUsed, 0);
  const aiPercent = aiLimit > 0 ? Math.min(100, Math.round((aiUsed / aiLimit) * 100)) : 0;

  const onAccountChange = (accountID: number) => {
    setSelectedAccountID(accountID);
    const plan = plans.find((item) => item.x_account_id === accountID);
    setForm(plan ? formFromPlan(plan) : defaultForm(subscription?.limits.daily_auto_posts));
  };

  const savePlan = async () => {
    if (!selectedAccountID) {
      pushToast(t("autoPost.errors.needAccount"));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        x_account_id: selectedAccountID,
        enabled: form.enabled,
        execution_mode: form.executionMode,
        daily_limit: Number(form.dailyLimit) || 1,
        min_interval_minutes: Number(form.minIntervalMinutes) || 1,
        posting_windows: form.postingWindows.trim(),
        timezone: form.timezone.trim() || "UTC",
      };
      const saved = selectedPlan ? await autoPostService.updatePlan(selectedPlan.id, payload) : await autoPostService.createPlan(payload);
      setPlans((current) => {
        const without = current.filter((item) => item.id !== saved.id && item.x_account_id !== saved.x_account_id);
        return [saved, ...without];
      });
      setForm(formFromPlan(saved));
      pushToast(t("autoPost.toast.saved"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoPost.errors.save") : t("autoPost.errors.save"));
    } finally {
      setSaving(false);
    }
  };

  const generateDraft = async () => {
    let plan = selectedPlan;
    if (!selectedAccountID) {
      pushToast(t("autoPost.errors.needAccount"));
      return;
    }
    setGenerating(true);
    try {
      if (!plan) {
        const saved = await autoPostService.createPlan({
          x_account_id: selectedAccountID,
          enabled: form.enabled,
          execution_mode: form.executionMode,
          daily_limit: Number(form.dailyLimit) || 1,
          min_interval_minutes: Number(form.minIntervalMinutes) || 1,
          posting_windows: form.postingWindows.trim(),
          timezone: form.timezone.trim() || "UTC",
        });
        plan = saved;
        setPlans((current) => [saved, ...current.filter((item) => item.x_account_id !== saved.x_account_id)]);
      }
      const draft = await autoPostService.generateDraft(plan.id, contentDirection.trim());
      setDrafts((current) => [draft, ...current.filter((item) => item.id !== draft.id)]);
      setContentDirection("");
      pushToast(t("autoPost.toast.generated"));
      void load();
    } catch (error) {
      const code = axios.isAxiosError(error) ? error.response?.data?.error_code : "";
      if (code === "ai_generation_quota_exceeded") {
        pushToast(t("autoPost.errors.aiQuotaExceeded"));
      } else if (code === "auto_post_daily_limit_exceeded") {
        pushToast(t("autoPost.errors.dailyLimitExceeded"));
      } else {
        pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoPost.errors.generate") : t("autoPost.errors.generate"));
      }
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm text-blue-100/75">{t("autoPost.kicker")}</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">{t("autoPost.title")}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">{t("autoPost.subtitle")}</p>
        </div>
        <Link href="/execution-queue?type=post" className="inline-flex">
          <Button variant="outline">
            {t("autoPost.actions.openQueue")}
            <ArrowRight className="size-4" />
          </Button>
        </Link>
      </div>

      {loadState === "loading" ? (
        <Card className="flex items-center gap-3 text-sm text-white/60">
          <Loader2 className="size-4 animate-spin" />
          {t("common.loading")}
        </Card>
      ) : null}

      {loadState === "ready" ? (
        <>
          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr_0.9fr]">
            <Card>
              <CardHeader title={t("autoPost.account.title")} description={t("autoPost.account.description")} />
              {accounts.length > 0 ? (
                <label className="block space-y-2">
                  <span className="text-xs font-medium text-white/60">{t("autoPost.account.label")}</span>
                  <select
                    value={selectedAccountID}
                    onChange={(event) => onAccountChange(Number(event.target.value))}
                    className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none"
                  >
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        @{account.username || account.display_name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="rounded-xl border border-amber-300/20 bg-amber-500/10 p-4 text-sm text-amber-100">
                  {t("autoPost.account.empty")}
                </div>
              )}
              <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.035] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-blue-300/20 bg-blue-500/10">
                    <Bot className="size-5 text-blue-100" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{selectedBot ? selectedBot.name : t("autoPost.bot.defaultTitle")}</p>
                    <p className="mt-1 text-sm leading-6 text-white/55">
                      {selectedBot ? t("autoPost.bot.boundHint", { tone: selectedBot.voice_tone || t("autoPost.bot.noTone") }) : t("autoPost.bot.unboundHint")}
                    </p>
                  </div>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title={t("autoPost.ai.title")} description={t("autoPost.ai.description")} />
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-2xl font-semibold text-white">{aiRemaining.toLocaleString()}</p>
                  <p className="mt-1 text-xs text-white/50">{t("autoPost.ai.remaining")}</p>
                </div>
                <div className="text-right text-xs text-white/55">
                  <p>{t("autoPost.ai.used", { used: aiUsed.toLocaleString(), limit: aiLimit.toLocaleString() })}</p>
                  <p>{t("autoPost.ai.percent", { percent: aiPercent })}</p>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-blue-400 to-violet-400" style={{ width: `${aiPercent}%` }} />
              </div>
            </Card>

            <Card>
              <CardHeader title={t("autoPost.status.title")} description={t("autoPost.status.description")} />
              <div className="space-y-3 text-sm">
                <StatusRow label={t("autoPost.status.plan")} value={selectedPlan ? t("autoPost.status.configured") : t("autoPost.status.notConfigured")} />
                <StatusRow label={t("autoPost.status.mode")} value={t(`autoPost.executionMode.${form.executionMode}`)} />
                <StatusRow label={t("autoPost.status.lastRun")} value={selectedPlan?.last_run_at ? formatDate(selectedPlan.last_run_at) : t("autoPost.common.emptyValue")} />
              </div>
            </Card>
          </div>

          <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
            <Card>
              <CardHeader title={t("autoPost.planner.title")} description={t("autoPost.planner.description")} />
              <div className="space-y-4">
                <label className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.035] p-4">
                  <span>
                    <span className="block text-sm font-medium text-white">{t("autoPost.fields.enabled")}</span>
                    <span className="mt-1 block text-xs leading-5 text-white/50">{t("autoPost.fields.enabledHelper")}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))}
                    className="size-5 accent-blue-500"
                  />
                </label>

                <div className="grid gap-3">
                  <p className="text-xs font-medium text-white/60">{t("autoPost.fields.executionMode")}</p>
                  <div className="grid gap-2 md:grid-cols-3">
                    {executionModes.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setForm((current) => ({ ...current, executionMode: mode }))}
                        className={`rounded-xl border p-3 text-left transition ${
                          form.executionMode === mode
                            ? "border-blue-300/35 bg-blue-500/15 text-white"
                            : "border-white/10 bg-white/[0.035] text-white/65 hover:border-blue-300/20"
                        }`}
                      >
                        <span className="block text-sm font-medium">{t(`autoPost.executionMode.${mode}`)}</span>
                        <span className="mt-1 block text-xs leading-5 text-white/50">{t(`autoPost.executionMode.${mode}Helper`)}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <TextInput
                    type="number"
                    label={t("autoPost.fields.dailyLimit")}
                    value={String(form.dailyLimit)}
                    onChange={(value) => setForm((current) => ({ ...current, dailyLimit: Number(value) }))}
                    helper={t("autoPost.fields.dailyLimitHelper")}
                  />
                  <TextInput
                    type="number"
                    label={t("autoPost.fields.minInterval")}
                    value={String(form.minIntervalMinutes)}
                    onChange={(value) => setForm((current) => ({ ...current, minIntervalMinutes: Number(value) }))}
                    helper={t("autoPost.fields.minIntervalHelper")}
                  />
                </div>

                <label className="block space-y-2">
                  <span className="text-xs font-medium text-white/60">{t("autoPost.fields.postingWindows")}</span>
                  <input
                    value={form.postingWindows}
                    onChange={(event) => setForm((current) => ({ ...current, postingWindows: event.target.value }))}
                    placeholder={t("autoPost.fields.postingWindowsPlaceholder")}
                    className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-white/30"
                  />
                  <span className="text-xs leading-5 text-white/45">{t("autoPost.fields.postingWindowsHelper")}</span>
                </label>

                <label className="block space-y-2">
                  <span className="text-xs font-medium text-white/60">{t("autoPost.fields.timezone")}</span>
                  <select
                    value={form.timezone}
                    onChange={(event) => setForm((current) => ({ ...current, timezone: event.target.value }))}
                    className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none"
                  >
                    {timezones.map((timezone) => (
                      <option key={timezone} value={timezone}>
                        {t(`autoPost.timezone.${timezone.replaceAll("/", "_")}`)}
                      </option>
                    ))}
                  </select>
                </label>

                <Button type="button" onClick={() => void savePlan()} disabled={saving || !selectedAccountID}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                  {t("autoPost.actions.savePlanner")}
                </Button>
              </div>
            </Card>

            <div className="space-y-5">
              <Card>
                <CardHeader title={t("autoPost.generate.title")} description={t("autoPost.generate.description")} />
                <label className="block space-y-2">
                  <span className="text-xs font-medium text-white/60">{t("autoPost.generate.directionLabel")}</span>
                  <textarea
                    value={contentDirection}
                    onChange={(event) => setContentDirection(event.target.value)}
                    rows={4}
                    placeholder={t("autoPost.generate.directionPlaceholder")}
                    className="w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm leading-6 text-white outline-none placeholder:text-white/30"
                  />
                </label>
                <div className="mt-4 rounded-xl border border-blue-300/20 bg-blue-500/10 p-3 text-sm leading-6 text-blue-50/80">
                  {selectedBot ? t("autoPost.generate.botHint", { bot: selectedBot.name }) : t("autoPost.generate.defaultHint")}
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-white/50">{t("autoPost.generate.quotaHint")}</p>
                  <Button type="button" onClick={() => void generateDraft()} disabled={generating || !selectedAccountID || aiRemaining <= 0}>
                    {generating ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
                    {t("autoPost.actions.generateNow")}
                  </Button>
                </div>
              </Card>

              <Card>
                <CardHeader
                  title={t("autoPost.drafts.title")}
                  description={t("autoPost.drafts.description")}
                  right={<Sparkles className="size-4 text-blue-100/70" />}
                />
                {accountDrafts.length === 0 ? (
                  <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-white/55">
                    {t("autoPost.drafts.empty")}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {accountDrafts.map((draft) => (
                      <div key={draft.id} className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-xs ${statusTone(draft.status)}`}>{t(`executionQueue.status.${draft.status}`)}</span>
                          <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs text-white/60">
                            {t(`autoPost.executionMode.${selectedPlan?.execution_mode || form.executionMode}`)}
                          </span>
                          <span className="text-xs text-white/40">{formatDate(draft.created_at)}</span>
                        </div>
                        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-white/85">{draft.generated_content}</p>
                        {draft.failure_reason ? <p className="mt-2 text-xs text-amber-100">{draft.failure_reason}</p> : null}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function formFromPlan(plan: AutoPostPlanApi): PlannerForm {
  return {
    enabled: plan.enabled,
    executionMode: plan.execution_mode,
    dailyLimit: plan.daily_limit,
    minIntervalMinutes: plan.min_interval_minutes,
    postingWindows: plan.posting_windows || "",
    timezone: plan.timezone || "UTC",
  };
}

function TextInput({
  label,
  value,
  onChange,
  helper,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helper: string;
  type?: "text" | "number";
}) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-medium text-white/60">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-xl border border-white/10 bg-black/20 px-3 text-sm text-white outline-none"
      />
      <span className="text-xs leading-5 text-white/45">{helper}</span>
    </label>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2">
      <span className="text-white/50">{label}</span>
      <span className="max-w-[60%] truncate text-right text-white/85">{value}</span>
    </div>
  );
}
