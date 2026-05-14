"use client";

import Link from "next/link";
import { ArrowRight, Bot, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { heroStats } from "@/mocks/landing.mock";

const personaFields = [
  ["marketing.hero.persona.occupationLabel", "marketing.hero.persona.occupationValue"],
  ["marketing.hero.persona.personalityLabel", "marketing.hero.persona.personalityValue"],
  ["marketing.hero.persona.voiceLabel", "marketing.hero.persona.voiceValue"],
  ["marketing.hero.persona.topicsLabel", "marketing.hero.persona.topicsValue"],
  ["marketing.hero.persona.guardrailsLabel", "marketing.hero.persona.guardrailsValue"],
] as const;

const personaTasks = [
  "marketing.hero.persona.task1",
  "marketing.hero.persona.task2",
  "marketing.hero.persona.task3",
  "marketing.hero.persona.task4",
];

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
      <div className="relative overflow-hidden rounded-3xl border border-white/12 bg-[#080d20]/95 p-5 shadow-2xl shadow-blue-950/30">
        <div className="pointer-events-none absolute -top-20 -right-16 size-56 rounded-full bg-violet-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 size-64 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="relative rounded-2xl border border-white/10 bg-white/[0.045] p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl border border-blue-300/25 bg-blue-500/12 text-blue-200 shadow-[0_0_24px_rgba(59,130,246,0.22)]">
                <Bot className="size-6" />
              </span>
              <div>
                <p className="text-xs tracking-[0.18em] text-blue-200 uppercase">{t("marketing.hero.persona.kicker")}</p>
                <h2 className="mt-1 text-xl font-semibold text-white">{t("marketing.hero.persona.title")}</h2>
              </div>
            </div>
            <span className="hidden rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100 sm:inline-flex">
              {t("marketing.hero.persona.status")}
            </span>
          </div>

          <div className="mt-5 grid gap-3">
            {personaFields.map(([labelKey, valueKey]) => (
              <div key={labelKey} className="rounded-xl border border-white/10 bg-[#0b1230]/80 p-3">
                <p className="text-xs text-white/45">{t(labelKey)}</p>
                <p className="mt-1 text-sm leading-relaxed text-white/82">{t(valueKey)}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-violet-300/20 bg-violet-500/10 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <Sparkles className="size-4 text-violet-200" />
              {t("marketing.hero.persona.tasksTitle")}
            </div>
            <div className="mt-3 space-y-2">
              {personaTasks.map((taskKey) => (
                <div key={taskKey} className="flex items-start gap-2 text-sm text-white/74">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" />
                  <span>{t(taskKey)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-white/58">
            <ShieldCheck className="size-4 text-blue-200" />
            {t("marketing.hero.persona.footer")}
          </div>
        </div>
      </div>
    </section>
  );
}
