import type { BridgeRuntime } from "../bridge";
import type { HostProfile } from "../hostProfile";
import { hostConnectionState } from "../runtimeClient";
import type { BridgeConnectionState } from "../runtimeConnection";
import type { HerdrOfficeSourceHost } from "./herdrOfficeProjection";

export function herdrOfficeSourcesFromRuntime(
  profiles: readonly HostProfile[],
  runtimes: readonly BridgeRuntime[],
  connectionStates: Readonly<Record<string, BridgeConnectionState>>,
): HerdrOfficeSourceHost[] {
  const runtimeByProfile = new Map(runtimes.map((runtime) => [runtime.id, runtime]));

  return profiles.map((profile) => {
    const runtime = runtimeByProfile.get(profile.profileId) ?? null;
    const state =
      runtime && connectionStates[profile.profileId]?.connectionKey === runtime.generationKey
        ? connectionStates[profile.profileId]
        : null;
    const features = runtime?.capabilities?.features ?? [];
    const supportsSnapshot = features.includes("snapshot");
    const snapshot = state?.snapshot ?? null;

    return {
      profile,
      connectionState: !profile.enabled
        ? "disabled"
        : runtime
          ? hostConnectionState(
              runtime.capabilityState,
              state?.loadState ?? "loading",
              snapshot !== null,
              supportsSnapshot,
            )
          : "connecting",
      generationKey: state && runtime ? runtime.generationKey : null,
      features,
      snapshot,
    };
  });
}
