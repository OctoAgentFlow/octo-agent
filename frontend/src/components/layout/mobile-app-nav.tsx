"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BadgeDollarSign,
  BarChart3,
  Bot,
  Coins,
  Flame,
  LayoutDashboard,
  ListChecks,
  Radar,
  ReceiptText,
  Settings,
  Sparkles,
  UserCircle,
  Users,
  Workflow,
} from "lucide-react";

import { useT } from "@/i18n/use-t";
import { isAdminFrontend } from "@/lib/frontend-role";

const navItems = [
  { labelKey: "sidebar.nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
  { labelKey: "sidebar.nav.oafBots", href: "/oaf-bots", icon: Bot },
  { labelKey: "sidebar.nav.dailyXQueue", href: "/daily-x-queue", icon: Sparkles },
  { labelKey: "sidebar.nav.exposureRadar", href: "/exposure-radar", icon: Radar },
  { labelKey: "sidebar.nav.trends", href: "/trends", icon: Flame },
  { labelKey: "sidebar.nav.automations", href: "/automations", icon: Workflow },
  { labelKey: "sidebar.nav.executionQueue", href: "/execution-queue", icon: ListChecks },
  { labelKey: "sidebar.nav.opportunities", href: "/opportunities", icon: Radar },
  { labelKey: "sidebar.nav.analytics", href: "/analytics", icon: BarChart3 },
  { labelKey: "sidebar.nav.accounts", href: "/accounts", icon: Users },
  { labelKey: "sidebar.nav.points", href: "/points", icon: Coins },
  { labelKey: "sidebar.nav.billing", href: "/billing", icon: BadgeDollarSign },
  { labelKey: "sidebar.nav.settings", href: "/settings", icon: Settings },
  { labelKey: "sidebar.nav.profile", href: "/profile", icon: UserCircle },
];

const adminNavItems = [
  { labelKey: "sidebar.admin.overview", href: "/admin?section=overview", section: "overview", icon: LayoutDashboard },
  { labelKey: "sidebar.admin.users", href: "/admin?section=users", section: "users", icon: Users },
  { labelKey: "sidebar.admin.billing", href: "/admin?section=billing", section: "billing", icon: ReceiptText },
  { labelKey: "sidebar.admin.activity", href: "/admin?section=activity", section: "activity", icon: ListChecks },
  { labelKey: "sidebar.admin.system", href: "/admin?section=system", section: "system", icon: Settings },
];

export function MobileAppNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useT();
  const adminMode = isAdminFrontend();
  const activeAdminSection = searchParams.get("section") || "overview";
  const items = adminMode ? adminNavItems : navItems;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#2f3336] bg-black/92 px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] backdrop-blur-xl md:hidden">
      <div className="flex gap-1 overflow-x-auto overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const active = "section" in item
            ? pathname === "/admin" && item.section === activeAdminSection
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={t(item.labelKey)}
              className={`flex min-w-[72px] shrink-0 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-medium transition-colors ${
                active ? "bg-[#1d9bf0]/12 text-[#e7e9ea]" : "text-[#71767b] hover:bg-[#16181c] hover:text-[#e7e9ea]"
              }`}
            >
              <Icon className={`size-5 ${active ? "text-[#1d9bf0]" : ""}`} />
              <span className="max-w-full truncate">{t(item.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
