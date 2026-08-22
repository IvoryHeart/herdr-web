import { useMemo, useState } from "react";
import { useFederatedRuntime } from "./federatedRuntime";
import { useHostRegistry } from "./hostRegistry";
import { HerdrMainStage } from "./HerdrClientFrame";
import { TerminalView } from "./TerminalView";
import { terminalSessionDescriptor } from "./terminalSessions";

export default function SpacesSurface() {
  const bridge = useHostRegistry();
  const { connectionStates } = useFederatedRuntime();
  const [selectedPaneKey, setSelectedPaneKey] = useState<string | null>(null);
  const runtimes = bridge.enabledRuntimes;
  const selectedRuntime = runtimes.find((runtime) =>
    selectedPaneKey?.startsWith(`${runtime.id}:`),
  ) ?? runtimes[0] ?? null;
  const selectedState = selectedRuntime ? connectionStates[selectedRuntime.id] : null;
  const snapshot = selectedState?.snapshot ?? null;
  const selectedPane = useMemo(
    () =>
      snapshot?.panes.find(
        (pane) => `${selectedRuntime?.id}:${pane.pane_id}` === selectedPaneKey,
      ) ?? snapshot?.panes[0] ?? null,
    [selectedPaneKey, selectedRuntime?.id, snapshot],
  );
  const admission = selectedState ?? "loading";
  const session = terminalSessionDescriptor(selectedRuntime, selectedPane, admission, [
    "snapshot",
    "terminal_attach",
  ]);

  return (
    <HerdrMainStage label="Spaces">
      <section aria-label="Spaces" data-foundation-surface="spaces">
        <header className="stage-bar">
          <div className="stage-id">
            <h1 className="stage-title">Spaces</h1>
            <span className="stage-sub mono">Foundation conformance shell</span>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="Refresh Spaces"
            onClick={() => selectedRuntime && bridge.retryBridgeProbe(selectedRuntime.id)}
          >
            Refresh
          </button>
        </header>
        <div className="foundation-spaces-layout">
          <nav aria-label="Foundation workspaces">
            <h2>Workspaces</h2>
            {runtimes.length === 0 ? <p>No enabled bridge.</p> : null}
            {runtimes.map((runtime) => {
              const state = connectionStates[runtime.id];
              return (
                <section key={runtime.id} aria-label={runtime.label}>
                  <h3>{runtime.label}</h3>
                  {state?.snapshot?.workspaces.map((workspace) => (
                    <button
                      type="button"
                      key={`${runtime.id}:${workspace.workspace_id}`}
                      onClick={() => {
                        const pane = state.snapshot?.panes.find(
                          (candidate) => candidate.workspace_id === workspace.workspace_id,
                        );
                        if (pane) {
                          setSelectedPaneKey(`${runtime.id}:${pane.pane_id}`);
                        }
                      }}
                    >
                      {workspace.label || workspace.workspace_id}
                    </button>
                  ))}
                </section>
              );
            })}
          </nav>
          <div className="foundation-spaces-terminal">
            {selectedPane && session?.attachEnabled && selectedRuntime ? (
              <TerminalView
                pane={selectedPane}
                connectionKey={session.sessionKey}
                resumeToken={selectedRuntime.resumeToken}
                httpUrl={selectedRuntime.httpUrl}
                wsUrl={selectedRuntime.wsUrl}
                inputEnabled={session.inputEnabled}
                resizeEnabled={session.resizeEnabled}
                scrollEnabled={session.scrollEnabled}
                uploadEnabled={session.uploadEnabled}
                autoFocus={false}
                accessibilityLabel="Foundation Spaces terminal"
              />
            ) : (
              <div className="surface-loading" role="status">
                {selectedState?.loadState === "error"
                  ? "Spaces bridge unavailable"
                  : "Select a workspace terminal when a bridge is ready."}
              </div>
            )}
          </div>
        </div>
      </section>
    </HerdrMainStage>
  );
}
