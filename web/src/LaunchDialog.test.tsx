/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LaunchDialog } from "./LaunchDialog";
import type { LauncherPresetOption } from "./launcherPresets";

const roots: Root[] = [];

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) {
      root.unmount();
    }
  });
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("LaunchDialog", () => {
  it("renders dynamic launcher presets and submits the selected preset", async () => {
    const { container, onSubmit } = await renderDialog([
      preset("builtin:shell", "Shell", null, true),
      preset("builtin:codex", "Codex", "codex", true),
      preset("remote-codex", "Remote Codex", "codex", false),
      preset("team-agent", "Team Agent", null, false),
    ]);

    const options = launchOptions(container);
    expect(options.map((option) => option.textContent)).toEqual([
      "Shell",
      "Codex",
      "Remote Codex",
      "Team Agent",
    ]);

    await act(async () => {
      options[2].click();
    });
    expect(titleInput(container).value).toBe("Remote Codex");

    await act(async () => {
      createButton(container).click();
    });
    expect(onSubmit).toHaveBeenCalledWith({
      presetId: "remote-codex",
      label: "Remote Codex",
      title: "Remote Codex",
    });
  });

  it("wraps keyboard navigation and scrolls the focused option into view", async () => {
    const { container } = await renderDialog([
      preset("builtin:shell", "Shell", null, true),
      preset("builtin:codex", "Codex", "codex", true),
      preset("remote-codex", "Remote Codex", "codex", false),
      preset("team-agent", "Team Agent", null, false),
    ]);
    const scrollIntoView = window.HTMLElement.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    const options = launchOptions(container);

    await act(async () => {
      options[0].dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }));
    });
    expect(options[3].getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(options[3]);
    expect(scrollIntoView).toHaveBeenCalled();

    await act(async () => {
      options[3].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });
    expect(options[0].getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(options[0]);
  });
});

async function renderDialog(options: LauncherPresetOption[]) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  const onSubmit = vi.fn();

  await act(async () => {
    root.render(
      <LaunchDialog
        target={{ mode: "tab", workspaceId: "space-1" }}
        options={options}
        onCancel={vi.fn()}
        onSubmit={onSubmit}
      />,
    );
  });

  return { container, onSubmit };
}

function launchOptions(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>(".launch-option"));
}

function titleInput(container: HTMLElement) {
  const input = container.querySelector<HTMLInputElement>("input.field");
  if (!input) {
    throw new Error("missing launch title input");
  }
  return input;
}

function createButton(container: HTMLElement) {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
    (candidate) => candidate.textContent === "Create",
  );
  if (!button) {
    throw new Error("missing create button");
  }
  return button;
}

function preset(
  id: string,
  label: string,
  agentHint: string | null,
  builtIn: boolean,
): LauncherPresetOption {
  return {
    id,
    label,
    agent_hint: agentHint,
    built_in: builtIn,
  };
}
