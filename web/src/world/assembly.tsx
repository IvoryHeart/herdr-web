import { createElement } from "react";
import {
  defineProductSettings,
  defineSurface,
} from "@herdr-world/foundation/surfaces";
import type {
  QualifiedSurfaceTarget,
  SurfaceHostV1,
} from "@herdr-world/foundation/surfaces";
import { WorldSettingsDialog } from "./WorldSettingsDialog";
import WorldSurface, { FALLBACK_CONTEXT } from "./WorldSurface";
import type { WorldSurfaceContext } from "./WorldSurface";
import type { OfficeHandoffRequest } from "./herdrOfficeHandoff";
import type { QualifiedTarget } from "../runtimeIdentity";

export const officeDefinition = {
  id: "world",
  label: "Office",
  route: "/world" as const,
  semanticIcon: "pixel-office",
  hostScope: "multi-host" as const,
  requiredCapabilities: ["snapshot"] as const,
  requiredBridgeFeatures: ["snapshot"] as const,
};

/**
 * The registration owns this binding. App updates the current World-owned
 * projection/callback view, while Foundation owns the binding's generation,
 * host, load, and disposal lifecycle.
 */
export type OfficeSurfaceContext = {
  readonly host: SurfaceHostV1;
  current: WorldSurfaceContext;
};

export function isOfficeSurfaceContext(value: unknown): value is OfficeSurfaceContext {
  return Boolean(
    value &&
      typeof value === "object" &&
      "host" in value &&
      "current" in value,
  );
}

function surfaceTarget(ref: QualifiedTarget): QualifiedSurfaceTarget {
  return {
    bridgeId: ref.profileId,
    kind: ref.kind,
    nativeTargetId: ref.nativeTargetId,
  };
}

function handoffTarget(request: OfficeHandoffRequest): QualifiedSurfaceTarget | null {
  return request.kind === "room"
    ? surfaceTarget(request.workspaceRef)
    : surfaceTarget(request.terminalRef);
}

/**
 * Bind the World projection to Foundation's host seam. World still supplies
 * its local projection and presentation callbacks, but cross-surface handoff
 * and terminal ownership remain host operations.
 */
export function createOfficeWorldContext(context: OfficeSurfaceContext): WorldSurfaceContext {
  const current = context.current;
  return {
    ...current,
    terminalHost: context.host,
    onSelect: current.onSelect,
    onOpenInSpaces: (request) => {
      const target = handoffTarget(request);
      if (target) {
        context.host.navigate(target);
      } else {
        current.onOpenInSpaces(request);
      }
    },
  };
}

export const officeRegistration = defineSurface<OfficeSurfaceContext>({
  definition: {
    id: officeDefinition.id,
    label: officeDefinition.label,
    route: officeDefinition.route,
    semanticIcon: officeDefinition.semanticIcon,
    requiredBridgeFeatures: officeDefinition.requiredBridgeFeatures,
  },
  createContext: (host) => ({ host, current: FALLBACK_CONTEXT }),
  load: async () => ({
    default: ({ context }: { context: OfficeSurfaceContext }) =>
      createElement(WorldSurface, { context: createOfficeWorldContext(context) }),
  }),
  dispose: (context) => {
    context.current = FALLBACK_CONTEXT;
  },
});

export type WorldSettingsContext = {
  onSaved?: () => void;
};

export type OfficeSettingsContext = {
  readonly host: SurfaceHostV1;
  current: WorldSettingsContext;
};

export function isOfficeSettingsContext(value: unknown): value is OfficeSettingsContext {
  return Boolean(
    value &&
      typeof value === "object" &&
      "host" in value &&
      "current" in value,
  );
}

export const officeSettingsContribution = defineProductSettings<OfficeSettingsContext>({
  id: "world-settings",
  label: "Office settings",
  createContext: (host) => ({ host, current: {} }),
  load: async () => ({
    default: ({ context, onClose }: { context: OfficeSettingsContext; onClose: () => void }) =>
      createElement(WorldSettingsDialog, { onClose, onSaved: context.current.onSaved }),
  }),
  dispose: (context) => {
    context.current = {};
  },
});

/** World-owned contributions; Foundation has no import path back to this module. */
export const worldContributions = {
  officeRegistration,
  officeSettingsContribution,
};
