import { useEffect, useRef, useState } from "react";
import type { HerdrOfficeProjection } from "./herdrOfficeProjection";
import { createOfficeRenderer } from "./officeRenderer";
import type { OfficeRendererController } from "./officeRenderer";

export function PixelOfficeCanvas({
  projection,
  selectedKey,
  onSelect,
  onActivateAgent,
  onActivateRoom,
}: {
  projection: HerdrOfficeProjection;
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onActivateAgent: (key: string) => void;
  onActivateRoom: (key: string) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<OfficeRendererController | null>(null);
  const latestRef = useRef({
    projection,
    selectedKey,
    onSelect,
    onActivateAgent,
    onActivateRoom,
  });
  const [failure, setFailure] = useState(false);
  latestRef.current = {
    projection,
    selectedKey,
    onSelect,
    onActivateAgent,
    onActivateRoom,
  };

  useEffect(() => {
    const element = hostRef.current;
    if (!element) {
      return;
    }
    let disposed = false;
    void createOfficeRenderer(
      element,
      latestRef.current.projection,
      latestRef.current.selectedKey,
      (key) => latestRef.current.onSelect(key),
      (key) => latestRef.current.onActivateAgent(key),
      (key) => latestRef.current.onActivateRoom(key),
    )
      .then((controller) => {
        if (disposed) {
          controller.destroy();
          return;
        }
        controllerRef.current = controller;
        const latest = latestRef.current;
        controller.update(latest.projection, latest.selectedKey);
      })
      .catch((error: unknown) => {
        if (!disposed) {
          if (window.__HERDR_WORLD_RENDERER__) {
            window.__HERDR_WORLD_RENDERER__.lastError =
              error instanceof Error ? error.message.slice(0, 160) : "renderer initialization failed";
          }
          setFailure(true);
        }
      });
    return () => {
      disposed = true;
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.update(projection, selectedKey);
  }, [projection, selectedKey]);

  return (
    <div className="world-canvas-shell">
      {failure ? (
        <div className="world-renderer-fallback" role="status">
          <strong>Visual scene unavailable</strong>
          <span>The complete roster and inspector remain available.</span>
        </div>
      ) : null}
      <div
        ref={hostRef}
        className="world-canvas-host"
        data-renderer={failure ? "unavailable" : "pixi"}
        hidden={failure}
      />
    </div>
  );
}
