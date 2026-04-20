"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useToast } from "@/components/providers/toast-provider";
import { useT } from "@/i18n/use-t";
import { SUBSCRIPTION_EXPIRED_EVENT } from "@/lib/subscription-expired-event";

/**
 * Listens for global subscription_expired signals and guides the user to Billing.
 */
export function SubscriptionExpiredBridge() {
  const { pushToast } = useToast();
  const { t } = useT();
  const pathname = usePathname() ?? "";
  const router = useRouter();

  useEffect(() => {
    const onExpired = () => {
      pushToast(t("errors.subscriptionExpired"));
      if (!pathname.startsWith("/billing")) {
        router.push("/billing");
      }
    };
    window.addEventListener(SUBSCRIPTION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SUBSCRIPTION_EXPIRED_EVENT, onExpired);
  }, [pathname, pushToast, router, t]);

  return null;
}
