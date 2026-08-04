import { useEffect, useRef, useState } from "react";
import type { HerdrOfficeProjection } from "./herdrOfficeProjection";
import { createOfficeRenderer } from "./officeRenderer";
import type { OfficeRendererController } from "./officeRenderer";
import { officeDebug } from "../officeDebug";

export type OfficeCanvasAnchor = {
  x: number;
  y: number;
  visible: boolean;
};

export type OfficeCanvasAnchors = {
  agent: OfficeCanvasAnchor | null;
  workbench: OfficeCanvasAnchor | null;
};

export function PixelOfficeCanvas({
  projection,
  selectedKey,
  conversationTargetKey,
  onSelect,
  onActivateAgent,
  onActivateRoom,
  onAnchorChange,
}: {
  projection: HerdrOfficeProjection;
  selectedKey: string | null;
  conversationTargetKey: string | null;
  onSelect: (key: string) => void;
  onActivateAgent: (key: string) => void;
  onActivateRoom: (key: string) => void;
  onAnchorChange?: (anchors: OfficeCanvasAnchors | null) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<OfficeRendererController | null>(null);
  const latestRef = useRef({
    projection,
    selectedKey,
    conversationTargetKey,
    onSelect,
    onActivateAgent,
    onActivateRoom,
    onAnchorChange,
  });
  const [failure, setFailure] = useState(false);
  latestRef.current = {
    projection,
    selectedKey,
    conversationTargetKey,
    onSelect,
    onActivateAgent,
    onActivateRoom,
    onAnchorChange,
  };

  const reportAnchors = () => {
    const callback = latestRef.current.onAnchorChange;
    if (!callback) {
      return;
    }
    const controller = controllerRef.current;
    const host = hostRef.current;
    const scroll = host?.closest<HTMLElement>(".world-stage-scroll");
    const canvas = host?.querySelector<HTMLCanvasElement>("canvas[data-office-canvas='true']");
    const sceneAnchors = controller?.getAnchors(
      latestRef.current.selectedKey,
      latestRef.current.conversationTargetKey,
    );
    if (!scroll || !canvas || !sceneAnchors) {
      callback(null);
      return;
    }
    const canvasRect = canvas.getBoundingClientRect();
    const scrollRect = scroll.getBoundingClientRect();
    const toViewportAnchor = (sceneAnchor: { x: number; y: number } | null) => {
      if (!sceneAnchor) {
        return null;
      }
      const x = canvasRect.left + sceneAnchor.x;
      const y = canvasRect.top + sceneAnchor.y - scroll.scrollTop;
      return {
        x,
        y,
        visible:
          x >= scrollRect.left &&
          x <= scrollRect.right &&
          y >= scrollRect.top &&
          y <= scrollRect.bottom,
      };
    };
    callback({
      agent: toViewportAnchor(sceneAnchors.agent),
      workbench: toViewportAnchor(sceneAnchors.workbench),
    });
  };
  const reportAnchorsRef = useRef(reportAnchors);
  reportAnchorsRef.current = reportAnchors;

  useEffect(() => {
    const element = hostRef.current;
    if (!element) {
      return;
    }
    let disposed = false;
    officeDebug("renderer:mount-request", {
      rooms: latestRef.current.projection.rooms.length,
      agents: latestRef.current.projection.roster.length,
      desks: latestRef.current.projection.deskRoster.length,
    });
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
        officeDebug("renderer:ready", {
          rooms: latestRef.current.projection.rooms.length,
          agents: latestRef.current.projection.roster.length,
          desks: latestRef.current.projection.deskRoster.length,
        });
        const latest = latestRef.current;
        controller.update(latest.projection, latest.selectedKey);
        window.requestAnimationFrame(() => reportAnchorsRef.current());
      })
      .catch((error: unknown) => {
        if (!disposed) {
          officeDebug("renderer:error", {
            error: error instanceof Error ? error.message : String(error),
          });
          if (window.__HERDR_WORLD_RENDERER__) {
            window.__HERDR_WORLD_RENDERER__.lastError =
              error instanceof Error ? error.message.slice(0, 160) : "renderer initialization failed";
          }
          setFailure(true);
        }
      });
    return () => {
      disposed = true;
      officeDebug("renderer:destroy");
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    controllerRef.current?.update(projection, selectedKey);
    window.requestAnimationFrame(() => reportAnchorsRef.current());
  }, [conversationTargetKey, projection, selectedKey]);

  useEffect(() => {
    const host = hostRef.current;
    const scroll = host?.closest<HTMLElement>(".world-stage-scroll");
    if (!scroll) {
      return;
    }
    const scheduleReport = () => window.requestAnimationFrame(() => reportAnchorsRef.current());
    scroll.addEventListener("scroll", scheduleReport, { passive: true });
    window.addEventListener("resize", scheduleReport);
    return () => {
      scroll.removeEventListener("scroll", scheduleReport);
      window.removeEventListener("resize", scheduleReport);
    };
  }, []);

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
