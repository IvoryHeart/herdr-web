// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CoreNavigationProvider, useCoreNavigation } from "./CoreNavigation";
import { createCommands } from "./commands";
import { coreSurfaceRegistry } from "./surfaceRegistry";

afterEach(() => {
  window.history.replaceState({}, "", "/");
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("Spec 011 current surface and bridge behavior", () => {
  it("round-trips Spaces → Office → Spaces without losing the qualified observation", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const observation = {
      bridgeId: "bridge-b",
      workspaceId: "workspace-1",
      terminalId: "terminal-1",
    };

    await act(async () => {
      root.render(
        <CoreNavigationProvider registry={coreSurfaceRegistry}>
          <NavigationProbe observation={observation} />
        </CoreNavigationProvider>,
      );
    });

    expect(probe(container)).toMatchObject({ route: "/", surface: "spaces", ...observation });
    await act(async () => click(container, "Office"));
    expect(probe(container)).toMatchObject({ route: "/world", surface: "world", ...observation });
    await act(async () => click(container, "Spaces"));
    expect(probe(container)).toMatchObject({ route: "/", surface: "spaces", ...observation });

    await act(async () => root.unmount());
  });

  it("routes Office room create, rename, clear, and close operations to the selected bridge", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body)),
      });
      return new Response(JSON.stringify({ type: "ok" }), { status: 200 });
    });

    const bridgeA = createCommands((path) => `http://bridge-a.test${path}`);
    const bridgeB = createCommands((path) => `http://bridge-b.test${path}`);
    await bridgeA.createWorkspace("Room A");
    await bridgeB.renameWorkspace("workspace-1", "Room B");
    await bridgeB.renameWorkspace("workspace-1", null);
    await bridgeA.closeWorkspace("workspace-1");

    expect(requests).toEqual([
      {
        url: "http://bridge-a.test/api/command",
        body: {
          method: "workspace.create",
          params: { focus: true, label: "Room A" },
        },
      },
      {
        url: "http://bridge-b.test/api/command",
        body: {
          method: "workspace.rename",
          params: { workspace_id: "workspace-1", label: "Room B" },
        },
      },
      {
        url: "http://bridge-b.test/api/command",
        body: {
          method: "workspace.rename",
          params: { workspace_id: "workspace-1", label: null },
        },
      },
      {
        url: "http://bridge-a.test/api/command",
        body: {
          method: "workspace.close",
          params: { workspace_id: "workspace-1" },
        },
      },
    ]);
  });
});

function NavigationProbe({
  observation,
}: {
  observation: { bridgeId: string; workspaceId: string; terminalId: string };
}) {
  const { activeSurface, navigate } = useCoreNavigation();
  return (
    <div
      data-route={activeSurface.route}
      data-surface={activeSurface.id}
      data-bridge-id={observation.bridgeId}
      data-workspace-id={observation.workspaceId}
      data-terminal-id={observation.terminalId}
    >
      <button type="button" onClick={() => navigate("world")}>Office</button>
      <button type="button" onClick={() => navigate("spaces")}>Spaces</button>
    </div>
  );
}

function probe(container: HTMLElement) {
  const node = container.firstElementChild as HTMLElement;
  return {
    route: node.dataset.route,
    surface: node.dataset.surface,
    bridgeId: node.dataset.bridgeId,
    workspaceId: node.dataset.workspaceId,
    terminalId: node.dataset.terminalId,
  } satisfies Record<string, string | undefined>;
}

function click(container: HTMLElement, label: string) {
  const button = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === label,
  );
  if (!button) {
    throw new Error(`Missing navigation button: ${label}`);
  }
  button.click();
}
