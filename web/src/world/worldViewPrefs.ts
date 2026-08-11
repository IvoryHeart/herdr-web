import type { ConversationGeometry } from "./conversationGeometry";

export const WORLD_VIEW_PREFS_STORAGE_KEY = "herdrWeb.worldView.v1";
export const MAX_SAVED_WORLD_WINDOWS = 5;
const MAX_SAVED_GEOMETRY = 10_000;

export type WorldViewPrefs = {
  geometry: Record<string, ConversationGeometry>;
  order: string[];
  scrollTop: number;
};

export function emptyWorldViewPrefs(): WorldViewPrefs {
  return { geometry: {}, order: [], scrollTop: 0 };
}

export function readWorldViewPrefs(
  storage: Pick<Storage, "getItem"> | null = browserLocalStorage(),
): WorldViewPrefs {
  if (!storage) {
    return emptyWorldViewPrefs();
  }
  try {
    const raw = storage.getItem(WORLD_VIEW_PREFS_STORAGE_KEY);
    return raw ? parseWorldViewPrefs(JSON.parse(raw)) : emptyWorldViewPrefs();
  } catch {
    return emptyWorldViewPrefs();
  }
}

export function writeWorldViewPrefs(
  prefs: WorldViewPrefs,
  storage: Pick<Storage, "setItem"> | null = browserLocalStorage(),
) {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(WORLD_VIEW_PREFS_STORAGE_KEY, JSON.stringify(parseWorldViewPrefs(prefs)));
  } catch {
    // Browser storage is best effort in private or locked-down contexts.
  }
}

function parseWorldViewPrefs(value: unknown): WorldViewPrefs {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptyWorldViewPrefs();
  }
  const record = value as Record<string, unknown>;
  const geometry: Record<string, ConversationGeometry> = {};
  if (record.geometry && typeof record.geometry === "object" && !Array.isArray(record.geometry)) {
    for (const [id, candidate] of Object.entries(record.geometry)) {
      const parsed = parseGeometry(candidate);
      if (parsed) {
        geometry[id.slice(0, 160)] = parsed;
      }
      if (Object.keys(geometry).length >= MAX_SAVED_WORLD_WINDOWS) {
        break;
      }
    }
  }
  const order = Array.isArray(record.order)
    ? uniqueStrings(record.order).slice(0, MAX_SAVED_WORLD_WINDOWS)
    : [];
  const scrollTop = typeof record.scrollTop === "number" && Number.isFinite(record.scrollTop)
    ? Math.max(0, Math.min(MAX_SAVED_GEOMETRY, record.scrollTop))
    : 0;
  return { geometry, order, scrollTop };
}

function parseGeometry(value: unknown): ConversationGeometry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const values = [record.left, record.top, record.width, record.height];
  if (!values.every((candidate) => typeof candidate === "number" && Number.isFinite(candidate))) {
    return null;
  }
  return {
    left: clampNumber(record.left as number),
    top: clampNumber(record.top as number),
    width: clampNumber(record.width as number),
    height: clampNumber(record.height as number),
  };
}

function clampNumber(value: number) {
  return Math.max(0, Math.min(MAX_SAVED_GEOMETRY, value));
}

function uniqueStrings(values: unknown[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string" || !value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value.slice(0, 160));
  }
  return result;
}

function browserLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
