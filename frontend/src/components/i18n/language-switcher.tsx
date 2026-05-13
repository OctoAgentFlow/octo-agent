"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Languages } from "lucide-react";

import { Button } from "@/components/ui/button";
import { languages } from "@/i18n/types";
import { useT } from "@/i18n/use-t";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({
  className,
  buttonClassName,
  menuClassName,
  showLabelOnMobile = false,
}: {
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  showLabelOnMobile?: boolean;
}) {
  const { lang, setLang } = useT();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const currentLabel = useMemo(
    () => languages.find((l) => l.code === lang)?.label ?? lang,
    [lang]
  );

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current) return;
      if (e.target instanceof Node && rootRef.current.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <Button
        type="button"
        variant="outline"
        className={cn("h-8 w-[132px] justify-between gap-1.5 px-2.5 text-white/80", buttonClassName)}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="inline-flex items-center gap-1.5 overflow-hidden">
          <Languages className="size-3.5 shrink-0" />
          <span className={cn("truncate whitespace-nowrap", showLabelOnMobile ? "inline" : "hidden sm:inline")}>{currentLabel}</span>
        </span>
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </Button>

      {open ? (
        <div
          role="menu"
          className={cn(
            "absolute right-0 top-[calc(100%+10px)] z-50 w-52 rounded-xl border border-white/16 bg-[#0b1020]/95 p-1.5 shadow-2xl shadow-black/45 backdrop-blur-xl",
            menuClassName
          )}
        >
          {languages.map((l) => {
            const active = l.code === lang;
            return (
              <button
                key={l.code}
                type="button"
                role="menuitem"
                onClick={() => {
                  setLang(l.code);
                  setOpen(false);
                }}
                className={cn(
                  "flex min-h-9 w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm leading-5 whitespace-nowrap transition-colors",
                  active ? "bg-white/10 text-white" : "text-white/75 hover:bg-white/8 hover:text-white"
                )}
              >
                <span>{l.label}</span>
                {active ? <span className="text-xs text-white/55">{l.code}</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
