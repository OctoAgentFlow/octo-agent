"use client";

import { usePathname } from "next/navigation";
import { AuthGate } from "@/components/auth/auth-gate";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const next = encodeURIComponent(pathname || "/dashboard");
  return (
    <AuthGate mode="auth" redirectTo={`/login?next=${next}`}>
      <DashboardShell>{children}</DashboardShell>
    </AuthGate>
  );
}
