"use client";

import { Button } from "@/components/ui/button";
import { membership, upgradePrompt } from "@/mocks/dashboard.mock";
import { useT } from "@/i18n/use-t";

import { SectionCard } from "./section-card";

export function TrialUpgradeBanner() {
  const { t } = useT();
  const MembershipBadge = membership.badge;

  return (
    <SectionCard
      title={t("dashboard.upgrade.section.title")}
      description={t("dashboard.upgrade.section.description")}
    >
      <div className="rounded-xl border border-blue-300/20 bg-blue-500/10 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="inline-flex items-center gap-2 text-sm text-blue-100">
              <MembershipBadge className="size-4" />
              {t("dashboard.upgrade.membershipLine", {
                plan: t(membership.planKey),
                days: membership.trialDaysLeft,
              })}
            </p>
            <h4 className="text-lg font-semibold text-white">{t(upgradePrompt.titleKey)}</h4>
            <p className="text-sm text-white/70">{t(upgradePrompt.descriptionKey)}</p>
          </div>
          <Button className="bg-gradient-to-r from-blue-500 to-violet-500 text-white hover:opacity-90">
            {t(upgradePrompt.ctaKey)}
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {upgradePrompt.perksKeys.map((perkKey) => (
            <span key={perkKey} className="rounded-full border border-white/15 px-2.5 py-1 text-xs text-white/70">
              {t(perkKey)}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-white/55">{t(membership.billingHintKey, membership.billingHintParams)}</p>
      </div>
    </SectionCard>
  );
}
