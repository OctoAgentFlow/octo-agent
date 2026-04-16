"use client";

import { connectedAccounts } from "@/mocks/dashboard.mock";
import { useT } from "@/i18n/use-t";

import { SectionCard } from "./section-card";

export function XAccountStatus() {
  const { t } = useT();
  return (
    <SectionCard
      title={t("dashboard.accounts.section.title")}
      description={t("dashboard.accounts.section.description")}
    >
      <div className="space-y-3">
        {connectedAccounts.map((account) => (
          <article key={account.handle} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-white/60">{t(account.platformKey)}</p>
                <p className="text-lg font-semibold text-white">{account.handle}</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-200">
                <span className="size-1.5 animate-pulse rounded-full bg-emerald-300" />
                {t(account.statusKey)}
              </span>
            </div>
            <div className="mt-4 grid gap-2 text-sm text-white/70 sm:grid-cols-3">
              <p>{t("dashboard.accounts.labels.followers", { count: account.followers })}</p>
              <p>{t("dashboard.accounts.labels.following", { count: account.following })}</p>
              <p>{t("dashboard.accounts.labels.lastSync", { minutes: account.lastSyncMinutes })}</p>
            </div>
          </article>
        ))}
      </div>
    </SectionCard>
  );
}
