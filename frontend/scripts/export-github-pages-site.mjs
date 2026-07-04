import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, "..");
const distDir = path.join(frontendRoot, process.env.NEXT_DIST_DIR || ".next-api");
const appDir = path.join(distDir, "server", "app");
const outputDir = path.join(frontendRoot, "out-github-pages");
const indexHtml = path.join(appDir, "index.html");
const staticDir = path.join(distDir, "static");
const publicDir = path.join(frontendRoot, "public");
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");

async function assertExists(targetPath, label) {
  try {
    await stat(targetPath);
  } catch {
    throw new Error(`Missing ${label}: ${targetPath}`);
  }
}

await assertExists(indexHtml, "homepage HTML");
await assertExists(staticDir, "Next.js static assets");

await rm(outputDir, { recursive: true, force: true });
await mkdir(path.join(outputDir, "_next"), { recursive: true });

const html = await readFile(indexHtml, "utf8");
const pagesHtml = basePath
  ? html
      .replaceAll('href="/brand/', `href="${basePath}/brand/`)
      .replaceAll('src="/brand/', `src="${basePath}/brand/`)
  : html;

await writeFile(path.join(outputDir, "index.html"), pagesHtml);
await writeFile(path.join(outputDir, "404.html"), pagesHtml);
await cp(staticDir, path.join(outputDir, "_next", "static"), { recursive: true });
await cp(publicDir, outputDir, { recursive: true });
await writeFile(path.join(outputDir, ".nojekyll"), "");

console.log(`GitHub Pages site exported to ${outputDir}`);
