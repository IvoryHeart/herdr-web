export type NavigationSyncMode = "shared" | "independent";

export type ClientNavigationPrefs = {
  mode: NavigationSyncMode;
  selectedBridgeId: string | null;
  selectedPane: {
    bridgeId: string;
    paneId: string;
  } | null;
  activeWorkspace: {
    bridgeId: string;
    workspaceId: string;
  } | null;
  selectedPanesByBridgeId: Record<string, string>;
  activeWorkspacesByBridgeId: Record<string, string>;
};

export const DEFAULT_NAVIGATION_SYNC_MODE: NavigationSyncMode = "shared";
export const CLIENT_NAVIGATION_PREFS_KEY = "herdrWeb.clientNavigation.v1";

const DEFAULT_CLIENT_NAVIGATION_PREFS: ClientNavigationPrefs = {
  mode: DEFAULT_NAVIGATION_SYNC_MODE,
  selectedBridgeId: null,
  selectedPane: null,
  activeWorkspace: null,
  selectedPanesByBridgeId: {},
  activeWorkspacesByBridgeId: {},
};

export function parseNavigationSyncMode(value: unknown): NavigationSyncMode {
  return value === "independent" || value === "shared"
    ? value
    : DEFAULT_NAVIGATION_SYNC_MODE;
}

export function sharesNavigation(mode: NavigationSyncMode) {
  return mode === "shared";
}

export function readClientNavigationPrefs(
  storage: Pick<Storage, "getItem"> | null = browserSessionStorage(),
): ClientNavigationPrefs {
  if (!storage) {
    return DEFAULT_CLIENT_NAVIGATION_PREFS;
  }
  try {
    const raw = storage.getItem(CLIENT_NAVIGATION_PREFS_KEY);
    if (!raw) {
      return DEFAULT_CLIENT_NAVIGATION_PREFS;
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      mode: parseNavigationSyncMode(parsed.mode),
      selectedBridgeId:
        typeof parsed.selectedBridgeId === "string" ? parsed.selectedBridgeId : null,
      selectedPane: parsePaneRef(parsed.selectedPane),
      activeWorkspace: parseWorkspaceRef(parsed.activeWorkspace),
      selectedPanesByBridgeId: parseStringRecord(parsed.selectedPanesByBridgeId),
      activeWorkspacesByBridgeId: parseStringRecord(parsed.activeWorkspacesByBridgeId),
    };
  } catch {
    return DEFAULT_CLIENT_NAVIGATION_PREFS;
  }
}

export function writeClientNavigationPrefs(
  prefs: ClientNavigationPrefs,
  storage: Pick<Storage, "setItem"> | null = browserSessionStorage(),
) {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(CLIENT_NAVIGATION_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Session storage can be unavailable in private or locked-down browser contexts.
  }
}

function browserSessionStorage() {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function parsePaneRef(value: unknown): ClientNavigationPrefs["selectedPane"] {
  if (
    !isRecord(value) ||
    typeof value.bridgeId !== "string" ||
    typeof value.paneId !== "string"
  ) {
    return null;
  }
  return { bridgeId: value.bridgeId, paneId: value.paneId };
}

function parseWorkspaceRef(value: unknown): ClientNavigationPrefs["activeWorkspace"] {
  if (
    !isRecord(value) ||
    typeof value.bridgeId !== "string" ||
    typeof value.workspaceId !== "string"
  ) {
    return null;
  }
  return { bridgeId: value.bridgeId, workspaceId: value.workspaceId };
}

function parseStringRecord(value: unknown): Record<string, string> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
