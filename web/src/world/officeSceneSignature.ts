import type { HerdrOfficeProjection } from "./herdrOfficeProjection";
import type { OfficeLayout } from "./officeGeometry";

export function officeSceneSignature({
  layout,
  projection,
  selectedKey,
  completionSeenKeys = new Set<string>(),
  visibleRoomIndices,
}: {
  layout: OfficeLayout;
  projection: HerdrOfficeProjection;
  selectedKey: string | null;
  completionSeenKeys?: ReadonlySet<string>;
  visibleRoomIndices: readonly number[];
}) {
  return JSON.stringify({
    selectedKey,
    completionSeenKeys: [...completionSeenKeys].sort(),
    layout: {
      officeWidth: layout.officeWidth,
      totalHeight: layout.totalHeight,
      barBandY: layout.barBandY,
      rooms: visibleRoomIndices.map((index) => layout.rooms[index] ?? null),
    },
    hosts: projection.hosts,
    rooms: visibleRoomIndices.map((index) => projection.rooms[index] ?? null),
    receptions: projection.receptions,
    barAgents: projection.barAgents,
    coverage: projection.coverage,
  });
}
