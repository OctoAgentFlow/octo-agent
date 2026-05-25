"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, RotateCcw } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/providers/toast-provider";
import { ScheduledDateTimePicker, isoToLocalDateTimeValue } from "@/components/posts/scheduled-date-time-picker";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/use-t";
import { postService } from "@/services/post.service";
import type { PostItem, PostStatus } from "@/types/post";

type LoadState = "loading" | "ready" | "error";

function localDatetimeToISO(local: string): string | null {
  if (!local.trim()) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function PostDetailClient({ postId }: { postId: number }) {
  const { t } = useT();
  const router = useRouter();
  const { pushToast } = useToast();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [post, setPost] = useState<PostItem | null>(null);
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<PostStatus>("draft");
  const [scheduledLocal, setScheduledLocal] = useState("");
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);

  const fetchPost = useCallback(async () => {
    setLoadState("loading");
    setErrorMessage(null);
    try {
      const p = await postService.get(postId);
      setPost(p);
      setContent(p.content);
      setStatus(p.status);
      setScheduledLocal(isoToLocalDateTimeValue(p.scheduled_at));
      setLoadState("ready");
    } catch (error) {
      const msg = axios.isAxiosError(error)
        ? error.response?.data?.message || t("posts.detail.loadFailed")
        : t("posts.detail.loadFailed");
      setErrorMessage(msg);
      setLoadState("error");
    }
  }, [postId, t]);

  useEffect(() => {
    void fetchPost();
  }, [fetchPost]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!post) return;
    const nextContent = content.trim();
    if (!nextContent) {
      pushToast(t("posts.create.contentRequired"));
      return;
    }
    setSaving(true);
    try {
      const body: Parameters<typeof postService.update>[1] = {
        content: nextContent,
        status,
      };
      if (status === "scheduled") {
        const iso = localDatetimeToISO(scheduledLocal);
        if (!iso) {
          pushToast(t("posts.create.scheduledRequired"));
          setSaving(false);
          return;
        }
        if (new Date(iso).getTime() <= Date.now()) {
          pushToast(t("posts.create.scheduledFutureRequired"));
          setSaving(false);
          return;
        }
        body.scheduled_at = iso;
      } else {
        body.scheduled_at = "";
      }
      const updated = await postService.update(post.id, body);
      setPost(updated);
      pushToast(t("posts.detail.saveSuccess"));
    } catch (error) {
      const msg = axios.isAxiosError(error)
        ? error.response?.data?.message || t("posts.detail.saveFailed")
        : t("posts.detail.saveFailed");
      pushToast(msg);
    } finally {
      setSaving(false);
    }
  };

  const execute = async () => {
    if (!post) return;
    if (post.status !== "draft" && post.status !== "scheduled" && post.status !== "failed") return;
    setExecuting(true);
    try {
      const result = await postService.execute(post.id);
      setPost(result.post);
      setStatus(result.post.status);
      setContent(result.post.content);
      setScheduledLocal(isoToLocalDateTimeValue(result.post.scheduled_at));
      pushToast(t("posts.detail.executeSuccess"));
    } catch (error) {
      const msg = axios.isAxiosError(error)
        ? error.response?.data?.message || t("posts.detail.executeFailed")
        : t("posts.detail.executeFailed");
      pushToast(msg);
    } finally {
      setExecuting(false);
    }
  };

  const remove = async () => {
    if (!post) return;
    if (!window.confirm(t("posts.detail.deleteConfirm"))) return;
    try {
      await postService.remove(post.id);
      pushToast(t("posts.detail.deleteSuccess"));
      router.replace("/posts");
    } catch (error) {
      const msg = axios.isAxiosError(error)
        ? error.response?.data?.message || t("posts.detail.deleteFailed")
        : t("posts.detail.deleteFailed");
      pushToast(msg);
    }
  };

  return (
    <div className="space-y-4 md:space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-title">{t("posts.detail.title")}</h2>
          <p className="text-subtitle mt-2">{t("posts.detail.subtitle")}</p>
        </div>
        <Link href="/posts" className={cn(buttonVariants({ variant: "outline" }))}>
          {t("posts.detail.back")}
        </Link>
      </div>

      {loadState === "loading" ? (
        <Card>
          <CardHeader title={t("posts.list.loading")} description="" />
        </Card>
      ) : null}

      {loadState === "error" ? (
        <Card>
          <CardHeader title={t("posts.list.error")} description={errorMessage || ""} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => void fetchPost()}>
              {t("posts.list.retry")}
            </Button>
          </div>
        </Card>
      ) : null}

      {loadState === "ready" && post ? (
        <Card className="bg-[#0f1419]">
          <p className="mb-4 text-xs text-white/50">
            #{post.id} · {t("posts.list.col.account")} {post.x_account_id}
          </p>
          {post.status === "processing" ? (
            <p className="mb-4 text-sm text-[#f6d96b]">{t("posts.detail.processingHint")}</p>
          ) : null}
          {post.last_error_message ? (
            <div className="mb-4 rounded-2xl border border-[#f4212e]/25 bg-[#f4212e]/10 p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-[#ff8a91]" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#ffdadd]">{t("posts.detail.lastError")}</p>
                  <p className="mt-1 break-words text-xs leading-5 text-[#ffb6bb]">{post.last_error_message}</p>
                  {post.last_attempt_at ? (
                    <p className="mt-1 text-xs text-[#ff8a91]">
                      {t("posts.detail.lastAttemptAt")}: {new Date(post.last_attempt_at).toLocaleString()}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
          <form className="space-y-4" onSubmit={(e) => void save(e)}>
            <label className="block text-xs text-[#71767b]">
              {t("posts.create.content")}
              <textarea
                className="form-input mt-1 min-h-[220px] w-full resize-y text-[15px] leading-7"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
                maxLength={5000}
                disabled={post.status === "processing"}
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
                disabled={post.status === "processing"}
              >
                {(post.status === "processing"
                  ? (["processing"] as const)
                  : post.status === "published"
                    ? (["published"] as const)
                    : post.status === "failed"
                      ? (["failed", "draft", "scheduled"] as const)
                      : (["draft", "scheduled"] as const)
                ).map((s) => (
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
                    disabled={post.status === "processing"}
                  />
              </label>
            ) : null}
            {post.published_at ? (
              <p className="text-xs text-[#71767b]">
                {t("posts.detail.publishedAt")}: {new Date(post.published_at).toLocaleString()}
              </p>
            ) : null}
            {(post.status === "draft" || post.status === "scheduled" || post.status === "failed") ? (
              <p className="text-xs text-[#71767b]">{t("posts.detail.executeHint")}</p>
            ) : null}
            <div className="flex flex-wrap justify-between gap-3">
              <Button
                type="button"
                variant="destructive"
                disabled={post.status === "processing"}
                onClick={() => void remove()}
              >
                {t("posts.actions.delete")}
              </Button>
              <div className="flex flex-wrap gap-2">
                {(post.status === "draft" || post.status === "scheduled" || post.status === "failed") ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={executing || saving}
                    onClick={() => void execute()}
                  >
                    {post.status === "failed" && !executing ? <RotateCcw className="size-4" /> : null}
                    {executing
                      ? t("posts.detail.executing")
                      : post.status === "failed"
                        ? t("posts.detail.retryPublish")
                        : t("posts.detail.execute")}
                  </Button>
                ) : null}
                <Button type="submit" disabled={saving || executing || post.status === "processing"}>
                  {saving ? t("posts.create.saving") : t("posts.detail.save")}
                </Button>
              </div>
            </div>
          </form>
        </Card>
      ) : null}
    </div>
  );
}
