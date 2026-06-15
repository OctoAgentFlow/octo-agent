"use client";

import Link from "next/link";
import { ArrowRight, Database, FileText, Languages, ListChecks, Radar, ShieldCheck, Sparkles, Users } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";

import { SectionShell } from "./section-shell";

const playbookItems = [
  { icon: Radar, key: "early" },
  { icon: Languages, key: "regions" },
  { icon: ListChecks, key: "review" },
  { icon: Database, key: "memory" },
];

const releaseItems = ["drafts", "brief", "library", "strategy"];

const deskItems = [
  { icon: Radar, key: "scan" },
  { icon: ShieldCheck, key: "decide" },
  { icon: Users, key: "handoff" },
  { icon: Database, key: "learn" },
];

const signalRows = [
  { topicKey: "marketing.exposureRadar.preview.rows.ai.topic", metaKey: "marketing.exposureRadar.preview.rows.ai.meta", actionKey: "marketing.exposureRadar.preview.rows.ai.action", tone: "border-cyan-300/20 bg-cyan-400/10 text-cyan-100" },
  { topicKey: "marketing.exposureRadar.preview.rows.saas.topic", metaKey: "marketing.exposureRadar.preview.rows.saas.meta", actionKey: "marketing.exposureRadar.preview.rows.saas.action", tone: "border-emerald-300/20 bg-emerald-400/10 text-emerald-100" },
  { topicKey: "marketing.exposureRadar.preview.rows.web3.topic", metaKey: "marketing.exposureRadar.preview.rows.web3.meta", actionKey: "marketing.exposureRadar.preview.rows.web3.action", tone: "border-amber-300/20 bg-amber-400/10 text-amber-100" },
];

export function ExposureRadarSection() {
  const { t } = useT();

  return (
    <SectionShell
      id="exposure-radar"
      badge={t("marketing.exposureRadar.badge")}
      title={t("marketing.exposureRadar.title")}
      description={t("marketing.exposureRadar.description")}
      className="pt-10"
    >
      <div className="grid gap-5 lg:grid-cols-[0.92fr_1.08fr] lg:items-stretch">
        <div className="surface-card flex min-h-full flex-col rounded-2xl p-5 md:p-6">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-100">
              <Sparkles className="size-3.5" />
              {t("marketing.exposureRadar.free")}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-xs text-white/58">
              {t("marketing.exposureRadar.update")}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {playbookItems.map((item) => (
              <div key={item.key} className="rounded-xl border border-white/10 bg-black/16 p-4">
                <span className="mb-3 grid size-9 place-items-center rounded-lg border border-white/10 bg-white/[0.055] text-cyan-100">
                  <item.icon className="size-4" />
                </span>
                <p className="text-sm font-semibold text-white">{t(`marketing.exposureRadar.playbook.${item.key}.title`)}</p>
                <p className="mt-1.5 text-sm leading-6 text-white/58">{t(`marketing.exposureRadar.playbook.${item.key}.desc`)}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.035] p-4">
            <p className="text-sm font-semibold text-white">{t("marketing.exposureRadar.release.title")}</p>
            <div className="mt-3 grid gap-2">
              {releaseItems.map((item) => (
                <div key={item} className="flex items-start gap-2 text-sm leading-6 text-white/64">
                  <FileText className="mt-1 size-3.5 shrink-0 text-cyan-100" />
                  <span>{t(`marketing.exposureRadar.release.${item}`)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 rounded-xl border border-cyan-300/15 bg-cyan-400/[0.065] p-4">
            <p className="text-sm font-semibold text-white">{t("marketing.exposureRadar.dailyDesk.title")}</p>
            <p className="mt-1.5 text-sm leading-6 text-white/60">{t("marketing.exposureRadar.dailyDesk.description")}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {deskItems.map((item) => (
                <div key={item.key} className="rounded-lg border border-white/10 bg-black/18 p-3">
                  <div className="flex items-start gap-2">
                    <span className="grid size-7 shrink-0 place-items-center rounded-md border border-cyan-300/20 bg-cyan-400/10 text-cyan-100">
                      <item.icon className="size-3.5" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-white">{t(`marketing.exposureRadar.dailyDesk.${item.key}.title`)}</p>
                      <p className="mt-1 text-xs leading-5 text-white/52">{t(`marketing.exposureRadar.dailyDesk.${item.key}.desc`)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Link href="/login" className={cn(buttonVariants({ variant: "default" }), "h-10 bg-white text-[#07111f] hover:bg-white/90")}>
              {t("marketing.exposureRadar.cta")}
            </Link>
            <a href="#operating-loop" className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-semibold text-cyan-100 hover:text-white">
              {t("marketing.exposureRadar.secondaryCta")}
              <ArrowRight className="size-4" />
            </a>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-white/12 bg-[#07101d] shadow-[0_24px_90px_rgba(0,0,0,0.28)]">
          <div className="border-b border-white/10 p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-100">
                  <Radar className="size-4" />
                  {t("marketing.exposureRadar.preview.kicker")}
                </p>
                <h3 className="mt-2 text-xl font-semibold tracking-tight text-white md:text-2xl">{t("marketing.exposureRadar.preview.title")}</h3>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-white/64 sm:grid-cols-3">
                {["zh", "en", "review"].map((item) => (
                  <span key={item} className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-center">
                    {t(`marketing.exposureRadar.preview.chips.${item}`)}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="border-b border-white/10 p-5 lg:border-r lg:border-b-0 md:p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-white">{t("marketing.exposureRadar.preview.signals")}</p>
                <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2.5 py-1 text-xs text-emerald-100">
                  {t("marketing.exposureRadar.preview.status")}
                </span>
              </div>
              <div className="space-y-3">
                {signalRows.map((row) => (
                  <div key={row.topicKey} className="rounded-xl border border-white/10 bg-white/[0.045] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-white">{t(row.topicKey)}</p>
                        <p className="mt-1 text-xs leading-5 text-white/50">{t(row.metaKey)}</p>
                      </div>
                      <span className={cn("shrink-0 rounded-full border px-2.5 py-1 text-xs", row.tone)}>{t(row.actionKey)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-5 md:p-6">
              <p className="text-sm font-semibold text-white">{t("marketing.exposureRadar.preview.memoryTitle")}</p>
              <div className="mt-4 space-y-3">
                {["save", "trace", "strategy"].map((item) => (
                  <div key={item} className="rounded-xl border border-white/10 bg-black/18 p-4">
                    <p className="text-sm font-medium text-white">{t(`marketing.exposureRadar.preview.memory.${item}.title`)}</p>
                    <p className="mt-1.5 text-xs leading-5 text-white/52">{t(`marketing.exposureRadar.preview.memory.${item}.desc`)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}
