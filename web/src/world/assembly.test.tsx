/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SurfaceHostV1 } from "@herdr-world/foundation/surfaces";
import {
  createOfficeWorldContext,
  dispatchOfficeSurfaceCommand,
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

  it("routes the exact qualified allow-listed Office command through the registration host", async () => {
    const dispatch = vi.fn(async () => ({}));
    const request = {
      command: "workspace.rename" as const,
      target: {
        bridgeId: "bridge-a",
        kind: "workspace" as const,
        nativeTargetId: "workspace-a",
      },
      params: { label: "Alpha" },
    };
    const context = {
      host: { dispatch } as unknown as SurfaceHostV1,
      current: FALLBACK_CONTEXT,
    } satisfies OfficeSurfaceContext;

    await dispatchOfficeSurfaceCommand(context, request);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(request);
  });
});
