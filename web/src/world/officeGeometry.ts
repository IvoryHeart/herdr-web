export const OFFICE_GEOMETRY = Object.freeze({
  minOfficeWidth: 1000,
  ceoBandHeight: 214,
  ceoEdgePadding: 28,
  ceoDeskWidth: 160,
  ceoBoardWidth: 204,
  ceoOtelBoardWidth: 204,
  ceoBoardY: 48,
  ceoBoardHeight: 154,
  ceoBlockGap: 24,
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
  roomGap: 12,
  maxRooms: 128,
  desksPerRoom: 8,
  deskColumns: 4,
  deskRowHeight: 128,
  deskTopOffset: 14,
  standingColumns: 8,
  standingRowHeight: 112,
  minRoomWidth: 220,
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
  otelBoardX: number;
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
  deskColumns: number;
  standingColumns: number;
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
  const availableRoomWidth = Math.max(0, officeWidth - 24);
  const roomStartY = OFFICE_GEOMETRY.ceoBandHeight + OFFICE_GEOMETRY.hallwayHeight;
  const roomMetrics = presentations.map(({ deskCount, standingCount }) => {
    const deskColumns = roomDeskColumns(deskCount);
    const standingColumns = roomStandingColumns(standingCount);
    const deskRows = Math.ceil(deskCount / deskColumns);
    const standingRows = Math.ceil(standingCount / standingColumns);
    const contentHeight = 42 +
      deskRows * OFFICE_GEOMETRY.deskRowHeight +
      standingRows * OFFICE_GEOMETRY.standingRowHeight +
      18;
    return {
      deskColumns,
      standingColumns,
      deskRows,
      standingRows,
      height: Math.max(OFFICE_GEOMETRY.minRoomHeight, contentHeight),
      preferredWidth: Math.max(
        OFFICE_GEOMETRY.minRoomWidth,
        OFFICE_GEOMETRY.roomPadding * 2 +
          Math.max(deskColumns * 112, standingCount > 0 ? standingColumns * 40 : 0),
      ),
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
    const rowMetrics = roomMetrics.slice(row * columns, row * columns + columns);
    const preferredRowWidth = rowMetrics.reduce((sum, metric) => sum + metric.preferredWidth, 0) +
      (rowMetrics.length > 1 ? OFFICE_GEOMETRY.roomGap : 0);
    const scale = preferredRowWidth > availableRoomWidth
      ? Math.max(0, (availableRoomWidth - (rowMetrics.length > 1 ? OFFICE_GEOMETRY.roomGap : 0)) /
        Math.max(1, preferredRowWidth - (rowMetrics.length > 1 ? OFFICE_GEOMETRY.roomGap : 0)))
      : 1;
    const widths = rowMetrics.map(({ preferredWidth }) => Math.floor(preferredWidth * scale));
    const rowWidth = widths.reduce((sum, width) => sum + width, 0) +
      (widths.length > 1 ? OFFICE_GEOMETRY.roomGap : 0);
    const rowStartX = (officeWidth - rowWidth) / 2;
    const x = rowStartX + widths
      .slice(0, column)
      .reduce((sum, width) => sum + width + OFFICE_GEOMETRY.roomGap, 0);
    return {
      index,
      column,
      row,
      x,
      y: rowYs[row],
      width: widths[column],
      height: roomMetrics[index].height,
      deskColumns: roomMetrics[index].deskColumns,
      standingColumns: roomMetrics[index].standingColumns,
      deskRows: roomMetrics[index].deskRows,
      standingRows: roomMetrics[index].standingRows,
    };
  });
  const roomWidth = Math.max(0, ...rooms.map(({ width }) => width));
  const roomStartX = rooms.length > 0 ? Math.min(...rooms.map(({ x }) => x)) : 0;
  const totalHeight = nextY + 30;
  return {
    officeWidth,
    totalHeight,
    columns,
    rows,
    roomWidth,
    roomStartX,
    roomStartY,
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
      OFFICE_GEOMETRY.ceoOtelBoardWidth +
      count * OFFICE_GEOMETRY.receptionStationMinWidth +
      (count + 2) * OFFICE_GEOMETRY.ceoBlockGap,
  );
}

export function resolveCeoBlockLayout(
  officeWidth: number,
  receptionCount: number,
): OfficeCeoBlockLayout {
  const count = boundedCount(receptionCount, OFFICE_GEOMETRY.maxReceptionDesks);
  const fixedWidth = OFFICE_GEOMETRY.ceoDeskWidth +
    OFFICE_GEOMETRY.ceoBoardWidth +
    OFFICE_GEOMETRY.ceoOtelBoardWidth +
    count * OFFICE_GEOMETRY.receptionStationMinWidth;
  const gapCount = count + 2;
  const blockGap = Math.max(
    OFFICE_GEOMETRY.ceoBlockGap,
    (officeWidth - OFFICE_GEOMETRY.ceoEdgePadding * 2 - fixedWidth) / gapCount,
  );
  const ceoX = OFFICE_GEOMETRY.ceoEdgePadding;
  const otelBoardX = ceoX + OFFICE_GEOMETRY.ceoDeskWidth + blockGap;
  const boardX = otelBoardX + OFFICE_GEOMETRY.ceoOtelBoardWidth + blockGap;
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
  return { ceoX, boardX, otelBoardX, blockGap, receptions };
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
  const column = index % room.deskColumns;
  const row = Math.floor(index / room.deskColumns);
  const innerWidth = room.width - OFFICE_GEOMETRY.roomPadding * 2;
  const stationSpan = innerWidth / room.deskColumns;
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
    room.standingColumns * 2 - 1,
  );
  const column = index % room.standingColumns;
  const row = Math.floor(index / room.standingColumns);
  const innerWidth = room.width - OFFICE_GEOMETRY.roomPadding * 2;
  const stationSpan = innerWidth / room.standingColumns;
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

function roomDeskColumns(deskCount: number) {
  if (deskCount <= 2) {
    return 2;
  }
  return Math.min(OFFICE_GEOMETRY.deskColumns, Math.ceil(deskCount / 2));
}

function roomStandingColumns(standingCount: number) {
  return standingCount > 0
    ? Math.min(OFFICE_GEOMETRY.standingColumns, Math.max(4, standingCount))
    : OFFICE_GEOMETRY.standingColumns;
}
