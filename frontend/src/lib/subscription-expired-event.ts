/** Dispatched when an API returns error_code subscription_expired (handled in axios interceptor). */
export const SUBSCRIPTION_EXPIRED_EVENT = "octo:subscription-expired";

export function emitSubscriptionExpired() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SUBSCRIPTION_EXPIRED_EVENT));
}
