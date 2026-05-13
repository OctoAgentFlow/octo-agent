"use client";

import { CalendarClock, CheckCircle2, FileText, Send, ShieldCheck } from "lucide-react";

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
        <div className="rounded-2xl border border-white/12 bg-white/[0.045] p-5 md:p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg border border-blue-300/20 bg-blue-500/12 text-blue-200">
              <Send className="size-5" />
            </span>
            <div>
              <p className="text-base font-semibold text-white">{t("marketing.autoPost.flowTitle")}</p>
              <p className="text-sm text-white/55">{t("marketing.autoPost.flowDesc")}</p>
            </div>
          </div>
          <div className="space-y-3">
            {autoPostSteps.map((step, index) => (
              <div key={step.titleKey} className="grid gap-3 rounded-lg border border-white/10 bg-black/12 p-3 sm:grid-cols-[36px_1fr]">
                <span className="grid size-9 place-items-center rounded-md bg-white/[0.06] text-cyan-200">
                  <step.icon className="size-4" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/40">0{index + 1}</span>
                    <p className="text-sm font-semibold text-white">{t(step.titleKey)}</p>
                  </div>
                  <p className="mt-1 text-sm text-white/62">{t(step.descKey)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/12 bg-[#080d20]">
          <div className="border-b border-white/10 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-base font-semibold text-white">{t("marketing.autoPost.queueTitle")}</p>
                <p className="text-sm text-white/55">{t("marketing.autoPost.queueDesc")}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-100">
                <CheckCircle2 className="size-3.5" />
                {t("marketing.autoPost.queueHealthy")}
              </span>
            </div>
          </div>
          <div className="divide-y divide-white/10">
            {sampleQueue.map((item) => (
              <div key={item.textKey} className="grid gap-3 px-5 py-4 text-sm md:grid-cols-[82px_1fr_92px]">
                <span className="text-white/50">{t(item.timeKey)}</span>
                <span className="text-white/78">{t(item.textKey)}</span>
                <span className="text-right text-cyan-100/80">{t(item.statusKey)}</span>
              </div>
            ))}
          </div>
          <div className="grid gap-3 border-t border-white/10 p-5 sm:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
              <p className="text-xs text-white/45">{t("marketing.autoPost.metrics.today")}</p>
              <p className="mt-1 text-xl font-semibold text-white">6</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
              <p className="text-xs text-white/45">{t("marketing.autoPost.metrics.success")}</p>
              <p className="mt-1 text-xl font-semibold text-white">100%</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
              <p className="text-xs text-white/45">{t("marketing.autoPost.metrics.next")}</p>
              <p className="mt-1 text-xl font-semibold text-white">42m</p>
            </div>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}
