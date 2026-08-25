/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SurfaceHostV1,
  SurfaceRuntimeView,
} from "@herdr-world/foundation/surfaces";
import { FoundationWorldSettingsDialog } from "./FoundationWorldSettingsDialog";
import { readWorldLayoutSettings } from "./worldSettingsState";

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Foundation Office settings", () => {
  it("reads configuration once when host runtime getters return fresh public views", async () => {
    const request = vi.fn(async () => ({
      provider_id: "none",
      configured: false,
      endpoint: null,
    }));
    const host = testHost(request);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<FoundationWorldSettingsDialog context={{ host }} onClose={() => {}} />);
    });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(container.textContent).toContain("Not configured"));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({
      runtime: runtime().identity,
      extensionId: "observability",
      operation: "config-read",
    });
    expect(container.querySelector(".overlay-root")).toBeNull();
    expect(container.querySelector("[role='dialog']")).toBeNull();
    expect(container.querySelector("form")?.getAttribute("aria-label")).toBe(
      "Office settings configuration",
    );

    await act(async () => root.unmount());
    container.remove();
  });

  it("renders inline and delegates cancellation to the owning Foundation dialog", async () => {
    const host = testHost(async () => ({
      provider_id: "none",
      configured: false,
      endpoint: null,
    }));
    const onClose = vi.fn();
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<FoundationWorldSettingsDialog context={{ host }} onClose={onClose} />);
    });
    const cancel = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent === "Cancel");
    if (!cancel) throw new Error("cancel control did not render");

    await act(async () => cancel.click());

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".overlay-root")).toBeNull();
    expect(container.querySelector(".overlay-scrim")).toBeNull();
    await act(async () => root.unmount());
    container.remove();
  });

  it("keeps Office layout settings writable without the optional observability extension", async () => {
    const request = vi.fn(async () => {
      throw new Error("extension transport must remain unused");
    });
    const host = testHost(request, { features: ["snapshot"] });
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(<FoundationWorldSettingsDialog context={{ host }} onClose={() => {}} />);
    });
    await vi.waitFor(() => expect(container.textContent).toContain(
      "Observability is unavailable on this bridge",
    ));
    const prometheus = container.querySelector<HTMLInputElement>("input[placeholder^='http']");
    const alignment = Array.from(container.querySelectorAll<HTMLSelectElement>("select"))
      .find((select) => Array.from(select.options).some(({ value }) => value === "right"));
    const form = container.querySelector<HTMLFormElement>("form");
    expect(prometheus?.disabled).toBe(true);
    if (!alignment || !form) throw new Error("settings controls did not render");

    await act(async () => {
      alignment.value = "right";
      alignment.dispatchEvent(new Event("change", { bubbles: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await vi.waitFor(() => expect(container.textContent).toContain("Office layout saved."));

    expect(request).not.toHaveBeenCalled();
    expect(readWorldLayoutSettings().roomAlignment).toBe("right");
    await act(async () => root.unmount());
    container.remove();
  });
});

function runtime(): SurfaceRuntimeView {
  return {
    identity: {
      bridgeId: "same-origin",
      connectionKey: "same-origin",
      generationKey: "same-origin:generation-1",
    },
    label: "Same origin",
    state: "ready",
    features: ["snapshot", "observability_extension"],
    commands: [],
    launcherPresets: false,
  };
}

function testHost(
  request: SurfaceHostV1["extensions"]["request"],
  overrides: Partial<SurfaceRuntimeView> = {},
): SurfaceHostV1 {
  const controller = new AbortController();
  const currentRuntime = () => ({
    ...runtime(),
    ...overrides,
    identity: { ...runtime().identity, ...overrides.identity },
  });
  return {
    apiVersion: 1,
    signal: controller.signal,
    get runtimes() {
      return [currentRuntime()];
    },
    get availableRuntimes() {
      return this.runtimes;
    },
    get selectedRuntime() {
      return this.runtimes[0] ?? null;
    },
    selectRuntime: () => {},
    subscribeSelectedRuntime: () => () => {},
    navigation: { currentSurfaceId: "world", goTo: () => {}, subscribe: () => () => {} },
    shell: {
      state: { runtimeScope: "selected", compact: false, sidebarVisible: true },
      subscribe: () => () => {},
      subscribeInteractions: () => () => {},
      showSidebar: () => {},
      toggleSidebar: () => {},
    },
    facts: { forRuntime: () => null, subscribe: () => () => {} },
    capabilities: { forRuntime: () => null, admission: () => [], retry: () => {} },
    commands: { dispatch: async () => { throw new Error("unused"); } },
    launchers: {
      list: async () => ({ presets: [], warnings: [] }),
      launchTab: async () => { throw new Error("unused"); },
      launchSplit: async () => { throw new Error("unused"); },
    },
    extensions: { request },
    terminals: { acquire: () => { throw new Error("unused"); } },
  };
}
