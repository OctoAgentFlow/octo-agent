"use client";

import type { ReactNode } from "react";
import { ArrowRight, CheckCircle2, Clock3 } from "lucide-react";

export function LightMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-black p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-[#71767b]">{icon}{label}</div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</p>
    </div>
  );
}

export function GrowthDeskMetric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold text-[#71767b]">{icon}{label}</div>
      <p className="mt-2 text-xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-[11px] leading-4 text-[#71767b]">{detail}</p>
    </div>
  );
}

export function MiniStat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
      <p className="flex items-center gap-1 text-[11px] text-[#71767b]">{icon}{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-[#e7e9ea]">{value}</p>
    </div>
  );
}

export function ActionPlanMetric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="min-w-24 rounded-xl border border-[#2f3336] bg-black px-3 py-2">
      <p className="text-[11px] text-[#71767b]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

export function CommandStep({ index, title, detail, anchor }: { index: number; title: string; detail: string; anchor: string }) {
  return (
    <a href={anchor} className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3 transition hover:border-[#1d9bf0]/45 hover:bg-[#1d9bf0]/10">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex size-7 items-center justify-center rounded-full border border-[#2f3336] bg-black text-[11px] font-semibold text-[#8ecdf8]">0{index}</span>
        <ArrowRight className="size-3.5 text-[#71767b]" />
      </div>
      <p className="mt-2 text-sm font-semibold text-[#e7e9ea]">{title}</p>
      <p className="mt-1 text-xs leading-5 text-[#71767b]">{detail}</p>
    </a>
  );
}

export function CommandList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="rounded-xl border border-[#2f3336] bg-[#0f1419] p-3">
      <p className="text-xs font-semibold text-[#e7e9ea]">{title}</p>
      {items.length ? (
        <ul className="mt-2 space-y-2">
          {items.map((item) => (
            <li key={item} className="flex gap-2 text-xs leading-5 text-[#8b98a5]">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#1d9bf0]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs leading-5 text-[#71767b]">{empty}</p>
      )}
    </div>
  );
}

export function StrategyInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <label className="min-w-0 flex-1">
      <span className="text-xs font-semibold text-[#8b98a5]">{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-2 h-10 w-full rounded-xl border border-[#2f3336] bg-black px-3 text-sm text-[#e7e9ea] outline-none transition focus:border-[#1d9bf0]" />
    </label>
  );
}

export function ReviewList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="mt-4 rounded-2xl border border-[#2f3336] bg-black p-3">
      <p className="text-xs font-semibold text-[#e7e9ea]">{title}</p>
      {items.length ? (
        <ul className="mt-2 space-y-2">
          {items.slice(0, 5).map((item, index) => (
            <li key={`${item}-${index}`} className="flex gap-2 text-xs leading-5 text-[#8b98a5]">
              <span className="mt-1 size-1.5 shrink-0 rounded-full bg-[#1d9bf0]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs leading-5 text-[#71767b]">{empty}</p>
      )}
    </div>
  );
}

export function FirstLoopActionRow({ done, label }: { done: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${done ? "border-[#00ba7c]/25 bg-[#00ba7c]/10 text-[#7ee0b5]" : "border-[#2f3336] bg-[#0f1419] text-[#8b98a5]"}`}>
      {done ? <CheckCircle2 className="size-3.5" /> : <Clock3 className="size-3.5" />}
      <span className="font-semibold">{label}</span>
    </div>
  );
}
