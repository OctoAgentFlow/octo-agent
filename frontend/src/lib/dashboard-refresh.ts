const DASHBOARD_REFRESH_EVENT = "octo:dashboard:refresh";

export function broadcastDashboardRefresh() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(DASHBOARD_REFRESH_EVENT));
}

export function subscribeDashboardRefresh(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => listener();
  window.addEventListener(DASHBOARD_REFRESH_EVENT, handler);
  return () => window.removeEventListener(DASHBOARD_REFRESH_EVENT, handler);
}
