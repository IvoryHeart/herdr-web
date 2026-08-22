import { afterEach, describe, expect, it, vi } from "vitest";
import type { BridgeRuntime } from "./bridge";
import { createSurfaceTerminalHandle } from "./surfaceTerminal";

class PendingWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static readonly instances: PendingWebSocket[] = [];
  binaryType = "";
  readyState = PendingWebSocket.CONNECTING;
  readonly close = vi.fn(() => {
    this.readyState = PendingWebSocket.CLOSED;
    this.dispatchEvent(new Event("close"));
  });
  readonly send = vi.fn();

  constructor() {
    super();
    PendingWebSocket.instances.push(this);
  }
}

afterEach(() => {
  PendingWebSocket.instances.length = 0;
  vi.unstubAllGlobals();
});

describe("surface terminal transport", () => {
  it("rejects an attach cancelled before open and closes exactly once", async () => {
    vi.stubGlobal("WebSocket", PendingWebSocket);
    const runtime = {
      wsUrl: () => "ws://bridge.test/ws/terminal",
    } as unknown as BridgeRuntime;
    const target = {
      bridgeId: "bridge-a",
      kind: "terminal" as const,
      nativeTargetId: "terminal-a",
    };
    const handle = createSurfaceTerminalHandle(runtime, target);
    const pending = handle.attach();

    expect(PendingWebSocket.instances).toHaveLength(1);
    await handle.release();
    await expect(pending).rejects.toThrow(/cancelled/iu);
    expect(PendingWebSocket.instances[0].close).toHaveBeenCalledTimes(1);

    await handle.release();
    expect(PendingWebSocket.instances[0].close).toHaveBeenCalledTimes(1);
  });
});
