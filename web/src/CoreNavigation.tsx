import { Suspense, createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { SurfaceDefinition, SurfaceRegistry } from "./surfaceRegistry";

type CoreNavigationValue = {
  activeSurface: SurfaceDefinition;
  navigate: (surfaceId: string) => void;
};

const CoreNavigationContext = createContext<CoreNavigationValue | null>(null);

export function CoreNavigationProvider({
  registry,
  children,
}: {
  registry: SurfaceRegistry;
  children: ReactNode;
}) {
  const defaultSurface = registry.get("spaces") ?? registry.list()[0];
  if (!defaultSurface) {
    throw new Error("Core navigation requires at least one registered surface");
  }
  const [activeId, setActiveId] = useState(
    () => registry.resolvePath(globalThis.location?.pathname ?? "/")?.id ?? defaultSurface.id,
  );

  useEffect(() => {
    const onPopState = () => {
      const next = registry.resolvePath(window.location.pathname) ?? defaultSurface;
      setActiveId(next.id);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [defaultSurface, registry]);

  const activeSurface = registry.get(activeId) ?? defaultSurface;
  const value = useMemo<CoreNavigationValue>(
    () => ({
      activeSurface,
      navigate: (surfaceId) => {
        const next = registry.get(surfaceId);
        if (!next || next.id === activeSurface.id) {
          return;
        }
        window.history.pushState({}, "", next.route);
        setActiveId(next.id);
      },
    }),
    [activeSurface, registry],
  );

  return <CoreNavigationContext.Provider value={value}>{children}</CoreNavigationContext.Provider>;
}

export function CoreSurfaceOutlet({ registry }: { registry: SurfaceRegistry }) {
  const { activeSurface } = useCoreNavigation();
  const Surface = registry.component(activeSurface.id);
  if (!Surface) {
    return <div role="alert">Surface unavailable</div>;
  }
  return (
    <Suspense fallback={<div role="status">Loading {activeSurface.label}…</div>}>
      <Surface />
    </Suspense>
  );
}

export function useCoreNavigation() {
  const value = useContext(CoreNavigationContext);
  if (!value) {
    throw new Error("useCoreNavigation must be used inside CoreNavigationProvider");
  }
  return value;
}
