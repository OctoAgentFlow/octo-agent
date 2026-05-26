"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Bot, CalendarClock, FileText, Send, ShieldCheck, Sparkles, type LucideIcon } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/providers/toast-provider";
import { defaultScheduledPostTimezone, ScheduledDateTimePicker, zonedDateTimeValueToISO } from "@/components/posts/scheduled-date-time-picker";
import { broadcastDataSynced } from "@/lib/app-page-refresh";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/use-t";
import { accountService } from "@/services/account.service";
import { automationService } from "@/services/automation.service";
import { oafBotService } from "@/services/oaf-bot.service";
import { postService } from "@/services/post.service";
import type { OAFBot } from "@/types/oaf-bot";
import type { PostStatus } from "@/types/post";

function scheduledDatetimeToISO(local: string, timeZone: string): string | undefined {
  if (!local.trim()) return undefined;
  return zonedDateTimeValueToISO(local, timeZone);
}

type PostCreateClientProps = {
  source?: "auto_post";
};

function modeCopy(isAutoPostSource: boolean) {
  return {
    titleKey: isAutoPostSource ? "posts.create.mode.autoPost.title" : "posts.create.mode.manual.title",
    descriptionKey: isAutoPostSource ? "posts.create.mode.autoPost.description" : "posts.create.mode.manual.description",
    icon: isAutoPostSource ? CalendarClock : FileText,
  };
}

