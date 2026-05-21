import Image from "next/image";
import { Link2, PlugZap, Unplug } from "lucide-react";

import type { ConnectedXAccount } from "@/types/accounts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";

type AccountCardProps = {
  account: ConnectedXAccount;
  onReconnect: (id: string) => void;
  onDisconnect: (id: string) => Promise<void>;
  isDisconnecting?: boolean;
};

function statusVariant(status: ConnectedXAccount["status"]) {
  if (status === "connected") return "success";
  if (status === "needs_reauth") return "warning";
  return "danger";
}

function statusLabel(status: ConnectedXAccount["status"]) {
  if (status === "connected") return "accounts.status.connected";
  if (status === "needs_reauth") return "accounts.status.needsReauth";
  return "accounts.status.disconnected";
}

export function AccountCard({ account, onReconnect, onDisconnect, isDisconnecting = false }: AccountCardProps) {
  const { t } = useT();
  return (
    <Card className="bg-[#0f1419] p-4 transition-colors hover:bg-[#16181c] md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="relative size-12 overflow-hidden rounded-full border border-[#2f3336] bg-[#16181c]">
            <Image
              src={account.avatarUrl}
              alt={account.displayName}
              fill
              className="object-cover"
              sizes="48px"
              unoptimized
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold text-white">{account.displayName}</p>
              <Badge variant={statusVariant(account.status)}>{t(statusLabel(account.status))}</Badge>
            </div>
            <p className="text-sm text-[#71767b]">@{account.username}</p>
            <div className="flex flex-wrap items-center gap-4 text-xs text-[#71767b]">
              <span className="inline-flex items-center gap-1">
                <Link2 className="size-3.5" />
                {t("accounts.labels.xAccount")}
              </span>
              {account.followers ? <span>{t("accounts.labels.followers", { count: account.followers })}</span> : null}
              {account.lastSyncedKey ? (
                <span>{t("accounts.labels.lastSync", { time: t(account.lastSyncedKey, account.lastSyncedParams) })}</span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {account.status === "needs_reauth" ? (
            <Button onClick={() => onReconnect(account.id)}>
              <PlugZap className="size-4" />
              {t("accounts.actions.reconnect")}
            </Button>
          ) : null}
          <Button
            variant="ghost"
            className="text-[#ff8a91] hover:text-[#ffb6bb]"
            onClick={() => void onDisconnect(account.id)}
            disabled={isDisconnecting}
          >
            <Unplug className="size-4" />
            {isDisconnecting ? t("accounts.actions.disconnecting") : t("accounts.actions.disconnect")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
