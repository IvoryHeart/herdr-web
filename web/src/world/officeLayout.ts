import {
  OFFICE_GEOMETRY,
  resolveCeoBlockLayout,
  resolveOfficeLayout,
} from "./officeGeometry";
import type {
  OfficeLayout,
  OfficeLongRoomTitleMode,
  OfficeOverflowMarker,
  OfficeRect,
  OfficeRoomAlignment,
  OfficeRoomHeaderLayout,
  OfficeRoomPresentation,
  OfficeRoomRect,
} from "./officeGeometry";

const MAX_OMISSION_SAMPLES = 8;
const DEFAULT_MAX_CONTENT_ITEMS = OFFICE_GEOMETRY.maxContentItems;

export type OfficeContentImportance = "required" | "preferred" | "optional";
export type OfficeContentFlow = "row" | "column" | "wrap-row" | "grid";
export type OfficeContentSpanPolicy = "single" | "multi-row" | "remaining";

export type OfficeContentItemDescriptor = {
  id: string;
  kind: string;
  importance: OfficeContentImportance;
  order: number;
  priority?: number;
  minWidth: number;
  minHeight: number;
  preferredWidth?: number;
  preferredHeight?: number;
};

export type OfficeGeometryRoomDescriptor = OfficeRoomPresentation & {
  id: string;
  role?: "ceo" | "work" | "agent-bar" | string;
  precedence?: number;
  region?: "ceo" | "agent-bar" | "work";
  order?: number;
  flow?: OfficeContentFlow;
  spanPolicy?: OfficeContentSpanPolicy;
  contentMinWidth?: number;
  title?: string;
  hostTitle?: string;
  actions?: {
    rename: boolean;
    close: boolean;
    createSeat: boolean;
  };
  contentItems?: readonly OfficeContentItemDescriptor[];
};

export type OfficeGeometryStyleTokens = {
  fixedHeaderChromeWidth?: number;
  fixedHeaderChromeHeight?: number;
  overflowMarkerMinWidth?: number;
  overflowMarkerMinHeight?: number;
  overflowMarkerGap?: number;
  roomSafeInset?: number;
};

export type OfficeGeometryInput = {
  availableViewportWidth: number;
  availableViewportHeight?: number;
  minimumLogicalCanvasWidth?: number;
  minimumLogicalCanvasHeight?: number;
  maximumExpandedCanvasWidth?: number;
  maximumExpandedCanvasHeight?: number;
  maximumExpandedRoomWidth?: number;
  maximumExpandedRoomHeight?: number;
  maxContentItems?: number;
  maxLayoutRows?: number;
  overflowMode?: "logical-scroll";
  fontKey?: string;
  fontReady?: boolean;
  titleMode: OfficeLongRoomTitleMode;
  roomAlignment: OfficeRoomAlignment;
  ceoReceptionCount?: number;
  ceoContentItems?: readonly OfficeContentItemDescriptor[];
  rooms: readonly OfficeGeometryRoomDescriptor[];
  style?: OfficeGeometryStyleTokens;
};

export type NormalizedOfficeGeometryInput = {
  availableViewportWidth: number;
  availableViewportHeight: number;
  minimumLogicalCanvasWidth: number;
  minimumLogicalCanvasHeight: number;
  minimumRoomWidth: number;
  minimumRoomHeight: number;
  maximumExpandedCanvasWidth: number;
  maximumExpandedCanvasHeight: number;
  maximumExpandedRoomWidth: number;
  maximumExpandedRoomHeight: number;
  maxContentItems: number;
  maxLayoutRows: number;
  overflowMode: "logical-scroll";
  fontKey: string;
  fontReady: boolean;
  titleMode: OfficeLongRoomTitleMode;
  roomAlignment: OfficeRoomAlignment;
  ceoReceptionCount: number;
  ceoContentItems: readonly OfficeContentItemDescriptor[];
  style: Required<OfficeGeometryStyleTokens>;
  rooms: readonly OfficeGeometryRoomDescriptor[];
};

export type OfficeGeometryOmissionReason =
  | "content-item-count-cap"
  | "required-minimum-exceeds-room-cap"
  | "non-required-minimum-exceeds-room-cap"
  | "canvas-capacity-exhausted"
  | "invalid-content-descriptor";

export type OfficeGeometryOmission = {
  reason: OfficeGeometryOmissionReason;
  importance: OfficeContentImportance;
  id: string | null;
};

export type OfficeGeometryOmissionSummary = {
  total: number;
  byReason: Partial<Record<OfficeGeometryOmissionReason, number>>;
  byImportance: Partial<Record<OfficeContentImportance, number>>;
  samples: Partial<Record<OfficeGeometryOmissionReason, readonly string[]>>;
  samplesByImportance: Partial<Record<OfficeContentImportance, readonly string[]>>;
};

