"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronRight, ShieldAlert, Wrench, type LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type OperationalBlockerSeverity = "danger" | "warning" | "info";

export type OperationalBlocker = {
  id: string;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  severity: OperationalBlockerSeverity;
  countLabel?: string;
  icon?: LucideIcon;
};

type OperationalBlockersCardProps = {
  title: string;
  description: string;
  loading?: boolean;
  blockers: OperationalBlocker[];
  emptyTitle: string;
  emptyDescription: string;
  className?: string;
};

const severityStyles: Record<OperationalBlockerSeverity, { row: string; icon: string; count: string }> = {
  danger: {
    row: "border-rose-300/25 bg-rose-500/10 hover:border-rose-200/45",
    icon: "border-rose-300/25 bg-rose-500/10 text-rose-100",
    count: "border-rose-300/25 bg-black/20 text-rose-100",
  },
  warning: {
    row: "border-amber-300/25 bg-amber-500/10 hover:border-amber-200/45",
    icon: "border-amber-300/25 bg-amber-500/10 text-amber-100",
    count: "border-amber-300/25 bg-black/20 text-amber-100",
  },
  info: {
    row: "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 hover:border-[#8ecdf8]/45",
    icon: "border-[#1d9bf0]/25 bg-[#1d9bf0]/10 text-[#8ecdf8]",
    count: "border-[#1d9bf0]/25 bg-black/20 text-[#8ecdf8]",
  },
};

function defaultIcon(severity: OperationalBlockerSeverity) {
  if (severity === "danger") return ShieldAlert;
  if (severity === "warning") return AlertTriangle;
  return Wrench;
}

export function OperationalBlockersCard({
  title,
  description,
  loading = false,
  blockers,
  emptyTitle,
  emptyDescription,
  className,
}: OperationalBlockersCardProps) {
  const visibleBlockers = blockers.slice(0, 5);
  const primary = visibleBlockers[0] || null;

  return (
    <Card className={cn("border-[#1d9bf0]/25 bg-[#06111d]", className)}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#1d9bf0]/12 text-[#1d9bf0]">
              <Wrench className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-[#e7e9ea]">{title}</h2>
              <p className="mt-1 text-sm leading-6 text-[#8b98a5]">{description}</p>
            </div>
          </div>
        </div>
        {primary ? (
          <Link
            href={primary.href}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-full bg-[#1d9bf0] px-3 text-sm font-semibold text-white transition hover:bg-[#1a8cd8]"
          >
            {primary.actionLabel}
            <ChevronRight className="size-4" />
          </Link>
        ) : null}
      </div>

      {loading ? (
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-2xl border border-[#2f3336] bg-black p-4">
              <span className="block h-4 w-28 animate-pulse rounded-full bg-[#2f3336]" />
              <span className="mt-4 block h-3 w-full animate-pulse rounded-full bg-[#2f3336]" />
              <span className="mt-2 block h-3 w-2/3 animate-pulse rounded-full bg-[#2f3336]" />
            </div>
          ))}
        </div>
      ) : visibleBlockers.length > 0 ? (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {visibleBlockers.map((blocker) => {
            const Icon = blocker.icon || defaultIcon(blocker.severity);
            const styles = severityStyles[blocker.severity];
            return (
              <Link
                key={blocker.id}
                href={blocker.href}
                className={cn("group flex min-w-0 items-start justify-between gap-3 rounded-2xl border p-4 transition", styles.row)}
              >
                <span className="flex min-w-0 items-start gap-3">
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-full border", styles.icon)}>
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="min-w-0 text-sm font-semibold text-[#e7e9ea]">{blocker.title}</span>
                      {blocker.countLabel ? (
                        <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold", styles.count)}>
                          {blocker.countLabel}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 line-clamp-2 block text-xs leading-5 text-[#8b98a5]">{blocker.description}</span>
                    <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#8ecdf8]">
                      {blocker.actionLabel}
                      <ChevronRight className="size-3.5 transition group-hover:translate-x-0.5" />
                    </span>
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-emerald-300/25 bg-emerald-400/10 text-emerald-100">
              <CheckCircle2 className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-emerald-50">{emptyTitle}</p>
              <p className="mt-1 text-sm leading-6 text-emerald-50/70">{emptyDescription}</p>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
