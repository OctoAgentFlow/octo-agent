"use client";

import { CheckCircle2, Database, MessageCircle } from "lucide-react";

import { useT } from "@/i18n/use-t";
import type { MemoryReplyCue, ReplyAngleSuggestion } from "@/components/exposure-radar/types";

export function ReplyAngleSuggestionsPanel({
  suggestions,
  selectedID,
  onSelect,
}: {
  suggestions: ReplyAngleSuggestion[];
  selectedID: string;
  onSelect: (angleID: string) => void;
}) {
  const { t } = useT();
  return (
    <div className="mt-4 rounded-2xl border border-[#1d9bf0]/20 bg-[#08131f] p-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.replyAngles.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("exposureRadar.replyAngles.description")}</p>
        </div>
        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-[#1d9bf0]/25 bg-[#1d9bf0]/10 px-2 py-1 text-[11px] font-semibold text-[#8ecdf8]">
          <MessageCircle className="size-3.5" />
          {t("exposureRadar.replyAngles.selected")}
        </span>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {suggestions.map((suggestion) => {
          const selected = suggestion.id === selectedID;
          return (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => onSelect(suggestion.id)}
              className={`rounded-xl border p-3 text-left transition ${selected ? "border-[#1d9bf0]/70 bg-[#1d9bf0]/15" : "border-[#2f3336] bg-black hover:border-[#1d9bf0]/45"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[#e7e9ea]">{suggestion.title}</p>
                  <p className="mt-1 text-[11px] font-semibold text-[#8ecdf8]">{suggestion.tone}</p>
                </div>
                {selected ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#1d9bf0]" /> : null}
              </div>
              <p className="mt-2 text-xs leading-5 text-[#8b98a5]">{suggestion.description}</p>
              <p className="mt-2 rounded-lg border border-[#2f3336] bg-[#0f1419] px-2 py-2 text-[11px] leading-5 text-[#71767b]">{suggestion.prompt}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function MemoryDrivenReplyPanel({ cues }: { cues: MemoryReplyCue[] }) {
  const { t } = useT();
  return (
    <div className="mt-4 rounded-2xl border border-[#7856ff]/20 bg-[#120d24] p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-[#e7e9ea]">{t("exposureRadar.memoryReply.title")}</p>
          <p className="mt-1 text-xs leading-5 text-[#8b98a5]">{t("exposureRadar.memoryReply.description")}</p>
        </div>
        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-[#7856ff]/25 bg-[#7856ff]/10 px-2 py-1 text-[11px] font-semibold text-[#c4b5fd]">
          <Database className="size-3.5" />
          {t("exposureRadar.memoryReply.badge")}
        </span>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {cues.map((cue) => (
          <div key={cue.key} className={`rounded-xl border p-3 ${memoryReplyCueTone(cue.tone)}`}>
            <p className="text-xs font-semibold">{cue.title}</p>
            <p className="mt-1 text-[11px] leading-5 opacity-85">{cue.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function memoryReplyCueTone(tone: MemoryReplyCue["tone"]) {
  switch (tone) {
    case "green":
      return "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]";
    case "amber":
      return "border-[#ffd400]/25 bg-[#ffd400]/10 text-[#f6d96b]";
    case "blue":
      return "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]";
    default:
      return "border-[#2f3336] bg-black text-[#8b98a5]";
  }
}
