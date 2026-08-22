import { createElement } from "react";
import {
  defineProductSettings,
  defineSurface,
} from "@herdr-world/foundation/surfaces";
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

export const officeRegistration = defineSurface<WorldSurfaceContext>({
  definition: {
    id: officeDefinition.id,
    label: officeDefinition.label,
    route: officeDefinition.route,
    semanticIcon: officeDefinition.semanticIcon,
    requiredBridgeFeatures: officeDefinition.requiredBridgeFeatures,
  },
  createContext: () => FALLBACK_CONTEXT,
  load: async () => ({
    default: ({ context }: { context: WorldSurfaceContext }) =>
      createElement(WorldSurface, { context }),
  }),
  dispose: () => undefined,
});

export type WorldSettingsContext = {
  onSaved?: () => void;
};

export const officeSettingsContribution = defineProductSettings<WorldSettingsContext>({
  id: "world-settings",
  label: "Office settings",
  createContext: () => ({}),
  load: async () => ({
    default: ({ context, onClose }: { context: WorldSettingsContext; onClose: () => void }) =>
      createElement(WorldSettingsDialog, { onClose, onSaved: context.onSaved }),
  }),
  dispose: () => undefined,
});

/** World-owned contributions; Foundation has no import path back to this module. */
export const worldContributions = {
  officeRegistration,
  officeSettingsContribution,
};
