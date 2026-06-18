#!/usr/bin/env node

const rawApiBase = process.env.SMOKE_API_BASE_URL || process.env.API_BASE_URL || "http://127.0.0.1:10001/api/v1";
const apiBase = normalizeApiBase(rawApiBase);
const healthURL = process.env.SMOKE_HEALTH_URL || deriveHealthURL(apiBase);
const token = process.env.SMOKE_JWT || process.env.OCTO_SMOKE_JWT || process.env.JWT || "";
const timeoutMs = positiveInt(process.env.SMOKE_TIMEOUT_MS, 10000);
const requireAuth = process.env.SMOKE_STRICT_AUTH === "1";
const requireActivated = process.env.SMOKE_REQUIRE_ACTIVATED === "1";
const requireHealth = process.env.SMOKE_REQUIRE_HEALTH === "1";
const skipHealth = process.env.SMOKE_SKIP_HEALTH === "1";

const authBoundaryChecks = [
  { key: "dashboard", label: "Dashboard overview", path: "/dashboard/overview" },
  { key: "accounts", label: "X accounts", path: "/accounts" },
  { key: "oafBots", label: "OAF Bots", path: "/oaf-bots" },
  { key: "contentMemory", label: "Content Memory", path: "/content-library/items?limit=5" },
  { key: "contentDrafts", label: "Content Drafts", path: "/content-drafts/drafts" },
  { key: "handlingList", label: "Handling List", path: "/review-queue?page_size=5" },
  { key: "growthStrategy", label: "Growth Strategy", path: "/exposure-radar/strategy?region=en" },
  { key: "manualRecords", label: "Manual handling records", path: "/exposure-radar/manual-records/recent?days=14&limit=5" },
  {
    key: "radarEn",
    label: "Exposure Radar English",
    path: "/trends/exposure-radar?region=en&hours=4&max_fans=10000&min_hot_count=0&limit=5",
  },
  {
    key: "radarZh",
    label: "Exposure Radar Chinese",
    path: "/trends/exposure-radar?region=zh&hours=4&max_fans=10000&min_hot_count=0&limit=5",
  },
];

const authenticatedChecks = [
  { ...authBoundaryChecks[0], shape: "object" },
  { ...authBoundaryChecks[1], shape: "items" },
  { ...authBoundaryChecks[2], shape: "items" },
  { ...authBoundaryChecks[3], shape: "items" },
  { ...authBoundaryChecks[4], shape: "items" },
  { ...authBoundaryChecks[5], shape: "reviewQueue" },
  { ...authBoundaryChecks[6], shape: "object" },
  { ...authBoundaryChecks[7], shape: "items" },
  { ...authBoundaryChecks[8], shape: "exposureRadar" },
  { ...authBoundaryChecks[9], shape: "exposureRadar" },
];

