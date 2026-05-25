"use client";

import { cn } from "@/lib/utils";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  showCloseButton?: boolean;
  closeLabel?: string;
};

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  showCloseButton = true,
  closeLabel = "Close",
}: DialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#070b17]/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className={cn("surface-card w-full max-w-sm p-5 shadow-2xl", className)}>
        {(title || description) ? (
          <header className="mb-4 space-y-1">
            {title ? <p className="text-base font-semibold text-white">{title}</p> : null}
            {description ? <p className="text-sm text-white/65">{description}</p> : null}
          </header>
        ) : null}
        {children}
        {showCloseButton ? (
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className="rounded-lg px-3 py-2 text-sm text-white/70 hover:bg-white/10 hover:text-white"
              onClick={() => onOpenChange(false)}
            >
              {closeLabel}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