export type OfficeContentItemRect = OfficeRect & {
  roomIndex: number;
  id: string;
  kind: string;
  importance: OfficeContentImportance;
  clipRect: OfficeRect;
  inkBounds: OfficeRect;
};

export type OfficeGeometryRow = {
  roomIndex: number;
  index: number;
  rect: OfficeRect;
};

export type OfficeGeometryResult = {
  inputDigest: string;
  normalizedInput: NormalizedOfficeGeometryInput;
  layout: OfficeLayout;
  roomHeaders: readonly (OfficeRoomHeaderLayout | null)[];
  rows: readonly OfficeGeometryRow[];
  contentItems: readonly OfficeContentItemRect[];
  omissions: readonly OfficeGeometryOmission[];
  omissionSummary: OfficeGeometryOmissionSummary;
  normalizationErrors: readonly ("invalid-style-capacity")[];
  fallbackMessage: string | null;
  accessibleOverflow: OfficeOverflowMarker | null;
  resolvedCanvasWidth: number;
  resolvedCanvasHeight: number;
};

export type OfficeInputGeneration = {
  id: string;
  canonicalDigest: string;
};

export type PublishedOfficeLayout = OfficeLayout & {
  layoutRevision: number;
  inputDigest: string;
};

const HARD_MAX_WIDTH = OFFICE_GEOMETRY.maxLogicalCanvasWidth;
const HARD_MAX_HEIGHT = OFFICE_GEOMETRY.maxLogicalCanvasHeight;
const HARD_MAX_ROOM_WIDTH = OFFICE_GEOMETRY.maxExpandedRoomWidth;
const HARD_MAX_ROOM_HEIGHT = OFFICE_GEOMETRY.maxExpandedRoomHeight;
const HARD_MAX_ROWS = OFFICE_GEOMETRY.maxLayoutRows;

