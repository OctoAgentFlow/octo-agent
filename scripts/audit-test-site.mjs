#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { get as httpGet, request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const defaultRoutes = [
  ["/dashboard", "Dashboard"],
  ["/exposure-radar", "Exposure Radar"],
  ["/execution-queue", "Execution Queue"],
  ["/execution-queue?publish_outcome=dry_run", "Execution Queue Dry Run"],
  ["/oaf-bots", "OAF Bots"],
  ["/auto-post", "Auto Post"],
  ["/activity", "Activity"],
  ["/accounts", "Accounts"],
  ["/automations", "Automations"],
  ["/billing", "Billing"],
  ["/settings", "Settings"],
  ["/posts", "Posts"],
  ["/points", "Points"],
  ["/analytics", "Analytics"],
  ["/agents", "Agents"],
  ["/admin", "Admin"],
];

const expectedControlsByPath = {
  "/dashboard": ["Refresh", "Log out"],
  "/exposure-radar": ["Refresh"],
  "/execution-queue": ["Select eligible visible items", "Approve", "Retry", "Reject"],
  "/oaf-bots": ["New OAF Bot"],
  "/auto-post": ["Generate"],
  "/activity": ["Refresh"],
  "/accounts": ["Connect"],
  "/automations": ["View Logs"],
  "/billing": ["Upgrade", "Current"],
  "/settings": ["Save", "Update"],
  "/posts": ["Create"],
  "/points": ["Redeem", "Copy"],
  "/analytics": ["Overview"],
  "/agents": ["View Logs"],
  "/admin": ["Admin"],
};

class CDPSession {
  constructor(url) {
    this.url = url;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    this.ws = new WebSocket(url);
    this.ready = new Promise((resolvePromise, rejectPromise) => {
      this.ws.addEventListener("open", resolvePromise, { once: true });
      this.ws.addEventListener("error", rejectPromise, { once: true });
    });
    this.ws.addEventListener("message", (message) => this.handleMessage(message));
  }

  async send(method, params = {}) {
    await this.ready;
    const id = ++this.id;
    const payload = JSON.stringify({ id, method, params });
    const result = new Promise((resolvePromise, rejectPromise) => {
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise, method });
    });
    this.ws.send(payload);
    return result;
  }

  on(method, callback) {
    const handlers = this.handlers.get(method) || new Set();
    handlers.add(callback);
    this.handlers.set(method, handlers);
    return () => handlers.delete(callback);
  }

  handleMessage(message) {
    const raw = typeof message.data === "string" ? message.data : Buffer.from(message.data).toString("utf8");
    const data = JSON.parse(raw);
    if (data.id) {
      const pending = this.pending.get(data.id);
      if (!pending) return;
      this.pending.delete(data.id);
      if (data.error) pending.reject(new Error(`${pending.method}: ${data.error.message}`));
      else pending.resolve(data.result || {});
      return;
    }
    const handlers = this.handlers.get(data.method);
    if (handlers) {
      for (const handler of handlers) handler(data.params || {});
    }
  }

  close() {
    this.ws.close();
  }
}

const args = parseArgs(process.argv.slice(2));
const baseURL = trimRight(args.base || process.env.OAF_AUDIT_BASE_URL || "https://octo-agent.com", "/");
const timeoutMs = Number(args.timeout || process.env.OAF_AUDIT_TIMEOUT_MS || 9000);
const outputDir = resolve(args.output || process.env.OAF_AUDIT_OUTPUT_DIR || "logs/audit");
const headed = Boolean(args.headed || process.env.OAF_AUDIT_HEADED === "1");
const keepProfile = Boolean(args.keepProfile || process.env.OAF_AUDIT_KEEP_PROFILE === "1");
const chromePath = args.chrome || process.env.OAF_AUDIT_CHROME || defaultChromePath();
const profileDir = args.profileDir ? resolve(args.profileDir) : mkdtempSync(join(tmpdir(), "octo-audit-chrome-"));
const routes = args.routes ? args.routes.split(",").map((path) => [path.trim(), path.trim()]).filter(([path]) => path) : defaultRoutes;
const checkControls = args.checkControls !== false && process.env.OAF_AUDIT_CHECK_CONTROLS !== "0";

mkdirSync(outputDir, { recursive: true });

const chrome = launchChrome(chromePath, profileDir, headed);
let port = null;
let browserWS = null;
let page = null;
let failures = 0;

