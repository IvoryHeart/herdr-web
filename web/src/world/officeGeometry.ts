export const OFFICE_GEOMETRY = Object.freeze({
  minOfficeWidth: 1000,
  ceoBandHeight: 214,
  ceoEdgePadding: 28,
  ceoDeskWidth: 160,
  ceoBoardWidth: 204,
  ceoBoardY: 48,
  ceoBoardHeight: 154,
  ceoBlockGap: 44,
  receptionStationMinWidth: 176,
  receptionTableWidth: 160,
  receptionTableHeight: 42,
  maxReceptionDesks: 6,
  hallwayHeight: 32,
  characterHeight: 68,
  deskWidth: 48,
  deskHeight: 26,
  roomPadding: 16,
  tile: 20,
  barBandHeight: 224,
  barBandGap: 32,
  roomGap: 12,
  maxRooms: 128,
  desksPerRoom: 8,
  deskColumns: 4,
  deskRowHeight: 128,
  deskTopOffset: 14,
  standingColumns: 8,
  standingRowHeight: 112,
  minRoomHeight: 188,
});

export type OfficeRoomPresentation = {
  deskCount: number;
  standingCount: number;
};

export type OfficeReceptionRect = {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  gapBefore: number;
};

export type OfficeCeoBlockLayout = {
  ceoX: number;
  boardX: number;
  blockGap: number;
  receptions: OfficeReceptionRect[];
};

export type OfficeRoomRect = {
  index: number;
  column: number;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
  deskRows: number;
  standingRows: number;
};

export type OfficeLayout = {
  officeWidth: number;
  totalHeight: number;
  columns: 2;
  rows: number;
  roomWidth: number;
  roomStartX: number;
  roomStartY: number;
  barBandY: number;
  rooms: OfficeRoomRect[];
};

export function resolveOfficeLayout(
  requestedWidth: number,
  requestedRooms: number | readonly OfficeRoomPresentation[],
): OfficeLayout {
  const officeWidth = Math.max(
    OFFICE_GEOMETRY.minOfficeWidth,
    Math.floor(Number(requestedWidth) || 0),
  );
  const presentations = typeof requestedRooms === "number"
    ? Array.from(
        { length: boundedCount(requestedRooms, OFFICE_GEOMETRY.maxRooms) },
        () => ({ deskCount: 0, standingCount: 0 }),
      )
    : requestedRooms
        .slice(0, OFFICE_GEOMETRY.maxRooms)
        .map(({ deskCount, standingCount }) => ({
          deskCount: boundedCount(deskCount, OFFICE_GEOMETRY.desksPerRoom),
          standingCount: boundedCount(
            standingCount,
            OFFICE_GEOMETRY.standingColumns * 2,
          ),
        }));
  const count = presentations.length;
  const columns = 2 as const;
  const rows = count > 0 ? Math.ceil(count / columns) : 0;
  const totalRoomSpace = officeWidth - 24 - OFFICE_GEOMETRY.roomGap;
  const roomWidth = Math.floor(totalRoomSpace / columns);
  const roomStartX =
    (officeWidth - (columns * roomWidth + OFFICE_GEOMETRY.roomGap)) / 2;
  const roomStartY = OFFICE_GEOMETRY.ceoBandHeight + OFFICE_GEOMETRY.hallwayHeight;
  const roomMetrics = presentations.map(({ deskCount, standingCount }) => {
    const deskRows = Math.ceil(deskCount / OFFICE_GEOMETRY.deskColumns);
    const standingRows = Math.ceil(standingCount / OFFICE_GEOMETRY.standingColumns);
    const contentHeight = 42 +
      deskRows * OFFICE_GEOMETRY.deskRowHeight +
      standingRows * OFFICE_GEOMETRY.standingRowHeight +
      18;
    return {
      deskRows,
      standingRows,
      height: Math.max(OFFICE_GEOMETRY.minRoomHeight, contentHeight),
    };
  });
  const rowHeights = Array.from({ length: rows }, (_, row) =>
    Math.max(
      ...roomMetrics
        .slice(row * columns, row * columns + columns)
        .map(({ height }) => height),
    ),
  );
  const rowYs: number[] = [];
  let nextY = roomStartY;
  for (const height of rowHeights) {
    rowYs.push(nextY);
    nextY += height + OFFICE_GEOMETRY.roomGap;
  }
  const rooms = presentations.map((_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      index,
      column,
      row,
      x: roomStartX + column * (roomWidth + OFFICE_GEOMETRY.roomGap),
      y: rowYs[row],
      width: roomWidth,
      height: roomMetrics[index].height,
      deskRows: roomMetrics[index].deskRows,
      standingRows: roomMetrics[index].standingRows,
    };
  });
  const barBandY = nextY + OFFICE_GEOMETRY.barBandGap;
  const totalHeight = barBandY + OFFICE_GEOMETRY.barBandHeight + 30;
  return {
    officeWidth,
    totalHeight,
    columns,
    rows,
    roomWidth,
    roomStartX,
    roomStartY,
    barBandY,
    rooms,
  };
}

