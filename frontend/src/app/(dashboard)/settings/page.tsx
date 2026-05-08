"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import { BadgeCheck, Bell, CreditCard, KeyRound, Languages, ShieldCheck, UserCog, Wallet } from "lucide-react";

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
import { authService, type MeData, type NotificationSettingsData } from "@/services/auth.service";

type LoadState = "loading" | "ready" | "error";

const defaultNotificationSettings: NotificationSettingsData = {
  email_enabled: true,
  in_app_enabled: true,
  automation_failure: true,
  billing_alerts: true,
  review_required: true,
  subscription_alerts: true,
  weekly_summary: false,
};

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
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [me, setMe] = useState<MeData | null>(null);
  const [notifications, setNotifications] = useState<NotificationSettingsData>(defaultNotificationSettings);
  const [savedNotifications, setSavedNotifications] = useState<NotificationSettingsData>(defaultNotificationSettings);
  const [name, setName] = useState("");
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [changingPassword, setChangingPassword] = useState(false);

  const fetchMe = useCallback(
    async (options?: { quiet?: boolean }) => {
      const quiet = Boolean(options?.quiet);
      if (!quiet) setLoadState("loading");
      setErrorMessage(null);
      try {
        const [data, notificationData] = await Promise.all([
          authService.me(),
          authService.notificationSettings(),
        ]);
        setMe(data);
        setName(data.name || "");
        setNotifications(notificationData);
        setSavedNotifications(notificationData);
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

  const notificationsDirty = useMemo(() => {
    return JSON.stringify(notifications) !== JSON.stringify(savedNotifications);
  }, [notifications, savedNotifications]);

  const setNotificationValue = (key: keyof NotificationSettingsData, value: boolean) => {
    setNotifications((current) => ({ ...current, [key]: value }));
  };

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

  const saveNotifications = async () => {
    setSavingNotifications(true);
    try {
      const data = await authService.updateNotificationSettings(notifications);
      setNotifications(data);
      setSavedNotifications(data);
      pushToast(t("settings.notifications.saved"));
      broadcastDataSynced(Date.now());
    } catch (error) {
      const msg = axios.isAxiosError(error)
        ? error.response?.data?.message || t("settings.notifications.saveFailed")
        : t("settings.notifications.saveFailed");
      pushToast(msg);
    } finally {
      setSavingNotifications(false);
    }
  };

  const changePassword = async () => {
    const currentPassword = passwordForm.currentPassword;
    const newPassword = passwordForm.newPassword;
    const confirmPassword = passwordForm.confirmPassword;

    if (!currentPassword || !newPassword || !confirmPassword) {
      pushToast(t("settings.security.passwordRequired"));
      return;
    }
    if (newPassword.length < 8) {
      pushToast(t("settings.security.passwordTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      pushToast(t("settings.security.passwordMismatch"));
      return;
    }
    if (currentPassword === newPassword) {
      pushToast(t("settings.security.passwordSame"));
      return;
    }

    setChangingPassword(true);
    try {
      await authService.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      pushToast(t("settings.security.passwordChanged"));
      signOut();
      router.replace("/login");
    } catch (error) {
      const msg = axios.isAxiosError(error)
        ? error.response?.data?.message || t("settings.security.passwordChangeFailed")
        : t("settings.security.passwordChangeFailed");
      pushToast(msg);
    } finally {
      setChangingPassword(false);
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
            <div className="space-y-3 rounded-md border border-white/8 bg-white/[0.03] px-3 py-3">
              <div className="flex items-start gap-2">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-white/50" />
                <div>
                  <p className="text-sm font-medium text-white/78">{t("settings.security.password")}</p>
                  <p className="mt-1 text-xs leading-5 text-white/45">
                    {t("settings.security.passwordDescription")}
                  </p>
                </div>
              </div>
              <div className="grid gap-2">
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={passwordForm.currentPassword}
                  placeholder={t("settings.security.currentPassword")}
                  onChange={(event) =>
                    setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))
                  }
                />
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.newPassword}
                  placeholder={t("settings.security.newPassword")}
                  onChange={(event) =>
                    setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))
                  }
                />
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.confirmPassword}
                  placeholder={t("settings.security.confirmPassword")}
                  onChange={(event) =>
                    setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))
                  }
                />
              </div>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" disabled={changingPassword} onClick={() => void changePassword()}>
                  {changingPassword ? t("settings.security.changingPassword") : t("settings.security.changePassword")}
                </Button>
              </div>
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
            title={t("settings.notifications.title")}
            description={t("settings.notifications.description")}
            right={<Bell className="h-5 w-5 text-amber-200" />}
          />
          <div className="space-y-3">
            <NotificationToggle
              label={t("settings.notifications.email")}
              checked={notifications.email_enabled}
              onChange={(value) => setNotificationValue("email_enabled", value)}
            />
            <NotificationToggle
              label={t("settings.notifications.inApp")}
              checked={notifications.in_app_enabled}
              onChange={(value) => setNotificationValue("in_app_enabled", value)}
            />
            <div className="grid gap-2 pt-1 md:grid-cols-2">
              <NotificationToggle
                label={t("settings.notifications.automationFailure")}
                checked={notifications.automation_failure}
                onChange={(value) => setNotificationValue("automation_failure", value)}
              />
              <NotificationToggle
                label={t("settings.notifications.billingAlerts")}
                checked={notifications.billing_alerts}
                onChange={(value) => setNotificationValue("billing_alerts", value)}
              />
              <NotificationToggle
                label={t("settings.notifications.reviewRequired")}
                checked={notifications.review_required}
                onChange={(value) => setNotificationValue("review_required", value)}
              />
              <NotificationToggle
                label={t("settings.notifications.subscriptionAlerts")}
                checked={notifications.subscription_alerts}
                onChange={(value) => setNotificationValue("subscription_alerts", value)}
              />
              <NotificationToggle
                label={t("settings.notifications.weeklySummary")}
                checked={notifications.weekly_summary}
                onChange={(value) => setNotificationValue("weekly_summary", value)}
              />
            </div>
            <div className="flex justify-end">
              <Button disabled={!notificationsDirty || savingNotifications} onClick={() => void saveNotifications()}>
                {savingNotifications ? t("settings.notifications.saving") : t("settings.notifications.save")}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4">
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

function NotificationToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 rounded-md border border-white/8 bg-white/[0.03] px-3 py-2">
      <span className="text-sm font-medium text-white/75">{label}</span>
      <input
        type="checkbox"
        className="h-5 w-5 accent-cyan-300"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
