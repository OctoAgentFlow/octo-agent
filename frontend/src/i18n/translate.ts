import type { I18nDict, TranslateParams } from "./types";

export function translate(dict: I18nDict, key: string, params?: TranslateParams) {
  const template = dict[key];
  if (!template) return key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = params[name];
    return v === undefined || v === null ? `{${name}}` : String(v);
  });
}