export function minimumOfficeWidthForReceptions(receptionCount: number) {
  const count = boundedCount(receptionCount, OFFICE_GEOMETRY.maxReceptionDesks);
  return Math.max(
    OFFICE_GEOMETRY.minOfficeWidth,
    OFFICE_GEOMETRY.ceoEdgePadding * 2 +
      OFFICE_GEOMETRY.ceoDeskWidth +
      OFFICE_GEOMETRY.ceoBoardWidth +
      count * OFFICE_GEOMETRY.receptionStationMinWidth +
      (count + 1) * OFFICE_GEOMETRY.ceoBlockGap,
  );
}

export function resolveCeoBlockLayout(
  officeWidth: number,
  receptionCount: number,
): OfficeCeoBlockLayout {
  const count = boundedCount(receptionCount, OFFICE_GEOMETRY.maxReceptionDesks);
  const fixedWidth = OFFICE_GEOMETRY.ceoDeskWidth +
    OFFICE_GEOMETRY.ceoBoardWidth +
    count * OFFICE_GEOMETRY.receptionStationMinWidth;
  const gapCount = count + 1;
  const blockGap = Math.max(
    OFFICE_GEOMETRY.ceoBlockGap,
    (officeWidth - OFFICE_GEOMETRY.ceoEdgePadding * 2 - fixedWidth) / gapCount,
  );
  const ceoX = OFFICE_GEOMETRY.ceoEdgePadding;
  const boardX = ceoX + OFFICE_GEOMETRY.ceoDeskWidth + blockGap;
  const receptionStartX = boardX + OFFICE_GEOMETRY.ceoBoardWidth + blockGap;
  const availableReceptionWidth = Math.max(
    0,
    officeWidth - OFFICE_GEOMETRY.ceoEdgePadding - receptionStartX,
  );
  const stationWidth = count > 0
    ? Math.min(
        OFFICE_GEOMETRY.receptionStationMinWidth,
        Math.max(0, (availableReceptionWidth - blockGap * (count - 1)) / count),
      )
    : 0;
  const receptions = Array.from({ length: count }, (_, index) => ({
    index,
    x: receptionStartX + index * (stationWidth + blockGap),
    y: 36,
    width: stationWidth,
    height: 160,
    gapBefore: blockGap,
  }));
  return { ceoX, boardX, blockGap, receptions };
}

export function resolveReceptionLayout(
  officeWidth: number,
  receptionCount: number,
): OfficeReceptionRect[] {
  return resolveCeoBlockLayout(officeWidth, receptionCount).receptions;
}

export function receptionAgentAnchor(
  reception: OfficeReceptionRect,
  agentIndex: number,
) {
  const index = boundedCount(agentIndex, 3);
  const stationSpan = reception.width / 4;
  return {
    index,
    stationSpan,
    x: reception.x + stationSpan * (index + 0.5),
    nameY: reception.y + 35,
    characterFeetY: reception.y + 112,
  };
}

export function receptionTableRect(reception: OfficeReceptionRect) {
  const width = Math.min(
    OFFICE_GEOMETRY.receptionTableWidth,
    Math.max(0, reception.width - 8),
  );
  return {
    x: reception.x + (reception.width - width) / 2,
    y: reception.y + 96,
    width,
    height: OFFICE_GEOMETRY.receptionTableHeight,
  };
}

export function deskAnchor(room: OfficeRoomRect, deskIndex: number) {
  const index = boundedCount(deskIndex, OFFICE_GEOMETRY.desksPerRoom - 1);
  const column = index % OFFICE_GEOMETRY.deskColumns;
  const row = Math.floor(index / OFFICE_GEOMETRY.deskColumns);
  const innerWidth = room.width - OFFICE_GEOMETRY.roomPadding * 2;
  const stationSpan = innerWidth / OFFICE_GEOMETRY.deskColumns;
  const x =
    room.x +
    OFFICE_GEOMETRY.roomPadding +
    stationSpan * (column + 0.5);
  const nameY = room.y + 42 + OFFICE_GEOMETRY.deskTopOffset + row * OFFICE_GEOMETRY.deskRowHeight;
  const characterFeetY = nameY + 37 + OFFICE_GEOMETRY.characterHeight;
  return {
    index,
    column,
    row,
    stationSpan,
    x,
    nameY,
    characterFeetY,
    deskY: characterFeetY - 20,
  };
}

export function standingAnchor(
  room: OfficeRoomRect,
  standingIndex: number,
) {
  const index = boundedCount(
    standingIndex,
    OFFICE_GEOMETRY.standingColumns * 2 - 1,
  );
  const column = index % OFFICE_GEOMETRY.standingColumns;
  const row = Math.floor(index / OFFICE_GEOMETRY.standingColumns);
  const innerWidth = room.width - OFFICE_GEOMETRY.roomPadding * 2;
  const stationSpan = innerWidth / OFFICE_GEOMETRY.standingColumns;
  const x =
    room.x +
    OFFICE_GEOMETRY.roomPadding +
    stationSpan * (column + 0.5);
  const nameY =
    room.y +
    42 +
    OFFICE_GEOMETRY.deskTopOffset +
    room.deskRows * OFFICE_GEOMETRY.deskRowHeight +
    row * OFFICE_GEOMETRY.standingRowHeight;
  return {
    index,
    column,
    row,
    stationSpan,
    x,
    nameY,
    characterFeetY: nameY + 96,
  };
}

function boundedCount(value: number, maximum: number) {
  return Math.max(0, Math.min(maximum, Math.floor(Number(value) || 0)));
}
