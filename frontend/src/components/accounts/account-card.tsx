import Image from "next/image";
import { Link2, PlugZap, Settings, Unplug } from "lucide-react";

import type { ConnectedXAccount } from "@/types/accounts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";

type AccountCardProps = {
  account: ConnectedXAccount;
  onManage: (id: string) => void;
  onReconnect: (id: string) => void;
  onDisconnect: (id: string) => void;
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

export function AccountCard({ account, onManage, onReconnect, onDisconnect }: AccountCardProps) {
  const { t } = useT();
  return (
    <Card className="p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="relative size-12 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
            <Image src={account.avatarUrl} alt={account.displayName} fill className="object-cover" />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-base font-semibold text-white">{account.displayName}</p>
              <Badge variant={statusVariant(account.status)}>{t(statusLabel(account.status))}</Badge>
            </div>
            <p className="text-sm text-white/65">@{account.username}</p>
            <div className="flex flex-wrap items-center gap-4 text-xs text-white/55">
              <span className="inline-flex items-center gap-1">
                <Link2 className="size-3.5" />
                {t("accounts.labels.xAccount")}
              </span>
              <span>{t("accounts.labels.followers", { count: account.followers })}</span>
              <span>{t("accounts.labels.lastSync", { time: t(account.lastSyncedKey, account.lastSyncedParams) })}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => onManage(account.id)}>
            <Settings className="size-4" />
            {t("accounts.actions.manage")}
          </Button>
          {account.status === "needs_reauth" ? (
            <Button onClick={() => onReconnect(account.id)}>
              <PlugZap className="size-4" />
              {t("accounts.actions.reconnect")}
            </Button>
          ) : null}
          <Button variant="ghost" className="text-rose-200 hover:text-rose-100" onClick={() => onDisconnect(account.id)}>
            <Unplug className="size-4" />
            {t("accounts.actions.disconnect")}
          </Button>
        </div>
      </div>
    </Card>
  );
}
