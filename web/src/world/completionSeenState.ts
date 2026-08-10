const COMPLETION_SEEN_STORAGE_KEY = "herdr-world.completion-seen.v1";
const MAX_STORED_COMPLETIONS = 4_096;

type CompletionSeenStorage = Pick<Storage, "getItem" | "setItem">;

export function readWorldCompletionSeenKeys(
  storage: CompletionSeenStorage | null = browserLocalStorage(),
) {
  if (!storage) {
    return new Set<string>();
  }
  try {
    const raw = storage.getItem(COMPLETION_SEEN_STORAGE_KEY);
    if (!raw) {
      return new Set<string>();
    }
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) {
      return new Set<string>();
    }
    return new Set(
      value.filter((key): key is string => typeof key === "string" && key.length > 0),
    );
  } catch {
    return new Set<string>();
  }
}

export function writeWorldCompletionSeenKeys(
  keys: ReadonlySet<string>,
  storage: CompletionSeenStorage | null = browserLocalStorage(),
) {
  if (!storage) {
    return;
  }
  try {
    const values = [...keys].sort().slice(-MAX_STORED_COMPLETIONS);
    storage.setItem(COMPLETION_SEEN_STORAGE_KEY, JSON.stringify(values));
  } catch {
    // Browser storage can be unavailable in private or locked-down contexts.
  }
}

function browserLocalStorage(): CompletionSeenStorage | null {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}
