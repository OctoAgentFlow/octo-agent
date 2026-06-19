"use client";

import { Activity, Crown, ShieldCheck, UserRound } from "lucide-react";

import { useT } from "@/i18n/use-t";
import type { DashboardOverview } from "@/services/dashboard.service";
import { formatDateTime as formatDateTimeForZone, usePreferredTimeZone } from "@/lib/timezone";

type StatusOverviewCardsProps = {
  overview?: DashboardOverview | null;
  loading?: boolean;
};

function planKeyFromCode(plan: string) {
  if (plan === "free_trial") return "dashboard.membership.plan.freeTrial";
  if (plan === "basic" || plan === "basic_monthly") return "dashboard.membership.plan.basic";
  if (plan === "plus") return "dashboard.membership.plan.plus";
  if (plan === "pro") return "dashboard.membership.plan.pro";
  if (plan === "pro_plus") return "dashboard.membership.plan.proPlus";
  return "dashboard.membership.plan.freeTrial";
}

function isFreeTrial(plan: string | undefined) {
  return !plan || plan === "free_trial";
}

function formatDelta24h(cur: number, prev: number) {
  const d = cur - prev;
  if (d > 0) return `+${d}`;
  return String(d);
}

export function StatusOverviewCards({ overview, loading = false }: StatusOverviewCardsProps) {
  const { t } = useT();
  const timeZone = usePreferredTimeZone();
  if (loading) {
    return (
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <article key={index} className="surface-card rounded-2xl p-4">
            <div className="flex items-start justify-between">
              <span className="h-3 w-24 animate-pulse rounded-full bg-[#2f3336]" />
              <span className="size-8 animate-pulse rounded-full bg-[#1d9bf0]/10" />
            </div>
            <span className="mt-4 block h-7 w-28 animate-pulse rounded-full bg-[#2f3336]" />
            <span className="mt-3 block h-3 w-36 animate-pulse rounded-full bg-[#2f3336]" />
          </article>
        ))}
      </section>
    );
  }
  const act24 = overview?.activity_count_24h ?? 0;
  const actPrev = overview?.activity_count_prev_24h ?? 0;
  const ratePct = overview?.activity_success_rate_pct ?? 0;
  const subStatus = overview?.subscription_status ?? "active";
  const plan = overview?.plan || "free_trial";
  const expiresAt = overview?.subscription_expires_at
    ? formatDateTimeForZone(overview.subscription_expires_at, timeZone, { year: "numeric", month: "short", day: "numeric" })
    : "";
  const membershipSub =
    subStatus === "expired"
      ? t("dashboard.membership.subscriptionExpired")
      : isFreeTrial(plan)
        ? t("dashboard.membership.permanentlyFree")
        : expiresAt
          ? t("dashboard.membership.expiresAt", { date: expiresAt })
          : t("dashboard.membership.active");

  const stats = [
    {
      titleKey: "dashboard.overview.membership.title",
      value: t(planKeyFromCode(plan)),
      subValue: membershipSub,
      icon: Crown,
    },
    {
      titleKey: "dashboard.overview.accounts.title",
      value: t("dashboard.overview.accounts.count", { count: overview?.connected_x_count ?? 0 }),
      subValue: t("dashboard.overview.accounts.subLinked", { count: overview?.connected_x_count ?? 0 }),
      icon: UserRound,
    },
    {
      titleKey: "dashboard.overview.executions.title",
      value: t("dashboard.overview.executions.count", { count: act24 }),
      subValue: t("dashboard.overview.executions.deltaPrev24h", { delta: formatDelta24h(act24, actPrev) }),
      icon: Activity,
    },
    {
      titleKey: "dashboard.overview.success.title",
      value: t("dashboard.overview.success.rate", { rate: `${ratePct}%` }),
      subValue: t("dashboard.overview.success.basedOn7d"),
      icon: ShieldCheck,
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <article
          key={stat.titleKey}
          className="surface-card rounded-2xl p-4 transition-colors duration-200 hover:bg-[#080808]"
        >
          <div className="flex items-start justify-between">
            <p className="text-xs tracking-wide text-[#71767b] uppercase">{t(stat.titleKey)}</p>
            <span className="grid size-8 place-items-center rounded-full bg-[#1d9bf0]/10 text-[#1d9bf0]">
              <stat.icon className="size-4" />
            </span>
          </div>
          <p className="mt-3 text-2xl font-bold text-[#e7e9ea]">{stat.value}</p>
          <p className="mt-1 text-xs text-[#71767b]">{stat.subValue}</p>
        </article>
      ))}
    </section>
  );
}
