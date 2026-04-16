"use client";

import { Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useT } from "@/i18n/use-t";

type WalletConnectModalProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (provider: "MetaMask" | "WalletConnect") => void;
};

const providers: Array<"MetaMask" | "WalletConnect"> = ["MetaMask", "WalletConnect"];

export function WalletConnectModal({ open, onClose, onSelect }: WalletConnectModalProps) {
  const { t } = useT();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t("auth.wallet.title")}
      description={t("auth.wallet.description")}
    >
      <div className="space-y-2">
        {providers.map((provider) => (
          <Button
            key={provider}
            variant="outline"
            className="w-full justify-start"
            onClick={() => onSelect(provider)}
          >
            <Wallet className="size-4" />
            {provider}
          </Button>
        ))}
      </div>
    </Dialog>
  );
}
