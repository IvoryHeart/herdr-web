import { describe, expect, it } from "vitest";
import { deskAnchor, OFFICE_GEOMETRY, resolveOfficeLayout } from "./officeGeometry";

describe("Pixel Office geometry", () => {
  it("keeps a two-column office at a readable logical width", () => {
    const narrow = resolveOfficeLayout(375, 6);
    expect(narrow).toMatchObject({
      officeWidth: 1000,
      columns: 2,
      rows: 3,
      roomHeight: 208,
    });
    expect(narrow.rooms).toHaveLength(6);
    expect(narrow.roomStartY).toBe(
      OFFICE_GEOMETRY.ceoBandHeight + OFFICE_GEOMETRY.hallwayHeight,
    );
    expect(narrow.reviewBandY).toBeGreaterThan(
      narrow.rooms.at(-1)!.y + narrow.roomHeight,
    );
  });

  it("extends vertically and preserves four readable desk stations", () => {
    const six = resolveOfficeLayout(1000, 6);
    const ten = resolveOfficeLayout(1000, 10);
    expect(ten.roomWidth).toBe(six.roomWidth);
    expect(ten.reviewBandY).toBeGreaterThan(six.reviewBandY);
    const anchors = Array.from({ length: 4 }, (_, index) => deskAnchor(ten.rooms[0], index));
    expect(anchors.map((anchor) => anchor.column)).toEqual([0, 1, 2, 3]);
    expect(anchors.every((anchor) => anchor.stationSpan >= 112)).toBe(true);
    expect(new Set(anchors.map((anchor) => `${anchor.x}:${anchor.deskY}`)).size).toBe(4);
    expect(anchors.every(
      (anchor) => anchor.characterFeetY - anchor.deskY === 20,
    )).toBe(true);
  });

  it("does not invent rooms and clamps pathological counts", () => {
    expect(resolveOfficeLayout(1000, 0).rooms).toHaveLength(0);
    expect(resolveOfficeLayout(1000, 10_000).rooms).toHaveLength(128);
  });
});
