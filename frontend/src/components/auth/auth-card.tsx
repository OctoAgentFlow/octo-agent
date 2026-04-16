"use client";

import { useState } from "react";
import { Wallet } from "lucide-react";

import { LoginForm } from "@/components/forms/login-form";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";

import { AuthModeSwitch } from "./auth-mode-switch";
import { WalletConnectModal } from "./wallet-connect-modal";

type AuthMode = "login" | "register";

export function AuthCard() {
  const { t } = useT();
  const [mode, setMode] = useState<AuthMode>("login");
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [walletStatus, setWalletStatus] = useState<string | null>(null);

  const handleWalletSelect = (provider: "MetaMask" | "WalletConnect") => {
    setWalletStatus(`Connected with ${provider} (mock)`);
    setWalletModalOpen(false);
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
          <LoginForm mode={mode} />

          <div className="relative py-1">
            <div className="absolute inset-0 flex items-center">
              <span className="h-px w-full bg-white/10" />
            </div>
            <p className="relative mx-auto w-fit bg-[#0d1122] px-2 text-xs text-white/50">OR</p>
          </div>

          <Button
            variant="outline"
            className="h-10 w-full border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            onClick={() => setWalletModalOpen(true)}
          >
            <Wallet className="size-4" />
            {t("auth.card.connectWallet")}
          </Button>

          <p className="rounded-xl border border-blue-300/25 bg-blue-500/10 px-3 py-2 text-xs text-blue-100/90">
            {t("auth.card.freeTrialNote")}
          </p>

          {walletStatus ? <p className="text-xs text-emerald-300">{walletStatus}</p> : null}
        </div>
      </section>

      <WalletConnectModal open={walletModalOpen} onClose={() => setWalletModalOpen(false)} onSelect={handleWalletSelect} />
    </>
  );
}
