"use client";

import type { ReactNode } from "react";
import { CheckCircle2, MessageCircle, ShieldAlert, Target, TrendingUp } from "lucide-react";

import { useT } from "@/i18n/use-t";
import type { ExposureRadarItemApi } from "@/services/exposure-radar.service";
import type { OpportunityExplanation, ReplyAngleSuggestion, ReplyPlan, SignalCredibility, SignalDecisionSummary } from "@/components/exposure-radar/types";

export function OpportunityDecisionBrief({
  item,
  summary,
  credibility,
  replyAngle,
}: {
  item: ExposureRadarItemApi;
  summary: SignalDecisionSummary;
  credibility: SignalCredibility;
  replyAngle?: ReplyAngleSuggestion;
}) {
  const { t } = useT();
  const risk = item.risk_level === "medium" || item.risk_level === "high" ? item.risk_level : "low";
  return (
    <div className="mt-4 rounded-2xl border border-[#1d9bf0]/20 bg-[#06111c] p-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.decisionBrief.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("exposureRadar.decisionBrief.description")}</p>
        </div>
        <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold ${decisionModeTone(summary.mode)}`}>
          <Target className="size-3.5" />
          {t(`exposureRadar.decision.mode.${summary.mode}`)}
        </span>
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-3">
        <DecisionBriefColumn
          icon={<TrendingUp className="size-3.5" />}
          title={t("exposureRadar.decisionBrief.why")}
          primary={summary.title}
          detail={summary.proof[0] || summary.detail}
        />
        <DecisionBriefColumn
          icon={<MessageCircle className="size-3.5" />}
          title={t("exposureRadar.decisionBrief.angle")}
          primary={replyAngle?.title || t("exposureRadar.decisionBrief.angleMissing")}
          detail={replyAngle?.description || t("exposureRadar.decisionBrief.angleMissingDetail")}
        />
        <DecisionBriefColumn
          icon={<ShieldAlert className="size-3.5" />}
          title={t("exposureRadar.decisionBrief.risk")}
          primary={t(`exposureRadar.risk.${risk}`)}
          detail={credibility.nextStep}
        />
      </div>
    </div>
  );
}

export function OpportunityExplanationPanel({ explanation }: { explanation: OpportunityExplanation }) {
  const { t } = useT();
  return (
    <div className="mt-4 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.explanation.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{explanation.fit}</p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 lg:grid-cols-3">
        <ExplanationColumn
          icon={<TrendingUp className="size-3.5" />}
          title={t("exposureRadar.explanation.reasons")}
          items={explanation.reasons}
          tone="border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]"
        />
        <ExplanationColumn
          icon={<MessageCircle className="size-3.5" />}
          title={t("exposureRadar.explanation.angles")}
          items={explanation.angles}
          tone="border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]"
        />
        <ExplanationColumn
          icon={<ShieldAlert className="size-3.5" />}
          title={t("exposureRadar.explanation.avoid")}
          items={explanation.avoid}
          tone="border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]"
        />
      </div>
    </div>
  );
}

export function ReplyPlanCard({ plan, replyAngle }: { plan: ReplyPlan; replyAngle: ReplyAngleSuggestion }) {
  const { t } = useT();
  return (
    <div className="mt-4 rounded-2xl border border-[#00ba7c]/20 bg-[#061a14] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.replyPlan.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("exposureRadar.replyPlan.description")}</p>
        </div>
        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-[#00ba7c]/25 bg-[#00ba7c]/10 px-2 py-1 text-[11px] font-semibold text-[#7ee0b5]">
          <CheckCircle2 className="size-3.5" />
          {replyAngle.title}
        </span>
      </div>
      <div className="mt-3 rounded-xl border border-[#2f3336] bg-black px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#71767b]">{t("exposureRadar.replyPlan.bestFor")}</p>
        <p className="mt-1 text-xs leading-5 text-[#c9d1d9]">{plan.bestFor}</p>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <ReplyPlanColumn
          icon={<MessageCircle className="size-3.5" />}
          title={t("exposureRadar.replyPlan.structure")}
          items={plan.steps}
          tone="border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]"
        />
        <ReplyPlanColumn
          icon={<ShieldAlert className="size-3.5" />}
          title={t("exposureRadar.replyPlan.safety")}
          items={plan.safety}
          tone="border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]"
        />
      </div>
      <div className="mt-3 rounded-xl border border-[#00ba7c]/20 bg-[#00ba7c]/10 px-3 py-2 text-xs leading-5 text-[#7ee0b5]">
        {plan.readyNote}
      </div>
    </div>
  );
}

function DecisionBriefColumn({ icon, title, primary, detail }: { icon: ReactNode; title: string; primary: string; detail: string }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-black p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-[#8ecdf8]">{icon}{title}</p>
      <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-[#e7e9ea]">{primary}</p>
      <p className="mt-1 line-clamp-3 text-[11px] leading-4 text-[#71767b]">{detail}</p>
    </div>
  );
}

function ExplanationColumn({ icon, title, items, tone }: { icon: ReactNode; title: string; items: string[]; tone: string }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-black p-3">
      <div className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold ${tone}`}>
        {icon}
        {title}
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <p key={item} className="text-xs leading-5 text-[#8b98a5]">{item}</p>
        ))}
      </div>
    </div>
  );
}

function ReplyPlanColumn({ icon, title, items, tone }: { icon: ReactNode; title: string; items: string[]; tone: string }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-black p-3">
      <div className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-semibold ${tone}`}>
        {icon}
        {title}
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <p key={item} className="text-xs leading-5 text-[#8b98a5]">{item}</p>
        ))}
      </div>
    </div>
  );
}

function decisionModeTone(mode: SignalDecisionSummary["mode"]) {
  switch (mode) {
    case "act_now":
      return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
    case "watch":
      return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
    case "research":
      return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
    default:
      return "border-[#ef4444]/25 bg-[#ef4444]/10 text-[#fecaca]";
  }
}
