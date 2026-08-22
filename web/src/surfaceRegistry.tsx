import { createElement, lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";
import {
  defineSurface,
  loadOpaqueSurface,
  validateSurfaceDefinition,
} from "@herdr-world/foundation/surfaces";
import type {
  OpaqueSurfaceRegistration,
  SurfaceDefinition as FoundationSurfaceDefinition,
} from "@herdr-world/foundation/surfaces";
import SpacesSurface from "./SpacesSurface";

export type SurfaceHostScope = "single-host" | "multi-host";
export type SurfaceSlot = "sidebar" | "stage";

export type SurfaceComponentProps = {
  slot?: SurfaceSlot;
  context?: unknown;
};

/**
 * Foundation's public definition with the existing sidebar admission metadata
 * retained for the integration app. `requiredCapabilities` is an exact alias
 * of the public `requiredBridgeFeatures` field, never a second catalogue.
 */
export type SurfaceDefinition = Omit<FoundationSurfaceDefinition, "requiredBridgeFeatures"> & {
  hostScope: SurfaceHostScope;
  requiredCapabilities: readonly string[];
  requiredBridgeFeatures?: readonly string[];
  load: () => Promise<{ default: ComponentType<SurfaceComponentProps> }>;
};

export type SurfaceRegistration = {
  definition: SurfaceDefinition;
  opaque: OpaqueSurfaceRegistration;
};

function toOpaqueRegistration(definition: SurfaceDefinition): OpaqueSurfaceRegistration {
  const publicDefinition: FoundationSurfaceDefinition = validateSurfaceDefinition({
    id: definition.id,
    label: definition.label,
    route: definition.route,
    semanticIcon: definition.semanticIcon,
    requiredBridgeFeatures: definition.requiredCapabilities,
  });
  return defineSurface<unknown>({
    definition: publicDefinition,
    createContext: () => undefined,
    load: async () => {
      const loaded = await definition.load();
      return {
        default: ({ context }: { context: unknown }) =>
          createElement(loaded.default, { slot: "stage", context }),
      };
    },
    dispose: () => undefined,
  });
}

export class SurfaceRegistry {
  readonly #definitions = new Map<string, SurfaceDefinition>();
  readonly #registrations = new Map<string, OpaqueSurfaceRegistration>();
  readonly #components = new Map<
    string,
    LazyExoticComponent<ComponentType<SurfaceComponentProps>>
  >();

  constructor(definitions: readonly SurfaceDefinition[]) {
    for (const definition of definitions) {
      if (this.#definitions.has(definition.id)) {
        throw new Error(`Duplicate surface ID: ${definition.id}`);
      }
      const publicDefinition = validateSurfaceDefinition({
        id: definition.id,
        label: definition.label,
        route: definition.route,
        semanticIcon: definition.semanticIcon,
        requiredBridgeFeatures: definition.requiredCapabilities,
      });
      if ([...this.#definitions.values()].some((item) => item.route === publicDefinition.route)) {
        throw new Error(`Duplicate surface route: ${publicDefinition.route}`);
      }
      const normalized = Object.freeze({
        ...definition,
        ...publicDefinition,
        requiredCapabilities: publicDefinition.requiredBridgeFeatures,
      });
      this.#definitions.set(normalized.id, normalized);
      this.#registrations.set(normalized.id, toOpaqueRegistration(normalized));
    }
  }

  list() {
    return [...this.#definitions.values()];
  }

  registrations() {
    return [...this.#registrations.values()];
  }

  get(id: string) {
    return this.#definitions.get(id) ?? null;
  }

  registration(id: string) {
    return this.#registrations.get(id) ?? null;
  }

  resolvePath(pathname: string) {
    const normalizedPath = pathname.length > 1
      ? pathname.replace(/\/+$/u, "")
      : pathname;
    return this.list().find((surface) => surface.route === normalizedPath) ?? null;
  }

  component(id: string) {
    const definition = this.get(id);
    const registration = this.registration(id);
    if (!definition || !registration) {
      return null;
    }
    let component = this.#components.get(id);
    if (!component) {
      component = lazy(async () => {
        const loaded = await loadOpaqueSurface(registration);
        return { default: loaded.default as ComponentType<SurfaceComponentProps> };
      });
      this.#components.set(id, component);
    }
    return component;
  }

  missingCapabilities(id: string, capabilities: { features?: readonly string[] } | null) {
    const definition = this.get(id);
    if (!definition) {
      return [];
    }
    const available = new Set(capabilities?.features ?? []);
    return definition.requiredCapabilities.filter((capability) => !available.has(capability));
  }

  supports(id: string, capabilities: { features?: readonly string[] } | null) {
    return this.missingCapabilities(id, capabilities).length === 0;
  }
}

/** Foundation conformance registry: generic shell + Spaces only. */
export const coreSurfaceRegistry = new SurfaceRegistry([
  {
    id: "spaces",
    label: "Spaces",
    route: "/",
    semanticIcon: "terminal-workspaces",
    hostScope: "multi-host",
    requiredCapabilities: ["snapshot", "terminal_attach"],
    requiredBridgeFeatures: ["snapshot", "terminal_attach"],
    load: async () => ({ default: SpacesSurface }),
  },
]);
