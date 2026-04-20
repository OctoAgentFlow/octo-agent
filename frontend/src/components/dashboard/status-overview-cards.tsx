"use client";

import { Activity, Crown, ShieldCheck, UserRound } from "lucide-react";

import { useT } from "@/i18n/use-t";
import type { DashboardOverview } from "@/services/dashboard.service";

type StatusOverviewCardsProps = {
  overview?: DashboardOverview | null;
};

function planKeyFromCode(plan: string) {
  if (plan === "free_trial") return "dashboard.membership.plan.freeTrial";
  if (plan === "basic_monthly") return "dashboard.membership.plan.basicMonthly";
  return "dashboard.membership.plan.freeTrial";
}

function formatDelta24h(cur: number, prev: number) {
  const d = cur - prev;
  if (d > 0) return `+${d}`;
  return String(d);
}

export function StatusOverviewCards({ overview }: StatusOverviewCardsProps) {
  const { t } = useT();
  const act24 = overview?.activity_count_24h ?? 0;
  const actPrev = overview?.activity_count_prev_24h ?? 0;
  const ratePct = overview?.activity_success_rate_pct ?? 0;
  const subStatus = overview?.subscription_status ?? "active";
  const membershipSub =
    subStatus === "expired"
      ? t("dashboard.membership.subscriptionExpired")
      : t("dashboard.membership.trialDaysLeft", { days: overview?.trial_days_left ?? 0 });

  const stats = [
    {
      titleKey: "dashboard.overview.membership.title",
      value: t(planKeyFromCode(overview?.plan || "free_trial")),
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
          className="surface-card rounded-2xl p-4 transition-transform duration-200 hover:-translate-y-0.5"
        >
          <div className="flex items-start justify-between">
            <p className="text-xs tracking-wide text-white/65 uppercase">{t(stat.titleKey)}</p>
            <stat.icon className="size-4 text-blue-200" />
          </div>
          <p className="mt-3 text-2xl font-semibold text-white">{stat.value}</p>
          <p className="mt-1 text-xs text-white/60">{stat.subValue}</p>
        </article>
      ))}
    </section>
  );
}
