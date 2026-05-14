"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";
import { faqs } from "@/mocks/landing.mock";

import { SectionShell } from "./section-shell";

export function FAQSection() {
  const { t } = useT();
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <SectionShell
      id="faq"
      badge={t("marketing.faq.badge")}
      title={t("marketing.faq.title")}
      description={t("marketing.faq.description")}
    >
      <div className="space-y-3">
        {faqs.map((item, index) => {
          const isOpen = openIndex === index;
          return (
            <article
              key={item.qKey}
              className={cn(
                "overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-colors hover:bg-white/[0.05]",
                isOpen ? "border-blue-300/20 bg-white/[0.05]" : ""
              )}
            >
              <button
                type="button"
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                onClick={() => setOpenIndex(isOpen ? -1 : index)}
                aria-expanded={isOpen}
              >
                <span className="text-base font-medium leading-relaxed text-white">{t(item.qKey)}</span>
                <ChevronDown
                  className={cn(
                    "size-5 shrink-0 text-white/55 transition-transform duration-200",
                    isOpen ? "rotate-180 text-blue-200" : ""
                  )}
                />
              </button>
              <div
                className={cn(
                  "grid transition-[grid-template-rows] duration-200 ease-out",
                  isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                )}
              >
                <div className="overflow-hidden">
                  <p className="px-5 pb-5 text-sm leading-relaxed text-white/64">{t(item.aKey)}</p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </SectionShell>
  );
}
