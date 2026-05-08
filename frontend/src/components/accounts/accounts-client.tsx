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
import { accountService, type AccountListItem } from "@/services/account.service";
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
    displayName: item.display_name || item.username || "X Account",
    status: item.status,
    followers: item.followers,
    ...toLastSyncData(item.last_synced_at),
  };
}

export function AccountsClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { pushToast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<ConnectedXAccount[]>([]);
  const [disconnectingAccountId, setDisconnectingAccountId] = useState<string | null>(null);

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
          ? error.response?.data?.message || "Failed to load accounts."
          : "Failed to load accounts.";
        setErrorMessage(msg);
        if (!quiet) {
          setLoadState("error");
        } else {
          pushToast(msg);
        }
      }
    },
    [pushToast]
  );

  useEffect(() => {
    void fetchAccounts();
  }, [fetchAccounts]);

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
        pushToast("X account connected.");
        void fetchAccounts({ quiet: true });
        broadcastDashboardRefresh();
        setDialogOpen(false);
      } else if (data.status === "failed") {
        pushToast("X account authorization failed.");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [fetchAccounts, pushToast]);

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
      pushToast("X account connected.");
      void fetchAccounts();
      broadcastDashboardRefresh();
    } else if (oauth === "failed") {
      pushToast("X account authorization failed.");
    }
    router.replace(pathname);
  }, [fetchAccounts, pathname, pushToast, router, searchParams]);

  const onManage = (id: string) => {
    console.log("manage account", id);
  };
  const onReconnect = (id: string) => {
    console.log("reconnect account", id);
  };
  const onDisconnect = useCallback(
    async (id: string) => {
      const accountID = Number(id);
      if (!Number.isFinite(accountID)) return;
      setDisconnectingAccountId(id);
      try {
        await accountService.disconnect(accountID);
        pushToast("Account disconnected.");
        await fetchAccounts();
        broadcastDashboardRefresh();
      } catch (error) {
        if (axios.isAxiosError(error)) {
          pushToast(error.response?.data?.message || "Failed to disconnect account.");
        } else {
          pushToast("Failed to disconnect account.");
        }
      } finally {
        setDisconnectingAccountId(null);
      }
    },
    [fetchAccounts, pushToast]
  );

  const startOAuth = useCallback(async () => {
    const data = await accountService.startXOAuth();
    if (!data.auth_url) throw new Error("OAuth url missing.");
    const features = ["popup=yes", "width=560", "height=720", "left=80", "top=80"].join(",");
    const popup = window.open(data.auth_url, "octo_x_oauth", features);
    if (!popup) {
      throw new Error("Browser blocked the OAuth window. Allow popups for this site and try again.");
    }
    popup.focus();
    setDialogOpen(false);
  }, [setDialogOpen]);

  const isEmpty = useMemo(() => loadState === "ready" && accounts.length === 0, [accounts.length, loadState]);

  return (
    <div className="space-y-4 md:space-y-5">
      <AccountsPageHeader onAddAccount={() => setDialogOpen(true)} />

      {loadState === "loading" ? (
        <Card>
          <CardHeader title="Loading accounts..." description="Fetching your connected X accounts." />
        </Card>
      ) : null}

      {loadState === "error" ? (
        <Card>
          <CardHeader title="Failed to load accounts" description={errorMessage || "Please try again."} />
          <div className="flex justify-end">
            <Button onClick={() => void fetchAccounts()}>Retry</Button>
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
            onManage={onManage}
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
