import type { I18nDict, Language } from "../types";

import { dict as en } from "./en";
import { dict as zhCN } from "./zh-CN";
import { dict as zhTW } from "./zh-TW";
import { dict as ja } from "./ja";
import { dict as ko } from "./ko";
import { dict as ru } from "./ru";

function withEnglishFallback(dict: I18nDict): I18nDict {
  return { ...en, ...dict };
}

export const dictionaries: Record<Language, I18nDict> = {
  en,
  "zh-CN": zhCN,
  "zh-TW": withEnglishFallback(zhTW),
  ja: withEnglishFallback(ja),
  ko: withEnglishFallback(ko),
  ru: withEnglishFallback(ru),
};
