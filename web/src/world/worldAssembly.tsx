import {
  FoundationBrowserRoot,
  foundationConformanceAssembly,
} from "@herdr-world/foundation";
import {
  FOUNDATION_SURFACE_API_VERSION,
  createProductAssembly,
  defineProductSettingsContribution,
  defineSurface,
} from "@herdr-world/foundation/surfaces";
import { FoundationWorldSettingsDialog } from "./FoundationWorldSettingsDialog";
import { FoundationWorldSurface } from "./FoundationWorldSurface";

const worldSurface = defineSurface({
  definition: {
    id: "world",
    label: "Office",
    route: "/world",
    semanticIcon: "pixel-office",
    requiredBridgeFeatures: ["snapshot"],
  },
  load: async () => ({ default: FoundationWorldSurface }),
  createContext: (host) => ({ host }),
  dispose: () => {},
});

const worldSettings = defineProductSettingsContribution({
  id: "world-settings",
  label: "Office settings",
  createContext: (host) => ({ host }),
  load: async () => ({ default: FoundationWorldSettingsDialog }),
  dispose: () => {},
});

export const worldAssembly = createProductAssembly({
  surfaceApiVersion: FOUNDATION_SURFACE_API_VERSION,
  surfaces: [...foundationConformanceAssembly.surfaces, worldSurface],
  productSettings: worldSettings,
  productBranding: {
    label: "Herdr World",
    logoUrl: "/herdr-world-mark.svg",
  },
});

export function WorldFoundationRoot() {
  return (
    <div className="world-foundation-root" role="group" aria-label="Spaces | Office">
      <FoundationBrowserRoot assembly={worldAssembly} />
    </div>
  );
}
