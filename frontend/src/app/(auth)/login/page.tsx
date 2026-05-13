"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AuthGate } from "@/components/auth/auth-gate";
import { AuthCard } from "@/components/auth/auth-card";
import { BrandPanel } from "@/components/auth/brand-panel";
import { resolveNextPath } from "@/lib/auth-session";
import { isAdminFrontend } from "@/lib/frontend-role";

function LoginPageContent() {
  const searchParams = useSearchParams();
  const next = resolveNextPath(searchParams.get("next"), isAdminFrontend() ? "/admin" : "/dashboard");

  return (
    <AuthGate mode="guest" redirectTo={next}>
      <div className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-6 px-6 py-10 md:grid-cols-2 md:px-8">
        <BrandPanel />
        <AuthCard nextPath={next} adminMode={isAdminFrontend()} />
      </div>
    </AuthGate>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
