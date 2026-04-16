import { cn } from "@/lib/utils";

export type BadgeVariant = "default" | "success" | "warning" | "info" | "danger";

type BadgeProps = {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
};

const styles: Record<BadgeVariant, string> = {
  default: "border-white/15 bg-white/5 text-white/70",
  success: "border-emerald-300/30 bg-emerald-400/10 text-emerald-200",
  warning: "border-amber-300/30 bg-amber-400/10 text-amber-200",
  info: "border-blue-300/30 bg-blue-500/10 text-blue-200",
  danger: "border-rose-300/30 bg-rose-400/10 text-rose-200",
};

export function Badge({ variant = "default", className, children }: BadgeProps) {
  return (
    <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs", styles[variant], className)}>
      {children}
    </span>
  );
}

