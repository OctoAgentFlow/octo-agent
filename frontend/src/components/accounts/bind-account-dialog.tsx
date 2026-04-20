"use client";

import { useState } from "react";
import axios from "axios";
import { Link2 } from "lucide-react";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";

type BindAccountDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAuthorize: () => Promise<void>;
};

export function BindAccountDialog({ open, onOpenChange, onAuthorize }: BindAccountDialogProps) {
  const { t } = useT();
  const [status, setStatus] = useState<"idle" | "binding" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const bind = async () => {
    setStatus("binding");
    setErrorMessage(null);
    try {
      await onAuthorize();
    } catch (error) {
      let message = "Failed to start OAuth.";
      if (axios.isAxiosError(error)) {
        const body = error.response?.data as { message?: string } | undefined;
        const fromApi = typeof body?.message === "string" ? body.message.trim() : "";
        message = fromApi || error.message || message;
      } else if (error instanceof Error) {
        message = error.message;
      }
      setErrorMessage(message);
      setStatus("error");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setStatus("idle");
          setErrorMessage(null);
        }
      }}
      title={t("accounts.bind.title")}
      description={t("accounts.bind.description")}
    >
      <div className="space-y-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white/70">
          {t("accounts.bind.notice")}
        </div>
        <Button onClick={bind} disabled={status === "binding"} className="w-full">
          <Link2 className="size-4" />
          {status === "binding" ? t("accounts.bind.cta.redirecting") : t("accounts.bind.cta.authorize")}
        </Button>
        {errorMessage ? <p className="text-xs text-rose-300">{errorMessage}</p> : null}
      </div>
    </Dialog>
  );
}
