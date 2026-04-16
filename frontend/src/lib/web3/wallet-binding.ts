"use client";

const WALLET_BINDING_KEY = "octo_bound_wallet_address";

export async function bindWalletAddressToCurrentUser(address: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WALLET_BINDING_KEY, address);
  // TODO: replace with real backend API call when wallet bind endpoint is ready.
}

export function getBoundWalletAddress() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(WALLET_BINDING_KEY);
}

export function clearBoundWalletAddress() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(WALLET_BINDING_KEY);
}

