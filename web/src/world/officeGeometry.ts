export const OFFICE_GEOMETRY = Object.freeze({
  minOfficeWidth: 1000,
  ceoBandHeight: 160,
  hallwayHeight: 32,
  characterHeight: 68,
  deskWidth: 48,
  deskHeight: 26,
  roomPadding: 16,
  tile: 20,
  reviewBandHeight: 160,
  reviewBandGap: 32,
  roomGap: 12,
  maxRooms: 128,
  agentsPerRoom: 4,
  roomHeight: 208,
});

export type OfficeRoomRect = {
  index: number;
  column: number;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OfficeLayout = {
  officeWidth: number;
  totalHeight: number;
  columns: 2;
  rows: number;
  roomWidth: number;
  roomHeight: number;
  roomStartX: number;
  roomStartY: number;
  reviewBandY: number;
  rooms: OfficeRoomRect[];
};

export function resolveOfficeLayout(requestedWidth: number, roomCount: number): OfficeLayout {
  const officeWidth = Math.max(
    OFFICE_GEOMETRY.minOfficeWidth,
    Math.floor(Number(requestedWidth) || 0),
  );
  const count = Math.max(
    0,
    Math.min(OFFICE_GEOMETRY.maxRooms, Math.floor(Number(roomCount) || 0)),
  );
  const columns = 2 as const;
  const rows = count > 0 ? Math.ceil(count / columns) : 0;
  const totalRoomSpace = officeWidth - 24 - OFFICE_GEOMETRY.roomGap;
  const roomWidth = Math.floor(totalRoomSpace / columns);
  const roomHeight = OFFICE_GEOMETRY.roomHeight;
  const roomStartX =
    (officeWidth - (columns * roomWidth + OFFICE_GEOMETRY.roomGap)) / 2;
  const roomStartY = OFFICE_GEOMETRY.ceoBandHeight + OFFICE_GEOMETRY.hallwayHeight;
  const reviewBandY =
    roomStartY +
    rows * (roomHeight + OFFICE_GEOMETRY.roomGap) +
    OFFICE_GEOMETRY.reviewBandGap;
  const totalHeight = reviewBandY + OFFICE_GEOMETRY.reviewBandHeight + 30;
  const rooms = Array.from({ length: count }, (_, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      index,
      column,
      row,
      x: roomStartX + column * (roomWidth + OFFICE_GEOMETRY.roomGap),
      y: roomStartY + row * (roomHeight + OFFICE_GEOMETRY.roomGap),
      width: roomWidth,
      height: roomHeight,
    };
  });
  return {
    officeWidth,
    totalHeight,
    columns,
    rows,
    roomWidth,
    roomHeight,
    roomStartX,
    roomStartY,
    reviewBandY,
    rooms,
  };
}
export function deskAnchor(room: OfficeRoomRect, agentIndex: number) {
  const index = Math.max(
    0,
    Math.min(OFFICE_GEOMETRY.agentsPerRoom - 1, Math.floor(Number(agentIndex) || 0)),
  );
  const innerWidth = room.width - OFFICE_GEOMETRY.roomPadding * 2;
  const stationSpan = innerWidth / OFFICE_GEOMETRY.agentsPerRoom;
  const x =
    room.x +
    OFFICE_GEOMETRY.roomPadding +
    stationSpan * (index + 0.5);
  const nameY = room.y + 42;
  const characterFeetY = nameY + 37 + OFFICE_GEOMETRY.characterHeight;
  return {
    index,
    column: index,
    row: 0,
    stationSpan,
    x,
    nameY,
    characterFeetY,
    deskY: characterFeetY - 20,
  };
}
