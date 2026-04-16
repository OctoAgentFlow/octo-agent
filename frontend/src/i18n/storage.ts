import type { Language } from "./types";

const STORAGE_KEY = "octo_lang";

export function readStoredLanguage(): Language | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (!v) return null;
  if (v === "en" || v === "zh-CN" || v === "zh-TW" || v === "ja" || v === "ko" || v === "ru") return v;
  return null;
}

export function storeLanguage(lang: Language) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, lang);
}

