const PAGE_REFRESH_REQUEST = "octo:page:refresh-request";
const PAGE_REFRESH_COMPLETE = "octo:page:refresh-complete";
const PAGE_DATA_SYNCED = "octo:page:data-synced";

export function broadcastPageRefreshRequest() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PAGE_REFRESH_REQUEST));
}

export function broadcastPageRefreshComplete() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PAGE_REFRESH_COMPLETE));
}

/** Call after a successful data load (initial mount or user-triggered refetch) to update the header “synced” chip. */
export function broadcastDataSynced(syncedAt: number = Date.now()) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PAGE_DATA_SYNCED, { detail: { syncedAt } }));
}

export function subscribePageRefreshRequest(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => listener();
  window.addEventListener(PAGE_REFRESH_REQUEST, handler);
  return () => window.removeEventListener(PAGE_REFRESH_REQUEST, handler);
}

export function subscribePageRefreshComplete(listener: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => listener();
  window.addEventListener(PAGE_REFRESH_COMPLETE, handler);
  return () => window.removeEventListener(PAGE_REFRESH_COMPLETE, handler);
}

export function subscribeDataSynced(listener: (syncedAt: number) => void) {
  if (typeof window === "undefined") return () => {};
  const handler = (ev: Event) => {
    const ce = ev as CustomEvent<{ syncedAt?: number }>;
    const at = typeof ce.detail?.syncedAt === "number" ? ce.detail.syncedAt : Date.now();
    listener(at);
  };
  window.addEventListener(PAGE_DATA_SYNCED, handler);
  return () => window.removeEventListener(PAGE_DATA_SYNCED, handler);
}
