"use client";

import type { ReactNode } from "react";
import { CheckCircle2, ClipboardCheck, Gauge, Info, Route, ShieldCheck, Target, Zap } from "lucide-react";

import { useT } from "@/i18n/use-t";
import type { AccountFitLabel, AccountFitSummary, SignalCredibility, SignalCredibilityStatus, SignalDecisionSummary } from "@/components/exposure-radar/types";

export function SignalDecisionCard({ summary }: { summary: SignalDecisionSummary }) {
  const { t } = useT();
  return (
    <div className={`mt-4 rounded-2xl border p-3 ${signalDecisionTone(summary.mode)}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold opacity-80">{t("exposureRadar.decision.label")}</p>
          <p className="mt-1 text-sm font-semibold">{summary.title}</p>
          <p className="mt-1 text-xs leading-5 opacity-85">{summary.detail}</p>
        </div>
        <span className="inline-flex w-fit shrink-0 items-center gap-1 rounded-full border border-current/20 bg-black/20 px-2.5 py-1 text-[11px] font-semibold">
          <Zap className="size-3.5" />
          {t(`exposureRadar.decision.mode.${summary.mode}`)}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {summary.proof.map((proof) => (
          <div key={proof} className="rounded-xl border border-current/15 bg-black/20 px-3 py-2 text-[11px] leading-4 opacity-90">
            {proof}
          </div>
        ))}
      </div>
    </div>
  );
}

export function OperatorEvidencePanel({
  summary,
  credibility,
  fit,
}: {
  summary: SignalDecisionSummary;
  credibility: SignalCredibility;
  fit: AccountFitSummary;
}) {
  const { t } = useT();
  const riskLevel = fit.label === "avoid" ? "high" : credibility.status === "thin" || credibility.status === "weak" ? "medium" : "low";
  const fitDetail = fit.keywords.length ? fit.keywords.slice(0, 3).join(", ") : fit.detail;
  const riskDetail = fit.guardrails[0] || credibility.missing[0] || t(`exposureRadar.operatorEvidence.riskDetail.${riskLevel}`);
  const rows = [
    {
      key: "whyNow",
      label: t("exposureRadar.operatorEvidence.whyNow"),
      title: summary.title,
      detail: summary.proof.length ? summary.proof.join(" · ") : summary.detail,
      icon: <Zap className="size-3.5" />,
      className: operatorEvidenceTone(summary.mode),
    },
    {
      key: "fit",
      label: t("exposureRadar.operatorEvidence.accountFit"),
      title: fit.title,
      detail: fitDetail,
      icon: <Target className="size-3.5" />,
      className: accountFitTone(fit.label),
    },
    {
      key: "move",
      label: t("exposureRadar.operatorEvidence.manualMove"),
      title: t(`exposureRadar.operatorEvidence.move.${summary.mode}`),
      detail: t(`exposureRadar.operatorEvidence.moveDetail.${summary.mode}`),
      icon: <Route className="size-3.5" />,
      className: "border-[#1d9bf0]/25 bg-[#08131f] text-[#8ecdf8]",
    },
    {
      key: "risk",
      label: t("exposureRadar.operatorEvidence.risk"),
      title: t(`exposureRadar.operatorEvidence.risk.${riskLevel}`),
      detail: riskDetail,
      icon: <ShieldCheck className="size-3.5" />,
      className: riskLevel === "high" ? "border-[#f4212e]/25 bg-[#1f0b0d] text-[#ff8a91]" : riskLevel === "medium" ? "border-[#ffd400]/25 bg-[#1f1a07] text-[#f6d96b]" : "border-[#00ba7c]/25 bg-[#061a14] text-[#7ee0b5]",
    },
  ];
  return (
    <div className="mt-4 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.operatorEvidence.title")}</p>
          <p className="mt-1 text-[11px] leading-4 text-[#8b98a5]">{t("exposureRadar.operatorEvidence.description")}</p>
        </div>
        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-[#2f3336] bg-black px-2.5 py-1 text-[11px] font-semibold text-[#8b98a5]">
          <ClipboardCheck className="size-3.5" />
          {t(`exposureRadar.credibility.status.${credibility.status}`)}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.key} className={`rounded-xl border px-3 py-2 ${row.className}`}>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold opacity-80">{row.icon}{row.label}</p>
            <p className="mt-1 line-clamp-1 text-xs font-semibold">{row.title}</p>
            <p className="mt-1 line-clamp-2 text-[11px] leading-4 opacity-85">{row.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SignalCredibilityPanel({ credibility, compact = false }: { credibility: SignalCredibility; compact?: boolean }) {
  const { t } = useT();
  return (
    <div className={`mt-4 rounded-2xl border p-3 ${signalCredibilityTone(credibility.status)}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold opacity-80">{t("exposureRadar.credibility.title")}</p>
          <p className="mt-1 text-sm font-semibold">{t(`exposureRadar.credibility.status.${credibility.status}`)}</p>
          <p className="mt-1 text-xs leading-5 opacity-85">{credibility.nextStep}</p>
        </div>
        <span className="inline-flex w-fit shrink-0 items-center gap-1 rounded-full border border-current/20 bg-black/20 px-2.5 py-1 text-[11px] font-semibold">
          <Gauge className="size-3.5" />
          {credibility.score}/100
        </span>
      </div>
      <div className={`mt-3 grid gap-2 ${compact ? "sm:grid-cols-2" : "lg:grid-cols-2"}`}>
        <CredibilityColumn
          title={t("exposureRadar.credibility.proof")}
          items={credibility.proof}
          empty={t("exposureRadar.credibility.proofEmpty")}
          icon={<CheckCircle2 className="size-3.5" />}
        />
        <CredibilityColumn
          title={t("exposureRadar.credibility.missing")}
          items={credibility.missing}
          empty={t("exposureRadar.credibility.missingEmpty")}
          icon={<Info className="size-3.5" />}
        />
      </div>
    </div>
  );
}

export function AccountFitPanel({ fit, compact = false }: { fit: AccountFitSummary; compact?: boolean }) {
  const { t } = useT();
  return (
    <div className={`mt-4 rounded-2xl border p-3 ${accountFitTone(fit.label)}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold opacity-80">{t("exposureRadar.accountFit.title")}</p>
          <p className="mt-1 text-sm font-semibold">{fit.title}</p>
          <p className="mt-1 text-xs leading-5 opacity-85">{fit.detail}</p>
        </div>
        <span className="inline-flex w-fit shrink-0 items-center gap-1 rounded-full border border-current/20 bg-black/20 px-2.5 py-1 text-[11px] font-semibold">
          <Target className="size-3.5" />
          {fit.score}/100
        </span>
      </div>
      <div className={`mt-3 grid gap-2 ${compact ? "sm:grid-cols-2" : "lg:grid-cols-2"}`}>
        <CredibilityColumn
          title={t("exposureRadar.accountFit.keywords")}
          items={fit.keywords}
          empty={t("exposureRadar.accountFit.keywordsEmpty")}
          icon={<CheckCircle2 className="size-3.5" />}
        />
        <CredibilityColumn
          title={t("exposureRadar.accountFit.guardrails")}
          items={fit.guardrails}
          empty={t("exposureRadar.accountFit.guardrailsEmpty")}
          icon={<ShieldCheck className="size-3.5" />}
        />
      </div>
    </div>
  );
}

function CredibilityColumn({ title, items, empty, icon }: { title: string; items: string[]; empty: string; icon: ReactNode }) {
  return (
    <div className="rounded-xl border border-current/15 bg-black/20 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold opacity-85">{icon}{title}</p>
      <div className="mt-2 space-y-1.5">
        {(items.length ? items : [empty]).map((item) => (
          <p key={item} className="text-[11px] leading-5 opacity-85">{item}</p>
        ))}
      </div>
    </div>
  );
}

function signalDecisionTone(mode: SignalDecisionSummary["mode"]) {
  switch (mode) {
    case "act_now":
      return "border-[#00ba7c]/30 bg-[#00ba7c]/10 text-[#7ee0b5]";
    case "research":
      return "border-[#1d9bf0]/30 bg-[#1d9bf0]/10 text-[#8ecdf8]";
    case "skip":
      return "border-[#64748b]/35 bg-[#64748b]/10 text-[#94a3b8]";
    default:
      return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
  }
}

function operatorEvidenceTone(mode: SignalDecisionSummary["mode"]) {
  if (mode === "act_now") return "border-[#00ba7c]/25 bg-[#061a14] text-[#7ee0b5]";
  if (mode === "research") return "border-[#1d9bf0]/25 bg-[#08131f] text-[#8ecdf8]";
  if (mode === "skip") return "border-[#64748b]/30 bg-[#0b0f14] text-[#94a3b8]";
  return "border-[#ffd400]/25 bg-[#1f1a07] text-[#f6d96b]";
}

function signalCredibilityTone(status: SignalCredibilityStatus) {
  switch (status) {
    case "strong":
      return "border-[#00ba7c]/25 bg-[#061a14] text-[#7ee0b5]";
    case "usable":
      return "border-[#1d9bf0]/25 bg-[#08131f] text-[#8ecdf8]";
    case "thin":
      return "border-[#ffd400]/25 bg-[#1f1a07] text-[#f6d96b]";
    default:
      return "border-[#64748b]/30 bg-[#0b0f14] text-[#94a3b8]";
  }
}

function accountFitTone(label: AccountFitLabel) {
  switch (label) {
    case "strong":
      return "border-[#00ba7c]/25 bg-[#061a14] text-[#7ee0b5]";
    case "good":
      return "border-[#1d9bf0]/25 bg-[#08131f] text-[#8ecdf8]";
    case "avoid":
      return "border-[#f4212e]/25 bg-[#1f0b0d] text-[#ff8a91]";
    default:
      return "border-[#ffd400]/25 bg-[#1f1a07] text-[#f6d96b]";
  }
}
