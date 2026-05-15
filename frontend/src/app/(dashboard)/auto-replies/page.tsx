"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { ArrowRight, Bot, CheckCircle2, Lock, Pencil, ShieldCheck, Sparkles, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { accountService, type AccountListItem } from "@/services/account.service";
import { billingService } from "@/services/billing.service";
import {
  automationService,
  type AutoReplyDraftApi,
} from "@/services/automation.service";
import { oafBotService } from "@/services/oaf-bot.service";
import type { OAFBot } from "@/types/oaf-bot";

type LoadState = "loading" | "ready" | "error";
type ExecutionMode = "manual" | "review" | "autopilot";

function extractTweetID(url: string) {
  const match = url.match(/\/status(?:es)?\/(\d+)/);
  return match?.[1] || "";
}

function formatHandle(value?: string) {
  const normalized = (value || "").trim().replace(/^@/, "");
  return normalized ? `@${normalized}` : "—";
}

function normalizePlan(plan?: string) {
  if (plan === "pro_plus") return "pro_plus";
  if (plan === "pro" || plan === "plus" || plan === "basic") return plan;
  return "free_trial";
}

function canUseAutopilot(plan?: string) {
  const normalized = normalizePlan(plan);
  return normalized === "plus" || normalized === "pro" || normalized === "pro_plus";
}

function statusKey(status: string) {
  return `autoReply.status.${status}`;
}

