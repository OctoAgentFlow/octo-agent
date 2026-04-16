"use client";

const AUTH_STORAGE_KEY = "octo_auth_session";

type AuthSession = {
  loggedIn: true;
  loginAt: number;
};

function readRaw() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(AUTH_STORAGE_KEY);
}

export function isAuthed() {
  try {
    const raw = readRaw();
    if (!raw) return false;
    const data = JSON.parse(raw) as Partial<AuthSession>;
    return data.loggedIn === true;
  } catch {
    return false;
  }
}

export function signIn() {
  if (typeof window === "undefined") return;
  const session: AuthSession = { loggedIn: true, loginAt: Date.now() };
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function signOut() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function resolveNextPath(next: string | null | undefined, fallback = "/dashboard") {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  if (next.startsWith("/login")) return fallback;
  return next;
}

