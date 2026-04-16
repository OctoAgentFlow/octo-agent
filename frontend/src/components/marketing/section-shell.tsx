import { cn } from "@/lib/utils";

type SectionShellProps = {
  id?: string;
  badge?: string;
  title: string;
  description?: string;
  className?: string;
  children: React.ReactNode;
};

export function SectionShell({ id, badge, title, description, className, children }: SectionShellProps) {
  return (
    <section id={id} className={cn("mx-auto w-full max-w-6xl px-6 py-14 md:px-8", className)}>
      <div className="mb-8 space-y-3">
        {badge ? (
          <span className="inline-flex rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs tracking-wide text-white/70 uppercase">
            {badge}
          </span>
        ) : null}
        <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">{title}</h2>
        {description ? <p className="max-w-2xl text-sm text-white/60 md:text-base">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
