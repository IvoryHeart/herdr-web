import type { PaneInfo } from "./types";

/** The shared Herdr pane classifier used by Spaces and World. */
export function isAgentPane(pane: PaneInfo) {
  return Boolean(
    pane.agent ||
      pane.display_agent ||
      pane.title ||
      Object.keys(pane.state_labels ?? {}).length > 0 ||
      pane.agent_status !== "unknown",
  );
}
