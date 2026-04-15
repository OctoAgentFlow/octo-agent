const TOKEN_KEY = "octo_token";

export function setToken(token: string) { localStorage.setItem(TOKEN_KEY, token); }
export function getToken() { return typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY); }
export function clearToken() { localStorage.removeItem(TOKEN_KEY); }
