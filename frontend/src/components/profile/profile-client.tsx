"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";

import { useToast } from "@/components/providers/toast-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import {
  broadcastDataSynced,
  broadcastPageRefreshComplete,
  subscribePageRefreshRequest,
} from "@/lib/app-page-refresh";
import { authService, type MeData } from "@/services/auth.service";

type LoadState = "loading" | "ready" | "error";

function maskWallet(address: string) {
  const a = address.trim();
  if (a.length <= 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function ProfileClient() {
  const { t } = useT();
  const { pushToast } = useToast();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [me, setMe] = useState<MeData | null>(null);

  const fetchMe = useCallback(
    async (options?: { quiet?: boolean }) => {
      const quiet = Boolean(options?.quiet);
      if (!quiet) {
        setLoadState("loading");
      }
      setErrorMessage(null);
      try {
        const data = await authService.me();
        setMe(data);
        setLoadState("ready");
        broadcastDataSynced(Date.now());
      } catch (error) {
        const msg = axios.isAxiosError(error)
          ? error.response?.data?.message || t("profile.loadError")
          : t("profile.loadError");
        if (!quiet) {
          setErrorMessage(msg);
          setLoadState("error");
        } else {
          pushToast(msg);
        }
      }
    },
    [pushToast, t]
  );

  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  useEffect(() => {
    return subscribePageRefreshRequest(() => {
      void (async () => {
        try {
          await fetchMe({ quiet: true });
        } finally {
          broadcastPageRefreshComplete();
        }
      })();
    });
  }, [fetchMe]);

  if (loadState === "loading") {
    return (
      <Card>
        <CardHeader title={t("profile.loadingTitle")} description={t("profile.loadingDesc")} />
      </Card>
    );
  }

  if (loadState === "error" || !me) {
    return (
      <Card>
        <CardHeader title={t("profile.errorTitle")} description={errorMessage || t("profile.loadError")} />
        <div className="flex justify-end">
          <Button onClick={() => void fetchMe()}>{t("profile.retry")}</Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4 md:space-y-5">
      <div>
        <h2 className="text-title">{t("profile.page.title")}</h2>
        <p className="text-subtitle mt-2">{t("profile.page.subtitle")}</p>
      </div>

      <Card>
        <CardHeader title={t("profile.section.account")} description={t("profile.section.accountDesc")} />
        <dl className="grid gap-3 text-sm md:grid-cols-2">
          <div>
            <dt className="text-white/50">{t("profile.field.id")}</dt>
            <dd className="mt-0.5 font-medium text-white">{me.id}</dd>
          </div>
          <div>
            <dt className="text-white/50">{t("profile.field.email")}</dt>
            <dd className="mt-0.5 font-medium text-white">{me.email || "—"}</dd>
          </div>
          <div>
            <dt className="text-white/50">{t("profile.field.name")}</dt>
            <dd className="mt-0.5 font-medium text-white">{me.name || "—"}</dd>
          </div>
          <div>
            <dt className="text-white/50">{t("profile.field.status")}</dt>
            <dd className="mt-0.5 font-medium text-white">{me.status || "—"}</dd>
          </div>
          <div className="md:col-span-2">
            <dt className="text-white/50">{t("profile.field.wallet")}</dt>
            <dd className="mt-0.5 font-mono text-sm text-white">
              {me.wallet_address ? maskWallet(me.wallet_address) : t("profile.wallet.unbound")}
            </dd>
            {!me.wallet_address ? (
              <p className="mt-2 text-xs text-white/55">{t("profile.wallet.hint")}</p>
            ) : null}
          </div>
        </dl>
      </Card>

      <Card>
        <CardHeader title={t("profile.section.shortcuts")} description={t("profile.section.shortcutsDesc")} />
        <div className="flex flex-wrap gap-2">
          <Link href="/accounts" className={cn(buttonVariants({ variant: "outline" }))}>
            {t("profile.actions.accounts")}
          </Link>
          <Link href="/billing" className={cn(buttonVariants({ variant: "outline" }))}>
            {t("profile.actions.billing")}
          </Link>
          <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }))}>
            {t("profile.actions.dashboard")}
          </Link>
        </div>
      </Card>
    </div>
  );
}