try {
  ({ port, browserWS } = await readDevtoolsEndpoint(profileDir, 10000));
  page = await createPage(port, browserWS);
  await page.send("Runtime.enable");
  await page.send("Page.enable");
  await page.send("Log.enable");
  await page.send("Network.enable");

  const consoleEntries = [];
  const networkFailures = [];
  const failedResponses = [];
  page.on("Runtime.exceptionThrown", (event) => {
    consoleEntries.push({ level: "error", message: event.exceptionDetails?.text || event.exceptionDetails?.exception?.description || "Runtime exception" });
  });
  page.on("Log.entryAdded", (event) => {
    if (event.entry?.level === "error" || event.entry?.level === "warning") {
      consoleEntries.push({ level: event.entry.level, message: event.entry.text || "" });
    }
  });
  page.on("Network.loadingFailed", (event) => {
    if (!event.canceled) networkFailures.push({ url: event.requestId, errorText: event.errorText, type: event.type });
  });
  page.on("Network.responseReceived", (event) => {
    const status = event.response?.status || 0;
    if (status >= 400) failedResponses.push({ status, url: event.response.url });
  });

  await injectAuthIfConfigured(page, baseURL);

  const results = [];
  for (const [path, name] of routes) {
    consoleEntries.length = 0;
    networkFailures.length = 0;
    failedResponses.length = 0;
    results.push(await auditRoute(page, baseURL, path, name, timeoutMs, consoleEntries, networkFailures, failedResponses));
  }

  const summary = {
    baseURL,
    generatedAt: new Date().toISOString(),
    chromePath,
    profileDir,
      keepProfile,
      timeoutMs,
      checkControls,
      counts: {
        routes: results.length,
        ok: results.filter((item) => item.ok).length,
        failed: results.filter((item) => !item.ok).length,
        warnings: results.reduce((sum, item) => sum + item.warnings.length, 0),
        controls: results.reduce((sum, item) => sum + (item.controlAudit?.total || 0), 0),
      },
    results,
  };
  failures = summary.counts.failed;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const jsonPath = join(outputDir, `test-site-audit-${stamp}.json`);
  const mdPath = join(outputDir, `test-site-audit-${stamp}.md`);
  const latestJsonPath = join(outputDir, "test-site-audit-latest.json");
  const latestMdPath = join(outputDir, "test-site-audit-latest.md");
  writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
  writeFileSync(latestJsonPath, JSON.stringify(summary, null, 2));
  const markdown = renderMarkdown(summary);
  writeFileSync(mdPath, markdown);
  writeFileSync(latestMdPath, markdown);
  console.log(markdown);
  console.log(`\nJSON: ${jsonPath}`);
  console.log(`Markdown: ${mdPath}`);
} finally {
  if (page) page.close();
  chrome.kill("SIGTERM");
  await waitForProcessExit(chrome, 3000);
  if (!keepProfile) removeProfile(profileDir);
}

process.exitCode = failures > 0 ? 1 : 0;

function parseArgs(raw) {
  const out = {};
  for (const arg of raw) {
    if (arg === "--headed") out.headed = true;
    else if (arg === "--keep-profile") out.keepProfile = true;
    else if (arg.startsWith("--base=")) out.base = arg.slice("--base=".length);
    else if (arg.startsWith("--timeout=")) out.timeout = arg.slice("--timeout=".length);
    else if (arg.startsWith("--output=")) out.output = arg.slice("--output=".length);
    else if (arg.startsWith("--chrome=")) out.chrome = arg.slice("--chrome=".length);
    else if (arg.startsWith("--profile-dir=")) out.profileDir = arg.slice("--profile-dir=".length);
    else if (arg.startsWith("--routes=")) out.routes = arg.slice("--routes=".length);
    else if (arg === "--no-control-check") out.checkControls = false;
  }
  return out;
}

function defaultChromePath() {
  if (process.platform === "darwin") return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (process.platform === "win32") return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  return "google-chrome";
}

function launchChrome(path, userDataDir, showWindow) {
  const args = [
    `--user-data-dir=${userDataDir}`,
    "--remote-debugging-port=0",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-sync",
    "--disable-translate",
    "--metrics-recording-only",
    "--mute-audio",
    "about:blank",
  ];
  if (!showWindow) args.unshift("--headless=new");
  return spawn(path, args, { stdio: ["ignore", "pipe", "pipe"] });
}

