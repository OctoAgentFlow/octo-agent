"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import Link from "next/link";
import { CalendarClock, CheckCircle2, FileText, Plus, Sparkles, XCircle, type LucideIcon } from "lucide-react";

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

function sourceLabelKey(post: PostItem) {
  if (post.status === "scheduled") return "posts.source.autoPost";
  if (post.status === "published") return "posts.source.published";
  if (post.status === "processing") return "posts.source.publishing";
  if (post.status === "failed") return "posts.source.failed";
  return "posts.source.manualDraft";
}

function sourceDescriptionKey(post: PostItem) {
  if (post.status === "scheduled") return "posts.source.autoPostDesc";
  if (post.status === "published") return "posts.source.publishedDesc";
  if (post.status === "processing") return "posts.source.publishingDesc";
  if (post.status === "failed") return "posts.source.failedDesc";
  return "posts.source.manualDraftDesc";
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function statusTone(status: PostStatus) {
  if (status === "published") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  if (status === "scheduled") return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  if (status === "failed") return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
  if (status === "processing") return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
  return "border-[#2f3336] bg-[#16181c] text-[#b6bec5]";
}

export function PostsClient() {
  const { t } = useT();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [items, setItems] = useState<PostItem[]>([]);
  const [accountCount, setAccountCount] = useState(0);
  const [accountNames, setAccountNames] = useState<Record<number, string>>({});
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
      const connectedAccounts = accountData.items.filter((account) => account.status === "connected");
      setAccountCount(connectedAccounts.length);
      setAccountNames(Object.fromEntries(accountData.items.map((account) => [account.id, account.username])));
      setLoadState("ready");
    } catch (error) {
      const msg = axios.isAxiosError(error)
        ? error.response?.data?.message || t("posts.loadFailed")
        : t("posts.loadFailed");
      setErrorMessage(msg);
      setLoadState("error");
    }
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial list load
    void fetchPosts();
  }, [fetchPosts]);

  const counts = {
    draft: items.filter((post) => post.status === "draft").length,
    scheduled: items.filter((post) => post.status === "scheduled").length,
    processing: items.filter((post) => post.status === "processing").length,
    published: items.filter((post) => post.status === "published").length,
    failed: items.filter((post) => post.status === "failed").length,
  };
  const filteredItems = items.filter((post) => statusFilter === "all" || post.status === statusFilter);

  return (
    <div className="space-y-5 md:space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border border-[#2f3336] bg-black p-5 md:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(29,155,240,0.16),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(120,86,255,0.12),transparent_28%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#1d9bf0]/30 bg-[#1d9bf0]/10 px-3 py-1 text-xs font-medium text-[#8ecdf8]">
                <FileText className="size-3.5" />
                {t("posts.hero.eyebrow")}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#2f3336] bg-[#0f1419] px-3 py-1 text-xs font-medium text-[#b6bec5]">
                <Sparkles className="size-3.5 text-[#1d9bf0]" />
                {t("posts.hero.sourceHint")}
              </span>
            </div>
            <h2 className="text-2xl font-bold tracking-[-0.02em] text-[#e7e9ea] md:text-3xl">{t("posts.page.title")}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#71767b] md:text-[15px]">{t("posts.page.subtitle")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/auto-post" className={cn(buttonVariants({ variant: "outline" }))}>
              <CalendarClock className="size-4" />
              {t("posts.actions.openAutoPost")}
            </Link>
            <Link href="/posts/create" className={cn(buttonVariants())}>
              <Plus className="size-4" />
              {t("posts.actions.new")}
            </Link>
          </div>
        </div>
      </section>

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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <PipelineMetric icon={FileText} label={t("posts.status.draft")} value={counts.draft} />
            <PipelineMetric icon={CalendarClock} label={t("posts.status.scheduled")} value={counts.scheduled} tone="blue" />
            <PipelineMetric icon={Sparkles} label={t("posts.status.processing")} value={counts.processing} tone="yellow" />
            <PipelineMetric icon={CheckCircle2} label={t("posts.status.published")} value={counts.published} tone="green" />
            <PipelineMetric icon={XCircle} label={t("posts.status.failed")} value={counts.failed} tone="red" />
          </div>

          <Card className="bg-[#0f1419]">
            <div className="grid gap-3 md:grid-cols-3">
              <SourceGuide
                icon={FileText}
                title={t("posts.guide.manual.title")}
                description={t("posts.guide.manual.description")}
              />
              <SourceGuide
                icon={CalendarClock}
                title={t("posts.guide.autoPost.title")}
                description={t("posts.guide.autoPost.description")}
              />
              <SourceGuide
                icon={Sparkles}
                title={t("posts.guide.oafBot.title")}
                description={t("posts.guide.oafBot.description")}
              />
            </div>
          </Card>

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
          <div className="grid gap-3">
            {filteredItems.map((post) => (
              <Link
                key={post.id}
                href={`/posts/${post.id}`}
                className="block rounded-[24px] border border-[#2f3336] bg-[#0f1419] p-4 transition-colors hover:bg-[#080808] md:p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", statusTone(post.status))}>
                        {statusLabel(t, post.status)}
                      </span>
                      <span className="rounded-full border border-[#2f3336] bg-black px-2.5 py-1 text-xs text-[#b6bec5]">
                        {t(sourceLabelKey(post))}
                      </span>
                    </div>
                    <p className="line-clamp-4 whitespace-pre-wrap break-words text-[15px] leading-7 text-[#e7e9ea] [overflow-wrap:anywhere]">
                      {post.content}
                    </p>
                    <p className="text-xs leading-relaxed text-[#71767b]">{t(sourceDescriptionKey(post))}</p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-[#2f3336] bg-[#16181c] px-2.5 py-1 text-[#71767b]">
                        {t("posts.list.col.account")}:{" "}
                        <span className="text-[#e7e9ea]">
                          {accountNames[post.x_account_id] ? `@${accountNames[post.x_account_id]}` : `#${post.x_account_id}`}
                        </span>
                      </span>
                      <span className="rounded-full border border-[#2f3336] bg-[#16181c] px-2.5 py-1 text-[#71767b]">
                        {t("posts.list.col.updated")}: {formatDateTime(post.updated_at)}
                      </span>
                      {post.scheduled_at ? (
                        <span className="rounded-full border border-[#2f3336] bg-[#16181c] px-2.5 py-1 text-[#71767b]">
                          {t("posts.list.col.scheduled")}: {formatDateTime(post.scheduled_at)}
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
                  <span className="inline-flex shrink-0 items-center rounded-full border border-[#2f3336] px-3 py-1 text-xs text-[#71767b]">
                    {t("posts.list.openDetail")}
                  </span>
                </div>
              </Link>
            ))}
          </div>
          {filteredItems.length === 0 ? (
            <Card>
              <CardHeader title={t("posts.list.filteredEmpty")} description="" />
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PipelineMetric({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone?: "default" | "blue" | "green" | "yellow" | "red";
}) {
  const color =
    tone === "blue"
      ? "text-[#1d9bf0] bg-[#1d9bf0]/10"
      : tone === "green"
        ? "text-[#00ba7c] bg-[#00ba7c]/10"
        : tone === "yellow"
          ? "text-[#ffd400] bg-[#ffd400]/10"
          : tone === "red"
            ? "text-[#f4212e] bg-[#f4212e]/10"
            : "text-[#71767b] bg-[#16181c]";
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[#71767b]">{label}</p>
        <span className={cn("flex size-8 items-center justify-center rounded-full", color)}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-bold text-[#e7e9ea]">{value}</p>
    </div>
  );
}

function SourceGuide({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3 rounded-2xl border border-[#2f3336] bg-black p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#1d9bf0]/10 text-[#1d9bf0]">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#e7e9ea]">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-[#71767b]">{description}</p>
      </div>
    </div>
  );
}
