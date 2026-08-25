import { Maximize2, MessageCircle, X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { ManagedTerminal } from "@herdr-world/foundation/terminal";
import type { ManagedTerminalTarget } from "@herdr-world/foundation/terminal";
import { agentActivityKey } from "../agentActivity";
import { officeDebug } from "../officeDebug";
import { formatOfficeActivityAge } from "./officeSelection";
import type { OfficeAgent } from "./herdrOfficeProjection";

export function FoundationWorldConversationBubble({
  agent,
  targetLabel,
  hostLabel,
  target,
  onClose,
  onOpenInSpaces,
  touchInput,
  agentActivityTransitions,
}: {
  agent: OfficeAgent | null;
  targetLabel: string;
  hostLabel: string;
  target: ManagedTerminalTarget;
  onClose: () => void;
  onOpenInSpaces: () => void;
  touchInput: boolean;
  agentActivityTransitions: ReadonlyMap<string, number>;
}) {
  const bubbleRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    officeDebug("conversation-bubble:mount", {
      agentKey: agent?.key ?? null,
      targetLabel,
      paneId: target.paneId,
      terminalId: target.terminalId,
      bridgeId: target.runtime.bridgeId,
      generationKey: target.runtime.generationKey,
    });
    return () => officeDebug("conversation-bubble:unmount", {
      agentKey: agent?.key ?? null,
      paneId: target.paneId,
    });
  }, [agent?.key, target.paneId, target.runtime.bridgeId, target.runtime.generationKey, target.terminalId, targetLabel]);

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
        <ManagedTerminal
          target={target}
          inputEnabled
          resizeEnabled
          scrollEnabled
          uploadEnabled
          autoFocus={!touchInput}
          scrollSensitivity={touchInput ? 2 : 0.4}
          mobileControls={touchInput}
          transparentBackground
          accessibilityLabel={`${targetLabel} terminal`}
          selected
        />
      </div>
    </section>
  );
}
