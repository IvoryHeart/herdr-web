// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FoundationConformanceApp as PublicFoundationConformanceApp } from "@herdr-world/foundation/conformance";
import type { QualifiedSurfaceTarget } from "@herdr-world/foundation/surfaces";
import { FoundationConformanceApp } from "./FoundationConformanceApp";
import { coreSurfaceRegistry } from "./surfaceRegistry";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("Foundation conformance assembly", () => {
  it("keeps the conformance assembly limited to generic navigation and Spaces", async () => {
    expect(coreSurfaceRegistry.list().map(({ id }) => id)).toEqual(["spaces"]);
    expect(coreSurfaceRegistry.get("world")).toBeNull();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<FoundationConformanceApp />));
    expect(container.querySelector('[data-foundation-surface="spaces"]')).not.toBeNull();
    expect(container.textContent).toContain("Foundation conformance shell");
    expect(container.textContent).not.toMatch(/Office|Pixel/iu);
    await act(async () => root.unmount());
  });

  it("uses the packed public Spaces implementation for multiple runtimes", async () => {
    const navigate = vi.fn();
    const attach = vi.fn();
    const release = vi.fn();
    const host = {
      runtimes: () => [
        {
          bridgeId: "bridge-a",
          label: "Bridge A",
          generationKey: "bridge-a:1",
          available: true,
          features: ["snapshot"],
          workspaces: [{
            target: { bridgeId: "bridge-a", kind: "workspace" as const, nativeTargetId: "a-workspace" },
            label: "Alpha",
            terminalTarget: { bridgeId: "bridge-a", kind: "terminal" as const, nativeTargetId: "a-terminal" },
          }],
        },
        {
          bridgeId: "bridge-b",
          label: "Bridge B",
          generationKey: "bridge-b:1",
          available: true,
          features: ["snapshot"],
          workspaces: [{
            target: { bridgeId: "bridge-b", kind: "workspace" as const, nativeTargetId: "b-workspace" },
            label: "Beta",
            terminalTarget: { bridgeId: "bridge-b", kind: "terminal" as const, nativeTargetId: "b-terminal" },
          }],
        },
      ],
      subscribe: () => () => {},
      retry: vi.fn(),
      navigate,
      acquireTerminal: vi.fn(async (target: QualifiedSurfaceTarget) => ({
        key: `${target.bridgeId}:${target.nativeTargetId}`,
        target,
        attach,
        input: vi.fn(),
        resize: vi.fn(),
        scroll: vi.fn(),
        subscribe: () => () => {},
        focus: vi.fn(),
        detach: vi.fn(),
        release,
      })),
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => root.render(<PublicFoundationConformanceApp host={host} />));
    expect(container.textContent).toContain("Bridge A");
    expect(container.textContent).toContain("Bridge B");
    await act(async () => {
      (Array.from(container.querySelectorAll("button")) as HTMLButtonElement[])
        .find((button) => button.textContent === "Bridge B: Beta")
        ?.click();
    });
    expect(navigate).toHaveBeenCalledWith({
      bridgeId: "bridge-b",
      kind: "workspace",
      nativeTargetId: "b-workspace",
    });
    expect(host.acquireTerminal).toHaveBeenCalledWith({
      bridgeId: "bridge-b",
      kind: "terminal",
      nativeTargetId: "b-terminal",
    });
    expect(attach).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
    expect(release).toHaveBeenCalledTimes(1);
  });
});
