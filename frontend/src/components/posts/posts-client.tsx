"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";

import { UserOnboardingCard } from "@/components/onboarding/user-onboarding-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/use-t";
import { accountService } from "@/services/account.service";
import { postService } from "@/services/post.service";
import type { PostItem, PostStatus } from "@/types/post";

type LoadState = "loading" | "ready" | "error";

function statusLabel(t: (k: string) => string, s: string) {
  const key = `posts.status.${s}` as const;
  const v = t(key);
  return v === key ? s : v;
}

export function PostsClient() {
  const { t } = useT();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [items, setItems] = useState<PostItem[]>([]);
  const [accountCount, setAccountCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState<PostStatus | "all">("all");

  const fetchPosts = useCallback(async () => {
    setLoadState("loading");
    setErrorMessage(null);
    try {
      const [data, accountData] = await Promise.all([
        postService.list({ page: 1, page_size: 50 }),
        accountService.list(),
      ]);
      setItems(data.items);
      setAccountCount(accountData.items.filter((account) => account.status === "connected").length);
      setLoadState("ready");
    } catch (error) {
      const msg = axios.isAxiosError(error)
        ? error.response?.data?.message || "Failed to load posts."
        : "Failed to load posts.";
      setErrorMessage(msg);
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial list load
    void fetchPosts();
  }, [fetchPosts]);

  return (
    <div className="space-y-4 md:space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-title">{t("posts.page.title")}</h2>
          <p className="text-subtitle mt-2">{t("posts.page.subtitle")}</p>
        </div>
        <Link href="/posts/create" className={cn(buttonVariants())}>
          {t("posts.actions.new")}
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
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => void fetchPosts()}>
              {t("posts.list.retry")}
            </Button>
          </div>
        </Card>
      ) : null}

      {loadState === "ready" && items.length === 0 ? (
        <>
          <UserOnboardingCard
            accountConnected={accountCount > 0}
            automationEnabled={false}
            postCreated={false}
            activityObserved={false}
          />
          <Card>
            <CardHeader title={t("posts.list.empty")} description={t("posts.list.emptyDescription")} />
            <div className="flex flex-wrap justify-end gap-2">
              {accountCount === 0 ? (
                <Link href="/accounts" className={cn(buttonVariants({ variant: "outline" }))}>
                  {t("posts.create.goAccounts")}
                </Link>
              ) : null}
              <Link href="/posts/create" className={cn(buttonVariants())}>
                {t("posts.actions.new")}
              </Link>
            </div>
          </Card>
        </>
      ) : null}

      {loadState === "ready" && items.length > 0 ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(["all", "draft", "scheduled", "processing", "published", "failed"] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setStatusFilter(filter)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs transition-colors",
                  statusFilter === filter
                    ? "border-cyan-200/40 bg-cyan-300/10 text-white"
                    : "border-white/10 bg-white/[0.03] text-white/60 hover:bg-white/[0.06]"
                )}
              >
                {filter === "all" ? t("posts.list.filter.all") : t(`posts.status.${filter}`)}
              </button>
            ))}
          </div>
          {items.filter((post) => statusFilter === "all" || post.status === statusFilter).map((post) => (
            <Link
              key={post.id}
              href={`/posts/${post.id}`}
              className="surface-card block p-4 transition-colors hover:bg-white/[0.04] md:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="line-clamp-2 text-sm text-white/90">{post.content}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-white/55">
                    <span>
                      {t("posts.list.col.status")}:{" "}
                      <span className="text-white/75">{statusLabel(t, post.status)}</span>
                    </span>
                    <span>
                      {t("posts.list.col.account")}: #{post.x_account_id}
                    </span>
                    {post.scheduled_at ? (
                      <span>
                        {t("posts.list.col.scheduled")}: {new Date(post.scheduled_at).toLocaleString()}
                      </span>
                    ) : null}
                    {post.last_error_message ? (
                      <span className="break-words text-rose-100/80">
                        {t("posts.detail.lastError")}: {post.last_error_message}
                      </span>
                    ) : null}
                  </div>
                </div>
                <span className="text-xs text-white/45">{new Date(post.updated_at).toLocaleString()}</span>
              </div>
            </Link>
          ))}
          {items.filter((post) => statusFilter === "all" || post.status === statusFilter).length === 0 ? (
            <Card>
              <CardHeader title={t("posts.list.filteredEmpty")} description="" />
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
