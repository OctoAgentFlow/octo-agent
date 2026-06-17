"use client";

import { CheckCircle2, Gauge, Info, ShieldAlert } from "lucide-react";

import { useT } from "@/i18n/use-t";
import type { ReplyQualityScore, SafetyReview, SafetyReviewStatus } from "@/components/exposure-radar/types";

export function SafetyReviewPanel({ review }: { review: SafetyReview }) {
  const { t } = useT();
  return (
    <div className={`mt-4 rounded-2xl border p-3 ${safetyReviewTone(review.status)}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.safetyReview.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{review.summary}</p>
        </div>
        <span className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${safetyReviewBadgeTone(review.status)}`}>
          <ShieldAlert className="size-3.5" />
          {t(`exposureRadar.safetyReview.status.${review.status}`)}
        </span>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {review.checks.map((check) => (
          <div key={check.key} className="rounded-xl border border-[#2f3336] bg-black px-3 py-2">
            <div className="flex items-start gap-2">
              <span className={`mt-1 size-2 shrink-0 rounded-full ${safetyReviewDot(check.status)}`} />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#e7e9ea]">{check.title}</p>
                <p className="mt-1 text-[11px] leading-5 text-[#8b98a5]">{check.detail}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReplyQualityPanel({ quality }: { quality: ReplyQualityScore }) {
  const { t } = useT();
  return (
    <div className="mt-4 rounded-2xl border border-[#2f3336] bg-[#0f1419] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.replyQuality.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("exposureRadar.replyQuality.description")}</p>
        </div>
        <span className={`inline-flex w-fit items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${replyQualityTone(quality.status)}`}>
          <Gauge className="size-3.5" />
          {t(`exposureRadar.replyQuality.status.${quality.status}`, { score: quality.score })}
        </span>
      </div>
      <div className="mt-3 rounded-xl border border-[#2f3336] bg-black px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.replyQuality.score")}</p>
          <p className="text-sm font-semibold text-white">{quality.score}/100</p>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#202327]">
          <div className={`h-full rounded-full ${quality.status === "ready" ? "bg-[#00ba7c]" : quality.status === "needs_edit" ? "bg-[#ffd400]" : "bg-[#1d9bf0]"}`} style={{ width: `${quality.score}%` }} />
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {quality.checks.map((check) => (
          <div key={check.key} className="flex items-start gap-2 rounded-xl border border-[#2f3336] bg-black px-3 py-2">
            {check.pass ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[#7ee0b5]" /> : <Info className="mt-0.5 size-3.5 shrink-0 text-[#f6d96b]" />}
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#e7e9ea]">{t(`exposureRadar.replyQuality.${check.key}.title`)}</p>
              <p className="mt-1 text-[11px] leading-5 text-[#71767b]">{t(`exposureRadar.replyQuality.${check.key}.description`)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function safetyReviewTone(status: SafetyReviewStatus) {
  if (status === "pass") return "border-[#00ba7c]/25 bg-[#061a14]";
  if (status === "watch") return "border-[#ffd400]/25 bg-[#1f1a06]";
  return "border-[#f4212e]/25 bg-[#1f0b0d]";
}

function safetyReviewBadgeTone(status: SafetyReviewStatus) {
  if (status === "pass") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  if (status === "watch") return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
  return "border-[#f4212e]/25 bg-[#f4212e]/10 text-[#ff8a91]";
}

function safetyReviewDot(status: SafetyReviewStatus) {
  if (status === "pass") return "bg-[#00ba7c]";
  if (status === "watch") return "bg-[#ffd400]";
  return "bg-[#f4212e]";
}

function replyQualityTone(status: ReplyQualityScore["status"]) {
  if (status === "ready") return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
  if (status === "needs_edit") return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
  return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
}
