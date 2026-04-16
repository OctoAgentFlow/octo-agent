"use client";

import { overviewStats } from "@/mocks/dashboard.mock";
import { useT } from "@/i18n/use-t";

export function StatusOverviewCards() {
  const { t } = useT();
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {overviewStats.map((stat) => (
        <article
          key={stat.titleKey}
          className="surface-card rounded-2xl p-4 transition-transform duration-200 hover:-translate-y-0.5"
        >
          <div className="flex items-start justify-between">
            <p className="text-xs tracking-wide text-white/65 uppercase">{t(stat.titleKey)}</p>
            <stat.icon className="size-4 text-blue-200" />
          </div>
          <p className="mt-3 text-2xl font-semibold text-white">{t(stat.valueKey, stat.valueParams)}</p>
          <p className="mt-1 text-xs text-white/60">{t(stat.subValueKey, stat.subValueParams)}</p>
        </article>
      ))}
    </section>
  );
}
