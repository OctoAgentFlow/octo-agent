"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileAppNav } from "@/components/layout/mobile-app-nav";
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
  "/automations",
  "/auto-post",
  "/auto-replies",
  "/auto-comments",
  "/auto-dms",
  "/execution-queue",
  "/oaf-bots",
  "/activity",
  "/analytics",
  "/admin",
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
      <div className="relative mx-auto grid min-h-screen w-full max-w-[1440px] md:grid-cols-[280px_minmax(0,1fr)]">
        <AppSidebar />
        <div className="flex min-h-screen min-w-0 flex-col">
          <AppHeader />
          <main className="min-w-0 flex-1 overflow-x-hidden border-r border-[#2f3336] p-4 pb-28 md:p-6">{children}</main>
        </div>
      </div>
      <MobileAppNav />
    </div>
  );
}