export function normalizeOfficeGeometryInput(
  input: OfficeGeometryInput,
): NormalizedOfficeGeometryInput {
  const style = {
    fixedHeaderChromeWidth: normalizeMetric(
      input.style?.fixedHeaderChromeWidth,
      OFFICE_GEOMETRY.roomHeaderChromeWidth,
      HARD_MAX_ROOM_WIDTH,
    ),
    fixedHeaderChromeHeight: normalizeMetric(
      input.style?.fixedHeaderChromeHeight,
      OFFICE_GEOMETRY.roomHeaderChromeHeight,
      HARD_MAX_ROOM_HEIGHT,
    ),
    overflowMarkerMinWidth: normalizeMetric(
      input.style?.overflowMarkerMinWidth,
      OFFICE_GEOMETRY.overflowMarkerMinWidth,
      HARD_MAX_ROOM_WIDTH,
    ),
    overflowMarkerMinHeight: normalizeMetric(
      input.style?.overflowMarkerMinHeight,
      OFFICE_GEOMETRY.overflowMarkerMinHeight,
      HARD_MAX_ROOM_HEIGHT,
    ),
    overflowMarkerGap: normalizeMetric(
      input.style?.overflowMarkerGap,
      OFFICE_GEOMETRY.overflowMarkerGap,
      HARD_MAX_ROOM_HEIGHT,
    ),
    roomSafeInset: normalizeMetric(
      input.style?.roomSafeInset,
      OFFICE_GEOMETRY.roomHeaderSafeInset,
      HARD_MAX_ROOM_WIDTH,
    ),
  };
  const minimumRoomWidth = Math.min(HARD_MAX_ROOM_WIDTH, Math.max(
    OFFICE_GEOMETRY.minRoomWidth,
    style.fixedHeaderChromeWidth,
    style.overflowMarkerMinWidth,
  ));
  const minimumRoomHeight = Math.min(HARD_MAX_ROOM_HEIGHT, Math.max(
    OFFICE_GEOMETRY.minRoomHeight,
    style.fixedHeaderChromeHeight +
      style.overflowMarkerMinHeight +
      style.overflowMarkerGap,
  ));
  const minimumLogicalCanvasWidth = normalizeMetric(
    input.minimumLogicalCanvasWidth,
    OFFICE_GEOMETRY.minOfficeWidth,
    HARD_MAX_WIDTH,
  );
  const minimumLogicalCanvasHeight = normalizeMetric(
    input.minimumLogicalCanvasHeight,
    OFFICE_GEOMETRY.ceoBandHeight + OFFICE_GEOMETRY.hallwayHeight,
    HARD_MAX_HEIGHT,
  );
  const maximumExpandedCanvasWidth = Math.min(HARD_MAX_WIDTH, Math.max(
    minimumLogicalCanvasWidth,
    minimumRoomWidth,
    normalizeMetric(input.maximumExpandedCanvasWidth, HARD_MAX_WIDTH, HARD_MAX_WIDTH),
  ));
  const maximumExpandedCanvasHeight = Math.min(HARD_MAX_HEIGHT, Math.max(
    minimumLogicalCanvasHeight,
    minimumRoomHeight,
    normalizeMetric(input.maximumExpandedCanvasHeight, HARD_MAX_HEIGHT, HARD_MAX_HEIGHT),
  ));
  const maximumExpandedRoomWidth = Math.min(
    HARD_MAX_ROOM_WIDTH,
    maximumExpandedCanvasWidth,
    Math.max(
      minimumRoomWidth,
      normalizeMetric(input.maximumExpandedRoomWidth, HARD_MAX_ROOM_WIDTH, HARD_MAX_ROOM_WIDTH),
    ),
  );
  const maximumExpandedRoomHeight = Math.min(
    HARD_MAX_ROOM_HEIGHT,
    maximumExpandedCanvasHeight,
    Math.max(
      minimumRoomHeight,
      normalizeMetric(input.maximumExpandedRoomHeight, HARD_MAX_ROOM_HEIGHT, HARD_MAX_ROOM_HEIGHT),
    ),
  );
  const maxContentItems = normalizeCapacity(input.maxContentItems, DEFAULT_MAX_CONTENT_ITEMS);
  const maxLayoutRows = Math.max(
    1,
    Math.min(
      HARD_MAX_ROWS,
      normalizeMetric(input.maxLayoutRows, HARD_MAX_ROWS, HARD_MAX_ROWS),
    ),
  );
  const rooms = input.rooms.slice(0, OFFICE_GEOMETRY.maxRooms).map((room, index) => ({
    ...room,
    id: String(room.id || `room-${index}`),
    order: normalizeMetric(room.order, index, OFFICE_GEOMETRY.maxRooms),
    headerMinWidth: normalizeMetric(room.headerMinWidth, 0, maximumExpandedRoomWidth),
    headerMinHeight: normalizeMetric(room.headerMinHeight, OFFICE_GEOMETRY.roomHeaderHeight, maximumExpandedRoomHeight),
    contentMinWidth: normalizeMetric(room.contentMinWidth, 0, maximumExpandedRoomWidth),
    preferredWidth: normalizeMetric(room.preferredWidth, 0, maximumExpandedRoomWidth),
    preferredHeight: normalizeMetric(room.preferredHeight, 0, maximumExpandedRoomHeight),
    deskCount: normalizeMetric(room.deskCount, 0, OFFICE_GEOMETRY.desksPerRoom),
    standingCount: normalizeMetric(room.standingCount, 0, OFFICE_GEOMETRY.standingColumns * 2),
    contentItems: (room.contentItems ?? []).slice(0, HARD_MAX_ROOM_WIDTH),
  }));
  return {
    availableViewportWidth: normalizeMetric(
      input.availableViewportWidth,
      0,
      maximumExpandedCanvasWidth,
    ),
    availableViewportHeight: normalizeMetric(
      input.availableViewportHeight,
      0,
      maximumExpandedCanvasHeight,
    ),
    minimumLogicalCanvasWidth,
    minimumLogicalCanvasHeight,
    minimumRoomWidth,
    minimumRoomHeight,
    maximumExpandedCanvasWidth,
    maximumExpandedCanvasHeight,
    maximumExpandedRoomWidth,
    maximumExpandedRoomHeight,
    maxContentItems,
    maxLayoutRows,
    overflowMode: "logical-scroll",
    fontKey: input.fontKey ?? "Inter, ui-sans-serif, system-ui, sans-serif",
    fontReady: input.fontReady !== false,
    titleMode: input.titleMode === "compact" ? "compact" : "expand",
    roomAlignment: input.roomAlignment === "center" || input.roomAlignment === "right"
      ? input.roomAlignment
      : "left",
    ceoReceptionCount: normalizeMetric(input.ceoReceptionCount, 0, OFFICE_GEOMETRY.maxReceptionDesks),
    ceoContentItems: (input.ceoContentItems ?? []).slice(0, HARD_MAX_ROOM_WIDTH),
    style,
    rooms,
  };
}

