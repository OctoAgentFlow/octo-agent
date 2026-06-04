export type Language = "en" | "zh-CN";

export const languages: Array<{ code: Language; label: string }> = [
  { code: "en", label: "English" },
  { code: "zh-CN", label: "简体中文" },
];

export type I18nDict = Record<string, string>;

export type TranslateParams = Record<string, string | number>;
