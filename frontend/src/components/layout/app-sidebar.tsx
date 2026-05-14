"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Activity,
  BadgeDollarSign,
  BarChart3,
  Bot,
  FileText,
  LayoutDashboard,
  ListChecks,
  MessageCircle,
  ReceiptText,
  Settings,
  ShieldCheck,
  UserCircle,
  Users,
} from "lucide-react";
import { useT } from "@/i18n/use-t";
import { isAdminFrontend } from "@/lib/frontend-role";

const navItems = [
  { labelKey: "sidebar.nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
  { labelKey: "sidebar.nav.activity", href: "/activity", icon: Activity },
  { labelKey: "sidebar.nav.executionQueue", href: "/execution-queue", icon: ListChecks },
  { labelKey: "sidebar.nav.automations", href: "/agents", icon: Bot },
  { labelKey: "sidebar.nav.oafBots", href: "/oaf-bots", icon: Bot },
  { labelKey: "sidebar.nav.autoComments", href: "/auto-comments", icon: MessageCircle },
  { labelKey: "sidebar.nav.accounts", href: "/accounts", icon: Users },
  { labelKey: "sidebar.nav.posts", href: "/posts", icon: FileText },
  { labelKey: "sidebar.nav.analytics", href: "/analytics", icon: BarChart3 },
  { labelKey: "sidebar.nav.billing", href: "/billing", icon: BadgeDollarSign },
  { labelKey: "sidebar.nav.admin", href: "/admin", icon: ShieldCheck },
  { labelKey: "sidebar.nav.settings", href: "/settings", icon: Settings },
  { labelKey: "sidebar.nav.profile", href: "/profile", icon: UserCircle },
];

const adminNavItems = [
  { label: "运营总览", href: "/admin?section=overview", section: "overview", icon: LayoutDashboard },
  { label: "用户管理", href: "/admin?section=users", section: "users", icon: Users },
  { label: "订单审核", href: "/admin?section=billing", section: "billing", icon: ReceiptText },
  { label: "活动监控", href: "/admin?section=activity", section: "activity", icon: Activity },
  { label: "系统配置", href: "/admin?section=system", section: "system", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useT();
  const adminMode = isAdminFrontend();
  const visibleNavItems = adminMode ? adminNavItems : navItems.filter((item) => item.href !== "/admin");
  const activeAdminSection = searchParams.get("section") || "overview";

  return (
    <aside className="hidden border-r border-white/10 bg-[#0b1020]/70 p-5 backdrop-blur md:flex md:flex-col">
      <Link
        href="/"
        className="mb-8 flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 outline-none transition hover:border-blue-300/25 hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-blue-300/70"
      >
        <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-blue-500/20 to-violet-500/20 shadow-[0_0_24px_rgba(96,165,250,0.18)]">
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
          <span className="whitespace-nowrap text-sm font-semibold leading-5 text-white">Octo-Agent</span>
          <span className="whitespace-nowrap text-xs leading-4 text-indigo-200/70">Flow</span>
        </span>
      </Link>
      <nav className="space-y-1">
        {visibleNavItems.map((item) => {
          const active = "section" in item
            ? pathname === "/admin" && item.section === activeAdminSection
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                active ? "bg-white/12 text-white" : "text-white/65 hover:bg-white/8 hover:text-white"
              }`}
            >
              <item.icon className="size-4" />
              {"label" in item ? item.label : t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

    </aside>
  );
}