function normalizeApiBase(value) {
  const trimmed = String(value || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "http://127.0.0.1:10001/api/v1";
  if (trimmed.endsWith("/api")) return `${trimmed}/v1`;
  return trimmed;
}

function deriveHealthURL(base) {
  const url = new URL(base);
  url.pathname = url.pathname.replace(/\/api\/v1\/?$/, "/health").replace(/\/api\/?$/, "/health");
  if (!url.pathname.endsWith("/health")) url.pathname = "/health";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function endpointURL(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${apiBase}${path.startsWith("/") ? path : `/${path}`}`;
}

function authHeaders() {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function parseBody(response) {
  const text = await response.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function unwrapData(payload) {
  if (payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "data")) {
    return payload.data;
  }
  return payload;
}

async function requestJSON(check, expectedStatuses, authenticated = false) {
  const response = await fetchWithTimeout(endpointURL(check.path), {
    method: "GET",
    headers: {
      Accept: "application/json",
      ...(authenticated ? authHeaders() : {}),
    },
    redirect: "manual",
  });
  const payload = await parseBody(response);
  if (!expectedStatuses.includes(response.status)) {
    const message =
      payload && typeof payload === "object" && "message" in payload ? `: ${payload.message}` : "";
    throw new Error(`${check.label} returned HTTP ${response.status}${message}`);
  }
  return {
    ...check,
    status: response.status,
    payload,
    data: unwrapData(payload),
  };
}

function assertEnvelope(result) {
  if (!result.payload || typeof result.payload !== "object" || result.payload.code !== 0) {
    throw new Error(`${result.label} did not return the standard success envelope`);
  }
}

function assertShape(result) {
  assertEnvelope(result);
  const data = result.data;
  if (result.shape === "items") {
    if (!data || typeof data !== "object" || !Array.isArray(data.items)) {
      throw new Error(`${result.label} did not return an items array`);
    }
    return;
  }
  if (result.shape === "reviewQueue") {
    if (!data || typeof data !== "object" || !Array.isArray(data.items) || typeof data.stats !== "object") {
      throw new Error(`${result.label} did not return review queue items and stats`);
    }
    return;
  }
  if (result.shape === "exposureRadar") {
    if (!data || typeof data !== "object" || !Array.isArray(data.items) || !data.diagnostics) {
      throw new Error(`${result.label} did not return items and diagnostics`);
    }
    const diagnostics = data.diagnostics;
    for (const field of ["status", "source_status", "max_impression_count", "real_view_coverage", "sampling_coverage"]) {
      if (!Object.prototype.hasOwnProperty.call(diagnostics, field)) {
        throw new Error(`${result.label} diagnostics missing ${field}`);
      }
    }
    return;
  }
  if (!data || typeof data !== "object") {
    throw new Error(`${result.label} did not return an object`);
  }
}

function countItems(data) {
  if (!data || typeof data !== "object") return 0;
  if (Array.isArray(data.items)) return data.items.length;
  return 0;
}

function hasMeaningfulValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return Boolean(value);
}

function summarizeActivation(results) {
  const byKey = new Map(results.map((result) => [result.key, result.data]));
  const accounts = byKey.get("accounts");
  const bots = byKey.get("oafBots");
  const contentMemory = byKey.get("contentMemory");
  const contentDrafts = byKey.get("contentDrafts");
  const handlingList = byKey.get("handlingList");
  const strategy = byKey.get("growthStrategy");
  const manualRecords = byKey.get("manualRecords");
  const radarEn = byKey.get("radarEn");
  const radarZh = byKey.get("radarZh");

  const radarItems = countItems(radarEn) + countItems(radarZh);
  const radarDiagnosticsReady = Boolean(radarEn?.diagnostics?.status || radarZh?.diagnostics?.status);
  const strategyFields = [
    strategy?.target_audience,
    strategy?.core_topics,
    strategy?.avoid_topics,
    strategy?.reply_style,
    strategy?.operator_notes,
  ];

  const readiness = [
    { key: "account_connected", label: "X account connected", ready: countItems(accounts) > 0 },
    { key: "oaf_bot_ready", label: "OAF Bot created", ready: countItems(bots) > 0 },
    { key: "strategy_available", label: "Growth Strategy readable", ready: strategyFields.some(hasMeaningfulValue) },
    { key: "radar_explainable", label: "Exposure Radar diagnostics readable", ready: radarDiagnosticsReady },
    { key: "opportunity_pool_visible", label: "Opportunity pool has visible items", ready: radarItems > 0 },
    { key: "content_memory_seeded", label: "Content Memory seeded", ready: countItems(contentMemory) > 0 },
    { key: "content_draft_queue_ready", label: "Content Drafts reachable", ready: countItems(contentDrafts) > 0 },
    { key: "handling_list_ready", label: "Handling List reachable", ready: countItems(handlingList) > 0 || handlingList?.total > 0 },
    { key: "manual_result_loop", label: "Manual handling/result records exist", ready: countItems(manualRecords) > 0 },
  ];

  const readyCount = readiness.filter((item) => item.ready).length;
  console.log(`[smoke-api] activation readiness: ${readyCount}/${readiness.length}`);
  for (const item of readiness) {
    console.log(`[smoke-api] ${item.ready ? "ready" : "todo"} ${item.key}: ${item.label}`);
  }

  if (requireActivated) {
    const missing = readiness.filter((item) => !item.ready).map((item) => item.key);
    if (missing.length) {
      throw new Error(`activation readiness required but missing: ${missing.join(", ")}`);
    }
  }
}

async function checkHealth() {
  if (skipHealth) {
    console.log("[smoke-api] skipped health check");
    return;
  }
  let response;
  try {
    response = await fetchWithTimeout(healthURL, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch (error) {
    if (requireHealth) throw error;
    console.warn(`[smoke-api] warning health check unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (response.status !== 200) {
    const message = `health check returned HTTP ${response.status}`;
    if (requireHealth) throw new Error(message);
    console.warn(`[smoke-api] warning ${message}; continuing with API route checks`);
    return;
  }
  console.log(`[smoke-api] ok health: ${healthURL} -> ${response.status}`);
}

async function checkAuthBoundary() {
  for (const check of authBoundaryChecks) {
    const result = await requestJSON(check, [401, 403], false);
    console.log(`[smoke-api] ok protected ${check.label}: HTTP ${result.status}`);
  }
}

async function checkAuthenticatedWorkflow() {
  const results = [];
  for (const check of authenticatedChecks) {
    const result = await requestJSON(check, [200], true);
    assertShape(result);
    results.push(result);
    console.log(`[smoke-api] ok ${check.label}: HTTP ${result.status}`);
  }
  summarizeActivation(results);
}

async function main() {
  console.log(`[smoke-api] api base: ${apiBase}`);
  await checkHealth();
  if (!token) {
    if (requireAuth) {
      throw new Error("SMOKE_STRICT_AUTH=1 requires SMOKE_JWT or OCTO_SMOKE_JWT");
    }
    await checkAuthBoundary();
    console.log("[smoke-api] authenticated workflow skipped: set SMOKE_JWT to validate data shapes and activation readiness");
    return;
  }
  await checkAuthenticatedWorkflow();
  console.log("[smoke-api] core API workflow checks passed");
}

main().catch((error) => {
  console.error(`[smoke-api] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
