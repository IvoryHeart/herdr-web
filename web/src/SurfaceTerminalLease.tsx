import { Fragment, useEffect } from "react";
import type { ReactNode } from "react";
import type {
  QualifiedSurfaceTarget,
  SurfaceHostV1,
  TerminalHandle,
} from "@herdr-world/foundation/surfaces";

function releaseTerminalHandle(handle: TerminalHandle) {
  void Promise.resolve(handle.release()).catch(() => {
    // Surface teardown is local; the host has still completed its cleanup path.
  });
}

/**
 * Gives a World conversation a host-owned shared-terminal view. The existing
 * terminal renderer remains the pixel consumer; this lease is the authority
 * that prevents Office unmounts from closing another view or the Herdr pane.
 */
export function SurfaceTerminalLease({
  host,
  target,
  children,
}: {
  host?: Pick<SurfaceHostV1, "acquireTerminal">;
  target?: QualifiedSurfaceTarget;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!host || !target) {
      return;
    }
    let cancelled = false;
    let handle: TerminalHandle | null = null;
    void host.acquireTerminal(target).then((acquired) => {
      if (cancelled) {
        releaseTerminalHandle(acquired);
        return;
      }
      handle = acquired;
    }).catch(() => {
      // The renderer owns the existing route-local terminal error state.
    });
    return () => {
      cancelled = true;
      if (handle) {
        releaseTerminalHandle(handle);
      }
    };
  }, [host, target?.bridgeId, target?.nativeTargetId, target?.kind]);

  return <Fragment>{children}</Fragment>;
}
