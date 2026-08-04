import { Maximize2, MessageCircle, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import type { BridgeRuntime } from "../bridge";
import type { PaneInfo } from "../types";
import { TerminalView } from "../TerminalView";
import type { TerminalSessionDescriptor } from "../terminalSessions";
import type {
  MobileLongPressBehavior,
  MobileTerminalTapTarget,
  MobileTouchSelectionEndpointTimeoutMs,
} from "../mobileTerminalPrefs";
import { officeDebug } from "../officeDebug";
import type { TerminalInputTransport } from "../terminalInputTransport";
import type { OfficeAgent } from "./herdrOfficeProjection";

export function WorldConversationBubble({
  agent,
  targetLabel,
  hostLabel,
  pane,
  runtime,
  session,
  onClose,
  onOpenInSpaces,
  touchInput,
  terminalFontSizePx,
  mobileControlsScalePercent,
  mobileTapTarget,
  mobileLongPressBehavior,
  mobileTouchSelectionEndpointTimeoutMs,
  mobileCommandExpandingInput,
  mobileCommandEnterNewline,
  terminalInputTransport,
  terminalInputBatchDelayMs,
  terminalOutputCoalesceMs,
}: {
  agent: OfficeAgent | null;
  targetLabel: string;
  hostLabel: string;
  pane: PaneInfo;
  runtime: BridgeRuntime;
  session: TerminalSessionDescriptor;
  onClose: () => void;
  onOpenInSpaces: () => void;
  touchInput: boolean;
  terminalFontSizePx: number;
  mobileControlsScalePercent: number;
  mobileTapTarget: MobileTerminalTapTarget;
  mobileLongPressBehavior: MobileLongPressBehavior;
  mobileTouchSelectionEndpointTimeoutMs: MobileTouchSelectionEndpointTimeoutMs;
  mobileCommandExpandingInput: boolean;
  mobileCommandEnterNewline: boolean;
  terminalInputTransport: TerminalInputTransport;
  terminalInputBatchDelayMs: number;
  terminalOutputCoalesceMs: number;
}) {
  const bubbleRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    officeDebug("conversation-bubble:mount", {
      agentKey: agent?.key ?? null,
      targetLabel,
      paneId: pane.pane_id,
      terminalId: pane.terminal_id ?? null,
      bridgeId: runtime.id,
      sessionKey: session.sessionKey,
    });
    return () => officeDebug("conversation-bubble:unmount", {
      agentKey: agent?.key ?? null,
      paneId: pane.pane_id,
    });
  }, [agent?.key, pane.pane_id, pane.terminal_id, runtime.id, session.sessionKey, targetLabel]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  return (
    <section
      ref={bubbleRef}
      className="world-conversation-bubble"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-world-conversation="open"
      data-agent-key={agent?.key ?? targetLabel}
    >
      <header className="world-conversation-header">
        <div className="world-conversation-heading">
          <MessageCircle size={17} aria-hidden="true" />
          <div>
            <strong id={titleId}>{agent?.displayLabel ?? targetLabel}</strong>
            <span className="mono">{hostLabel} · {agent ? "live terminal" : "shell terminal"}</span>
          </div>
        </div>
        <div className="world-conversation-actions">
          <button
            className="icon-btn"
            type="button"
            aria-label="Open full terminal in Spaces"
            title="Open full terminal in Spaces"
            onClick={onOpenInSpaces}
          >
            <Maximize2 size={17} />
          </button>
          <button
            className="icon-btn"
            type="button"
            aria-label="Close agent conversation"
            title="Close"
            onClick={onClose}
          >
            <X size={17} />
          </button>
        </div>
      </header>
      <div className="world-conversation-terminal">
        <TerminalView
          pane={session.attachEnabled ? pane : null}
          connectionKey={session.sessionKey}
          resumeToken={runtime.resumeToken}
          httpUrl={runtime.httpUrl}
          wsUrl={runtime.wsUrl}
          inputEnabled={session.inputEnabled}
          resizeEnabled={session.resizeEnabled}
          scrollEnabled={session.scrollEnabled}
          uploadEnabled={session.uploadEnabled}
          autoFocus={!touchInput}
          scrollSensitivity={touchInput ? 2 : 0.4}
          mobileControls={touchInput}
          terminalFontSizePx={terminalFontSizePx}
          mobileControlsScalePercent={mobileControlsScalePercent}
          mobileTapTarget={mobileTapTarget}
          mobileLongPressBehavior={mobileLongPressBehavior}
          mobileTouchSelectionEndpointTimeoutMs={mobileTouchSelectionEndpointTimeoutMs}
          mobileCommandExpandingInput={mobileCommandExpandingInput}
          mobileCommandEnterNewline={mobileCommandEnterNewline}
          terminalInputTransport={terminalInputTransport}
          terminalInputBatchDelayMs={terminalInputBatchDelayMs}
          terminalOutputCoalesceMs={terminalOutputCoalesceMs}
        />
      </div>
    </section>
  );
}
