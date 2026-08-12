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
  ceoCompactBlockGap: 8,
  agentBarMinWidth: 280,
  agentBarPreferredWidth: 560,
  agentBarGap: 28,
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
  roomGap: 8,
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

export type OfficeRoomAlignment = "left" | "center" | "right";
export const DEFAULT_OFFICE_ROOM_ALIGNMENT: OfficeRoomAlignment = "left";

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
  ceoOriginX: number;
  ceoScale: number;
  ceoContentWidth: number;
  localCeoX: number;
  localBoardX: number;
  localOtelBoardX: number;
  localBlockGap: number;
  localReceptions: OfficeReceptionRect[];
  agentBarX: number;
  agentBarWidth: number;
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
  columns: number;
  rows: number;
  roomWidth: number;
  roomStartX: number;
  roomStartY: number;
  rooms: OfficeRoomRect[];
};

export function resolveOfficeLayout(
  requestedWidth: number,
  requestedRooms: number | readonly OfficeRoomPresentation[],
  roomAlignment: OfficeRoomAlignment = DEFAULT_OFFICE_ROOM_ALIGNMENT,
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
  const packedRows: number[][] = [];
  let currentRow: number[] = [];
  let currentWidth = 0;
  roomMetrics.forEach(({ preferredWidth }, index) => {
    const nextWidth = currentRow.length > 0
      ? currentWidth + OFFICE_GEOMETRY.roomGap + preferredWidth
      : preferredWidth;
    if (currentRow.length > 0 && nextWidth > availableRoomWidth) {
      packedRows.push(currentRow);
      currentRow = [];
      currentWidth = 0;
    }
    currentRow.push(index);
    currentWidth = currentRow.length > 1
      ? currentWidth + OFFICE_GEOMETRY.roomGap + preferredWidth
      : preferredWidth;
  });
  if (currentRow.length > 0) {
    packedRows.push(currentRow);
  }
  const columns = Math.max(1, ...packedRows.map((row) => row.length));
  const rows = packedRows.length;
  const rowHeights = Array.from({ length: rows }, (_, row) =>
    Math.max(
      ...packedRows[row].map((index) => roomMetrics[index].height),
    ),
  );
  const rowYs: number[] = [];
  let nextY = roomStartY;
  for (const height of rowHeights) {
    rowYs.push(nextY);
    nextY += height + OFFICE_GEOMETRY.roomGap;
  }
  const roomPositions = new Map<number, OfficeRoomRect>();
  packedRows.forEach((row, rowIndex) => {
    const widths = row.map((index) => roomMetrics[index].preferredWidth);
    const rowWidth = widths.reduce((sum, width) => sum + width, 0) +
      OFFICE_GEOMETRY.roomGap * Math.max(0, row.length - 1);
    let x = roomAlignment === "left"
      ? 12
      : roomAlignment === "right"
        ? officeWidth - 12 - rowWidth
        : (officeWidth - rowWidth) / 2;
    row.forEach((index, column) => {
      const metric = roomMetrics[index];
      roomPositions.set(index, {
        index,
        column,
        row: rowIndex,
        x,
        y: rowYs[rowIndex],
        width: metric.preferredWidth,
        height: metric.height,
        deskColumns: metric.deskColumns,
        standingColumns: metric.standingColumns,
        deskRows: metric.deskRows,
        standingRows: metric.standingRows,
      });
      x += metric.preferredWidth + OFFICE_GEOMETRY.roomGap;
    });
  });
  const rooms = presentations.map((_, index) => roomPositions.get(index)!);
  const roomWidth = Math.max(0, ...rooms.map(({ width }) => width));
  const roomStartX = rooms.length > 0 ? Math.min(...rooms.map(({ x }) => x)) : 0;
  const totalHeight = nextY + 30 + (count < OFFICE_GEOMETRY.maxRooms ? 64 : 0);
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
  const ceoContentWidth = intrinsicCeoContentWidth(count);
  return Math.max(
    OFFICE_GEOMETRY.minOfficeWidth,
    OFFICE_GEOMETRY.ceoEdgePadding * 2 +
      ceoContentWidth +
      OFFICE_GEOMETRY.agentBarGap +
      OFFICE_GEOMETRY.agentBarMinWidth,
  );
}

export function agentBarWidthForOffice(officeWidth: number, receptionCount = 0) {
  const ceoContentWidth = intrinsicCeoContentWidth(receptionCount);
  const availableWidth = Math.floor(
    officeWidth -
      OFFICE_GEOMETRY.ceoEdgePadding * 2 -
      ceoContentWidth -
      OFFICE_GEOMETRY.agentBarGap,
  );
  return Math.max(
    OFFICE_GEOMETRY.agentBarMinWidth,
    Math.min(
      OFFICE_GEOMETRY.agentBarPreferredWidth,
      Math.max(OFFICE_GEOMETRY.agentBarMinWidth, availableWidth),
    ),
  );
}

