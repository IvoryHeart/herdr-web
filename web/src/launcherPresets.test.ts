import { describe, expect, it } from "vitest";
import {
  FALLBACK_LAUNCHER_PRESETS,
  legacyKindForPresetId,
  parseLauncherPresetsResponse,
  supportsLauncherPresets,
} from "./launcherPresets";

describe("launcher presets", () => {
  it("detects bridge support from capabilities", () => {
    expect(supportsLauncherPresets({ commands: [], launcher_presets: { version: 1 } })).toBe(true);
    expect(supportsLauncherPresets({ commands: [] })).toBe(false);
    expect(supportsLauncherPresets(null)).toBe(false);
  });

  it("parses preset responses and warnings", () => {
    expect(
      parseLauncherPresetsResponse({
        version: 1,
        presets: [
          {
            id: "remote-codex",
            label: "Remote Codex",
            agent_hint: "codex",
            icon: "codex",
            built_in: false,
          },
        ],
        warnings: ["bad preset omitted"],
      }),
    ).toEqual({
      version: 1,
      presets: [
        {
          id: "remote-codex",
          label: "Remote Codex",
          agent_hint: "codex",
          icon: "codex",
          built_in: false,
        },
      ],
      warnings: ["bad preset omitted"],
    });
  });

  it("falls back to built-ins for malformed responses", () => {
    expect(parseLauncherPresetsResponse({}).presets).toEqual(FALLBACK_LAUNCHER_PRESETS);
  });

  it("maps built-in preset ids to legacy launch kinds", () => {
    expect(legacyKindForPresetId("builtin:shell")).toBe("shell");
    expect(legacyKindForPresetId("builtin:codex")).toBe("codex");
    expect(legacyKindForPresetId("custom")).toBeNull();
  });
});
