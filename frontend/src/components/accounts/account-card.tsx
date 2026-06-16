import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { AlertTriangle, Bot, BrainCircuit, CheckCircle2, Clock3, Link2, ListChecks, PlugZap, Rocket, Send, ShieldCheck, Unplug, Workflow } from "lucide-react";

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
  automationStates: AccountAutomationState[];
  queueSummary: AccountQueueSummary;
  onReconnect: (id: string) => void;
  onDisconnect: (id: string) => Promise<void>;
  isDisconnecting?: boolean;
};

export type AccountAutomationState = {
  type: "post" | "reply" | "comment" | "dm";
  enabled: boolean;
  configured: boolean;
  mode: "manual" | "review" | "autopilot";
};

export type AccountQueueSummary = {
  total: number;
  pendingReview: number;
  readyToPublish: number;
  failed: number;
  published: number;
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

function readinessLabel(status: ConnectedXAccount["status"], boundBot?: OAFBot, publishReauthRequired?: boolean) {
  if (status !== "connected") return "accounts.readiness.reauthRequired";
  if (publishReauthRequired) return "accounts.readiness.publishReauthRequired";
  if (!boundBot) return "accounts.readiness.needsBot";
  return "accounts.readiness.ready";
}

function publishIssueLabel(issue?: string) {
  if (issue === "missing_tweet_write") return "accounts.publishIssue.missingTweetWrite";
  if (issue === "missing_access_token") return "accounts.publishIssue.missingAccessToken";
  return "accounts.publishIssue.needsReauth";
}

export function AccountCard({
  account,
  boundBot,
  automationStates,
  queueSummary,
  onReconnect,
  onDisconnect,
  isDisconnecting = false,
}: AccountCardProps) {
  const { t } = useT();
  const isConnected = account.status === "connected";
  const enabledAutomationCount = automationStates.filter((item) => item.enabled).length;
  const publishNeedsReauth = Boolean(account.publishReauthRequired);

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
                <Badge variant={account.xSubscriptionTier === "premium" || account.xSubscriptionTier === "premium_plus" ? "info" : "default"}>
                  {t(`accounts.xTier.${account.xSubscriptionTier}`)}
                </Badge>
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
              {isConnected && boundBot && !publishNeedsReauth ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}
              {t(readinessLabel(account.status, boundBot, publishNeedsReauth))}
            </Badge>
            {account.status === "needs_reauth" || publishNeedsReauth ? (
              <Button onClick={() => onReconnect(account.id)} size="sm">
                <PlugZap className="size-4" />
                {t("accounts.actions.reconnect")}
              </Button>
            ) : null}
            <Link href="/oaf-bots" className={cn(buttonVariants({ variant: boundBot ? "outline" : "default", size: "sm" }))}>
              <Bot className="size-3.5" />
              {boundBot ? t("accounts.actions.manageBot") : t("accounts.actions.bindBot")}
            </Link>
            <Link href="/content-drafts" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              <Rocket className="size-3.5" />
              {t("accounts.actions.openAutomation")}
            </Link>
            <Link href={`/accounts/${account.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              <BrainCircuit className="size-3.5" />
              {t("accounts.actions.openIntelligence")}
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

      {publishNeedsReauth ? (
        <div className="border-b border-amber-300/20 bg-amber-400/10 px-4 py-3 md:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-100">{t("accounts.reauthNotice.title")}</p>
              <p className="mt-1 text-xs leading-5 text-amber-100/75">
                {t(publishIssueLabel(account.publishIssue), {
                  scopes: account.missingScopes?.join(", ") || "tweet.write",
                })}
              </p>
            </div>
            <Button type="button" size="sm" onClick={() => onReconnect(account.id)}>
              <PlugZap className="size-4" />
              {t("accounts.actions.reconnect")}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 p-4 md:grid-cols-3 md:p-5">
        <HealthRow
          icon={<ShieldCheck className="size-4" />}
          label={t("accounts.health.oauth")}
          value={publishNeedsReauth ? t("accounts.health.publishReauthRequired") : t(statusLabel(account.status))}
          tone={isConnected && !publishNeedsReauth ? "success" : "warning"}
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
          value={isConnected ? t("accounts.health.automationCount", { count: enabledAutomationCount }) : t("accounts.health.reconnectFirst")}
          tone={isConnected && enabledAutomationCount > 0 ? "success" : isConnected ? "info" : "warning"}
        />
      </div>

      <div className="grid gap-3 border-t border-[#2f3336] p-4 md:grid-cols-[1.05fr_1fr] md:p-5">
        <div className="min-w-0 rounded-2xl border border-[#2f3336] bg-black/25 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">{t("accounts.relationship.title")}</p>
              <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("accounts.relationship.description")}</p>
            </div>
            <Workflow className="size-5 shrink-0 text-[#1d9bf0]" />
          </div>

          <div className="space-y-3">
            <AccountBindingLine
              icon={<Bot className="size-4" />}
              label={t("accounts.relationship.bot")}
              title={boundBot?.name || t("accounts.relationship.noBotTitle")}
              description={
                boundBot
                  ? t("accounts.botSummary.bound", {
                      bot: boundBot.name,
                      tone: boundBot.voice_tone || t("accounts.botSummary.noTone"),
                      goal: boundBot.growth_goal || t("accounts.botSummary.noGoal"),
                    })
                  : t("accounts.botSummary.missing")
              }
              href="/oaf-bots"
              cta={boundBot ? t("accounts.actions.manageBot") : t("accounts.actions.bindBot")}
              tone={boundBot ? "success" : "warning"}
            />
            <AccountBindingLine
              icon={<Send className="size-4" />}
              label={t("accounts.relationship.queue")}
              title={queueSummary.total > 0 ? t("accounts.queue.total", { count: queueSummary.total }) : t("accounts.queue.emptyTitle")}
              description={queueSummary.total > 0 ? t("accounts.queue.description") : t("accounts.queue.emptyDescription")}
              href="/handling-list"
              cta={t("accounts.actions.openQueue")}
              tone={queueSummary.failed > 0 ? "warning" : queueSummary.total > 0 ? "info" : "muted"}
            />
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-[#2f3336] bg-black/25 p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">{t("accounts.automation.title")}</p>
              <p className="mt-1 text-xs leading-5 text-[#71767b]">{t("accounts.automation.description")}</p>
            </div>
            <ListChecks className="size-5 shrink-0 text-[#1d9bf0]" />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {automationStates.map((item) => (
              <AutomationPill key={item.type} item={item} />
            ))}
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2">
            <QueueMetric label={t("accounts.queue.pendingReview")} value={queueSummary.pendingReview} />
            <QueueMetric label={t("accounts.queue.readyToPublish")} value={queueSummary.readyToPublish} />
            <QueueMetric label={t("accounts.queue.failed")} value={queueSummary.failed} tone={queueSummary.failed > 0 ? "warning" : "default"} />
            <QueueMetric label={t("accounts.queue.published")} value={queueSummary.published} />
          </div>
        </div>
      </div>
    </Card>
  );
}

function AccountBindingLine({
  icon,
  label,
  title,
  description,
  href,
  cta,
  tone,
}: {
  icon: ReactNode;
  label: string;
  title: string;
  description: string;
  href: string;
  cta: string;
  tone: "success" | "warning" | "info" | "muted";
}) {
  const tones = {
    success: "border-emerald-300/20 bg-emerald-400/5 text-emerald-200",
    warning: "border-amber-300/20 bg-amber-400/5 text-amber-200",
    info: "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-blue-200",
    muted: "border-[#2f3336] bg-[#16181c] text-[#71767b]",
  };

  return (
    <div className="min-w-0 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full border", tones[tone])}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-[#71767b]">{label}</p>
          <p className="mt-1 truncate text-sm font-semibold text-white">{title}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#71767b]">{description}</p>
        </div>
        <Link href={href} className="shrink-0 text-xs font-semibold text-[#1d9bf0] hover:text-[#8ecdf8]">
          {cta}
        </Link>
      </div>
    </div>
  );
}

function AutomationPill({ item }: { item: AccountAutomationState }) {
  const { t } = useT();
  const tone = item.enabled
    ? "border-emerald-300/20 bg-emerald-400/5 text-emerald-200"
    : item.configured
      ? "border-[#2f3336] bg-[#16181c] text-[#71767b]"
      : "border-amber-300/20 bg-amber-400/5 text-amber-200";

  return (
    <Link href={automationHref(item.type)} className={cn("min-w-0 rounded-2xl border p-3 transition-colors hover:border-[#1d9bf0]/40", tone)}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold text-white">{t(`accounts.automation.type.${item.type}`)}</span>
        <span className="shrink-0 rounded-full border border-current/20 px-2 py-0.5 text-[11px]">
          {item.enabled ? t("accounts.automation.enabled") : item.configured ? t("accounts.automation.paused") : t("accounts.automation.notConfigured")}
        </span>
      </div>
      <p className="mt-2 truncate text-xs text-[#71767b]">{t("accounts.automation.mode", { mode: t(`handlingList.executionMode.${item.mode}`) })}</p>
    </Link>
  );
}

function QueueMetric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "warning" }) {
  return (
    <div className={cn("min-w-0 rounded-xl border border-[#2f3336] bg-[#0f1419] px-2 py-2 text-center", tone === "warning" ? "text-amber-200" : "text-white")}>
      <p className="text-sm font-semibold">{value}</p>
      <p className="mt-1 truncate text-[11px] text-[#71767b]">{label}</p>
    </div>
  );
}

function automationHref(type: AccountAutomationState["type"]) {
  if (type === "post") return "/content-drafts";
  if (type === "comment") return "/exposure-radar";
  return "/review-queue";
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
