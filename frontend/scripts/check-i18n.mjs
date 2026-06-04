import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const srcDir = path.join(root, "src");
const dictDir = path.join(srcDir, "i18n", "dictionaries");
const dictionaryFiles = ["en.ts", "zh-CN.ts", "zh-TW.ts", "ja.ts", "ko.ts", "ru.ts"];
const primaryDictionaryFiles = ["en.ts", "zh-CN.ts"];

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function extractDictionaryKeys(filePath) {
  const text = readText(filePath);
  const keys = new Set();
  const pattern = /^\s*"([^"]+)"\s*:/gm;
  let match;
  while ((match = pattern.exec(text))) {
    keys.add(match[1]);
  }
  return keys;
}

function walkCodeFiles(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const filePath = path.join(dir, name);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkCodeFiles(filePath, out);
      continue;
    }
    if (/\.(ts|tsx|js|jsx)$/.test(name)) {
      out.push(filePath);
    }
  }
  return out;
}

function extractStaticUsedKeys() {
  const files = walkCodeFiles(srcDir).filter((filePath) => !filePath.includes(`${path.sep}i18n${path.sep}dictionaries${path.sep}`));
  const keys = new Set();
  const patterns = [
    /\bt\(\s*"([^"]+)"/g,
    /\bt\(\s*'([^']+)'/g,
    /\btranslate\([^,]+,\s*"([^"]+)"/g,
    /\btranslate\([^,]+,\s*'([^']+)'/g,
  ];

  for (const filePath of files) {
    const text = readText(filePath);
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text))) {
        keys.add(match[1]);
      }
    }
  }
  return keys;
}

function difference(left, right) {
  return [...left].filter((key) => !right.has(key)).sort();
}

const dictionaries = Object.fromEntries(
  dictionaryFiles.map((fileName) => [fileName, extractDictionaryKeys(path.join(dictDir, fileName))]),
);
const englishKeys = dictionaries["en.ts"];
const usedKeys = extractStaticUsedKeys();
const failures = [];

for (const fileName of primaryDictionaryFiles) {
  const keys = dictionaries[fileName];
  const missing = difference(englishKeys, keys);
  const extra = difference(keys, englishKeys);
  if (missing.length > 0 || extra.length > 0) {
    failures.push(`${fileName} is not aligned with en.ts: missing=${missing.length}, extra=${extra.length}`);
    if (missing.length > 0) failures.push(`  missing: ${missing.slice(0, 20).join(", ")}`);
    if (extra.length > 0) failures.push(`  extra: ${extra.slice(0, 20).join(", ")}`);
  }
}

for (const fileName of primaryDictionaryFiles) {
  const missingUsed = difference(usedKeys, dictionaries[fileName]);
  if (missingUsed.length > 0) {
    failures.push(`${fileName} is missing statically used keys: ${missingUsed.length}`);
    failures.push(`  ${missingUsed.slice(0, 30).join(", ")}`);
  }
}

for (const fileName of dictionaryFiles.filter((fileName) => !primaryDictionaryFiles.includes(fileName))) {
  const missing = difference(englishKeys, dictionaries[fileName]);
  const extra = difference(dictionaries[fileName], englishKeys);
  console.log(`${fileName}: translated_keys=${dictionaries[fileName].size}, english_fallback_keys=${missing.length}, extra_keys=${extra.length}`);
}

console.log(`en.ts: keys=${englishKeys.size}`);
console.log(`zh-CN.ts: keys=${dictionaries["zh-CN.ts"].size}`);
console.log(`static_used_keys=${usedKeys.size}`);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("i18n check passed");
