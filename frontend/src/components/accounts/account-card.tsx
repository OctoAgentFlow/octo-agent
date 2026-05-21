import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, Bot, CheckCircle2, Clock3, Link2, PlugZap, Rocket, ShieldCheck, Unplug } from "lucide-react";

import type { ConnectedXAccount } from "@/types/accounts";
import type { OAFBot } from "@/types/oaf-bot";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";

type AccountCardProps = {
  account: ConnectedXAccount;
  boundBot?: OAFBot;
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

function readinessVariant(status: ConnectedXAccount["status"], boundBot?: OAFBot) {
  if (status !== "connected") return "danger";
  if (!boundBot) return "warning";
  return "success";
}

function readinessLabel(status: ConnectedXAccount["status"], boundBot?: OAFBot) {
  if (status !== "connected") return "accounts.readiness.reauthRequired";
  if (!boundBot) return "accounts.readiness.needsBot";
  return "accounts.readiness.ready";
}

export function AccountCard({ account, boundBot, onReconnect, onDisconnect, isDisconnecting = false }: AccountCardProps) {
  const { t } = useT();
  const isConnected = account.status === "connected";

  return (
    <Card className="overflow-hidden border-[#2f3336] bg-[#0f1419] p-0 transition-colors hover:bg-[#11161c]">
      <div className="border-b border-[#2f3336] bg-[radial-gradient(circle_at_top_right,rgba(29,155,240,0.13),transparent_34%),#0f1419] p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="relative size-12 shrink-0 overflow-hidden rounded-full border border-[#2f3336] bg-[#16181c]">
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
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-base font-semibold text-white">{account.displayName}</p>
                <Badge variant={statusVariant(account.status)}>{t(statusLabel(account.status))}</Badge>
              </div>
              <p className="truncate text-sm text-[#71767b]">@{account.username}</p>
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
            <Badge variant={readinessVariant(account.status, boundBot)} className="gap-1">
              {isConnected && boundBot ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}
              {t(readinessLabel(account.status, boundBot))}
            </Badge>
            {account.status === "needs_reauth" ? (
              <Button onClick={() => onReconnect(account.id)} size="sm">
                <PlugZap className="size-4" />
                {t("accounts.actions.reconnect")}
              </Button>
            ) : null}
            <Link href="/oaf-bots" className={cn(buttonVariants({ variant: boundBot ? "outline" : "default", size: "sm" }))}>
              <Bot className="size-3.5" />
              {boundBot ? t("accounts.actions.manageBot") : t("accounts.actions.bindBot")}
            </Link>
            <Link href="/auto-post" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              <Rocket className="size-3.5" />
              {t("accounts.actions.openAutomation")}
            </Link>
            <Button
              variant="ghost"
              size="sm"
              className="text-[#ff8a91] hover:text-[#ffb6bb]"
              onClick={() => void onDisconnect(account.id)}
              disabled={isDisconnecting}
            >
              <Unplug className="size-4" />
              {isDisconnecting ? t("accounts.actions.disconnecting") : t("accounts.actions.disconnect")}
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-3 p-4 md:grid-cols-3 md:p-5">
        <HealthRow
          icon={<ShieldCheck className="size-4" />}
          label={t("accounts.health.oauth")}
          value={t(statusLabel(account.status))}
          tone={isConnected ? "success" : "warning"}
        />
        <HealthRow
          icon={<Bot className="size-4" />}
          label={t("accounts.health.oafBot")}
          value={boundBot?.name || t("accounts.health.noBot")}
          tone={boundBot ? "success" : "warning"}
        />
        <HealthRow
          icon={<Clock3 className="size-4" />}
          label={t("accounts.health.automation")}
          value={isConnected ? t("accounts.health.executionQueueReady") : t("accounts.health.reconnectFirst")}
          tone={isConnected ? "info" : "warning"}
        />
      </div>

      <div className="border-t border-[#2f3336] px-4 py-3 text-sm text-[#71767b] md:px-5">
        {boundBot ? (
          <p className="break-words">
            {t("accounts.botSummary.bound", {
              bot: boundBot.name,
              tone: boundBot.voice_tone || t("accounts.botSummary.noTone"),
              goal: boundBot.growth_goal || t("accounts.botSummary.noGoal"),
            })}
          </p>
        ) : (
          <p>{t("accounts.botSummary.missing")}</p>
        )}
      </div>
    </Card>
  );
}

function HealthRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "success" | "warning" | "info";
}) {
  const tones = {
    success: "border-emerald-300/20 bg-emerald-400/5 text-emerald-200",
    warning: "border-amber-300/20 bg-amber-400/5 text-amber-200",
    info: "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-blue-200",
  };

  return (
    <div className="min-w-0 rounded-2xl border border-[#2f3336] bg-[#16181c] p-3">
      <div className="mb-2 flex items-center gap-2 text-xs text-[#71767b]">
        <span className={cn("inline-flex size-7 shrink-0 items-center justify-center rounded-full border", tones[tone])}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <p className="truncate text-sm font-semibold text-[#e7e9ea]">{value}</p>
    </div>
  );
}
