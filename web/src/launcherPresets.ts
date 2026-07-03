import type { BridgeCapabilities } from "./bridge";
import type { BridgeHttpUrl } from "./bridgeApi";
import { fetchWithTimeout } from "./fetchWithTimeout";

export type LauncherPresetOption = {
  id: string;
  label: string;
  agent_hint: string | null;
  icon: string;
  built_in: boolean;
};

export type LauncherPresetsResponse = {
  version: 1;
  presets: LauncherPresetOption[];
  warnings: string[];
};

export const FALLBACK_LAUNCHER_PRESETS: LauncherPresetOption[] = [
  {
    id: "builtin:shell",
    label: "Shell",
    agent_hint: null,
    icon: "terminal",
    built_in: true,
  },
  {
    id: "builtin:codex",
    label: "Codex",
    agent_hint: "codex",
    icon: "codex",
    built_in: true,
  },
  {
    id: "builtin:claude",
    label: "Claude",
    agent_hint: "claude",
    icon: "claude",
    built_in: true,
  },
  {
    id: "builtin:pi",
    label: "pi",
    agent_hint: "pi",
    icon: "pi",
    built_in: true,
  },
];

export function supportsLauncherPresets(capabilities: BridgeCapabilities | null | undefined) {
  return capabilities?.launcher_presets?.version === 1;
}

export async function fetchLauncherPresets(
  httpUrl: BridgeHttpUrl,
): Promise<LauncherPresetsResponse> {
  const response = await fetchWithTimeout(httpUrl("/api/launcher-presets"));
  if (!response.ok) {
    throw new Error(`launcher presets failed: ${response.status}`);
  }
  return parseLauncherPresetsResponse(await response.json());
}

export function parseLauncherPresetsResponse(value: unknown): LauncherPresetsResponse {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.presets)) {
    return { version: 1, presets: FALLBACK_LAUNCHER_PRESETS, warnings: [] };
  }
  const presets = value.presets
    .map(parseLauncherPreset)
    .filter((preset): preset is LauncherPresetOption => Boolean(preset));
  return {
    version: 1,
    presets: presets.length > 0 ? presets : FALLBACK_LAUNCHER_PRESETS,
    warnings: Array.isArray(value.warnings)
      ? value.warnings.filter((warning): warning is string => typeof warning === "string")
      : [],
  };
}

export function legacyKindForPresetId(id: string): "shell" | "codex" | "claude" | "pi" | null {
  if (id === "builtin:shell") return "shell";
  if (id === "builtin:codex") return "codex";
  if (id === "builtin:claude") return "claude";
  if (id === "builtin:pi") return "pi";
  return null;
}

function parseLauncherPreset(value: unknown): LauncherPresetOption | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.label !== "string") {
    return null;
  }
  return {
    id: value.id,
    label: value.label,
    agent_hint: typeof value.agent_hint === "string" ? value.agent_hint : null,
    icon: typeof value.icon === "string" ? value.icon : "terminal",
    built_in: value.built_in === true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