async function readDevtoolsEndpoint(userDataDir, waitMs) {
  const activePortPath = join(userDataDir, "DevToolsActivePort");
  const started = Date.now();
  while (Date.now() - started < waitMs) {
    try {
      const [portLine, wsPath] = readFileSync(activePortPath, "utf8").trim().split("\n");
      return { port: Number(portLine), browserWS: `ws://127.0.0.1:${portLine}${wsPath}` };
    } catch {
      await sleep(100);
    }
  }
  throw new Error(`Chrome did not expose DevToolsActivePort within ${waitMs}ms`);
}

async function createPage(port, browserWS) {
  const target = await httpJson({ method: "PUT", url: `http://127.0.0.1:${port}/json/new?about:blank` });
  return new CDPSession(target.webSocketDebuggerUrl || browserWS);
}

function httpJson({ method = "GET", url }) {
  return new Promise((resolvePromise, rejectPromise) => {
    const runner = url.startsWith("https:") ? null : method === "GET" ? httpGet : httpRequest;
    if (!runner) rejectPromise(new Error(`Unsupported URL: ${url}`));
    const req = runner(url, { method }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolvePromise(JSON.parse(data));
        } catch (error) {
          rejectPromise(error);
        }
      });
    });
    req.on("error", rejectPromise);
    req.end?.();
  });
}

async function injectAuthIfConfigured(session, origin) {
  const raw = await readAuthSession(origin);
  if (!raw) return;
  await navigate(session, `${origin}/login`, 3000);
  await session.send("Runtime.evaluate", {
    expression: `localStorage.setItem("octo_auth_session", ${JSON.stringify(JSON.stringify(raw))}); true;`,
    awaitPromise: false,
  });
}

async function readAuthSession(origin) {
  if (process.env.OAF_AUDIT_AUTH_SESSION) {
    try {
      return JSON.parse(process.env.OAF_AUDIT_AUTH_SESSION);
    } catch {
      throw new Error("OAF_AUDIT_AUTH_SESSION must be valid JSON");
    }
  }
  if (process.env.OAF_AUDIT_AUTH_SESSION_FILE) {
    return JSON.parse(readFileSync(process.env.OAF_AUDIT_AUTH_SESSION_FILE, "utf8"));
  }
  if (process.env.OAF_AUDIT_ACCESS_TOKEN) {
    return {
      loggedIn: true,
      loginAt: Date.now(),
      accessToken: normalizeBearer(process.env.OAF_AUDIT_ACCESS_TOKEN),
      refreshToken: normalizeBearer(process.env.OAF_AUDIT_REFRESH_TOKEN || ""),
    };
  }
  if (process.env.OAF_AUDIT_EMAIL && process.env.OAF_AUDIT_PASSWORD) {
    return loginForAuthSession(origin, process.env.OAF_AUDIT_EMAIL, process.env.OAF_AUDIT_PASSWORD);
  }
  return null;
}

async function loginForAuthSession(origin, email, password) {
  const response = await fetch(`${origin}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Login failed for audit account: HTTP ${response.status} ${body.message || ""}`.trim());
  }
  const tokens = body.data?.tokens || {};
  if (!tokens.access_token) throw new Error("Login response did not include access_token");
  return {
    loggedIn: true,
    loginAt: Date.now(),
    accessToken: normalizeBearer(tokens.access_token),
    refreshToken: normalizeBearer(tokens.refresh_token || ""),
  };
}

function normalizeBearer(value) {
  return String(value || "").replace(/^Bearer\s+/i, "").trim();
}

