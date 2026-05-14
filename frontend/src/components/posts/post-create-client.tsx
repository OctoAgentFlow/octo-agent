"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarClock, Sparkles } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/providers/toast-provider";
import { broadcastDataSynced } from "@/lib/app-page-refresh";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/use-t";
import { accountService } from "@/services/account.service";
import { automationService } from "@/services/automation.service";
import { oafBotService } from "@/services/oaf-bot.service";
import { postService } from "@/services/post.service";
import type { OAFBot } from "@/types/oaf-bot";
import type { PostStatus } from "@/types/post";

function localDatetimeToISO(local: string): string | undefined {
  if (!local.trim()) return undefined;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export function PostCreateClient() {
  const { t } = useT();
  const router = useRouter();
  const { pushToast } = useToast();
  const [accounts, setAccounts] = useState<{ id: number; username: string; status: string }[]>([]);
  const [bots, setBots] = useState<OAFBot[]>([]);
  const [loadAccounts, setLoadAccounts] = useState<"loading" | "ready" | "error">("loading");
  const [submitting, setSubmitting] = useState(false);
  const [xAccountId, setXAccountId] = useState<number>(0);
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<PostStatus>("draft");
  const [scheduledLocal, setScheduledLocal] = useState("");
  const [autoPostEnabled, setAutoPostEnabled] = useState(false);
  const [generating, setGenerating] = useState(false);
  const selectedBot = bots.find((bot) => bot.twitter_account_id === xAccountId) ?? null;

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
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || "Failed to load accounts." : "Failed to load accounts.");
    }
  }, [pushToast]);

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
      const iso = localDatetimeToISO(scheduledLocal);
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
        ? error.response?.data?.message || "Failed to create post."
        : "Failed to create post.";
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
    <div className="space-y-4 md:space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-title">{t("posts.create.title")}</h2>
          <p className="text-subtitle mt-2">{t("posts.create.subtitle")}</p>
        </div>
        <Link href="/posts" className={cn(buttonVariants({ variant: "outline" }))}>
          {t("posts.detail.back")}
        </Link>
      </div>

      {loadAccounts === "loading" ? (
        <Card>
          <CardHeader title={t("posts.list.loading")} description="" />
        </Card>
      ) : null}

      {loadAccounts === "ready" && accounts.length === 0 ? (
        <Card>
          <CardHeader title={t("posts.create.needAccount")} description={t("posts.create.needAccountDescription")} />
          <div className="flex justify-end">
            <Link href="/accounts" className={cn(buttonVariants())}>
              {t("posts.create.goAccounts")}
            </Link>
          </div>
        </Card>
      ) : null}

      {loadAccounts === "ready" && accounts.length > 0 ? (
        <Card>
          <form className="space-y-4" onSubmit={(e) => void submit(e)}>
            <div className="rounded-md border border-white/8 bg-white/[0.03] p-3">
              <div className="flex items-start gap-2">
                <CalendarClock className="mt-0.5 size-4 shrink-0 text-cyan-200" />
                <div className="space-y-1 text-xs text-white/58">
                  <p className="font-medium text-white/80">{t("posts.create.preflightTitle")}</p>
                  <p>{t("posts.create.preflightAccount", { count: accounts.length })}</p>
                  <p>
                    {autoPostEnabled
                      ? t("posts.create.preflightAutomationOn")
                      : t("posts.create.preflightAutomationOff")}
                  </p>
                </div>
              </div>
            </div>
            <label className="block text-xs text-white/70">
              {t("posts.create.account")}
              <select
                className="form-input mt-1 w-full max-w-md"
                value={xAccountId || ""}
                onChange={(e) => setXAccountId(Number(e.target.value))}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    @{a.username} (id {a.id})
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs text-white/70">
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
              <div
                className={`mt-2 rounded-xl border p-3 ${
                  selectedBot ? "border-violet-300/25 bg-violet-500/10" : "border-white/10 bg-white/[0.04]"
                }`}
              >
                {selectedBot ? (
                  <div className="space-y-1 text-xs text-white/65">
                    <p className="font-medium text-white">{t("posts.create.botBound", { name: selectedBot.name })}</p>
                    <p>{t("posts.create.botVoice", { value: selectedBot.voice_tone || "—" })}</p>
                    <p>{t("posts.create.botGoal", { value: selectedBot.growth_goal || "—" })}</p>
                    <p className="text-violet-100/85">{t("posts.create.botWillUsePersona")}</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-white/65">
                    <p>{t("posts.create.botUnbound")}</p>
                    <Link href="/oaf-bots" className="text-blue-200 hover:text-blue-100">
                      {t("posts.create.goOAFBots")}
                    </Link>
                  </div>
                )}
              </div>
              <textarea
                className="form-input mt-1 min-h-[140px] w-full"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
                maxLength={5000}
              />
              <span className="mt-1 block text-right text-xs text-white/40">
                {t("posts.create.characterCount", { count: content.trim().length, max: 5000 })}
              </span>
            </label>
            <label className="block text-xs text-white/70">
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
              <label className="block text-xs text-white/70">
                {t("posts.create.scheduledAt")}
                <Input
                  type="datetime-local"
                  className="mt-1 max-w-md"
                  value={scheduledLocal}
                  onChange={(e) => setScheduledLocal(e.target.value)}
                  required
                />
                {!autoPostEnabled ? (
                  <span className="mt-2 flex items-center gap-1 text-xs text-amber-200/85">
                    <AlertCircle className="size-3.5" />
                    {t("posts.create.autoPostDisabledHint")}
                  </span>
                ) : null}
              </label>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" disabled={submitting}>
                {submitting ? t("posts.create.saving") : t("posts.create.submit")}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
