"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import axios from "axios";
import { ArrowUpRight, BadgeCheck, CreditCard, LayoutDashboard, Settings, ShieldCheck, UserRound, Users, Wallet, type LucideIcon } from "lucide-react";

import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
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

function accountInitial(me: MeData) {
  const base = (me.name || me.email || "O").trim();
  return base.slice(0, 1).toUpperCase();
}

function statusLabelKey(status?: string) {
  const normalized = (status || "active").toLowerCase();
  if (normalized === "suspended") return "profile.accountStatus.suspended";
  if (normalized === "disabled") return "profile.accountStatus.disabled";
  if (normalized === "inactive") return "profile.accountStatus.inactive";
  return "profile.accountStatus.active";
}

function roleLabelKey(role?: string) {
  const normalized = (role || "user").toLowerCase();
  if (normalized === "admin") return "profile.accountRole.admin";
  if (normalized === "owner") return "profile.accountRole.owner";
  return "profile.accountRole.user";
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
    <div className="space-y-5 md:space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border border-[#2f3336] bg-black p-5 md:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(29,155,240,0.18),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(120,86,255,0.12),transparent_28%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex size-16 shrink-0 items-center justify-center rounded-full border border-[#2f3336] bg-[#1d9bf0]/12 text-2xl font-bold text-[#8ecdf8]">
              {accountInitial(me)}
            </span>
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#1d9bf0]/30 bg-[#1d9bf0]/10 px-3 py-1 text-xs font-medium text-[#8ecdf8]">
                  <UserRound className="size-3.5" />
                  {t("profile.hero.eyebrow")}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-3 py-1 text-xs font-medium text-[#7ee0b5]">
                  <BadgeCheck className="size-3.5" />
                  {t(statusLabelKey(me.status))}
                </span>
              </div>
              <h2 className="text-2xl font-bold tracking-[-0.02em] text-[#e7e9ea] md:text-3xl">
                {me.name || t("profile.hero.defaultName")}
              </h2>
              <p className="mt-2 max-w-2xl break-words text-sm leading-relaxed text-[#71767b] md:text-[15px]">
                {me.email || t("profile.hero.noEmail")}
              </p>
            </div>
          </div>
          <Link href="/settings" className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#2f3336] px-4 py-2 text-sm font-semibold text-[#e7e9ea] transition hover:bg-[#16181c] sm:w-auto">
            <Settings className="size-4" />
            {t("profile.actions.settings")}
          </Link>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <Card className="bg-[#0f1419]">
          <CardHeader title={t("profile.section.account")} description={t("profile.section.accountDesc")} />
          <dl className="grid gap-3 text-sm md:grid-cols-2">
            <ProfileField label={t("profile.field.id")} value={String(me.id)} />
            <ProfileField label={t("profile.field.role")} value={t(roleLabelKey(me.role))} />
            <ProfileField label={t("profile.field.email")} value={me.email || "—"} />
            <ProfileField label={t("profile.field.name")} value={me.name || "—"} />
            <ProfileField label={t("profile.field.status")} value={t(statusLabelKey(me.status))} />
            <ProfileField
              label={t("profile.field.wallet")}
              value={me.wallet_address ? maskWallet(me.wallet_address) : t("profile.wallet.unbound")}
              mono={Boolean(me.wallet_address)}
            />
          </dl>
          {!me.wallet_address ? (
            <p className="mt-4 rounded-2xl border border-[#2f3336] bg-black p-3 text-xs leading-relaxed text-[#71767b]">
              {t("profile.wallet.hint")}
            </p>
          ) : null}
        </Card>

        <Card className="bg-[#0f1419]">
          <CardHeader title={t("profile.section.shortcuts")} description={t("profile.section.shortcutsDesc")} />
          <div className="grid gap-3">
            <ProfileShortcut href="/dashboard" icon={LayoutDashboard} title={t("profile.actions.dashboard")} description={t("profile.shortcuts.dashboardDesc")} />
            <ProfileShortcut href="/accounts" icon={Users} title={t("profile.actions.accounts")} description={t("profile.shortcuts.accountsDesc")} />
            <ProfileShortcut href="/billing" icon={CreditCard} title={t("profile.actions.billing")} description={t("profile.shortcuts.billingDesc")} />
            <ProfileShortcut href="/settings" icon={Settings} title={t("profile.actions.settings")} description={t("profile.shortcuts.settingsDesc")} />
          </div>
        </Card>
      </div>

      <Card className="bg-[#0f1419]">
        <CardHeader title={t("profile.section.security")} description={t("profile.section.securityDesc")} />
        <div className="grid gap-3 md:grid-cols-3">
          <ProfileSignal icon={ShieldCheck} label={t("profile.security.session")} value={t(statusLabelKey(me.status))} />
          <ProfileSignal icon={Wallet} label={t("profile.security.wallet")} value={me.wallet_address ? t("profile.security.walletBound") : t("profile.wallet.unbound")} />
          <ProfileSignal icon={Settings} label={t("profile.security.preferences")} value={t("profile.security.preferencesHint")} />
        </div>
      </Card>
    </div>
  );
}

function ProfileField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-2xl border border-[#2f3336] bg-black p-4">
      <dt className="text-[#71767b]">{label}</dt>
      <dd className={cn("mt-1 truncate font-medium text-white", mono && "font-mono text-xs")}>{value}</dd>
    </div>
  );
}

function ProfileShortcut({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-2xl border border-[#2f3336] bg-black p-3 transition-colors hover:bg-[#080808]"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#1d9bf0]/10 text-[#1d9bf0]">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[#e7e9ea]">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-[#71767b]">{description}</span>
      </span>
      <ArrowUpRight className="size-4 shrink-0 text-[#71767b] transition-colors group-hover:text-[#1d9bf0]" />
    </Link>
  );
}

function ProfileSignal({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#2f3336] bg-black p-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#00ba7c]/10 text-[#00ba7c]">
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-[#71767b]">{label}</p>
        <p className="truncate text-sm font-medium text-[#e7e9ea]">{value}</p>
      </div>
    </div>
  );
}
