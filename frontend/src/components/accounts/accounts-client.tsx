"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useToast } from "@/components/providers/toast-provider";
import { UserOnboardingCard } from "@/components/onboarding/user-onboarding-card";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  broadcastDataSynced,
  broadcastPageRefreshComplete,
  subscribePageRefreshRequest,
} from "@/lib/app-page-refresh";
import { broadcastDashboardRefresh } from "@/lib/dashboard-refresh";
import { useT } from "@/i18n/use-t";
import { accountService, type AccountListItem } from "@/services/account.service";
import { billingService, type BillingSubscriptionApi } from "@/services/billing.service";
import type { ConnectedXAccount } from "@/types/accounts";

import { AccountsEmptyState } from "./accounts-empty-state";
import { AccountsPageHeader } from "./accounts-page-header";
import { AccountList } from "./account-list";
import { BindAccountDialog } from "./bind-account-dialog";

type LoadState = "loading" | "ready" | "error";

/** Popup posts this to `window.opener` after OAuth redirect; must match listener below. */
const X_OAUTH_RESULT_MESSAGE = "octo-x-oauth-result" as const;

function toLastSyncData(lastSyncedAt?: string): Pick<ConnectedXAccount, "lastSyncedKey" | "lastSyncedParams"> {
  if (!lastSyncedAt) return {};
  const date = new Date(lastSyncedAt);
  if (Number.isNaN(date.getTime())) return {};
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMinutes >= 60) {
    return { lastSyncedKey: "accounts.lastSync.hoursAgo", lastSyncedParams: { hours: Math.floor(diffMinutes / 60) } };
  }
  return { lastSyncedKey: "accounts.lastSync.minutesAgo", lastSyncedParams: { minutes: diffMinutes } };
}

function mapAccount(item: AccountListItem): ConnectedXAccount {
  return {
    id: String(item.id),
    avatarUrl: item.avatar_url || `https://api.dicebear.com/9.x/identicon/svg?seed=${item.username || item.id}`,
    username: item.username || "x_user",
    displayName: item.display_name || item.username || `#${item.id}`,
    status: item.status,
    followers: item.followers,
    ...toLastSyncData(item.last_synced_at),
  };
}

