import type { I18nDict, Language } from "../types";

import { dict as en } from "./en";
import { dict as zhCN } from "./zh-CN";

export const dictionaries: Record<Language, I18nDict> = {
  en,
  "zh-CN": zhCN,
};
