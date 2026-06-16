import type { ExposureRadarRegion } from "@/services/exposure-radar.service";
import { exposureRadarWorkspaceTabs } from "@/components/exposure-radar/constants";
import type { ExposureRadarWorkspaceTab, ManualActionState, OperatorSessionNote, PublishGateState, SessionFocusKey } from "@/components/exposure-radar/types";

const radarRankStorageKeyPrefix = "oaf:exposure-radar:ranks";
const radarManualActionStorageKey = "oaf:exposure-radar:manual-actions:v1";
const radarOperatorNotesStorageKey = "oaf:exposure-radar:operator-notes:v1";
const radarSessionFocusStorageKey = "oaf:exposure-radar:session-focus:v1";
const radarPublishGateStorageKey = "oaf:exposure-radar:publish-gates:v1";

export function radarRankStorageKey(region: ExposureRadarRegion, hours: number, maxFans: number, minHotCount: number) {
  return `${radarRankStorageKeyPrefix}:${region}:${hours}:${maxFans}:${minHotCount}`;
}

export function readStoredRadarRanks(key: string) {
  const out = new Map<string, number>();
  if (typeof window === "undefined") return out;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return out;
    const parsed = JSON.parse(raw) as Array<[string, number]>;
    parsed.forEach(([id, rank]) => {
      if (typeof id === "string" && Number.isFinite(rank) && rank > 0) out.set(id, rank);
    });
  } catch {
    return new Map<string, number>();
  }
  return out;
}

export function writeStoredRadarRanks(key: string, ranks: Map<string, number>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(ranks.entries()).slice(0, 100)));
  } catch {
    // Local ranking memory is a UI hint only; ignore storage failures.
  }
}

export function readManualActionStates(): Record<string, ManualActionState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(radarManualActionStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ManualActionState>;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed).filter(([id, state]) => typeof id === "string" && state && typeof state === "object"));
  } catch {
    return {};
  }
}

export function writeManualActionStates(states: Record<string, ManualActionState>) {
  if (typeof window === "undefined") return;
  try {
    const entries = Object.entries(states)
      .sort(([, a], [, b]) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
      .slice(0, 200);
    window.localStorage.setItem(radarManualActionStorageKey, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Local cache keeps the UI responsive while backend records hydrate.
  }
}

export function radarOperatorNoteKey(region: ExposureRadarRegion, accountID: number, botID: number) {
  return `${region}:${accountID || "account"}:${botID || "bot"}`;
}

export function readOperatorNotes(): Record<string, OperatorSessionNote> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(radarOperatorNotesStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, OperatorSessionNote>;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed).filter(([key, note]) => (
      typeof key === "string" &&
      note &&
      typeof note === "object" &&
      typeof note.text === "string" &&
      typeof note.updatedAt === "string"
    )));
  } catch {
    return {};
  }
}

export function writeOperatorNotes(notes: Record<string, OperatorSessionNote>) {
  if (typeof window === "undefined") return;
  try {
    const entries = Object.entries(notes)
      .filter(([, note]) => note.text.trim())
      .sort(([, a], [, b]) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 50);
    window.localStorage.setItem(radarOperatorNotesStorageKey, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Scratchpad notes are local convenience only.
  }
}

export function readSessionFocuses(): Record<string, SessionFocusKey> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(radarSessionFocusStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SessionFocusKey>;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed).filter(([key, value]) => (
      typeof key === "string" && isSessionFocusKey(value)
    )));
  } catch {
    return {};
  }
}

export function writeSessionFocuses(focuses: Record<string, SessionFocusKey>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(radarSessionFocusStorageKey, JSON.stringify(focuses));
  } catch {
    // Session focus is a local UI preference only.
  }
}

export function isSessionFocusKey(value: string): value is SessionFocusKey {
  return value === "relationships" || value === "research" || value === "traffic" || value === "memory";
}

export function readPublishGateStates(): Record<string, PublishGateState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(radarPublishGateStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, PublishGateState>;
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed).filter(([key, state]) => (
      typeof key === "string" && state && typeof state === "object"
    )));
  } catch {
    return {};
  }
}

export function writePublishGateStates(states: Record<string, PublishGateState>) {
  if (typeof window === "undefined") return;
  try {
    const entries = Object.entries(states)
      .sort(([, a], [, b]) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
      .slice(0, 200);
    window.localStorage.setItem(radarPublishGateStorageKey, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Publish gates are local operator reminders only.
  }
}

export function isExposureRadarWorkspaceTab(value: string | null): value is ExposureRadarWorkspaceTab {
  return Boolean(value && exposureRadarWorkspaceTabs.includes(value as ExposureRadarWorkspaceTab));
}
