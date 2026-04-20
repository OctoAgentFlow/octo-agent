"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/providers/toast-provider";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/use-t";
import { accountService } from "@/services/account.service";
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
  const [accounts, setAccounts] = useState<{ id: number; username: string }[]>([]);
  const [loadAccounts, setLoadAccounts] = useState<"loading" | "ready" | "error">("loading");
  const [submitting, setSubmitting] = useState(false);
  const [xAccountId, setXAccountId] = useState<number>(0);
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<PostStatus>("draft");
  const [scheduledLocal, setScheduledLocal] = useState("");

  const load = useCallback(async () => {
    setLoadAccounts("loading");
    try {
      const data = await accountService.list();
      const opts = data.items.map((a) => ({ id: a.id, username: a.username }));
      setAccounts(opts);
      if (opts.length > 0) {
        setXAccountId(opts[0].id);
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
    const body: Parameters<typeof postService.create>[0] = {
      x_account_id: xAccountId,
      content: content.trim(),
      status,
    };
    if (status === "scheduled") {
      const iso = localDatetimeToISO(scheduledLocal);
      if (!iso) {
        pushToast(t("posts.create.scheduledRequired"));
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
          <CardHeader title={t("posts.create.needAccount")} description="" />
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
            </label>
            <label className="block text-xs text-white/70">
              {t("posts.create.status")}
              <select
                className="form-input mt-1 w-full max-w-md"
                value={status}
                onChange={(e) => setStatus(e.target.value as PostStatus)}
              >
                {(["draft", "scheduled", "published", "failed"] as const).map((s) => (
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
