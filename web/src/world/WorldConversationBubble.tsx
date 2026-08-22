import { Maximize2, MessageCircle, X } from "lucide-react";
import { useContext, useEffect, useId, useRef } from "react";
import type { BridgeRuntime } from "../bridge";
import { agentActivityKey } from "../agentActivity";
import type { PaneInfo } from "../types";
import { SurfaceTerminalView, TerminalView } from "../TerminalView";
import { SurfaceHostContext } from "../surfaceHostContext";
import type { QualifiedSurfaceTarget } from "@herdr-world/foundation/surfaces";
import type { TerminalSessionDescriptor } from "../terminalSessions";
import type {
  MobileLongPressBehavior,
  MobileTerminalTapTarget,
  MobileTouchSelectionEndpointTimeoutMs,
} from "../mobileTerminalPrefs";
import { officeDebug } from "../officeDebug";
import { formatOfficeActivityAge } from "./officeSelection";
import type { TerminalInputTransport } from "../terminalInputTransport";
import type { OfficeAgent } from "./herdrOfficeProjection";

export function WorldConversationBubble({
  agent,
  targetLabel,
  hostLabel,
  pane,
  terminalTarget,
  runtime,
  session,
  onClose,
  onOpenInSpaces,
  touchInput,
  terminalFontSizePx,
  terminalScreenReaderText,
  mobileControlsScalePercent,
  mobileTapTarget,
  mobileLongPressBehavior,
  mobileTouchSelectionEndpointTimeoutMs,
  mobileCommandExpandingInput,
  mobileCommandEnterNewline,
  terminalInputTransport,
  terminalInputBatchDelayMs,
  terminalOutputCoalesceMs,
  agentActivityTransitions,
}: {
  agent: OfficeAgent | null;
  targetLabel: string;
  hostLabel: string;
  pane: PaneInfo;
  terminalTarget?: QualifiedSurfaceTarget;
  runtime: BridgeRuntime;
  session: TerminalSessionDescriptor;
  onClose: () => void;
  onOpenInSpaces: () => void;
  touchInput: boolean;
  terminalFontSizePx: number;
  terminalScreenReaderText: boolean;
  mobileControlsScalePercent: number;
  mobileTapTarget: MobileTerminalTapTarget;
  mobileLongPressBehavior: MobileLongPressBehavior;
  mobileTouchSelectionEndpointTimeoutMs: MobileTouchSelectionEndpointTimeoutMs;
  mobileCommandExpandingInput: boolean;
  mobileCommandEnterNewline: boolean;
  terminalInputTransport: TerminalInputTransport;
  terminalInputBatchDelayMs: number;
  terminalOutputCoalesceMs: number;
  agentActivityTransitions: ReadonlyMap<string, number>;
}) {
  const bubbleRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const terminalHost = useContext(SurfaceHostContext);
  const terminalProps = {
    pane: session.attachEnabled ? pane : null,
    connectionKey: session.sessionKey,
    resumeToken: runtime.resumeToken,
    httpUrl: runtime.httpUrl,
    wsUrl: runtime.wsUrl,
    inputEnabled: session.inputEnabled,
    resizeEnabled: session.resizeEnabled,
    scrollEnabled: session.scrollEnabled,
    uploadEnabled: session.uploadEnabled,
    autoFocus: !touchInput,
    scrollSensitivity: touchInput ? 2 : 0.4,
    mobileControls: touchInput,
    terminalFontSizePx,
    terminalScreenReaderText,
    accessibilityLabel: `${targetLabel} terminal`,
    selected: true,
    mobileControlsScalePercent,
    mobileTapTarget,
    mobileLongPressBehavior,
    mobileTouchSelectionEndpointTimeoutMs,
    mobileCommandExpandingInput,
    mobileCommandEnterNewline,
    terminalInputTransport,
    terminalInputBatchDelayMs,
    terminalOutputCoalesceMs,
    transparentBackground: true,
  };

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
      <header
        className="world-conversation-header"
        tabIndex={0}
        role="group"
        aria-label="Move agent conversation"
      >
        <div className="world-conversation-heading">
          <MessageCircle size={17} aria-hidden="true" />
          <div>
            <strong id={titleId}>{agent?.displayLabel ?? targetLabel}</strong>
            <span className="mono">{hostLabel} · {agent ? "live terminal" : "shell terminal"}</span>
          </div>
        </div>
        {agent ? (
          <span
            className="world-conversation-context"
            aria-label="Agent state and activity"
            data-status={agent.stale ? "stale" : agent.semanticStatus}
          >
            {agent.stale ? "stale" : agent.semanticStatus}
            {" · "}
            {formatOfficeActivityAge(
              agentActivityTransitions.get(
                agentActivityKey(
                  agent.hostKey,
                  agent.currentPaneRef.nativeTargetId,
                  agent.currentTerminalRef.nativeTargetId,
                ),
              ),
            ) ?? "No transition data available"}
          </span>
        ) : null}
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
        {terminalHost && terminalTarget ? (
          <SurfaceTerminalView
            {...terminalProps}
            host={terminalHost}
            target={terminalTarget}
          />
        ) : (
          <TerminalView {...terminalProps} />
        )}
      </div>
    </section>
  );
}
