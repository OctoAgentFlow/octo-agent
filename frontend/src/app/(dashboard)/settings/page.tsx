"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import axios from "axios";
import {
  ArrowUpRight,
  BadgeCheck,
  Bell,
  CheckCircle2,
  Clock3,
  CreditCard,
  Globe2,
  KeyRound,
  Languages,
  type LucideIcon,
  Mail,
  Search,
  ShieldCheck,
  UserCog,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
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
import { formatDateTime, setPreferredTimeZone, supportedTimeZones, timeZoneLabel, usePreferredTimeZone } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { authService, type MeData, type NotificationSettingsData } from "@/services/auth.service";

type LoadState = "loading" | "ready" | "error";

type TimeZoneOption = {
  value: string;
  regionKey: string;
  cityKey: string;
  offset: string;
};

const timeZoneOptions: TimeZoneOption[] = supportedTimeZones.map((value) => {
  const [region] = value.split("/");
  return {
    value,
    regionKey: `settings.timezone.region.${region}`,
    cityKey: `settings.timezone.city.${value.replaceAll("/", "_")}`,
    offset: timeZoneOffsetLabel(value),
  };
});

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

function accountInitial(me: MeData) {
  const base = (me.name || me.email || "O").trim();
  return base.slice(0, 1).toUpperCase();
}

function statusLabelKey(status?: string) {
  const normalized = (status || "active").toLowerCase();
  if (normalized === "suspended") return "settings.accountStatus.suspended";
  if (normalized === "disabled") return "settings.accountStatus.disabled";
  if (normalized === "inactive") return "settings.accountStatus.inactive";
  return "settings.accountStatus.active";
}

function roleLabelKey(role?: string) {
  const normalized = (role || "user").toLowerCase();
  if (normalized === "admin") return "settings.accountRole.admin";
  if (normalized === "owner") return "settings.accountRole.owner";
  return "settings.accountRole.user";
}

function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function timeZoneOffsetLabel(timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(new Date());
    return parts.find((part) => part.type === "timeZoneName")?.value?.replace("GMT", "UTC") || "UTC";
  } catch {
    return "UTC";
  }
}

