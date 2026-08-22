import { addNativeResumeHandler } from "./native";
import {
  isNonRetryableTerminalClose,
  isTerminalAttachConflictClose,
  MAX_TERMINAL_ATTACH_CONFLICT_RETRIES,
  parseTerminalCloseReason,
} from "./terminalConnectionStatus";
import type { TerminalConnectionState } from "./terminalConnectionStatus";
import {
  TERMINAL_FOREGROUND_FAST_ATTEMPTS,
  TERMINAL_FOREGROUND_CONNECT_TIMEOUT_MS,
  TERMINAL_FOREGROUND_SIGNAL_COALESCE_MS,
  terminalReconnectPolicy,
} from "./terminalReconnectPolicy";
import type { TerminalReconnectMode } from "./terminalReconnectPolicy";
import type { TerminalSize } from "./terminalRenderer";
import type { TerminalInputTransport } from "./terminalInputTransport";

/**
 * Late subscribers receive complete output frames from the current attach
 * epoch while the bounded replay remains a coherent prefix of that epoch. The
 * bridge protocol does not expose a serialized terminal snapshot. If either
 * bound would evict the prefix, the owner discards replay and reconnects so a
 * fresh attach can repaint the stateful ANSI stream; it never replays a raw
 * suffix from the middle of an escape or terminal-state sequence.
 */
export const TERMINAL_SESSION_REPLAY_MAX_BYTES = 64 * 1024;
export const TERMINAL_SESSION_REPLAY_MAX_FRAMES = 256;

export type TerminalSessionOwnerIdentity = {
  profileId: string;
  connectionKey: string;
  terminalId: string;
};

export type TerminalSessionOwnerState = {
  connectionState: TerminalConnectionState;
  closeReason: string | null;
  hasAttachedForTerminal: boolean;
};

export type TerminalSessionOwnerAcquireOptions = TerminalSessionOwnerIdentity & {
  wsUrl: (path: string, query?: URLSearchParams) => string;
  outputCoalesceMs: number;
  initialSize: TerminalSize;
  inputEnabled: boolean;
  resizeEnabled: boolean;
  scrollEnabled: boolean;
  focusOwner: boolean;
  onOutput: (data: Uint8Array) => void;
  onState: (state: TerminalSessionOwnerState) => void;
  onConnectAttempt: () => void;
};

export type TerminalSessionHandle = {
  updateAdmission(inputEnabled: boolean, resizeEnabled: boolean, scrollEnabled: boolean): void;
  setFocusOwner(wantsFocus: boolean): void;
  reportSize(size: TerminalSize): void;
  sendInput(data: string, transport: TerminalInputTransport): boolean;
  sendScroll(lines: number): boolean;
  requestReconnect(): void;
  release(): void;
};

type Subscriber = {
  id: number;
  sequence: number;
  inputEnabled: boolean;
  resizeEnabled: boolean;
  scrollEnabled: boolean;
  wantsFocus: boolean;
  lastSize: TerminalSize;
  onOutput: (data: Uint8Array) => void;
  onState: (state: TerminalSessionOwnerState) => void;
  onConnectAttempt: () => void;
};

type ReconnectReason =
  | "initial"
  | "close"
  | "error"
  | "stalled"
  | "resume"
  | "visible"
  | "online"
  | "resize"
  | "replay-overflow"
  | "manual";

const DEBUG_TERMINAL_RECONNECT = false;

export function terminalSessionOwnerKey(identity: TerminalSessionOwnerIdentity) {
  return JSON.stringify([identity.profileId, identity.connectionKey, identity.terminalId]);
}

export class TerminalSessionOwnerRegistry {
  #owners = new Map<string, TerminalSessionOwner>();

  acquire(options: TerminalSessionOwnerAcquireOptions): TerminalSessionHandle {
    const key = terminalSessionOwnerKey(options);
    let owner = this.#owners.get(key);
    if (!owner) {
      owner = new TerminalSessionOwner(options, () => {
        if (this.#owners.get(key) === owner) {
          this.#owners.delete(key);
        }
      });
      this.#owners.set(key, owner);
    }
    return owner.acquire(options);
  }

  disposeAll() {
    for (const owner of this.#owners.values()) {
      owner.disposeWhenUnused();
    }
    this.#owners.clear();
  }

  get size() {
    return this.#owners.size;
  }
}

export const terminalSessionOwners = new TerminalSessionOwnerRegistry();

