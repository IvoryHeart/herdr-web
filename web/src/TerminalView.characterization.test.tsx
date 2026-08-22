// @vitest-environment jsdom

import { act, useState } from "react";
import type { ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BridgeRuntime } from "./bridge";
import { GhosttyRenderer } from "./terminalRenderer";
import type { PaneInfo } from "./types";
import { TerminalView } from "./TerminalView";
import { WorldConversationBubble } from "./world/WorldConversationBubble";
import type { OfficeAgent } from "./world/herdrOfficeProjection";
import type { TerminalSessionDescriptor } from "./terminalSessions";

type FakeRenderer = {
  input: ((data: string) => void) | null;
  scroll: ((lines: number) => void) | null;
  writes: number[][];
  focusCalls: number;
  disposed: boolean;
  nextSize: { cols: number; rows: number };
  refreshSize: { cols: number; rows: number };
  triggerInput: (data: string) => void;
  triggerScroll: (lines: number) => void;
};

const rendererInstances = () =>
  (GhosttyRenderer as unknown as { instances: FakeRenderer[] }).instances;

vi.mock("./terminalRenderer", () => {
  class FakeGhosttyRenderer {
    static instances: FakeGhosttyRenderer[] = [];
    input: ((data: string) => void) | null = null;
    scroll: ((lines: number) => void) | null = null;
    writes: number[][] = [];
    focusCalls = 0;
    disposed = false;
    nextSize = { cols: 87, rows: 29 };
    refreshSize = { cols: 91, rows: 31 };

    constructor() {
      FakeGhosttyRenderer.instances.push(this);
    }

    async mount(host: HTMLElement) {
      host.appendChild(document.createElement("canvas"));
    }

    dispose() {
      this.disposed = true;
    }

    fit() {
      return this.nextSize;
    }

    refreshMetrics() {
      return this.refreshSize;
    }

    setScrollSensitivity() {}
    setTapFocusHandler() {}
    setMobileTouchSelection() {}
    setAccessibleScreenListener() {}
    clearSelection() {}
    focusTextInput() {}
    setFontSize() {
      return this.nextSize;
    }

    focus() {
      this.focusCalls += 1;
    }

    write(data: Uint8Array) {
      this.writes.push([...data]);
    }

    onInput(callback: (data: string) => void) {
      this.input = callback;
      return () => {
        if (this.input === callback) {
          this.input = null;
        }
      };
    }

    onScroll(callback: (lines: number) => void) {
      this.scroll = callback;
      return () => {
        if (this.scroll === callback) {
          this.scroll = null;
        }
      };
    }

    triggerInput(data: string) {
      this.input?.(data);
    }

    triggerScroll(lines: number) {
      this.scroll?.(lines);
    }
  }

  return { GhosttyRenderer: FakeGhosttyRenderer };
});

const nativeResumeHandlers = new Set<() => void>();
vi.mock("./native", () => ({
  addNativeResumeHandler: (handler: () => void) => {
    nativeResumeHandlers.add(handler);
    return () => nativeResumeHandlers.delete(handler);
  },
}));

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readonly sent: unknown[] = [];
  closeCalls = 0;
  binaryType = "blob";
  readyState = FakeWebSocket.CONNECTING;
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

  removeEventListener(type: string, listener: (event: Event) => void) {
    this.listeners.get(type)?.delete(listener);
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

  error() {
    this.emit("error");
  }

  private emit(type: string, event: Event = new Event(type)) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener(event);
    }
  }
}

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  constructor(private readonly callback: () => void) {
    FakeResizeObserver.instances.push(this);
  }
  observe() {}
  disconnect() {}
  trigger() {
    this.callback();
  }
}

