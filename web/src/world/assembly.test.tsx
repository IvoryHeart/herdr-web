/**
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  SurfaceHostV1,
  TerminalHandle,
} from "@herdr-world/foundation/surfaces";
import { SurfaceTerminalLease } from "../SurfaceTerminalLease";
import {
  createOfficeWorldContext,
  type OfficeSurfaceContext,
} from "./assembly";
import { FALLBACK_CONTEXT } from "./WorldSurface";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("World Foundation host binding", () => {
  it("keeps local Office selection and routes handoff through a qualified host target", () => {
    const navigate = vi.fn();
    const select = vi.fn();
    const current = {
      ...FALLBACK_CONTEXT,
      onSelect: select,
      projection: {
        ...FALLBACK_CONTEXT.projection,
        roomRoster: [{
          key: "[\"bridge-a\",\"workspace\",\"workspace-a\"]",
          hostKey: "bridge-a",
          hostLabel: "Bridge A",
          workspaceRef: {
            profileId: "bridge-a",
            kind: "workspace" as const,
            nativeTargetId: "workspace-a",
          },
          observedGeneration: "bridge-a:1",
          displayLabel: "Alpha",
          order: 0,
          stale: false,
          canOpenInSpaces: true,
          presented: true,
        }],
      },
    };
    const context = {
      host: { navigate } as unknown as SurfaceHostV1,
      current,
    } satisfies OfficeSurfaceContext;
    const bound = createOfficeWorldContext(context);

    bound.onSelect(current.projection.roomRoster[0].key);
    bound.onOpenInSpaces({
      kind: "room",
      key: current.projection.roomRoster[0].key,
      profileId: "bridge-a",
      observedGeneration: "bridge-a:1",
      workspaceRef: current.projection.roomRoster[0].workspaceRef,
    });

    expect(select).toHaveBeenCalledWith(current.projection.roomRoster[0].key);
    expect(navigate).toHaveBeenCalledWith({
      bridgeId: "bridge-a",
      kind: "workspace",
      nativeTargetId: "workspace-a",
    });
  });

  it("acquires and releases the production conversation terminal lease", async () => {
    const release = vi.fn();
    const handle = {
      key: "bridge-a:terminal-a",
      target: {
        bridgeId: "bridge-a",
        kind: "terminal" as const,
        nativeTargetId: "terminal-a",
      },
      attach: vi.fn(),
      input: vi.fn(),
      resize: vi.fn(),
      scroll: vi.fn(),
      focus: vi.fn(),
      detach: vi.fn(),
      release,
    } satisfies TerminalHandle;
    const acquireTerminal = vi.fn(async () => handle);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SurfaceTerminalLease
          host={{ acquireTerminal }}
          target={handle.target}
        >
          <span>conversation</span>
        </SurfaceTerminalLease>,
      );
    });
    expect(acquireTerminal).toHaveBeenCalledWith(handle.target);

    await act(async () => root.unmount());
    expect(release).toHaveBeenCalledTimes(1);
  });
});