export function resolveOfficeGeometry(input: OfficeGeometryInput): OfficeGeometryResult {
  const normalizedInput = normalizeOfficeGeometryInput(input);
  const inputDigest = JSON.stringify(normalizedInput);
  const styleInvalid = normalizedInput.style.fixedHeaderChromeWidth >
      normalizedInput.maximumExpandedRoomWidth
    || normalizedInput.style.fixedHeaderChromeHeight +
      normalizedInput.style.overflowMarkerMinHeight + normalizedInput.style.overflowMarkerGap >
      normalizedInput.maximumExpandedRoomHeight;
  const baseWidth = Math.min(
    normalizedInput.maximumExpandedCanvasWidth,
    Math.max(
      normalizedInput.minimumLogicalCanvasWidth,
      normalizedInput.availableViewportWidth,
      ...normalizedInput.rooms.map((room) => Math.max(
        resolveOfficeRoomHeader(room, normalizedInput).width,
        room.headerMinWidth ?? 0,
        room.preferredWidth ?? 0,
      ) + 24),
    ),
  );
  const invalidMinimumCapacity = normalizedInput.minimumRoomWidth > normalizedInput.maximumExpandedRoomWidth ||
    normalizedInput.minimumRoomHeight > normalizedInput.maximumExpandedRoomHeight;
  if (styleInvalid || invalidMinimumCapacity) {
    const fallbackLayout = resolveOfficeLayout(normalizedInput.minimumLogicalCanvasWidth, []);
    const fallback = withLayoutBounds(fallbackLayout, []);
    return {
      inputDigest,
      normalizedInput,
      layout: {
        ...fallback,
        overflowMarker: { label: "Office layout unavailable", required: true },
      },
      roomHeaders: [],
      rows: [],
      contentItems: [],
      omissions: [],
      omissionSummary: emptyOmissionSummary(),
      normalizationErrors: ["invalid-style-capacity"],
      fallbackMessage: "Office layout unavailable",
      accessibleOverflow: { label: "Office layout unavailable", required: true },
      resolvedCanvasWidth: fallback.officeWidth,
      resolvedCanvasHeight: fallback.totalHeight,
    };
  }
  const ceoBlocks = resolveCeoBlockLayout(baseWidth, normalizedInput.ceoReceptionCount);
  const resolvedCeoBandHeight = estimateCeoBandHeight(
    normalizedInput.ceoContentItems,
    ceoBlocks.ceoContentWidth,
    normalizedInput,
    ceoBlocks.ceoBandHeight,
  );
  const presentations = normalizedInput.rooms.map((room) => ({
    deskCount: room.deskCount,
    standingCount: room.standingCount,
    headerMinWidth: resolveOfficeRoomHeader(room, normalizedInput).width,
    headerMinHeight: room.headerMinHeight,
    preferredWidth: Math.min(
      normalizedInput.maximumExpandedRoomWidth,
      Math.max(room.preferredWidth ?? 0, normalizedInput.minimumRoomWidth),
    ),
    preferredHeight: Math.min(
      normalizedInput.maximumExpandedRoomHeight,
      Math.max(room.preferredHeight ?? 0, normalizedInput.minimumRoomHeight),
    ),
  }));
  const baseLayout = resolveOfficeLayout(
    baseWidth,
    presentations,
    normalizedInput.roomAlignment,
    resolvedCeoBandHeight,
  );
  const omissionAccumulator = createOmissionAccumulator();
  const availableRooms = baseLayout.rooms.filter((room) =>
    room.row < normalizedInput.maxLayoutRows &&
    room.y + room.height <= normalizedInput.maximumExpandedCanvasHeight,
  );
  normalizedInput.rooms.forEach((room, index) => {
    if (!availableRooms.some((candidate) => candidate.index === index)) {
      omissionAccumulator.add({
        reason: "canvas-capacity-exhausted",
        importance: "required",
        id: room.id,
      });
    }
  });
  const ceoRect = {
    x: 4,
    y: 4,
    width: Math.max(0, ceoBlocks.agentBarX - OFFICE_GEOMETRY.agentBarGap - 4),
    height: Math.max(0, resolvedCeoBandHeight - 4),
  };
  const ceoContentRect = {
    x: ceoRect.x + 8,
    y: ceoRect.y + 40,
    width: Math.max(0, ceoRect.width - 16),
    height: Math.max(0, ceoRect.height - 48),
  };
  const layout = withLayoutBounds({
    ...baseLayout,
    officeWidth: baseWidth,
    ceoRect,
    ceoContentRect,
    agentBarRect: {
      x: ceoBlocks.agentBarX,
      y: 4,
      width: ceoBlocks.agentBarWidth,
      height: Math.max(0, resolvedCeoBandHeight - 4),
    },
    totalHeight: Math.min(
      normalizedInput.maximumExpandedCanvasHeight,
      Math.max(baseLayout.totalHeight, normalizedInput.minimumLogicalCanvasHeight),
    ),
    rooms: availableRooms,
  }, normalizedInput.rooms.map((room) => resolveOfficeRoomHeader(room, normalizedInput)));
  const contentItems: OfficeContentItemRect[] = [];
  normalizedInput.rooms.forEach((room, roomIndex) => {
    const rect = layout.rooms.find(({ index }) => index === roomIndex);
    if (!rect) {
      return;
    }
    const selectedItems = normalizeContentItems(room.contentItems ?? [], normalizedInput.maxContentItems);
    selectedItems.omitted.forEach((item) => omissionAccumulator.add({
      reason: "content-item-count-cap",
      importance: item.importance,
      id: item.id,
    }));
    const placed = placeContentItems(
      rect,
      room,
      selectedItems.selected,
      normalizedInput,
    );
    placed.items.forEach((item) => contentItems.push(item));
    placed.omissions.forEach((omission) => omissionAccumulator.add(omission));
    if (placed.requiredOverflow || selectedItems.omitted.some(({ importance }) => importance === "required")) {
      rect.overflowMarkerRect = overflowMarkerRect(rect, normalizedInput);
    }
  });
  const ceoDescriptor: OfficeGeometryRoomDescriptor = {
    id: "ceo-office",
    role: "ceo",
    region: "ceo",
    order: 0,
    flow: "wrap-row",
    spanPolicy: "multi-row",
    title: "CEO Office",
    hostTitle: "CEO",
    deskCount: 0,
    standingCount: 0,
    contentItems: normalizedInput.ceoContentItems,
  };
  const ceoItems = normalizeContentItems(normalizedInput.ceoContentItems, normalizedInput.maxContentItems);
  ceoItems.omitted.forEach((item) => omissionAccumulator.add({
    reason: "content-item-count-cap",
    importance: item.importance,
    id: item.id,
  }));
  const ceoPlaced = placeContentItems(
    contentRegionRoom(layout, layout.ceoContentRect, -1),
    ceoDescriptor,
    ceoItems.selected,
    normalizedInput,
  );
  ceoPlaced.items.forEach((item) => contentItems.push(item));
  ceoPlaced.omissions.forEach((omission) => omissionAccumulator.add(omission));
  if (ceoPlaced.requiredOverflow || ceoItems.omitted.some(({ importance }) => importance === "required")) {
    layout.ceoOverflowMarkerRect = overflowMarkerRect(
      contentRegionRoom(layout, layout.ceoContentRect, -1),
      normalizedInput,
    );
  }
  const rows = resolveRows(layout);
  const omissionRecords = omissionAccumulator.records();
  const omissionSummary = omissionAccumulator.summary();
  const accessibleOverflow = omissionSummary.byImportance.required
    ? { label: "Some required Office content is not shown.", required: true }
    : null;
  const layoutWithOverflow = accessibleOverflow
    ? { ...layout, overflowMarker: accessibleOverflow }
    : layout;
  return {
    inputDigest,
    normalizedInput,
    layout: layoutWithOverflow,
    roomHeaders: normalizedInput.rooms.map((room) => resolveOfficeRoomHeader(room, normalizedInput)),
    rows,
    contentItems,
    omissions: omissionRecords,
    omissionSummary,
    normalizationErrors: [],
    fallbackMessage: null,
    accessibleOverflow,
    resolvedCanvasWidth: layoutWithOverflow.officeWidth,
    resolvedCanvasHeight: layoutWithOverflow.totalHeight,
  };
}

