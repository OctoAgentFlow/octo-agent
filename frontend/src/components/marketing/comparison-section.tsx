"use client";

import { Bot, CheckCircle2, FileText, ListChecks, Repeat2, ShieldCheck } from "lucide-react";

import { useT } from "@/i18n/use-t";

import { SectionShell } from "./section-shell";

const genericItems = [
  "marketing.comparison.generic.item1",
  "marketing.comparison.generic.item2",
  "marketing.comparison.generic.item3",
  "marketing.comparison.generic.item4",
] as const;

const oafItems = [
  "marketing.comparison.oaf.item1",
  "marketing.comparison.oaf.item2",
  "marketing.comparison.oaf.item3",
  "marketing.comparison.oaf.item4",
] as const;

const controlItems = [
  { icon: ShieldCheck, titleKey: "marketing.comparison.controls.review.title", descKey: "marketing.comparison.controls.review.desc" },
  { icon: Repeat2, titleKey: "marketing.comparison.controls.mode.title", descKey: "marketing.comparison.controls.mode.desc" },
  { icon: ListChecks, titleKey: "marketing.comparison.controls.trace.title", descKey: "marketing.comparison.controls.trace.desc" },
] as const;

export function ComparisonSection() {
  const { t } = useT();

  return (
    <SectionShell
      id="comparison"
      badge={t("marketing.comparison.badge")}
      title={t("marketing.comparison.title")}
      description={t("marketing.comparison.description")}
    >
      <div className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
        <article className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 md:p-6">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl border border-white/10 bg-white/[0.05] text-white/70">
              <FileText className="size-5" />
            </span>
            <div>
              <p className="text-base font-semibold text-white">{t("marketing.comparison.generic.title")}</p>
              <p className="mt-1 text-sm text-white/50">{t("marketing.comparison.generic.subtitle")}</p>
            </div>
          </div>
          <ul className="space-y-3">
            {genericItems.map((key) => (
              <li key={key} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/16 p-3 text-sm leading-relaxed text-white/58">
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-white/35" />
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="relative overflow-hidden rounded-3xl border border-blue-300/22 bg-[#081326]/88 p-5 shadow-[0_24px_90px_rgba(29,155,240,0.12)] md:p-6">
          <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-blue-500/18 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-24 size-72 rounded-full bg-violet-500/14 blur-3xl" />
          <div className="relative">
            <div className="mb-5 flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl border border-blue-300/25 bg-blue-500/12 text-blue-100 shadow-[0_0_28px_rgba(29,155,240,0.18)]">
                <Bot className="size-5" />
              </span>
              <div>
                <p className="text-base font-semibold text-white">{t("marketing.comparison.oaf.title")}</p>
                <p className="mt-1 text-sm text-blue-100/60">{t("marketing.comparison.oaf.subtitle")}</p>
              </div>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {oafItems.map((key) => (
                <li key={key} className="flex min-h-[82px] items-start gap-3 rounded-2xl border border-blue-200/12 bg-blue-300/[0.06] p-3 text-sm leading-relaxed text-white/78">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-300" />
                  <span>{t(key)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {controlItems.map((item) => (
                <div key={item.titleKey} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <div className="mb-2 flex items-center gap-2 text-sm font-medium text-white">
                    <item.icon className="size-4 text-blue-200" />
                    {t(item.titleKey)}
                  </div>
                  <p className="text-xs leading-relaxed text-white/56">{t(item.descKey)}</p>
                </div>
              ))}
            </div>
          </div>
        </article>
      </div>
    </SectionShell>
  );
}
