"use client";

import { useEffect, useRef } from "react";
import { useAppKit } from "@reown/appkit/react";
import { Wallet } from "lucide-react";
import { useAccount, useDisconnect } from "wagmi";
import { Button } from "@/components/ui/button";
import { useWeb3Ready } from "@/components/providers/web3-provider";
import { cn } from "@/lib/utils";

type ConnectWalletButtonProps = {
  className?: string;
  connectLabel?: string;
  disconnectLabel?: string;
  onConnected?: (address: string) => void | Promise<void>;
  onDisconnected?: (address: string) => void | Promise<void>;
};

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function ConnectWalletButton({
  className,
  connectLabel = "Connect Wallet",
  disconnectLabel = "Disconnect",
  onConnected,
  onDisconnected,
}: ConnectWalletButtonProps) {
  const ready = useWeb3Ready();

  if (!ready) {
    return (
      <Button
        variant="outline"
        className={cn(
          "h-10 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white",
          className
        )}
        disabled
      >
        <Wallet className="size-4" />
        {connectLabel}
      </Button>
    );
  }

  return (
    <ConnectWalletButtonInner
      className={className}
      connectLabel={connectLabel}
      disconnectLabel={disconnectLabel}
      onConnected={onConnected}
      onDisconnected={onDisconnected}
    />
  );
}

function ConnectWalletButtonInner({
  className,
  connectLabel = "Connect Wallet",
  disconnectLabel = "Disconnect",
  onConnected,
  onDisconnected,
}: ConnectWalletButtonProps) {
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const handledAddressRef = useRef<string | null>(null);
  const connectRequestedRef = useRef(false);

  useEffect(() => {
    if (!isConnected || !address) {
      handledAddressRef.current = null;
      connectRequestedRef.current = false;
      return;
    }
    if (!connectRequestedRef.current) return;
    if (handledAddressRef.current === address) return;
    handledAddressRef.current = address;
    connectRequestedRef.current = false;
    void Promise.resolve(onConnected?.(address));
  }, [address, isConnected, onConnected]);

  const openWalletModal = () => {
    void open();
  };

  const onConnect = () => {
    connectRequestedRef.current = true;
    void open();
  };

  const onDisconnect = () => {
    if (address) {
      void Promise.resolve(onDisconnected?.(address));
    }
    disconnect();
  };

  if (isConnected && address) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Button
          variant="outline"
          className="stable-cta-md h-9 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
          onClick={openWalletModal}
        >
          {shortAddress(address)}
        </Button>
        <Button variant="ghost" className="stable-cta-sm h-9 text-white/80 hover:bg-white/10 hover:text-white" onClick={onDisconnect}>
          {disconnectLabel}
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      className={cn(
        "h-10 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white",
        className
      )}
      onClick={onConnect}
    >
      <Wallet className="size-4" />
      {connectLabel}
    </Button>
  );
}
