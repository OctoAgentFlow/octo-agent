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
          <div className="flex flex-wrap gap-2 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-2">
            {(["all", "draft", "scheduled", "processing", "published", "failed"] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setStatusFilter(filter)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  statusFilter === filter
                    ? "border-[#1d9bf0]/50 bg-[#1d9bf0]/10 text-[#8ecdf8]"
                    : "border-[#2f3336] bg-black text-[#71767b] hover:bg-[#16181c] hover:text-white"
                )}
              >
                {filter === "all" ? t("posts.list.filter.all") : t(`posts.status.${filter}`)}
              </button>
            ))}
          </div>
          <div className="overflow-hidden rounded-2xl border border-[#2f3336] bg-[#0f1419]">
            {items.filter((post) => statusFilter === "all" || post.status === statusFilter).map((post) => (
              <Link
                key={post.id}
                href={`/posts/${post.id}`}
                className="block border-b border-[#2f3336] bg-black p-4 transition-colors last:border-b-0 hover:bg-[#080808] md:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-3">
                    <p className="line-clamp-4 whitespace-pre-wrap break-words text-[15px] leading-7 text-[#e7e9ea] [overflow-wrap:anywhere]">{post.content}</p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-[#2f3336] bg-[#16181c] px-2.5 py-1 text-[#71767b]">
                        {t("posts.list.col.status")}:{" "}
                        <span className="text-[#e7e9ea]">{statusLabel(t, post.status)}</span>
                      </span>
                      <span className="rounded-full border border-[#2f3336] bg-[#16181c] px-2.5 py-1 text-[#71767b]">
                        {t("posts.list.col.account")}: #{post.x_account_id}
                      </span>
                      {post.scheduled_at ? (
                        <span className="rounded-full border border-[#2f3336] bg-[#16181c] px-2.5 py-1 text-[#71767b]">
                          {t("posts.list.col.scheduled")}: {new Date(post.scheduled_at).toLocaleString()}
                        </span>
                      ) : null}
                    </div>
                    {post.last_error_message ? (
                      <span>
                        <span className="break-words text-xs text-[#ff8a91]">
                          {t("posts.detail.lastError")}: {post.last_error_message}
                        </span>
                      </span>
                    ) : null}
                  </div>
                  <span className="text-xs text-[#71767b]">{new Date(post.updated_at).toLocaleString()}</span>
                </div>
              </Link>
            ))}
          </div>
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
