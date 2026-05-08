"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CalendarClock } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/providers/toast-provider";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/use-t";
import { accountService } from "@/services/account.service";
import { automationService } from "@/services/automation.service";
import { postService } from "@/services/post.service";
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
  const [loadAccounts, setLoadAccounts] = useState<"loading" | "ready" | "error">("loading");
  const [submitting, setSubmitting] = useState(false);
  const [xAccountId, setXAccountId] = useState<number>(0);
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<PostStatus>("draft");
  const [scheduledLocal, setScheduledLocal] = useState("");
  const [autoPostEnabled, setAutoPostEnabled] = useState(false);

  const load = useCallback(async () => {
    setLoadAccounts("loading");
    try {
      const [data, automationData] = await Promise.all([accountService.list(), automationService.list()]);
      const opts = data.items.map((a) => ({ id: a.id, username: a.username, status: a.status }));
      const connected = opts.filter((account) => account.status === "connected");
      setAccounts(connected);
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
              {t("posts.create.content")}
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
