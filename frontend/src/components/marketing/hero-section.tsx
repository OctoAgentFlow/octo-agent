"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { heroStats, trustBadges } from "@/mocks/landing.mock";

export function HeroSection() {
  const { t } = useT();
  return (
    <section className="mx-auto grid w-full max-w-6xl gap-10 px-6 pt-10 pb-12 md:grid-cols-[1.04fr_0.96fr] md:px-8 md:pt-16">
      <div className="flex flex-col justify-center space-y-6">
        <span className="inline-flex w-fit rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-200 uppercase">
          {t("marketing.hero.badge")}
        </span>
        <h1 className="max-w-2xl text-4xl leading-tight font-semibold text-white md:text-6xl">
          {t("marketing.hero.title")}
        </h1>
        <p className="max-w-xl text-base text-white/70 md:text-lg">
          {t("marketing.hero.subtitle")}
        </p>
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <Link
            href="/login"
            className={cn(
              buttonVariants({ variant: "default" }),
              "h-11 w-full bg-gradient-to-r from-blue-500 to-violet-500 text-white hover:opacity-90 sm:h-10 sm:w-auto"
            )}
          >
            {t("marketing.hero.primaryCta")}
          </Link>
          <a
            href="#preview"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "hidden h-10 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white sm:inline-flex"
            )}
          >
            {t("marketing.hero.secondaryCta")}
            <ArrowRight className="size-4" />
          </a>
          <a href="#workflow" className="text-center text-sm text-blue-200/90 sm:hidden">
            {t("marketing.hero.mobileLink")}
          </a>
        </div>
        <p className="text-xs text-white/55">{t("marketing.hero.note")}</p>
        <div className="grid grid-cols-3 gap-3 pt-1">
          {heroStats.map((item) => (
            <div
              key={item.labelKey}
              className="rounded-lg border border-white/10 bg-white/[0.045] p-3 transition-transform duration-200 hover:-translate-y-0.5"
            >
              <p className="text-lg font-semibold text-white">{item.value}</p>
              <p className="text-xs text-white/60">{t(item.labelKey)}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-white/12 bg-[#080d20] shadow-2xl shadow-blue-950/30">
        <div className="relative aspect-[1.5/1] w-full border-b border-white/10 md:aspect-[1.35/1]">
          <Image
            src="/brand/oaf-logo.png"
            alt={t("common.brand")}
            fill
            sizes="(min-width: 768px) 520px, 100vw"
            className="object-cover"
            priority
          />
        </div>
        <div className="grid gap-0 md:grid-cols-[1fr_0.82fr]">
          <div className="border-b border-white/10 p-5 md:border-r md:border-b-0">
            <p className="text-sm font-medium text-white">{t("marketing.hero.queue.title")}</p>
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/80">
                {t("marketing.hero.queue.item1")}
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/80">
                {t("marketing.hero.queue.item2")}
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/80">
                {t("marketing.hero.queue.item3")}
              </div>
            </div>
          </div>
          <div className="p-5">
            <p className="text-sm font-medium text-white">{t("marketing.hero.trust.title")}</p>
            <div className="mt-4 space-y-2">
              {trustBadges.map((badge) => (
                <span
                  key={badge.labelKey}
                  className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/72"
                >
                  <badge.icon className="size-4 text-blue-300" />
                  {t(badge.labelKey)}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
