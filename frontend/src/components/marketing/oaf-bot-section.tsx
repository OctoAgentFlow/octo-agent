"use client";

import { BrainCircuit, Goal, ShieldCheck, SlidersHorizontal } from "lucide-react";

import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";

import { SectionShell } from "./section-shell";

const personaCards = [
  {
    icon: BrainCircuit,
    titleKey: "marketing.oafBot.cards.persona.title",
    descKey: "marketing.oafBot.cards.persona.desc",
    pointKeys: [
      "marketing.oafBot.cards.persona.point1",
      "marketing.oafBot.cards.persona.point2",
      "marketing.oafBot.cards.persona.point3",
    ],
  },
  {
    icon: SlidersHorizontal,
    titleKey: "marketing.oafBot.cards.voice.title",
    descKey: "marketing.oafBot.cards.voice.desc",
    pointKeys: [
      "marketing.oafBot.cards.voice.point1",
      "marketing.oafBot.cards.voice.point2",
      "marketing.oafBot.cards.voice.point3",
    ],
  },
  {
    icon: ShieldCheck,
    titleKey: "marketing.oafBot.cards.guardrails.title",
    descKey: "marketing.oafBot.cards.guardrails.desc",
    pointKeys: [
      "marketing.oafBot.cards.guardrails.point1",
      "marketing.oafBot.cards.guardrails.point2",
      "marketing.oafBot.cards.guardrails.point3",
    ],
  },
  {
    icon: Goal,
    titleKey: "marketing.oafBot.cards.goal.title",
    descKey: "marketing.oafBot.cards.goal.desc",
    pointKeys: [
      "marketing.oafBot.cards.goal.point1",
      "marketing.oafBot.cards.goal.point2",
      "marketing.oafBot.cards.goal.point3",
    ],
  },
];

export function OAFBotSection() {
  const { t } = useT();

  return (
    <SectionShell
      id="oaf-bot"
      badge={t("marketing.oafBot.badge")}
      title={t("marketing.oafBot.title")}
      description={t("marketing.oafBot.description")}
      className="pt-10"
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {personaCards.map((card, index) => (
          <article
            key={card.titleKey}
            className={cn(
              "group relative flex h-full min-h-[280px] flex-col overflow-hidden rounded-2xl border border-white/12 bg-white/[0.04] p-5",
              "shadow-[0_18px_60px_rgba(2,6,23,0.22)] transition duration-200 hover:-translate-y-0.5 hover:border-blue-300/24"
            )}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-blue-400/0 via-blue-300/50 to-violet-300/0" />
            <div className="mb-5 flex items-center justify-between gap-3">
              <span className="grid size-11 place-items-center rounded-xl border border-blue-300/20 bg-blue-500/12 text-blue-200 shadow-[0_0_24px_rgba(59,130,246,0.16)]">
                <card.icon className="size-5" />
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-xs text-white/45">
                0{index + 1}
              </span>
            </div>
            <h3 className="text-lg font-semibold text-white">{t(card.titleKey)}</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/64">{t(card.descKey)}</p>
            <div className="mt-auto flex flex-wrap gap-2 pt-5">
              {card.pointKeys.map((pointKey) => (
                <span key={pointKey} className="rounded-full border border-blue-200/10 bg-blue-300/[0.07] px-2.5 py-1 text-xs text-blue-50/72">
                  {t(pointKey)}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </SectionShell>
  );
}
