"use client";

import axios from "axios";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  Inbox,
  MessageCircleReply,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Upload,
  UserCheck,
  UserX,
  type LucideIcon,
} from "lucide-react";

import { useConfirm } from "@/components/providers/confirm-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { AutomationModulePausedNotice } from "@/components/automation/automation-module-paused-notice";
import { useT } from "@/i18n/use-t";
import { apiErrorCode, apiErrorMessage } from "@/lib/request";
import { formatDateTime, usePreferredTimeZone } from "@/lib/timezone";
import { accountService, type AccountListItem } from "@/services/account.service";
import {
  automationService,
  type AutoDMDiagnosticApi,
  type AutoDMOverviewData,
  type AutoDMRecipientImportPreviewData,
  type AutoDMRecipientImportApi,
  type AutoDMRecipientRuleApi,
  type AutoDMRecipientSegment,
  type AutoDMTaskApi,
} from "@/services/automation.service";

const requiredDMScopeList = ["dm.read", "dm.write", "tweet.read", "users.read"];
const dmRecipientSegments: AutoDMRecipientSegment[] = ["lead", "partner", "community", "investor", "existing_user"];
type AutoDMTaskFilter = "all" | "review" | "approved" | "sent" | "replied" | "risk";
type AutoDMRecipientStatusFilter = "all" | AutoDMRecipientRuleApi["status"];
type AutoDMRecipientSegmentFilter = "all" | AutoDMRecipientSegment;
type AutoDMMeterTone = "blue" | "green" | "yellow" | "red" | "violet";
const X_OAUTH_RESULT_MESSAGE = "octo-x-oauth-result" as const;

