"use client";

import { CalendarClock, CheckCircle2, FileText, Radar, Send, ShieldCheck } from "lucide-react";

import { useT } from "@/i18n/use-t";

import { SectionShell } from "./section-shell";

const autoPostSteps = [
  { icon: FileText, titleKey: "marketing.autoPost.steps.queue.title", descKey: "marketing.autoPost.steps.queue.desc" },
  { icon: CalendarClock, titleKey: "marketing.autoPost.steps.schedule.title", descKey: "marketing.autoPost.steps.schedule.desc" },
  { icon: ShieldCheck, titleKey: "marketing.autoPost.steps.guard.title", descKey: "marketing.autoPost.steps.guard.desc" },
  { icon: Send, titleKey: "marketing.autoPost.steps.publish.title", descKey: "marketing.autoPost.steps.publish.desc" },
];

const sampleQueue = [
  { timeKey: "marketing.autoPost.queue.item1.time", textKey: "marketing.autoPost.queue.item1.text", statusKey: "marketing.autoPost.queue.item1.status" },
  { timeKey: "marketing.autoPost.queue.item2.time", textKey: "marketing.autoPost.queue.item2.text", statusKey: "marketing.autoPost.queue.item2.status" },
  { timeKey: "marketing.autoPost.queue.item3.time", textKey: "marketing.autoPost.queue.item3.text", statusKey: "marketing.autoPost.queue.item3.status" },
];

const trendSignals = [
  "marketing.autoPost.trends.signal.persona",
  "marketing.autoPost.trends.signal.explain",
  "marketing.autoPost.trends.signal.feedback",
];

export function AutoPostSection() {
  const { t } = useT();

  return (
    <SectionShell
      id="auto-post"
      badge={t("marketing.autoPost.badge")}
      title={t("marketing.autoPost.title")}
      description={t("marketing.autoPost.description")}
      className="pt-10"
    >
      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="order-2 rounded-2xl border border-white/12 bg-white/[0.045] p-4 md:p-6 lg:order-1">
          <div className="mb-4 flex items-start gap-3 md:mb-5 md:items-center">
            <span className="grid size-10 place-items-center rounded-lg border border-blue-300/20 bg-blue-500/12 text-blue-200">
              <Send className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold text-white">{t("marketing.autoPost.flowTitle")}</p>
              <p className="mt-1 text-sm leading-relaxed text-white/55">{t("marketing.autoPost.flowDesc")}</p>
            </div>
          </div>
          <div className="mb-4 rounded-xl border border-cyan-300/20 bg-cyan-400/[0.07] p-4 md:mb-5">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-cyan-200/20 bg-black/20 text-cyan-100">
                <Radar className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{t("marketing.autoPost.trends.title")}</p>
                <p className="mt-1 text-sm leading-relaxed text-white/62">{t("marketing.autoPost.trends.description")}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {trendSignals.map((signal) => (
                    <span key={signal} className="rounded-full border border-cyan-200/15 bg-black/20 px-3 py-1 text-xs text-cyan-50/85">
                      {t(signal)}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-2.5 md:space-y-3">
            {autoPostSteps.map((step, index) => (
              <div key={step.titleKey} className="grid grid-cols-[34px_1fr] gap-3 rounded-xl border border-white/10 bg-black/12 p-3">
                <span className="grid size-8 place-items-center rounded-md bg-white/[0.06] text-cyan-200 sm:size-9">
                  <step.icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/40">0{index + 1}</span>
                    <p className="text-sm font-semibold text-white">{t(step.titleKey)}</p>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-white/62">{t(step.descKey)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="order-1 overflow-hidden rounded-2xl border border-white/12 bg-[#080d20] lg:order-2">
          <div className="border-b border-white/10 px-4 py-4 md:px-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-base font-semibold text-white">{t("marketing.autoPost.queueTitle")}</p>
                <p className="mt-1 text-sm leading-relaxed text-white/55">{t("marketing.autoPost.queueDesc")}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100">
                <CheckCircle2 className="size-3.5" />
                {t("marketing.autoPost.queueHealthy")}
              </span>
            </div>
          </div>
          <div className="divide-y divide-white/10">
            {sampleQueue.map((item) => (
              <div key={item.textKey} className="grid gap-2 px-4 py-4 text-sm md:grid-cols-[82px_1fr_92px] md:gap-3 md:px-5">
                <div className="flex items-center justify-between gap-3 md:block">
                  <span className="text-white/50">{t(item.timeKey)}</span>
                  <span className="rounded-full border border-cyan-200/15 bg-cyan-300/10 px-2 py-0.5 text-xs text-cyan-100/80 md:hidden">
                    {t(item.statusKey)}
                  </span>
                </div>
                <span className="leading-relaxed text-white/78">{t(item.textKey)}</span>
                <span className="hidden text-right text-cyan-100/80 md:block">{t(item.statusKey)}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 border-t border-white/10 p-4 sm:gap-3 md:p-5">
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
              <p className="text-xs text-white/45">{t("marketing.autoPost.metrics.today")}</p>
              <p className="mt-1 text-xl font-semibold text-white">{t("marketing.autoPost.metrics.todayValue")}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
              <p className="text-xs text-white/45">{t("marketing.autoPost.metrics.success")}</p>
              <p className="mt-1 text-xl font-semibold text-white">{t("marketing.autoPost.metrics.successValue")}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
              <p className="text-xs text-white/45">{t("marketing.autoPost.metrics.next")}</p>
              <p className="mt-1 text-xl font-semibold text-white">{t("marketing.autoPost.metrics.nextValue")}</p>
            </div>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}
