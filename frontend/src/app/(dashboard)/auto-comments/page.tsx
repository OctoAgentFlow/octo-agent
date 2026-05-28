"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { ArrowRight, Bot, CheckCircle2, Database, ListChecks, Lock, Pencil, Send, ShieldCheck, Sparkles, Star, Wand2, XCircle, type LucideIcon } from "lucide-react";

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
  type AutoCommentAnalyticsData,
  type AutoCommentTargetSuggestionData,
  type AutoCommentTargetApi,
  type AutoCommentTaskApi,
} from "@/services/automation.service";
import { oafBotService } from "@/services/oaf-bot.service";
import type { OAFBot } from "@/types/oaf-bot";

type LoadState = "loading" | "ready" | "error";
type ExecutionMode = "manual" | "review" | "autopilot";
type TargetFilter = "all" | "active" | "paused";
type CommentFeedbackTag = "too_generic" | "too_salesy" | "irrelevant" | "wrong_tone" | "good";

const panelClass = "rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4";
const inputClass = "form-input";
const labelClass = "text-xs font-medium text-[#71767b]";
const targetCategories = ["kol", "competitor", "customer", "media", "partner", "other"] as const;
const commentFeedbackTags: CommentFeedbackTag[] = ["too_generic", "too_salesy", "irrelevant", "wrong_tone", "good"];

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
  return `autoComment.status.${status}`;
}

