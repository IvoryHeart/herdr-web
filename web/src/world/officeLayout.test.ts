import { describe, expect, it } from "vitest";
import {
  OFFICE_GEOMETRY,
  resolveCeoBlockLayout,
} from "./officeGeometry";
import {
  OfficeLayoutPublisher,
  resolveOfficeGeometry,
} from "./officeLayout";

function room(id = "room-1", overrides: Record<string, unknown> = {}) {
  return {
    id,
    kind: "work",
    deskCount: 1,
    standingCount: 0,
    title: "A very long workspace title haiku-4-5-2025",
    hostTitle: "anthropic-long-host-name",
    ...overrides,
  };
}

function contains(outer: { x: number; y: number; width: number; height: number }, inner: typeof outer) {
  return inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height;
}

describe("Office layout contract", () => {
  it("measures expanded and compact headers without letting labels escape the room cap", () => {
    const normal = resolveOfficeGeometry({
      availableViewportWidth: 1000,
      titleMode: "expand",
      roomAlignment: "left",
      rooms: [room()],
    });
    const normalHeader = normal.roomHeaders[0]!;
    expect(normalHeader.emergencyEllipsis).toBe(false);
    expect(normalHeader.workspace).toContain("2025");
    expect(normalHeader.titleBoxWidth).toBeLessThan(normalHeader.width);
    expect(normalHeader.width).toBe(
      normalHeader.titleBoxWidth + normalHeader.actionWidth + normalHeader.actionGap,
    );

    const expanded = resolveOfficeGeometry({
      availableViewportWidth: 1000,
      maximumExpandedRoomWidth: 300,
      titleMode: "expand",
      roomAlignment: "left",
      rooms: [room()],
    });
    const compact = resolveOfficeGeometry({
      availableViewportWidth: 1000,
      maximumExpandedRoomWidth: 300,
      titleMode: "compact",
      roomAlignment: "left",
      rooms: [room()],
    });
    expect(expanded.roomHeaders[0]?.emergencyEllipsis).toBe(true);
    expect(expanded.roomHeaders[0]?.width).toBeLessThanOrEqual(300);
    expect(compact.roomHeaders[0]?.workspace).not.toContain("2025");
    expect(compact.roomHeaders[0]?.width).toBeLessThanOrEqual(300);
  });

  it("keeps nested visual bounds and wrapped CEO content finite", () => {
    const ceo = resolveCeoBlockLayout(OFFICE_GEOMETRY.minOfficeWidth, 6);
    expect(ceo.receptionRows).toBeGreaterThan(1);
    expect(ceo.ceoBandHeight).toBeGreaterThan(OFFICE_GEOMETRY.ceoBandHeight);
    expect(ceo.agentBarX + ceo.agentBarWidth)
      .toBeLessThanOrEqual(OFFICE_GEOMETRY.minOfficeWidth - OFFICE_GEOMETRY.ceoEdgePadding);

    const result = resolveOfficeGeometry({
      availableViewportWidth: OFFICE_GEOMETRY.minOfficeWidth,
      ceoReceptionCount: 6,
      titleMode: "expand",
      roomAlignment: "left",
      rooms: [room()],
    });
    const rect = result.layout.rooms[0];
    expect(rect).toBeDefined();
    expect(contains(rect.outerRect, rect.wallRect)).toBe(true);
    expect(contains(rect.outerRect, rect.headerRect)).toBe(true);
    expect(contains(rect.outerRect, rect.contentSafeRect)).toBe(true);
    expect(contains(rect.outerRect, rect.clipRect)).toBe(true);
    expect(contains(rect.clipRect, rect.inkBounds)).toBe(true);
    expect(rect.y).toBeGreaterThan(ceo.ceoBandHeight);
    expect(rect.x + rect.width).toBeLessThanOrEqual(result.layout.officeWidth);
  });

  it("publishes revisions only for canonical digest changes and gates stale canvas acknowledgements", () => {
    const publisher = new OfficeLayoutPublisher();
    const input = {
      availableViewportWidth: 1000,
      titleMode: "expand" as const,
      roomAlignment: "left" as const,
      rooms: [room()],
    };
    const first = resolveOfficeGeometry(input);
    const publishedA = publisher.publish({ id: "generation-a", canonicalDigest: first.inputDigest }, first);
    const same = publisher.publish({ id: "generation-a-2", canonicalDigest: first.inputDigest }, first);
    expect(same).toBe(publishedA);
    expect(publishedA.layoutRevision).toBe(1);
    expect(publisher.ackCanvasRendered(0)).toBe(false);
    expect(publisher.ackCanvasRendered(publishedA.layoutRevision)).toBe(true);
    expect(publisher.isCanvasReady(publishedA.layoutRevision)).toBe(true);

    const second = resolveOfficeGeometry({ ...input, roomAlignment: "center" });
    const publishedB = publisher.publish({ id: "generation-b", canonicalDigest: second.inputDigest }, second);
    expect(publishedB.layoutRevision).toBe(2);
    expect(publisher.ackCanvasRendered(publishedA.layoutRevision)).toBe(false);
    expect(publisher.canvasRenderedRevision).toBe(publishedA.layoutRevision);

    const backToA = publisher.publish({ id: "generation-a-3", canonicalDigest: first.inputDigest }, first);
    expect(backToA.layoutRevision).toBe(3);
    expect(() => publisher.publish({ id: "generation-b", canonicalDigest: first.inputDigest }, first))
      .toThrow(/reused with different input/);
    expect(() => publisher.publish({ id: "generation-c", canonicalDigest: "wrong" }, first))
      .toThrow(/does not match/);
  });

  it("bounds omission samples while reporting aggregate required overflow", () => {
    const result = resolveOfficeGeometry({
      availableViewportWidth: 1000,
      maxContentItems: 1,
      titleMode: "expand",
      roomAlignment: "left",
      rooms: [room("bounded", {
        contentItems: Array.from({ length: 200 }, (_, index) => ({
          id: `item-${index}`,
          kind: "board",
          importance: "required" as const,
          order: index,
          minWidth: 40,
          minHeight: 20,
        })),
      })],
    });
    expect(result.omissionSummary.total).toBeGreaterThan(8);
    expect(result.omissionSummary.byReason["content-item-count-cap"]).toBeGreaterThan(0);
    expect(result.omissionSummary.samples["content-item-count-cap"]?.length).toBeLessThanOrEqual(8);
    expect(result.accessibleOverflow).toEqual({
      label: "Some required Office content is not shown.",
      required: true,
    });
    expect(result.layout.overflowMarker).toEqual(result.accessibleOverflow);
  });

  it("packs bounded synthetic CEO items into the CEO content region", () => {
    const result = resolveOfficeGeometry({
      availableViewportWidth: OFFICE_GEOMETRY.minOfficeWidth,
      ceoReceptionCount: 6,
      titleMode: "expand",
      roomAlignment: "left",
      ceoContentItems: Array.from({ length: 6 }, (_, index) => ({
        id: `ceo-board-${index}`,
        kind: "board",
        importance: "required" as const,
        order: index,
        minWidth: 220,
        minHeight: 48,
        preferredWidth: 220,
        preferredHeight: 48,
      })),
      rooms: [],
    });
    expect(result.contentItems.filter(({ roomIndex }) => roomIndex === -1)).toHaveLength(6);
    expect(result.layout.ceoContentRect.width).toBeGreaterThan(0);
    expect(result.layout.ceoContentRect.height).toBeGreaterThan(0);
    expect(result.contentItems.filter(({ roomIndex }) => roomIndex === -1).every((item) =>
      contains(result.layout.ceoRect, item.clipRect) && contains(item.clipRect, item.inkBounds),
    )).toBe(true);
  });

  it("uses the bounded fallback when fixed chrome cannot fit the room cap", () => {
    const result = resolveOfficeGeometry({
      availableViewportWidth: 1000,
      maximumExpandedRoomHeight: 4096,
      style: { fixedHeaderChromeHeight: 4096, overflowMarkerMinHeight: 4096, overflowMarkerGap: 1 },
      titleMode: "expand",
      roomAlignment: "left",
      rooms: [room()],
    });
    expect(result.normalizationErrors).toEqual(["invalid-style-capacity"]);
    expect(result.fallbackMessage).toBe("Office layout unavailable");
    expect(result.layout.overflowMarker?.label).toBe("Office layout unavailable");
  });
});