export default function SettingsPage() {
  const router = useRouter();
  const { lang, setLang, t } = useT();
  const preferredTimeZone = usePreferredTimeZone();
  const detectedTimeZone = useMemo(() => browserTimeZone(), []);
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
  const [timeZoneDialogOpen, setTimeZoneDialogOpen] = useState(false);
  const [timeZoneSearch, setTimeZoneSearch] = useState("");

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

  const visibleTimeZones = useMemo(() => {
    const needle = timeZoneSearch.trim().toLowerCase();
    if (!needle) return timeZoneOptions;
    return timeZoneOptions.filter((option) => {
      return [
        option.value,
        option.offset,
        t(option.regionKey),
        t(option.cityKey),
        timeZoneLabel(option.value),
      ].some((value) => value.toLowerCase().includes(needle));
    });
  }, [t, timeZoneSearch]);

  const groupedTimeZones = useMemo(() => {
    const groups: Array<{ regionKey: string; items: TimeZoneOption[] }> = [];
    for (const option of visibleTimeZones) {
      const latest = groups[groups.length - 1];
      if (latest?.regionKey === option.regionKey) {
        latest.items.push(option);
      } else {
        groups.push({ regionKey: option.regionKey, items: [option] });
      }
    }
    return groups;
  }, [visibleTimeZones]);

  const chooseTimeZone = (zone: string) => {
    setPreferredTimeZone(zone);
    setTimeZoneDialogOpen(false);
    setTimeZoneSearch("");
    pushToast(t("settings.timezone.saved"));
  };

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
    <div className="space-y-5 md:space-y-6">
      <section className="relative overflow-hidden rounded-[28px] border border-[#2f3336] bg-black p-5 md:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(29,155,240,0.18),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(0,186,124,0.12),transparent_28%)]" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex size-14 shrink-0 items-center justify-center rounded-full border border-[#2f3336] bg-[#1d9bf0]/12 text-xl font-bold text-[#8ecdf8]">
              {accountInitial(me)}
            </span>
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#1d9bf0]/30 bg-[#1d9bf0]/10 px-3 py-1 text-xs font-medium text-[#8ecdf8]">
                  <UserCog className="size-3.5" />
                  {t("settings.hero.eyebrow")}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-3 py-1 text-xs font-medium text-[#7ee0b5]">
                  <BadgeCheck className="size-3.5" />
                  {t(statusLabelKey(me.status))}
                </span>
              </div>
              <h2 className="text-2xl font-bold tracking-[-0.02em] text-[#e7e9ea] md:text-3xl">
                {t("settings.page.title")}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#71767b] md:text-[15px]">
                {t("settings.page.subtitle")}
              </p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[460px]">
            <AccountPill icon={Mail} label={t("settings.profile.email")} value={me.email || "—"} />
            <AccountPill icon={ShieldCheck} label={t("settings.hero.role")} value={t(roleLabelKey(me.role))} />
            <AccountPill icon={Wallet} label={t("settings.security.wallet")} value={maskWallet(me.wallet_address)} mono />
          </div>
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)]">
        <Card className="bg-[#0f1419]">
          <CardHeader
            title={t("settings.profile.title")}
            description={t("settings.profile.description")}
            right={<UserCog className="h-5 w-5 text-[#1d9bf0]" />}
          />
          <div className="space-y-4">
            <label className="block space-y-2">
              <span className="text-sm text-[#71767b]">{t("settings.profile.displayName")}</span>
              <Input value={name} maxLength={64} onChange={(e) => setName(e.target.value)} />
            </label>
            <div className="grid gap-3 text-sm md:grid-cols-2">
              <InfoRow label={t("settings.profile.email")} value={me.email || "—"} />
              <InfoRow label={t("settings.profile.status")} value={t(statusLabelKey(me.status))} />
            </div>
            <div className="flex justify-end">
              <Button disabled={!dirty || saving} onClick={() => void saveProfile()}>
                {saving ? t("settings.profile.saving") : t("settings.profile.save")}
              </Button>
            </div>
          </div>
        </Card>

        <Card className="bg-[#0f1419]">
          <CardHeader
            title={t("settings.shortcuts.title")}
            description={t("settings.shortcuts.description")}
            right={<CreditCard className="h-5 w-5 text-[#1d9bf0]" />}
          />
          <div className="grid gap-3">
            <ShortcutCard href="/accounts" icon={BadgeCheck} title={t("settings.shortcuts.accounts")} description={t("settings.shortcuts.accountsDesc")} />
            <ShortcutCard href="/billing" icon={CreditCard} title={t("settings.shortcuts.billing")} description={t("settings.shortcuts.billingDesc")} />
            <ShortcutCard href="/profile" icon={UserCog} title={t("settings.shortcuts.profile")} description={t("settings.shortcuts.profileDesc")} />
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Card className="bg-[#0f1419]">
          <CardHeader
            title={t("settings.security.title")}
            description={t("settings.security.description")}
            right={<ShieldCheck className="h-5 w-5 text-[#00ba7c]" />}
          />
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#2f3336] bg-black px-3 py-3">
              <span className="flex items-center gap-2 text-sm text-[#b6bec5]">
                <Wallet className="h-4 w-4 text-[#71767b]" />
                {t("settings.security.wallet")}
              </span>
              <span className="font-mono text-xs text-white">{maskWallet(me.wallet_address)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#2f3336] bg-black px-3 py-3">
              <span className="flex items-center gap-2 text-sm text-[#b6bec5]">
                <BadgeCheck className="h-4 w-4 text-[#71767b]" />
                {t("settings.security.session")}
              </span>
              <Button variant="outline" size="sm" onClick={logout}>
                {t("common.logout")}
              </Button>
            </div>
            <div className="space-y-3 rounded-2xl border border-[#2f3336] bg-black px-3 py-3">
              <div className="flex items-start gap-2">
                <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-[#71767b]" />
                <div>
                  <p className="text-sm font-medium text-white">{t("settings.security.password")}</p>
                  <p className="mt-1 text-xs leading-5 text-[#71767b]">
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

        <Card className="bg-[#0f1419]">
          <CardHeader
            title={t("settings.notifications.title")}
            description={t("settings.notifications.description")}
            right={<Bell className="h-5 w-5 text-[#f6d96b]" />}
          />
          <div className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2">
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

      <Card className="bg-[#0f1419]">
        <CardHeader
          title={t("settings.language.title")}
          description={t("settings.language.description")}
          right={<Languages className="h-5 w-5 text-[#1d9bf0]" />}
        />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
                  "rounded-2xl border px-3 py-2 text-left text-sm transition-colors",
                  active
                    ? "border-[#1d9bf0]/50 bg-[#1d9bf0]/10 text-white"
                    : "border-[#2f3336] bg-black text-[#b6bec5] hover:bg-[#16181c]"
                )}
              >
                <span className="block font-medium">{item.label}</span>
                <span className="text-xs text-[#71767b]">{item.code}</span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card className="bg-[#0f1419]">
        <CardHeader
          title={t("settings.timezone.title")}
          description={t("settings.timezone.description")}
          right={<Globe2 className="h-5 w-5 text-[#00ba7c]" />}
        />
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
              <div className="flex items-center gap-2 text-xs text-[#71767b]">
                <Globe2 className="size-3.5" />
                {t("settings.timezone.current")}
              </div>
              <p className="mt-2 text-base font-semibold text-white">{timeZoneLabel(preferredTimeZone)}</p>
              <p className="mt-1 text-xs text-[#71767b]">{timeZoneOffsetLabel(preferredTimeZone)}</p>
            </div>
            <div className="rounded-2xl border border-[#2f3336] bg-black p-4">
              <div className="flex items-center gap-2 text-xs text-[#71767b]">
                <Clock3 className="size-3.5" />
                {t("settings.timezone.preview")}
              </div>
              <p className="mt-2 text-base font-semibold text-white">{formatDateTime(new Date(), preferredTimeZone)}</p>
              <p className="mt-1 text-xs text-[#71767b]">{t("settings.timezone.previewHint")}</p>
            </div>
          </div>
          <Button type="button" className="w-full lg:w-auto" onClick={() => setTimeZoneDialogOpen(true)}>
            <Globe2 className="size-4" />
            {t("settings.timezone.change")}
          </Button>
        </div>
      </Card>

      <Dialog
        open={timeZoneDialogOpen}
        onOpenChange={setTimeZoneDialogOpen}
        title={t("settings.timezone.dialogTitle")}
        description={t("settings.timezone.dialogDescription")}
        className="max-w-2xl"
        closeLabel={t("common.cancel")}
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-[#1d9bf0]/20 bg-[#1d9bf0]/8 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs text-[#8ecdf8]">{t("settings.timezone.detected")}</p>
                <p className="mt-1 text-sm font-semibold text-white">{timeZoneLabel(detectedTimeZone)}</p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => chooseTimeZone(detectedTimeZone)}>
                {t("settings.timezone.useDetected")}
              </Button>
            </div>
          </div>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-3 size-4 text-[#71767b]" />
            <Input
              value={timeZoneSearch}
              onChange={(event) => setTimeZoneSearch(event.target.value)}
              placeholder={t("settings.timezone.searchPlaceholder")}
              className="pl-9"
            />
          </label>
          <div className="max-h-[420px] overflow-y-auto rounded-2xl border border-[#2f3336] bg-black">
            {groupedTimeZones.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[#71767b]">{t("settings.timezone.empty")}</p>
            ) : (
              groupedTimeZones.map((group) => (
                <div key={group.regionKey} className="border-b border-[#2f3336] last:border-b-0">
                  <div className="sticky top-0 z-10 border-b border-[#2f3336] bg-[#0f1419] px-4 py-2 text-xs font-semibold uppercase text-[#71767b]">
                    {t(group.regionKey)}
                  </div>
                  <div className="divide-y divide-[#2f3336]">
                    {group.items.map((option) => {
                      const active = option.value === preferredTimeZone;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => chooseTimeZone(option.value)}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors",
                            active ? "bg-[#1d9bf0]/10" : "hover:bg-[#16181c]"
                          )}
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-white">{t(option.cityKey)}</span>
                            <span className="mt-0.5 block truncate text-xs text-[#71767b]">{option.value}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2 text-xs text-[#71767b]">
                            {option.offset}
                            {active ? <CheckCircle2 className="size-4 text-[#1d9bf0]" /> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function AccountPill({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-[#2f3336] bg-[#0f1419]/82 px-3 py-2">
      <p className="flex items-center gap-1.5 text-xs text-[#71767b]">
        <Icon className="size-3.5" />
        {label}
      </p>
      <p className={cn("mt-1 truncate text-sm font-medium text-[#e7e9ea]", mono && "font-mono text-xs")}>{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#2f3336] bg-black p-3">
      <p className="text-xs text-[#71767b]">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-white">{value}</p>
    </div>
  );
}

function ShortcutCard({
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
    <label className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-[#2f3336] bg-black px-3 py-2 transition-colors hover:bg-[#080808]">
      <span className="text-sm font-medium text-[#d5d9dc]">{label}</span>
      <input
        type="checkbox"
        className="h-5 w-5 accent-[#1d9bf0]"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