export function resolveOfficeRoomHeader(
  room: Pick<OfficeGeometryRoomDescriptor, "title" | "hostTitle"> & { headerMinWidth?: number },
  input: Pick<NormalizedOfficeGeometryInput, "titleMode" | "maximumExpandedRoomWidth" | "style" | "fontKey" | "fontReady">,
): OfficeRoomHeaderLayout {
  const workspace = String(room.title ?? "ROOM");
  const host = String(room.hostTitle ?? "HOST");
  const compact = input.titleMode === "compact";
  let visualWorkspace = compact ? compactOfficeLabel(workspace, 18) : workspace;
  let visualHost = compact ? compactOfficeLabel(host, 16) : host;
  const fixedWidth = input.style.fixedHeaderChromeWidth;
  const maxWidth = Math.max(fixedWidth, input.maximumExpandedRoomWidth);
  let width = Math.max(
    room.headerMinWidth ?? 0,
    fixedWidth + measureOfficeText(visualWorkspace) + measureOfficeText(visualHost),
  );
  let emergencyEllipsis = false;
  if (width > maxWidth) {
    emergencyEllipsis = true;
    const available = Math.max(0, maxWidth - fixedWidth);
    const workspaceBudget = Math.floor(available * 0.52);
    const hostBudget = Math.max(0, available - workspaceBudget);
    visualWorkspace = fitOfficeLabel(workspace, workspaceBudget);
    visualHost = fitOfficeLabel(host, hostBudget);
    width = Math.min(
      maxWidth,
      fixedWidth + measureOfficeText(visualWorkspace) + measureOfficeText(visualHost),
    );
  }
  return {
    workspace: visualWorkspace,
    host: visualHost,
    width: Math.max(fixedWidth, Math.ceil(width)),
    height: Math.max(OFFICE_GEOMETRY.roomHeaderHeight, input.style.fixedHeaderChromeHeight),
    emergencyEllipsis,
  };
}

