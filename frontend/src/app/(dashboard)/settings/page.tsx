"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import { BadgeCheck, CreditCard, Languages, ShieldCheck, UserCog, Wallet } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/providers/toast-provider";
import { languages } from "@/i18n/types";
import { useT } from "@/i18n/use-t";
import {
  broadcastDataSynced,
  broadcastPageRefreshComplete,
  subscribePageRefreshRequest,
} from "@/lib/app-page-refresh";
import { signOut } from "@/lib/auth-session";
import { cn } from "@/lib/utils";
import { authService, type MeData } from "@/services/auth.service";

type LoadState = "loading" | "ready" | "error";

function maskWallet(address?: string) {
  const a = address?.trim() ?? "";
  if (!a) return "—";
  if (a.length <= 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function SettingsPage() {
  const router = useRouter();
  const { lang, setLang, t } = useT();
  const { pushToast } = useToast();
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [me, setMe] = useState<MeData | null>(null);
  const [name, setName] = useState("");

  const fetchMe = useCallback(
    async (options?: { quiet?: boolean }) => {
      const quiet = Boolean(options?.quiet);
      if (!quiet) setLoadState("loading");
      setErrorMessage(null);
      try {
        const data = await authService.me();
        setMe(data);
        setName(data.name || "");
        setLoadState("ready");
        broadcastDataSynced(Date.now());
      } catch (error) {
        const msg = axios.isAxiosError(error)
          ? error.response?.data?.message || t("settings.loadError")
          : t("settings.loadError");
        if (quiet) {
          pushToast(msg);
        } else {
          setErrorMessage(msg);
          setLoadState("error");
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

  const dirty = useMemo(() => {
    return name.trim() !== (me?.name ?? "").trim();
  }, [me?.name, name]);

  const saveProfile = async () => {
    const nextName = name.trim();
    if (!nextName) {
      pushToast(t("settings.profile.nameRequired"));
      return;
    }
    setSaving(true);
    try {
      const data = await authService.updateMe({ name: nextName });
      setMe(data);
      setName(data.name || "");
      pushToast(t("settings.profile.saved"));
      broadcastDataSynced(Date.now());
    } catch (error) {
      const msg = axios.isAxiosError(error)
        ? error.response?.data?.message || t("settings.profile.saveFailed")
        : t("settings.profile.saveFailed");
      pushToast(msg);
    } finally {
      setSaving(false);
    }
  };

  const logout = () => {
    signOut();
    router.replace("/login");
  };

  if (loadState === "loading") {
    return (
      <Card>
        <CardHeader title={t("settings.loadingTitle")} description={t("settings.loadingDesc")} />
      </Card>
    );
  }

  if (loadState === "error" || !me) {
    return (
      <Card>
        <CardHeader title={t("settings.errorTitle")} description={errorMessage || t("settings.loadError")} />
        <div className="flex justify-end">
          <Button onClick={() => void fetchMe()}>{t("settings.retry")}</Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4 md:space-y-5">
      <section>
        <h2 className="text-title">{t("settings.page.title")}</h2>
        <p className="text-subtitle mt-2">{t("settings.page.subtitle")}</p>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card>
          <CardHeader
            title={t("settings.profile.title")}
            description={t("settings.profile.description")}
            right={<UserCog className="h-5 w-5 text-cyan-200" />}
          />
          <div className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm text-white/60">{t("settings.profile.displayName")}</span>
              <Input value={name} maxLength={64} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="grid gap-3 text-sm md:grid-cols-2">
              <div>
                <p className="text-white/50">{t("settings.profile.email")}</p>
                <p className="mt-0.5 font-medium text-white">{me.email || "—"}</p>
              </div>
              <div>
                <p className="text-white/50">{t("settings.profile.status")}</p>
                <p className="mt-0.5 font-medium text-white">{me.status || "—"}</p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button disabled={!dirty || saving} onClick={() => void saveProfile()}>
                {saving ? t("settings.profile.saving") : t("settings.profile.save")}
              </Button>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title={t("settings.security.title")}
            description={t("settings.security.description")}
            right={<ShieldCheck className="h-5 w-5 text-emerald-200" />}
          />
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-md border border-white/8 bg-white/[0.03] px-3 py-3">
              <span className="flex items-center gap-2 text-sm text-white/68">
                <Wallet className="h-4 w-4 text-white/50" />
                {t("settings.security.wallet")}
              </span>
              <span className="font-mono text-xs text-white">{maskWallet(me.wallet_address)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border border-white/8 bg-white/[0.03] px-3 py-3">
              <span className="flex items-center gap-2 text-sm text-white/68">
                <BadgeCheck className="h-4 w-4 text-white/50" />
                {t("settings.security.session")}
              </span>
              <Button variant="outline" size="sm" onClick={logout}>
                {t("common.logout")}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <CardHeader
            title={t("settings.language.title")}
            description={t("settings.language.description")}
            right={<Languages className="h-5 w-5 text-blue-200" />}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            {languages.map((item) => {
              const active = item.code === lang;
              return (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => {
                    setLang(item.code);
                    pushToast(t("settings.language.saved"));
                  }}
                  className={cn(
                    "rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    active
                      ? "border-cyan-200/40 bg-cyan-300/10 text-white"
                      : "border-white/10 bg-white/[0.03] text-white/70 hover:bg-white/[0.06]"
                  )}
                >
                  <span className="block font-medium">{item.label}</span>
                  <span className="text-xs text-white/45">{item.code}</span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader
            title={t("settings.shortcuts.title")}
            description={t("settings.shortcuts.description")}
            right={<CreditCard className="h-5 w-5 text-violet-200" />}
          />
          <div className="flex flex-wrap gap-2">
            <Link href="/billing" className={cn(buttonVariants({ variant: "outline" }))}>
              {t("settings.shortcuts.billing")}
            </Link>
            <Link href="/accounts" className={cn(buttonVariants({ variant: "outline" }))}>
              {t("settings.shortcuts.accounts")}
            </Link>
            <Link href="/profile" className={cn(buttonVariants({ variant: "outline" }))}>
              {t("settings.shortcuts.profile")}
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