class TerminalSessionOwner {
  readonly #identity: TerminalSessionOwnerIdentity;
  readonly #remove: () => void;
  readonly #subscribers = new Map<number, Subscriber>();
  readonly #replay: Uint8Array[] = [];
  #replayBytes = 0;
  #nextSubscriberId = 1;
  #nextSequence = 1;
  #focusedSubscriberId: number | null = null;
  #state: TerminalConnectionState = "idle";
  #closeReason: string | null = null;
  #hasAttachedForTerminal = false;
  #attachEpoch = 0;
  #replayEpoch = 0;
  #replayComplete = false;
  #wsUrl: TerminalSessionOwnerAcquireOptions["wsUrl"];
  #outputCoalesceMs: number;
  #socket: WebSocket | null = null;
  #socketGeneration = 0;
  #socketStartedAt = 0;
  #reconnectTimer: number | null = null;
  #connectTimer: number | null = null;
  #foregroundCoalesceTimer: number | null = null;
  #reconnectAttempts = 0;
  #foregroundFastAttemptsRemaining = 0;
  #attachConflictRetries = 0;
  #lastForegroundReconnectAt = Number.NEGATIVE_INFINITY;
  #reconnectStopped = false;
  #transportStarted = false;
  #removeNativeResumeHandler: (() => void) | null = null;
  #pendingForegroundReasons = new Set<ReconnectReason>();
  #reconnectScheduledForSocket: number | null = null;
  #disposed = false;