async function auditRoute(session, origin, path, name, waitMs, consoleEntries, networkFailures, failedResponses) {
  const url = `${origin}${path}`;
  const started = Date.now();
  const route = { name, path, url, ok: false, durationMs: 0, warnings: [], errors: [] };
  try {
    await navigate(session, url, waitMs);
    let snapshot = await readPageSnapshot(session);
    const retryUntil = Date.now() + Math.min(waitMs, 5000);
    while (snapshot.bodyEmpty && !snapshot.loginLike && !snapshot.href.includes("/login") && Date.now() < retryUntil) {
      await sleep(500);
      snapshot = await readPageSnapshot(session);
    }
    Object.assign(route, snapshot);
    if (route.bodyEmpty) route.warnings.push("Body text is nearly empty after navigation.");
    if (route.loginLike || route.href?.includes("/login")) route.warnings.push("Page is login-gated in the isolated profile. Provide OAF_AUDIT_AUTH_SESSION or OAF_AUDIT_ACCESS_TOKEN for authenticated QA.");
    if (route.missing?.length) route.errors.push(`Visible untranslated keys: ${route.missing.join(", ")}`);
    if (route.visibleErrors?.length) route.warnings.push(`Visible error text: ${route.visibleErrors.join(" | ")}`);
    if (checkControls && !route.loginLike) {
      const controlAudit = auditControls(route);
      route.controlAudit = controlAudit;
      if (controlAudit.expectedMissing.length) route.warnings.push(`Missing expected controls: ${controlAudit.expectedMissing.join(", ")}`);
      if (controlAudit.unlabeled.length) route.warnings.push(`Unlabeled controls: ${controlAudit.unlabeled.map((item) => item.tag).join(", ")}`);
      if (controlAudit.clickIssues.length) route.warnings.push(`Controls with blocked click targets: ${controlAudit.clickIssues.map((item) => item.text || item.href || item.tag).join(", ")}`);
      if (controlAudit.badLinks.length) route.errors.push(`Invalid links: ${controlAudit.badLinks.map((item) => `${item.text || item.href || item.tag}`).join(", ")}`);
      if (controlAudit.emptyInteractivePage) route.warnings.push("No visible interactive controls were detected.");
    }
    const badConsole = consoleEntries.filter((item) => /error|exception/i.test(item.level) || /failed|error|exception/i.test(item.message)).slice(0, 8);
    if (badConsole.length) route.warnings.push(`Console errors/warnings: ${badConsole.map((item) => item.message).join(" | ")}`);
    const badResponses = failedResponses.filter((item) => !/favicon|sourcemap/.test(item.url)).slice(0, 8);
    if (badResponses.length) route.warnings.push(`HTTP error responses: ${badResponses.map((item) => `${item.status} ${item.url}`).join(" | ")}`);
    if (networkFailures.length) route.warnings.push(`Network failures: ${networkFailures.map((item) => item.errorText).join(", ")}`);
    route.ok = !route.errors.length;
  } catch (error) {
    route.errors.push(error.message || String(error));
  } finally {
    route.durationMs = Date.now() - started;
  }
  return route;
}

function auditControls(route) {
  const controls = route.buttons || [];
  const visibleControls = controls.filter((item) => item.visible !== false);
  const enabledControls = visibleControls.filter((item) => !item.disabled);
  const path = new URL(route.href || route.url).pathname;
  const expected = expectedControlsByPath[path] || [];
  const labels = visibleControls.map((item) => `${item.text || ""} ${item.href || ""}`.toLowerCase());
  const expectedMissing = expected.filter((label) => !labels.some((text) => text.includes(label.toLowerCase())));
  const unlabeled = visibleControls
    .filter((item) => !item.text && item.tag !== "input" && item.tag !== "select")
    .slice(0, 12);
  const clickIssues = enabledControls
    .filter((item) => item.clickIssue)
    .slice(0, 12);
  const badLinks = visibleControls
    .filter((item) => item.tag === "a" && item.href && !isValidLink(item.href))
    .slice(0, 12);
  return {
    total: visibleControls.length,
    enabled: enabledControls.length,
    disabled: visibleControls.length - enabledControls.length,
    expected,
    expectedMissing,
    unlabeled,
    clickIssues,
    badLinks,
    emptyInteractivePage: visibleControls.length === 0,
    sample: visibleControls.slice(0, 20),
  };
}

function isValidLink(href) {
  if (!href || href === "#") return false;
  if (href.startsWith("/") || href.startsWith("http://") || href.startsWith("https://") || href.startsWith("mailto:")) return true;
  return false;
}