const roots: Root[] = [];

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.stubGlobal("WebSocket", FakeWebSocket);
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  FakeWebSocket.instances = [];
  FakeResizeObserver.instances = [];
  rendererInstances().length = 0;
  nativeResumeHandlers.clear();
});

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) {
      root.unmount();
    }
  });
  document.body.innerHTML = "";
  nativeResumeHandlers.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("TerminalView production lifecycle characterization", () => {
  it("attaches with the qualified terminal, measured size, takeover policy, and output coalescing", async () => {
    const { container } = await renderTerminal({ terminalOutputCoalesceMs: 64 });
    const socket = onlySocket();
    const query = new URL(socket.url).searchParams;

    expect(query.get("terminal_id")).toBe("terminal-a");
    expect(query.get("cols")).toBe("87");
    expect(query.get("rows")).toBe("29");
    expect(query.get("takeover")).toBe("false");
    expect(query.get("coalesce_ms")).toBe("64");
    expect(container.querySelector(".terminal-host canvas")).not.toBeNull();

    await act(async () => socket.open());
    expect(sentJson(socket)).toContainEqual({ type: "resize", cols: 87, rows: 29 });
  });

  it("delivers ArrayBuffer and Blob output through the production renderer path", async () => {
    await renderTerminal();
    const socket = onlySocket();
    const renderer = onlyRenderer();
    await act(async () => socket.open());

    await act(async () => {
      socket.message(new Uint8Array([1, 2, 3]).buffer);
      socket.message(new Blob([new Uint8Array([4, 5, 6])]));
      await Promise.resolve();
    });

    expect(renderer.writes).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
  });

  it("preserves JSON and binary input modes and independently gates resize and scroll", async () => {
    const { root } = await renderTerminal({
      terminalInputTransport: "json",
      resizeEnabled: false,
      scrollEnabled: false,
    });
    const socket = onlySocket();
    const renderer = onlyRenderer();
    await act(async () => socket.open());

    renderer.triggerInput("echo json");
    renderer.triggerScroll(-4);
    expect(sentJson(socket)).toContainEqual({ type: "input", data: "echo json" });
    expect(sentJson(socket)).not.toContainEqual({ type: "scroll", direction: "up", lines: 4 });
    expect(sentJson(socket)).not.toContainEqual({ type: "resize", cols: 87, rows: 29 });

    await act(async () => {
      root.render(
        <TerminalView
          {...terminalProps}
          terminalInputTransport="binary"
          resizeEnabled
          scrollEnabled
          refitToken={1}
        />,
      );
    });
    renderer.triggerInput("echo binary");
    renderer.triggerScroll(-4);

    expect(sentJson(socket)).toContainEqual({ type: "resize", cols: 91, rows: 31 });
    expect(sentJson(socket)).toContainEqual({ type: "scroll", direction: "up", lines: 4 });
    expect(socket.sent).toContainEqual(new TextEncoder().encode("echo binary"));
    expect(socket.sent).not.toContainEqual(JSON.stringify({ type: "input", data: "echo binary" }));
  });

  it("reconnects after unexpected close and error, but cancels the pending reconnect on unmount", async () => {
    const { root } = await renderTerminal();
    const first = onlySocket();
    await act(async () => first.open());

    first.serverClose();
    await advance(499);
    expect(FakeWebSocket.instances).toHaveLength(1);
    await advance(1);
    expect(FakeWebSocket.instances).toHaveLength(2);
    const second = FakeWebSocket.instances[1];
    await act(async () => second.open());

    second.error();
    await advance(500);
    expect(FakeWebSocket.instances).toHaveLength(3);

    FakeWebSocket.instances[2].serverClose();
    await act(async () => root.unmount());
    await advance(5000);
    expect(FakeWebSocket.instances).toHaveLength(3);
  });

  it("replaces a socket after the bounded connect timeout", async () => {
    await renderTerminal();
    const first = onlySocket();

    await advance(3499);
    expect(FakeWebSocket.instances).toHaveLength(1);
    await advance(1);
    expect(first.closeCalls).toBe(1);
    expect(FakeWebSocket.instances).toHaveLength(1);
    await advance(500);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it("coalesces online, visibility, and native-resume recovery into one foreground reconnect", async () => {
    await renderTerminal();
    const first = onlySocket();
    await act(async () => first.open());
    first.serverClose();

    await act(async () => {
      window.dispatchEvent(new Event("online"));
      document.dispatchEvent(new Event("visibilitychange"));
      for (const handler of nativeResumeHandlers) {
        handler();
      }
    });

    expect(FakeWebSocket.instances).toHaveLength(2);
    const foreground = FakeWebSocket.instances[1];
    await advance(399);
    expect(FakeWebSocket.instances).toHaveLength(2);
    await act(async () => foreground.open());
    expect(sentJson(foreground)).toContainEqual({ type: "resize", cols: 87, rows: 29 });
  });

  it("stops on non-retryable close reasons and retains the attach-conflict retry budget", async () => {
    await renderTerminal();
    const first = onlySocket();
    await act(async () => first.open());
    first.message(JSON.stringify({ type: "closed", reason: "terminal attach taken over" }));
    first.serverClose();
    await advance(5000);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(document.querySelector(".terminal-overlay")?.textContent).toBe("Detached elsewhere");

    await act(async () => {
      onlyRenderer().triggerInput("must not be sent");
    });
    expect(FakeWebSocket.instances[0].sent).toEqual(
      [{ type: "resize", cols: 87, rows: 29 }].map((value) => JSON.stringify(value)),
    );
  });

  it("retries attach conflicts three times, then exposes the final external attach", async () => {
    await renderTerminal();
    let socket = onlySocket();
    await act(async () => socket.open());

    for (const delay of [500, 1000, 2000]) {
      socket.message(
        JSON.stringify({
          type: "closed",
          reason: "terminal attach failed: terminal abc already has an attached client",
        }),
      );
      socket.serverClose();
      await advance(delay);
      socket = FakeWebSocket.instances.at(-1)!;
      await act(async () => socket.open());
    }

    socket.message(
      JSON.stringify({
        type: "closed",
        reason: "terminal attach failed: terminal abc already has an attached client",
      }),
    );
    socket.serverClose();
    await advance(5000);

    expect(FakeWebSocket.instances).toHaveLength(4);
    expect(document.querySelector(".terminal-overlay")?.textContent).toBe("Attached elsewhere");
  });

  it("does not steal focus from a control that focused while attach was pending", async () => {
    const control = document.createElement("button");
    control.textContent = "Keep focus";
    document.body.append(control);
    control.focus();
    await renderTerminal({ autoFocus: true });
    const socket = onlySocket();

    const otherControl = document.createElement("button");
    otherControl.textContent = "New focus owner";
    document.body.append(otherControl);
    otherControl.focus();
    await act(async () => socket.open());
    await advance(0);

    expect(document.activeElement).toBe(otherControl);
    expect(onlyRenderer().focusCalls).toBe(0);
  });

  it("closes only the browser transport on unmount and never sends a pane-close command", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const httpUrl = vi.fn((path: string) => `http://bridge.test${path}`);
    const { root } = await renderTerminal({ httpUrl });
    const socket = onlySocket();
    await act(async () => socket.open());

    await act(async () => root.unmount());

    expect(socket.closeCalls).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(socket.sent.some((value) => String(value).includes("pane.close"))).toBe(false);
  });

  it("keeps primary and split terminal views isolated by bridge and terminal identity", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    await act(async () => {
      root.render(
        <>
          <TerminalView
            {...terminalProps}
            pane={pane("terminal-same")}
            connectionKey="bridge-a-generation:terminal-same"
            wsUrl={wsUrlFor("bridge-a")}
            accessibilityLabel="Bridge A terminal"
          />
          <TerminalView
            {...terminalProps}
            pane={pane("terminal-same")}
            connectionKey="bridge-b-generation:terminal-same"
            wsUrl={wsUrlFor("bridge-b")}
            accessibilityLabel="Bridge B terminal"
          />
        </>,
      );
      await Promise.resolve();
    });

    expect(FakeWebSocket.instances).toHaveLength(2);
    const [socketA, socketB] = FakeWebSocket.instances;
    expect(new URL(socketA.url).hostname).toBe("bridge-a.test");
    expect(new URL(socketB.url).hostname).toBe("bridge-b.test");
    const [rendererA, rendererB] = rendererInstances();
    await act(async () => {
      socketA.open();
      socketB.open();
      socketA.message(new Uint8Array([10]).buffer);
      socketB.message(new Uint8Array([20]).buffer);
    });
    expect(rendererA.writes).toEqual([[10]]);
    expect(rendererB.writes).toEqual([[20]]);
  });

  it("releases an Office conversation view without issuing a Herdr pane-close", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { root } = await renderConversationBubble();
    const socket = onlySocket();
    await act(async () => socket.open());

    await act(async () => {
      document.querySelector<HTMLButtonElement>("[aria-label='Close agent conversation']")?.click();
    });

    expect(socket.closeCalls).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(document.querySelector("[data-world-conversation='open']")).toBeNull();
    expect(root).toBeDefined();
  });
});

