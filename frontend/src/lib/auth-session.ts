"use client";

const AUTH_STORAGE_KEY = "octo_auth_session";

type AuthSession = {
  loggedIn: true;
  loginAt: number;
  accessToken: string;
  refreshToken: string;
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
    if (data.loggedIn !== true) return false;
    // Must match what axios attaches as Bearer; otherwise AuthGate passes but all APIs 401.
    return typeof data.accessToken === "string" && data.accessToken.length > 0;
  } catch {
    return false;
  }
}

export function signIn(accessToken: string, refreshToken: string) {
  if (typeof window === "undefined") return;
  const session: AuthSession = { loggedIn: true, loginAt: Date.now(), accessToken, refreshToken };
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function signOut() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

export function getAccessToken() {
  try {
    const raw = readRaw();
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<AuthSession>;
    return typeof data.accessToken === "string" ? data.accessToken : null;
  } catch {
    return null;
  }
}

export function getRefreshToken() {
  try {
    const raw = readRaw();
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<AuthSession>;
    return typeof data.refreshToken === "string" ? data.refreshToken : null;
  } catch {
    return null;
  }
}

export function resolveNextPath(next: string | null | undefined, fallback = "/dashboard") {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  if (next.startsWith("/login")) return fallback;
  return next;
}