export default function AutoCommentsPage() {
  const { t } = useT();
  const { pushToast } = useToast();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [bots, setBots] = useState<OAFBot[]>([]);
  const [targets, setTargets] = useState<AutoCommentTargetApi[]>([]);
  const [drafts, setDrafts] = useState<AutoCommentTaskApi[]>([]);
  const [analytics, setAnalytics] = useState<AutoCommentAnalyticsData | null>(null);
  const [plan, setPlan] = useState("free_trial");
  const [executionMode, setExecutionMode] = useState<ExecutionMode>("review");
  const [xAccountID, setXAccountID] = useState<number>(0);
  const [tweetURL, setTweetURL] = useState("");
  const [authorHandle, setAuthorHandle] = useState("");
  const [targetText, setTargetText] = useState("");
  const [targetCategory, setTargetCategory] = useState("kol");
  const [targetPriority, setTargetPriority] = useState(3);
  const [targetNotes, setTargetNotes] = useState("");
  const [bulkHandles, setBulkHandles] = useState("");
  const [bulkCategory, setBulkCategory] = useState("kol");
  const [bulkPriority, setBulkPriority] = useState(3);
  const [bulkNotes, setBulkNotes] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [suggestBusy, setSuggestBusy] = useState(false);
  const [targetSuggestions, setTargetSuggestions] = useState<AutoCommentTargetSuggestionData["items"]>([]);
  const [targetStatusFilter, setTargetStatusFilter] = useState<TargetFilter>("all");
  const [targetCategoryFilter, setTargetCategoryFilter] = useState("all");
  const [editingDraftID, setEditingDraftID] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [moduleEnabled, setModuleEnabled] = useState<boolean | null>(null);
  const [quotaUpgradeVisible, setQuotaUpgradeVisible] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState<Record<number, string>>({});

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
  const filteredTargets = useMemo(
    () =>
      targets
        .filter((target) => targetStatusFilter === "all" || target.status === targetStatusFilter)
        .filter((target) => targetCategoryFilter === "all" || (target.target_category || "kol") === targetCategoryFilter)
        .sort((a, b) => (b.priority || 0) - (a.priority || 0)),
    [targets, targetCategoryFilter, targetStatusFilter]
  );

  const loadAll = useCallback(async () => {
    setLoadState("loading");
    try {
      const [accountData, botData, targetData, draftData, analyticsData, automationData, subscriptionData] = await Promise.all([
        accountService.list(),
        oafBotService.list(),
        automationService.commentTargets(),
        automationService.commentDrafts(),
        automationService.commentAnalytics(),
        automationService.list(),
        billingService.subscription(),
      ]);
      const connected = accountData.items.filter((item) => item.status === "connected");
      setAccounts(connected);
      setBots(botData.items);
      setTargets(targetData.items);
      setDrafts(draftData.items);
      setAnalytics(analyticsData);
      setPlan(subscriptionData.plan);
      setQuotaUpgradeVisible(false);
      const commentModule = automationData.modules.find((item) => item.type === "comment");
      setExecutionMode(commentModule?.config.execution_mode || "review");
      setXAccountID((current) => current || connected[0]?.id || 0);
      setLoadState("ready");
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || t("autoComment.errors.load")
        : t("autoComment.errors.load");
      pushToast(message);
      setLoadState("error");
    }
  }, [pushToast, t]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const createTargetAndGenerate = async () => {
    const accountID = selectedAccount?.id ?? 0;
    if (!accountID || !tweetURL.trim() || !authorHandle.trim() || !targetText.trim()) return;
    setBusy(true);
    try {
      const target = await automationService.createCommentTweetTarget({
        x_account_id: accountID,
        target_tweet_url: tweetURL.trim(),
        target_tweet_id: extractTweetID(tweetURL),
        target_author_handle: authorHandle.trim(),
        target_text: targetText.trim(),
        target_category: targetCategory,
        priority: targetPriority,
        notes: targetNotes.trim(),
      });
      const draft = await automationService.generateCommentDraft(target.id);
      setTargets((items) => [target, ...items.filter((item) => item.id !== target.id)]);
      setDrafts((items) => [draft, ...items.filter((item) => item.id !== draft.id)]);
      setTweetURL("");
      setAuthorHandle("");
      setTargetText("");
      setTargetCategory("kol");
      setTargetPriority(3);
      setTargetNotes("");
      setQuotaUpgradeVisible(false);
      pushToast(t(draft.status === "ready_to_publish" ? "autoComment.toast.readyToPublish" : "autoComment.toast.generated"));
    } catch (error) {
      const body = axios.isAxiosError(error) ? error.response?.data : null;
      const isQuotaError = body?.error_code === "ai_generation_quota_exceeded" || body?.error_code === "auto_comment_monthly_limit_exceeded";
      if (isQuotaError) setQuotaUpgradeVisible(true);
      const message =
        isQuotaError
          ? t("autoComment.errors.quota")
          : body?.message || t("autoComment.errors.generate");
      pushToast(message);
    } finally {
      setBusy(false);
    }
  };

  const approveDraft = async (id: number) => {
    try {
      const updated = await automationService.approveCommentTask(id);
      setDrafts((items) => items.map((item) => (item.id === id ? updated : item)));
      pushToast(t("autoComment.toast.approved"));
    } catch (error) {
      pushToast(apiErrorCode(error) === "automation_module_paused" ? t("automation.pausedNotice.toast") : apiErrorMessage(error) || t("autoComment.errors.approve"));
    }
  };

  const rejectDraft = async (id: number) => {
    try {
      const updated = await automationService.rejectCommentDraft(id, t("autoComment.review.rejectReason"));
      setDrafts((items) => items.map((item) => (item.id === id ? updated : item)));
      pushToast(t("autoComment.toast.rejected"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoComment.errors.reject") : t("autoComment.errors.reject"));
    }
  };

  const startEdit = (draft: AutoCommentTaskApi) => {
    setEditingDraftID(draft.id);
    setEditingContent(draft.generated_comment || "");
  };

  const saveDraft = async () => {
    if (!editingDraftID || !editingContent.trim()) return;
    try {
      const updated = await automationService.updateCommentDraft(editingDraftID, editingContent.trim());
      setDrafts((items) => items.map((item) => (item.id === editingDraftID ? updated : item)));
      setEditingDraftID(null);
      setEditingContent("");
      pushToast(t("autoComment.toast.saved"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoComment.errors.save") : t("autoComment.errors.save"));
    }
  };

  const applyVariant = async (draftID: number, comment: string) => {
    if (!comment.trim()) return;
    try {
      const updated = await automationService.updateCommentDraft(draftID, comment.trim());
      setDrafts((items) => items.map((item) => (item.id === draftID ? updated : item)));
      setEditingDraftID(null);
      setEditingContent("");
      pushToast(t("autoComment.variants.applied"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoComment.errors.save") : t("autoComment.errors.save"));
    }
  };

  const submitCommentFeedback = async (draft: AutoCommentTaskApi, tag: CommentFeedbackTag) => {
    const positive = tag === "good";
    try {
      await automationService.createCommentFeedback(draft.id, {
        rating: positive ? "positive" : "negative",
        issue_tags: [tag],
        comment: t(`autoComment.feedback.comment.${tag}`),
      });
      setFeedbackSubmitted((prev) => ({ ...prev, [draft.id]: tag }));
      pushToast(t("autoComment.feedback.saved"));
    } catch (error) {
      pushToast(apiErrorMessage(error) || t("autoComment.feedback.saveFailed"));
    }
  };

  const importTargets = async () => {
    const accountID = selectedAccount?.id ?? 0;
    if (!accountID || !bulkHandles.trim() || bulkBusy) return;
    setBulkBusy(true);
    try {
      const result = await automationService.bulkImportCommentTargets({
        x_account_id: accountID,
        raw_handles: bulkHandles,
        target_category: bulkCategory,
        priority: bulkPriority,
        notes: bulkNotes.trim(),
      });
      setTargets((items) => {
        const next = [...items];
        result.items.forEach((target) => {
          const index = next.findIndex((item) => item.id === target.id);
          if (index >= 0) next[index] = target;
          else next.unshift(target);
        });
        return next;
      });
      setBulkHandles("");
      setBulkNotes("");
      pushToast(t("autoComment.bulkImport.success", { imported: result.imported, updated: result.updated, skipped: result.skipped }));
    } catch (error) {
      pushToast(apiErrorMessage(error) || t("autoComment.bulkImport.failed"));
    } finally {
      setBulkBusy(false);
    }
  };

  const suggestTargets = async () => {
    const accountID = selectedAccount?.id ?? 0;
    if (!accountID || suggestBusy) return;
    setSuggestBusy(true);
    try {
      const data = await automationService.suggestCommentTargets(accountID);
      setTargetSuggestions(data.items || []);
      pushToast(t("autoComment.discovery.ready", { count: data.items?.length || 0 }));
    } catch (error) {
      pushToast(apiErrorCode(error) === "ai_generation_quota_exceeded" ? t("autoComment.errors.quota") : apiErrorMessage(error) || t("autoComment.discovery.failed"));
    } finally {
      setSuggestBusy(false);
    }
  };

  const applySuggestedTarget = (item: AutoCommentTargetSuggestionData["items"][number]) => {
    const handle = item.handle.startsWith("@") ? item.handle : `@${item.handle}`;
    setBulkHandles((prev) => {
      const current = prev.trim();
      return current ? `${current}\n${handle}` : handle;
    });
    setBulkCategory(item.category || "kol");
    setBulkPriority(item.priority || 3);
    setBulkNotes(item.reason || "");
  };

  const canGenerate = Boolean(selectedAccount && tweetURL.trim() && authorHandle.trim() && targetText.trim() && !busy);
  const hasTargetInput = Boolean(tweetURL.trim() && authorHandle.trim() && targetText.trim());
  const modulePaused = moduleEnabled === false;
  const modulePausedActionTip = modulePaused
    ? t("automation.pausedNotice.actionDisabled", { module: t("automation.module.comment.name") })
    : undefined;

  const selectExecutionMode = async (mode: ExecutionMode) => {
    if (mode === "autopilot" && !autopilotAvailable) return;
    const previous = executionMode;
    setExecutionMode(mode);
    try {
      await automationService.updateExecutionMode("comment", mode);
      pushToast(t("autoComment.execution.saved"));
    } catch (error) {
      setExecutionMode(previous);
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || t("autoComment.execution.saveFailed")
        : t("autoComment.execution.saveFailed");
      pushToast(message);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-[#1d9bf0]">{t("autoComment.kicker")}</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">{t("autoComment.title")}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#71767b]">{t("autoComment.subtitle")}</p>
        </div>
        <Link
          href="/oaf-bots"
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-[#2f3336] bg-transparent px-4 text-sm font-semibold text-white transition-all hover:bg-[#16181c]"
        >
          <Bot className="size-4" />
          {t("autoComment.manageBots")}
        </Link>
      </div>

      {loadState === "loading" ? (
        <Card>
          <CardHeader title={t("autoComment.loading.title")} description={t("autoComment.loading.description")} />
        </Card>
      ) : null}

      {loadState === "error" ? (
        <Card>
          <CardHeader title={t("autoComment.error.title")} description={t("autoComment.error.description")} />
          <Button onClick={() => void loadAll()}>{t("autoComment.retry")}</Button>
        </Card>
      ) : null}

      <AutomationModulePausedNotice type="comment" onEnabledChange={setModuleEnabled} />

      {quotaUpgradeVisible ? <QuotaUpgradeCallout /> : null}

      {loadState === "ready" ? (
        <>
          <AutomationSetupGuide
            baseKey="autoComment"
            hasAccount={Boolean(selectedAccount)}
            hasTargetInput={hasTargetInput}
            autopilotAvailable={autopilotAvailable}
            executionMode={executionMode}
            queueHref="/execution-queue?type=comment"
          />
          <AutomationPipelineSummary
            baseKey="autoComment"
            inputValue={targetText.trim() ? formatHandle(authorHandle) : t("autoComment.pipeline.inputValue", { count: targets.length })}
            queueCount={queuedDraftCount}
            publishReadyCount={publishReadyCount}
            executionMode={executionMode}
            queueHref="/execution-queue?type=comment"
          />
          {analytics ? <AutoCommentAnalyticsPanel data={analytics} /> : null}
        </>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="bg-[#0f1419]">
          <CardHeader title={t("autoComment.target.title")} description={t("autoComment.target.description")} />
          <div className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-3">
              <WorkbenchSignal
                icon={Database}
                label={t("autoComment.signal.input")}
                title={targetText.trim() ? t("autoComment.signal.inputReady") : t("autoComment.signal.inputWaiting")}
                description={t("autoComment.signal.inputDesc")}
                tone="blue"
              />
              <WorkbenchSignal
                icon={Bot}
                label={t("autoComment.signal.persona")}
                title={selectedBot ? selectedBot.name : t("autoComment.botStatus.title")}
                description={selectedBot ? t("autoComment.signal.personaReady") : t("autoComment.botStatus.unbound")}
                tone="green"
              />
              <WorkbenchSignal
                icon={ListChecks}
                label={t("autoComment.signal.destination")}
                title={t("autoComment.signal.queue")}
                description={t("autoComment.signal.destinationDesc", { mode: t(`autoComment.execution.${executionMode}.title`) })}
                tone="violet"
              />
            </div>
            <label className="block space-y-2">
              <span className={labelClass}>{t("autoComment.target.account")}</span>
              <select
                value={selectedAccount?.id ?? 0}
                onChange={(event) => setXAccountID(Number(event.target.value))}
                className={`${inputClass} h-10 py-0`}
              >
                {accounts.length === 0 ? <option value={0}>{t("autoComment.target.noAccounts")}</option> : null}
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
                  <ShieldCheck className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">{t("autoComment.botStatus.title")}</p>
                  {selectedBot ? (
                    <div className="mt-2 space-y-1 text-sm text-[#71767b]">
                      <p>{selectedBot.name}</p>
                      <p>{t("autoComment.botStatus.voice")}: {selectedBot.voice_tone || "—"}</p>
                      <p>{t("autoComment.botStatus.goal")}: {selectedBot.growth_goal || "—"}</p>
                      <p className="text-[#1d9bf0]">{t("autoComment.botStatus.bound")}</p>
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2 text-sm text-[#71767b]">
                      <p>{t("autoComment.botStatus.unbound")}</p>
                      <Link className="inline-flex items-center gap-1 text-[#1d9bf0] hover:underline" href="/oaf-bots">
                        {t("autoComment.botStatus.bindCta")}
                        <ArrowRight className="size-3.5" />
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className={panelClass}>
              <div className="mb-3">
                <p className="text-sm font-semibold text-white">{t("autoComment.execution.title")}</p>
                <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("autoComment.execution.description")}</p>
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
                        <span className="block text-sm font-semibold text-white">{t(`autoComment.execution.${mode}.title`)}</span>
                        <span className="mt-1 block text-xs leading-5 text-[#71767b]">{t(`autoComment.execution.${mode}.description`)}</span>
                        {mode === "autopilot" ? (
                          <span className="mt-1 block text-xs leading-5 text-[#1d9bf0]">{t("autoComment.execution.autopilot.currentTest")}</span>
                        ) : null}
                      </span>
                      {locked ? <Lock className="mt-0.5 size-4 shrink-0 text-[#f6d96b]" /> : active ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#1d9bf0]" /> : null}
                    </button>
                  );
                })}
              </div>
              {!autopilotAvailable ? (
                <p className="mt-3 text-xs leading-5 text-[#f6d96b]">{t("autoComment.execution.upgradeHint")}</p>
              ) : null}
            </div>

            <label className="block space-y-2">
              <span className={labelClass}>{t("autoComment.target.url")}</span>
              <input
                value={tweetURL}
                onChange={(event) => setTweetURL(event.target.value)}
                placeholder={t("autoComment.target.urlPlaceholder")}
                className={inputClass}
              />
            </label>
            <label className="block space-y-2">
              <span className={labelClass}>{t("autoComment.target.author")}</span>
              <input
                value={authorHandle}
                onChange={(event) => setAuthorHandle(event.target.value)}
                placeholder={t("autoComment.target.authorPlaceholder")}
                className={inputClass}
              />
            </label>
            <label className="block space-y-2">
              <span className={labelClass}>{t("autoComment.target.text")}</span>
              <textarea
                value={targetText}
                onChange={(event) => setTargetText(event.target.value)}
                rows={5}
                placeholder={t("autoComment.target.textPlaceholder")}
                className={`${inputClass} min-h-32 resize-y leading-6`}
              />
            </label>
            <div className="grid gap-3 md:grid-cols-[1fr_180px]">
              <label className="block space-y-2">
                <span className={labelClass}>{t("autoComment.target.category")}</span>
                <select value={targetCategory} onChange={(event) => setTargetCategory(event.target.value)} className={`${inputClass} h-10 py-0`}>
                  {targetCategories.map((category) => (
                    <option key={category} value={category}>
                      {t(`autoComment.targetCategory.${category}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2">
                <span className={labelClass}>{t("autoComment.target.priority")}</span>
                <select value={targetPriority} onChange={(event) => setTargetPriority(Number(event.target.value))} className={`${inputClass} h-10 py-0`}>
                  {[5, 4, 3, 2, 1].map((priority) => (
                    <option key={priority} value={priority}>
                      {t("autoComment.target.priorityValue", { value: priority })}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block space-y-2">
              <span className={labelClass}>{t("autoComment.target.notes")}</span>
              <input
                value={targetNotes}
                onChange={(event) => setTargetNotes(event.target.value)}
                placeholder={t("autoComment.target.notesPlaceholder")}
                className={inputClass}
              />
            </label>

            <div className="rounded-2xl border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 p-3 text-sm text-[#e7e9ea]">
              <Sparkles className="mr-2 inline size-4 text-[#1d9bf0]" />
              {t("autoComment.target.costHint")}
            </div>

            <Button className="w-full" disabled={!canGenerate} onClick={() => void createTargetAndGenerate()}>
              {busy ? t("autoComment.target.generating") : t("autoComment.target.generate")}
            </Button>

            <div className={panelClass}>
              <div className="mb-3">
                <p className="text-sm font-semibold text-white">{t("autoComment.bulkImport.title")}</p>
                <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("autoComment.bulkImport.description")}</p>
              </div>
              <label className="block space-y-2">
                <span className={labelClass}>{t("autoComment.bulkImport.handles")}</span>
                <textarea
                  value={bulkHandles}
                  onChange={(event) => setBulkHandles(event.target.value)}
                  rows={4}
                  placeholder={t("autoComment.bulkImport.placeholder")}
                  className={`${inputClass} min-h-24 resize-y leading-6`}
                />
              </label>
              <div className="mt-3 grid gap-3 md:grid-cols-[1fr_160px]">
                <label className="block space-y-2">
                  <span className={labelClass}>{t("autoComment.target.category")}</span>
                  <select value={bulkCategory} onChange={(event) => setBulkCategory(event.target.value)} className={`${inputClass} h-10 py-0`}>
                    {targetCategories.map((category) => (
                      <option key={category} value={category}>
                        {t(`autoComment.targetCategory.${category}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-2">
                  <span className={labelClass}>{t("autoComment.target.priority")}</span>
                  <select value={bulkPriority} onChange={(event) => setBulkPriority(Number(event.target.value))} className={`${inputClass} h-10 py-0`}>
                    {[5, 4, 3, 2, 1].map((priority) => (
                      <option key={priority} value={priority}>
                        {t("autoComment.target.priorityValue", { value: priority })}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="mt-3 block space-y-2">
                <span className={labelClass}>{t("autoComment.target.notes")}</span>
                <input
                  value={bulkNotes}
                  onChange={(event) => setBulkNotes(event.target.value)}
                  placeholder={t("autoComment.bulkImport.notesPlaceholder")}
                  className={inputClass}
                />
              </label>
              <Button className="mt-3 w-full" variant="outline" disabled={!selectedAccount || !bulkHandles.trim() || bulkBusy} onClick={() => void importTargets()}>
                {bulkBusy ? t("autoComment.bulkImport.importing") : t("autoComment.bulkImport.action")}
              </Button>
              <div className="mt-4 border-t border-[#2f3336] pt-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{t("autoComment.discovery.title")}</p>
                    <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("autoComment.discovery.description")}</p>
                  </div>
                  <Button size="sm" variant="outline" disabled={!selectedAccount || suggestBusy} onClick={() => void suggestTargets()}>
                    {suggestBusy ? t("autoComment.discovery.loading") : t("autoComment.discovery.action")}
                  </Button>
                </div>
                {targetSuggestions.length > 0 ? (
                  <div className="mt-3 grid gap-2">
                    {targetSuggestions.slice(0, 8).map((item) => (
                      <div key={item.handle} className="rounded-xl border border-[#2f3336] bg-black p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">{formatHandle(item.handle)} {item.display_name ? <span className="text-[#71767b]">· {item.display_name}</span> : null}</p>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              <span className="rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-2 py-0.5 text-xs text-[#8ecdf8]">{t(`autoComment.targetCategory.${item.category || "kol"}`)}</span>
                              <span className="rounded-full border border-[#ffd400]/25 bg-[#ffd400]/10 px-2 py-0.5 text-xs text-[#f6d96b]">{t("autoComment.target.priorityValue", { value: item.priority || 3 })}</span>
                              {item.needs_verify ? <span className="rounded-full border border-[#2f3336] bg-[#16181c] px-2 py-0.5 text-xs text-[#71767b]">{t("autoComment.discovery.verify")}</span> : null}
                            </div>
                            <p className="mt-2 text-xs leading-5 text-[#b6bec5]">{item.reason}</p>
                            {item.search_query ? <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("autoComment.discovery.search")}: {item.search_query}</p> : null}
                          </div>
                          <Button size="sm" onClick={() => applySuggestedTarget(item)}>{t("autoComment.discovery.use")}</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden bg-[#0f1419] p-0">
          <div className="border-b border-[#2f3336] p-5 md:p-6">
            <CardHeader title={t("autoComment.review.title")} description={t("autoComment.review.description")} />
            {modulePaused ? (
              <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100/80">
                {modulePausedActionTip}
              </p>
            ) : null}
          </div>
          <div className="divide-y divide-[#2f3336]">
            {drafts.length === 0 ? (
              <div className="m-5 rounded-2xl border border-[#2f3336] bg-black px-4 py-10 text-center text-sm text-[#71767b]">
                {t("autoComment.review.empty")}
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
                          <span className="text-sm font-semibold text-white">{formatHandle(draft.target_tweet_author || draft.target_username)}</span>
                          <span className="rounded-full border border-[#2f3336] bg-[#16181c] px-2 py-0.5 text-xs text-[#71767b]">{t(statusKey(draft.status))}</span>
                          <span className="rounded-full border border-[#1d9bf0]/35 bg-[#1d9bf0]/10 px-2 py-0.5 text-xs text-[#8ecdf8]">{t("autoComment.scene")}</span>
                          {draft.status === "ready_to_publish" ? <span className="rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-2 py-0.5 text-xs text-[#7ee0b5]">{t("autoComment.execution.autopilot.title")}</span> : null}
                          {draft.risk_level === "high" ? <span className="rounded-full border border-[#ffd400]/25 bg-[#ffd400]/10 px-2 py-0.5 text-xs text-[#f6d96b]">{t("autoComment.review.riskIntercepted")}</span> : null}
                          {draft.bot_id ? <span className="rounded-full border border-[#2f3336] bg-[#16181c] px-2 py-0.5 text-xs text-[#71767b]">{t("oafBots.botNumber", { id: draft.bot_id })}</span> : null}
                        </div>
                        <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3">
                          <p className="mb-1 text-xs text-[#71767b]">{t("autoComment.review.targetTweet")}</p>
                          <p className="line-clamp-3 break-words text-sm leading-6 text-[#b6bec5]">{draft.target_tweet_text || draft.target_tweet_id}</p>
                        </div>
                        <div className="rounded-2xl border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="text-xs font-medium text-[#8ecdf8]">{t("autoComment.opportunity.title")}</p>
                              <p className="mt-1 text-sm leading-6 text-[#e7e9ea]">{draft.generation_reason || t("autoComment.opportunity.defaultReason")}</p>
                            </div>
                            <div className="shrink-0 rounded-2xl border border-[#1d9bf0]/30 bg-black px-4 py-2 text-center">
                              <p className="text-[11px] text-[#71767b]">{t("autoComment.opportunity.score")}</p>
                              <p className="mt-0.5 text-xl font-semibold text-white">{draft.generation_reason ? draft.opportunity_score : "—"}</p>
                            </div>
                          </div>
                          <div className="mt-3 grid gap-3 md:grid-cols-2">
                            <OpportunityList title={t("autoComment.opportunity.keywords")} items={draft.matched_keywords || []} empty={t("autoComment.opportunity.noKeywords")} />
                            <OpportunityList title={t("autoComment.opportunity.content")} items={draft.referenced_content || []} empty={t("autoComment.opportunity.noContent")} />
                          </div>
                        </div>
                        <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
                          <p className="mb-2 text-xs text-[#1d9bf0]">{t("autoComment.review.generated")}</p>
                          {editing ? (
                            <textarea
                              value={editingContent}
                              onChange={(event) => setEditingContent(event.target.value)}
                              rows={4}
                              className={`${inputClass} min-h-28 resize-y leading-6`}
                            />
                          ) : (
                            <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-[#e7e9ea] [overflow-wrap:anywhere]">{draft.generated_comment || "—"}</p>
                          )}
                        </div>
                        {draft.comment_variants?.length ? (
                          <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
                            <div className="mb-3">
                              <p className="text-xs font-medium text-[#8ecdf8]">{t("autoComment.variants.title")}</p>
                              <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("autoComment.variants.description")}</p>
                            </div>
                            <div className="grid gap-2">
                              {draft.comment_variants.map((variant) => (
                                <button
                                  key={`${draft.id}-${variant.type}-${variant.comment}`}
                                  type="button"
                                  onClick={() => void applyVariant(draft.id, variant.comment)}
                                  className={[
                                    "rounded-xl border p-3 text-left transition-all",
                                    variant.comment === draft.generated_comment
                                      ? "border-[#00ba7c]/30 bg-[#00ba7c]/10"
                                      : "border-[#2f3336] bg-black hover:border-[#1d9bf0]/40 hover:bg-[#1d9bf0]/10",
                                  ].join(" ")}
                                >
                                  <span className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="text-xs font-semibold text-[#8ecdf8]">{t(`autoComment.variantType.${variant.type}`)}</span>
                                    {variant.comment === draft.generated_comment ? <span className="text-xs text-[#7ee0b5]">{t("autoComment.variants.current")}</span> : null}
                                  </span>
                                  <span className="mt-2 block whitespace-pre-wrap break-words text-sm leading-6 text-[#e7e9ea]">{variant.comment}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-4">
                          <div className="mb-3">
                            <p className="text-xs font-medium text-[#8ecdf8]">{t("autoComment.feedback.title")}</p>
                            <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("autoComment.feedback.description")}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {commentFeedbackTags.map((tag) => {
                              const selected = feedbackSubmitted[draft.id] === tag;
                              return (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => void submitCommentFeedback(draft, tag)}
                                  className={[
                                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                                    selected
                                      ? "border-[#00ba7c]/35 bg-[#00ba7c]/10 text-[#7ee0b5]"
                                      : "border-[#2f3336] bg-black text-[#b6bec5] hover:border-[#1d9bf0]/40 hover:text-white",
                                  ].join(" ")}
                                >
                                  {t(`autoComment.feedback.tag.${tag}`)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="grid gap-2 text-xs text-[#71767b] sm:grid-cols-3">
                          <DraftRouteStep label={t("autoComment.pipeline.input")} value={formatHandle(draft.target_tweet_author || draft.target_username)} />
                          <DraftRouteStep label={t("autoComment.pipeline.queue")} value={t(statusKey(draft.status))} />
                          <DraftRouteStep label={t("autoComment.pipeline.publish")} value={draft.status === "published" || draft.status === "sent" ? t("autoComment.pipeline.published") : t("autoComment.pipeline.waiting")} />
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-2">
                        {editing ? (
                          <>
                            <Button size="sm" onClick={() => void saveDraft()}>{t("autoComment.review.save")}</Button>
                            <Button size="sm" variant="outline" onClick={() => setEditingDraftID(null)}>{t("common.cancel")}</Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="outline" onClick={() => startEdit(draft)}>
                              <Pencil className="size-4" />
                              {t("autoComment.review.edit")}
                            </Button>
                            {canReview ? (
                              <Button size="sm" onClick={() => void approveDraft(draft.id)} disabled={modulePaused} title={modulePausedActionTip}>
                                <CheckCircle2 className="size-4" />
                                {t("autoComment.review.approve")}
                              </Button>
                            ) : null}
                            {draft.status !== "rejected" && draft.status !== "sent" && draft.status !== "published" ? (
                              <Button size="sm" variant="outline" onClick={() => void rejectDraft(draft.id)}>
                                <XCircle className="size-4" />
                                {t("autoComment.review.reject")}
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

      <Card className="bg-[#0f1419]">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <CardHeader title={t("autoComment.targets.title")} description={t("autoComment.targets.description")} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={targetCategoryFilter} onChange={(event) => setTargetCategoryFilter(event.target.value)} className={`${inputClass} h-9 min-w-40 py-0 text-sm`}>
              <option value="all">{t("autoComment.targets.allCategories")}</option>
              {targetCategories.map((category) => (
                <option key={category} value={category}>
                  {t(`autoComment.targetCategory.${category}`)}
                </option>
              ))}
            </select>
            <select value={targetStatusFilter} onChange={(event) => setTargetStatusFilter(event.target.value as TargetFilter)} className={`${inputClass} h-9 min-w-32 py-0 text-sm`}>
              <option value="all">{t("autoComment.targets.allStatuses")}</option>
              <option value="active">{t("autoComment.targetStatus.active")}</option>
              <option value="paused">{t("autoComment.targetStatus.paused")}</option>
            </select>
          </div>
        </div>
        {targets.length === 0 ? (
          <p className="rounded-2xl border border-[#2f3336] bg-black px-4 py-6 text-sm text-[#71767b]">{t("autoComment.targets.empty")}</p>
        ) : filteredTargets.length === 0 ? (
          <p className="rounded-2xl border border-[#2f3336] bg-black px-4 py-6 text-sm text-[#71767b]">{t("autoComment.targets.noFiltered")}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredTargets.slice(0, 12).map((target) => (
              <div key={target.id} className="rounded-2xl border border-[#2f3336] bg-black p-3 transition-colors hover:bg-[#080808]">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-semibold text-white">{formatHandle(target.target_author_handle || target.target_username)}</p>
                  <span className="shrink-0 rounded-full border border-[#2f3336] bg-[#16181c] px-2 py-0.5 text-xs text-[#71767b]">{t(`autoComment.targetStatus.${target.status}`)}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-2 py-0.5 text-xs text-[#8ecdf8]">{t(`autoComment.targetCategory.${target.target_category || "kol"}`)}</span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#ffd400]/25 bg-[#ffd400]/10 px-2 py-0.5 text-xs text-[#f6d96b]">
                    <Star className="size-3" />
                    {target.priority || 3}
                  </span>
                </div>
                <p className="mt-2 line-clamp-3 break-words text-xs leading-5 text-[#71767b]">{target.target_text || target.target_tweet_url || target.target_username}</p>
                {target.notes ? <p className="mt-2 line-clamp-2 break-words border-t border-[#2f3336] pt-2 text-xs leading-5 text-[#8b98a5]">{target.notes}</p> : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
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
  baseKey: "autoComment";
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
  baseKey: "autoComment";
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

function AutoCommentAnalyticsPanel({ data }: { data: AutoCommentAnalyticsData }) {
  const { t } = useT();
  const stats = [
    { label: t("autoComment.analytics.total"), value: data.summary.total_tasks },
    { label: t("autoComment.analytics.published"), value: data.summary.published },
    { label: t("autoComment.analytics.pending"), value: data.summary.pending },
    { label: t("autoComment.analytics.failed"), value: data.summary.failed },
    { label: t("autoComment.analytics.avgOpportunity"), value: data.summary.average_opportunity },
  ];
  return (
    <Card className="bg-[#0f1419]">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <CardHeader title={t("autoComment.analytics.title")} description={t("autoComment.analytics.description")} />
      </div>
      <div className="grid gap-3 md:grid-cols-5">
        {stats.map((item) => (
          <div key={item.label} className="rounded-2xl border border-[#2f3336] bg-black p-3">
            <p className="text-xs text-[#71767b]">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <AnalyticsGroupList title={t("autoComment.analytics.byCategory")} rows={data.by_category} labelPrefix="autoComment.targetCategory." />
        <AnalyticsGroupList title={t("autoComment.analytics.byTarget")} rows={data.by_target} />
      </div>
      <div className="mt-4 rounded-2xl border border-[#2f3336] bg-black p-4">
        <p className="text-sm font-semibold text-white">{t("autoComment.health.title")}</p>
        <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("autoComment.health.description")}</p>
        {data.health.length === 0 ? <p className="mt-3 text-sm text-[#71767b]">{t("autoComment.health.empty")}</p> : null}
        <div className="mt-3 grid gap-2 xl:grid-cols-2">
          {data.health.slice(0, 8).map((item) => (
            <div key={`${item.target_id}-${item.issue_type}`} className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-white">{formatHandle(item.target_username)}</span>
                <span className="rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-2 py-0.5 text-xs text-[#8ecdf8]">{t(`autoComment.targetCategory.${item.target_category || "other"}`)}</span>
                <span className={["rounded-full border px-2 py-0.5 text-xs", item.severity === "high" ? "border-red-400/30 bg-red-500/10 text-red-200" : item.severity === "medium" ? "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]" : "border-[#2f3336] bg-black text-[#b6bec5]"].join(" ")}>
                  {t(`autoComment.health.severity.${item.severity}`)}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-[#e7e9ea]">{t(`autoComment.health.issue.${item.issue_type}`)}</p>
              <p className="mt-1 text-xs leading-5 text-[#71767b]">{item.message}</p>
              <p className="mt-2 text-xs leading-5 text-[#8ecdf8]">{item.suggested_action}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[#71767b]">
                {item.total_tasks > 0 ? <span>{t("autoComment.health.tasks", { total: item.total_tasks, failed: item.failed_count })}</span> : null}
                {item.average_opportunity > 0 ? <span>{t("autoComment.health.avgScore", { score: item.average_opportunity })}</span> : null}
                {item.last_failure_reason ? <span className="line-clamp-1 max-w-full">{item.last_failure_reason}</span> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-white">{t("autoComment.analytics.recentPublished")}</p>
          {data.recent_published.length === 0 ? <p className="mt-3 text-sm text-[#71767b]">{t("autoComment.analytics.emptyPublished")}</p> : null}
          <div className="mt-3 space-y-2">
            {data.recent_published.slice(0, 5).map((item) => (
              <a key={item.id} href={item.comment_url} target="_blank" rel="noreferrer" className="block rounded-xl border border-[#2f3336] bg-[#0f1419] p-3 hover:border-[#1d9bf0]/40">
                <span className="text-xs text-[#8ecdf8]">{formatHandle(item.target_username)} · {t(`autoComment.targetCategory.${item.target_category || "other"}`)}</span>
                <span className="mt-1 line-clamp-2 block text-sm leading-6 text-[#e7e9ea]">{item.generated_comment}</span>
              </a>
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-sm font-semibold text-white">{t("autoComment.analytics.recentFailures")}</p>
          {data.recent_failures.length === 0 ? <p className="mt-3 text-sm text-[#71767b]">{t("autoComment.analytics.emptyFailures")}</p> : null}
          <div className="mt-3 space-y-2">
            {data.recent_failures.slice(0, 5).map((item) => (
              <div key={item.id} className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
                <p className="text-xs text-[#f6d96b]">{formatHandle(item.target_username)} · {item.failure_category || t("autoComment.analytics.failure")}</p>
                <p className="mt-1 line-clamp-2 text-sm leading-6 text-[#e7e9ea]">{item.failure_reason || "—"}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}

function AnalyticsGroupList({ title, rows, labelPrefix }: { title: string; rows: AutoCommentAnalyticsData["by_category"]; labelPrefix?: string }) {
  const { t } = useT();
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
      <p className="text-sm font-semibold text-white">{title}</p>
      {rows.length === 0 ? <p className="mt-3 text-sm text-[#71767b]">{t("autoComment.analytics.emptyGroups")}</p> : null}
      <div className="mt-3 space-y-2">
        {rows.slice(0, 6).map((row) => (
          <div key={row.key} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#e7e9ea]">{labelPrefix ? t(`${labelPrefix}${row.key}`) : row.label}</p>
              <p className="mt-1 text-xs text-[#71767b]">{t("autoComment.analytics.groupMeta", { total: row.total, score: row.average_opportunity })}</p>
            </div>
            <div className="text-right text-xs leading-5">
              <p className="text-[#7ee0b5]">{t("autoComment.analytics.publishedShort", { count: row.published })}</p>
              <p className="text-[#f6d96b]">{t("autoComment.analytics.failedShort", { count: row.failed })}</p>
            </div>
          </div>
        ))}
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

function OpportunityList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  const visible = items.filter(Boolean).slice(0, 6);
  return (
    <div className="min-w-0 rounded-2xl border border-[#2f3336] bg-black p-3">
      <p className="text-[11px] font-medium text-[#71767b]">{title}</p>
      {visible.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {visible.map((item) => (
            <span key={item} className="max-w-full truncate rounded-full border border-[#2f3336] bg-[#16181c] px-2 py-1 text-xs text-[#b6bec5]">
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs leading-5 text-[#71767b]">{empty}</p>
      )}
    </div>
  );
}
