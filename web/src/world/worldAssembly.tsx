import {
  foundationConformanceAssembly,
} from "@herdr-world/foundation";
import {
  createProductAssembly,
  defineSurface,
  FOUNDATION_SURFACE_API_VERSION,
} from "@herdr-world/foundation/surfaces";
import { assertFoundationCompatibility } from "./foundationCompatibility";
import {
  createWorldOfficeContext,
  WorldFoundationSurface,
} from "./worldFoundationSurface";

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

export const worldProductAssembly = createProductAssembly({
  surfaceApiVersion: FOUNDATION_SURFACE_API_VERSION,
  surfaces: [...foundationConformanceAssembly.surfaces, officeSurface],
});

export { FOUNDATION_SURFACE_API_VERSION };
