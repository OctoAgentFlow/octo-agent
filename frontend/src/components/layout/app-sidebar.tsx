"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BadgeDollarSign,
  BarChart3,
  Bot,
  Coins,
  FileText,
  Flame,
  LayoutDashboard,
  ListChecks,
  Radar,
  ReceiptText,
  Settings,
  Sparkles,
  ShieldCheck,
  UserCircle,
  Users,
  Workflow,
} from "lucide-react";
import { useT } from "@/i18n/use-t";
import { isAdminFrontend } from "@/lib/frontend-role";

const navItems = [
  { labelKey: "sidebar.nav.dailyXQueue", href: "/daily-x-queue", icon: Sparkles },
  { labelKey: "sidebar.nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
  { labelKey: "sidebar.nav.accounts", href: "/accounts", icon: Users },
  { labelKey: "sidebar.nav.points", href: "/points", icon: Coins },
  { labelKey: "sidebar.nav.oafBots", href: "/oaf-bots", icon: Bot },
  { labelKey: "sidebar.nav.trends", href: "/trends", icon: Flame },
  { labelKey: "sidebar.nav.automations", href: "/automations", icon: Workflow },
  { labelKey: "sidebar.nav.opportunities", href: "/opportunities", icon: Radar },
  { labelKey: "sidebar.nav.executionQueue", href: "/execution-queue", icon: ListChecks },
  { labelKey: "sidebar.nav.posts", href: "/posts", icon: FileText },
  { labelKey: "sidebar.nav.analytics", href: "/analytics", icon: BarChart3 },
  { labelKey: "sidebar.nav.billing", href: "/billing", icon: BadgeDollarSign },
  { labelKey: "sidebar.nav.admin", href: "/admin", icon: ShieldCheck },
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

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useT();
  const adminMode = isAdminFrontend();
  const visibleNavItems = adminMode ? adminNavItems : navItems.filter((item) => item.href !== "/admin");
  const activeAdminSection = searchParams.get("section") || "overview";

  return (
    <aside className="hidden border-r border-[#2f3336] bg-black/88 px-5 py-4 backdrop-blur md:flex md:flex-col">
      <Link
        href="/"
        className="mb-6 flex w-full items-center gap-3 rounded-full px-2 py-2 outline-none transition hover:bg-[#16181c] focus-visible:ring-2 focus-visible:ring-[#1d9bf0]/70"
      >
        <span className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#2f3336] bg-[#0f1419]">
          <Image
            src="/brand/oaf-octopus-icon.png"
            alt={t("common.brand")}
            width={32}
            height={32}
            sizes="32px"
            className="size-8 object-contain"
            priority
          />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="whitespace-nowrap text-base font-bold leading-5 text-[#e7e9ea]">Octo-Agent</span>
          <span className="whitespace-nowrap text-xs leading-4 text-[#71767b]">Flow</span>
        </span>
      </Link>
      <nav className="space-y-1.5">
        {visibleNavItems.map((item) => {
          const active = "section" in item
            ? pathname === "/admin" && item.section === activeAdminSection
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-full px-3 py-2.5 text-[15px] font-medium transition-colors ${
                active ? "bg-[#1d9bf0]/12 text-[#e7e9ea]" : "text-[#e7e9ea]/75 hover:bg-[#16181c] hover:text-[#e7e9ea]"
              }`}
            >
              <item.icon className={`size-5 ${active ? "text-[#1d9bf0]" : ""}`} />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

    </aside>
  );
}
