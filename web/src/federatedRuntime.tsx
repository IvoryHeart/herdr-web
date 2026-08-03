import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  Dispatch,
  MutableRefObject,
  ReactNode,
  SetStateAction,
} from "react";
import type { BridgeId, BridgeRuntime } from "./bridge";
import { useHostRegistry } from "./hostRegistry";
import { fetchRuntimeSnapshot, RuntimeCache } from "./runtimeClient";
import {
  admitRuntimeSnapshot,
  ensureBridgeConnectionRef,
  isRuntimeGenerationCurrent,
  markRuntimeUnavailable,
  RuntimeConnection,
} from "./runtimeConnection";
import type { BridgeConnectionRef, BridgeConnectionState } from "./runtimeConnection";
import type { Snapshot } from "./types";

const CORE_OBSERVATION_CAPABILITIES = ["snapshot"] as const;

export type FederatedRuntimeObservers = {
  onPaneSelection: (bridgeId: BridgeId, paneId: string, workspaceId?: string) => void;
  onAgentActivityChanged: (bridgeId: BridgeId) => void;
  onAgentPinsChanged: (bridgeId: BridgeId) => void;
  onNotesChanged: (bridgeId: BridgeId) => void;
};

type FederatedRuntimeValue = {
  connectionStates: Record<string, BridgeConnectionState>;
  setConnectionStates: Dispatch<SetStateAction<Record<string, BridgeConnectionState>>>;
  connectionRefs: MutableRefObject<Record<string, BridgeConnectionRef>>;
  runtimeCache: RuntimeCache<Snapshot>;
  refreshSnapshot: (runtime: BridgeRuntime, setLoading: boolean) => Promise<Snapshot | null>;
  setObservers: (observers: FederatedRuntimeObservers | null) => void;
  setFollowSharedSelection: (follow: boolean) => void;
};

const FederatedRuntimeContext = createContext<FederatedRuntimeValue | null>(null);

const NOOP_OBSERVERS: FederatedRuntimeObservers = {
  onPaneSelection: () => {},
  onAgentActivityChanged: () => {},
  onAgentPinsChanged: () => {},
  onNotesChanged: () => {},
};

export function FederatedRuntimeProvider({ children }: { children: ReactNode }) {
  const bridge = useHostRegistry();
  const runtimeCache = useMemo(() => new RuntimeCache<Snapshot>(), []);
  const connectionRefs = useRef<Record<string, BridgeConnectionRef>>({});
  const [connectionStates, setConnectionStates] = useState<
    Record<string, BridgeConnectionState>
  >({});
  const observersRef = useRef<FederatedRuntimeObservers>(NOOP_OBSERVERS);
  const [followSharedSelection, setFollowSharedSelection] = useState(false);

  const setObservers = useCallback((observers: FederatedRuntimeObservers | null) => {
    observersRef.current = observers ?? NOOP_OBSERVERS;
  }, []);

  const refreshSnapshot = useCallback(
    async (runtime: BridgeRuntime, setLoading: boolean): Promise<Snapshot | null> => {
      const ref = ensureBridgeConnectionRef(connectionRefs, runtime, runtimeCache);
      const requestConnectionKey = runtime.generationKey;
      const refreshGeneration = ref.activityGeneration;
      if (setLoading) {
        setConnectionStates((current) => ({
          ...current,
          [runtime.id]: {
            connectionKey: requestConnectionKey,
            snapshot: ref.snapshot,
            loadState: "loading",
          },
        }));
      }
      try {
        const next = await fetchRuntimeSnapshot(runtime.httpUrl);
        const currentRef = connectionRefs.current[runtime.id];
        if (!isRuntimeGenerationCurrent(currentRef, requestConnectionKey)) {
          return null;
        }
        if (currentRef.resyncBarrierGeneration > refreshGeneration) {
          return refreshSnapshot(runtime, false);
        }
        return admitRuntimeSnapshot({
          runtime,
          snapshot: next,
          ref: currentRef,
          refreshGeneration,
          runtimeCache,
          setConnectionStates,
          onRecoveryDetected: bridge.retryBridgeProbe,
        });
      } catch {
        const currentRef = connectionRefs.current[runtime.id];
        if (isRuntimeGenerationCurrent(currentRef, requestConnectionKey)) {
          markRuntimeUnavailable(runtime, currentRef, runtimeCache, setConnectionStates);
        }
        return null;
      }
    },
    [bridge.retryBridgeProbe, runtimeCache],
  );

  useEffect(() => {
    const activeProfileIds = new Set(
      bridge.profiles.filter((profile) => profile.enabled).map((profile) => profile.profileId),
    );
    for (const profileId of Object.keys(connectionRefs.current)) {
      if (!activeProfileIds.has(profileId)) {
        delete connectionRefs.current[profileId];
        runtimeCache.remove(profileId);
      }
    }
    setConnectionStates((current) => {
      let changed = false;
      const next: Record<string, BridgeConnectionState> = {};
      for (const [profileId, state] of Object.entries(current)) {
        if (activeProfileIds.has(profileId)) {
          next[profileId] = state;
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [bridge.profiles, runtimeCache]);

  const onPaneSelection = useCallback(
    (bridgeId: BridgeId, paneId: string, workspaceId?: string) =>
      observersRef.current.onPaneSelection(bridgeId, paneId, workspaceId),
    [],
  );
  const onAgentActivityChanged = useCallback(
    (bridgeId: BridgeId) => observersRef.current.onAgentActivityChanged(bridgeId),
    [],
  );
  const onAgentPinsChanged = useCallback(
    (bridgeId: BridgeId) => observersRef.current.onAgentPinsChanged(bridgeId),
    [],
  );
  const onNotesChanged = useCallback(
    (bridgeId: BridgeId) => observersRef.current.onNotesChanged(bridgeId),
    [],
  );

  const value = useMemo<FederatedRuntimeValue>(
    () => ({
      connectionStates,
      setConnectionStates,
      connectionRefs,
      runtimeCache,
      refreshSnapshot,
      setObservers,
      setFollowSharedSelection,
    }),
    [connectionStates, refreshSnapshot, runtimeCache, setObservers],
  );

  return (
    <FederatedRuntimeContext.Provider value={value}>
      {bridge.enabledRuntimes.map((runtime) => (
        <RuntimeConnection
          key={runtime.id}
          runtime={runtime}
          requiredCapabilities={CORE_OBSERVATION_CAPABILITIES}
          followSharedSelection={followSharedSelection}
          connectionRefs={connectionRefs}
          runtimeCache={runtimeCache}
          setConnectionStates={setConnectionStates}
          onRecoveryDetected={bridge.retryBridgeProbe}
          onPaneSelection={onPaneSelection}
          onAgentActivityChanged={onAgentActivityChanged}
          onAgentPinsChanged={onAgentPinsChanged}
          onNotesChanged={onNotesChanged}
        />
      ))}
      {children}
    </FederatedRuntimeContext.Provider>
  );
}

export function useFederatedRuntime() {
  const value = useContext(FederatedRuntimeContext);
  if (!value) {
    throw new Error("useFederatedRuntime must be used inside FederatedRuntimeProvider");
  }
  return value;
}
