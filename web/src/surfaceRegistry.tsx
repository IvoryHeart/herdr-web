import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";

export type SurfaceHostScope = "single-host" | "multi-host";

export type SurfaceDefinition = {
  id: string;
  label: string;
  route: `/${string}` | "/";
  semanticIcon: string;
  hostScope: SurfaceHostScope;
  requiredCapabilities: readonly string[];
  load: () => Promise<{ default: ComponentType }>;
};

export class SurfaceRegistry {
  readonly #definitions = new Map<string, SurfaceDefinition>();
  readonly #components = new Map<string, LazyExoticComponent<ComponentType>>();

  constructor(definitions: readonly SurfaceDefinition[]) {
    for (const definition of definitions) {
      if (this.#definitions.has(definition.id)) {
        throw new Error(`Duplicate surface ID: ${definition.id}`);
      }
      if (!/^[a-z][a-z0-9-]*$/u.test(definition.id)) {
        throw new Error(`Invalid surface ID: ${definition.id}`);
      }
      if (!definition.route.startsWith("/")) {
        throw new Error(`Invalid surface route: ${definition.route}`);
      }
      this.#definitions.set(definition.id, Object.freeze({ ...definition }));
    }
  }

  list() {
    return [...this.#definitions.values()];
  }

  get(id: string) {
    return this.#definitions.get(id) ?? null;
  }

  resolvePath(pathname: string) {
    return this.list().find((surface) => surface.route === pathname) ?? null;
  }

  component(id: string) {
    const definition = this.get(id);
    if (!definition) {
      return null;
    }
    let component = this.#components.get(id);
    if (!component) {
      component = lazy(definition.load);
      this.#components.set(id, component);
    }
    return component;
  }
}

export const coreSurfaceRegistry = new SurfaceRegistry([
  {
    id: "spaces",
    label: "Spaces",
    route: "/",
    semanticIcon: "terminal-workspaces",
    hostScope: "multi-host",
    requiredCapabilities: ["snapshot", "terminal_attach"],
    load: () => import("./App").then((module) => ({ default: module.App })),
  },
]);
