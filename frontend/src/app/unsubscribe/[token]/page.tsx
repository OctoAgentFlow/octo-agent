"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import axios from "axios";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";
import { automationService, type AutoDMPreferenceData } from "@/services/automation.service";

type LoadState = "loading" | "ready" | "done" | "error";

export default function UnsubscribePage() {
  const { t } = useT();
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [state, setState] = useState<LoadState>("loading");
  const [preference, setPreference] = useState<AutoDMPreferenceData | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    automationService
      .getDMPreference(token)
      .then((data) => {
        if (cancelled) return;
        setPreference(data);
        setState(data.status === "unsubscribed" ? "done" : "ready");
      })
      .catch(() => {
        if (cancelled) return;
        setMessage(t("unsubscribe.errors.invalid"));
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [t, token]);

  const unsubscribe = async () => {
    try {
      const data = await automationService.unsubscribeDM(token);
      setPreference(data);
      setState("done");
      setMessage("");
    } catch (error) {
      setMessage(axios.isAxiosError(error) ? error.response?.data?.message || t("unsubscribe.errors.failed") : t("unsubscribe.errors.failed"));
      setState("error");
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-10">
      <Card className="w-full max-w-lg">
        <CardHeader
          title={t("unsubscribe.title")}
          description={preference?.recipient_username ? t("unsubscribe.descriptionWithUser", { username: preference.recipient_username }) : t("unsubscribe.description")}
        />
        {state === "loading" ? <p className="text-sm text-white/60">{t("common.loading")}</p> : null}
        {state === "ready" ? (
          <div className="space-y-4">
            <p className="text-sm text-white/68">{t("unsubscribe.readyDescription")}</p>
            <Button onClick={unsubscribe}>{t("unsubscribe.action")}</Button>
          </div>
        ) : null}
        {state === "done" ? (
          <p className="rounded-md border border-emerald-300/20 bg-emerald-300/10 px-3 py-3 text-sm text-emerald-100">
            {t("unsubscribe.done")}
          </p>
        ) : null}
        {state === "error" ? <p className="text-sm text-amber-100">{message}</p> : null}
      </Card>
    </main>
  );
}
