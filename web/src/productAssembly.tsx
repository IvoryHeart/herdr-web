import { createElement } from "react";
import type { ReactNode } from "react";
import {
  createProductAssembly,
  FOUNDATION_SURFACE_API_VERSION,
  loadOpaqueSurface,
} from "@herdr-world/foundation/surfaces";
import type { ProductAssembly } from "@herdr-world/foundation/surfaces";
import { coreSurfaceRegistry, SurfaceRegistry } from "./surfaceRegistry";
import { officeDefinition, officeRegistration, officeSettingsContribution } from "./world/assembly";

/**
 * The World product is assembled here. The Foundation conformance registry
 * remains Spaces-only and can be built without this module or its assets.
 */
export const productAssembly: ProductAssembly = createProductAssembly({
  surfaceApiVersion: FOUNDATION_SURFACE_API_VERSION,
  surfaces: [
    ...coreSurfaceRegistry.registrations(),
    officeRegistration,
  ],
  productSettings: officeSettingsContribution,
});

export const productSurfaceRegistry = new SurfaceRegistry([
  ...coreSurfaceRegistry.list(),
  {
    ...officeDefinition,
    load: async () => {
      const loaded = await loadOpaqueSurface(officeRegistration);
      return {
        default: ({ context }: { context?: unknown }) =>
          createElement(loaded.default as unknown as (props: { context?: unknown }) => ReactNode, {
            context,
          }),
      };
    },
  },
]);

export { officeDefinition };
