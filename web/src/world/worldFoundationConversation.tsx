import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type {
  SurfaceHostV1,
  SurfaceRuntimeView,
  SurfaceTerminalHandle,
} from "@herdr-world/foundation/surfaces";
import type { OfficeAgent } from "./herdrOfficeProjection";

const decoder = new TextDecoder();

export function WorldFoundationConversation({
  host,
  agent,
  runtime,
  onClose,
  onOpenInSpaces,
  activityAt,
}: {
  host: SurfaceHostV1;
  agent: OfficeAgent;
  runtime: SurfaceRuntimeView;
  onClose: () => void;
  onOpenInSpaces: () => void;
  activityAt: number | null;
}) {
  const [output, setOutput] = useState("");
  const [connectionState, setConnectionState] = useState("connecting");
  const handleRef = useRef<SurfaceTerminalHandle | null>(null);
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const target = {
    identity: runtime.identity,
    kind: "terminal" as const,
    nativeTargetId: agent.currentTerminalRef.nativeTargetId,
  };

  useEffect(() => {
    const handle = host.terminals.acquire(target, {
      outputCoalesceMs: 16,
      initialSize: { cols: 100, rows: 32 },
      inputEnabled: runtime.features.includes("terminal_input"),
      resizeEnabled: runtime.features.includes("terminal_resize"),
      scrollEnabled: runtime.features.includes("terminal_scroll"),
      focusOwner: true,
      onOutput: (data) => setOutput((current) => `${current}${decoder.decode(data, { stream: true })}`.slice(-32_000)),
      onState: (state) => setConnectionState(state.connectionState),
      onConnectAttempt: () => setConnectionState("connecting"),
    });
    handleRef.current = handle;
    inputRef.current?.focus();
    const resizeObserver = typeof ResizeObserver === "undefined" || !terminalRef.current
      ? null
      : new ResizeObserver(([entry]) => {
        const width = entry?.contentRect.width ?? 800;
        const height = entry?.contentRect.height ?? 400;
        handle.reportSize({
          cols: Math.max(20, Math.floor(width / 8)),
          rows: Math.max(8, Math.floor(height / 18)),
        });
      });
    if (resizeObserver && terminalRef.current) resizeObserver.observe(terminalRef.current);
    return () => {
      resizeObserver?.disconnect();
      handle.release();
      handleRef.current = null;
    };
  }, [host, runtime.identity.bridgeId, runtime.identity.connectionKey, runtime.identity.generationKey, agent.currentTerminalRef.nativeTargetId]);

  const sendKey = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const handle = handleRef.current;
    if (!handle || !runtime.features.includes("terminal_input")) return;
    let data: string | null = null;
    if (event.key === "Enter") data = "\r";
    else if (event.key === "Escape") data = "\u001b";
    else if (event.key === "Backspace") data = "\u007f";
    else if (event.key === "ArrowUp") data = "\u001b[A";
    else if (event.key === "ArrowDown") data = "\u001b[B";
    else if (event.key === "ArrowRight") data = "\u001b[C";
    else if (event.key === "ArrowLeft") data = "\u001b[D";
    else if (event.ctrlKey && event.key.toLowerCase() === "c") data = "\u0003";
    else if (event.key.length === 1 && !event.metaKey && !event.altKey) data = event.key;
    if (data !== null) {
      event.preventDefault();
      handle.sendInput(data, "json");
    }
  };

  return (
    <section className="world-conversation-bubble" role="dialog" aria-label={agent.displayLabel} data-world-conversation="open" data-agent-key={agent.key}>
      <header className="world-conversation-header" tabIndex={0} role="group" aria-label="Move agent conversation">
        <div className="world-conversation-heading">
          <div>
            <strong>{agent.displayLabel}</strong>
            <span className="mono">{runtime.label} · live terminal</span>
          </div>
        </div>
        <span className="world-conversation-context" data-status={agent.stale ? "stale" : agent.semanticStatus}>
          {agent.stale ? "stale" : agent.semanticStatus}
          {activityAt === null ? " · No transition data available" : ` · ${new Date(activityAt).toLocaleTimeString()}`}
        </span>
        <div className="world-conversation-actions">
          <button className="icon-btn" type="button" aria-label="Open full terminal in Spaces" onClick={onOpenInSpaces}>↗</button>
          <button className="icon-btn" type="button" aria-label="Close agent conversation" onClick={onClose}>×</button>
        </div>
      </header>
      <div className="world-conversation-terminal terminal-stage" ref={terminalRef} data-terminal-translucent="true" onWheel={(event) => {
        if (runtime.features.includes("terminal_scroll")) handleRef.current?.sendScroll(Math.round(event.deltaY / 20));
      }}>
        <pre aria-live="polite">{output || `${agent.displayLabel} terminal ${connectionState}`}</pre>
        <textarea
          ref={inputRef}
          className="ghostty-hidden-input"
          aria-label={`${agent.displayLabel} terminal`}
          spellCheck={false}
          onKeyDown={sendKey}
          onFocus={() => handleRef.current?.setFocusOwner(true)}
          onBlur={() => handleRef.current?.setFocusOwner(false)}
        />
      </div>
    </section>
  );
}
