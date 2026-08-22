import type { BridgeRuntime } from "./bridge";
import type {
  QualifiedSurfaceTarget,
  TerminalHandle,
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
  let opening: Promise<void> | null = null;

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
      return opening;
    }
    const next = new WebSocket(terminalSocketUrl(runtime, target.nativeTargetId));
    next.binaryType = "arraybuffer";
    socket = next;
    opening = new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        next.removeEventListener("error", onError);
        resolve();
      };
      const onError = () => {
        next.removeEventListener("open", onOpen);
        if (socket === next) {
          socket = null;
        }
        reject(new Error("Terminal attach failed"));
      };
      next.addEventListener("open", onOpen, { once: true });
      next.addEventListener("error", onError, { once: true });
    }).finally(() => {
      opening = null;
    });
    await opening;
  };

  const detach = () => {
    const current = socket;
    socket = null;
    opening = null;
    current?.close();
  };

  return {
    key: JSON.stringify([target.bridgeId, target.nativeTargetId]),
    target,
    attach,
    input: (value) => ensureSocket().send(JSON.stringify({ type: "input", data: value })),
    resize: (columns, rows) =>
      ensureSocket().send(JSON.stringify({ type: "resize", cols: columns, rows })),
    scroll: (direction, lines = 1) =>
      ensureSocket().send(JSON.stringify({ type: "scroll", direction, lines })),
    focus: () => {
      // Focus ownership belongs to the renderer using this handle.
    },
    detach,
    release: detach,
  };
}
