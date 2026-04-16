"use client";

import { createContext, useCallback, useEffect, useMemo, useState } from "react";

import { dictionaries } from "./dictionaries";
import { readStoredLanguage, storeLanguage } from "./storage";
import { translate } from "./translate";
import type { I18nDict, Language, TranslateParams } from "./types";

type I18nContextValue = {
  lang: Language;
  dict: I18nDict;
  setLang: (lang: Language) => void;
  t: (key: string, params?: TranslateParams) => string;
};

export const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>("en");

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    storeLanguage(next);
  }, []);

  useEffect(() => {
    const stored = readStoredLanguage();
    if (!stored || stored === "en") return;
    // Defer restore to avoid SSR/CSR hydration text mismatches.
    const id = window.setTimeout(() => setLangState(stored), 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = lang;
  }, [lang]);

  const dict = dictionaries[lang] ?? dictionaries.en;

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      dict,
      setLang,
      t: (key, params) => translate(dict, key, params),
    }),
    [dict, lang, setLang]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

