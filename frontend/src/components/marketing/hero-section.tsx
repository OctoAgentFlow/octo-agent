"use client";

import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";
import { heroStats, trustBadges } from "@/mocks/landing.mock";

export function HeroSection() {
  const { t } = useT();
  return (
    <section className="mx-auto grid w-full max-w-6xl gap-10 px-6 pt-14 pb-12 md:grid-cols-2 md:px-8 md:pt-20">
      <div className="space-y-6">
        <span className="inline-flex rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-xs tracking-wide text-blue-200 uppercase">
          {t("marketing.hero.badge")}
        </span>
        <h1 className="text-4xl leading-tight font-semibold tracking-tight text-white md:text-5xl">
          {t("marketing.hero.title")}
        </h1>
        <p className="max-w-xl text-base text-white/70 md:text-lg">
          {t("marketing.hero.subtitle")}
        </p>
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <Button className="h-11 w-full bg-gradient-to-r from-blue-500 to-violet-500 text-white hover:opacity-90 sm:h-9 sm:w-auto">
            {t("marketing.hero.primaryCta")}
          </Button>
          <Button
            variant="outline"
            className="hidden border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white sm:inline-flex"
          >
            {t("marketing.hero.secondaryCta")}
            <ArrowRight className="size-4" />
          </Button>
          <a href="#workflow" className="text-center text-sm text-blue-200/90 sm:hidden">
            {t("marketing.hero.mobileLink")}
          </a>
        </div>
        <p className="text-xs text-white/55">{t("marketing.hero.note")}</p>
        <div className="grid grid-cols-3 gap-3">
          {heroStats.map((item) => (
            <div
              key={item.labelKey}
              className="surface-card rounded-xl p-3 transition-transform duration-200 hover:-translate-y-0.5"
            >
              <p className="text-lg font-semibold text-white">{item.value}</p>
              <p className="text-xs text-white/60">{t(item.labelKey)}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="surface-card relative rounded-2xl p-6">
        <div className="absolute -top-10 -right-8 h-24 w-24 rounded-full bg-violet-500/30 blur-2xl" />
        <div className="space-y-4">
          <p className="text-sm font-medium text-white/70">{t("marketing.hero.queue.title")}</p>
          <div className="space-y-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/80">
              {t("marketing.hero.queue.item1")}
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/80">
              {t("marketing.hero.queue.item2")}
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/80">
              {t("marketing.hero.queue.item3")}
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            {trustBadges.map((badge) => (
              <span
                key={badge.labelKey}
                className="inline-flex items-center gap-1 rounded-full border border-white/15 px-2.5 py-1 text-xs text-white/70"
              >
                <badge.icon className="size-3.5" />
                {t(badge.labelKey)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