const terminalProps = {
  pane: pane("terminal-a"),
  connectionKey: "bridge-a-generation:terminal-a",
  resumeToken: 0,
  httpUrl: (path: string) => `http://bridge-a.test${path}`,
  wsUrl: wsUrlFor("bridge-a"),
} satisfies ComponentProps<typeof TerminalView>;

function wsUrlFor(host: string) {
  return (path: string, query?: URLSearchParams) =>
    `ws://${host}.test${path}${query?.toString() ? `?${query}` : ""}`;
}

function pane(terminalId: string): PaneInfo {
  return {
    pane_id: `${terminalId}-pane`,
    terminal_id: terminalId,
    workspace_id: "workspace-a",
    tab_id: "tab-a",
    focused: true,
    agent_status: "working",
    revision: 1,
  };
}

async function renderTerminal(overrides: Partial<ComponentProps<typeof TerminalView>> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(<TerminalView {...terminalProps} {...overrides} />);
    await Promise.resolve();
    await Promise.resolve();
  });
  return { container, root };
}

async function renderConversationBubble() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(<ConversationHarness />);
    await Promise.resolve();
    await Promise.resolve();
  });
  return { container, root };
}

function ConversationHarness() {
  const [open, setOpen] = useState(true);
  if (!open) {
    return null;
  }
  const runtime = testRuntime();
  const session: TerminalSessionDescriptor = {
    profileId: runtime.id,
    connectionKey: runtime.generationKey,
    terminalId: "terminal-a",
    sessionKey: `${runtime.generationKey}:terminal-a`,
    attachEnabled: true,
    inputEnabled: true,
    resizeEnabled: true,
    scrollEnabled: true,
    uploadEnabled: true,
  };
  return (
    <WorldConversationBubble
      agent={testAgent()}
      targetLabel="Codex"
      hostLabel="Bridge A"
      pane={pane("terminal-a")}
      runtime={runtime}
      session={session}
      onClose={() => setOpen(false)}
      onOpenInSpaces={() => {}}
      touchInput={false}
      terminalFontSizePx={14}
      terminalScreenReaderText={false}
      mobileControlsScalePercent={100}
      mobileTapTarget="command-input"
      mobileLongPressBehavior="off"
      mobileTouchSelectionEndpointTimeoutMs={1500}
      mobileCommandExpandingInput={false}
      mobileCommandEnterNewline={false}
      terminalInputTransport="json"
      terminalInputBatchDelayMs={0}
      terminalOutputCoalesceMs={16}
      agentActivityTransitions={new Map()}
    />
  );
}

