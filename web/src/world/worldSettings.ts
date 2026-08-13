import type { BridgeId, BridgeRuntime } from "../bridge";
import { apiErrorMessage } from "../bridgeApi";
import { fetchWithTimeout } from "../fetchWithTimeout";
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
      return {
        roomAlignment: DEFAULT_OFFICE_ROOM_ALIGNMENT,
        longRoomTitleMode: DEFAULT_OFFICE_LONG_ROOM_TITLE_MODE,
      };
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return {
      roomAlignment: normalizeWorldRoomAlignment(parsed.roomAlignment),
      longRoomTitleMode: normalizeWorldLongRoomTitleMode(parsed.longRoomTitleMode),
    };
  } catch {
    return {
      roomAlignment: DEFAULT_OFFICE_ROOM_ALIGNMENT,
      longRoomTitleMode: DEFAULT_OFFICE_LONG_ROOM_TITLE_MODE,
    };
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

export function writeWorldRoomAlignment(roomAlignment: OfficeRoomAlignment) {
  writeWorldLayoutSettings({ roomAlignment });
}

export function readWorldLongRoomTitleMode(): OfficeLongRoomTitleMode {
  return readWorldLayoutSettings().longRoomTitleMode;
}

export function writeWorldLongRoomTitleMode(longRoomTitleMode: OfficeLongRoomTitleMode) {
  writeWorldLayoutSettings({ longRoomTitleMode });
}

export function normalizeWorldPrometheusUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
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

export function readWorldSettings(bridgeId: BridgeId): WorldSettings | null {
  try {
    const raw = globalThis.localStorage?.getItem(WORLD_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const value = parsed[bridgeId];
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
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

export function hasStoredWorldSettings(bridgeId: BridgeId) {
  try {
    const raw = globalThis.localStorage?.getItem(WORLD_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return false;
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.prototype.hasOwnProperty.call(parsed, bridgeId);
  } catch {
    return false;
  }
}

export function writeWorldSettings(bridgeId: BridgeId, settings: WorldSettings) {
  try {
    const raw = globalThis.localStorage?.getItem(WORLD_SETTINGS_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    parsed[bridgeId] = settings;
    globalThis.localStorage?.setItem(WORLD_SETTINGS_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Browser storage can be unavailable in private or locked-down contexts.
  }
}

export async function fetchWorldObservabilityConfiguration(
  runtime: BridgeRuntime,
): Promise<WorldObservabilityConfiguration> {
  const response = await fetchWithTimeout(runtime.httpUrl("/api/extensions/observability/config"));
  if (!response.ok) {
    throw new Error(
      await apiErrorMessage(response) ?? `Observability settings failed: ${response.status}`,
    );
  }
  return parseWorldObservabilityConfiguration(await response.json());
}

export async function updateWorldObservabilityConfiguration(
  runtime: BridgeRuntime,
  prometheusUrl: string | null,
): Promise<WorldObservabilityConfiguration> {
  const response = await fetchWithTimeout(runtime.httpUrl("/api/extensions/observability/config"), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prometheus_url: prometheusUrl }),
  });
  if (!response.ok) {
    throw new Error(
      await apiErrorMessage(response) ?? `Observability settings failed: ${response.status}`,
    );
  }
  return parseWorldObservabilityConfiguration(await response.json());
}

function parseWorldObservabilityConfiguration(value: unknown): WorldObservabilityConfiguration {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    providerId: typeof record.provider_id === "string" ? record.provider_id : "none",
    configured: record.configured === true,
    endpoint: typeof record.endpoint === "string" ? record.endpoint : null,
  };
}
