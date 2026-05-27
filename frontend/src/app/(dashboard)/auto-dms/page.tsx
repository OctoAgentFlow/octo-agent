"use client";

import axios from "axios";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Inbox,
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
import {
  automationService,
  type AutoDMRecipientImportApi,
  type AutoDMRecipientRuleApi,
  type AutoDMTaskApi,
} from "@/services/automation.service";

export default function AutoDMsPage() {
  const { t } = useT();
  const timeZone = usePreferredTimeZone();
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [dmTasks, setDMTasks] = useState<AutoDMTaskApi[]>([]);
  const [dmRecipients, setDMRecipients] = useState<AutoDMRecipientRuleApi[]>([]);
  const [dmImports, setDMImports] = useState<AutoDMRecipientImportApi[]>([]);
  const [dmImportCSV, setDMImportCSV] = useState("");
  const [moduleEnabled, setModuleEnabled] = useState<boolean | null>(null);

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
      const [dmTaskData, dmRecipientData, dmImportData] = await Promise.all([
        automationService.dmTasks(),
        automationService.dmRecipients(),
        automationService.dmRecipientImports(),
      ]);
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

  const setDMRecipientRule = async (id: number, status: AutoDMRecipientRuleApi["status"]) => {
    try {
      const rule = await automationService.setDMRecipientRule(id, status, t("autoDm.reason.ruleUpdated"));
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

  const updateDMRecipientRule = async (id: number, status: AutoDMRecipientRuleApi["status"]) => {
    try {
      const rule = await automationService.updateDMRecipientRule(id, status, t("autoDm.reason.ruleUpdated"));
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
      pushToast(t("autoDm.toast.imported", { imported: data.imported, skipped: data.skipped }));
    } catch (error) {
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoDm.errors.import") : t("autoDm.errors.import"));
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
                            {task.failure_reason ? (
                              <p className="break-words rounded-2xl border border-[#f6d96b]/20 bg-[#f6d96b]/10 px-3 py-2 text-xs leading-5 text-[#f6d96b]">
                                {task.failure_reason}
                              </p>
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
                              {rule.updated_at ? <span className="text-xs text-[#71767b]">{formatDateTime(rule.updated_at, timeZone)}</span> : null}
                            </div>
                          </div>
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
                  onChange={(event) => setDMImportCSV(event.target.value)}
                  rows={5}
                  placeholder={t("automation.dmReview.importPlaceholder")}
                  className="min-h-32 w-full resize-y rounded-2xl border border-[#2f3336] bg-black px-3 py-3 text-sm leading-6 text-white outline-none placeholder:text-[#71767b] focus:border-[#1d9bf0]/60"
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-[#71767b]">
                    <Upload className="size-3.5" />
                    <span>{t("autoDm.import.history", { count: dmImports.length })}</span>
                  </div>
                  <Button size="sm" onClick={importDMRecipients} disabled={!dmImportCSV.trim()}>{t("automation.dmReview.importCta")}</Button>
                </div>
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
