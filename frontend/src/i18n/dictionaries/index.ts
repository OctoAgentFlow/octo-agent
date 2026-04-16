import type { I18nDict, Language } from "../types";

import { dict as en } from "./en";
import { dict as zhCN } from "./zh-CN";
import { dict as zhTW } from "./zh-TW";
import { dict as ja } from "./ja";
import { dict as ko } from "./ko";
import { dict as ru } from "./ru";

export const dictionaries: Record<Language, I18nDict> = {
  en,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  ja,
  ko,
  ru,
};

