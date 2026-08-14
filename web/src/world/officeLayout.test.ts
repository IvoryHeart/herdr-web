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
    const normalRect = normal.layout.rooms[0];
    expect(normalHeader.emergencyEllipsis).toBe(false);
    expect(normalHeader.workspace).toContain("2025");
    expect(normalHeader.titleBoxWidth).toBeLessThan(normalHeader.width);
    expect(normalHeader.width).toBeGreaterThanOrEqual(
      normalHeader.titleBoxWidth +
        2 * (
          normalHeader.renameWidth +
          normalHeader.actionGap +
          normalHeader.closeWidth +
          normalHeader.closeGap
        ) +
        OFFICE_GEOMETRY.roomHeaderSafeInset * 2,
    );
    expect(normalRect.width).toBeGreaterThanOrEqual(normalHeader.width);
    expect(normalRect.header?.titleBoxX).toBeGreaterThan(0);
    expect(normalRect.header?.titleBoxX).toBeCloseTo(
      (normalRect.headerRect.width - normalHeader.titleBoxWidth) / 2,
    );
    expect(normalRect.header!.renameX + normalHeader.renameWidth + normalHeader.closeGap)
      .toBeLessThanOrEqual(normalRect.header!.closeX);
    expect(normalRect.header!.closeX + normalHeader.closeWidth)
      .toBe(normalRect.headerRect.width);

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

    const measured = resolveOfficeGeometry({
      availableViewportWidth: 1000,
      titleMode: "expand",
      roomAlignment: "left",
      rooms: [room("measured", { headerMinTitleBoxWidth: 500 })],
    });
    expect(measured.roomHeaders[0]!.titleBoxWidth).toBeGreaterThanOrEqual(500);
  });

  it("makes the room wide enough for either the header group or a desk row", () => {
    const longHeader = resolveOfficeGeometry({
      availableViewportWidth: 1000,
      titleMode: "expand",
      roomAlignment: "left",
      rooms: [room("long-header", { deskCount: 1 })],
    });
    const manyDesks = resolveOfficeGeometry({
      availableViewportWidth: 1000,
      titleMode: "expand",
      roomAlignment: "left",
      rooms: [room("many-desks", {
        title: "ROOM",
        hostTitle: "HOST",
        deskCount: OFFICE_GEOMETRY.desksPerRoom,
      })],
    });
    const headerRect = longHeader.layout.rooms[0];
    const deskRect = manyDesks.layout.rooms[0];
    expect(headerRect.width).toBeGreaterThanOrEqual(longHeader.roomHeaders[0]!.width);
    expect(deskRect.width).toBeGreaterThanOrEqual(
      OFFICE_GEOMETRY.roomPadding * 2 +
        deskRect.deskColumns * 112,
    );
    expect(deskRect.width).toBeGreaterThanOrEqual(manyDesks.roomHeaders[0]!.width);
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
    expect(publisher.ackCanvasRendered(publishedB.layoutRevision + 1)).toBe(false);
    expect(publisher.canvasRenderedRevision).toBe(publishedA.layoutRevision);

    const backToA = publisher.publish({ id: "generation-a-3", canonicalDigest: first.inputDigest }, first);
    expect(backToA.layoutRevision).toBe(3);
    expect(() => publisher.publish({ id: "generation-b", canonicalDigest: first.inputDigest }, first))
      .toThrow(/reused with different input/);
    expect(() => publisher.publish({ id: "generation-c", canonicalDigest: "wrong" }, first))
      .toThrow(/does not match/);
  });

  it("publishes the complete immutable geometry snapshot", () => {
    const result = resolveOfficeGeometry({
      availableViewportWidth: 1000,
      titleMode: "expand",
      roomAlignment: "left",
      rooms: [room("published")],
    });
    const published = new OfficeLayoutPublisher().publish(
      { id: "published-generation", canonicalDigest: result.inputDigest },
      result,
    );
    expect(published.generationId).toBe("published-generation");
    expect(published.normalizedInput.minimumLogicalCanvasWidth).toBeDefined();
    expect(published.roomHeaders).toEqual(result.roomHeaders);
    expect(published.rows).toEqual(result.rows);
    expect(published.contentItems).toEqual(result.contentItems);
    expect(published.omissionSummary).toEqual(result.omissionSummary);
    expect(Object.isFrozen(published)).toBe(true);
    expect(Object.isFrozen(published.rooms)).toBe(true);
    expect(Object.isFrozen(published.rooms[0])).toBe(true);
    expect(Object.isFrozen(published.normalizedInput)).toBe(true);
    expect(Object.isFrozen(published.normalizedInput.rooms)).toBe(true);
    expect(Object.isFrozen(published.normalizedInput.rooms[0].contentItems)).toBe(true);
    expect(Object.isFrozen(published.ceoBlocks)).toBe(true);
    expect(Object.isFrozen(published.ceoBlocks.receptions)).toBe(true);
  });

  it("uses a stable digest for equivalent descriptor property order", () => {
    const firstRoom = {
      id: "same",
      title: "Same title",
      hostTitle: "Same host",
      deskCount: 1,
      standingCount: 0,
      contentItems: [],
      ignored: "not part of the contract",
    };
    const secondRoom = {
      contentItems: [],
      standingCount: 0,
      deskCount: 1,
      hostTitle: "Same host",
      title: "Same title",
      id: "same",
      ignored: { changed: true },
    };
    const first = resolveOfficeGeometry({
      availableViewportWidth: 1000,
      titleMode: "expand",
      roomAlignment: "left",
      rooms: [firstRoom],
    });
    const second = resolveOfficeGeometry({
      availableViewportWidth: 1000,
      titleMode: "expand",
      roomAlignment: "left",
      rooms: [secondRoom],
    });
    expect(second.inputDigest).toBe(first.inputDigest);
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

  it("accounts for every item beyond the bounded content cap", () => {
    const result = resolveOfficeGeometry({
      availableViewportWidth: 1000,
      maxContentItems: 128,
      titleMode: "expand",
      roomAlignment: "left",
      rooms: [room("large-input", {
        contentItems: Array.from({ length: 3000 }, (_, index) => ({
          id: `large-${index}`,
          kind: "board",
          importance: "optional" as const,
          order: index,
          minWidth: 20,
          minHeight: 20,
        })),
      })],
    });
    expect(result.omissionSummary.byReason["content-item-count-cap"]).toBe(2872);
    expect(result.omissionSummary.samples["content-item-count-cap"]).toHaveLength(8);
  });

  it("reserves width for explicit room and content minima", () => {
    const roomMinimum = resolveOfficeGeometry({
      availableViewportWidth: 1000,
      maximumExpandedCanvasWidth: 2200,
      maximumExpandedRoomWidth: 2000,
      titleMode: "expand",
      roomAlignment: "left",
      rooms: [room("room-minimum", { contentMinWidth: 1800 })],
    });
    expect(roomMinimum.layout.rooms[0].width).toBeGreaterThanOrEqual(1800);

    const contentMinimum = resolveOfficeGeometry({
      availableViewportWidth: 1000,
      maximumExpandedCanvasWidth: 2200,
      maximumExpandedRoomWidth: 2000,
      titleMode: "expand",
      roomAlignment: "left",
      rooms: [room("content-minimum", {
        contentItems: [{
          id: "wide-board",
          kind: "board",
          importance: "required",
          order: 0,
          minWidth: 1600,
          minHeight: 20,
        }],
      })],
    });
    expect(contentMinimum.layout.rooms[0].width).toBeGreaterThanOrEqual(1600);
    expect(contentMinimum.contentItems[0].width).toBeGreaterThanOrEqual(1600);
  });

  it("places the first column item in row zero and honors exact row capacity", () => {
    const oneRow = resolveOfficeGeometry({
      availableViewportWidth: 1000,
      maxLayoutRows: 1,
      titleMode: "expand",
      roomAlignment: "left",
      rooms: [room("column-one", {
        flow: "column",
        contentItems: [
          { id: "first", kind: "board", importance: "required", order: 0, minWidth: 40, minHeight: 40 },
        ],
      })],
    });
    expect(oneRow.contentItems).toHaveLength(1);
    expect(oneRow.contentItems[0].y).toBe(oneRow.layout.rooms[0].contentSafeRect.y);

    const twoRows = resolveOfficeGeometry({
      availableViewportWidth: 1000,
      maxLayoutRows: 2,
      titleMode: "expand",
      roomAlignment: "left",
      rooms: [room("column-two", {
        flow: "column",
        contentItems: [
          { id: "first", kind: "board", importance: "required", order: 0, minWidth: 40, minHeight: 40 },
          { id: "second", kind: "board", importance: "required", order: 1, minWidth: 40, minHeight: 40 },
        ],
      })],
    });
    expect(twoRows.contentItems).toHaveLength(2);
    expect(twoRows.contentItems[1].y).toBeGreaterThan(twoRows.contentItems[0].y);
    expect(twoRows.contentItems[1].y).toBe(
      twoRows.contentItems[0].y + twoRows.contentItems[0].height + 8,
    );
  });

  it("keeps row flow bounded while wrapping and spanning remain explicit", () => {
    const items = [
      { id: "first", kind: "board", importance: "required" as const, order: 0, minWidth: 40, minHeight: 40, preferredWidth: 160 },
      { id: "second", kind: "board", importance: "required" as const, order: 1, minWidth: 40, minHeight: 40, preferredWidth: 160 },
    ];
    const row = resolveOfficeGeometry({
      availableViewportWidth: 1000,
      titleMode: "expand",
      roomAlignment: "left",
      rooms: [room("row-flow", { title: "ROOM", hostTitle: "HOST", flow: "row", contentItems: items })],
    });
    expect(row.contentItems).toHaveLength(1);
    expect(row.omissionSummary.byReason["canvas-capacity-exhausted"]).toBe(1);

    const wrapped = resolveOfficeGeometry({
      availableViewportWidth: 1000,
      titleMode: "expand",
      roomAlignment: "left",
      rooms: [room("grid-flow", { title: "ROOM", hostTitle: "HOST", flow: "grid", contentItems: items })],
    });
    expect(wrapped.contentItems).toHaveLength(2);
    expect(wrapped.contentItems[1].y).toBeGreaterThan(wrapped.contentItems[0].y);

    const spanning = resolveOfficeGeometry({
      availableViewportWidth: 1000,
      titleMode: "expand",
      roomAlignment: "left",
      rooms: [room("span-flow", {
        title: "ROOM",
        hostTitle: "HOST",
        spanPolicy: "multi-row",
        contentItems: [items[0]],
      })],
    });
    expect(spanning.contentItems[0].width).toBe(spanning.layout.rooms[0].contentSafeRect.width);
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