export class OfficeLayoutPublisher {
  private revision = 0;
  private currentDigest: string | null = null;
  private currentLayout: PublishedOfficeLayout | null = null;
  private readonly generationDigests = new Map<string, string>();
  private renderedRevision = 0;

  publish(generation: OfficeInputGeneration, geometry: OfficeGeometryResult): PublishedOfficeLayout {
    const priorDigest = this.generationDigests.get(generation.id);
    if (priorDigest !== undefined && priorDigest !== generation.canonicalDigest) {
      throw new Error(`Office layout generation ${generation.id} was reused with different input.`);
    }
    if (geometry.inputDigest !== generation.canonicalDigest) {
      throw new Error("Office layout geometry does not match its input generation.");
    }
    this.generationDigests.set(generation.id, generation.canonicalDigest);
    if (this.currentLayout && this.currentDigest === generation.canonicalDigest) {
      return this.currentLayout;
    }
    this.revision += 1;
    this.currentDigest = generation.canonicalDigest;
    const rooms = Object.freeze(geometry.layout.rooms.map((room) => Object.freeze({ ...room })));
    this.currentLayout = Object.freeze({
      ...geometry.layout,
      rooms,
      layoutRevision: this.revision,
      inputDigest: generation.canonicalDigest,
    }) as PublishedOfficeLayout;
    return this.currentLayout;
  }

  ackCanvasRendered(revision: number) {
    if (!this.currentLayout || revision !== this.currentLayout.layoutRevision) {
      return false;
    }
    this.renderedRevision = revision;
    return true;
  }

  get canvasRenderedRevision() {
    return this.renderedRevision;
  }

  isCanvasReady(revision: number) {
    return this.currentLayout?.layoutRevision === revision && this.renderedRevision === revision;
  }
}

function normalizeContentItems(
  items: readonly OfficeContentItemDescriptor[],
  maxContentItems: number,
) {
  const normalized = items.map((item, index) => ({
    ...item,
    id: String(item.id ?? `item-${index}`),
    order: normalizeMetric(item.order, index, HARD_MAX_ROWS),
    priority: normalizeMetric(item.priority, 0, HARD_MAX_ROWS),
    minWidth: normalizeMetric(item.minWidth, 0, HARD_MAX_ROOM_WIDTH),
    minHeight: normalizeMetric(item.minHeight, 0, HARD_MAX_ROOM_HEIGHT),
    preferredWidth: normalizeMetric(
      item.preferredWidth,
      typeof item.minWidth === "number" && Number.isFinite(item.minWidth) ? item.minWidth : 0,
      HARD_MAX_ROOM_WIDTH,
    ),
    preferredHeight: normalizeMetric(
      item.preferredHeight,
      typeof item.minHeight === "number" && Number.isFinite(item.minHeight) ? item.minHeight : 0,
      HARD_MAX_ROOM_HEIGHT,
    ),
    valid: typeof item.id === "string" && item.id.trim().length > 0 &&
      typeof item.kind === "string" && item.kind.trim().length > 0 &&
      ["required", "preferred", "optional"].includes(item.importance) &&
      typeof item.order === "number" && Number.isFinite(item.order) && item.order >= 0 &&
      typeof item.minWidth === "number" && Number.isFinite(item.minWidth) && item.minWidth >= 0 &&
      typeof item.minHeight === "number" && Number.isFinite(item.minHeight) && item.minHeight >= 0,
  }));
  const ordered = [...normalized].sort((left, right) => {
    const importance = importanceRank(isImportance(left.importance) ? left.importance : "optional") -
      importanceRank(isImportance(right.importance) ? right.importance : "optional");
    if (importance !== 0) {
      return importance;
    }
    return right.priority - left.priority || left.order - right.order || left.id.localeCompare(right.id);
  });
  return {
    selected: ordered.slice(0, maxContentItems),
    omitted: ordered.slice(maxContentItems),
  };
}

