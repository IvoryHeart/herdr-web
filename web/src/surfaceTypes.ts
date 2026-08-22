import type { ComponentType } from "react";

/** The only surface API version understood by this Foundation tranche. */
export const FOUNDATION_SURFACE_API_VERSION = 1 as const;

/** Internal-to-the-package nominal brands for opaque registration tokens. */
export const surfaceRegistrationTokenBrand = Symbol("surface-registration-token");
export const productSettingsContributionTokenBrand = Symbol(
  "product-settings-contribution-token",
);

export type SurfaceRoute = "/" | `/${string}`;

export type SurfaceDefinition = {
  id: string;
  label: string;
  route: SurfaceRoute;
  semanticIcon: string;
  requiredBridgeFeatures: readonly string[];
};

export type SurfaceComponent<Context> = ComponentType<{ context: Context }>;

export type SurfaceRuntimeIdentity = {
  bridgeId: string;
  connectionKey: string;
  generationKey: string;
};

export type SurfaceRuntimeState =
  | "disabled"
  | "connecting"
  | "ready"
  | "degraded"
  | "incompatible"
  | "offline";

export type SurfaceRuntimeView = {
  identity: SurfaceRuntimeIdentity;
  label: string;
  state: SurfaceRuntimeState;
  features: readonly string[];
  commands: readonly string[];
};

export type SurfaceCapabilityAdmission = {
  identity: SurfaceRuntimeIdentity;
  available: boolean;
  missingFeatures: readonly string[];
  state: SurfaceRuntimeState;
};

export type SurfaceTargetKind = "workspace" | "tab" | "pane" | "terminal";

export type SurfaceTarget = {
  identity: SurfaceRuntimeIdentity;
  kind: SurfaceTargetKind;
  nativeTargetId: string;
};

export type SurfaceCommand =
  | { type: "focusWorkspace"; target: SurfaceTarget & { kind: "workspace" } }
  | { type: "focusTab"; target: SurfaceTarget & { kind: "tab" } }
  | { type: "focusPane"; target: SurfaceTarget & { kind: "pane" } }
  | { type: "closePane"; target: SurfaceTarget & { kind: "pane" } };

export type SurfaceCommandResult = {
  accepted: true;
  target: SurfaceTarget;
};

export type SurfaceTerminalSize = {
  cols: number;
  rows: number;
};

export type SurfaceTerminalConnectionState =
  | "idle"
  | "connecting"
  | "attached"
  | "closed"
  | "error";

export type SurfaceTerminalState = {
  connectionState: SurfaceTerminalConnectionState;
  closeReason: string | null;
  hasAttachedForTerminal: boolean;
};

export type SurfaceTerminalInputTransport = "json" | "binary";

export type SurfaceTerminalAcquireOptions = {
  outputCoalesceMs: number;
  initialSize: SurfaceTerminalSize;
  inputEnabled: boolean;
  resizeEnabled: boolean;
  scrollEnabled: boolean;
  focusOwner: boolean;
  onOutput: (data: Uint8Array) => void;
  onState: (state: SurfaceTerminalState) => void;
  onConnectAttempt: () => void;
};

export type SurfaceTerminalHandle = {
  updateAdmission(inputEnabled: boolean, resizeEnabled: boolean, scrollEnabled: boolean): void;
  setFocusOwner(wantsFocus: boolean): void;
  reportSize(size: SurfaceTerminalSize): void;
  sendInput(data: string, transport: SurfaceTerminalInputTransport): boolean;
  sendScroll(lines: number): boolean;
  requestReconnect(): void;
  release(): void;
};

export type SurfaceHostV1 = {
  readonly apiVersion: typeof FOUNDATION_SURFACE_API_VERSION;
  readonly signal: AbortSignal;
  readonly runtimes: readonly SurfaceRuntimeView[];
  readonly navigation: {
    readonly currentSurfaceId: string;
    goTo(surfaceId: string): void;
    subscribe(listener: (surfaceId: string) => void): () => void;
  };
  readonly capabilities: {
    forRuntime(bridgeId: string): SurfaceCapabilityAdmission | null;
    admission(requiredFeatures: readonly string[]): readonly SurfaceCapabilityAdmission[];
  };
  readonly commands: {
    dispatch(command: SurfaceCommand): Promise<SurfaceCommandResult>;
  };
  readonly terminals: {
    acquire(
      target: SurfaceTarget & { kind: "terminal" },
      options: SurfaceTerminalAcquireOptions,
    ): SurfaceTerminalHandle;
  };
};

export type SurfaceRegistration<Context> = {
  definition: SurfaceDefinition;
  createContext: (host: SurfaceHostV1) => Context;
  load: () => Promise<{ default: SurfaceComponent<Context> }>;
  dispose: (context: Context) => void | Promise<void>;
};

export type ProductSettingsContribution<Context> = {
  id: string;
  label: string;
  createContext: (host: SurfaceHostV1) => Context;
  load: () => Promise<{
    default: ComponentType<{ context: Context; onClose: () => void }>;
  }>;
  dispose: (context: Context) => void | Promise<void>;
};

export type SurfaceDefinitionInput = {
  id: string;
  label: string;
  route: string;
  semanticIcon: string;
  requiredBridgeFeatures: readonly string[];
};

export type SurfaceRegistrationToken = {
  readonly definition: SurfaceDefinition;
  readonly [surfaceRegistrationTokenBrand]: "surface-registration-token";
};

export type ProductSettingsContributionToken = {
  readonly id: string;
  readonly label: string;
  readonly [productSettingsContributionTokenBrand]: "product-settings-contribution-token";
};

export type ProductAssembly = {
  surfaceApiVersion: typeof FOUNDATION_SURFACE_API_VERSION;
  surfaces: readonly SurfaceRegistrationToken[];
  productSettings?: ProductSettingsContributionToken;
};

export type ProductAssemblyInput = {
  surfaceApiVersion?: number;
  surfaces: readonly unknown[];
  productSettings?: unknown;
};
