"use client";

import Link from "next/link";
import { ArrowRight, Bot, Database, ListChecks, Send } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";

import { SectionShell } from "./section-shell";

const loopSteps = [
  {
    icon: Database,
    titleKey: "marketing.loop.steps.library.title",
    descKey: "marketing.loop.steps.library.desc",
    statKey: "marketing.loop.steps.library.stat",
  },
  {
    icon: Bot,
    titleKey: "marketing.loop.steps.persona.title",
    descKey: "marketing.loop.steps.persona.desc",
    statKey: "marketing.loop.steps.persona.stat",
  },
  {
    icon: ListChecks,
    titleKey: "marketing.loop.steps.queue.title",
    descKey: "marketing.loop.steps.queue.desc",
    statKey: "marketing.loop.steps.queue.stat",
  },
  {
    icon: Send,
    titleKey: "marketing.loop.steps.publisher.title",
    descKey: "marketing.loop.steps.publisher.desc",
    statKey: "marketing.loop.steps.publisher.stat",
  },
];

export function OperatingLoopSection() {
  const { t } = useT();

  return (
    <SectionShell
      id="operating-loop"
      badge={t("marketing.loop.badge")}
      title={t("marketing.loop.title")}
      description={t("marketing.loop.description")}
    >
      <div className="overflow-hidden rounded-3xl border border-white/12 bg-[#080d20]/88 shadow-[0_20px_80px_rgba(2,6,23,0.28)]">
        <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="border-b border-white/10 p-5 md:p-6 lg:border-r lg:border-b-0">
            <div className="grid gap-3 sm:grid-cols-2">
              {loopSteps.map((step, index) => (
                <article key={step.titleKey} className="group relative min-h-[190px] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-blue-300/25 hover:bg-white/[0.065]">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <span className="grid size-10 place-items-center rounded-xl border border-blue-300/20 bg-blue-500/12 text-blue-100">
                      <step.icon className="size-5" />
                    </span>
                    <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-xs text-white/45">
                      0{index + 1}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-white">{t(step.titleKey)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/62">{t(step.descKey)}</p>
                  <p className="mt-4 rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs text-blue-100/78">
                    {t(step.statKey)}
                  </p>
                </article>
              ))}
            </div>
          </div>

          <div className="relative overflow-hidden p-5 md:p-6">
            <div className="pointer-events-none absolute -top-20 -right-20 size-64 rounded-full bg-blue-500/15 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-20 size-64 rounded-full bg-violet-500/12 blur-3xl" />
            <div className="relative flex h-full min-h-[360px] flex-col justify-between rounded-2xl border border-white/10 bg-black/22 p-5">
              <div>
                <p className="text-sm font-semibold text-blue-100">{t("marketing.loop.preview.kicker")}</p>
                <h3 className="mt-2 text-2xl font-semibold leading-tight text-white">{t("marketing.loop.preview.title")}</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/60">{t("marketing.loop.preview.description")}</p>
              </div>

              <div className="my-6 space-y-3">
                {["content", "bot", "queue"].map((item) => (
                  <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                    <p className="text-xs text-white/42">{t(`marketing.loop.preview.${item}.label`)}</p>
                    <p className="mt-1 text-sm font-semibold text-white">{t(`marketing.loop.preview.${item}.value`)}</p>
                    <p className="mt-1 text-xs leading-5 text-white/55">{t(`marketing.loop.preview.${item}.desc`)}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/login"
                  className={cn(buttonVariants({ variant: "default" }), "bg-gradient-to-r from-blue-500 to-violet-500 text-white hover:opacity-90")}
                >
                  {t("marketing.loop.cta.primary")}
                </Link>
                <a href="#faq" className="inline-flex items-center gap-1 text-sm font-semibold text-blue-100 hover:text-white">
                  {t("marketing.loop.cta.secondary")}
                  <ArrowRight className="size-4" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}
