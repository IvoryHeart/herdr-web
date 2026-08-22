import { createElement } from "react";
import {
  defineProductSettings,
  defineSurface,
} from "@herdr-world/foundation/surfaces";
import type { SurfaceHostV1 } from "@herdr-world/foundation/surfaces";
import { WorldSettingsDialog } from "./WorldSettingsDialog";
import WorldSurface, { FALLBACK_CONTEXT } from "./WorldSurface";
import type { WorldSurfaceContext } from "./WorldSurface";

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
      createElement(WorldSurface, { context: context.current }),
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
