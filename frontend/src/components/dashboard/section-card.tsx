import { cn } from "@/lib/utils";

type SectionCardProps = {
  title?: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
};

export function SectionCard({ title, description, className, children }: SectionCardProps) {
  return (
    <section className={cn("surface-card p-5 md:p-6", className)}>
      {(title || description) && (
        <header className="mb-4 space-y-1">
          {title ? <h3 className="text-base font-semibold text-white md:text-lg">{title}</h3> : null}
          {description ? <p className="text-sm text-white/60">{description}</p> : null}
        </header>
      )}
      {children}
    </section>
  );
}
