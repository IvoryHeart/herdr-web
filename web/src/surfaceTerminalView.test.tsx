// @vitest-environment jsdom

import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SharedTerminalHandlePool,
  type QualifiedSurfaceTarget,
  type SurfaceHostV1,
  type TerminalHandle,
} from "@herdr-world/foundation/surfaces";
import { useSurfaceTerminalHandle } from "./TerminalView";

const target = {
  bridgeId: "bridge-a",
  kind: "terminal" as const,
  nativeTargetId: "terminal-a",
};

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function TerminalViewProbe({
  label,
  host,
  onReady,
}: {
  label: string;
  host: Pick<SurfaceHostV1, "acquireTerminal">;
  onReady: (label: string, handle: TerminalHandle) => void;
}) {
  const { handle } = useSurfaceTerminalHandle(host, target);
  useEffectWhenReady(label, handle, onReady);
  return null;
}

function useEffectWhenReady(
  label: string,
  handle: TerminalHandle | null,
  onReady: (label: string, handle: TerminalHandle) => void,
) {
  // Kept local so the probe exercises the same hook used by the production
  // SurfaceTerminalView while standing in for two independent renderers.
  useEffect(() => {
    if (!handle) {
      return;
    }
    void handle.attach();
    const unsubscribe = handle.subscribe(() => {});
    onReady(label, handle);
    return () => {
      unsubscribe();
      void Promise.resolve(handle.release()).catch(() => {});
    };
  }, [handle, label, onReady]);
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("host-managed surface terminal views", () => {
  it("shares one transport between Spaces and Office and releases only the closed view", async () => {
    const pool = new SharedTerminalHandlePool();
    const attach = vi.fn();
    const release = vi.fn();
    const listeners = new Set<(data: Uint8Array) => void>();
    const factory = vi.fn(async (): Promise<TerminalHandle> => ({
      key: "bridge-a:terminal-a",
      target,
      attach,
      input: vi.fn(),
      resize: vi.fn(),
      scroll: vi.fn(),
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      focus: vi.fn(),
      detach: vi.fn(),
      release,
    }));
    const host = {
      acquireTerminal: (qualifiedTarget: QualifiedSurfaceTarget) => pool.acquire(qualifiedTarget, factory),
    };
    const ready = new Map<string, TerminalHandle>();
    const onReady = vi.fn((label: string, handle: TerminalHandle) => ready.set(label, handle));
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <>
          <TerminalViewProbe label="Spaces" host={host} onReady={onReady} />
          <TerminalViewProbe label="Office" host={host} onReady={onReady} />
        </>,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(factory).toHaveBeenCalledTimes(1);
    expect(ready.has("Spaces")).toBe(true);
    expect(ready.has("Office")).toBe(true);
    expect(attach).toHaveBeenCalledTimes(2);
    expect(listeners.size).toBe(2);
    expect(pool.size).toBe(1);

    await act(async () => {
      root.render(<TerminalViewProbe label="Spaces" host={host} onReady={onReady} />);
      await Promise.resolve();
    });
    expect(release).not.toHaveBeenCalled();
    expect(pool.size).toBe(1);
    expect(listeners.size).toBe(1);

    await act(async () => root.unmount());
    expect(release).toHaveBeenCalledTimes(1);
    expect(pool.size).toBe(0);
  });
});
