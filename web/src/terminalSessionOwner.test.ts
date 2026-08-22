// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TERMINAL_SESSION_REPLAY_MAX_BYTES,
  TERMINAL_SESSION_REPLAY_MAX_FRAMES,
  TerminalSessionOwnerRegistry,
  terminalSessionOwnerKey,
} from "./terminalSessionOwner";

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readonly sent: unknown[] = [];
  closeCalls = 0;
  readyState = FakeWebSocket.CONNECTING;
  binaryType = "blob";
  private readonly listeners = new Map<string, Set<(event: Event) => void>>();

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: Event) => void) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  send(data: unknown) {
    this.sent.push(data);
  }

  close() {
    this.closeCalls += 1;
    if (this.readyState === FakeWebSocket.CLOSED) {
      return;
    }
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close");
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.emit("open");
  }

  message(data: unknown) {
    this.emit("message", { data } as MessageEvent);
  }

  serverClose() {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit("close");
  }

  private emit(type: string, event: Event = new Event(type)) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener(event);
    }
  }
}

const registry = new TerminalSessionOwnerRegistry();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.stubGlobal("WebSocket", FakeWebSocket);
  FakeWebSocket.instances = [];
});

afterEach(() => {
  registry.disposeAll();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Foundation-owned terminal session transport", () => {
  it("uses one owner and replays the coherent current epoch before live output", () => {
    const firstOutput: number[] = [];
    const first = acquire({
      focusOwner: true,
      onOutput: (data) => firstOutput.push(data[0]),
    });
    const socket = onlySocket();
    socket.open();

    socket.message(new Uint8Array([1]).buffer);
    socket.message(new Uint8Array([2]).buffer);
    socket.message(new Uint8Array([3]).buffer);

    const lateOutput: number[] = [];
    const late = acquire({
      focusOwner: false,
      onOutput: (data) => lateOutput.push(data[0]),
    });

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(lateOutput).toEqual([1, 2, 3]);

    socket.message(new Uint8Array([4]).buffer);
    expect(lateOutput).toEqual([1, 2, 3, 4]);
    expect(firstOutput).toEqual([1, 2, 3, 4]);
    late.release();
    first.release();
  });

  it("keeps existing subscribers lossless beyond the frame bound and resyncs once for a late subscriber", async () => {
    const liveOutput: number[] = [];
    const first = acquire({
      focusOwner: true,
      onOutput: (data) => liveOutput.push(data[0]),
    });
    const firstSocket = onlySocket();
    firstSocket.open();
    for (let index = 0; index <= TERMINAL_SESSION_REPLAY_MAX_FRAMES + 1; index += 1) {
      firstSocket.message(new Uint8Array([index % 256]).buffer);
    }
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(liveOutput).toHaveLength(TERMINAL_SESSION_REPLAY_MAX_FRAMES + 2);
    firstSocket.message(new Uint8Array([250]).buffer);
    expect(liveOutput.at(-1)).toBe(250);

    const lateOutput: number[] = [];
    const late = acquire({
      focusOwner: false,
      onOutput: (data) => lateOutput.push(data[0]),
    });
    expect(lateOutput).toEqual([]);
    expect(FakeWebSocket.instances).toHaveLength(1);

    expect(lateOutput).toEqual([]);

    await vi.advanceTimersByTimeAsync(500);
    expect(FakeWebSocket.instances).toHaveLength(2);
    const replacementSocket = FakeWebSocket.instances[1];
    replacementSocket.open();
    replacementSocket.message(new Uint8Array([42]).buffer);
    expect(lateOutput).toEqual([42]);
    expect(liveOutput.at(-1)).toBe(42);
    await vi.advanceTimersByTimeAsync(5000);
    expect(FakeWebSocket.instances).toHaveLength(2);

    late.release();
    first.release();
  });

  it("keeps existing subscribers lossless beyond the byte bound and does not loop on an oversized repaint", async () => {
    const liveSizes: number[] = [];
    const first = acquire({
      focusOwner: true,
      onOutput: (data) => liveSizes.push(data.byteLength),
    });
    const firstSocket = onlySocket();
    firstSocket.open();
    const frame = new Uint8Array(Math.floor(TERMINAL_SESSION_REPLAY_MAX_BYTES / 2) + 1);
    firstSocket.message(frame.buffer);
    firstSocket.message(frame.slice().buffer);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(liveSizes).toEqual([frame.byteLength, frame.byteLength]);
    firstSocket.message(new Uint8Array([44]).buffer);
    expect(liveSizes.at(-1)).toBe(1);

    const lateSizes: number[] = [];
    const late = acquire({
      focusOwner: false,
      onOutput: (data) => lateSizes.push(data.byteLength),
    });
    expect(lateSizes).toEqual([]);

    await vi.advanceTimersByTimeAsync(500);
    const replacementSocket = FakeWebSocket.instances.at(-1)!;
    expect(FakeWebSocket.instances).toHaveLength(2);
    replacementSocket.open();
    const oversizedRepaint = new Uint8Array(TERMINAL_SESSION_REPLAY_MAX_BYTES + 1);
    replacementSocket.message(oversizedRepaint.buffer);
    replacementSocket.message(new Uint8Array([43]).buffer);
    expect(lateSizes).toEqual([oversizedRepaint.byteLength, 1]);
    expect(liveSizes.at(-2)).toBe(oversizedRepaint.byteLength);
    expect(liveSizes.at(-1)).toBe(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(FakeWebSocket.instances).toHaveLength(2);

    late.release();
    first.release();
  });

  it("clears replay between reconnect epochs and ignores output from the retired socket", async () => {
    const output: number[] = [];
    const first = acquire({ onOutput: (data) => output.push(data[0]) });
    const firstSocket = onlySocket();
    firstSocket.open();
    firstSocket.message(new Uint8Array([1]).buffer);
    firstSocket.serverClose();

    const lateOutput: number[] = [];
    const late = acquire({ onOutput: (data) => lateOutput.push(data[0]) });
    expect(lateOutput).toEqual([]);

    await vi.advanceTimersByTimeAsync(500);
    const replacementSocket = FakeWebSocket.instances.at(-1)!;
    replacementSocket.open();
    firstSocket.message(new Uint8Array([99]).buffer);
    replacementSocket.message(new Uint8Array([2]).buffer);

    expect(output).toEqual([1, 2]);
    expect(lateOutput).toEqual([2]);
    late.release();
    first.release();
  });

  it("keeps repeated reconnect failures on one bounded scheduler marker", async () => {
    const handle = acquire();
    let socket = onlySocket();
    socket.open();

    for (let attempt = 0; attempt < 4; attempt += 1) {
      socket.serverClose();
      await vi.advanceTimersByTimeAsync(500);
      expect(FakeWebSocket.instances).toHaveLength(attempt + 2);
      socket = FakeWebSocket.instances.at(-1)!;
      socket.open();
    }

    handle.release();
  });

  it("allows only the focus owner to resize and transfers authority deterministically", () => {
    const first = acquire({ initialSize: { cols: 80, rows: 24 }, focusOwner: true });
    const second = acquire({ initialSize: { cols: 120, rows: 40 }, focusOwner: false });
    const socket = onlySocket();
    socket.open();
    const resizeMessages = () => socket.sent
      .filter((value): value is string => typeof value === "string")
      .map((value) => JSON.parse(value) as { type?: string; cols?: number; rows?: number })
      .filter((value) => value.type === "resize");

    const afterOpen = resizeMessages().length;
    second.reportSize({ cols: 121, rows: 41 });
    expect(resizeMessages()).toHaveLength(afterOpen);
    first.reportSize({ cols: 81, rows: 25 });
    expect(resizeMessages().at(-1)).toMatchObject({ cols: 81, rows: 25 });

    second.setFocusOwner(true);
    second.reportSize({ cols: 122, rows: 42 });
    expect(resizeMessages().at(-1)).toMatchObject({ cols: 122, rows: 42 });
    first.reportSize({ cols: 82, rows: 26 });
    expect(resizeMessages().at(-1)).toMatchObject({ cols: 122, rows: 42 });

    second.release();
    expect(resizeMessages().at(-1)).toMatchObject({ cols: 82, rows: 26 });
    first.release();
  });

  it("runs one reconnect scheduler and restores every active subscriber", async () => {
    const firstOutput: number[] = [];
    const secondOutput: number[] = [];
    const first = acquire({ onOutput: (data) => firstOutput.push(data[0]) });
    const second = acquire({ onOutput: (data) => secondOutput.push(data[0]) });
    const firstSocket = onlySocket();
    firstSocket.open();
    firstSocket.serverClose();

    await vi.advanceTimersByTimeAsync(499);
    expect(FakeWebSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeWebSocket.instances).toHaveLength(2);
    const secondSocket = FakeWebSocket.instances[1];
    secondSocket.open();
    secondSocket.message(new Uint8Array([44]).buffer);

    expect(firstOutput).toEqual([44]);
    expect(secondOutput).toEqual([44]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(FakeWebSocket.instances).toHaveLength(2);
    second.release();
    first.release();
  });

  it("isolates duplicate native IDs by bridge and runtime generation", () => {
    const bridgeA: number[] = [];
    const bridgeB: number[] = [];
    const first = acquire({ profileId: "bridge-a", onOutput: (data) => bridgeA.push(data[0]) });
    const second = acquire({ profileId: "bridge-b", onOutput: (data) => bridgeB.push(data[0]) });
    expect(FakeWebSocket.instances).toHaveLength(2);
    const [socketA, socketB] = FakeWebSocket.instances;
    socketA.open();
    socketB.open();
    socketA.message(new Uint8Array([10]).buffer);
    socketB.message(new Uint8Array([20]).buffer);
    expect(bridgeA).toEqual([10]);
    expect(bridgeB).toEqual([20]);

    const oldSocket = socketA;
    first.release();
    const next: number[] = [];
    const replacement = acquire({
      profileId: "bridge-a",
      connectionKey: "generation-2",
      onOutput: (data) => next.push(data[0]),
    });
    const replacementSocket = FakeWebSocket.instances.at(-1)!;
    replacementSocket.open();
    oldSocket.message(new Uint8Array([99]).buffer);
    replacementSocket.message(new Uint8Array([30]).buffer);
    expect(next).toEqual([30]);
    expect(terminalSessionOwnerKey({
      profileId: "bridge-a",
      connectionKey: "generation-1",
      terminalId: "1",
    })).not.toBe(terminalSessionOwnerKey({
      profileId: "bridge-a",
      connectionKey: "generation-2",
      terminalId: "1",
    }));
    replacement.release();
    second.release();
  });

  it("preserves JSON/binary input, independent scroll gates, and idempotent cleanup", () => {
    const handle = acquire({
      inputEnabled: true,
      resizeEnabled: false,
      scrollEnabled: false,
    });
    const socket = onlySocket();
    socket.open();
    expect(handle.sendInput("json", "json")).toBe(true);
    expect(handle.sendInput("binary", "binary")).toBe(true);
    expect(handle.sendScroll(-4)).toBe(false);
    expect(socket.sent).toContainEqual(JSON.stringify({ type: "input", data: "json" }));
    expect(socket.sent).toContainEqual(new TextEncoder().encode("binary"));

    handle.updateAdmission(false, true, true);
    expect(handle.sendInput("blocked", "json")).toBe(false);
    expect(handle.sendScroll(-4)).toBe(true);
    handle.release();
    handle.release();
    expect(socket.closeCalls).toBe(1);
    expect(registry.size).toBe(0);
  });

  it("continues fanout when one subscriber callback reports an error", () => {
    const healthy: number[] = [];
    const failing = acquire({ onOutput: () => { throw new Error("renderer failed"); } });
    const good = acquire({ onOutput: (data) => healthy.push(data[0]) });
    const socket = onlySocket();
    socket.open();
    expect(() => socket.message(new Uint8Array([8]).buffer)).not.toThrow();
    expect(healthy).toEqual([8]);
    failing.release();
    good.release();
  });
});

function acquire(
  overrides: Partial<{
    profileId: string;
    connectionKey: string;
    terminalId: string;
    initialSize: { cols: number; rows: number };
    inputEnabled: boolean;
    resizeEnabled: boolean;
    scrollEnabled: boolean;
    focusOwner: boolean;
    onOutput: (data: Uint8Array) => void;
  }> = {},
) {
  return registry.acquire({
    profileId: overrides.profileId ?? "bridge-a",
    connectionKey: overrides.connectionKey ?? "generation-1",
    terminalId: overrides.terminalId ?? "1",
    wsUrl: (path, query) => `ws://bridge.test${path}${query ? `?${query}` : ""}`,
    outputCoalesceMs: 16,
    initialSize: overrides.initialSize ?? { cols: 80, rows: 24 },
    inputEnabled: overrides.inputEnabled ?? true,
    resizeEnabled: overrides.resizeEnabled ?? true,
    scrollEnabled: overrides.scrollEnabled ?? true,
    focusOwner: overrides.focusOwner ?? false,
    onOutput: overrides.onOutput ?? (() => {}),
    onState: () => {},
    onConnectAttempt: () => {},
  });
}

function onlySocket() {
  expect(FakeWebSocket.instances).toHaveLength(1);
  return FakeWebSocket.instances[0];
}
