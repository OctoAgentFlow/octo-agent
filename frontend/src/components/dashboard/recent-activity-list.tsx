"use client";

import { recentActivities } from "@/mocks/dashboard.mock";
import { useT } from "@/i18n/use-t";

import { SectionCard } from "./section-card";

export function RecentActivityList() {
  const { t } = useT();
  return (
    <SectionCard
      title={t("dashboard.activity.section.title")}
      description={t("dashboard.activity.section.description")}
    >
      <div className="space-y-2">
        {recentActivities.map((activity) => (
          <article
            key={activity.id}
            className="grid gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm transition-colors hover:bg-white/10 md:grid-cols-[70px_1fr_90px]"
          >
            <span className="text-white/55">{activity.time}</span>
            <div>
              <p className="font-medium text-white">{t(activity.titleKey)}</p>
              <p className="text-xs text-white/60">{t(activity.detailKey)}</p>
            </div>
            <span className="text-right text-white/65">{t(activity.statusKey)}</span>
          </article>
        ))}
      </div>
    </SectionCard>
  );
}