function placeContentItems(
  room: OfficeRoomRect,
  descriptor: OfficeGeometryRoomDescriptor,
  items: ReturnType<typeof normalizeContentItems>["selected"],
  input: NormalizedOfficeGeometryInput,
) {
  const result: OfficeContentItemRect[] = [];
  const omissions: OfficeGeometryOmission[] = [];
  let cursorX = room.contentSafeRect.x;
  let cursorY = room.contentSafeRect.y;
  let rowHeight = 0;
  let rowIndex = 0;
  let requiredOverflow = false;
  const gap = 8;
  const flow = descriptor.flow ?? "wrap-row";
  items.forEach((item) => {
    const importance = isImportance(item.importance) ? item.importance : "optional";
    if (!item.valid) {
      omissions.push({ reason: "invalid-content-descriptor", importance, id: item.id });
      if (importance === "required") {
        requiredOverflow = true;
      }
      return;
    }
    if (
      item.minWidth > input.maximumExpandedRoomWidth ||
      item.minHeight > input.maximumExpandedRoomHeight ||
      item.minWidth > room.contentSafeRect.width ||
      item.minHeight > room.contentSafeRect.height
    ) {
      const reason: OfficeGeometryOmissionReason = importance === "required"
        ? "required-minimum-exceeds-room-cap"
        : "non-required-minimum-exceeds-room-cap";
      omissions.push({ reason, importance, id: item.id });
      if (importance === "required") {
        requiredOverflow = true;
      }
      return;
    }
    const width = Math.max(item.minWidth, Math.min(item.preferredWidth, room.contentSafeRect.width));
    const height = Math.max(item.minHeight, Math.min(item.preferredHeight, input.maximumExpandedRoomHeight));
    if (flow === "column" || (
      cursorX > room.contentSafeRect.x &&
      cursorX + width > room.contentSafeRect.x + room.contentSafeRect.width
    )) {
      rowIndex += 1;
      cursorX = room.contentSafeRect.x;
      cursorY += rowHeight + gap;
      rowHeight = 0;
    }
    if (
      rowIndex >= input.maxLayoutRows ||
      cursorY + height > room.contentSafeRect.y + room.contentSafeRect.height
    ) {
      omissions.push({ reason: "canvas-capacity-exhausted", importance, id: item.id });
      if (importance === "required") {
        requiredOverflow = true;
      }
      return;
    }
    const rect = { x: cursorX, y: cursorY, width, height };
    const clipRect = {
      x: Math.max(room.clipRect.x, rect.x),
      y: Math.max(room.clipRect.y, rect.y),
      width: Math.min(rect.width, room.clipRect.x + room.clipRect.width - rect.x),
      height: Math.min(rect.height, room.clipRect.y + room.clipRect.height - rect.y),
    };
    result.push({
      ...rect,
      roomIndex: room.index,
      id: item.id,
      kind: item.kind,
      importance,
      clipRect,
      inkBounds: clipRect,
    });
    cursorX += width + gap;
    rowHeight = Math.max(rowHeight, height);
  });
  return { items: result, omissions, requiredOverflow };
}

function resolveRows(layout: OfficeLayout): OfficeGeometryRow[] {
  const rows = new Map<string, OfficeGeometryRow>();
  layout.rooms.forEach((room) => {
    const key = `${room.row}`;
    const prior = rows.get(key);
    const rect = prior
      ? unionRects(prior.rect, room.outerRect)
      : room.outerRect;
    rows.set(key, { roomIndex: room.index, index: room.row, rect });
  });
  return [...rows.values()].sort((left, right) => left.index - right.index);
}

function estimateCeoBandHeight(
  items: readonly OfficeContentItemDescriptor[],
  contentWidth: number,
  input: NormalizedOfficeGeometryInput,
  baseHeight: number,
) {
  const selected = normalizeContentItems(items, input.maxContentItems).selected;
  const width = Math.max(1, contentWidth - 16);
  const gap = 8;
  let cursorX = 0;
  let contentHeight = 0;
  let rowHeight = 0;
  selected.forEach((item) => {
    if (!item.valid || item.minWidth > width || item.minHeight > input.maximumExpandedRoomHeight) {
      return;
    }
    const itemWidth = Math.min(item.preferredWidth, width);
    const itemHeight = Math.min(item.preferredHeight, input.maximumExpandedRoomHeight);
    if (cursorX > 0 && cursorX + itemWidth > width) {
      contentHeight += rowHeight + gap;
      cursorX = 0;
      rowHeight = 0;
    }
    cursorX += itemWidth + gap;
    rowHeight = Math.max(rowHeight, itemHeight);
  });
  contentHeight += rowHeight;
  return Math.min(
    input.maximumExpandedCanvasHeight,
    input.maximumExpandedRoomHeight,
    Math.max(baseHeight, contentHeight + 56),
  );
}

function contentRegionRoom(layout: OfficeLayout, contentRect: OfficeRect, index: number): OfficeRoomRect {
  return {
    index,
    column: 0,
    row: 0,
    x: layout.ceoRect.x,
    y: layout.ceoRect.y,
    width: layout.ceoRect.width,
    height: layout.ceoRect.height,
    deskColumns: 0,
    standingColumns: 0,
    deskRows: 0,
    standingRows: 0,
    outerRect: layout.ceoRect,
    wallRect: layout.ceoRect,
    headerRect: layout.ceoRect,
    contentSafeRect: contentRect,
    clipRect: layout.ceoRect,
    inkBounds: layout.ceoRect,
    shadowAllowance: 0,
    selectionStrokeAllowance: 0,
  };
}

