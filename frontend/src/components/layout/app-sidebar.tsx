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
  { labelKey: "sidebar.nav.automations", href: "/agents", icon: Bot },
  { labelKey: "sidebar.nav.oafBots", href: "/oaf-bots", icon: Bot },
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
      <Link href="/" className="mb-8 inline-flex w-full items-center rounded-lg outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-blue-300/70">
        <span className="relative block h-[78px] w-full max-w-[178px] overflow-hidden rounded-lg border border-white/10 bg-[#050815]">
          <Image
            src="/brand/oaf-logo.png"
            alt={t("common.brand")}
            fill
            sizes="178px"
            className="object-contain p-2"
            priority
          />
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
