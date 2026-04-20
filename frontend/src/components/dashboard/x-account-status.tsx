"use client";

import { useT } from "@/i18n/use-t";
import type { DashboardOverview } from "@/services/dashboard.service";

import { SectionCard } from "./section-card";

type XAccountStatusProps = {
  overview?: DashboardOverview | null;
};

function relativeActivityLabel(iso: string | undefined, t: (key: string, params?: Record<string, string | number>) => string) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return t("activity.relative.justNow");
  if (mins < 60) return t("activity.relative.minutesAgo", { minutes: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("activity.relative.hoursAgo", { hours });
  const days = Math.floor(hours / 24);
  return t("activity.relative.daysAgo", { days });
}

export function XAccountStatus({ overview }: XAccountStatusProps) {
  const { t } = useT();
  const connectedCount = overview?.connected_x_count ?? 0;
  const lastActivityLabel = relativeActivityLabel(overview?.last_activity_at, t);

  return (
    <SectionCard
      title={t("dashboard.accounts.section.title")}
      description={t("dashboard.accounts.section.description")}
    >
      <div className="space-y-3">
        {connectedCount > 0 ? (
          <article className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-white/60">{t("dashboard.accounts.platform.x")}</p>
                <p className="text-lg font-semibold text-white">{connectedCount} connected account(s)</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-200">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-300" />
                {t("dashboard.accounts.status.connected")}
              </span>
            </div>
            <div className="mt-4 grid gap-2 text-sm text-white/70 sm:grid-cols-3">
              <p>{t("dashboard.overview.accounts.subLinked", { count: connectedCount })}</p>
              <p>{overview?.wallet_bound ? t("dashboard.accounts.wallet.bound") : t("dashboard.accounts.wallet.unbound")}</p>
              <p>
                {lastActivityLabel
                  ? t("dashboard.accounts.labels.lastActivity", { time: lastActivityLabel })
                  : t("dashboard.accounts.labels.noRecentActivity")}
              </p>
            </div>
          </article>
        ) : (
          <article className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-white/65">
            No X account connected yet.
          </article>
        )}
      </div>
    </SectionCard>
  );
}
