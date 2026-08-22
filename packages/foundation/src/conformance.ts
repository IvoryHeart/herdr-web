import { createElement, useEffect, useRef, useState } from "react";
import type {
  SurfaceBridgeRuntime,
  SurfaceHostV1,
  SurfaceWorkspace,
  TerminalHandle,
} from "./surfaces.js";

export type FoundationConformanceHost = Pick<
  SurfaceHostV1,
  "runtimes" | "subscribe" | "retry" | "navigate" | "acquireTerminal"
>;

/**
 * Public Foundation-only shell + Spaces conformance application. Consumers
 * provide the existing host adapter; no product registrations, providers,
 * product assets, or downstream implementation code are reachable from this
 * entry point.
 */
export function FoundationConformanceApp({ host }: { host: FoundationConformanceHost }) {
  const [runtimes, setRuntimes] = useState<readonly SurfaceBridgeRuntime[]>(host.runtimes());
  const [terminalStatus, setTerminalStatus] = useState("Select a workspace terminal.");
  const terminalLease = useRef<{ key: string; handle: TerminalHandle } | null>(null);
  const terminalAttempt = useRef(0);

  const releaseTerminal = () => {
    terminalAttempt.current += 1;
    const lease = terminalLease.current;
    terminalLease.current = null;
    if (lease) {
      void Promise.resolve(lease.handle.release()).catch(() => {
        setTerminalStatus("Terminal release failed");
      });
    }
  };

  useEffect(() => {
    const update = () => setRuntimes(host.runtimes());
    update();
    const unsubscribe = host.subscribe(() => update());
    return () => {
      unsubscribe();
      releaseTerminal();
    };
  }, [host]);

  const selectWorkspace = (workspace: SurfaceWorkspace) => {
    host.navigate(workspace.target);
    releaseTerminal();
    if (!workspace.terminalTarget) {
      setTerminalStatus("No terminal is available for this workspace.");
      return;
    }
    const attempt = terminalAttempt.current;
    setTerminalStatus("Acquiring terminal…");
    void host.acquireTerminal(workspace.terminalTarget).then(async (handle) => {
      if (attempt !== terminalAttempt.current) {
        await Promise.resolve(handle.release()).catch(() => {});
        return;
      }
      terminalLease.current = { key: handle.key, handle };
      await handle.attach();
      if (attempt === terminalAttempt.current) {
        setTerminalStatus(`Terminal ready: ${handle.key}`);
      }
    }).catch((error: unknown) => {
      if (attempt === terminalAttempt.current) {
        setTerminalStatus(error instanceof Error ? error.message : "Terminal unavailable");
      }
    });
  };

  return createElement(
    "main",
    {
      "data-foundation-conformance": "ready",
      "data-foundation-surface": "spaces",
      "aria-label": "Foundation conformance",
    },
    createElement("h1", null, "Foundation Spaces"),
    createElement("p", null, "Foundation conformance shell"),
    createElement(
      "ul",
      { "aria-label": "Foundation runtimes" },
      ...runtimes.map((runtime) =>
        createElement(
          "li",
          { key: runtime.bridgeId },
          `${runtime.label} — ${runtime.available ? "ready" : "unavailable"}`,
        ),
      ),
    ),
    createElement(
      "nav",
      { "aria-label": "Foundation workspaces" },
      ...runtimes.flatMap((runtime) =>
        (runtime.workspaces ?? []).map((workspace) =>
          createElement(
            "button",
            {
              key: `${runtime.bridgeId}:${workspace.target.nativeTargetId}`,
              type: "button",
              onClick: () => selectWorkspace(workspace),
            },
            `${runtime.label}: ${workspace.label}`,
          ),
        ),
      ),
    ),
    createElement(
      "p",
      { "aria-live": "polite", "data-foundation-terminal": "status" },
      terminalStatus,
    ),
    createElement(
      "button",
      { type: "button", onClick: () => host.retry() },
      "Retry Foundation runtimes",
    ),
  );
}
