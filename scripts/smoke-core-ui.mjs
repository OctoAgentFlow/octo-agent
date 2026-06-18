#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frontendDir = path.join(rootDir, "frontend");
const baseURL = (process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const shouldStartServer = !process.env.SMOKE_BASE_URL;
const routes = [
  { name: "home", path: "/" },
  { name: "login", path: "/login" },
  { name: "dashboard", path: "/dashboard" },
  { name: "start-today", path: "/start-today" },
  { name: "daily-growth-desk", path: "/exposure-radar" },
  { name: "content-memory", path: "/content-library" },
  { name: "content-drafts", path: "/content-drafts" },
  { name: "handling-list", path: "/handling-list" },
  { name: "oaf-bots", path: "/oaf-bots" },
  { name: "billing", path: "/billing" },
  { name: "admin", path: "/admin" },
];

let child = null;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function serverIsReady() {
  try {
    const response = await fetchWithTimeout(`${baseURL}/login`, { redirect: "manual" }, 2500);
    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  }
}

async function waitForServer() {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    if (await serverIsReady()) return;
    await wait(1000);
  }
  throw new Error(`frontend did not become ready at ${baseURL}`);
}

function startServerIfNeeded() {
  if (!shouldStartServer) return;
  const buildIDPath = path.join(frontendDir, ".next-api", "BUILD_ID");
  if (!existsSync(buildIDPath)) {
    throw new Error("missing frontend/.next-api/BUILD_ID; run `npm --prefix frontend run build` before this smoke check");
  }
  child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "start:api-front"], {
    cwd: frontendDir,
    env: { ...process.env, PORT: "3000" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`[next] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[next] ${chunk}`));
}

async function assertRoute(route) {
  const response = await fetchWithTimeout(`${baseURL}${route.path}`, { redirect: "follow" });
  const ok = response.status >= 200 && response.status < 400;
  if (!ok) {
    throw new Error(`${route.name} returned HTTP ${response.status}`);
  }
  const text = await response.text();
  if (!text.includes("<html") && !text.includes("__next")) {
    throw new Error(`${route.name} did not return a Next.js HTML shell`);
  }
  console.log(`[smoke-ui] ok ${route.name}: ${response.url} -> ${response.status}`);
}

async function main() {
  if (!(await serverIsReady())) {
    startServerIfNeeded();
    await waitForServer();
  }
  for (const route of routes) {
    await assertRoute(route);
  }
  console.log("[smoke-ui] core UI routes passed");
}

main()
  .catch((error) => {
    console.error(`[smoke-ui] failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(() => {
    if (child) child.kill("SIGTERM");
  });
