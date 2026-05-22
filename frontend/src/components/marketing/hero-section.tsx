"use client";

import Link from "next/link";
import { ArrowRight, Bot, CheckCircle2, Database, Globe2, ListChecks, ShieldCheck, Sparkles, Zap } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { heroStats, trustBadges } from "@/mocks/landing.mock";

const personaFields = [
  ["marketing.hero.persona.occupationLabel", "marketing.hero.persona.occupationValue", "default"],
  ["marketing.hero.persona.voiceLabel", "marketing.hero.persona.voiceValue", "default"],
  ["marketing.hero.persona.topicsLabel", "marketing.hero.persona.topicsValue", "wide"],
  ["marketing.hero.persona.guardrailsLabel", "marketing.hero.persona.guardrailsValue", "wide"],
  ["marketing.hero.persona.growthGoalLabel", "marketing.hero.persona.growthGoalValue", "wide"],
] as const;

const personaTasks = [
  ["marketing.hero.persona.task1", "marketing.hero.persona.task1Status"],
  ["marketing.hero.persona.task2", "marketing.hero.persona.task2Status"],
  ["marketing.hero.persona.task3", "marketing.hero.persona.task3Status"],
  ["marketing.hero.persona.task4", "marketing.hero.persona.task4Status"],
] as const;

const personaSignals = [
  { icon: Sparkles, labelKey: "marketing.hero.persona.completenessLabel", valueKey: "marketing.hero.persona.completenessValue" },
  { icon: Globe2, labelKey: "marketing.hero.persona.languageLabel", valueKey: "marketing.hero.persona.languageValue" },
  { icon: Zap, labelKey: "marketing.hero.persona.modeLabel", valueKey: "marketing.hero.persona.modeValue" },
] as const;

export function HeroSection() {
  const { t } = useT();
  return (
    <section className="mx-auto grid w-full max-w-7xl gap-10 px-6 pt-10 pb-12 md:grid-cols-[1.06fr_0.94fr] md:px-8 md:pt-16 lg:gap-12">
      <div className="flex flex-col justify-center space-y-6">
        <span className="inline-flex w-fit rounded-full border border-blue-400/30 bg-blue-500/10 px-3.5 py-1.5 text-xs font-medium text-blue-100 shadow-[0_0_24px_rgba(59,130,246,0.12)]">
          {t("marketing.hero.badge")}
        </span>
        <h1 className="max-w-3xl text-4xl leading-[1.12] font-semibold text-balance text-white md:text-5xl lg:text-6xl">
          <span className="block">{t("marketing.hero.titleLine1")}</span>
          <span className="block">{t("marketing.hero.titleLine2")}</span>
        </h1>
        <p className="max-w-2xl text-base leading-8 text-white/70 md:text-lg">
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
            href="#oaf-bot"
            className={cn(
              buttonVariants({ variant: "outline" }),
              "hidden h-10 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white sm:inline-flex"
            )}
          >
            {t("marketing.hero.secondaryCta")}
            <ArrowRight className="size-4" />
          </a>
          <a href="#oaf-bot" className="text-center text-sm text-blue-200/90 sm:hidden">
            {t("marketing.hero.mobileLink")}
          </a>
        </div>
        <p className="text-xs text-white/55">{t("marketing.hero.note")}</p>
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.035] p-2.5">
          <span className="px-2 text-xs text-white/46">{t("marketing.hero.trust.title")}</span>
          {trustBadges.map((badge) => (
            <span key={badge.labelKey} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/16 px-2.5 py-1 text-xs text-white/68">
              <badge.icon className="size-3.5 text-blue-200" />
              {t(badge.labelKey)}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3 pt-1">
          {heroStats.map((item) => (
            <div
              key={item.labelKey}
              className="min-h-24 rounded-2xl border border-white/10 bg-white/[0.045] p-3.5 transition-transform duration-200 hover:-translate-y-0.5"
            >
              <p className="text-lg font-semibold leading-tight text-white">{t(item.valueKey)}</p>
              <p className="mt-2 text-xs leading-relaxed text-white/60">{t(item.labelKey)}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="relative overflow-hidden rounded-3xl border border-white/12 bg-[#080d20]/95 p-3 shadow-2xl shadow-blue-950/30 sm:p-4">
        <div className="pointer-events-none absolute -top-20 -right-16 size-56 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 size-64 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045]">
          <div className="border-b border-white/10 bg-black/18 p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100">
                <span className="size-1.5 rounded-full bg-emerald-300" />
                {t("marketing.hero.persona.status")}
              </span>
              <span className="rounded-full border border-blue-300/20 bg-blue-500/10 px-3 py-1 text-xs text-blue-100">
                {t("marketing.hero.persona.accountType")}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl border border-blue-300/25 bg-blue-500/12 text-blue-200 shadow-[0_0_24px_rgba(59,130,246,0.22)]">
                <Bot className="size-6" />
              </span>
              <div>
                <p className="text-xs tracking-[0.18em] text-blue-200 uppercase">{t("marketing.hero.persona.kicker")}</p>
                <h2 className="mt-1 text-xl font-semibold text-white">{t("marketing.hero.persona.title")}</h2>
                <p className="mt-1 text-xs text-white/48">{t("marketing.hero.persona.account")}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
            {personaSignals.map((signal) => (
              <div key={signal.labelKey} className="rounded-2xl border border-white/10 bg-black/18 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs text-white/45">
                  <signal.icon className="size-3.5 text-blue-200" />
                  {t(signal.labelKey)}
                </div>
                <p className="text-sm font-semibold text-white">{t(signal.valueKey)}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-3 px-4 sm:grid-cols-2 sm:px-5">
            {personaFields.map(([labelKey, valueKey, layout]) => (
              <div
                key={labelKey}
                className={cn(
                  "rounded-xl border border-white/10 bg-[#0b1230]/80 p-3",
                  layout === "wide" ? "sm:col-span-2" : ""
                )}
              >
                <p className="text-xs text-white/45">{t(labelKey)}</p>
                <p className="mt-1 text-sm leading-relaxed text-white/82">{t(valueKey)}</p>
              </div>
            ))}
          </div>

          <div className="mx-4 mt-4 rounded-2xl border border-violet-300/20 bg-violet-500/10 p-4 sm:mx-5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-white">
                <ListChecks className="size-4 text-violet-200" />
                {t("marketing.hero.persona.tasksTitle")}
              </div>
              <span className="rounded-full border border-white/10 bg-black/18 px-2.5 py-1 text-xs text-white/55">
                {t("marketing.hero.persona.queueStatus")}
              </span>
            </div>
            <div className="mt-3 space-y-2">
              {personaTasks.map(([taskKey, statusKey]) => (
                <div key={taskKey} className="flex items-start gap-2 text-sm text-white/74">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" />
                  <span className="min-w-0 flex-1">{t(taskKey)}</span>
                  <span className="shrink-0 text-xs text-violet-100/70">{t(statusKey)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="m-4 grid gap-3 sm:m-5 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-white/58">
              <ShieldCheck className="size-4 shrink-0 text-blue-200" />
              <span>{t("marketing.hero.persona.footer")}</span>
            </div>
            <div className="hidden items-center gap-2 rounded-xl border border-blue-300/20 bg-blue-500/10 px-3 py-2 text-xs text-blue-100 sm:flex">
              <Database className="size-4" />
              {t("marketing.hero.persona.source")}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