export default function AutoRepliesPage() {
  const { t } = useT();
  const { pushToast } = useToast();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [bots, setBots] = useState<OAFBot[]>([]);
  const [drafts, setDrafts] = useState<AutoReplyDraftApi[]>([]);
  const [plan, setPlan] = useState("free_trial");
  const [executionMode, setExecutionMode] = useState<ExecutionMode>("review");
  const [xAccountID, setXAccountID] = useState<number>(0);
  const [commentURL, setCommentURL] = useState("");
  const [authorHandle, setAuthorHandle] = useState("");
  const [rootTweetText, setRootTweetText] = useState("");
  const [commentText, setCommentText] = useState("");
  const [editingDraftID, setEditingDraftID] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedAccount = accounts.find((account) => account.id === xAccountID) ?? accounts[0] ?? null;
  const selectedBot = useMemo(
    () => bots.find((bot) => selectedAccount && bot.twitter_account_id === selectedAccount.id) ?? null,
    [bots, selectedAccount]
  );
  const autopilotAvailable = canUseAutopilot(plan);

  const loadAll = useCallback(async () => {
    setLoadState("loading");
    try {
      const [accountData, botData, draftData, automationData, subscriptionData] = await Promise.all([
        accountService.list(),
        oafBotService.list(),
        automationService.replyDrafts(),
        automationService.list(),
        billingService.subscription(),
      ]);
      const connected = accountData.items.filter((item) => item.status === "connected");
      setAccounts(connected);
      setBots(botData.items);
      setDrafts(draftData.items);
      setPlan(subscriptionData.plan);
      const replyModule = automationData.modules.find((item) => item.type === "reply");
      setExecutionMode(replyModule?.config.execution_mode || "review");
      setXAccountID((current) => current || connected[0]?.id || 0);
      setLoadState("ready");
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || t("autoReply.errors.load")
        : t("autoReply.errors.load");
      pushToast(message);
      setLoadState("error");
    }
  }, [pushToast, t]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const createReplyDraft = async () => {
    const accountID = selectedAccount?.id ?? 0;
    if (!accountID || !authorHandle.trim() || !commentText.trim()) return;
    setBusy(true);
    try {
      const draft = await automationService.generateReplyDraft({
        x_account_id: accountID,
        comment_author_handle: authorHandle.trim(),
        root_tweet_text: rootTweetText.trim(),
        comment_text: commentText.trim(),
        comment_url: commentURL.trim(),
        comment_tweet_id: extractTweetID(commentURL),
      });
      setDrafts((items) => [draft, ...items.filter((item) => item.id !== draft.id)]);
      setCommentURL("");
      setAuthorHandle("");
      setRootTweetText("");
      setCommentText("");
      pushToast(t(draft.status === "ready_to_publish" ? "autoReply.toast.readyToPublish" : "autoReply.toast.generated"));
    } catch (error) {
      const body = axios.isAxiosError(error) ? error.response?.data : null;
      const message =
        body?.error_code === "ai_generation_quota_exceeded"
          ? t("autoReply.errors.quota")
          : body?.message || t("autoReply.errors.generate");
      pushToast(message);
    } finally {
      setBusy(false);
    }
  };

  const approveDraft = async (id: number) => {
    try {
      const updated = await automationService.approveReplyDraft(id);
      setDrafts((items) => items.map((item) => (item.id === id ? updated : item)));
      pushToast(t("autoReply.toast.approved"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoReply.errors.approve") : t("autoReply.errors.approve"));
    }
  };

  const rejectDraft = async (id: number) => {
    try {
      const updated = await automationService.rejectReplyDraft(id, t("autoReply.review.rejectReason"));
      setDrafts((items) => items.map((item) => (item.id === id ? updated : item)));
      pushToast(t("autoReply.toast.rejected"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoReply.errors.reject") : t("autoReply.errors.reject"));
    }
  };

  const startEdit = (draft: AutoReplyDraftApi) => {
    setEditingDraftID(draft.id);
    setEditingContent(draft.generated_reply || "");
  };

  const saveDraft = async () => {
    if (!editingDraftID || !editingContent.trim()) return;
    try {
      const updated = await automationService.updateReplyDraft(editingDraftID, editingContent.trim());
      setDrafts((items) => items.map((item) => (item.id === editingDraftID ? updated : item)));
      setEditingDraftID(null);
      setEditingContent("");
      pushToast(t("autoReply.toast.saved"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoReply.errors.save") : t("autoReply.errors.save"));
    }
  };

  const selectExecutionMode = async (mode: ExecutionMode) => {
    if (mode === "autopilot" && !autopilotAvailable) return;
    const previous = executionMode;
    setExecutionMode(mode);
    try {
      await automationService.updateExecutionMode("reply", mode);
      pushToast(t("autoReply.execution.saved"));
    } catch (error) {
      setExecutionMode(previous);
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || t("autoReply.execution.saveFailed")
        : t("autoReply.execution.saveFailed");
      pushToast(message);
    }
  };

  const canGenerate = Boolean(selectedAccount && authorHandle.trim() && commentText.trim() && !busy);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-blue-100/75">{t("autoReply.kicker")}</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">{t("autoReply.title")}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">{t("autoReply.subtitle")}</p>
        </div>
        <Link
          href="/execution-queue?type=reply"
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-white/20 bg-white/5 px-3 text-sm font-medium text-white transition-all hover:bg-white/10"
        >
          <ShieldCheck className="size-4" />
          {t("autoReply.openQueue")}
        </Link>
      </div>

      {loadState === "loading" ? (
        <Card>
          <CardHeader title={t("autoReply.loading.title")} description={t("autoReply.loading.description")} />
        </Card>
      ) : null}

      {loadState === "error" ? (
        <Card>
          <CardHeader title={t("autoReply.error.title")} description={t("autoReply.error.description")} />
          <Button onClick={() => void loadAll()}>{t("autoReply.retry")}</Button>
        </Card>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader title={t("autoReply.target.title")} description={t("autoReply.target.description")} />
          <div className="space-y-4">
            <label className="block space-y-2">
              <span className="text-xs font-medium text-white/60">{t("autoReply.target.account")}</span>
              <select
                value={selectedAccount?.id ?? 0}
                onChange={(event) => setXAccountID(Number(event.target.value))}
                className="h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none"
              >
                {accounts.length === 0 ? <option value={0}>{t("autoReply.target.noAccounts")}</option> : null}
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    @{account.username || account.display_name}
                  </option>
                ))}
              </select>
            </label>

            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl border border-blue-300/20 bg-blue-500/10 p-2 text-blue-100">
                  <Bot className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{t("autoReply.botStatus.title")}</p>
                  {selectedBot ? (
                    <div className="mt-2 space-y-1 text-sm text-white/65">
                      <p>{selectedBot.name}</p>
                      <p>{t("autoReply.botStatus.voice")}: {selectedBot.voice_tone || "—"}</p>
                      <p>{t("autoReply.botStatus.goal")}: {selectedBot.growth_goal || "—"}</p>
                      <p className="text-blue-100/80">{t("autoReply.botStatus.bound")}</p>
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2 text-sm text-white/62">
                      <p>{t("autoReply.botStatus.unbound")}</p>
                      <Link className="inline-flex items-center gap-1 text-blue-100 hover:text-white" href="/oaf-bots">
                        {t("autoReply.botStatus.bindCta")}
                        <ArrowRight className="size-3.5" />
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
              <div className="mb-3">
                <p className="text-sm font-semibold text-white">{t("autoReply.execution.title")}</p>
                <p className="mt-1 text-xs leading-5 text-white/55">{t("autoReply.execution.description")}</p>
              </div>
              <div className="grid gap-2">
                {(["manual", "review", "autopilot"] as ExecutionMode[]).map((mode) => {
                  const locked = mode === "autopilot" && !autopilotAvailable;
                  const active = executionMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      disabled={locked}
                      onClick={() => void selectExecutionMode(mode)}
                      className={[
                        "flex items-start justify-between gap-3 rounded-xl border px-3 py-3 text-left transition-all",
                        active
                          ? "border-blue-300/45 bg-blue-500/15 shadow-[0_0_24px_rgba(59,130,246,0.12)]"
                          : "border-white/10 bg-black/15 hover:border-white/20 hover:bg-white/[0.045]",
                        locked ? "cursor-not-allowed opacity-55" : "",
                      ].join(" ")}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-white">{t(`autoReply.execution.${mode}.title`)}</span>
                        <span className="mt-1 block text-xs leading-5 text-white/56">{t(`autoReply.execution.${mode}.description`)}</span>
                        {mode === "autopilot" ? (
                          <span className="mt-1 block text-xs leading-5 text-blue-100/70">{t("autoReply.execution.autopilot.currentTest")}</span>
                        ) : null}
                      </span>
                      {locked ? <Lock className="mt-0.5 size-4 shrink-0 text-amber-200" /> : active ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-blue-100" /> : null}
                    </button>
                  );
                })}
              </div>
              {!autopilotAvailable ? (
                <p className="mt-3 text-xs leading-5 text-amber-100/75">{t("autoReply.execution.upgradeHint")}</p>
              ) : null}
            </div>

            <label className="block space-y-2">
              <span className="text-xs font-medium text-white/60">{t("autoReply.target.url")}</span>
              <input
                value={commentURL}
                onChange={(event) => setCommentURL(event.target.value)}
                placeholder={t("autoReply.target.urlPlaceholder")}
                className="h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-white/30"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-medium text-white/60">{t("autoReply.target.author")}</span>
              <input
                value={authorHandle}
                onChange={(event) => setAuthorHandle(event.target.value)}
                placeholder={t("autoReply.target.authorPlaceholder")}
                className="h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white outline-none placeholder:text-white/30"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-medium text-white/60">{t("autoReply.target.rootTweet")}</span>
              <textarea
                value={rootTweetText}
                onChange={(event) => setRootTweetText(event.target.value)}
                rows={3}
                placeholder={t("autoReply.target.rootTweetPlaceholder")}
                className="min-h-24 w-full resize-y rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm leading-6 text-white outline-none placeholder:text-white/30"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-medium text-white/60">{t("autoReply.target.comment")}</span>
              <textarea
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                rows={5}
                placeholder={t("autoReply.target.commentPlaceholder")}
                className="min-h-32 w-full resize-y rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm leading-6 text-white outline-none placeholder:text-white/30"
              />
            </label>

            <div className="rounded-xl border border-violet-300/20 bg-gradient-to-br from-blue-500/10 to-violet-500/10 p-3 text-sm text-white/70">
              <Sparkles className="mr-2 inline size-4 text-blue-100" />
              {t("autoReply.target.costHint")}
            </div>

            <Button className="w-full bg-gradient-to-r from-blue-500 to-violet-500 text-white" disabled={!canGenerate} onClick={() => void createReplyDraft()}>
              {busy ? t("autoReply.target.generating") : t("autoReply.target.generate")}
            </Button>
          </div>
        </Card>

        <Card>
          <CardHeader title={t("autoReply.review.title")} description={t("autoReply.review.description")} />
          <div className="space-y-3">
            {drafts.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-10 text-center text-sm text-white/55">
                {t("autoReply.review.empty")}
              </div>
            ) : (
              drafts.slice(0, 12).map((draft) => {
                const canReview = draft.status === "review" || draft.status === "pending_review" || draft.status === "draft";
                const editing = editingDraftID === draft.id;
                return (
                  <div key={draft.id} className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-white">{formatHandle(draft.comment_author_handle)}</span>
                          <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-xs text-white/60">{t(statusKey(draft.status))}</span>
                          <span className="rounded-full border border-blue-300/20 bg-blue-500/10 px-2 py-0.5 text-xs text-blue-100">{t("autoReply.scene")}</span>
                          {draft.status === "ready_to_publish" ? <span className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-100">{t("autoReply.execution.autopilot.title")}</span> : null}
                          {draft.risk_level === "high" ? <span className="rounded-full border border-amber-300/20 bg-amber-500/10 px-2 py-0.5 text-xs text-amber-100">{t("autoReply.review.riskIntercepted")}</span> : null}
                          {draft.bot_id ? <span className="rounded-full border border-violet-300/20 bg-violet-500/10 px-2 py-0.5 text-xs text-violet-100">{t("oafBots.botNumber", { id: draft.bot_id })}</span> : null}
                        </div>
                        <div className="rounded-lg border border-white/8 bg-black/15 p-3">
                          <p className="mb-1 text-xs text-white/40">{t("autoReply.review.comment")}</p>
                          <p className="line-clamp-3 text-sm leading-6 text-white/68">{draft.comment_text}</p>
                        </div>
                        <div className="rounded-lg border border-blue-300/15 bg-blue-500/8 p-3">
                          <p className="mb-2 text-xs text-blue-100/75">{t("autoReply.review.generated")}</p>
                          {editing ? (
                            <textarea
                              value={editingContent}
                              onChange={(event) => setEditingContent(event.target.value)}
                              rows={4}
                              className="w-full resize-y rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm leading-6 text-white outline-none"
                            />
                          ) : (
                            <p className="text-sm leading-6 text-white/86">{draft.generated_reply || "—"}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-2">
                        {editing ? (
                          <>
                            <Button size="sm" onClick={() => void saveDraft()}>{t("autoReply.review.save")}</Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingDraftID(null)}>{t("common.cancel")}</Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" onClick={() => startEdit(draft)}>
                              <Pencil className="size-4" />
                              {t("autoReply.review.edit")}
                            </Button>
                            {canReview ? (
                              <Button size="sm" onClick={() => void approveDraft(draft.id)}>
                                <CheckCircle2 className="size-4" />
                                {t("autoReply.review.approve")}
                              </Button>
                            ) : null}
                            {draft.status !== "rejected" && draft.status !== "sent" && draft.status !== "published" ? (
                              <Button size="sm" variant="outline" onClick={() => void rejectDraft(draft.id)}>
                                <XCircle className="size-4" />
                                {t("autoReply.review.reject")}
                              </Button>
                            ) : null}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