  constructor(options: TerminalSessionOwnerAcquireOptions, remove: () => void) {
    this.#identity = {
      profileId: options.profileId,
      connectionKey: options.connectionKey,
      terminalId: options.terminalId,
    };
    this.#remove = remove;
    this.#wsUrl = options.wsUrl;
    this.#outputCoalesceMs = options.outputCoalesceMs;
  }

  acquire(options: TerminalSessionOwnerAcquireOptions): TerminalSessionHandle {
    if (this.#disposed) {
      throw new Error("terminal session owner is disposed");
    }
    this.#wsUrl = options.wsUrl;
    this.#outputCoalesceMs = options.outputCoalesceMs;
    const subscriber: Subscriber = {
      id: this.#nextSubscriberId++,
      sequence: this.#nextSequence++,
      inputEnabled: options.inputEnabled,
      resizeEnabled: options.resizeEnabled,
      scrollEnabled: options.scrollEnabled,
      wantsFocus: options.focusOwner,
      lastSize: options.initialSize,
      onOutput: options.onOutput,
      onState: options.onState,
      onConnectAttempt: options.onConnectAttempt,
    };
    this.#subscribers.set(subscriber.id, subscriber);
    if (this.#focusedSubscriberId === null || options.focusOwner) {
      this.#setFocusedSubscriber(subscriber.id);
    }
    if (this.#state === "idle") {
      this.#setState("connecting");
    } else {
      this.#notifyState(subscriber);
    }
    this.#replayTo(subscriber);
    this.#startTransport();

    let released = false;
    return {
      updateAdmission: (inputEnabled, resizeEnabled, scrollEnabled) => {
        if (released) {
          return;
        }
        subscriber.inputEnabled = inputEnabled;
        subscriber.resizeEnabled = resizeEnabled;
        subscriber.scrollEnabled = scrollEnabled;
        if (!resizeEnabled && this.#focusedSubscriberId === subscriber.id) {
          this.#transferFocus(subscriber.id);
        } else if (resizeEnabled && this.#focusedSubscriberId === null && subscriber.wantsFocus) {
          this.#setFocusedSubscriber(subscriber.id);
        }
      },
      setFocusOwner: (wantsFocus) => {
        if (released) {
          return;
        }
        subscriber.wantsFocus = wantsFocus;
        if (wantsFocus) {
          this.#setFocusedSubscriber(subscriber.id);
        } else if (this.#focusedSubscriberId === subscriber.id) {
          this.#transferFocus(subscriber.id);
        }
      },
      reportSize: (size) => {
        if (released) {
          return;
        }
        subscriber.lastSize = size;
        if (this.#focusedSubscriberId === subscriber.id) {
          this.#sendResize(subscriber, size);
        }
      },
      sendInput: (data, transport) => {
        if (released || !subscriber.inputEnabled || this.#reconnectStopped) {
          return false;
        }
        const socket = this.#socket;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          return false;
        }
        if (transport === "binary") {
          socket.send(new TextEncoder().encode(data));
        } else {
          socket.send(JSON.stringify({ type: "input", data }));
        }
        return true;
      },
      sendScroll: (lines) => {
        if (released || !subscriber.scrollEnabled || this.#reconnectStopped) {
          return false;
        }
        const socket = this.#socket;
        if (!socket || socket.readyState !== WebSocket.OPEN || lines === 0) {
          return false;
        }
        socket.send(
          JSON.stringify({
            type: "scroll",
            direction: lines < 0 ? "up" : "down",
            lines: Math.min(Math.abs(lines), 200),
          }),
        );
        return true;
      },
      requestReconnect: () => {
        if (!released) {
          this.#requestReconnect("resume");
        }
      },
      release: () => {
        if (released) {
          return;
        }
        released = true;
        this.#release(subscriber.id);
      },
    };
  }

  disposeWhenUnused() {
    if (this.#subscribers.size === 0) {
      this.#shutdown();
    }
  }

  #release(subscriberId: number) {
    const wasFocused = this.#focusedSubscriberId === subscriberId;
    this.#subscribers.delete(subscriberId);
    if (wasFocused) {
      this.#transferFocus(subscriberId);
    }
    if (this.#subscribers.size === 0) {
      this.#shutdown();
    }
  }

  #transferFocus(excludedSubscriberId: number) {
    const candidates = [...this.#subscribers.values()]
      .filter(({ id, resizeEnabled }) => id !== excludedSubscriberId && resizeEnabled)
      .sort((left, right) => left.sequence - right.sequence);
    const next = candidates.find(({ wantsFocus }) => wantsFocus) ?? candidates[0] ?? null;
    this.#focusedSubscriberId = next?.id ?? null;
    if (next) {
      this.#sendResize(next, next.lastSize);
    }
  }

  #setFocusedSubscriber(subscriberId: number) {
    const subscriber = this.#subscribers.get(subscriberId);
    if (!subscriber || !subscriber.resizeEnabled) {
      this.#transferFocus(subscriberId);
      return;
    }
    this.#focusedSubscriberId = subscriberId;
    this.#sendResize(subscriber, subscriber.lastSize);
  }

  #startTransport() {
    if (this.#transportStarted) {
      return;
    }
    this.#transportStarted = true;
    this.#removeNativeResumeHandler = addNativeResumeHandler(() => this.#requestReconnect("resume"));
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        this.#requestReconnect("visible");
      }
    };
    const handleOnline = () => this.#requestReconnect("online");
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("online", handleOnline);
    this.#removeNativeResumeHandler = combineCleanup(
      this.#removeNativeResumeHandler,
      () => document.removeEventListener("visibilitychange", handleVisibilityChange),
      () => window.removeEventListener("online", handleOnline),
    );
    this.#requestReconnect("initial");
  }

  #shutdown() {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#removeNativeResumeHandler?.();
    this.#removeNativeResumeHandler = null;
    this.#clearReconnectTimer();
    this.#clearConnectTimer();
    this.#clearForegroundCoalesceTimer();
    this.#closeActiveSocket();
    this.#subscribers.clear();
    this.#clearReplay(false);
    this.#pendingForegroundReasons.clear();
    this.#reconnectScheduledForSocket = null;
    this.#remove();
  }

  #stateSnapshot(): TerminalSessionOwnerState {
    return {
      connectionState: this.#state,
      closeReason: this.#closeReason,
      hasAttachedForTerminal: this.#hasAttachedForTerminal,
    };
  }

  #notifyState(subscriber: Subscriber) {
    try {
      subscriber.onState(this.#stateSnapshot());
    } catch (error) {
      console.warn("terminal session state subscriber failed", error);
    }
  }

  #notifyAllState() {
    for (const subscriber of [...this.#subscribers.values()]) {
      this.#notifyState(subscriber);
    }
  }

  #setState(state: TerminalConnectionState) {
    this.#state = state;
    this.#notifyAllState();
  }

  #replayTo(subscriber: Subscriber) {
    if (!this.#replayComplete || this.#replayEpoch !== this.#attachEpoch) {
      return;
    }
    for (const frame of this.#replay) {
      try {
        subscriber.onOutput(frame.slice());
      } catch (error) {
        console.warn("terminal session output subscriber failed", error);
      }
    }
  }

  #publishOutput(socketId: number, socket: WebSocket, data: Uint8Array) {
    if (
      this.#disposed ||
      this.#socket !== socket ||
      this.#socketGeneration !== socketId ||
      this.#subscribers.size === 0 ||
      !this.#replayComplete ||
      this.#replayEpoch !== this.#attachEpoch
    ) {
      return;
    }
    const frame = data.slice();
    if (
      this.#replay.length >= TERMINAL_SESSION_REPLAY_MAX_FRAMES ||
      this.#replayBytes + frame.byteLength > TERMINAL_SESSION_REPLAY_MAX_BYTES
    ) {
      this.#invalidateReplayAndReconnect(socketId, socket);
      return;
    }
    this.#replay.push(frame);
    this.#replayBytes += frame.byteLength;
    for (const subscriber of [...this.#subscribers.values()]) {
      try {
        subscriber.onOutput(frame.slice());
      } catch (error) {
        console.warn("terminal session output subscriber failed", error);
      }
    }
  }

  #sendResize(subscriber: Subscriber, size: TerminalSize) {
    if (!subscriber.resizeEnabled || this.#socket?.readyState !== WebSocket.OPEN) {
      return;
    }
    this.#socket.send(JSON.stringify({ type: "resize", cols: size.cols, rows: size.rows }));
  }

  #debug(event: string, details: Record<string, unknown> = {}) {
    if (DEBUG_TERMINAL_RECONNECT) {
      console.debug("terminal reconnect:", event, {
        profileId: this.#identity.profileId,
        connectionKey: this.#identity.connectionKey,
        terminalId: this.#identity.terminalId,
        ...details,
      });
    }
  }

  #clearReconnectTimer() {
    if (this.#reconnectTimer !== null) {
      window.clearTimeout(this.#reconnectTimer);
      this.#reconnectTimer = null;
    }
  }

  #clearConnectTimer() {
    if (this.#connectTimer !== null) {
      window.clearTimeout(this.#connectTimer);
      this.#connectTimer = null;
    }
  }

  #clearForegroundCoalesceTimer() {
    if (this.#foregroundCoalesceTimer !== null) {
      window.clearTimeout(this.#foregroundCoalesceTimer);
      this.#foregroundCoalesceTimer = null;
    }
  }

  #closeActiveSocket() {
    const socket = this.#socket;
    this.#socket = null;
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.close();
    }
  }

  #clearReplay(complete: boolean) {
    this.#replay.length = 0;
    this.#replayBytes = 0;
    this.#replayComplete = complete;
  }

  #beginAttachEpoch() {
    this.#attachEpoch += 1;
    this.#replayEpoch = this.#attachEpoch;
    this.#clearReplay(false);
    return this.#attachEpoch;
  }

  #invalidateReplayForReconnect() {
    this.#clearReplay(false);
  }

  #invalidateReplayAndReconnect(socketId: number, socket: WebSocket) {
    if (
      this.#disposed ||
      this.#socket !== socket ||
      this.#socketGeneration !== socketId
    ) {
      return;
    }
    this.#debug("replay-overflow", {
      socketGeneration: socketId,
      replayBytes: this.#replayBytes,
      replayFrames: this.#replay.length,
    });
    this.#invalidateReplayForReconnect();
    this.#clearConnectTimer();
    this.#socket = null;
    socket.close();
    this.#scheduleSocketReconnect("replay-overflow", socketId);
  }

  #connectSocket(reason: ReconnectReason, connectTimeoutMs: number) {
    if (this.#disposed || this.#reconnectStopped || this.#subscribers.size === 0) {
      return;
    }
    this.#clearConnectTimer();
    const focused = this.#focusedSubscriberId
      ? this.#subscribers.get(this.#focusedSubscriberId)
      : null;
    const initialSize = focused?.lastSize ?? [...this.#subscribers.values()][0]?.lastSize;
    if (!initialSize) {
      this.#scheduleReconnect("resize");
      return;
    }
    if (this.#socket) {
      this.#closeActiveSocket();
    }
    for (const subscriber of [...this.#subscribers.values()]) {
      try {
        subscriber.onConnectAttempt();
      } catch (error) {
        console.warn("terminal session connect-attempt subscriber failed", error);
      }
    }
    const params = new URLSearchParams({
      terminal_id: this.#identity.terminalId,
      cols: String(initialSize.cols),
      rows: String(initialSize.rows),
      takeover: "false",
      coalesce_ms: String(this.#outputCoalesceMs),
    });
    const socketId = this.#socketGeneration + 1;
    this.#socketGeneration = socketId;
    const attachEpoch = this.#beginAttachEpoch();
    const socket = new WebSocket(this.#wsUrl("/ws/terminal", params));
    this.#socket = socket;
    socket.binaryType = "arraybuffer";
    this.#socketStartedAt = performance.now();
    this.#setState("connecting");
    this.#debug("connect_start", { reason, socketGeneration: socketId, connectTimeoutMs });
    this.#connectTimer = window.setTimeout(
      () => this.#retryStalledConnect(socket, socketId),
      connectTimeoutMs,
    );

    socket.addEventListener("open", () => {
      if (this.#disposed || this.#socket !== socket || this.#socketGeneration !== socketId) {
        return;
      }
      this.#clearConnectTimer();
      this.#clearReconnectTimer();
      this.#reconnectAttempts = 0;
      this.#foregroundFastAttemptsRemaining = 0;
      this.#reconnectScheduledForSocket = null;
      this.#closeReason = null;
      this.#hasAttachedForTerminal = true;
      this.#reconnectStopped = false;
      this.#replayComplete = this.#replayEpoch === attachEpoch;
      this.#setState("attached");
      this.#debug("open", { socketGeneration: socketId });
      const currentFocus = this.#focusedSubscriberId
        ? this.#subscribers.get(this.#focusedSubscriberId)
        : null;
      if (currentFocus) {
        this.#sendResize(currentFocus, currentFocus.lastSize);
      }
    });
    socket.addEventListener("message", (event) => {
      if (this.#disposed || this.#socket !== socket || this.#socketGeneration !== socketId) {
        return;
      }
      if (typeof event.data === "string") {
        this.#closeReason = parseTerminalCloseReason(event.data) ?? this.#closeReason;
        return;
      }
      if (event.data instanceof ArrayBuffer) {
        this.#attachConflictRetries = 0;
        this.#publishOutput(socketId, socket, new Uint8Array(event.data));
        return;
      }
      if (event.data instanceof Blob) {
        this.#attachConflictRetries = 0;
        void event.data.arrayBuffer().then((buffer) => {
          this.#publishOutput(socketId, socket, new Uint8Array(buffer));
        });
      }
    });
    socket.addEventListener("close", () => {
      if (this.#disposed || this.#socket !== socket || this.#socketGeneration !== socketId) {
        return;
      }
      this.#clearConnectTimer();
      this.#socket = null;
      this.#invalidateReplayForReconnect();
      if (isTerminalAttachConflictClose(this.#closeReason) &&
          this.#attachConflictRetries < MAX_TERMINAL_ATTACH_CONFLICT_RETRIES) {
        this.#attachConflictRetries += 1;
        this.#debug("attach-conflict-retry", { attempt: this.#attachConflictRetries });
        this.#scheduleSocketReconnect("close", socketId);
        return;
      }
      if (isNonRetryableTerminalClose(this.#closeReason)) {
        this.#reconnectStopped = true;
        this.#clearReconnectTimer();
        this.#setState("closed");
        return;
      }
      this.#scheduleSocketReconnect("close", socketId);
    });
    socket.addEventListener("error", () => {
      if (this.#disposed || this.#socket !== socket || this.#socketGeneration !== socketId) {
        return;
      }
      this.#clearConnectTimer();
      this.#debug("error", { socketGeneration: socketId });
      this.#invalidateReplayForReconnect();
      this.#scheduleSocketReconnect("error", socketId);
      socket.close();
    });
  }

  #scheduleConnect(reason: ReconnectReason, mode: TerminalReconnectMode, immediate: boolean) {
    if (this.#disposed || this.#reconnectStopped || this.#subscribers.size === 0) {
      return;
    }
    if (this.#reconnectTimer !== null) {
      if (!immediate) {
        return;
      }
      this.#clearReconnectTimer();
    }
    const policy = terminalReconnectPolicy({
      attempt: this.#reconnectAttempts,
      mode,
      immediate,
      foregroundFastAttemptsRemaining: this.#foregroundFastAttemptsRemaining,
    });
    this.#reconnectAttempts = policy.nextAttempt;
    this.#foregroundFastAttemptsRemaining = policy.nextForegroundFastAttemptsRemaining;
    this.#setState("connecting");
    this.#debug("scheduled", {
      reason,
      mode,
      delayMs: policy.delayMs,
      connectTimeoutMs: policy.connectTimeoutMs,
    });
    const run = () => {
      this.#reconnectTimer = null;
      this.#connectSocket(reason, policy.connectTimeoutMs);
    };
    if (policy.delayMs === 0) {
      run();
      return;
    }
    this.#reconnectTimer = window.setTimeout(run, policy.delayMs);
  }

  #scheduleReconnect(reason: ReconnectReason) {
    const mode: TerminalReconnectMode =
      this.#foregroundFastAttemptsRemaining > 0 ? "foreground" : "normal";
    this.#scheduleConnect(reason, mode, false);
  }

  #scheduleSocketReconnect(reason: ReconnectReason, socketId: number) {
    if (this.#reconnectScheduledForSocket === socketId) {
      return;
    }
    this.#reconnectScheduledForSocket = socketId;
    this.#scheduleReconnect(reason);
  }

  #retryStalledConnect(stalledSocket: WebSocket, socketId: number) {
    if (
      this.#disposed ||
      this.#socket !== stalledSocket ||
      this.#socketGeneration !== socketId ||
      stalledSocket.readyState !== WebSocket.CONNECTING
    ) {
      return;
    }
    this.#debug("stalled", { socketGeneration: socketId });
    this.#invalidateReplayForReconnect();
    this.#socket = null;
    stalledSocket.close();
    this.#scheduleSocketReconnect("stalled", socketId);
  }

  #processForegroundReconnect(reason: ReconnectReason) {
    if (this.#reconnectStopped) {
      return;
    }
    const now = performance.now();
    this.#lastForegroundReconnectAt = now;
    const reasons = Array.from(this.#pendingForegroundReasons);
    this.#pendingForegroundReasons.clear();
    this.#debug("signal", { reason, reasons });
    const socket = this.#socket;
    if (socket?.readyState === WebSocket.OPEN) {
      const currentFocus = this.#focusedSubscriberId
        ? this.#subscribers.get(this.#focusedSubscriberId)
        : null;
      if (currentFocus) {
        this.#sendResize(currentFocus, currentFocus.lastSize);
      }
      return;
    }
    if (socket?.readyState === WebSocket.CONNECTING &&
        now - this.#socketStartedAt < TERMINAL_FOREGROUND_CONNECT_TIMEOUT_MS) {
      const socketId = this.#socketGeneration;
      const remainingMs = Math.max(
        1,
        TERMINAL_FOREGROUND_CONNECT_TIMEOUT_MS - (now - this.#socketStartedAt),
      );
      this.#clearConnectTimer();
      this.#connectTimer = window.setTimeout(
        () => this.#retryStalledConnect(socket, socketId),
        remainingMs,
      );
      return;
    }
    this.#reconnectAttempts = 0;
    this.#foregroundFastAttemptsRemaining = TERMINAL_FOREGROUND_FAST_ATTEMPTS;
    this.#clearReconnectTimer();
    if (socket) {
      this.#closeActiveSocket();
    }
    this.#scheduleConnect(reason, "foreground", true);
  }

  #requestForegroundReconnect(reason: ReconnectReason) {
    if (this.#reconnectStopped) {
      return;
    }
    this.#pendingForegroundReasons.add(reason);
    const now = performance.now();
    const remainingCoalesceMs =
      TERMINAL_FOREGROUND_SIGNAL_COALESCE_MS - (now - this.#lastForegroundReconnectAt);
    if (remainingCoalesceMs > 0) {
      if (this.#foregroundCoalesceTimer === null) {
        this.#foregroundCoalesceTimer = window.setTimeout(() => {
          this.#foregroundCoalesceTimer = null;
          this.#processForegroundReconnect(reason);
        }, remainingCoalesceMs);
      }
      return;
    }
    this.#clearForegroundCoalesceTimer();
    this.#processForegroundReconnect(reason);
  }

  #requestReconnect(reason: ReconnectReason) {
    if (this.#reconnectStopped || this.#disposed) {
      return;
    }
    if (reason === "resume" || reason === "visible" || reason === "online") {
      this.#requestForegroundReconnect(reason);
      return;
    }
    this.#scheduleConnect(reason, "normal", reason === "initial" || reason === "manual");
  }
}

function combineCleanup(...cleanups: Array<(() => void) | null>) {
  return () => {
    for (const cleanup of cleanups) {
      try {
        cleanup?.();
      } catch (error) {
        console.warn("terminal session cleanup failed", error);
      }
    }
  };
}
