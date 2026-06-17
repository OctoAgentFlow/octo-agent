"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import {
  BadgeDollarSign,
  BarChart3,
  Bot,
  Database,
  LayoutDashboard,
  ListChecks,
  Radar,
  ReceiptText,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useT } from "@/i18n/use-t";
import { isAdminFrontend } from "@/lib/frontend-role";

const navGroups = [
  {
    labelKey: "sidebar.group.workspace",
    items: [
      { labelKey: "sidebar.nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
      { labelKey: "sidebar.nav.exposureRadar", href: "/exposure-radar", icon: Radar },
      { labelKey: "sidebar.nav.contentMemory", href: "/content-library", icon: Database },
    ],
  },
  {
    labelKey: "sidebar.group.oafBotWorkflow",
    items: [
      { labelKey: "sidebar.nav.oafBots", href: "/oaf-bots", icon: Bot },
      { labelKey: "sidebar.nav.accounts", href: "/accounts", icon: Users },
    ],
  },
  {
    labelKey: "sidebar.group.operations",
    items: [
      { labelKey: "sidebar.nav.executionQueue", href: "/handling-list", icon: ListChecks },
      { labelKey: "sidebar.nav.analytics", href: "/analytics", icon: BarChart3 },
    ],
  },
  {
    labelKey: "sidebar.group.accountSettings",
    items: [
      { labelKey: "sidebar.nav.billing", href: "/billing", icon: BadgeDollarSign },
      { labelKey: "sidebar.nav.admin", href: "/admin", icon: ShieldCheck },
      { labelKey: "sidebar.nav.settings", href: "/settings", icon: Settings },
    ],
  },
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
  const visibleNavGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.href !== "/admin"),
    }))
    .filter((group) => group.items.length > 0);
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
      <nav className="space-y-5">
        {adminMode ? adminNavItems.map((item) => {
          const active = pathname === "/admin" && item.section === activeAdminSection;
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
        }) : visibleNavGroups.map((group) => (
          <div key={group.labelKey} className="space-y-1.5">
            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#71767b]">
              {t(group.labelKey)}
            </p>
            {group.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
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
          </div>
        ))}
      </nav>

    </aside>
  );
}
