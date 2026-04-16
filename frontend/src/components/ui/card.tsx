import { cn } from "@/lib/utils";

type CardProps = {
  className?: string;
  children: React.ReactNode;
};

type CardHeaderProps = {
  title?: string;
  description?: string;
  className?: string;
  right?: React.ReactNode;
};

export function Card({ className, children }: CardProps) {
  return <section className={cn("surface-card p-5 md:p-6", className)}>{children}</section>;
}

export function CardHeader({ title, description, className, right }: CardHeaderProps) {
  if (!title && !description && !right) return null;
  return (
    <header className={cn("mb-4 flex items-start justify-between gap-4", className)}>
      <div className="space-y-1">
        {title ? <h3 className="text-base font-semibold text-white md:text-lg">{title}</h3> : null}
        {description ? <p className="text-sm text-white/60">{description}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </header>
  );
}

