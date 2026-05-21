"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LogOut, RefreshCcw } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
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
import { signOut } from "@/lib/auth-session";

export function AppHeader() {
  const router = useRouter();
  const { t } = useT();
  const { pushToast } = useToast();
  const { bindWallet, unbindWallet } = useWalletBinding({ onMessage: pushToast });
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [headerBusy, setHeaderBusy] = useState(false);
  const [clock, setClock] = useState(() => Date.now());
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

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

  const handleConfirmLogout = useCallback(() => {
    signOut();
    setLogoutConfirmOpen(false);
    router.replace("/login");
  }, [router]);

  const syncedLabel = useMemo(() => {
    if (headerBusy) return t("dashboard.header.syncing");
    if (lastSyncedAt == null) return t("dashboard.header.syncedUnknown");
    const mins = Math.floor((clock - lastSyncedAt) / 60000);
    if (mins < 1) return t("dashboard.header.syncedJustNow");
    return t("dashboard.header.synced", { minutes: mins });
  }, [clock, headerBusy, lastSyncedAt, t]);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-[#2f3336] bg-black/78 px-4 backdrop-blur-xl md:px-6">
      <div className="min-w-0">
        <h1 className="truncate text-base font-bold text-[#e7e9ea] md:text-lg">{t("dashboard.header.title")}</h1>
        <p className="hidden text-xs text-[#71767b] md:block">{t("dashboard.header.subtitle")}</p>
      </div>
      <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2">
        <LanguageSwitcher className="sm:hidden" buttonClassName="h-8 w-10 justify-center px-0" menuClassName="right-0" />
        <LanguageSwitcher className="hidden sm:block" />
        {isAdminFrontend() ? null : (
          <ConnectWalletButton
            className="hidden sm:inline-flex"
            connectLabel={t("auth.card.connectWallet")}
            onConnected={handleConnected}
            onDisconnected={handleDisconnected}
          />
        )}
        <span className="stable-meta-chip hidden rounded-full border border-[#2f3336] bg-[#0f1419] px-2 py-1 text-xs text-[#71767b] sm:inline-flex">
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
        <Button
          variant="outline"
          className="h-8 px-2.5 text-[#e7e9ea] sm:px-3"
          type="button"
          onClick={() => setLogoutConfirmOpen(true)}
          aria-label={t("common.logout")}
        >
          <LogOut className="size-3.5" />
          <span className="hidden sm:inline">{t("common.logout")}</span>
        </Button>
      </div>
      <Dialog
        open={logoutConfirmOpen}
        onOpenChange={setLogoutConfirmOpen}
        title={t("logout.confirm.title")}
        description={t("logout.confirm.description")}
        showCloseButton={false}
      >
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" className="text-[#e7e9ea]/75" onClick={() => setLogoutConfirmOpen(false)}>
            {t("common.cancel")}
          </Button>
          <Button type="button" variant="default" onClick={handleConfirmLogout}>
            {t("logout.confirm.confirm")}
          </Button>
        </div>
      </Dialog>
    </header>
  );
}
