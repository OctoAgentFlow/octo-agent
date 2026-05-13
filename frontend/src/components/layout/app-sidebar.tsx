"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BadgeDollarSign,
  BarChart3,
  Bot,
  FileText,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  UserCircle,
  Users,
} from "lucide-react";
import { useT } from "@/i18n/use-t";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth-session";
import { isAdminFrontend } from "@/lib/frontend-role";

const navItems = [
  { labelKey: "sidebar.nav.dashboard", href: "/dashboard", icon: LayoutDashboard },
  { labelKey: "sidebar.nav.activity", href: "/activity", icon: Activity },
  { labelKey: "sidebar.nav.automations", href: "/agents", icon: Bot },
  { labelKey: "sidebar.nav.accounts", href: "/accounts", icon: Users },
  { labelKey: "sidebar.nav.posts", href: "/posts", icon: FileText },
  { labelKey: "sidebar.nav.analytics", href: "/analytics", icon: BarChart3 },
  { labelKey: "sidebar.nav.billing", href: "/billing", icon: BadgeDollarSign },
  { labelKey: "sidebar.nav.admin", href: "/admin", icon: ShieldCheck },
  { labelKey: "sidebar.nav.settings", href: "/settings", icon: Settings },
  { labelKey: "sidebar.nav.profile", href: "/profile", icon: UserCircle },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useT();
  const visibleNavItems = isAdminFrontend() ? navItems.filter((item) => item.href === "/admin") : navItems.filter((item) => item.href !== "/admin");

  const onLogout = () => {
    signOut();
    router.replace("/login");
  };

  return (
    <aside className="hidden border-r border-white/10 bg-[#0b1020]/70 p-5 backdrop-blur md:flex md:flex-col">
      <div className="mb-8 flex items-center gap-2">
        <span className="inline-block size-2 rounded-full bg-gradient-to-r from-blue-400 to-violet-400" />
        <span className="text-sm font-semibold tracking-wide text-white">{t("common.brand")}</span>
      </div>
      <nav className="space-y-1">
        {visibleNavItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={`${item.href}-${item.labelKey}`}
              href={item.href}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                active ? "bg-white/12 text-white" : "text-white/65 hover:bg-white/8 hover:text-white"
              }`}
            >
              <item.icon className="size-4" />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      <div className="surface-card mt-auto space-y-3 p-3">
        <Button variant="outline" className="w-full justify-start" onClick={onLogout}>
          <LogOut className="size-4" />
          {t("common.logout")}
        </Button>
        <p className="text-xs text-white/55">{t("sidebar.workspace")}</p>
        <p className="text-sm font-medium text-white">{t("sidebar.workspaceTeam")}</p>
      </div>
    </aside>
  );
}