export function agentBarSlot(blocks: OfficeCeoBlockLayout, index: number) {
  const boardWidth = Math.min(76, blocks.agentBarWidth * 0.25);
  const barX = blocks.agentBarX + 10 + boardWidth + 10;
  const barWidth = Math.max(0, blocks.agentBarX + blocks.agentBarWidth - 10 - barX);
  const counterY = 4 + OFFICE_GEOMETRY.ceoBandHeight - 4 - 40;
  const agentAreaY = 4 + 61;
  const agentAreaHeight = Math.max(1, counterY - agentAreaY - 4);
  const columns = Math.max(3, Math.floor(barWidth / 56));
  const rowHeight = agentAreaHeight / 2;
  const safeIndex = Math.max(0, Math.floor(index));
  const column = safeIndex % columns;
  const row = Math.min(1, Math.floor(safeIndex / columns));
  const rowY = agentAreaY + (1 - row) * rowHeight;
  return {
    x: barX + (barWidth / columns) * (column + 0.5),
    rowY,
    rowHeight,
    characterFeetY: rowY + rowHeight - 2,
    columns,
    capacity: columns * 2,
  };
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
  const intrinsicCeoContentWidth = intrinsicCeoContentWidthForCount(count);
  const agentBarWidth = agentBarWidthForOffice(officeWidth, count);
  const ceoOriginX = OFFICE_GEOMETRY.ceoEdgePadding;
  const ceoContentWidth = Math.max(
    intrinsicCeoContentWidth,
    officeWidth -
      OFFICE_GEOMETRY.ceoEdgePadding * 2 -
      agentBarWidth -
      OFFICE_GEOMETRY.agentBarGap,
  );
  const agentBarX = ceoOriginX + ceoContentWidth + OFFICE_GEOMETRY.agentBarGap;
  const ceoScale = 1;
  const blockGap = Math.max(
    OFFICE_GEOMETRY.ceoCompactBlockGap,
    (ceoContentWidth - fixedWidth) / (count + 2),
  );
  const localCeoX = 0;
  const localOtelBoardX = localCeoX + OFFICE_GEOMETRY.ceoDeskWidth + blockGap;
  const localBoardX = localOtelBoardX + OFFICE_GEOMETRY.ceoOtelBoardWidth + blockGap;
  const receptionStartX = localBoardX + OFFICE_GEOMETRY.ceoBoardWidth + blockGap;
  const availableReceptionWidth = Math.max(0, ceoContentWidth - receptionStartX);
  const stationWidth = count > 0
    ? Math.min(
        OFFICE_GEOMETRY.receptionStationMinWidth,
        Math.max(0, (availableReceptionWidth - blockGap * (count - 1)) / count),
      )
    : 0;
  const localReceptions = Array.from({ length: count }, (_, index) => ({
    index,
    x: receptionStartX + index * (stationWidth + blockGap),
    y: 36,
    width: stationWidth,
    height: 160,
    gapBefore: blockGap,
  }));
  const scaleX = (value: number) => ceoOriginX + value * ceoScale;
  const receptions = localReceptions.map((reception) => ({
    ...reception,
    x: scaleX(reception.x),
    width: reception.width * ceoScale,
    gapBefore: reception.gapBefore * ceoScale,
  }));
  return {
    ceoX: scaleX(localCeoX),
    boardX: scaleX(localBoardX),
    otelBoardX: scaleX(localOtelBoardX),
    blockGap: blockGap * ceoScale,
    receptions,
    ceoOriginX,
    ceoScale,
    ceoContentWidth,
    localCeoX,
    localBoardX,
    localOtelBoardX,
    localBlockGap: blockGap,
    localReceptions,
    agentBarX,
    agentBarWidth,
  };
}

function intrinsicCeoContentWidth(receptionCount: number) {
  return intrinsicCeoContentWidthForCount(boundedCount(receptionCount, OFFICE_GEOMETRY.maxReceptionDesks));
}

function intrinsicCeoContentWidthForCount(count: number) {
  const fixedWidth = OFFICE_GEOMETRY.ceoDeskWidth +
    OFFICE_GEOMETRY.ceoBoardWidth +
    OFFICE_GEOMETRY.ceoOtelBoardWidth +
    count * OFFICE_GEOMETRY.receptionStationMinWidth;
  return fixedWidth + (count + 2) * OFFICE_GEOMETRY.ceoCompactBlockGap;
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
