"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SubscriptionExpiredBridge } from "@/components/layout/subscription-expired-bridge";
import { broadcastPageRefreshComplete, subscribePageRefreshRequest } from "@/lib/app-page-refresh";

type DashboardShellProps = {
  children: React.ReactNode;
};

/** Routes whose page component runs a real data refetch on header Refresh. Others immediately clear the header busy state. */
const PATHS_WITH_DATA_REFRESH = new Set([
  "/dashboard",
  "/accounts",
  "/agents",
  "/activity",
  "/analytics",
  "/billing",
  "/profile",
  "/settings",
  "/posts",
]);

export function DashboardShell({ children }: DashboardShellProps) {
  const pathname = usePathname() ?? "";

  useEffect(() => {
    return subscribePageRefreshRequest(() => {
      if (PATHS_WITH_DATA_REFRESH.has(pathname)) {
        return;
      }
      broadcastPageRefreshComplete();
    });
  }, [pathname]);

  return (
    <div className="surface-page relative min-h-screen text-white">
      <SubscriptionExpiredBridge />
      <div className="relative mx-auto grid min-h-screen w-full max-w-[1440px] md:grid-cols-[260px_1fr]">
        <AppSidebar />
        <div className="flex min-h-screen flex-col">
          <AppHeader />
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
