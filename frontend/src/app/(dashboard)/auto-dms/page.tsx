"use client";

import axios from "axios";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";
import {
  automationService,
  type AutoDMRecipientImportApi,
  type AutoDMRecipientRuleApi,
  type AutoDMTaskApi,
} from "@/services/automation.service";

export default function AutoDMsPage() {
  const { t } = useT();
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [dmTasks, setDMTasks] = useState<AutoDMTaskApi[]>([]);
  const [dmRecipients, setDMRecipients] = useState<AutoDMRecipientRuleApi[]>([]);
  const [dmImports, setDMImports] = useState<AutoDMRecipientImportApi[]>([]);
  const [dmImportCSV, setDMImportCSV] = useState("");

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
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoDm.errors.approve") : t("autoDm.errors.approve"));
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
      pushToast(axios.isAxiosError(error) ? error.response?.data?.message || t("autoDm.errors.retry") : t("autoDm.errors.retry"));
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

  return (
    <div className="space-y-4 md:space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-blue-100">{t("autoDm.page.badge")}</p>
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
        <Card>
          <CardHeader title={t("autoDm.loading.title")} description={t("autoDm.loading.description")} />
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="min-w-0">
            <CardHeader title={t("automation.dmReview.title")} description={t("automation.dmReview.description")} />
            <div className="space-y-3">
              {dmTasks.length === 0 ? (
                <p className="rounded-md border border-white/8 bg-white/[0.03] px-3 py-5 text-sm text-white/55">{t("automation.dmReview.empty")}</p>
              ) : (
                dmTasks.slice(0, 12).map((task) => {
                  const canAct = task.status === "review";
                  const canRetry = task.status === "failed" && task.retryable && (task.attempt_count ?? 0) < 3;
                  return (
                    <div key={task.id} className="rounded-xl border border-white/10 bg-white/[0.035] p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1">
                          <p className="font-semibold text-white">{task.account_handle || "—"}</p>
                          <p className="text-xs text-white/50">
                            {t("automation.dmReview.recipient")}: {task.recipient_username || task.recipient_user_id || "—"}
                          </p>
                          <p className="line-clamp-3 break-words text-sm leading-relaxed text-white/75">{task.message_preview || "—"}</p>
                          {task.failure_reason ? <p className="line-clamp-2 text-xs text-amber-100/85">{task.failure_reason}</p> : null}
                        </div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-2">
                          <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/65">{t(`autoDm.taskStatus.${task.status}`)}</span>
                          {canAct ? <Button size="sm" onClick={() => approveDMTask(task.id)}>{t("automation.dmReview.approve")}</Button> : null}
                          {canRetry ? <Button size="sm" onClick={() => retryDMTask(task.id)}>{t("automation.dmReview.retry")}</Button> : null}
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
            <Card>
              <CardHeader title={t("automation.dmReview.rules")} description={t("autoDm.rules.description")} />
              <div className="space-y-2">
                {dmRecipients.length === 0 ? (
                  <p className="rounded-md border border-white/8 bg-white/[0.03] px-3 py-5 text-sm text-white/55">{t("automation.dmReview.emptyRules")}</p>
                ) : (
                  dmRecipients.slice(0, 20).map((rule) => (
                    <div key={rule.id} className="rounded-xl border border-white/10 bg-white/[0.035] p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-all text-sm font-semibold text-white">{rule.recipient_username || rule.recipient_user_id}</p>
                          <p className="mt-1 text-xs text-white/45">{t(`autoDm.recipientStatus.${rule.status}`)}</p>
                        </div>
                        <div className="flex shrink-0 flex-wrap justify-end gap-2">
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

            <Card>
              <CardHeader title={t("automation.dmReview.import")} description={t("autoDm.import.description")} />
              <textarea
                value={dmImportCSV}
                onChange={(event) => setDMImportCSV(event.target.value)}
                rows={5}
                placeholder={t("automation.dmReview.importPlaceholder")}
                className="min-h-28 w-full resize-y rounded-md border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none placeholder:text-white/35"
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-white/45">{t("autoDm.import.history", { count: dmImports.length })}</p>
                <Button size="sm" onClick={importDMRecipients} disabled={!dmImportCSV.trim()}>{t("automation.dmReview.importCta")}</Button>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
