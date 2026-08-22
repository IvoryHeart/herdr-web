import { createElement, useEffect, useState } from "react";
import type { SurfaceBridgeRuntime, SurfaceHostV1 } from "./surfaces.js";

export type FoundationConformanceHost = Pick<
  SurfaceHostV1,
  "runtimes" | "subscribe" | "retry"
>;

/**
 * Public Foundation-only conformance shell. Consumers provide the existing
 * host adapter; no product registrations, providers, assets, or World code
 * are reachable from this entry point.
 */
export function FoundationConformanceApp({ host }: { host: FoundationConformanceHost }) {
  const [runtimes, setRuntimes] = useState<readonly SurfaceBridgeRuntime[]>(host.runtimes());
  useEffect(() => {
    const update = () => setRuntimes(host.runtimes());
    update();
    return host.subscribe(update);
  }, [host]);
  return createElement(
    "main",
    { "data-foundation-conformance": "ready", "aria-label": "Foundation conformance" },
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
      "button",
      { type: "button", onClick: () => host.retry() },
      "Retry Foundation runtimes",
    ),
  );
}
