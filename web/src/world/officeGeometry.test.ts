import { describe, expect, it } from "vitest";
import {
  deskAnchor,
  minimumOfficeWidthForReceptions,
  OFFICE_GEOMETRY,
  receptionAgentAnchor,
  receptionTableRect,
  resolveCeoBlockLayout,
  resolveOfficeLayout,
  standingAnchor,
} from "./officeGeometry";

describe("Pixel Office geometry", () => {
  it("keeps the current two-column office at a readable logical width", () => {
    const narrow = resolveOfficeLayout(375, Array.from({ length: 6 }, () => ({
      deskCount: 1,
      standingCount: 0,
    })));
    expect(narrow).toMatchObject({
      officeWidth: 1000,
      columns: 2,
      rows: 3,
    });
    expect(narrow.rooms).toHaveLength(6);
    expect(narrow.roomStartY).toBe(
      OFFICE_GEOMETRY.ceoBandHeight + OFFICE_GEOMETRY.hallwayHeight,
    );
    expect(narrow.totalHeight).toBeGreaterThan(
      narrow.rooms.at(-1)!.y + narrow.rooms.at(-1)!.height,
    );
  });

  it("expands rooms deterministically for second desk and standing rows", () => {
    const layout = resolveOfficeLayout(1000, [
      { deskCount: 4, standingCount: 0 },
      { deskCount: 8, standingCount: 8 },
      { deskCount: 0, standingCount: 16 },
    ]);
    expect(layout.rooms[1]).toMatchObject({ deskRows: 2, standingRows: 1 });
    expect(layout.rooms[2]).toMatchObject({ deskRows: 0, standingRows: 2 });
    expect(layout.rooms[1].height).toBeGreaterThan(layout.rooms[0].height);
    expect(layout.rooms[2].height).toBeGreaterThan(OFFICE_GEOMETRY.minRoomHeight);
  });

  it("gives smaller rooms a smaller unit footprint while keeping dense rooms readable", () => {
    const layout = resolveOfficeLayout(1000, [
      { deskCount: 2, standingCount: 0 },
      { deskCount: 8, standingCount: 8 },
    ]);
    expect(layout.rooms[0].width).toBeLessThan(layout.rooms[1].width);
    expect(layout.rooms[1].width).toBeGreaterThanOrEqual(OFFICE_GEOMETRY.minRoomWidth);
    expect(layout.rooms[1].deskColumns).toBe(4);
    expect(layout.rooms[1].standingColumns).toBe(8);
    expect(layout.rooms[0].x + layout.rooms[0].width + OFFICE_GEOMETRY.roomGap)
      .toBeLessThanOrEqual(layout.rooms[1].x + 1);
  });

  it("keeps CEO and all host reception desks on one bounded horizontal row", () => {
    const officeWidth = minimumOfficeWidthForReceptions(6);
    const blocks = resolveCeoBlockLayout(officeWidth, 6);
    const receptions = blocks.receptions;
    expect(officeWidth).toBeGreaterThanOrEqual(OFFICE_GEOMETRY.minOfficeWidth);
    expect(receptions).toHaveLength(6);
    expect(blocks.ceoScale).toBe(1);
    expect(blocks.localBlockGap).toBe(OFFICE_GEOMETRY.ceoCompactBlockGap);
    expect(blocks.ceoX).toBe(OFFICE_GEOMETRY.ceoEdgePadding);
    expect(blocks.otelBoardX).toBe(
      blocks.ceoX + blocks.ceoScale * OFFICE_GEOMETRY.ceoDeskWidth + blocks.blockGap,
    );
    expect(blocks.boardX).toBe(
      blocks.otelBoardX + blocks.ceoScale * OFFICE_GEOMETRY.ceoOtelBoardWidth + blocks.blockGap,
    );
    expect(receptions[0].x).toBe(
      blocks.boardX + blocks.ceoScale * OFFICE_GEOMETRY.ceoBoardWidth + blocks.blockGap,
    );
    expect(new Set(receptions.map(({ y }) => y))).toEqual(new Set([36]));
    expect(receptions.every(({ width }) =>
      width <= OFFICE_GEOMETRY.receptionStationMinWidth)).toBe(true);
    expect(receptions.every(({ gapBefore }) => gapBefore === blocks.blockGap)).toBe(true);
    expect(receptions[1].x - (receptions[0].x + receptions[0].width))
      .toBeCloseTo(blocks.blockGap);
    expect(receptions.at(-1)!.x + receptions.at(-1)!.width).toBeLessThanOrEqual(officeWidth - 12);
    expect(blocks.agentBarX).toBeGreaterThan(
      receptions.at(-1)!.x + receptions.at(-1)!.width,
    );
    expect(blocks.agentBarX + blocks.agentBarWidth).toBe(
      officeWidth - OFFICE_GEOMETRY.ceoEdgePadding,
    );
    const agents = Array.from({ length: 4 }, (_, index) =>
      receptionAgentAnchor(receptions[0], index));
    expect(new Set(agents.map(({ x }) => x)).size).toBe(4);
    expect(agents[1].x - agents[0].x).toBeCloseTo(agents[0].stationSpan);
    const table = receptionTableRect(receptions[0]);
    expect(table.width).toBeLessThanOrEqual(OFFICE_GEOMETRY.receptionTableWidth);
    expect(table.x).toBeGreaterThan(receptions[0].x);
    expect(table.x + table.width).toBeLessThan(receptions[0].x + receptions[0].width);
  });

  it("places eight desks in four columns and two rows without collisions", () => {
    const layout = resolveOfficeLayout(1000, [{ deskCount: 8, standingCount: 8 }]);
    const anchors = Array.from({ length: 8 }, (_, index) => deskAnchor(layout.rooms[0], index));
    expect(anchors.map(({ column }) => column)).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
    expect(anchors.map(({ row }) => row)).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
    expect(anchors.every(({ stationSpan }) => stationSpan >= 112)).toBe(true);
    expect(new Set(anchors.map(({ x, deskY }) => `${x}:${deskY}`)).size).toBe(8);
    expect(anchors[0].nameY).toBe(
      layout.rooms[0].y + 42 + OFFICE_GEOMETRY.deskTopOffset,
    );
    expect(anchors[4].nameY - anchors[0].nameY).toBe(OFFICE_GEOMETRY.deskRowHeight);
    expect(anchors.every(({ characterFeetY, deskY }) => characterFeetY - deskY === 20))
      .toBe(true);
  });

  it("places up to sixteen standing agents after the desk rows", () => {
    const layout = resolveOfficeLayout(1000, [{ deskCount: 8, standingCount: 16 }]);
    const desks = Array.from({ length: 8 }, (_, index) => deskAnchor(layout.rooms[0], index));
    const standing = Array.from({ length: 16 }, (_, index) => standingAnchor(layout.rooms[0], index));
    expect(standing.map(({ row }) => row)).toEqual([
      0, 0, 0, 0, 0, 0, 0, 0,
      1, 1, 1, 1, 1, 1, 1, 1,
    ]);
    expect(Math.min(...standing.map(({ nameY }) => nameY)))
      .toBeGreaterThan(Math.max(...desks.map(({ deskY }) => deskY)));
  });

  it("does not invent rooms and clamps pathological counts", () => {
    expect(resolveOfficeLayout(1000, 0).rooms).toHaveLength(0);
    expect(resolveOfficeLayout(1000, 10_000).rooms).toHaveLength(128);
  });
});
