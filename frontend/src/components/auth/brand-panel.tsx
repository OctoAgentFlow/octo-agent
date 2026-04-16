"use client";

import { useT } from "@/i18n/use-t";
import { CheckCircle2 } from "lucide-react";

import { Logo } from "@/components/common/logo";

const sellingPointKeys = [
  "auth.brand.points.one",
  "auth.brand.points.two",
  "auth.brand.points.three",
];

export function BrandPanel() {
  const { t } = useT();
  return (
    <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-8 md:p-10">
      <div className="pointer-events-none absolute -top-20 -left-10 h-52 w-52 rounded-full bg-blue-500/25 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 -bottom-24 h-56 w-56 rounded-full bg-violet-500/25 blur-3xl" />

      <div className="relative space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/75">
          <Logo />
        </div>
        <div className="space-y-3">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight text-white md:text-4xl">
            {t("auth.brand.title")}
          </h1>
          <p className="max-w-md text-sm text-white/70 md:text-base">
            {t("auth.brand.subtitle")}
          </p>
        </div>
        <ul className="space-y-3">
          {sellingPointKeys.map((key) => (
            <li key={key} className="flex items-start gap-2 text-sm text-white/75">
              <CheckCircle2 className="mt-0.5 size-4 text-blue-300" />
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
