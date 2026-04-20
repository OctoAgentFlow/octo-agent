"use client";

import { useState } from "react";
import axios from "axios";
import { useChainId, useSignMessage } from "wagmi";

import { getAccessToken } from "@/lib/auth-session";
import { walletService } from "@/services/wallet.service";

type UseWalletBindingOptions = {
  requireAuth?: boolean;
  unauthMessage?: string;
  bindSuccessMessage?: string;
  unbindSuccessMessage?: string;
  onMessage?: (message: string) => void;
};

export function useWalletBinding(options?: UseWalletBindingOptions) {
  const [walletMessage, setWalletMessage] = useState<string | null>(null);
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();

  const requireAuth = options?.requireAuth ?? true;
  const unauthMessage = options?.unauthMessage ?? "Please login first.";
  const bindSuccessMessage = options?.bindSuccessMessage ?? "Wallet bound.";
  const unbindSuccessMessage = options?.unbindSuccessMessage ?? "Wallet unbound.";
  const onMessage = options?.onMessage;

  const setMessage = (message: string) => {
    setWalletMessage(message);
    onMessage?.(message);
  };

  const bindWallet = async (address: string) => {
    if (requireAuth && !getAccessToken()) {
      setMessage(unauthMessage);
      return false;
    }
    try {
      setWalletMessage(null);
      const challenge = await walletService.createChallenge({
        address,
        chain_id: Number(chainId || 1),
      });
      const signature = await signMessageAsync({ message: challenge.message });
      await walletService.bind({
        challenge_id: challenge.challenge_id,
        address,
        signature,
        chain_id: Number(chainId || 1),
      });
      setMessage(bindSuccessMessage);
      return true;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setMessage(error.response?.data?.message || "Wallet bind failed.");
        return false;
      }
      setMessage("Wallet bind failed.");
      return false;
    }
  };

  const unbindWallet = async (address: string) => {
    if (requireAuth && !getAccessToken()) return false;
    try {
      await walletService.unbind({
        address,
        chain_id: Number(chainId || 1),
      });
      setMessage(unbindSuccessMessage);
      return true;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        setMessage(error.response?.data?.message || "Wallet unbind failed.");
        return false;
      }
      setMessage("Wallet unbind failed.");
      return false;
    }
  };

  return {
    walletMessage,
    bindWallet,
    unbindWallet,
    clearWalletMessage: () => setWalletMessage(null),
  };
}
