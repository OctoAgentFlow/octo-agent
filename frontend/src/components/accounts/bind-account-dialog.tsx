"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";

import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/use-t";

type BindAccountDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function BindAccountDialog({ open, onOpenChange }: BindAccountDialogProps) {
  const { t } = useT();
  const [status, setStatus] = useState<"idle" | "binding" | "done">("idle");

  const bind = async () => {
    setStatus("binding");
    await new Promise((r) => setTimeout(r, 900));
    setStatus("done");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setStatus("idle");
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
          {status === "binding"
            ? t("accounts.bind.cta.redirecting")
            : status === "done"
              ? t("accounts.bind.cta.authorizedMock")
              : t("accounts.bind.cta.authorize")}
        </Button>
        <p className="text-xs text-white/55">{t("accounts.bind.mockHint")}</p>
      </div>
    </Dialog>
  );
}
