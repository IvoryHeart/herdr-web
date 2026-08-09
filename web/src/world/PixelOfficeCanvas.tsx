import { useEffect, useRef, useState } from "react";
import type { HerdrOfficeProjection } from "./herdrOfficeProjection";
import { createOfficeRenderer } from "./officeRenderer";
import type { OfficeRendererController } from "./officeRenderer";
import { officeDebug } from "../officeDebug";

export type OfficeCanvasAnchor = {
  x: number;
  y: number;
  visible: boolean;
  edge: "top" | "right" | "bottom" | "left" | null;
};

export type OfficeCanvasAnchors = {
  agent: OfficeCanvasAnchor | null;
  workbench: OfficeCanvasAnchor | null;
};

export type OfficeConversationAnchorTarget = {
  id: string;
  selectedKey: string | null;
  targetKey: string;
};

export type OfficeConversationAnchors = Record<string, OfficeCanvasAnchors>;

export function PixelOfficeCanvas({
  projection,
  selectedKey,
  completionSeenKeys,
  conversationTargets,
  onSelect,
  onActivateAgent,
  onActivateRoom,
  onAnchorChange,
}: {
  projection: HerdrOfficeProjection;
  selectedKey: string | null;
  completionSeenKeys: ReadonlySet<string>;
  conversationTargets: readonly OfficeConversationAnchorTarget[];
  onSelect: (key: string) => void;
  onActivateAgent: (key: string) => void;
  onActivateRoom: (key: string) => void;
  onAnchorChange?: (anchors: OfficeConversationAnchors | null) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<OfficeRendererController | null>(null);
  const latestRef = useRef({
    projection,
    selectedKey,
    completionSeenKeys,
    conversationTargets,
    onSelect,
    onActivateAgent,
    onActivateRoom,
    onAnchorChange,
  });
  const [failure, setFailure] = useState(false);
  latestRef.current = {
    projection,
    selectedKey,
    completionSeenKeys,
    conversationTargets,
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
    if (!scroll || !canvas || !controller) {
      callback(null);
      return;
    }
    const canvasRect = canvas.getBoundingClientRect();
    const scrollRect = scroll.getBoundingClientRect();
    const toViewportAnchor = (
      sceneAnchor: { x: number; y: number } | null,
    ): OfficeCanvasAnchor | null => {
      if (!sceneAnchor) {
        return null;
      }
      const x = canvasRect.left + sceneAnchor.x;
      const y = canvasRect.top + sceneAnchor.y - scroll.scrollTop;
      const visible =
        x >= scrollRect.left &&
        x <= scrollRect.right &&
        y >= scrollRect.top &&
        y <= scrollRect.bottom;
      const horizontalDistance = x < scrollRect.left
        ? scrollRect.left - x
        : x > scrollRect.right
          ? x - scrollRect.right
          : 0;
      const verticalDistance = y < scrollRect.top
        ? scrollRect.top - y
        : y > scrollRect.bottom
          ? y - scrollRect.bottom
          : 0;
      const edge: OfficeCanvasAnchor["edge"] = visible
        ? null
        : horizontalDistance > verticalDistance
          ? x < scrollRect.left ? "left" : "right"
          : y < scrollRect.top ? "top" : "bottom";
      const edgeInset = 10;
      return {
        x: edge === "left"
          ? scrollRect.left + edgeInset
          : edge === "right"
            ? scrollRect.right - edgeInset
            : x,
        y: edge === "top"
          ? scrollRect.top + edgeInset
          : edge === "bottom"
            ? scrollRect.bottom - edgeInset
            : y,
        visible,
        edge,
      };
    };
    const anchors: OfficeConversationAnchors = {};
    for (const target of latestRef.current.conversationTargets) {
      const sceneAnchors = controller.getAnchors(target.selectedKey, target.targetKey);
      if (!sceneAnchors) {
        continue;
      }
      anchors[target.id] = {
        agent: toViewportAnchor(sceneAnchors.agent),
        workbench: toViewportAnchor(sceneAnchors.workbench),
      };
    }
    callback(anchors);
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
      latestRef.current.completionSeenKeys,
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
        controller.update(latest.projection, latest.selectedKey, latest.completionSeenKeys);
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
    controllerRef.current?.update(projection, selectedKey, completionSeenKeys);
    window.requestAnimationFrame(() => reportAnchorsRef.current());
  }, [completionSeenKeys, conversationTargets, projection, selectedKey]);

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