function csvCell(value: string) {
  const text = value.trim();
  if (!/[",\n]/.test(text)) return text;
  return `"${text.replaceAll("\"", "\"\"")}"`;
}

export default function AutoDMsPage() {
  const { t } = useT();
  const timeZone = usePreferredTimeZone();
  const { pushToast } = useToast();
  const { confirm } = useConfirm();
  const [loading, setLoading] = useState(true);
  const [dmTasks, setDMTasks] = useState<AutoDMTaskApi[]>([]);
  const [dmRecipients, setDMRecipients] = useState<AutoDMRecipientRuleApi[]>([]);
  const [dmImports, setDMImports] = useState<AutoDMRecipientImportApi[]>([]);
  const [dmOverview, setDMOverview] = useState<AutoDMOverviewData | null>(null);
  const [dmImportPreview, setDMImportPreview] = useState<AutoDMRecipientImportPreviewData | null>(null);
  const [dmImportPreviewLoading, setDMImportPreviewLoading] = useState(false);
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [dmImportCSV, setDMImportCSV] = useState("");
  const [moduleEnabled, setModuleEnabled] = useState<boolean | null>(null);
  const [dmTaskFilter, setDMTaskFilter] = useState<AutoDMTaskFilter>("all");
  const [authRefreshing, setAuthRefreshing] = useState(false);
  const [dmImportUserID, setDMImportUserID] = useState("");
  const [dmImportUsername, setDMImportUsername] = useState("");
  const [dmImportSegment, setDMImportSegment] = useState<AutoDMRecipientSegment>("lead");
  const [recipientSearch, setRecipientSearch] = useState("");
  const [recipientStatusFilter, setRecipientStatusFilter] = useState<AutoDMRecipientStatusFilter>("all");
  const [recipientSegmentFilter, setRecipientSegmentFilter] = useState<AutoDMRecipientSegmentFilter>("all");
  const oauthPopupPollRef = useRef<number | null>(null);

  const dmAccount = accounts.find((account) => account.status === "connected") ?? accounts[0] ?? null;
  const dmScopes = new Set((dmAccount?.oauth_scopes || []).map((scope) => scope.toLowerCase()));
  const missingDMScopeList = dmAccount ? requiredDMScopeList.filter((scope) => !dmScopes.has(scope)) : requiredDMScopeList;
  const dmAuthorizationReady = Boolean(dmAccount && dmAccount.status === "connected" && missingDMScopeList.length === 0);
  const reviewCount = dmTasks.filter((task) => task.status === "review").length;
  const riskCount = dmTasks.filter((task) => task.status === "failed" || task.status === "blocked").length;
  const repliedCount = dmTasks.filter((task) => Boolean(task.inbound_reply_at)).length;
  const allowlistedCount = dmRecipients.filter((rule) => rule.status === "allowlisted").length;
  const filteredDMTasks = dmTasks.filter((task) => {
    if (dmTaskFilter === "review") return task.status === "review";
    if (dmTaskFilter === "approved") return task.status === "approved";
    if (dmTaskFilter === "sent") return task.status === "sent";
    if (dmTaskFilter === "replied") return Boolean(task.inbound_reply_at);
    if (dmTaskFilter === "risk") return task.status === "failed" || task.status === "blocked";
    return true;
  });
  const filteredDMRecipients = useMemo(() => {
    const query = recipientSearch.trim().replace(/^@/, "").toLowerCase();
    return dmRecipients.filter((rule) => {
      if (recipientStatusFilter !== "all" && rule.status !== recipientStatusFilter) return false;
      if (recipientSegmentFilter !== "all" && (rule.recipient_segment || "lead") !== recipientSegmentFilter) return false;
      if (!query) return true;
      return [rule.recipient_username, rule.recipient_user_id, rule.reason, rule.source]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [dmRecipients, recipientSearch, recipientSegmentFilter, recipientStatusFilter]);
  const modulePaused = moduleEnabled === false;
  const modulePausedActionTip = modulePaused
    ? t("automation.pausedNotice.actionDisabled", { module: t("automation.module.dm.name") })
    : undefined;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accountData, overviewData, dmTaskData, dmRecipientData, dmImportData] = await Promise.all([
        accountService.list(),
        automationService.dmOverview(),
        automationService.dmTasks(),
        automationService.dmRecipients(),
        automationService.dmRecipientImports(),
      ]);
      setAccounts(accountData.items);
      setDMOverview(overviewData);
      setDMTasks(dmTaskData.items);
      setDMRecipients(dmRecipientData.items);
      setDMImports(dmImportData.items);
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoDm.errors.load") : t("autoDm.errors.load"));
    } finally {
      setLoading(false);
    }
  }, [pushToast, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshDMAuthorizationStatus = useCallback(async () => {
    try {
      const accountData = await accountService.list();
      setAccounts(accountData.items);
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoDm.errors.load") : t("autoDm.errors.load"));
    } finally {
      setAuthRefreshing(false);
    }
  }, [pushToast, t]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; status?: string } | null;
      if (!data || data.type !== X_OAUTH_RESULT_MESSAGE) return;
      if (oauthPopupPollRef.current) {
        window.clearInterval(oauthPopupPollRef.current);
        oauthPopupPollRef.current = null;
      }
      if (data.status === "success") {
        pushToast(t("accounts.toast.connected"));
        void refreshDMAuthorizationStatus();
      } else {
        setAuthRefreshing(false);
        pushToast(t("accounts.toast.authorizationFailed"));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [pushToast, refreshDMAuthorizationStatus, t]);

  useEffect(() => {
    return () => {
      if (oauthPopupPollRef.current) {
        window.clearInterval(oauthPopupPollRef.current);
      }
    };
  }, []);

  const reconnectXAccount = async () => {
    try {
      setAuthRefreshing(true);
      const data = await accountService.startXOAuth();
      if (!data.auth_url) throw new Error(t("accounts.toast.oauthUrlMissing"));
      const features = ["popup=yes", "width=560", "height=720", "left=80", "top=80"].join(",");
      const popup = window.open(data.auth_url, "octo_x_oauth", features);
      if (!popup) throw new Error(t("accounts.toast.popupBlocked"));
      popup.focus();
      if (oauthPopupPollRef.current) {
        window.clearInterval(oauthPopupPollRef.current);
      }
      oauthPopupPollRef.current = window.setInterval(() => {
        if (!popup.closed) return;
        if (oauthPopupPollRef.current) {
          window.clearInterval(oauthPopupPollRef.current);
          oauthPopupPollRef.current = null;
        }
        window.setTimeout(() => void refreshDMAuthorizationStatus(), 800);
      }, 800);
    } catch (error) {
      setAuthRefreshing(false);
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("accounts.toast.oauthUrlMissing") : error instanceof Error ? error.message : t("accounts.toast.oauthUrlMissing"));
    }
  };

  const approveDMTask = async (id: number) => {
    try {
      const updated = await automationService.approveDMTask(id);
      setDMTasks((items) => items.map((item) => (item.id === id ? updated : item)));
      pushToast(t("autoDm.toast.approved"));
    } catch (error) {
      pushToast(apiErrorCode(error) === "automation_module_paused" ? t("automation.pausedNotice.toast") : apiErrorMessage(error) || t("autoDm.errors.approve"));
    }
  };

  const blockDMTask = async (id: number) => {
    try {
      const updated = await automationService.blockDMTask(id, t("autoDm.reason.blocked"));
      setDMTasks((items) => items.map((item) => (item.id === id ? updated : item)));
      pushToast(t("autoDm.toast.blocked"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoDm.errors.block") : t("autoDm.errors.block"));
    }
  };

  const retryDMTask = async (id: number) => {
    try {
      const updated = await automationService.retryDMTask(id);
      setDMTasks((items) => items.map((item) => (item.id === id ? updated : item)));
      pushToast(t("autoDm.toast.retry"));
    } catch (error) {
      pushToast(apiErrorCode(error) === "automation_module_paused" ? t("automation.pausedNotice.toast") : apiErrorMessage(error) || t("autoDm.errors.retry"));
    }
  };

  const deleteDMTask = async (id: number) => {
    const confirmed = await confirm({
      description: t("autoDm.delete.confirm"),
      confirmLabel: t("autoDm.delete.action"),
      tone: "destructive",
    });
    if (!confirmed) return;
    try {
      await automationService.deleteDMTask(id);
      setDMTasks((items) => items.filter((item) => item.id !== id));
      pushToast(t("autoDm.toast.deleted"));
      void automationService.dmOverview().then(setDMOverview).catch(() => undefined);
    } catch (error) {
      pushToast(apiErrorMessage(error) || t("autoDm.errors.delete"));
    }
  };

  const applyDMVariant = async (taskID: number, message: string) => {
    try {
      const updated = await automationService.updateDMTaskMessage(taskID, message);
      setDMTasks((items) => items.map((item) => (item.id === taskID ? updated : item)));
      pushToast(t("autoDm.variants.applied"));
    } catch (error) {
      pushToast(apiErrorMessage(error) || t("autoDm.errors.updateMessage"));
    }
  };

  const setDMRecipientRule = async (id: number, status: AutoDMRecipientRuleApi["status"], segment?: AutoDMRecipientSegment) => {
    try {
      const rule = await automationService.setDMRecipientRule(id, status, t("autoDm.reason.ruleUpdated"), segment);
      setDMRecipients((items) => [rule, ...items.filter((item) => item.id !== rule.id)]);
      if (status === "blocked" || status === "unsubscribed") {
        const dmTaskData = await automationService.dmTasks();
        setDMTasks(dmTaskData.items);
      }
      pushToast(t("autoDm.toast.ruleUpdated"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoDm.errors.rule") : t("autoDm.errors.rule"));
    }
  };

  const updateDMRecipientRule = async (id: number, status: AutoDMRecipientRuleApi["status"], segment?: AutoDMRecipientSegment) => {
    try {
      const rule = await automationService.updateDMRecipientRule(id, status, t("autoDm.reason.ruleUpdated"), segment);
      setDMRecipients((items) => items.map((item) => (item.id === id ? rule : item)));
      pushToast(t("autoDm.toast.ruleUpdated"));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoDm.errors.rule") : t("autoDm.errors.rule"));
    }
  };

  const importDMRecipients = async () => {
    try {
      const data = await automationService.importDMRecipients(dmImportCSV);
      setDMRecipients((items) => [...data.items, ...items.filter((item) => !data.items.some((next) => next.id === item.id))]);
      if (data.batch) {
        setDMImports((items) => [data.batch!, ...items.filter((item) => item.id !== data.batch!.id)]);
      }
      setDMImportCSV("");
      setDMImportPreview(null);
      pushToast(t("autoDm.toast.imported", { imported: data.imported, skipped: data.skipped }));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoDm.errors.import") : t("autoDm.errors.import"));
    }
  };

  const appendDMRecipientToImport = () => {
    const recipientID = dmImportUserID.trim();
    if (!/^\d+$/.test(recipientID)) {
      pushToast(t("autoDm.importBuilder.invalidUserID"));
      return;
    }
    const username = dmImportUsername.trim().replace(/^@/, "");
    const nextRow = [recipientID, username, dmImportSegment].map(csvCell).join(",");
    setDMImportCSV((current) => {
      const trimmed = current.trim();
      return trimmed ? `${trimmed}\n${nextRow}` : nextRow;
    });
    setDMImportPreview(null);
    setDMImportUserID("");
    setDMImportUsername("");
  };

  const fillDMImportTemplate = () => {
    setDMImportCSV("recipient_user_id,username,segment\n1234567890,alice,lead\n2345678901,bob,partner\n3456789012,carol,community");
    setDMImportPreview(null);
  };

  const clearDMImportDraft = () => {
    setDMImportCSV("");
    setDMImportPreview(null);
  };

  const previewDMImport = async () => {
    setDMImportPreviewLoading(true);
    try {
      const data = await automationService.previewDMRecipientImport(dmImportCSV);
      setDMImportPreview(data);
      pushToast(t("autoDm.toast.importPreview", { willImport: data.will_import, skipped: data.skipped }));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoDm.errors.importPreview") : t("autoDm.errors.importPreview"));
    } finally {
      setDMImportPreviewLoading(false);
    }
  };

  const taskStatusClass = (status: AutoDMTaskApi["status"]) => {
    if (status === "review") return "border-[#f6d96b]/25 bg-[#f6d96b]/10 text-[#f6d96b]";
    if (status === "approved" || status === "sent") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#8ff0c3]";
    if (status === "failed" || status === "blocked") return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
    return "border-[#2f3336] bg-[#16181c] text-[#b6bec5]";
  };

  const recipientStatusClass = (status: AutoDMRecipientRuleApi["status"]) => {
    if (status === "allowlisted") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#8ff0c3]";
    if (status === "blocked") return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
    return "border-[#f6d96b]/25 bg-[#f6d96b]/10 text-[#f6d96b]";
  };

  return (
    <div className="space-y-4 md:space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-[#1d9bf0]">{t("autoDm.page.badge")}</p>
          <h2 className="text-title mt-2">{t("autoDm.page.title")}</h2>
          <p className="text-subtitle mt-2">{t("autoDm.page.subtitle")}</p>
        </div>
        <Link href="/automations">
          <Button variant="outline">
            <ArrowLeft className="size-4" />
            {t("autoDm.page.back")}
          </Button>
        </Link>
      </div>
      {loading ? (
        <Card className="bg-[#0f1419]">
          <CardHeader title={t("autoDm.loading.title")} description={t("autoDm.loading.description")} />
        </Card>
      ) : (
        <>
          <AutomationModulePausedNotice type="dm" onEnabledChange={setModuleEnabled} />
          <AutoDMRunSummary
            account={dmAccount}
            authorizationReady={dmAuthorizationReady}
            moduleEnabled={moduleEnabled}
            overview={dmOverview}
            reviewCount={reviewCount}
            allowlistedCount={allowlistedCount}
            riskCount={riskCount}
            repliedCount={repliedCount}
            onReconnect={() => void reconnectXAccount()}
            authRefreshing={authRefreshing}
          />
          <Card className={dmAuthorizationReady ? "border-[#00ba7c]/25 bg-[#00ba7c]/10" : "border-amber-300/20 bg-amber-500/10"}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {dmAuthorizationReady ? <CheckCircle2 className="size-5 text-[#7ee0b5]" /> : <AlertTriangle className="size-5 text-amber-100" />}
                  <p className="text-sm font-semibold text-white">{t("autoDm.auth.title")}</p>
                </div>
                <p className="mt-2 text-sm leading-6 text-[#b6bec5]">
                  {dmAccount
                    ? t(dmAuthorizationReady ? "autoDm.auth.readyDescription" : "autoDm.auth.missingDescription", { account: `@${dmAccount.username || dmAccount.id}` })
                    : t("autoDm.auth.noAccountDescription")}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {requiredDMScopeList.map((scope) => {
                    const ok = dmScopes.has(scope);
                    return (
                      <span key={scope} className={`rounded-full border px-2.5 py-1 text-xs ${ok ? "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#8ff0c3]" : "border-amber-300/25 bg-amber-500/10 text-amber-100"}`}>
                        {scope}
                      </span>
                    );
                  })}
                </div>
                {!dmAuthorizationReady && missingDMScopeList.length > 0 ? (
                  <p className="mt-2 text-xs leading-5 text-amber-100/80">{t("autoDm.auth.missingScopes", { scopes: missingDMScopeList.join(", ") })}</p>
                ) : null}
              </div>
              <Button onClick={() => void reconnectXAccount()} variant={dmAuthorizationReady ? "outline" : "default"} disabled={authRefreshing}>
                {authRefreshing ? <RefreshCw className="size-4 animate-spin" /> : <PlugZap className="size-4" />}
                {authRefreshing ? t("autoDm.auth.refreshing") : t(dmAuthorizationReady ? "autoDm.auth.reconnectAnyway" : "autoDm.auth.reconnect")}
              </Button>
            </div>
          </Card>
          {dmOverview ? <AutoDMQuotaCard overview={dmOverview} timeZone={timeZone} /> : null}
          {dmOverview?.segment_metrics?.length ? <AutoDMSegmentAnalytics metrics={dmOverview.segment_metrics} /> : null}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <div id="auto-dm-review">
            <Card className="min-w-0 bg-[#0f1419]">
              <CardHeader
                title={t("automation.dmReview.title")}
                description={t("automation.dmReview.description")}
                right={
                  <Button variant="outline" size="sm" onClick={() => void load()}>
                    <RefreshCw className="size-3.5" />
                    {t("autoDm.actions.refresh")}
                  </Button>
                }
              />
              {modulePaused ? (
                <p className="mx-5 mb-3 rounded-xl border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-100/80 md:mx-6">
                  {modulePausedActionTip}
                </p>
              ) : null}
              <div className="mb-4 flex flex-wrap gap-2 px-5 md:px-6">
                {[
                  ["all", t("autoDm.taskFilter.all"), dmTasks.length],
                  ["review", t("autoDm.taskFilter.review"), reviewCount],
                  ["approved", t("autoDm.taskFilter.approved"), dmTasks.filter((task) => task.status === "approved").length],
                  ["sent", t("autoDm.taskFilter.sent"), dmTasks.filter((task) => task.status === "sent").length],
                  ["replied", t("autoDm.taskFilter.replied"), repliedCount],
                  ["risk", t("autoDm.taskFilter.risk"), riskCount],
                ].map(([key, label, count]) => {
                  const active = dmTaskFilter === key;
                  return (
                    <button
                      key={String(key)}
                      type="button"
                      onClick={() => setDMTaskFilter(key as AutoDMTaskFilter)}
                      className={`rounded-full border px-3 py-1.5 text-xs transition ${active ? "border-[#1d9bf0] bg-[#1d9bf0]/15 text-[#8ecdf8]" : "border-[#2f3336] bg-black text-[#b6bec5] hover:border-[#536471]"}`}
                    >
                      {label} {count}
                    </button>
                  );
                })}
              </div>
              <div className="space-y-3">
                {dmTasks.length === 0 ? (
                  <div className="rounded-2xl border border-[#2f3336] bg-black px-4 py-8 text-center">
                    <Inbox className="mx-auto size-8 text-[#71767b]" />
                    <p className="mt-3 text-sm font-medium text-white">{t("automation.dmReview.empty")}</p>
                    <p className="mt-1 text-xs text-[#71767b]">{t("autoDm.empty.reviewHint")}</p>
                  </div>
                ) : filteredDMTasks.length === 0 ? (
                  <div className="rounded-2xl border border-[#2f3336] bg-black px-4 py-8 text-center">
                    <Inbox className="mx-auto size-8 text-[#71767b]" />
                    <p className="mt-3 text-sm font-medium text-white">{t("autoDm.empty.filteredTitle")}</p>
                    <p className="mt-1 text-xs text-[#71767b]">{t("autoDm.empty.filteredHint")}</p>
                  </div>
                ) : (
                  filteredDMTasks.slice(0, 12).map((task) => {
                    const canAct = task.status === "review";
                    const canRetry = task.status === "failed" && task.retryable && (task.attempt_count ?? 0) < 3;
                    return (
                      <div key={task.id} className="rounded-2xl border border-[#2f3336] bg-black p-4 transition-colors hover:bg-[#080a0c]">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate font-semibold text-white">{task.account_handle || "—"}</p>
                              <span className={`rounded-full border px-2.5 py-1 text-xs ${taskStatusClass(task.status)}`}>
                                {t(`autoDm.taskStatus.${task.status}`)}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#71767b]">
                              <span>
                                {t("automation.dmReview.recipient")}: {task.recipient_username || task.recipient_user_id || "—"}
                              </span>
                              <span>
                                {t("automation.dmReview.attempts")}: {task.attempt_count ?? 0}
                              </span>
                              {task.generated_at ? (
                                <span>
                                  {t("autoDm.task.generatedAt")}: {formatDateTime(task.generated_at, timeZone)}
                                </span>
                              ) : null}
                              {task.sent_at ? (
                                <span>
                                  {t("autoDm.task.sentAt")}: {formatDateTime(task.sent_at, timeZone)}
                                </span>
                              ) : null}
                              {task.last_inbound_scan_at ? (
                                <span>
                                  {t("autoDm.task.lastInboundScanAt")}: {formatDateTime(task.last_inbound_scan_at, timeZone)}
                                </span>
                              ) : null}
                            </div>
                            {task.inbound_reply_at ? (
                              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-3 py-2 text-xs text-[#8ff0c3]">
                                <MessageCircleReply className="size-4" />
                                <span className="font-semibold">{t("autoDm.task.replied")}</span>
                                <span>{formatDateTime(task.inbound_reply_at, timeZone)}</span>
                              </div>
                            ) : null}
                            <p className="break-words rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3 text-sm leading-relaxed text-[#e7e9ea]">
                              {task.message_preview || "—"}
                            </p>
                            {task.generation_reason || task.message_variants?.length ? (
                              <AutoDMGenerationInsight task={task} onApplyVariant={applyDMVariant} />
                            ) : null}
                            {task.failure_reason ? (
                              <p className="break-words rounded-2xl border border-[#f6d96b]/20 bg-[#f6d96b]/10 px-3 py-2 text-xs leading-5 text-[#f6d96b]">
                                {task.failure_reason}
                              </p>
                            ) : null}
                            {task.diagnostics && task.diagnostics.length > 0 ? (
                              <AutoDMTaskDiagnostics items={task.diagnostics} />
                            ) : null}
                          </div>
                          <div className="flex min-w-0 flex-wrap justify-start gap-2 lg:max-w-[260px] lg:justify-end">
                            {canAct ? <Button size="sm" onClick={() => approveDMTask(task.id)} disabled={modulePaused} title={modulePausedActionTip}>{t("automation.dmReview.approve")}</Button> : null}
                            {canRetry ? <Button size="sm" onClick={() => retryDMTask(task.id)} disabled={modulePaused} title={modulePausedActionTip}>{t("automation.dmReview.retry")}</Button> : null}
                            {canAct || canRetry ? <Button size="sm" variant="outline" onClick={() => blockDMTask(task.id)}>{t("automation.dmReview.block")}</Button> : null}
                            {task.status !== "sent" ? <Button size="sm" variant="destructive" onClick={() => deleteDMTask(task.id)}>{t("autoDm.delete.action")}</Button> : null}
                            {task.recipient_user_id ? (
                              <>
                                <Button size="sm" variant="outline" onClick={() => setDMRecipientRule(task.id, "allowlisted")}>{t("automation.dmReview.allowlist")}</Button>
                                <Button size="sm" variant="outline" onClick={() => setDMRecipientRule(task.id, "blocked")}>{t("automation.dmReview.blacklist")}</Button>
                                <Button size="sm" variant="outline" onClick={() => setDMRecipientRule(task.id, "unsubscribed")}>{t("automation.dmReview.unsubscribe")}</Button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
            </div>

            <div className="space-y-4">
              <Card className="bg-[#0f1419]">
                <CardHeader title={t("automation.dmReview.rules")} description={t("autoDm.rules.description")} />
                <div className="mb-4 grid gap-2">
                  <input
                    value={recipientSearch}
                    onChange={(event) => setRecipientSearch(event.target.value)}
                    placeholder={t("autoDm.rules.searchPlaceholder")}
                    className="w-full rounded-xl border border-[#2f3336] bg-black px-3 py-2 text-sm text-white outline-none placeholder:text-[#71767b] focus:border-[#1d9bf0]/60"
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <select
                      value={recipientStatusFilter}
                      onChange={(event) => setRecipientStatusFilter(event.target.value as AutoDMRecipientStatusFilter)}
                      className="w-full rounded-xl border border-[#2f3336] bg-black px-3 py-2 text-sm text-white outline-none focus:border-[#1d9bf0]/60"
                    >
                      <option value="all">{t("autoDm.rules.allStatuses")}</option>
                      <option value="allowlisted">{t("autoDm.recipientStatus.allowlisted")}</option>
                      <option value="blocked">{t("autoDm.recipientStatus.blocked")}</option>
                      <option value="unsubscribed">{t("autoDm.recipientStatus.unsubscribed")}</option>
                    </select>
                    <select
                      value={recipientSegmentFilter}
                      onChange={(event) => setRecipientSegmentFilter(event.target.value as AutoDMRecipientSegmentFilter)}
                      className="w-full rounded-xl border border-[#2f3336] bg-black px-3 py-2 text-sm text-white outline-none focus:border-[#1d9bf0]/60"
                    >
                      <option value="all">{t("autoDm.rules.allSegments")}</option>
                      {dmRecipientSegments.map((segment) => (
                        <option key={segment} value={segment}>{t(`autoDm.segment.${segment}`)}</option>
                      ))}
                    </select>
                  </div>
                  <p className="text-xs leading-5 text-[#71767b]">
                    {t("autoDm.rules.showing", { shown: Math.min(filteredDMRecipients.length, 20), total: filteredDMRecipients.length })}
                  </p>
                </div>
                <div className="space-y-2">
                  {dmRecipients.length === 0 ? (
                    <div className="rounded-2xl border border-[#2f3336] bg-black px-4 py-8 text-center">
                      <UserCheck className="mx-auto size-8 text-[#71767b]" />
                      <p className="mt-3 text-sm font-medium text-white">{t("automation.dmReview.emptyRules")}</p>
                      <p className="mt-1 text-xs text-[#71767b]">{t("autoDm.empty.rulesHint")}</p>
                    </div>
                  ) : filteredDMRecipients.length === 0 ? (
                    <div className="rounded-2xl border border-[#2f3336] bg-black px-4 py-8 text-center">
                      <UserCheck className="mx-auto size-8 text-[#71767b]" />
                      <p className="mt-3 text-sm font-medium text-white">{t("autoDm.rules.filteredEmptyTitle")}</p>
                      <p className="mt-1 text-xs text-[#71767b]">{t("autoDm.rules.filteredEmptyDescription")}</p>
                    </div>
                  ) : (
                    filteredDMRecipients.slice(0, 20).map((rule) => (
                      <div key={rule.id} className="rounded-2xl border border-[#2f3336] bg-black p-3">
                        <div className="space-y-3">
                          <div className="min-w-0">
                            <p className="break-all text-sm font-semibold text-white">{rule.recipient_username || rule.recipient_user_id}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span className={`rounded-full border px-2.5 py-1 text-xs ${recipientStatusClass(rule.status)}`}>
                                {t(`autoDm.recipientStatus.${rule.status}`)}
                              </span>
                              <span className="rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-2.5 py-1 text-xs text-[#8ecdf8]">
                                {t(`autoDm.segment.${rule.recipient_segment || "lead"}`)}
                              </span>
                              {rule.updated_at ? <span className="text-xs text-[#71767b]">{formatDateTime(rule.updated_at, timeZone)}</span> : null}
                            </div>
                          </div>
                          <label className="block">
                            <span className="text-xs text-[#71767b]">{t("autoDm.segment.label")}</span>
                            <select
                              value={(rule.recipient_segment as AutoDMRecipientSegment) || "lead"}
                              onChange={(event) => updateDMRecipientRule(rule.id, rule.status, event.target.value as AutoDMRecipientSegment)}
                              className="mt-1 w-full rounded-xl border border-[#2f3336] bg-black px-3 py-2 text-sm text-white outline-none focus:border-[#1d9bf0]/60"
                            >
                              {dmRecipientSegments.map((segment) => (
                                <option key={segment} value={segment}>{t(`autoDm.segment.${segment}`)}</option>
                              ))}
                            </select>
                            <span className="mt-1 block text-xs leading-5 text-[#71767b]">{t(`autoDm.segmentStrategy.${rule.recipient_segment || "lead"}`)}</span>
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => updateDMRecipientRule(rule.id, "allowlisted")} disabled={rule.status === "allowlisted"}>{t("automation.dmReview.allowlist")}</Button>
                            <Button size="sm" variant="outline" onClick={() => updateDMRecipientRule(rule.id, "blocked")} disabled={rule.status === "blocked"}>{t("automation.dmReview.blacklist")}</Button>
                            <Button size="sm" variant="outline" onClick={() => updateDMRecipientRule(rule.id, "unsubscribed")} disabled={rule.status === "unsubscribed"}>{t("automation.dmReview.unsubscribe")}</Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              <details id="auto-dm-import" className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-5 md:p-6">
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">{t("automation.dmReview.import")}</p>
                      <p className="mt-1 text-sm leading-6 text-[#71767b]">{t("autoDm.import.description")}</p>
                    </div>
                    <span className="inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-[#2f3336] bg-black px-3 text-xs font-semibold text-[#8ecdf8]">
                      {t("autoDm.import.open")}
                    </span>
                  </div>
                </summary>
                <div className="mt-4 border-t border-[#2f3336] pt-4">
                <div className="space-y-4">
                  <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
                    <div className="mb-3 flex items-start gap-3">
                      <UserCheck className="mt-0.5 size-5 shrink-0 text-[#1d9bf0]" />
                      <div>
                        <p className="text-sm font-semibold text-white">{t("autoDm.importBuilder.title")}</p>
                        <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("autoDm.importBuilder.description")}</p>
                      </div>
                    </div>
                    <div className="grid gap-3">
                      <label className="block space-y-2">
                        <span className="text-xs text-[#71767b]">{t("autoDm.importBuilder.userID")}</span>
                        <input
                          value={dmImportUserID}
                          onChange={(event) => setDMImportUserID(event.target.value)}
                          placeholder={t("autoDm.importBuilder.userIDPlaceholder")}
                          className="w-full rounded-xl border border-[#2f3336] bg-[#080a0c] px-3 py-2 text-sm text-white outline-none placeholder:text-[#71767b] focus:border-[#1d9bf0]/60"
                        />
                      </label>
                      <label className="block space-y-2">
                        <span className="text-xs text-[#71767b]">{t("autoDm.importBuilder.username")}</span>
                        <input
                          value={dmImportUsername}
                          onChange={(event) => setDMImportUsername(event.target.value)}
                          placeholder={t("autoDm.importBuilder.usernamePlaceholder")}
                          className="w-full rounded-xl border border-[#2f3336] bg-[#080a0c] px-3 py-2 text-sm text-white outline-none placeholder:text-[#71767b] focus:border-[#1d9bf0]/60"
                        />
                      </label>
                      <label className="block space-y-2">
                        <span className="text-xs text-[#71767b]">{t("autoDm.segment.label")}</span>
                        <select
                          value={dmImportSegment}
                          onChange={(event) => setDMImportSegment(event.target.value as AutoDMRecipientSegment)}
                          className="w-full rounded-xl border border-[#2f3336] bg-[#080a0c] px-3 py-2 text-sm text-white outline-none focus:border-[#1d9bf0]/60"
                        >
                          {dmRecipientSegments.map((segment) => (
                            <option key={segment} value={segment}>{t(`autoDm.segment.${segment}`)}</option>
                          ))}
                        </select>
                        <span className="block text-xs leading-5 text-[#71767b]">{t(`autoDm.segmentStrategy.${dmImportSegment}`)}</span>
                      </label>
                    </div>
                    <Button className="mt-3 w-full" size="sm" onClick={appendDMRecipientToImport} disabled={!dmImportUserID.trim()}>
                      {t("autoDm.importBuilder.add")}
                    </Button>
                  </div>

                  <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
                    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex items-start gap-3">
                        <FileText className="mt-0.5 size-5 shrink-0 text-[#8ecdf8]" />
                        <div>
                          <p className="text-sm font-semibold text-white">{t("autoDm.importBulk.title")}</p>
                          <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("autoDm.importBulk.description")}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={fillDMImportTemplate}>{t("autoDm.importBulk.template")}</Button>
                        <Button size="sm" variant="outline" onClick={clearDMImportDraft} disabled={!dmImportCSV.trim()}>{t("autoDm.importBulk.clear")}</Button>
                      </div>
                    </div>
                    <textarea
                      value={dmImportCSV}
                      onChange={(event) => {
                        setDMImportCSV(event.target.value);
                        setDMImportPreview(null);
                      }}
                      rows={6}
                      placeholder={t("autoDm.import.segmentPlaceholder")}
                      className="min-h-40 w-full resize-y rounded-2xl border border-[#2f3336] bg-[#080a0c] px-3 py-3 text-sm leading-6 text-white outline-none placeholder:text-[#71767b] focus:border-[#1d9bf0]/60"
                    />
                    <p className="mt-2 text-xs leading-5 text-[#71767b]">{t("autoDm.importBulk.formatHint")}</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-[#71767b]">
                    <Upload className="size-3.5" />
                    <span>{t("autoDm.import.history", { count: dmImports.length })}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={previewDMImport} disabled={!dmImportCSV.trim() || dmImportPreviewLoading}>
                      {dmImportPreviewLoading ? t("autoDm.import.previewing") : t("autoDm.import.preview")}
                    </Button>
                    <Button size="sm" onClick={importDMRecipients} disabled={!dmImportCSV.trim() || (dmImportPreview !== null && dmImportPreview.will_import === 0 && dmImportPreview.existing === 0)}>
                      {t("automation.dmReview.importCta")}
                    </Button>
                  </div>
                </div>
                {dmImportPreview ? <AutoDMImportPreview preview={dmImportPreview} /> : null}
                {dmImports.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {dmImports.slice(0, 3).map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-[#2f3336] bg-black px-3 py-2 text-xs">
                        <span className="min-w-0 truncate text-[#71767b]">{formatDateTime(item.imported_at, timeZone)}</span>
                        <span className="shrink-0 text-white">
                          {t("autoDm.import.batchStats", { imported: item.imported, skipped: item.skipped })}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}
                </div>
              </details>
              <Card className="bg-[#0f1419] p-4">
                <div className="flex items-start gap-3">
                  <Clock3 className="mt-0.5 size-5 shrink-0 text-[#1d9bf0]" />
                  <div>
                    <p className="text-sm font-semibold text-white">{t("autoDm.guidance.title")}</p>
                    <p className="mt-1 text-sm leading-6 text-[#71767b]">{t("autoDm.guidance.description")}</p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AutoDMRunSummary({
  account,
  authorizationReady,
  moduleEnabled,
  overview,
  reviewCount,
  allowlistedCount,
  riskCount,
  repliedCount,
  onReconnect,
  authRefreshing,
}: {
  account: AccountListItem | null;
  authorizationReady: boolean;
  moduleEnabled: boolean | null;
  overview: AutoDMOverviewData | null;
  reviewCount: number;
  allowlistedCount: number;
  riskCount: number;
  repliedCount: number;
  onReconnect: () => void;
  authRefreshing: boolean;
}) {
  const { t } = useT();
  const moduleReady = moduleEnabled !== false;
  const monthlyRemaining = overview && overview.monthly_limit > 0 ? overview.monthly_remaining : 0;
  const quotaLabel = overview
    ? overview.monthly_limit > 0
      ? `${monthlyRemaining.toLocaleString()} / ${overview.monthly_limit.toLocaleString()}`
      : t("autoDm.quota.none")
    : t("autoDm.overview.unknown");
  const meters: Array<{
    icon: LucideIcon;
    label: string;
    value: string;
    helper: string;
    tone: AutoDMMeterTone;
  }> = [
    {
      icon: ShieldCheck,
      label: t("autoDm.overview.authorization"),
      value: account ? `@${account.username || account.id}` : t("autoDm.overview.noAccount"),
      helper: authorizationReady ? t("autoDm.overview.authorizationReady") : t("autoDm.overview.authorizationBlocked"),
      tone: authorizationReady ? "green" : "yellow",
    },
    {
      icon: PlugZap,
      label: t("autoDm.overview.module"),
      value: moduleReady ? t("autoDm.overview.moduleEnabled") : t("autoDm.overview.modulePaused"),
      helper: t("autoDm.overview.moduleHelper"),
      tone: moduleReady ? "green" : "yellow",
    },
    {
      icon: UserCheck,
      label: t("autoDm.overview.allowlist"),
      value: allowlistedCount.toLocaleString(),
      helper: t("autoDm.overview.allowlistHelper"),
      tone: allowlistedCount > 0 ? "blue" : "yellow",
    },
    {
      icon: Inbox,
      label: t("autoDm.overview.review"),
      value: reviewCount.toLocaleString(),
      helper: t("autoDm.overview.reviewHelper", { replies: repliedCount }),
      tone: reviewCount > 0 ? "yellow" : "blue",
    },
    {
      icon: UserX,
      label: t("autoDm.overview.risk"),
      value: riskCount.toLocaleString(),
      helper: riskCount > 0 ? t("autoDm.overview.riskBlocked") : t("autoDm.overview.riskClear"),
      tone: riskCount > 0 ? "red" : "green",
    },
    {
      icon: Clock3,
      label: t("autoDm.overview.quota"),
      value: quotaLabel,
      helper: overview?.quota_exhausted ? t("autoDm.quota.exhausted") : t("autoDm.overview.quotaHelper"),
      tone: overview?.quota_exhausted ? "red" : "violet",
    },
  ];

  return (
    <Card className="border-[#1d9bf0]/20 bg-[#06111d]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#d7ebff]">{t("autoDm.overview.title")}</p>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-[#8b98a5]">{t("autoDm.overview.description")}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <a href="#auto-dm-review" className="inline-flex h-8 items-center justify-center rounded-full bg-[#1d9bf0] px-3 text-xs font-semibold text-white hover:bg-[#1a8cd8]">
            {t("autoDm.overview.reviewCta")}
          </a>
          <a href="#auto-dm-import" className="inline-flex h-8 items-center justify-center rounded-full border border-[#2f3336] px-3 text-xs font-semibold text-[#e7e9ea] hover:bg-[#16181c]">
            {t("autoDm.overview.importCta")}
          </a>
          <Button size="sm" variant={authorizationReady ? "outline" : "default"} onClick={onReconnect} disabled={authRefreshing}>
            {authRefreshing ? <RefreshCw className="size-3.5 animate-spin" /> : <PlugZap className="size-3.5" />}
            {authRefreshing ? t("autoDm.auth.refreshing") : t("autoDm.auth.reconnect")}
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {meters.map((meter) => (
          <AutoDMMeter key={meter.label} {...meter} />
        ))}
      </div>
    </Card>
  );
}

function AutoDMMeter({
  icon: Icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  helper: string;
  tone: AutoDMMeterTone;
}) {
  const toneClass =
    tone === "green"
      ? "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]"
      : tone === "yellow"
        ? "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]"
        : tone === "red"
          ? "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff9aa2]"
          : tone === "violet"
            ? "border-[#7856ff]/30 bg-[#7856ff]/12 text-[#b8a7ff]"
            : "border-[#1d9bf0]/35 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  return (
    <div className="min-w-0 rounded-2xl border border-[#1d9bf0]/15 bg-black/35 p-3">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className={`inline-flex size-8 shrink-0 items-center justify-center rounded-xl border ${toneClass}`}>
          <Icon className="size-3.5" />
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-[#71767b]">{label}</span>
          <span className="mt-1 block truncate text-sm font-semibold text-[#e7e9ea]">{value}</span>
          <span className="mt-1 block line-clamp-2 text-xs leading-5 text-[#8b98a5]">{helper}</span>
        </span>
      </div>
    </div>
  );
}

function AutoDMQuotaCard({ overview, timeZone }: { overview: AutoDMOverviewData; timeZone: string }) {
  const { t } = useT();
  const monthlyLimitText = overview.monthly_limit > 0 ? overview.monthly_limit.toLocaleString() : t("autoDm.quota.none");
  const monthlyRemainingText = overview.monthly_limit > 0 ? overview.monthly_remaining.toLocaleString() : "0";
  const dailyLimitText = overview.daily_soft_limit > 0 ? overview.daily_soft_limit.toLocaleString() : t("autoDm.quota.none");
  const dailyRemainingText = overview.daily_soft_limit > 0 ? overview.daily_remaining.toLocaleString() : "0";
  return (
    <details className={`rounded-2xl border p-5 md:p-6 ${overview.quota_exhausted ? "border-amber-300/20 bg-amber-500/10" : "border-[#2f3336] bg-[#0f1419]"}`}>
      <summary className="flex cursor-pointer list-none flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-semibold text-white">{t("autoDm.quota.title")}</p>
          <p className="mt-1 text-sm leading-6 text-[#71767b]">
            {overview.period_end
              ? t("autoDm.quota.descriptionWithReset", { reset: formatDateTime(overview.period_end, timeZone) })
              : t("autoDm.quota.description")}
          </p>
        </div>
        {overview.upgrade_required ? (
          <Link href="/billing">
            <Button size="sm">{t("autoDm.quota.upgrade")}</Button>
          </Link>
        ) : null}
      </summary>
      <div className="mt-4 grid gap-3 border-t border-[#2f3336] pt-4 md:grid-cols-3">
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-xs text-[#71767b]">{t("autoDm.quota.monthly")}</p>
          <p className="mt-2 text-2xl font-semibold text-white">
            {overview.monthly_used.toLocaleString()} / {monthlyLimitText}
          </p>
          <p className="mt-1 text-xs text-[#71767b]">{t("autoDm.quota.remaining", { count: monthlyRemainingText })}</p>
        </div>
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-xs text-[#71767b]">{t("autoDm.quota.dailySoft")}</p>
          <p className="mt-2 text-2xl font-semibold text-white">
            {overview.daily_used.toLocaleString()} / {dailyLimitText}
          </p>
          <p className="mt-1 text-xs text-[#71767b]">{t("autoDm.quota.remaining", { count: dailyRemainingText })}</p>
        </div>
        <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
          <p className="text-xs text-[#71767b]">{t("autoDm.quota.plan")}</p>
          <p className="mt-2 text-2xl font-semibold text-white">{overview.plan_code || "free_trial"}</p>
          <p className="mt-1 text-xs text-[#71767b]">{overview.quota_exhausted ? t("autoDm.quota.exhausted") : t("autoDm.quota.ready")}</p>
        </div>
      </div>
    </details>
  );
}

function AutoDMSegmentAnalytics({ metrics }: { metrics: NonNullable<AutoDMOverviewData["segment_metrics"]> }) {
  const { t } = useT();
  const visible = metrics.filter((item) => item.sent + item.failed + item.blocked + item.review + item.unsubscribed > 0);
  const rows = visible.length > 0 ? visible : metrics;
  return (
    <details className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-5 md:p-6">
      <summary className="flex cursor-pointer list-none flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-white">{t("autoDm.segmentAnalytics.title")}</p>
          <p className="mt-1 text-sm leading-6 text-[#71767b]">{t("autoDm.segmentAnalytics.description")}</p>
        </div>
        <span className="text-xs text-[#71767b]">{t("autoDm.segmentAnalytics.replyNote")}</span>
      </summary>
      <div className="mt-4 grid gap-3 border-t border-[#2f3336] pt-4 lg:grid-cols-5">
        {rows.map((item) => (
          <div key={String(item.segment)} className="rounded-2xl border border-[#2f3336] bg-black p-3">
            <p className="text-sm font-semibold text-white">{t(`autoDm.segment.${item.segment || "lead"}`)}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <MetricMini label={t("autoDm.segmentAnalytics.sent")} value={item.sent} />
              <MetricMini label={t("autoDm.segmentAnalytics.failed")} value={item.failed} tone={item.failed > 0 ? "danger" : "default"} />
              <MetricMini label={t("autoDm.segmentAnalytics.unsubscribed")} value={item.unsubscribed} tone={item.unsubscribed > 0 ? "warn" : "default"} />
              <MetricMini label={t("autoDm.segmentAnalytics.successRate")} value={`${item.send_success_rate_pct}%`} />
              <MetricMini label={t("autoDm.segmentAnalytics.replies")} value={item.replies} />
            </div>
            <div className="mt-2 rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2 text-xs">
              <p className="text-[#71767b]">{t("autoDm.segmentAnalytics.replyRate")}</p>
              <p className="mt-1 font-semibold text-white">{item.reply_tracking_available ? `${item.reply_rate_pct}%` : t("autoDm.segmentAnalytics.notTracked")}</p>
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function MetricMini({ label, value, tone = "default" }: { label: string; value: number | string; tone?: "default" | "warn" | "danger" }) {
  const color = tone === "danger" ? "text-[#ff8a91]" : tone === "warn" ? "text-[#f6d96b]" : "text-white";
  return (
    <div className="rounded-xl border border-[#2f3336] bg-[#0f1419] px-2.5 py-2">
      <p className="text-[#71767b]">{label}</p>
      <p className={`mt-1 font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function AutoDMTaskDiagnostics({ items }: { items: AutoDMDiagnosticApi[] }) {
  const { t } = useT();
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3">
      <p className="text-xs font-semibold text-white">{t("autoDm.diagnostics.title")}</p>
      <div className="mt-2 space-y-2">
        {items.map((item) => (
          <div key={`${item.key}-${item.status}`} className="flex items-start gap-2 text-xs leading-5">
            <span className={`mt-1 size-2 shrink-0 rounded-full ${diagnosticDotClass(item.severity)}`} />
            <div className="min-w-0">
              <p className="font-medium text-[#e7e9ea]">{diagnosticLabel(item.key, item.label, t)}</p>
              {item.detail ? <p className="break-words text-[#71767b]">{diagnosticDetail(item.key, item.detail, t)}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AutoDMGenerationInsight({
  task,
  onApplyVariant,
}: {
  task: AutoDMTaskApi;
  onApplyVariant: (taskID: number, message: string) => void;
}) {
  const { t } = useT();
  const variants = task.message_variants || [];
  return (
    <div className="rounded-2xl border border-[#1d9bf0]/20 bg-[#1d9bf0]/10 p-3">
      <p className="text-xs font-semibold text-[#8ecdf8]">{t("autoDm.generation.title")}</p>
      {task.generation_reason ? (
        <p className="mt-1 text-xs leading-5 text-[#b6bec5]">{task.generation_reason}</p>
      ) : (
        <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("autoDm.generation.defaultReason")}</p>
      )}
      {variants.length > 0 ? (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium text-[#8ecdf8]">{t("autoDm.variants.title")}</p>
          {variants.map((variant) => {
            const selected = variant.message === task.message_preview;
            return (
              <button
                key={`${variant.type}-${variant.message}`}
                type="button"
                onClick={() => onApplyVariant(task.id, variant.message)}
                disabled={selected || !["review", "failed"].includes(task.status)}
                className={`w-full rounded-xl border px-3 py-2 text-left text-xs transition-colors ${
                  selected
                    ? "border-[#00ba7c]/30 bg-[#00ba7c]/10 text-[#d8fff0]"
                    : "border-[#2f3336] bg-black text-[#b6bec5] hover:border-[#1d9bf0]/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                }`}
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-white">{variant.label || variant.type}</span>
                  {selected ? <span className="text-[#7ee0b5]">{t("autoDm.variants.current")}</span> : <span className="text-[#1d9bf0]">{t("autoDm.variants.apply")}</span>}
                </span>
                <span className="mt-1 block break-words leading-5">{variant.message}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function AutoDMImportPreview({ preview }: { preview: AutoDMRecipientImportPreviewData }) {
  const { t } = useT();
  const rows = preview.rows || [];
  return (
    <div className="mt-3 rounded-2xl border border-[#2f3336] bg-black p-3">
      <div className="grid gap-2 sm:grid-cols-4">
        {[
          [t("autoDm.importPreview.willImport"), preview.will_import],
          [t("autoDm.importPreview.existing"), preview.existing],
          [t("autoDm.importPreview.duplicates"), preview.duplicates_in_file],
          [t("autoDm.importPreview.skipped"), preview.skipped],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2">
            <p className="text-xs text-[#71767b]">{label}</p>
            <p className="mt-1 text-lg font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>
      {rows.length > 0 ? (
        <div className="mt-3 max-h-56 space-y-2 overflow-auto pr-1">
          {rows.slice(0, 20).map((row) => (
            <div key={`${row.line}-${row.recipient_user_id || row.status}`} className="rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-white">
                  {t("autoDm.importPreview.line", { line: row.line })} · {row.recipient_username || row.recipient_user_id || "—"}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-2 py-0.5 text-[#8ecdf8]">
                    {t(`autoDm.segment.${row.recipient_segment || "lead"}`)}
                  </span>
                  <span className={`rounded-full border px-2 py-0.5 ${importPreviewStatusClass(row.status)}`}>
                    {t(`autoDm.importPreview.status.${row.status}`)}
                  </span>
                </span>
              </div>
              {row.message ? <p className="mt-1 break-words text-[#71767b]">{row.message}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
      {(preview.errors || []).length > 0 ? (
        <p className="mt-3 break-words rounded-xl border border-[#f4212e]/20 bg-[#f4212e]/10 px-3 py-2 text-xs leading-5 text-[#ff8a91]">
          {(preview.errors || []).slice(0, 3).join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

function diagnosticDotClass(severity: string) {
  if (severity === "success") return "bg-[#00ba7c]";
  if (severity === "error") return "bg-[#f4212e]";
  if (severity === "warning") return "bg-[#f6d96b]";
  return "bg-[#1d9bf0]";
}

function importPreviewStatusClass(status: string) {
  if (status === "ready") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#8ff0c3]";
  if (status === "existing") return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
  if (status === "duplicate_in_file") return "border-[#f6d96b]/25 bg-[#f6d96b]/10 text-[#f6d96b]";
  return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
}

function diagnosticLabel(key: string, fallback: string, t: ReturnType<typeof useT>["t"]) {
  const known = new Set(["recipient", "send_state", "recipient_rule", "oauth_scope", "x_token", "recipient_lookup", "x_account", "capability", "failure", "sent", "blocked"]);
  return known.has(key) ? t(`autoDm.diagnostics.${key}`) : fallback;
}

function diagnosticDetail(key: string, fallback: string, t: ReturnType<typeof useT>["t"]) {
  const known = new Set(["recipient_rule", "oauth_scope", "x_token", "recipient_lookup", "x_account", "failure", "sent", "blocked"]);
  return known.has(key) ? t(`autoDm.diagnostics.detail.${key}`, { detail: fallback }) : fallback;
}