function testRuntime(): BridgeRuntime {
  return {
    id: "bridge-a",
    mode: "configured",
    label: "Bridge A",
    color: "#fff",
    backend: null,
    connectionKey: "bridge-a-generation",
    capabilityGeneration: 1,
    generationKey: "bridge-a-generation",
    resumeToken: 0,
    capabilities: {
      bridge_api_version: 1,
      herdr_version: "0.8.2",
      terminal_protocol: 20,
      features: ["snapshot", "terminal_attach"],
      commands: [],
    },
    capabilityState: "ready",
    capabilityError: null,
    canConnect: true,
    httpUrl: terminalProps.httpUrl,
    wsUrl: terminalProps.wsUrl,
  };
}

function testAgent(): OfficeAgent {
  return {
    key: "bridge-a:terminal:terminal-a",
    currentPaneRef: { profileId: "bridge-a", kind: "pane", nativeTargetId: "terminal-a-pane" },
    currentTerminalRef: { profileId: "bridge-a", kind: "terminal", nativeTargetId: "terminal-a" },
    currentTabRef: { profileId: "bridge-a", kind: "tab", nativeTargetId: "tab-a" },
    deskKey: "bridge-a:tab:tab-a",
    observedGeneration: "bridge-a-generation",
    roomKey: "bridge-a:workspace:workspace-a",
    hostKey: "bridge-a",
    displayLabel: "Codex",
    semanticStatus: "working",
    stateLabels: {},
    focused: true,
    destination: "room",
    placement: "seated",
    stale: false,
    canOpenInSpaces: true,
    characterIndex: 0,
  };
}

function onlySocket() {
  expect(FakeWebSocket.instances).toHaveLength(1);
  return FakeWebSocket.instances[0];
}

function onlyRenderer() {
  expect(rendererInstances()).toHaveLength(1);
  return rendererInstances()[0];
}

function sentJson(socket: FakeWebSocket) {
  return socket.sent.flatMap((value) => {
    if (typeof value !== "string") {
      return [];
    }
    try {
      return [JSON.parse(value) as unknown];
    } catch {
      return [];
    }
  });
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}
