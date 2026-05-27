"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "octo-agent:preferred-time-zone";

export const supportedTimeZones = [
  "UTC",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Asia/Singapore",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Australia/Sydney",
] as const;

export type SupportedTimeZone = typeof supportedTimeZones[number];

function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function normalizeTimeZone(value?: string | null) {
  const zone = (value || "").trim();
  if (!zone) return browserTimeZone();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date());
    return zone;
  } catch {
    return browserTimeZone();
  }
}

export function getPreferredTimeZone() {
  if (typeof window === "undefined") return "UTC";
  return normalizeTimeZone(window.localStorage.getItem(STORAGE_KEY) || browserTimeZone());
}

export function setPreferredTimeZone(timeZone: string) {
  if (typeof window === "undefined") return;
  const normalized = normalizeTimeZone(timeZone);
  window.localStorage.setItem(STORAGE_KEY, normalized);
  window.dispatchEvent(new CustomEvent("octo-agent:time-zone-change", { detail: normalized }));
}

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback();
  window.addEventListener("octo-agent:time-zone-change", handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener("octo-agent:time-zone-change", handler);
    window.removeEventListener("storage", handler);
  };
}

export function usePreferredTimeZone() {
  return useSyncExternalStore(subscribe, getPreferredTimeZone, () => "UTC");
}

export function timeZoneLabel(timeZone: string) {
  const normalized = normalizeTimeZone(timeZone);
  return normalized.replaceAll("_", " ");
}

export function formatDateTime(value?: string | number | Date | null, timeZone = getPreferredTimeZone(), options?: Intl.DateTimeFormatOptions) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: normalizeTimeZone(timeZone),
    ...options,
  }).format(date);
}

export function formatDateOnly(value?: string | number | Date | null, timeZone = getPreferredTimeZone(), options?: Intl.DateTimeFormatOptions) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: normalizeTimeZone(timeZone),
    ...options,
  }).format(date);
}

export function formatTimeOnly(value?: string | number | Date | null, timeZone = getPreferredTimeZone(), options?: Intl.DateTimeFormatOptions) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: normalizeTimeZone(timeZone),
    ...options,
  }).format(date);
}