function withLayoutBounds(
  layout: OfficeLayout,
  headers: readonly (OfficeRoomHeaderLayout | null)[],
): OfficeLayout {
  const rooms = layout.rooms.map((room) => ({
    ...room,
    header: headers[room.index] ?? room.header,
  }));
  return { ...layout, rooms };
}

function overflowMarkerRect(room: OfficeRoomRect, input: NormalizedOfficeGeometryInput): OfficeRect {
  const width = Math.min(input.style.overflowMarkerMinWidth, room.contentSafeRect.width);
  const height = Math.min(input.style.overflowMarkerMinHeight, room.contentSafeRect.height);
  return {
    x: room.contentSafeRect.x,
    y: Math.max(room.contentSafeRect.y, room.contentSafeRect.y + room.contentSafeRect.height - height),
    width,
    height,
  };
}

function createOmissionAccumulator() {
  const records: OfficeGeometryOmission[] = [];
  const byReason: OfficeGeometryOmissionSummary["byReason"] = {};
  const byImportance: OfficeGeometryOmissionSummary["byImportance"] = {};
  const samples: OfficeGeometryOmissionSummary["samples"] = {};
  const samplesByImportance: OfficeGeometryOmissionSummary["samplesByImportance"] = {};
  let total = 0;
  return {
    add({ reason, importance, id }: OfficeGeometryOmission) {
      total += 1;
      byReason[reason] = (byReason[reason] ?? 0) + 1;
      byImportance[importance] = (byImportance[importance] ?? 0) + 1;
      if (id && (samples[reason]?.length ?? 0) < MAX_OMISSION_SAMPLES) {
        samples[reason] = [...(samples[reason] ?? []), id];
      }
      if (id && (samplesByImportance[importance]?.length ?? 0) < MAX_OMISSION_SAMPLES) {
        samplesByImportance[importance] = [
          ...(samplesByImportance[importance] ?? []),
          id,
        ];
      }
      if ((records.filter((record) =>
        record.reason === reason && record.importance === importance,
      ).length) < MAX_OMISSION_SAMPLES) {
        records.push({ reason, importance, id });
      }
    },
    records() {
      return records.slice();
    },
    summary(): OfficeGeometryOmissionSummary {
      return { total, byReason, byImportance, samples, samplesByImportance };
    },
  };
}

function emptyOmissionSummary(): OfficeGeometryOmissionSummary {
  return { total: 0, byReason: {}, byImportance: {}, samples: {}, samplesByImportance: {} };
}

function unionRects(left: OfficeRect, right: OfficeRect): OfficeRect {
  const x = Math.min(left.x, right.x);
  const y = Math.min(left.y, right.y);
  const rightEdge = Math.max(left.x + left.width, right.x + right.width);
  const bottom = Math.max(left.y + left.height, right.y + right.height);
  return { x, y, width: rightEdge - x, height: bottom - y };
}

function normalizeMetric(value: number | undefined, fallback: number, maximum: number) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(maximum, Math.floor(numeric)));
}

function normalizeCapacity(value: number | undefined, fallback: number) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(1, Math.min(DEFAULT_MAX_CONTENT_ITEMS, numeric));
}

function importanceRank(value: OfficeContentImportance) {
  return value === "required" ? 0 : value === "preferred" ? 1 : 2;
}

function isImportance(value: string): value is OfficeContentImportance {
  return value === "required" || value === "preferred" || value === "optional";
}

function compactOfficeLabel(value: string, limit: number) {
  return fitOfficeLabel(value, measureOfficeText(value.slice(0, limit)), limit);
}

function fitOfficeLabel(value: string, maximumWidth: number, fallbackLimit = 256) {
  const points = [...value];
  if (maximumWidth <= 0) {
    return "";
  }
  if (points.length === 0 || measureOfficeText(value) <= maximumWidth) {
    return value;
  }
  const ellipsis = "…";
  if (measureOfficeText(ellipsis) > maximumWidth) {
    return "";
  }
  let end = Math.max(1, Math.min(points.length, fallbackLimit));
  while (end > 1 && measureOfficeText(`${points.slice(0, end).join("")}${ellipsis}`) > maximumWidth) {
    end -= 1;
  }
  if (measureOfficeText(`${points[0]}${ellipsis}`) > maximumWidth) {
    return ellipsis;
  }
  return `${points.slice(0, end).join("")}${ellipsis}`;
}

function measureOfficeText(value: string) {
  return [...value].reduce((width, character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    const wide = codePoint > 0x2e80 || codePoint >= 0x1f000;
    return width + (wide ? 13 : character === " " ? 4 : 7.2);
  }, 0);
}
