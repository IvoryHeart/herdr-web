import {
  foundationConformanceAssembly,
} from "@herdr-world/foundation";
import {
  createProductAssembly,
  defineProductSettingsContribution,
  defineSurface,
  FOUNDATION_SURFACE_API_VERSION,
} from "@herdr-world/foundation/surfaces";
import { assertFoundationCompatibility } from "./foundationCompatibility";
import {
  createWorldOfficeContext,
  WorldFoundationSurface,
} from "./worldFoundationSurface";
import { WorldFoundationSettings } from "./worldFoundationSettings";

assertFoundationCompatibility();

const officeSurface = defineSurface({
  definition: {
    id: "office",
    label: "Office",
    route: "/world",
    semanticIcon: "pixel-office",
    requiredBridgeFeatures: ["snapshot"],
  },
  load: async () => ({ default: WorldFoundationSurface }),
  createContext: createWorldOfficeContext,
  dispose: (context) => context.dispose(),
});

const worldSettings = defineProductSettingsContribution({
  id: "world-settings",
  label: "World settings",
  createContext: (host) => ({ host }),
  load: async () => ({ default: WorldFoundationSettings }),
  dispose: () => {},
});

export const worldProductAssembly = createProductAssembly({
  surfaceApiVersion: FOUNDATION_SURFACE_API_VERSION,
  surfaces: [...foundationConformanceAssembly.surfaces, officeSurface],
  productSettings: worldSettings,
});

export { FOUNDATION_SURFACE_API_VERSION };
