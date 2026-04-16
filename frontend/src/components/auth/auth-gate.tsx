"use client";

import { useEffect } from "react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { isAuthed } from "@/lib/auth-session";

type AuthGateMode = "auth" | "guest";

type AuthGateProps = {
  mode: AuthGateMode;
  redirectTo: string;
  children: React.ReactNode;
};

export function AuthGate({ mode, redirectTo, children }: AuthGateProps) {
  const router = useRouter();
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setAuthed(isAuthed());
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const allowed = authed === null ? false : mode === "auth" ? authed : !authed;

  useEffect(() => {
    if (authed === null) return;
    if (!allowed) router.replace(redirectTo);
  }, [allowed, authed, redirectTo, router]);

  if (authed === null || !allowed) return null;
  return <>{children}</>;
}

