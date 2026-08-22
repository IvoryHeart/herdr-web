import { defineProductSettings, defineSurface } from "@herdr-world/foundation/surfaces";

type SurfaceContext = { surface: "spaces" };
type OtherContext = { surface: "other" };

defineSurface<SurfaceContext>({
  definition: {
    id: "spaces",
    label: "Spaces",
    route: "/",
    semanticIcon: "spaces",
    requiredBridgeFeatures: [],
  },
  createContext: () => ({ surface: "spaces" }),
  // @ts-expect-error A component from another context cannot be paired with this registration.
  load: async () => ({ default: (props: { context: OtherContext }) => props.context }),
  dispose: () => {},
});

defineProductSettings<SurfaceContext>({
  id: "settings",
  label: "Settings",
  createContext: () => ({ surface: "spaces" }),
  // @ts-expect-error Settings component context is bound to its contribution.
  load: async () => ({ default: (props: { context: OtherContext; onClose: () => void }) => props.context }),
  dispose: () => {},
});
