"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { ConnectWalletButton } from "@/components/web3/connect-wallet-button";
import { useWalletBinding } from "@/hooks/use-wallet-binding";
import {
  broadcastPageRefreshRequest,
  subscribeDataSynced,
  subscribePageRefreshComplete,
} from "@/lib/app-page-refresh";
import { cn } from "@/lib/utils";
import { isAdminFrontend } from "@/lib/frontend-role";

export function AppHeader() {
  const { t } = useT();
  const { pushToast } = useToast();
  const { bindWallet, unbindWallet } = useWalletBinding({ onMessage: pushToast });
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [headerBusy, setHeaderBusy] = useState(false);
  const [clock, setClock] = useState(() => Date.now());

  useEffect(() => {
    return subscribeDataSynced((ts) => {
      setLastSyncedAt(ts);
      setClock(Date.now());
    });
  }, []);

  useEffect(() => {
    return subscribePageRefreshComplete(() => setHeaderBusy(false));
  }, []);

  useEffect(() => {
    if (!headerBusy) return;
    const id = window.setTimeout(() => setHeaderBusy(false), 25000);
    return () => window.clearTimeout(id);
  }, [headerBusy]);

  useEffect(() => {
    const id = window.setInterval(() => setClock(Date.now()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const handleConnected = async (address: string) => {
    await bindWallet(address);
  };
  const handleDisconnected = async (address: string) => {
    await unbindWallet(address);
  };

  const handleRefreshClick = useCallback(() => {
    setHeaderBusy(true);
    broadcastPageRefreshRequest();
  }, []);

  const syncedLabel = useMemo(() => {
    if (headerBusy) return t("dashboard.header.syncing");
    if (lastSyncedAt == null) return t("dashboard.header.syncedUnknown");
    const mins = Math.floor((clock - lastSyncedAt) / 60000);
    if (mins < 1) return t("dashboard.header.syncedJustNow");
    return t("dashboard.header.synced", { minutes: mins });
  }, [clock, headerBusy, lastSyncedAt, t]);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-white/10 bg-[#070b17]/80 px-4 backdrop-blur md:px-6">
      <div>
        <h1 className="text-sm font-semibold text-white md:text-base">{t("dashboard.header.title")}</h1>
        <p className="hidden text-xs text-white/55 md:block">{t("dashboard.header.subtitle")}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <LanguageSwitcher className="hidden sm:block" />
        {isAdminFrontend() ? null : (
          <ConnectWalletButton
            className="hidden sm:inline-flex"
            connectLabel={t("auth.card.connectWallet")}
            onConnected={handleConnected}
            onDisconnected={handleDisconnected}
          />
        )}
        <span className="stable-meta-chip hidden rounded-full border border-white/15 bg-white/6 px-2 py-1 text-xs text-white/60 sm:inline-flex">
          {syncedLabel}
        </span>
        <Button
          variant="outline"
          className="stable-cta-sm h-8"
          type="button"
          disabled={headerBusy}
          onClick={handleRefreshClick}
          aria-busy={headerBusy}
        >
          <RefreshCcw className={cn("size-3.5", headerBusy && "animate-spin")} />
          {t("dashboard.header.refresh")}
        </Button>
      </div>
    </header>
  );
}
