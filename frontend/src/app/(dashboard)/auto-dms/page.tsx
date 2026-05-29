"use client";

import axios from "axios";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Inbox,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  Upload,
  UserCheck,
  UserX,
} from "lucide-react";

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

export default function AutoDMsPage() {
  const { t } = useT();
  const timeZone = usePreferredTimeZone();
  const { pushToast } = useToast();
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

  const dmAccount = accounts.find((account) => account.status === "connected") ?? accounts[0] ?? null;
  const dmScopes = new Set((dmAccount?.oauth_scopes || []).map((scope) => scope.toLowerCase()));
  const missingDMScopeList = dmAccount ? requiredDMScopeList.filter((scope) => !dmScopes.has(scope)) : requiredDMScopeList;
  const dmAuthorizationReady = Boolean(dmAccount && dmAccount.status === "connected" && missingDMScopeList.length === 0);
  const reviewCount = dmTasks.filter((task) => task.status === "review").length;
  const approvedCount = dmTasks.filter((task) => task.status === "approved" || task.status === "sent").length;
  const riskCount = dmTasks.filter((task) => task.status === "failed" || task.status === "blocked").length;
  const allowlistedCount = dmRecipients.filter((rule) => rule.status === "allowlisted").length;
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

  const reconnectXAccount = async () => {
    try {
      const data = await accountService.startXOAuth();
      if (!data.auth_url) throw new Error(t("accounts.toast.oauthUrlMissing"));
      const features = ["popup=yes", "width=560", "height=720", "left=80", "top=80"].join(",");
      const popup = window.open(data.auth_url, "octo_x_oauth", features);
      if (!popup) throw new Error(t("accounts.toast.popupBlocked"));
      popup.focus();
    } catch (error) {
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
          {dmOverview ? <AutoDMQuotaCard overview={dmOverview} timeZone={timeZone} /> : null}
          {dmOverview?.segment_metrics?.length ? <AutoDMSegmentAnalytics metrics={dmOverview.segment_metrics} /> : null}
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
              <Button onClick={() => void reconnectXAccount()} variant={dmAuthorizationReady ? "outline" : "default"}>
                <PlugZap className="size-4" />
                {t(dmAuthorizationReady ? "autoDm.auth.reconnectAnyway" : "autoDm.auth.reconnect")}
              </Button>
            </div>
          </Card>

          <AutoDMSetupGuide
            hasRecipients={dmRecipients.length > 0}
            hasReviewTasks={dmTasks.length > 0}
            allowlistedCount={allowlistedCount}
            riskCount={riskCount}
          />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { icon: Inbox, label: t("autoDm.stats.review"), value: reviewCount, tone: "text-[#f6d96b]" },
              { icon: CheckCircle2, label: t("autoDm.stats.approved"), value: approvedCount, tone: "text-[#00ba7c]" },
              { icon: ShieldCheck, label: t("autoDm.stats.allowlisted"), value: allowlistedCount, tone: "text-[#1d9bf0]" },
              { icon: UserX, label: t("autoDm.stats.risk"), value: riskCount, tone: "text-[#f4212e]" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.label} className="bg-[#0f1419] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-[#71767b]">{item.label}</p>
                      <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
                    </div>
                    <div className="flex size-10 items-center justify-center rounded-full border border-[#2f3336] bg-black">
                      <Icon className={`size-5 ${item.tone}`} />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
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
              <div className="space-y-3">
                {dmTasks.length === 0 ? (
                  <div className="rounded-2xl border border-[#2f3336] bg-black px-4 py-8 text-center">
                    <Inbox className="mx-auto size-8 text-[#71767b]" />
                    <p className="mt-3 text-sm font-medium text-white">{t("automation.dmReview.empty")}</p>
                    <p className="mt-1 text-xs text-[#71767b]">{t("autoDm.empty.reviewHint")}</p>
                  </div>
                ) : (
                  dmTasks.slice(0, 12).map((task) => {
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
                            </div>
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

            <div className="space-y-4">
              <Card className="bg-[#0f1419]">
                <CardHeader title={t("automation.dmReview.rules")} description={t("autoDm.rules.description")} />
                <div className="space-y-2">
                  {dmRecipients.length === 0 ? (
                    <div className="rounded-2xl border border-[#2f3336] bg-black px-4 py-8 text-center">
                      <UserCheck className="mx-auto size-8 text-[#71767b]" />
                      <p className="mt-3 text-sm font-medium text-white">{t("automation.dmReview.emptyRules")}</p>
                      <p className="mt-1 text-xs text-[#71767b]">{t("autoDm.empty.rulesHint")}</p>
                    </div>
                  ) : (
                    dmRecipients.slice(0, 20).map((rule) => (
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

              <Card className="bg-[#0f1419]">
                <CardHeader title={t("automation.dmReview.import")} description={t("autoDm.import.description")} />
                <textarea
                  value={dmImportCSV}
                  onChange={(event) => {
                    setDMImportCSV(event.target.value);
                    setDMImportPreview(null);
                  }}
                  rows={5}
                  placeholder={t("autoDm.import.segmentPlaceholder")}
                  className="min-h-32 w-full resize-y rounded-2xl border border-[#2f3336] bg-black px-3 py-3 text-sm leading-6 text-white outline-none placeholder:text-[#71767b] focus:border-[#1d9bf0]/60"
                />
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
              </Card>
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

function AutoDMQuotaCard({ overview, timeZone }: { overview: AutoDMOverviewData; timeZone: string }) {
  const { t } = useT();
  const monthlyLimitText = overview.monthly_limit > 0 ? overview.monthly_limit.toLocaleString() : t("autoDm.quota.none");
  const monthlyRemainingText = overview.monthly_limit > 0 ? overview.monthly_remaining.toLocaleString() : "0";
  const dailyLimitText = overview.daily_soft_limit > 0 ? overview.daily_soft_limit.toLocaleString() : t("autoDm.quota.none");
  const dailyRemainingText = overview.daily_soft_limit > 0 ? overview.daily_remaining.toLocaleString() : "0";
  return (
    <Card className={overview.quota_exhausted ? "border-amber-300/20 bg-amber-500/10" : "bg-[#0f1419]"}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
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
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
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
    </Card>
  );
}

function AutoDMSegmentAnalytics({ metrics }: { metrics: NonNullable<AutoDMOverviewData["segment_metrics"]> }) {
  const { t } = useT();
  const visible = metrics.filter((item) => item.sent + item.failed + item.blocked + item.review + item.unsubscribed > 0);
  const rows = visible.length > 0 ? visible : metrics;
  return (
    <Card className="bg-[#0f1419]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-white">{t("autoDm.segmentAnalytics.title")}</p>
          <p className="mt-1 text-sm leading-6 text-[#71767b]">{t("autoDm.segmentAnalytics.description")}</p>
        </div>
        <span className="text-xs text-[#71767b]">{t("autoDm.segmentAnalytics.replyNote")}</span>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-5">
        {rows.map((item) => (
          <div key={String(item.segment)} className="rounded-2xl border border-[#2f3336] bg-black p-3">
            <p className="text-sm font-semibold text-white">{t(`autoDm.segment.${item.segment || "lead"}`)}</p>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <MetricMini label={t("autoDm.segmentAnalytics.sent")} value={item.sent} />
              <MetricMini label={t("autoDm.segmentAnalytics.failed")} value={item.failed} tone={item.failed > 0 ? "danger" : "default"} />
              <MetricMini label={t("autoDm.segmentAnalytics.unsubscribed")} value={item.unsubscribed} tone={item.unsubscribed > 0 ? "warn" : "default"} />
              <MetricMini label={t("autoDm.segmentAnalytics.successRate")} value={`${item.send_success_rate_pct}%`} />
            </div>
            <div className="mt-2 rounded-xl border border-[#2f3336] bg-[#0f1419] px-3 py-2 text-xs">
              <p className="text-[#71767b]">{t("autoDm.segmentAnalytics.replyRate")}</p>
              <p className="mt-1 font-semibold text-white">{item.reply_tracking_available ? `${item.reply_rate_pct}%` : t("autoDm.segmentAnalytics.notTracked")}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
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

function AutoDMSetupGuide({
  hasRecipients,
  hasReviewTasks,
  allowlistedCount,
  riskCount,
}: {
  hasRecipients: boolean;
  hasReviewTasks: boolean;
  allowlistedCount: number;
  riskCount: number;
}) {
  const { t } = useT();
  const checks = [
    {
      done: hasRecipients,
      title: t("autoDm.setup.recipients.title"),
      description: t("autoDm.setup.recipients.description"),
      icon: Upload,
    },
    {
      done: hasReviewTasks,
      title: t("autoDm.setup.review.title"),
      description: t("autoDm.setup.review.description"),
      icon: Inbox,
    },
    {
      done: allowlistedCount > 0,
      title: t("autoDm.setup.rules.title"),
      description: t("autoDm.setup.rules.description", { count: allowlistedCount }),
      icon: UserCheck,
    },
    {
      done: riskCount === 0,
      title: t("autoDm.setup.risk.title"),
      description: t("autoDm.setup.risk.description", { count: riskCount }),
      icon: ShieldCheck,
    },
  ];
  const missingCount = checks.filter((item) => !item.done).length;

  return (
    <Card className={missingCount === 0 ? "border-[#00ba7c]/25 bg-[#00ba7c]/10" : "border-amber-300/20 bg-amber-500/10"}>
      <p className="text-sm font-semibold text-[#e7e9ea]">{missingCount === 0 ? t("autoDm.setup.readyTitle") : t("autoDm.setup.title")}</p>
      <p className="mt-1 text-sm leading-6 text-[#71767b]">{missingCount === 0 ? t("autoDm.setup.readyDescription") : t("autoDm.setup.description")}</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {checks.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="rounded-xl border border-[#2f3336] bg-black p-3">
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full border ${item.done ? "border-[#00ba7c]/30 bg-[#00ba7c]/10 text-[#7ee0b5]" : "border-amber-300/25 bg-amber-500/10 text-amber-100"}`}>
                  {item.done ? <CheckCircle2 className="size-4" /> : <Icon className="size-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-[#e7e9ea]">{item.title}</span>
                  <span className="mt-1 block text-xs leading-5 text-[#71767b]">{item.description}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
