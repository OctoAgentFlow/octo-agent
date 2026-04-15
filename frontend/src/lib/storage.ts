export const storage = {
  get: (key: string) => (typeof window === "undefined" ? null : localStorage.getItem(key)),
  set: (key: string, value: string) => localStorage.setItem(key, value),
  remove: (key: string) => localStorage.removeItem(key),
};
