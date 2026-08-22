import type { BridgeRuntime } from "./bridge";
import type {
  QualifiedSurfaceTarget,
  TerminalHandle,
  TerminalOutputListener,
} from "@herdr-world/foundation/surfaces";

function terminalSocketUrl(runtime: BridgeRuntime, terminalId: string) {
  const query = new URLSearchParams({
    terminal_id: terminalId,
    cols: "80",
    rows: "24",
    takeover: "false",
    coalesce_ms: "0",
  });
  return runtime.wsUrl("/ws/terminal", query);
}

/**
 * Least-purpose host transport for Foundation-owned terminal handles. The
 * renderer remains responsible for pixels; this adapter owns only the
 * attach/input/resize/scroll socket and always releases by detach/close.
 */
export function createSurfaceTerminalHandle(
  runtime: BridgeRuntime,
  target: QualifiedSurfaceTarget,
): TerminalHandle {
  let socket: WebSocket | null = null;
  let opening: {
    promise: Promise<void>;
    cancel: () => void;
    socket: WebSocket;
  } | null = null;
  const listeners = new Set<TerminalOutputListener>();

  const ensureSocket = () => {
    if (socket?.readyState === WebSocket.OPEN) {
      return socket;
    }
    throw new Error("Terminal handle is not attached");
  };

  const attach = async () => {
    if (socket?.readyState === WebSocket.OPEN) {
      return;
    }
    if (opening) {
      return opening.promise;
    }
    const next = new WebSocket(terminalSocketUrl(runtime, target.nativeTargetId));
    next.binaryType = "arraybuffer";
    const onMessage = (event: MessageEvent) => {
      if (socket !== next) {
        return;
      }
      if (event.data instanceof ArrayBuffer) {
        const output = new Uint8Array(event.data);
        for (const listener of listeners) {
          listener(output);
        }
        return;
      }
      if (event.data instanceof Blob) {
        void event.data.arrayBuffer().then((buffer) => {
          if (socket !== next) {
            return;
          }
          const output = new Uint8Array(buffer);
          for (const listener of listeners) {
            listener(output);
          }
        });
      }
    };
    next.addEventListener("message", onMessage);
    socket = next;
    let settleCancel: (() => void) | null = null;
    const promise = new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        next.removeEventListener("open", onOpen);
        next.removeEventListener("error", onError);
        next.removeEventListener("close", onClose);
      };
      const fail = (message: string) => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        if (socket === next) {
          socket = null;
        }
      if (opening?.socket === next) {
        opening = null;
      }
      next.removeEventListener("message", onMessage);
      reject(new Error(message));
      };
      const onOpen = () => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        if (opening?.socket === next) {
          opening = null;
        }
        resolve();
      };
      const onError = () => {
        fail("Terminal attach failed");
      };
      const onClose = () => {
        fail("Terminal attach closed before opening");
      };
      next.addEventListener("open", onOpen, { once: true });
      next.addEventListener("error", onError, { once: true });
      next.addEventListener("close", onClose, { once: true });
      settleCancel = () => fail("Terminal attach cancelled");
    });
    const pending = {
      promise,
      cancel: () => settleCancel?.(),
      socket: next,
    };
    opening = pending;
    try {
      await promise;
    } finally {
      if (opening === pending) {
        opening = null;
      }
      settleCancel = null;
    }
  };

  const detach = () => {
    const current = socket;
    opening?.cancel();
    opening = null;
    socket = null;
    current?.close();
    listeners.clear();
  };

  return {
    key: JSON.stringify([target.bridgeId, target.nativeTargetId]),
    target,
    attach,
    input: (value) => {
      const current = ensureSocket();
      current.send(
        typeof value === "string" ? JSON.stringify({ type: "input", data: value }) : value,
      );
    },
    resize: (columns, rows) =>
      ensureSocket().send(JSON.stringify({ type: "resize", cols: columns, rows })),
    scroll: (direction, lines = 1) =>
      ensureSocket().send(JSON.stringify({ type: "scroll", direction, lines })),
    focus: () => {
      // Focus ownership belongs to the renderer using this handle.
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    detach,
    release: detach,
  };
}
