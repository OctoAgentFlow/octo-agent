"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Lightbulb, Radar, RefreshCw, Send, Sparkles } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";

import { SectionShell } from "./section-shell";

const loopSteps = [
  { icon: Radar, titleKey: "marketing.growthLoop.steps.discover.title", descKey: "marketing.growthLoop.steps.discover.desc", statKey: "marketing.growthLoop.steps.discover.stat", tone: "text-cyan-100 border-cyan-300/20 bg-cyan-400/10" },
  { icon: CheckCircle2, titleKey: "marketing.growthLoop.steps.review.title", descKey: "marketing.growthLoop.steps.review.desc", statKey: "marketing.growthLoop.steps.review.stat", tone: "text-emerald-100 border-emerald-300/20 bg-emerald-400/10" },
  { icon: Send, titleKey: "marketing.growthLoop.steps.publish.title", descKey: "marketing.growthLoop.steps.publish.desc", statKey: "marketing.growthLoop.steps.publish.stat", tone: "text-amber-100 border-amber-300/20 bg-amber-400/10" },
  { icon: RefreshCw, titleKey: "marketing.growthLoop.steps.learn.title", descKey: "marketing.growthLoop.steps.learn.desc", statKey: "marketing.growthLoop.steps.learn.stat", tone: "text-rose-100 border-rose-300/20 bg-rose-400/10" },
];

const opportunityRows = [
  { titleKey: "marketing.growthLoop.preview.rows.highScore.title", metaKey: "marketing.growthLoop.preview.rows.highScore.meta", score: "92", tone: "text-emerald-200" },
  { titleKey: "marketing.growthLoop.preview.rows.risky.title", metaKey: "marketing.growthLoop.preview.rows.risky.meta", score: "74", tone: "text-amber-200" },
  { titleKey: "marketing.growthLoop.preview.rows.ready.title", metaKey: "marketing.growthLoop.preview.rows.ready.meta", score: "Ready", tone: "text-cyan-200" },
];

export function GrowthOperationsLoopSection() {
  const { t } = useT();

  return (
    <SectionShell
      id="growth-loop"
      badge={t("marketing.growthLoop.badge")}
      title={t("marketing.growthLoop.title")}
      description={t("marketing.growthLoop.description")}
      className="pt-8"
    >
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-stretch">
        <div className="grid gap-3 sm:grid-cols-2">
          {loopSteps.map((step, index) => (
            <article key={step.titleKey} className="surface-card flex min-h-[210px] flex-col rounded-2xl p-5">
              <div className="mb-5 flex items-start justify-between gap-3">
                <span className={cn("grid size-11 place-items-center rounded-2xl border", step.tone)}>
                  <step.icon className="size-5" />
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-white/45">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="text-base font-semibold text-white">{t(step.titleKey)}</h3>
              <p className="mt-2 text-sm leading-6 text-white/62">{t(step.descKey)}</p>
              <p className="mt-auto pt-5 text-xs font-medium text-white/45">{t(step.statKey)}</p>
            </article>
          ))}
        </div>

        <div className="overflow-hidden rounded-3xl border border-white/12 bg-[#08101d]/90 shadow-[0_24px_90px_rgba(0,0,0,0.28)]">
          <div className="border-b border-white/10 p-5 md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-100">
                  <Sparkles className="size-4" />
                  {t("marketing.growthLoop.preview.kicker")}
                </p>
                <h3 className="mt-2 text-2xl font-semibold tracking-tight text-white">{t("marketing.growthLoop.preview.title")}</h3>
                <p className="mt-2 max-w-xl text-sm leading-6 text-white/58">{t("marketing.growthLoop.preview.description")}</p>
              </div>
              <Link
                href="/login"
                className={cn(buttonVariants({ variant: "default" }), "h-10 shrink-0 bg-white text-[#07111f] hover:bg-white/90")}
              >
                {t("marketing.growthLoop.cta")}
              </Link>
            </div>
          </div>

          <div className="grid gap-0 lg:grid-cols-[1.05fr_0.95fr]">
            <div className="border-b border-white/10 p-5 lg:border-r lg:border-b-0 md:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">{t("marketing.growthLoop.preview.inboxTitle")}</p>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2.5 py-1 text-xs text-cyan-100">
                  {t("marketing.growthLoop.preview.live")}
                </span>
              </div>
              <div className="space-y-3">
                {opportunityRows.map((row) => (
                  <div key={row.titleKey} className="grid grid-cols-[1fr_auto] gap-4 rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{t(row.titleKey)}</p>
                      <p className="mt-1 text-xs leading-5 text-white/52">{t(row.metaKey)}</p>
                    </div>
                    <span className={cn("text-sm font-semibold", row.tone)}>{row.score}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 md:p-6">
              <p className="mb-4 text-sm font-semibold text-white">{t("marketing.growthLoop.preview.learningTitle")}</p>
              <div className="space-y-3">
                {["salesy", "context", "tone"].map((item) => (
                  <div key={item} className="rounded-2xl border border-white/10 bg-black/22 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-white">{t(`marketing.growthLoop.preview.learning.${item}.title`)}</p>
                      <Lightbulb className="size-4 text-amber-200" />
                    </div>
                    <p className="mt-2 text-xs leading-5 text-white/52">{t(`marketing.growthLoop.preview.learning.${item}.desc`)}</p>
                  </div>
                ))}
              </div>
              <a href="#operating-loop" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-cyan-100 hover:text-white">
                {t("marketing.growthLoop.secondaryCta")}
                <ArrowRight className="size-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}
