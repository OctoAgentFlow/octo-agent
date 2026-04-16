"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/i18n/use-t";

type AuthMode = "login" | "register";

type AuthModeSwitchProps = {
  mode: AuthMode;
  onChange: (mode: AuthMode) => void;
};

export function AuthModeSwitch({ mode, onChange }: AuthModeSwitchProps) {
  const { t } = useT();
  return (
    <div className="grid grid-cols-2 rounded-xl border border-white/10 bg-white/5 p-1">
      <button
        type="button"
        onClick={() => onChange("login")}
        className={cn(
          "rounded-lg px-3 py-2 text-sm transition-colors",
          mode === "login" ? "bg-white/12 text-white" : "text-white/60 hover:text-white/80"
        )}
      >
        {t("auth.mode.login")}
      </button>
      <button
        type="button"
        onClick={() => onChange("register")}
        className={cn(
          "rounded-lg px-3 py-2 text-sm transition-colors",
          mode === "register" ? "bg-white/12 text-white" : "text-white/60 hover:text-white/80"
        )}
      >
        {t("auth.mode.register")}
      </button>
    </div>
  );
}
