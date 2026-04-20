"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { LoginForm } from "@/components/forms/login-form";
import { useToast } from "@/components/providers/toast-provider";
import { ConnectWalletButton } from "@/components/web3/connect-wallet-button";
import { useWalletBinding } from "@/hooks/use-wallet-binding";
import { useT } from "@/i18n/use-t";
import { signIn } from "@/lib/auth-session";

import { AuthModeSwitch } from "./auth-mode-switch";

type AuthMode = "login" | "register";

type AuthCardProps = {
  nextPath?: string;
};

export function AuthCard({ nextPath = "/dashboard" }: AuthCardProps) {
  const router = useRouter();
  const { t } = useT();
  const { pushToast } = useToast();
  const [mode, setMode] = useState<AuthMode>("login");
  const { bindWallet } = useWalletBinding({
    unauthMessage: "Please login or register first, then bind wallet.",
    bindSuccessMessage: "Wallet bound successfully.",
    onMessage: pushToast,
  });

  const handleAuthSuccess = (_mode: AuthMode, tokens: { accessToken: string; refreshToken: string }) => {
    signIn(tokens.accessToken, tokens.refreshToken);
    router.replace(nextPath);
  };

  const handleWalletConnected = async (address: string) => {
    const ok = await bindWallet(address);
    if (ok) {
      router.replace(nextPath);
    }
  };

  return (
    <>
      <section className="surface-card rounded-3xl p-6 shadow-2xl md:p-8">
        <div className="mb-6 space-y-2">
          <p className="text-xs tracking-wide text-blue-200/85 uppercase">{t("auth.card.kicker")}</p>
          <h2 className="text-2xl font-semibold text-white">{t("auth.card.title")}</h2>
          <p className="text-sm text-white/65">
            {mode === "login" ? t("auth.card.subtitle.login") : t("auth.card.subtitle.register")}
          </p>
        </div>

        <div className="space-y-4">
          <AuthModeSwitch mode={mode} onChange={setMode} />
          <LoginForm mode={mode} onSuccess={handleAuthSuccess} />

          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <span className="h-px w-full bg-white/10" />
            </div>
            <p className="relative mx-auto w-fit bg-[#0d1122] px-2 text-xs text-white/50">OR</p>
          </div>

          <ConnectWalletButton className="w-full" connectLabel={t("auth.card.connectWallet")} onConnected={handleWalletConnected} />

          <p className="rounded-xl border border-blue-300/25 bg-blue-500/10 px-3 py-2 text-xs text-blue-100/90">
            {t("auth.card.freeTrialNote")}
          </p>
        </div>
      </section>
    </>
  );
}
