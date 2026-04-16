import { cn } from "@/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  error?: string;
};

export function Input({ className, error, ...props }: InputProps) {
  return (
    <div className="space-y-1.5">
      <input className={cn("form-input", error && "border-rose-300/40 focus:border-rose-300/60 focus:shadow-[0_0_0_3px_rgba(244,63,94,0.18)]", className)} {...props} />
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}

