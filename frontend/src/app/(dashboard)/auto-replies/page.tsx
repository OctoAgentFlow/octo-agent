"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { ArrowRight, Bot, CheckCircle2, Database, ListChecks, Lock, Pencil, Send, ShieldCheck, Sparkles, Wand2, XCircle, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { AutomationModulePausedNotice } from "@/components/automation/automation-module-paused-notice";
import { QuotaUpgradeCallout } from "@/components/automation/quota-upgrade-callout";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { apiErrorCode, apiErrorMessage } from "@/lib/request";
import { accountService, type AccountListItem } from "@/services/account.service";
import { billingService } from "@/services/billing.service";
import {
  automationService,
  type AutomationModuleApi,
  type AutoReplyDraftApi,
} from "@/services/automation.service";
import { oafBotService } from "@/services/oaf-bot.service";
import type { OAFBot } from "@/types/oaf-bot";

type LoadState = "loading" | "ready" | "error";
type ExecutionMode = "manual" | "review" | "autopilot";

const panelClass = "rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4";
const inputClass = "form-input";
const labelClass = "text-xs font-medium text-[#71767b]";

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
  const [replyModule, setReplyModule] = useState<AutomationModuleApi | null>(null);
  const [xAccountID, setXAccountID] = useState<number>(0);
  const [commentURL, setCommentURL] = useState("");
  const [authorHandle, setAuthorHandle] = useState("");
  const [rootTweetText, setRootTweetText] = useState("");
  const [commentText, setCommentText] = useState("");
  const [editingDraftID, setEditingDraftID] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [moduleEnabled, setModuleEnabled] = useState<boolean | null>(null);
  const [quotaUpgradeVisible, setQuotaUpgradeVisible] = useState(false);

  const selectedAccount = accounts.find((account) => account.id === xAccountID) ?? accounts[0] ?? null;
  const selectedBot = useMemo(
    () => bots.find((bot) => selectedAccount && bot.twitter_account_id === selectedAccount.id) ?? null,
    [bots, selectedAccount]
  );
  const autopilotAvailable = canUseAutopilot(plan);
  const accountDrafts = useMemo(() => drafts.filter((draft) => draft.x_account_id === selectedAccount?.id), [drafts, selectedAccount?.id]);
  const queuedDraftCount = useMemo(
    () => accountDrafts.filter((draft) => ["draft", "review", "pending_review", "approved", "ready_to_publish"].includes(draft.status)).length,
    [accountDrafts]
  );
  const publishReadyCount = useMemo(
    () => accountDrafts.filter((draft) => ["approved", "ready_to_publish", "published", "sent"].includes(draft.status)).length,
    [accountDrafts]
  );

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
      setQuotaUpgradeVisible(false);
      const replyModule = automationData.modules.find((item) => item.type === "reply");
      setReplyModule(replyModule ?? null);
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
      setQuotaUpgradeVisible(false);
      pushToast(t(draft.status === "ready_to_publish" ? "autoReply.toast.readyToPublish" : "autoReply.toast.generated"));
    } catch (error) {
      const body = axios.isAxiosError(error) ? error.response?.data : null;
      const isQuotaError = body?.error_code === "ai_generation_quota_exceeded" || body?.error_code === "auto_reply_monthly_limit_exceeded";
      if (isQuotaError) setQuotaUpgradeVisible(true);
      const message =
        isQuotaError
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
      pushToast(apiErrorCode(error) === "automation_module_paused" ? t("automation.pausedNotice.toast") : apiErrorMessage(error) || t("autoReply.errors.approve"));
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
  const hasTargetInput = Boolean(authorHandle.trim() && commentText.trim());
  const modulePaused = moduleEnabled === false;
  const modulePausedActionTip = modulePaused
    ? t("automation.pausedNotice.actionDisabled", { module: t("automation.module.reply.name") })
    : undefined;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-[#1d9bf0]">{t("autoReply.kicker")}</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">{t("autoReply.title")}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#71767b]">{t("autoReply.subtitle")}</p>
        </div>
        <Link
          href="/execution-queue?type=reply"
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-[#2f3336] bg-transparent px-4 text-sm font-semibold text-white transition-all hover:bg-[#16181c]"
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

      <AutomationModulePausedNotice type="reply" onEnabledChange={setModuleEnabled} />

      {quotaUpgradeVisible ? <QuotaUpgradeCallout /> : null}

      {loadState === "ready" ? (
        <>
          <AutomationSetupGuide
            baseKey="autoReply"
            hasAccount={Boolean(selectedAccount)}
            hasTargetInput={hasTargetInput}
            autopilotAvailable={autopilotAvailable}
            executionMode={executionMode}
            queueHref="/execution-queue?type=reply"
          />
          <AutomationPipelineSummary
            baseKey="autoReply"
            inputValue={commentText.trim() ? formatHandle(authorHandle) : t("autoReply.pipeline.inputValue", { count: accountDrafts.length })}
            queueCount={queuedDraftCount}
            publishReadyCount={publishReadyCount}
            executionMode={executionMode}
            queueHref="/execution-queue?type=reply"
          />
          <ReplyScanStatusCard module={replyModule} />
        </>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="bg-[#0f1419]">
          <CardHeader title={t("autoReply.target.title")} description={t("autoReply.target.description")} />
          <div className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-3">
              <WorkbenchSignal
                icon={Database}
                label={t("autoReply.signal.input")}
                title={commentText.trim() ? t("autoReply.signal.inputReady") : t("autoReply.signal.inputWaiting")}
                description={t("autoReply.signal.inputDesc")}
                tone="blue"
              />
              <WorkbenchSignal
                icon={Bot}
                label={t("autoReply.signal.persona")}
                title={selectedBot ? selectedBot.name : t("autoReply.botStatus.title")}
                description={selectedBot ? t("autoReply.signal.personaReady") : t("autoReply.botStatus.unbound")}
                tone="green"
              />
              <WorkbenchSignal
                icon={ListChecks}
                label={t("autoReply.signal.destination")}
                title={t("autoReply.signal.queue")}
                description={t("autoReply.signal.destinationDesc", { mode: t(`autoReply.execution.${executionMode}.title`) })}
                tone="violet"
              />
            </div>
            <label className="block space-y-2">
              <span className={labelClass}>{t("autoReply.target.account")}</span>
              <select
                value={selectedAccount?.id ?? 0}
                onChange={(event) => setXAccountID(Number(event.target.value))}
                className={`${inputClass} h-10 py-0`}
              >
                {accounts.length === 0 ? <option value={0}>{t("autoReply.target.noAccounts")}</option> : null}
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    @{account.username || account.display_name}
                  </option>
                ))}
              </select>
            </label>

            <div className={panelClass}>
              <div className="flex items-start gap-3">
                <div className="rounded-full border border-[#2f3336] bg-[#16181c] p-2 text-[#1d9bf0]">
                  <Bot className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{t("autoReply.botStatus.title")}</p>
                  {selectedBot ? (
                    <div className="mt-2 space-y-1 text-sm text-[#71767b]">
                      <p>{selectedBot.name}</p>
                      <p>{t("autoReply.botStatus.voice")}: {selectedBot.voice_tone || "—"}</p>
                      <p>{t("autoReply.botStatus.goal")}: {selectedBot.growth_goal || "—"}</p>
                      <p className="text-[#1d9bf0]">{t("autoReply.botStatus.bound")}</p>
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2 text-sm text-[#71767b]">
                      <p>{t("autoReply.botStatus.unbound")}</p>
                      <Link className="inline-flex items-center gap-1 text-[#1d9bf0] hover:underline" href="/oaf-bots">
                        {t("autoReply.botStatus.bindCta")}
                        <ArrowRight className="size-3.5" />
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className={panelClass}>
              <div className="mb-3">
                <p className="text-sm font-semibold text-white">{t("autoReply.execution.title")}</p>
                <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("autoReply.execution.description")}</p>
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
                          ? "border-[#1d9bf0]/60 bg-[#1d9bf0]/10 shadow-[0_0_18px_rgba(29,155,240,0.08)]"
                          : "border-[#2f3336] bg-black hover:bg-[#16181c]",
                        locked ? "cursor-not-allowed opacity-55" : "",
                      ].join(" ")}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-white">{t(`autoReply.execution.${mode}.title`)}</span>
                        <span className="mt-1 block text-xs leading-5 text-[#71767b]">{t(`autoReply.execution.${mode}.description`)}</span>
                        {mode === "autopilot" ? (
                          <span className="mt-1 block text-xs leading-5 text-[#1d9bf0]">{t("autoReply.execution.autopilot.currentTest")}</span>
                        ) : null}
                      </span>
                      {locked ? <Lock className="mt-0.5 size-4 shrink-0 text-[#f6d96b]" /> : active ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#1d9bf0]" /> : null}
                    </button>
                  );
                })}
              </div>
              {!autopilotAvailable ? (
                <p className="mt-3 text-xs leading-5 text-[#f6d96b]">{t("autoReply.execution.upgradeHint")}</p>
              ) : null}
            </div>

            <label className="block space-y-2">
              <span className={labelClass}>{t("autoReply.target.url")}</span>
              <input
                value={commentURL}
                onChange={(event) => setCommentURL(event.target.value)}
                placeholder={t("autoReply.target.urlPlaceholder")}
                className={inputClass}
              />
            </label>
            <label className="block space-y-2">
              <span className={labelClass}>{t("autoReply.target.author")}</span>
              <input
                value={authorHandle}
                onChange={(event) => setAuthorHandle(event.target.value)}
                placeholder={t("autoReply.target.authorPlaceholder")}
                className={inputClass}
              />
            </label>
            <label className="block space-y-2">
              <span className={labelClass}>{t("autoReply.target.rootTweet")}</span>
              <textarea
                value={rootTweetText}
                onChange={(event) => setRootTweetText(event.target.value)}
                rows={3}
                placeholder={t("autoReply.target.rootTweetPlaceholder")}
                className={`${inputClass} min-h-24 resize-y leading-6`}
              />
            </label>
            <label className="block space-y-2">
              <span className={labelClass}>{t("autoReply.target.comment")}</span>
              <textarea
                value={commentText}
                onChange={(event) => setCommentText(event.target.value)}
                rows={5}
                placeholder={t("autoReply.target.commentPlaceholder")}
                className={`${inputClass} min-h-32 resize-y leading-6`}
              />
            </label>

            <div className="rounded-2xl border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 p-3 text-sm text-[#e7e9ea]">
              <Sparkles className="mr-2 inline size-4 text-[#1d9bf0]" />
              {t("autoReply.target.costHint")}
            </div>

            <Button className="w-full" disabled={!canGenerate} onClick={() => void createReplyDraft()}>
              {busy ? t("autoReply.target.generating") : t("autoReply.target.generate")}
            </Button>
          </div>
        </Card>

        <Card className="overflow-hidden bg-[#0f1419] p-0">
          <div className="border-b border-[#2f3336] p-5 md:p-6">
            <CardHeader title={t("autoReply.review.title")} description={t("autoReply.review.description")} />
            {modulePaused ? (
              <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100/80">
                {modulePausedActionTip}
              </p>
            ) : null}
          </div>
          <div className="divide-y divide-[#2f3336]">
            {drafts.length === 0 ? (
              <div className="m-5 rounded-2xl border border-[#2f3336] bg-black px-4 py-10 text-center text-sm text-[#71767b]">
                {t("autoReply.review.empty")}
              </div>
            ) : (
              drafts.slice(0, 12).map((draft) => {
                const canReview = draft.status === "review" || draft.status === "pending_review" || draft.status === "draft";
                const editing = editingDraftID === draft.id;
                return (
                  <div key={draft.id} className="bg-black p-5 transition-colors hover:bg-[#080808]">
                    <div className="flex flex-col items-start justify-between gap-4 xl:flex-row">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-white">{formatHandle(draft.comment_author_handle)}</span>
                          <span className="rounded-full border border-[#2f3336] bg-[#16181c] px-2 py-0.5 text-xs text-[#71767b]">{t(statusKey(draft.status))}</span>
                          <span className="rounded-full border border-[#1d9bf0]/35 bg-[#1d9bf0]/10 px-2 py-0.5 text-xs text-[#8ecdf8]">{t("autoReply.scene")}</span>
                          {draft.status === "ready_to_publish" ? <span className="rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-2 py-0.5 text-xs text-[#7ee0b5]">{t("autoReply.execution.autopilot.title")}</span> : null}
                          {draft.risk_level === "high" ? <span className="rounded-full border border-[#ffd400]/25 bg-[#ffd400]/10 px-2 py-0.5 text-xs text-[#f6d96b]">{t("autoReply.review.riskIntercepted")}</span> : null}
                          {draft.bot_id ? <span className="rounded-full border border-[#2f3336] bg-[#16181c] px-2 py-0.5 text-xs text-[#71767b]">{t("oafBots.botNumber", { id: draft.bot_id })}</span> : null}
                        </div>
                        <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3">
                          <p className="mb-1 text-xs text-[#71767b]">{t("autoReply.review.comment")}</p>
                          <p className="line-clamp-3 break-words text-sm leading-6 text-[#b6bec5]">{draft.comment_text}</p>
                        </div>
                        <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
                          <p className="mb-2 text-xs text-[#1d9bf0]">{t("autoReply.review.generated")}</p>
                          {editing ? (
                            <textarea
                              value={editingContent}
                              onChange={(event) => setEditingContent(event.target.value)}
                              rows={4}
                              className={`${inputClass} min-h-28 resize-y leading-6`}
                            />
                          ) : (
                            <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-[#e7e9ea] [overflow-wrap:anywhere]">{draft.generated_reply || "—"}</p>
                          )}
                        </div>
                        <div className="grid gap-2 text-xs text-[#71767b] sm:grid-cols-3">
                          <DraftRouteStep label={t("autoReply.pipeline.input")} value={formatHandle(draft.comment_author_handle)} />
                          <DraftRouteStep label={t("autoReply.pipeline.queue")} value={t(statusKey(draft.status))} />
                          <DraftRouteStep label={t("autoReply.pipeline.publish")} value={draft.status === "published" || draft.status === "sent" ? t("autoReply.pipeline.published") : t("autoReply.pipeline.waiting")} />
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
                              <Button size="sm" onClick={() => void approveDraft(draft.id)} disabled={modulePaused} title={modulePausedActionTip}>
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

function formatScanTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function replyScanStatusTone(status?: string) {
  if (status === "published") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  if (status === "failed" || status === "reauth_required") return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff9aa2]";
  if (status === "token_refreshed") return "border-[#1d9bf0]/35 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  return "border-[#2f3336] bg-black text-[#e7e9ea]";
}

function ReplyScanStatusCard({ module }: { module: AutomationModuleApi | null }) {
  const { t } = useT();
  const status = module?.last_scan_status || "not_scanned";
  const message = t(`autoReply.scan.status.${status}`);
  const tone = replyScanStatusTone(status);

  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#e7e9ea]">{t("autoReply.scan.title")}</p>
          <p className="mt-1 text-sm leading-6 text-[#71767b]">{t("autoReply.scan.description")}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold ${tone}`}>
          <ListChecks className="size-3.5" />
          {t(`autoReply.scan.status.${status}`)}
        </span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <DraftRouteStep label={t("autoReply.scan.lastResult")} value={message} />
        <DraftRouteStep label={t("autoReply.scan.lastRun")} value={formatScanTime(module?.last_run_at || module?.last_scan_at)} />
        <DraftRouteStep label={t("autoReply.scan.nextRun")} value={module?.config.enabled ? formatScanTime(module?.next_run_at) : t("automation.time.paused")} />
      </div>
    </Card>
  );
}

function AutomationSetupGuide({
  baseKey,
  hasAccount,
  hasTargetInput,
  autopilotAvailable,
  executionMode,
  queueHref,
}: {
  baseKey: "autoReply";
  hasAccount: boolean;
  hasTargetInput: boolean;
  autopilotAvailable: boolean;
  executionMode: ExecutionMode;
  queueHref: string;
}) {
  const { t } = useT();
  const autopilotReady = executionMode === "autopilot" && autopilotAvailable;
  const checks = [
    {
      done: hasAccount,
      title: t(`${baseKey}.setup.account.title`),
      description: t(`${baseKey}.setup.account.description`),
    },
    {
      done: hasTargetInput,
      title: t(`${baseKey}.setup.target.title`),
      description: t(`${baseKey}.setup.target.description`),
    },
    {
      done: autopilotReady,
      title: t(`${baseKey}.setup.mode.title`),
      description: t(`${baseKey}.setup.mode.description`),
    },
    {
      done: true,
      title: t(`${baseKey}.setup.queue.title`),
      description: t(`${baseKey}.setup.queue.description`),
    },
  ];
  const missingCount = checks.filter((item) => !item.done).length;

  return (
    <Card className={missingCount === 0 ? "border-[#00ba7c]/25 bg-[#00ba7c]/10" : "border-amber-300/20 bg-amber-500/10"}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#e7e9ea]">{missingCount === 0 ? t(`${baseKey}.setup.readyTitle`) : t(`${baseKey}.setup.title`)}</p>
          <p className="mt-1 text-sm leading-6 text-[#71767b]">{missingCount === 0 ? t(`${baseKey}.setup.readyDescription`) : t(`${baseKey}.setup.description`)}</p>
        </div>
        <Link href={queueHref} className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-[#2f3336] px-4 text-sm font-semibold text-white hover:bg-[#16181c]">
          {t(`${baseKey}.pipeline.openQueue`)}
        </Link>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {checks.map((item) => (
          <div key={item.title} className="rounded-xl border border-[#2f3336] bg-black p-3">
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border ${item.done ? "border-[#00ba7c]/30 bg-[#00ba7c]/10 text-[#7ee0b5]" : "border-amber-300/25 bg-amber-500/10 text-amber-100"}`}>
                {item.done ? <CheckCircle2 className="size-4" /> : <span className="size-2 rounded-full bg-current" />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#e7e9ea]">{item.title}</span>
                <span className="mt-1 block text-xs leading-5 text-[#71767b]">{item.description}</span>
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function AutomationPipelineSummary({
  baseKey,
  inputValue,
  queueCount,
  publishReadyCount,
  executionMode,
  queueHref,
}: {
  baseKey: "autoReply";
  inputValue: string;
  queueCount: number;
  publishReadyCount: number;
  executionMode: ExecutionMode;
  queueHref: string;
}) {
  const { t } = useT();
  const steps = [
    {
      id: "input",
      icon: Database,
      title: t(`${baseKey}.pipeline.input`),
      value: inputValue,
      description: t(`${baseKey}.pipeline.inputDesc`),
      tone: "border-[#1d9bf0]/35 bg-[#1d9bf0]/10 text-[#8ecdf8]",
    },
    {
      id: "generate",
      icon: Wand2,
      title: t(`${baseKey}.pipeline.generate`),
      value: t(`${baseKey}.execution.${executionMode}.title`),
      description: t(`${baseKey}.pipeline.generateDesc`),
      tone: "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]",
    },
    {
      id: "queue",
      icon: ListChecks,
      title: t(`${baseKey}.pipeline.queue`),
      value: t(`${baseKey}.pipeline.queueValue`, { count: queueCount }),
      description: t(`${baseKey}.pipeline.queueDesc`),
      tone: "border-[#7856ff]/30 bg-[#7856ff]/12 text-[#b8a7ff]",
    },
    {
      id: "publish",
      icon: Send,
      title: t(`${baseKey}.pipeline.publish`),
      value: t(`${baseKey}.pipeline.publishValue`, { count: publishReadyCount }),
      description: t(`${baseKey}.pipeline.publishDesc`),
      tone: "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]",
    },
  ];

  return (
    <Card className="bg-[#0f1419]">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#e7e9ea]">{t(`${baseKey}.pipeline.title`)}</p>
          <p className="mt-1 text-sm leading-6 text-[#71767b]">{t(`${baseKey}.pipeline.description`)}</p>
        </div>
        <Link href={queueHref} className="text-sm font-semibold text-[#1d9bf0] hover:text-[#8ecdf8]">
          {t(`${baseKey}.pipeline.openQueue`)}
        </Link>
      </div>
      <div className="grid gap-3 lg:grid-cols-4">
        {steps.map((step, index) => (
          <div key={step.id} className="relative min-w-0 rounded-2xl border border-[#2f3336] bg-black p-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className={`inline-flex size-10 shrink-0 items-center justify-center rounded-2xl border ${step.tone}`}>
                <step.icon className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-[#e7e9ea]">{step.title}</span>
                <span className="mt-1 block truncate text-sm text-[#8ecdf8]">{step.value}</span>
                <span className="mt-2 block line-clamp-2 text-xs leading-5 text-[#71767b]">{step.description}</span>
              </span>
            </div>
            {index < steps.length - 1 ? <ArrowRight className="absolute -right-2 top-1/2 hidden size-4 -translate-y-1/2 text-[#2f3336] lg:block" /> : null}
          </div>
        ))}
      </div>
    </Card>
  );
}

function WorkbenchSignal({
  icon: Icon,
  label,
  title,
  description,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  title: string;
  description: string;
  tone: "blue" | "green" | "violet";
}) {
  const toneClass =
    tone === "green"
      ? "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]"
      : tone === "violet"
        ? "border-[#7856ff]/30 bg-[#7856ff]/12 text-[#b8a7ff]"
        : "border-[#1d9bf0]/35 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  return (
    <div className="min-w-0 rounded-2xl border border-[#2f3336] bg-black p-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className={`inline-flex size-9 shrink-0 items-center justify-center rounded-2xl border ${toneClass}`}>
          <Icon className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-[#71767b]">{label}</span>
          <span className="mt-1 block truncate text-sm font-semibold text-[#e7e9ea]">{title}</span>
          <span className="mt-1 block line-clamp-2 text-xs leading-5 text-[#71767b]">{description}</span>
        </span>
      </div>
    </div>
  );
}

function DraftRouteStep({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-[#2f3336] bg-[#0f1419] px-3 py-2">
      <p className="text-[11px] text-[#71767b]">{label}</p>
      <p className="mt-1 truncate text-xs font-semibold text-[#e7e9ea]">{value}</p>
    </div>
  );
}