export function AccountsClient() {
  const { t } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { pushToast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<ConnectedXAccount[]>([]);
  const [disconnectingAccountId, setDisconnectingAccountId] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<BillingSubscriptionApi | null>(null);

  const fetchAccounts = useCallback(
    async (options?: { quiet?: boolean }) => {
      const quiet = Boolean(options?.quiet);
      if (!quiet) {
        setLoadState("loading");
      }
      setErrorMessage(null);
      try {
        const data = await accountService.list();
        setAccounts(data.items.map(mapAccount));
        setLoadState("ready");
        broadcastDataSynced(Date.now());
      } catch (error) {
        const msg = axios.isAxiosError(error)
          ? error.response?.data?.message || t("accounts.toast.loadFailed")
          : t("accounts.toast.loadFailed");
        setErrorMessage(msg);
        if (!quiet) {
          setLoadState("error");
        } else {
          pushToast(msg);
        }
      }
    },
    [pushToast, t]
  );

  useEffect(() => {
    void fetchAccounts();
  }, [fetchAccounts]);

  useEffect(() => {
    let cancelled = false;
    billingService
      .subscription()
      .then((data) => {
        if (!cancelled) setSubscription(data);
      })
      .catch(() => {
        if (!cancelled) setSubscription(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return subscribePageRefreshRequest(() => {
      void (async () => {
        try {
          await fetchAccounts({ quiet: true });
        } finally {
          broadcastPageRefreshComplete();
        }
      })();
    });
  }, [fetchAccounts]);

  /** When OAuth finishes in a popup, it notifies this tab so we refresh without navigating away. */
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; status?: string } | null;
      if (!data || data.type !== X_OAUTH_RESULT_MESSAGE) return;
      if (data.status === "success") {
        pushToast(t("accounts.toast.connected"));
        void fetchAccounts({ quiet: true });
        broadcastDashboardRefresh();
        setDialogOpen(false);
      } else if (data.status === "failed") {
        pushToast(t("accounts.toast.authorizationFailed"));
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [fetchAccounts, pushToast, t]);

  useEffect(() => {
    const oauth = searchParams.get("oauth");
    if (!oauth) return;

    const popupOpener = typeof window !== "undefined" && window.opener && !window.opener.closed;
    if (popupOpener) {
      (window.opener as Window).postMessage(
        { type: X_OAUTH_RESULT_MESSAGE, status: oauth === "success" ? "success" : "failed" },
        window.location.origin
      );
      try {
        window.close();
      } catch {
        /* ignore */
      }
      return;
    }

    if (oauth === "success") {
      pushToast(t("accounts.toast.connected"));
      void fetchAccounts();
      broadcastDashboardRefresh();
    } else if (oauth === "failed") {
      pushToast(t("accounts.toast.authorizationFailed"));
    }
    router.replace(pathname);
  }, [fetchAccounts, pathname, pushToast, router, searchParams, t]);

  const onDisconnect = useCallback(
    async (id: string) => {
      const accountID = Number(id);
      if (!Number.isFinite(accountID)) return;
      setDisconnectingAccountId(id);
      try {
        await accountService.disconnect(accountID);
        pushToast(t("accounts.toast.disconnected"));
        await fetchAccounts();
        broadcastDashboardRefresh();
      } catch (error) {
        if (axios.isAxiosError(error)) {
          pushToast(error.response?.data?.message || t("accounts.toast.disconnectFailed"));
        } else {
          pushToast(t("accounts.toast.disconnectFailed"));
        }
      } finally {
        setDisconnectingAccountId(null);
      }
    },
    [fetchAccounts, pushToast, t]
  );

  const isFreeAccountLimitReached = subscription?.plan === "free_trial" && accounts.length >= 1;
  const freeAccountLimitReason = t("accounts.limit.freeTrialOneAccount");

  const startOAuth = useCallback(async (options?: { bypassFreeLimit?: boolean }) => {
    if (isFreeAccountLimitReached && !options?.bypassFreeLimit) {
      pushToast(freeAccountLimitReason);
      throw new Error(freeAccountLimitReason);
    }
    const data = await accountService.startXOAuth();
    if (!data.auth_url) throw new Error(t("accounts.toast.oauthUrlMissing"));
    const features = ["popup=yes", "width=560", "height=720", "left=80", "top=80"].join(",");
    const popup = window.open(data.auth_url, "octo_x_oauth", features);
    if (!popup) {
      throw new Error(t("accounts.toast.popupBlocked"));
    }
    popup.focus();
    setDialogOpen(false);
  }, [freeAccountLimitReason, isFreeAccountLimitReached, pushToast, setDialogOpen, t]);

  const onReconnect = useCallback(
    () => {
      void startOAuth({ bypassFreeLimit: true });
    },
    [startOAuth]
  );

  const isEmpty = useMemo(() => loadState === "ready" && accounts.length === 0, [accounts.length, loadState]);

  return (
    <div className="space-y-4 md:space-y-5">
      <AccountsPageHeader
        onAddAccount={() => setDialogOpen(true)}
        addDisabled={isFreeAccountLimitReached}
        addDisabledReason={isFreeAccountLimitReached ? freeAccountLimitReason : undefined}
      />

      {loadState === "loading" ? (
        <Card>
          <CardHeader title={t("accounts.loading.title")} description={t("accounts.loading.description")} />
        </Card>
      ) : null}

      {loadState === "error" ? (
        <Card>
          <CardHeader title={t("accounts.error.title")} description={errorMessage || t("common.retryHint")} />
          <div className="flex justify-end">
            <Button onClick={() => void fetchAccounts()}>{t("common.retry")}</Button>
          </div>
        </Card>
      ) : null}

      {isEmpty ? (
        <>
          <UserOnboardingCard
            accountConnected={false}
            automationEnabled={false}
            postCreated={false}
            activityObserved={false}
            onConnectAccount={() => setDialogOpen(true)}
          />
          <AccountsEmptyState onConnect={() => setDialogOpen(true)} />
        </>
      ) : null}

      {loadState === "ready" && accounts.length > 0 ? (
        <div className="space-y-3">
          <AccountList
            accounts={accounts}
            onReconnect={onReconnect}
            onDisconnect={onDisconnect}
            disconnectingAccountId={disconnectingAccountId}
          />
        </div>
      ) : null}

      <BindAccountDialog open={dialogOpen} onOpenChange={setDialogOpen} onAuthorize={startOAuth} />
    </div>
  );
}
