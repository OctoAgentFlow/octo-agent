"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useT } from "@/i18n/use-t";

type ConfirmOptions = {
  title?: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "destructive";
};

type PendingConfirm = ConfirmOptions & {
  resolve: (confirmed: boolean) => void;
};

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const close = useCallback(
    (confirmed: boolean) => {
      setPending((current) => {
        current?.resolve(confirmed);
        return null;
      });
    },
    []
  );

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...options, resolve });
    });
  }, []);

  const value = useMemo(() => ({ confirm }), [confirm]);
  const tone = pending?.tone || "default";

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Dialog
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open) close(false);
        }}
        title={pending?.title || t("confirm.defaultTitle")}
        description={pending?.description}
        showCloseButton={false}
        className="max-w-md"
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => close(false)}>
            {pending?.cancelLabel || t("common.cancel")}
          </Button>
          <Button type="button" variant={tone === "destructive" ? "destructive" : "default"} onClick={() => close(true)}>
            {pending?.confirmLabel || t("confirm.defaultConfirm")}
          </Button>
        </div>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return ctx;
}