export function PostCreateClient({ source }: PostCreateClientProps) {
  const { t } = useT();
  const router = useRouter();
  const { pushToast } = useToast();
  const isAutoPostSource = source === "auto_post";
  const [accounts, setAccounts] = useState<{ id: number; username: string; status: string }[]>([]);
  const [bots, setBots] = useState<OAFBot[]>([]);
  const [loadAccounts, setLoadAccounts] = useState<"loading" | "ready" | "error">("loading");
  const [submitting, setSubmitting] = useState(false);
  const [xAccountId, setXAccountId] = useState<number>(0);
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<PostStatus>("draft");
  const [scheduledLocal, setScheduledLocal] = useState("");
  const [scheduledTimeZone, setScheduledTimeZone] = useState(defaultScheduledPostTimezone());
  const [autoPostEnabled, setAutoPostEnabled] = useState(false);
  const [generating, setGenerating] = useState(false);
  const selectedBot = bots.find((bot) => bot.twitter_account_id === xAccountId) ?? null;
  const currentMode = modeCopy(isAutoPostSource);
  const ModeIcon = currentMode.icon;

  const load = useCallback(async () => {
    setLoadAccounts("loading");
    try {
      const [data, automationData] = await Promise.all([accountService.list(), automationService.list()]);
      const opts = data.items.map((a) => ({ id: a.id, username: a.username, status: a.status }));
      const connected = opts.filter((account) => account.status === "connected");
      setAccounts(connected);
      try {
        const botData = await oafBotService.list();
        setBots(botData.items);
      } catch {
        setBots([]);
      }
      setAutoPostEnabled(Boolean(automationData.modules.find((module) => module.type === "post")?.config.enabled));
      if (connected.length > 0) {
        setXAccountId(connected[0].id);
      }
      setLoadAccounts("ready");
    } catch (error) {
      setLoadAccounts("error");
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("accounts.toast.loadFailed") : t("accounts.toast.loadFailed"));
    }
  }, [pushToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!xAccountId) {
      pushToast(t("posts.create.needAccount"));
      return;
    }
    const nextContent = content.trim();
    if (!nextContent) {
      pushToast(t("posts.create.contentRequired"));
      return;
    }
    const body: Parameters<typeof postService.create>[0] = {
      x_account_id: xAccountId,
      content: nextContent,
      status,
    };
    if (status === "scheduled") {
      const iso = scheduledDatetimeToISO(scheduledLocal, scheduledTimeZone);
      if (!iso) {
        pushToast(t("posts.create.scheduledRequired"));
        return;
      }
      if (new Date(iso).getTime() <= Date.now()) {
        pushToast(t("posts.create.scheduledFutureRequired"));
        return;
      }
      body.scheduled_at = iso;
    }
    setSubmitting(true);
    try {
      const created = await postService.create(body);
      pushToast(t("posts.create.success"));
      router.replace(`/posts/${created.id}`);
    } catch (error) {
      const msg = axios.isAxiosError(error)
        ? error.response?.data?.message || t("posts.create.failed")
        : t("posts.create.failed");
      pushToast(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const generateContent = async () => {
    if (!xAccountId) {
      pushToast(t("posts.create.needAccount"));
      return;
    }
    setGenerating(true);
    try {
      const data = await postService.generate({ x_account_id: xAccountId });
      setContent(data.content);
      const used = data.usage?.ai_generations_month ?? 0;
      const limit = data.limits?.ai_generations_monthly ?? 0;
      broadcastDataSynced(Date.now());
      pushToast(
        data.bot_id
          ? t("posts.create.generateSuccessWithBot", { used, limit })
          : t("posts.create.generateSuccessDefault", { used, limit })
      );
    } catch (error) {
      const body = axios.isAxiosError(error) ? error.response?.data as { message?: string; error_code?: string } | undefined : undefined;
      if (body?.error_code === "ai_generation_quota_exceeded") {
        pushToast(t("posts.create.aiQuotaExceeded"));
      } else {
        pushToast(body?.message || t("posts.create.generateFailed"));
      }
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-5 md:space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border border-[#2f3336] bg-black p-5 md:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(29,155,240,0.16),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(120,86,255,0.12),transparent_28%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#1d9bf0]/30 bg-[#1d9bf0]/10 px-3 py-1 text-xs font-medium text-[#8ecdf8]">
                <ModeIcon className="size-3.5" />
                {t(currentMode.titleKey)}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2f3336] bg-[#0f1419] px-3 py-1 text-xs font-medium text-[#b6bec5]">
                <Sparkles className="size-3.5 text-[#1d9bf0]" />
                {selectedBot ? t("posts.create.source.oafBot") : t("posts.create.source.default")}
              </span>
            </div>
            <h2 className="text-2xl font-bold tracking-[-0.02em] text-[#e7e9ea] md:text-3xl">
              {t(isAutoPostSource ? "posts.create.autoPostTitle" : "posts.create.title")}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#71767b] md:text-[15px]">
              {t(isAutoPostSource ? "posts.create.autoPostSubtitle" : "posts.create.subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/auto-post" className={cn(buttonVariants({ variant: "outline" }))}>
              <CalendarClock className="size-4" />
              {t("posts.actions.openAutoPost")}
            </Link>
            <Link href="/posts" className={cn(buttonVariants({ variant: "outline" }))}>
              {t("posts.detail.back")}
            </Link>
          </div>
        </div>
      </section>

      {isAutoPostSource ? (
        <div className="rounded-[24px] border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 p-4">
          <div className="flex items-start gap-3">
            <CalendarClock className="mt-0.5 size-5 shrink-0 text-[#1d9bf0]" />
            <div>
              <p className="text-sm font-semibold text-white">{t("posts.create.autoPostContextTitle")}</p>
              <p className="mt-1 text-sm leading-relaxed text-[#b6bec5]">{t("posts.create.autoPostContextDescription")}</p>
            </div>
          </div>
        </div>
      ) : null}

      {loadAccounts === "loading" ? (
        <Card>
          <CardHeader title={t("posts.list.loading")} description="" />
        </Card>
      ) : null}

      {loadAccounts === "ready" && accounts.length === 0 ? (
        <Card className="bg-[#0f1419]">
          <CardHeader title={t("posts.create.needAccount")} description={t("posts.create.needAccountDescription")} />
          <div className="flex justify-end">
            <Link href="/accounts" className={cn(buttonVariants())}>
              {t("posts.create.goAccounts")}
            </Link>
          </div>
        </Card>
      ) : null}

      {loadAccounts === "ready" && accounts.length > 0 ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <Card className="bg-[#0f1419]">
            <form className="space-y-4" onSubmit={(e) => void submit(e)}>
              <div className="grid gap-3 md:grid-cols-3">
                <CreateSignal
                  icon={currentMode.icon}
                  title={t(currentMode.titleKey)}
                  description={t(currentMode.descriptionKey)}
                />
                <CreateSignal
                  icon={selectedBot ? Bot : Sparkles}
                  title={selectedBot ? t("posts.create.signal.bot.title") : t("posts.create.signal.default.title")}
                  description={selectedBot ? t("posts.create.signal.bot.description") : t("posts.create.signal.default.description")}
                />
                <CreateSignal
                  icon={autoPostEnabled ? ShieldCheck : AlertCircle}
                  title={autoPostEnabled ? t("posts.create.signal.scheduler.onTitle") : t("posts.create.signal.scheduler.offTitle")}
                  description={autoPostEnabled ? t("posts.create.signal.scheduler.onDesc") : t("posts.create.signal.scheduler.offDesc")}
                  tone={autoPostEnabled ? "green" : "yellow"}
                />
              </div>

              <div className="rounded-2xl border border-[#2f3336] bg-black p-3">
                <div className="flex items-start gap-2">
                  <CalendarClock className="mt-0.5 size-4 shrink-0 text-[#1d9bf0]" />
                  <div className="space-y-1 text-xs text-[#71767b]">
                    <p className="font-medium text-white">{t("posts.create.preflightTitle")}</p>
                    <p>{t("posts.create.preflightAccount", { count: accounts.length })}</p>
                    <p>
                      {autoPostEnabled
                        ? t("posts.create.preflightAutomationOn")
                        : t("posts.create.preflightAutomationOff")}
                    </p>
                  </div>
                </div>
              </div>

              <label className="block text-xs text-[#71767b]">
                {t("posts.create.account")}
                <select
                  className="form-input mt-1 w-full max-w-md"
                  value={xAccountId || ""}
                  onChange={(e) => setXAccountId(Number(e.target.value))}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      @{a.username} #{a.id}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-xs text-[#71767b]">
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span>{t("posts.create.content")}</span>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-8"
                    disabled={generating}
                    onClick={() => void generateContent()}
                  >
                    <Sparkles className="size-3.5" />
                    {generating ? t("posts.create.generating") : t("posts.create.aiGenerate")}
                  </Button>
                </span>
                <textarea
                  className="form-input mt-2 min-h-[220px] w-full resize-y text-[15px] leading-7"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                  maxLength={5000}
                  placeholder={t(isAutoPostSource ? "posts.create.autoPostPlaceholder" : "posts.create.contentPlaceholder")}
                />
                <span className="mt-1 block text-right text-xs text-[#71767b]">
                  {t("posts.create.characterCount", { count: content.trim().length, max: 5000 })}
                </span>
              </label>

              <label className="block text-xs text-[#71767b]">
                {t("posts.create.status")}
                <select
                  className="form-input mt-1 w-full max-w-md"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as PostStatus)}
                >
                  {(["draft", "scheduled"] as const).map((s) => (
                    <option key={s} value={s}>
                      {t(`posts.status.${s}`)}
                    </option>
                  ))}
                </select>
              </label>

              {status === "scheduled" ? (
                <label className="block text-xs text-[#71767b]">
                  {t("posts.create.scheduledAt")}
                  <ScheduledDateTimePicker
                    className="mt-1"
                    value={scheduledLocal}
                    onChange={setScheduledLocal}
                    timeZone={scheduledTimeZone}
                    onTimeZoneChange={setScheduledTimeZone}
                  />
                  {!autoPostEnabled ? (
                    <span className="mt-2 flex items-center gap-1 text-xs text-[#f6d96b]">
                      <AlertCircle className="size-3.5" />
                      {t("posts.create.autoPostDisabledHint")}
                    </span>
                  ) : null}
                </label>
              ) : null}

              <div className="flex justify-end">
                <Button type="submit" disabled={submitting}>
                  <Send className="size-4" />
                  {submitting ? t("posts.create.saving") : t("posts.create.submit")}
                </Button>
              </div>
            </form>
          </Card>

          <aside className="space-y-4">
            <Card className="bg-[#0f1419]">
              <CardHeader
                title={t("posts.create.sourcePanel.title")}
                description={t("posts.create.sourcePanel.description")}
                right={<Sparkles className="h-5 w-5 text-[#1d9bf0]" />}
              />
              <div
                className={`rounded-2xl border p-3 ${
                  selectedBot ? "border-[#1d9bf0]/25 bg-[#1d9bf0]/10" : "border-[#2f3336] bg-black"
                }`}
              >
                {selectedBot ? (
                  <div className="space-y-2 text-xs text-[#b6bec5]">
                    <p className="font-medium text-white">{t("posts.create.botBound", { name: selectedBot.name })}</p>
                    <p>{t("posts.create.botVoice", { value: selectedBot.voice_tone || "—" })}</p>
                    <p>{t("posts.create.botGoal", { value: selectedBot.growth_goal || "—" })}</p>
                    <p className="text-[#1d9bf0]">{t("posts.create.botWillUsePersona")}</p>
                  </div>
                ) : (
                  <div className="space-y-3 text-xs text-[#71767b]">
                    <p>{t("posts.create.botUnbound")}</p>
                    <Link href="/oaf-bots" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                      {t("posts.create.goOAFBots")}
                    </Link>
                  </div>
                )}
              </div>
            </Card>

            <Card className="bg-[#0f1419]">
              <CardHeader
                title={t("posts.create.routing.title")}
                description={t("posts.create.routing.description")}
                right={<CalendarClock className="h-5 w-5 text-[#1d9bf0]" />}
              />
              <div className="space-y-3">
                <RoutingRow active={status === "draft"} title={t("posts.create.routing.draftTitle")} description={t("posts.create.routing.draftDesc")} />
                <RoutingRow active={status === "scheduled"} title={t("posts.create.routing.scheduledTitle")} description={t("posts.create.routing.scheduledDesc")} />
                <RoutingRow active={isAutoPostSource} title={t("posts.create.routing.autoPostTitle")} description={t("posts.create.routing.autoPostDesc")} />
              </div>
            </Card>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function CreateSignal({
  icon: Icon,
  title,
  description,
  tone = "blue",
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  tone?: "blue" | "green" | "yellow";
}) {
  const toneClass =
    tone === "green"
      ? "bg-[#00ba7c]/10 text-[#00ba7c]"
      : tone === "yellow"
        ? "bg-[#ffd400]/10 text-[#ffd400]"
        : "bg-[#1d9bf0]/10 text-[#1d9bf0]";
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-3">
      <span className={cn("mb-3 flex size-9 items-center justify-center rounded-full", toneClass)}>
        <Icon className="size-4" />
      </span>
      <p className="text-sm font-semibold text-[#e7e9ea]">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-[#71767b]">{description}</p>
    </div>
  );
}

function RoutingRow({ active, title, description }: { active: boolean; title: string; description: string }) {
  return (
    <div className={cn("rounded-2xl border p-3", active ? "border-[#1d9bf0]/35 bg-[#1d9bf0]/10" : "border-[#2f3336] bg-black")}>
      <p className="text-sm font-medium text-[#e7e9ea]">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-[#71767b]">{description}</p>
    </div>
  );
}