async function readPageSnapshot(session) {
  const snapshot = await session.send("Runtime.evaluate", {
    returnByValue: true,
    awaitPromise: true,
    expression: `(() => {
      const text = document.body?.innerText || "";
      const missing = Array.from(new Set((text.match(/[a-zA-Z0-9_.-]+\\.[a-zA-Z0-9_.-]+\\.[a-zA-Z0-9_.-]+/g) || [])
        .filter((key) => /^(dashboard|exposureRadar|executionQueue|oafBots|autoPost|accounts|automation|billing|settings|posts|points|analytics|agents|admin)\\./.test(key)))).slice(0, 30);
      const visibleErrors = text.split("\\n").filter((line) => /failed|error|失败|錯誤|报错|Cannot|undefined/i.test(line)).slice(0, 20);
      const buttons = Array.from(document.querySelectorAll("button,a,[role=button],select,input,textarea")).map((el) => {
        el.scrollIntoView({ block: "center", inline: "center" });
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        const visible = style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
        const centerX = Math.max(0, Math.min(window.innerWidth - 1, rect.left + rect.width / 2));
        const centerY = Math.max(0, Math.min(window.innerHeight - 1, rect.top + rect.height / 2));
        const hit = visible ? document.elementFromPoint(centerX, centerY) : null;
        const hitTarget = !!hit && (hit === el || el.contains(hit) || hit.contains(el));
        const disabled = !!el.disabled || el.getAttribute("aria-disabled") === "true";
        return {
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute("role") || "",
          text: (el.innerText || el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("placeholder") || el.value || "").trim().replace(/\\s+/g, " ").slice(0, 100),
          disabled,
          href: el.getAttribute("href") || "",
          visible,
          clickIssue: visible && !disabled && !hitTarget ? "center-obscured" : "",
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        };
      }).slice(0, 160);
      return {
        href: location.href,
        title: document.title,
        h1: document.querySelector("h1")?.innerText || "",
        textLength: text.length,
        nodeCount: document.querySelectorAll("*").length,
        bodyEmpty: text.trim().length < 80,
        loginLike: location.pathname.startsWith("/login") || /继续进入 Octo-Agent|Octo-Agent continued|Run social growth with an AI operations copilot/i.test(text),
        missing,
        visibleErrors,
        buttons,
        sample: text.slice(0, 500)
      };
    })()`,
  });
  return snapshot.result.value;
}

async function navigate(session, url, waitMs) {
  let domReady = false;
  const done = new Promise((resolvePromise) => {
    const off = session.on("Page.domContentEventFired", () => {
      domReady = true;
      off();
      resolvePromise();
    });
  });
  await session.send("Page.navigate", { url });
  await Promise.race([done, sleep(waitMs)]);
  await sleep(domReady ? 800 : 1200);
}

function renderMarkdown(summary) {
  const lines = [
    `# Test Site Audit`,
    ``,
    `- Base URL: ${summary.baseURL}`,
    `- Generated at: ${summary.generatedAt}`,
    `- Routes: ${summary.counts.routes}`,
    `- Failed routes: ${summary.counts.failed}`,
    `- Warnings: ${summary.counts.warnings}`,
    `- Controls checked: ${summary.counts.controls}`,
    ``,
    `| Page | Status | Time | Nodes | Text | Controls | Notes |`,
    `| --- | --- | ---: | ---: | ---: | ---: | --- |`,
  ];
  for (const item of summary.results) {
    const status = item.ok ? "OK" : "FAIL";
    const notes = [...item.errors, ...item.warnings].join("<br>").replace(/\|/g, "\\|") || "-";
    lines.push(`| ${item.name} | ${status} | ${item.durationMs}ms | ${item.nodeCount ?? "-"} | ${item.textLength ?? "-"} | ${item.controlAudit?.total ?? "-"} | ${notes} |`);
  }
  const failed = summary.results.filter((item) => item.errors.length || item.warnings.length);
  if (failed.length) {
    lines.push(``, `## Findings`);
    for (const item of failed) {
      lines.push(``, `### ${item.name}`, `- URL: ${item.url}`);
      for (const error of item.errors) lines.push(`- Error: ${error}`);
      for (const warning of item.warnings) lines.push(`- Warning: ${warning}`);
      if (item.sample) lines.push(`- Sample: ${item.sample.replace(/\s+/g, " ").slice(0, 240)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function waitForProcessExit(child, waitMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return Promise.race([
    new Promise((resolvePromise) => child.once("exit", resolvePromise)),
    sleep(waitMs),
  ]);
}

function removeProfile(path) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      rmSync(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 120 });
      return;
    } catch {
      // Chrome may still be releasing profile files. Retry briefly before giving up.
    }
  }
  console.warn(`Warning: failed to remove temporary Chrome profile: ${path}`);
}

function trimRight(value, char) {
  let next = value;
  while (next.endsWith(char)) next = next.slice(0, -1);
  return next;
}
