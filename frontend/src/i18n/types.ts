export type Language = "en" | "zh-CN" | "zh-TW" | "ja" | "ko" | "ru";

export const languages: Array<{ code: Language; label: string }> = [
  { code: "en", label: "English" },
  { code: "zh-CN", label: "简体中文" },
  { code: "zh-TW", label: "繁體中文" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "ru", label: "Русский" },
];

export type I18nDict = Record<string, string>;

export type TranslateParams = Record<string, string | number>;

