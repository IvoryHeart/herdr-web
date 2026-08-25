import {
  DEFAULT_OFFICE_LONG_ROOM_TITLE_MODE,
  DEFAULT_OFFICE_ROOM_ALIGNMENT,
} from "./officeGeometry";
import type { OfficeLongRoomTitleMode, OfficeRoomAlignment } from "./officeGeometry";

const WORLD_SETTINGS_STORAGE_KEY = "herdrWeb.worldSettings.v1";
const WORLD_LAYOUT_SETTINGS_STORAGE_KEY = "herdrWeb.worldLayout.v1";

export type WorldSettings = {
  prometheusUrl: string | null;
};

export type WorldObservabilityConfiguration = {
  providerId: string;
  configured: boolean;
  endpoint: string | null;
};

export type WorldLayoutSettings = {
  roomAlignment: OfficeRoomAlignment;
  longRoomTitleMode: OfficeLongRoomTitleMode;
};

export function normalizeWorldRoomAlignment(value: unknown): OfficeRoomAlignment {
  return value === "center" || value === "right" ? value : "left";
}

export function normalizeWorldLongRoomTitleMode(value: unknown): OfficeLongRoomTitleMode {
  return value === "compact" ? "compact" : DEFAULT_OFFICE_LONG_ROOM_TITLE_MODE;
}

export function readWorldLayoutSettings(): WorldLayoutSettings {
  try {
    const raw = globalThis.localStorage?.getItem(WORLD_LAYOUT_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return defaultWorldLayoutSettings();
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      roomAlignment: normalizeWorldRoomAlignment(parsed.roomAlignment),
      longRoomTitleMode: normalizeWorldLongRoomTitleMode(parsed.longRoomTitleMode),
    };
  } catch {
    return defaultWorldLayoutSettings();
  }
}

export function writeWorldLayoutSettings(patch: Partial<WorldLayoutSettings>) {
  try {
    const current = readWorldLayoutSettings();
    const next = {
      roomAlignment: normalizeWorldRoomAlignment(patch.roomAlignment ?? current.roomAlignment),
      longRoomTitleMode: normalizeWorldLongRoomTitleMode(
        patch.longRoomTitleMode ?? current.longRoomTitleMode,
      ),
    } satisfies WorldLayoutSettings;
    globalThis.localStorage?.setItem(WORLD_LAYOUT_SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Browser storage can be unavailable in private or locked-down contexts.
  }
}

export function readWorldRoomAlignment(): OfficeRoomAlignment {
  return readWorldLayoutSettings().roomAlignment;
}

export function readWorldLongRoomTitleMode(): OfficeLongRoomTitleMode {
  return readWorldLayoutSettings().longRoomTitleMode;
}

export function hasStoredWorldSettings(bridgeId: string) {
  try {
    const raw = globalThis.localStorage?.getItem(WORLD_SETTINGS_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.prototype.hasOwnProperty.call(parsed, bridgeId);
  } catch {
    return false;
  }
}

export function readWorldSettings(bridgeId: string): WorldSettings | null {
  try {
    const raw = globalThis.localStorage?.getItem(WORLD_SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const value = parsed[bridgeId];
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const prometheusUrl = (value as { prometheusUrl?: unknown }).prometheusUrl;
    return {
      prometheusUrl: typeof prometheusUrl === "string" && prometheusUrl.trim()
        ? prometheusUrl
        : null,
    };
  } catch {
    return null;
  }
}

export function writeWorldSettings(bridgeId: string, settings: WorldSettings) {
  try {
    const raw = globalThis.localStorage?.getItem(WORLD_SETTINGS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    parsed[bridgeId] = settings;
    globalThis.localStorage?.setItem(WORLD_SETTINGS_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Browser storage can be unavailable in private or locked-down contexts.
  }
}

export function normalizeWorldPrometheusUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Prometheus URL must be a valid http:// or https:// URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Prometheus URL must use http:// or https://.");
  }
  if (!url.hostname || url.username || url.password) {
    throw new Error("Prometheus URL must include a host and no embedded credentials.");
  }
  if (url.search || url.hash) {
    throw new Error("Prometheus URL must not include a query string or fragment.");
  }
  url.pathname = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  return url.toString();
}

function defaultWorldLayoutSettings(): WorldLayoutSettings {
  return {
    roomAlignment: DEFAULT_OFFICE_ROOM_ALIGNMENT,
    longRoomTitleMode: DEFAULT_OFFICE_LONG_ROOM_TITLE_MODE,
  };
}
