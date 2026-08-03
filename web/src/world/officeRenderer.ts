// Pixi's CSP-safe polyfill replaces its generated Function paths with static synchronizers.
import "pixi.js/unsafe-eval";
import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Texture,
} from "pixi.js";
import type {
  HerdrOfficeProjection,
  OfficeAgent,
  OfficeDesk,
  OfficeHost,
  OfficeReception,
  OfficeRoom,
} from "./herdrOfficeProjection";
import {
  deskAnchor,
  minimumOfficeWidthForReceptions,
  OFFICE_GEOMETRY,
  receptionAgentAnchor,
  receptionTableRect,
  resolveOfficeLayout,
  resolveReceptionLayout,
  standingAnchor,
} from "./officeGeometry";
import type {
  OfficeLayout,
  OfficeReceptionRect,
  OfficeRoomRect,
} from "./officeGeometry";

const CHARACTER_URLS = Array.from(
  { length: 12 },
  (_, index) => `/world/characters/${index + 1}-D-1.png`,
);

const pointerSequences = new WeakMap<
  (key: string) => void,
  {
    key: string;
    at: number;
    x: number;
    y: number;
    activate?: (key: string) => void;
  }
>();
const canvasActivationCandidates = new WeakMap<
  (key: string) => void,
  {
    key: string;
    at: number;
    x: number;
    y: number;
    activate: (key: string) => void;
  }
>();

const THEMES = Object.freeze([
  { floorA: 0x0c1620, floorB: 0x0a121c, wall: 0x1e3050, accent: 0x4aa3d8 },
  { floorA: 0x120c20, floorB: 0x100a1e, wall: 0x34215a, accent: 0x9a6bd1 },
  { floorA: 0x18140c, floorB: 0x16120a, wall: 0x463522, accent: 0xd69540 },
  { floorA: 0x0c1a18, floorB: 0x0a1614, wall: 0x20503d, accent: 0x51b677 },
  { floorA: 0x1a0c10, floorB: 0x180a0e, wall: 0x51232b, accent: 0xd45d70 },
  { floorA: 0x18100c, floorB: 0x160e0a, wall: 0x482d22, accent: 0xcf7944 },
]);

const STATUS_CUES = Object.freeze({
  working: { label: "WORKING", color: 0x67d6c0 },
  idle: { label: "IDLE", color: 0x8d9aae },
  blocked: { label: "NEEDS INPUT", color: 0xec8799 },
  done: { label: "DONE", color: 0xf0c878 },
  unknown: { label: "UNKNOWN", color: 0xc29add },
});

const VIRTUAL_ROOM_ROW_OVERSCAN = 4;

type AnimatedItem =
  | { kind: "character"; node: Container; baseY: number; phase: number }
  | { kind: "monitor" | "status"; node: Container | Graphics; baseAlpha: number; phase: number };

export type OfficeRendererDiagnostics = {
  mounts: number;
  destroys: number;
  activeApplications: number;
  activeTickers: number;
  activeObservers: number;
  activeListeners: number;
  canvases: number;
  frames: number;
  ready: boolean;
  reducedMotion: boolean;
  lastError: string | null;
  animation: {
    characters: number;
    monitors: number;
    statuses: number;
  };
  layout: null | {
    officeWidth: number;
    totalHeight: number;
    rooms: number;
    characterHeight: number;
    ceoBandHeight: number;
    barBandHeight: number;
    viewportHeight: number;
  };
};

declare global {
  interface Window {
    __HERDR_WORLD_FORCE_RENDERER_FAILURE__?: boolean;
    __HERDR_WORLD_RENDERER__?: OfficeRendererDiagnostics;
  }
}

export type OfficeRendererController = {
  update: (projection: HerdrOfficeProjection, selectedKey: string | null) => void;
  destroy: () => void;
};

export async function createOfficeRenderer(
  element: HTMLElement,
  projection: HerdrOfficeProjection,
  selectedKey: string | null,
  onSelect: (key: string) => void,
  onActivateAgent: (key: string) => void,
  onActivateRoom: (key: string) => void,
): Promise<OfficeRendererController> {
  if (window.__HERDR_WORLD_FORCE_RENDERER_FAILURE__) {
    throw new Error("renderer unavailable");
  }
  const diagnostics = ensureDiagnostics();
  diagnostics.mounts += 1;
  diagnostics.activeApplications += 1;
  diagnostics.activeTickers += 1;
  diagnostics.ready = false;

  const app = new Application();
  let disposed = false;
  let currentProjection = projection;
  let currentSelectedKey = selectedKey;
  let currentLayout: OfficeLayout | null = null;
  let visibleWindowKey: string | null = null;
  let lastWidth = 0;
  let resizeTimer: number | null = null;
  let tick = 0;
  const animated: AnimatedItem[] = [];
  const scrollElement = element.closest<HTMLElement>(".world-stage-scroll");
  const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionPreference.matches;

  try {
    await app.init({
      width: OFFICE_GEOMETRY.minOfficeWidth,
      height: 640,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      roundPixels: true,
      preference: "webgl",
    });
  } catch (error) {
    diagnostics.activeApplications = Math.max(0, diagnostics.activeApplications - 1);
    diagnostics.activeTickers = Math.max(0, diagnostics.activeTickers - 1);
    throw error;
  }
  if (disposed) {
    app.destroy(true, { children: true });
    throw new Error("renderer disposed");
  }
  element.replaceChildren(app.canvas);
  app.canvas.setAttribute("aria-hidden", "true");
  app.canvas.setAttribute("data-office-canvas", "true");
  app.canvas.style.imageRendering = "auto";
  diagnostics.canvases = document.querySelectorAll("canvas[data-office-canvas='true']").length;
  diagnostics.lastError = null;

  const textures = await Promise.all(
    CHARACTER_URLS.map((url) => loadTexture(url).catch(() => Texture.EMPTY)),
  );
  if (disposed) {
    app.destroy(true, { children: true });
    destroyTextures(textures);
    diagnostics.destroys += 1;
    diagnostics.activeApplications = Math.max(0, diagnostics.activeApplications - 1);
    diagnostics.activeTickers = Math.max(0, diagnostics.activeTickers - 1);
    throw new Error("renderer disposed");
  }

  const select = (key: string) => {
    if (!disposed) {
      onSelect(key);
    }
  };
  const activateAgent = (key: string) => {
    if (!disposed) {
      onActivateAgent(key);
    }
  };
  const activateRoom = (key: string) => {
    if (!disposed) {
      onActivateRoom(key);
    }
  };
  const onCanvasDoubleClick = (event: MouseEvent) => {
    const prior = canvasActivationCandidates.get(select);
    if (!prior) {
      return;
    }
    const closeToFirstClick = Math.hypot(
      event.offsetX - prior.x,
      event.offsetY - prior.y,
    ) <= 12;
    const current = window.performance.now() - prior.at <= 1_000;
    pointerSequences.delete(select);
    canvasActivationCandidates.delete(select);
    if (closeToFirstClick && current) {
      prior.activate(prior.key);
    }
  };
  app.canvas.addEventListener("dblclick", onCanvasDoubleClick);
  diagnostics.activeListeners += 1;

  const renderScene = (layout: OfficeLayout, force = false) => {
    if (disposed) {
      return;
    }
    const scrollTop = scrollElement?.scrollTop ?? 0;
    const viewportHeight = Math.min(
      layout.totalHeight,
      Math.max(1, scrollElement?.clientHeight ?? layout.totalHeight),
    );
    const largestRoomHeight = Math.max(
      OFFICE_GEOMETRY.minRoomHeight,
      ...layout.rooms.map(({ height }) => height),
    );
    const overscan =
      (largestRoomHeight + OFFICE_GEOMETRY.roomGap) * VIRTUAL_ROOM_ROW_OVERSCAN;
    const visibleRooms = layout.rooms.filter(
      (room) => room.y + room.height >= scrollTop - overscan
        && room.y <= scrollTop + viewportHeight + overscan,
    );
    const nextWindowKey = visibleRooms.length > 0
      ? `${visibleRooms[0].index}:${visibleRooms[visibleRooms.length - 1].index}`
      : "none";
    if (!force && nextWindowKey === visibleWindowKey) {
      return;
    }
    visibleWindowKey = nextWindowKey;
    animated.splice(0);
    const children = app.stage.removeChildren();
    children.forEach((child) => child.destroy({ children: true }));
    drawBackground(app.stage, layout);
    drawCeoReception(
      app.stage,
      layout,
      currentProjection,
      currentSelectedKey,
      textures,
      animated,
      select,
      activateAgent,
    );
    drawHallways(app.stage, layout);
    visibleRooms.forEach((rect) => {
      const room = currentProjection.rooms[rect.index];
      if (room) {
        drawRoom(
          app.stage,
          room,
          rect,
          currentProjection,
          currentSelectedKey,
          textures,
          animated,
          select,
          activateAgent,
          activateRoom,
        );
      }
    });
    drawAgentBar(
      app.stage,
      layout,
      currentProjection,
      currentSelectedKey,
      textures,
      animated,
      select,
      activateAgent,
    );
    diagnostics.ready = true;
    diagnostics.reducedMotion = reducedMotion;
    diagnostics.animation = {
      characters: animated.filter(({ kind }) => kind === "character").length,
      monitors: animated.filter(({ kind }) => kind === "monitor").length,
      statuses: animated.filter(({ kind }) => kind === "status").length,
    };
  };

  const syncScrollPosition = () => {
    app.stage.position.y = -(scrollElement?.scrollTop ?? 0);
    if (currentLayout) {
      renderScene(currentLayout);
    }
  };
  if (scrollElement) {
    scrollElement.addEventListener("scroll", syncScrollPosition, { passive: true });
    diagnostics.activeListeners += 1;
  }

  const build = (requestedWidth = element.clientWidth) => {
    if (disposed) {
      return;
    }
    const width = Math.max(
      minimumOfficeWidthForReceptions(currentProjection.receptions.length),
      Math.floor(requestedWidth || 0),
    );
    const layout = resolveOfficeLayout(
      width,
      currentProjection.rooms.map((room) => ({
        deskCount: room.desks.length,
        standingCount: room.roomAgents.filter(({ placement }) => placement === "standing").length,
      })),
    );
    const viewportHeight = Math.min(
      layout.totalHeight,
      Math.max(1, scrollElement?.clientHeight ?? layout.totalHeight),
    );
    currentLayout = layout;
    lastWidth = layout.officeWidth;
    app.renderer.resize(layout.officeWidth, viewportHeight);
    element.style.width = `${layout.officeWidth}px`;
    element.style.height = `${layout.totalHeight}px`;
    app.stage.position.y = -(scrollElement?.scrollTop ?? 0);
    renderScene(layout, true);
    diagnostics.layout = {
      officeWidth: layout.officeWidth,
      totalHeight: layout.totalHeight,
      rooms: layout.rooms.length,
      characterHeight: OFFICE_GEOMETRY.characterHeight,
      ceoBandHeight: OFFICE_GEOMETRY.ceoBandHeight,
      barBandHeight: OFFICE_GEOMETRY.barBandHeight,
      viewportHeight,
    };
  };

  const ticker = () => {
    diagnostics.frames += 1;
    tick += 1;
    if (reducedMotion) {
      return;
    }
    for (const item of animated) {
      const wave = Math.sin(tick * 0.075 + item.phase);
      if (item.kind === "character") {
        item.node.y = item.baseY + wave * 2;
      } else if (item.kind === "monitor") {
        item.node.alpha = item.baseAlpha + (wave + 1) * 0.15;
      } else {
        item.node.alpha = 0.82 + (wave + 1) * 0.09;
      }
    }
  };
  app.ticker.add(ticker);

  const onMotionChange = (event: MediaQueryListEvent) => {
    reducedMotion = event.matches;
    diagnostics.reducedMotion = reducedMotion;
    if (reducedMotion) {
      for (const item of animated) {
        if (item.kind === "character") {
          item.node.y = item.baseY;
        } else {
          item.node.alpha = item.baseAlpha;
        }
      }
    }
  };
  motionPreference.addEventListener("change", onMotionChange);
  diagnostics.activeListeners += 1;

  const observer = new ResizeObserver((entries) => {
    const nextWidth = Math.max(
      OFFICE_GEOMETRY.minOfficeWidth,
      Math.floor(entries[0]?.contentRect.width || 0),
    );
    if (Math.abs(nextWidth - lastWidth) <= 10) {
      return;
    }
    if (resizeTimer !== null) {
      window.clearTimeout(resizeTimer);
    }
    resizeTimer = window.setTimeout(() => build(nextWidth), 80);
  });
  observer.observe(element);
  diagnostics.activeObservers += 1;
  try {
    build();
  } catch (error) {
    observer.disconnect();
    motionPreference.removeEventListener("change", onMotionChange);
    scrollElement?.removeEventListener("scroll", syncScrollPosition);
    app.canvas.removeEventListener("dblclick", onCanvasDoubleClick);
    pointerSequences.delete(select);
    canvasActivationCandidates.delete(select);
    app.ticker.remove(ticker);
    app.destroy(true, { children: true });
    destroyTextures(textures);
    diagnostics.activeApplications = Math.max(0, diagnostics.activeApplications - 1);
    diagnostics.activeTickers = Math.max(0, diagnostics.activeTickers - 1);
    diagnostics.activeObservers = Math.max(0, diagnostics.activeObservers - 1);
    diagnostics.activeListeners = Math.max(
      0,
      diagnostics.activeListeners - (scrollElement ? 3 : 2),
    );
    throw error;
  }

  return {
    update(nextProjection, nextSelectedKey) {
      currentProjection = nextProjection;
      currentSelectedKey = nextSelectedKey;
      build(lastWidth || element.clientWidth);
    },
    destroy() {
      if (disposed) {
        return;
      }
      disposed = true;
      if (resizeTimer !== null) {
        window.clearTimeout(resizeTimer);
      }
      observer.disconnect();
      motionPreference.removeEventListener("change", onMotionChange);
      scrollElement?.removeEventListener("scroll", syncScrollPosition);
      app.canvas.removeEventListener("dblclick", onCanvasDoubleClick);
      pointerSequences.delete(select);
      canvasActivationCandidates.delete(select);
      app.ticker.remove(ticker);
      app.destroy(true, { children: true });
      destroyTextures(textures);
      element.replaceChildren();
      element.style.removeProperty("width");
      element.style.removeProperty("height");
      diagnostics.destroys += 1;
      diagnostics.activeApplications = Math.max(0, diagnostics.activeApplications - 1);
      diagnostics.activeTickers = Math.max(0, diagnostics.activeTickers - 1);
      diagnostics.activeObservers = Math.max(0, diagnostics.activeObservers - 1);
      diagnostics.activeListeners = Math.max(
        0,
        diagnostics.activeListeners - (scrollElement ? 3 : 2),
      );
      diagnostics.canvases = document.querySelectorAll("canvas[data-office-canvas='true']").length;
      diagnostics.ready = false;
    },
  };
}

function drawBackground(stage: Container, layout: OfficeLayout) {
  const background = new Graphics();
  background.roundRect(0, 0, layout.officeWidth, layout.totalHeight, 6).fill(0x0e0e1c);
  for (let band = 0; band < 14; band += 1) {
    background
      .rect(
        2,
        2 + (layout.totalHeight - 4) * (band / 14),
        layout.officeWidth - 4,
        layout.totalHeight / 14 + 1,
      )
      .fill({ color: blendColor(0x15152a, 0x090914, band / 13), alpha: 0.9 });
  }
  background
    .roundRect(2, 2, layout.officeWidth - 4, layout.totalHeight - 4, 5)
    .stroke({ width: 2, color: 0x2a2a48, alpha: 0.8 });
  stage.addChild(background);
}

function drawCeoReception(
  stage: Container,
  layout: OfficeLayout,
  projection: HerdrOfficeProjection,
  selectedKey: string | null,
  textures: readonly Texture[],
  animated: AnimatedItem[],
  onSelect: (key: string) => void,
  onActivateAgent: (key: string) => void,
) {
  const band = new Container();
  const floor = new Graphics();
  drawTiledFloor(
    floor,
    4,
    4,
    layout.officeWidth - 8,
    OFFICE_GEOMETRY.ceoBandHeight - 4,
    0x131328,
    0x0e0e1d,
  );
  floor
    .roundRect(4, 4, layout.officeWidth - 8, OFFICE_GEOMETRY.ceoBandHeight - 4, 4)
    .stroke({ width: 2, color: 0x8d7135, alpha: 0.8 });
  band.addChild(floor);
  addSign(band, 12, 8, "CEO RECEPTION", 0x76571c, 112);
  const subtitle = label("ONE HERDR CLIENT · HOST-QUALIFIED WAITING", {
    size: 10,
    color: 0xd8bd7c,
  });
  subtitle.position.set(138, 12);
  band.addChild(subtitle);

  drawCeo(band, textures);
  const receptionRects = resolveReceptionLayout(
    layout.officeWidth,
    projection.receptions.length,
  );
  projection.receptions.forEach((reception, index) => {
    const rect = receptionRects[index];
    if (!rect) {
      return;
    }
    drawReceptionDesk(
      band,
      reception,
      projection,
      rect,
      selectedKey,
      textures,
      animated,
      onSelect,
      onActivateAgent,
    );
  });
  if (projection.coverage.omittedReceptionDesks > 0) {
    const overflow = label(`+${projection.coverage.omittedReceptionDesks} host desks in roster`, {
      size: 10,
      color: 0xd7c394,
      anchor: { x: 1, y: 0 },
    });
    overflow.position.set(layout.officeWidth - 18, 13);
    band.addChild(overflow);
  }
  stage.addChild(band);
}

function drawCeo(parent: Container, textures: readonly Texture[]) {
  const title = label("YOU · CEO", { size: 11, color: 0xf6e3b2, anchor: 0.5 });
  title.position.set(94, 48);
  parent.addChild(title);
  const copy = label("Reception", { size: 9, color: 0xb7a47b, anchor: 0.5 });
  copy.position.set(94, 63);
  parent.addChild(copy);
  drawChair(parent, 94, 136, 0x8c6e35);
  const viewer = new Container();
  viewer.position.set(94, 148);
  addCharacterSprite(viewer, textures[0] ?? Texture.EMPTY);
  parent.addChild(viewer);
  drawChairArms(parent, 94, 136, 0x8c6e35);
  const desk = new Graphics();
  desk.roundRect(14, 130, 160, 44, 5).fill(0x493728);
  desk.roundRect(18, 134, 152, 36, 4).fill(0x705234);
  desk.roundRect(64, 138, 60, 25, 3).fill(0x182031);
  desk.roundRect(71, 144, 46, 13, 2).fill(0x356c9e);
  desk.rect(18, 168, 152, 2).fill({ color: 0xc39a55, alpha: 0.72 });
  parent.addChild(desk);
  const note = label("No inferred activity state", {
    size: 8,
    color: 0x8f8ca8,
    anchor: 0.5,
  });
  note.position.set(94, 190);
  parent.addChild(note);
}

function drawReceptionDesk(
  parent: Container,
  reception: OfficeReception,
  projection: HerdrOfficeProjection,
  rect: OfficeReceptionRect,
  selectedKey: string | null,
  textures: readonly Texture[],
  animated: AnimatedItem[],
  onSelect: (key: string) => void,
  onActivateAgent: (key: string) => void,
) {
  const host = projection.hosts.find(({ key }) => key === reception.hostKey);
  if (!host) {
    return;
  }
  const accent = hostColor(host);
  const centerX = rect.x + rect.width / 2;
  const zone = new Graphics();
  zone.rect(rect.x, rect.y, rect.width, rect.height).fill({
    color: selectedKey === host.key ? accent : 0x000000,
    alpha: selectedKey === host.key ? 0.08 : 0.001,
  });
  makeInteractive(zone, host.key, onSelect);
  parent.addChild(zone);
  if (rect.index > 0) {
    const separator = new Graphics();
    separator.rect(
      rect.x - OFFICE_GEOMETRY.receptionStationGap / 2,
      rect.y + 8,
      1,
      rect.height - 20,
    ).fill({ color: 0x77749a, alpha: 0.22 });
    parent.addChild(separator);
  }
  const heading = label(`${host.deterministicSkin.badge} · ${host.displayLabel}`, {
    size: 10,
    color: accent,
    anchor: 0.5,
  });
  heading.position.set(centerX, rect.y + 10);
  parent.addChild(heading);
  const state = label(`${host.connectionState.toUpperCase()}${reception.stale ? " · STALE" : ""}`, {
    size: 8,
    color: reception.stale ? 0xffb0ba : 0xabb6c8,
    anchor: 0.5,
  });
  state.position.set(centerX, rect.y + 24);
  parent.addChild(state);

  const agents = reception.waitingAgents;
  const table = receptionTableRect(rect);
  const receptionChairs = Array.from({ length: 4 }, (_, index) => {
    const anchor = receptionAgentAnchor(rect, index);
    const chairY = anchor.characterFeetY - OFFICE_GEOMETRY.characterHeight * 0.18;
    drawChair(parent, anchor.x, chairY, accent);
    return { anchor, chairY };
  });
  Array.from({ length: 3 }, (_, index) =>
    table.x + table.width * ((index + 0.5) / 3)).forEach((x) => {
    const chairY = table.y + table.height + 10;
    drawChair(parent, x, chairY, accent);
    drawChairArms(parent, x, chairY, accent);
  });
  agents.forEach((agent, index) => {
    const { anchor, chairY } = receptionChairs[index];
    const name = label(shortLabel(agent.displayLabel, 12), {
      size: 8,
      color: 0xf2edf1,
      anchor: 0.5,
    });
    name.position.set(anchor.x, anchor.nameY);
    makeInteractive(name, agent.key, onSelect, onActivateAgent);
    parent.addChild(name);
    const character = drawCharacter(
      parent,
      textures[agent.characterIndex] ?? Texture.EMPTY,
      anchor.x,
      anchor.characterFeetY,
      false,
      agent.stale,
      animated,
      agent.key,
      onSelect,
      selectedKey,
      onActivateAgent,
    );
    character.alpha = agent.stale ? 0.56 : 1;
    drawChairArms(parent, anchor.x, chairY, accent);
  });
  receptionChairs.slice(agents.length).forEach(({ anchor, chairY }) => {
    drawChairArms(parent, anchor.x, chairY, accent);
  });

  const desk = new Graphics();
  desk.ellipse(table.x + table.width / 2, table.y + table.height + 6, table.width * 0.82, 10)
    .fill({ color: 0x000000, alpha: 0.24 });
  desk.roundRect(table.x, table.y, table.width, table.height, 16).fill(0x4a3526);
  desk.roundRect(table.x + 4, table.y + 4, table.width - 8, table.height - 8, 13)
    .fill(0x765437);
  desk.roundRect(table.x + table.width * 0.32, table.y + 8, table.width * 0.36, 7, 3)
    .fill(0x2d2b32);
  desk.roundRect(table.x + 6, table.y + 6, table.width - 12, table.height - 12, 11)
    .stroke({ width: 1, color: accent, alpha: 0.58 });
  makeInteractive(desk, host.key, onSelect);
  parent.addChild(desk);
  const deskLabel = label(agents.length ? "WAITING · NEEDS INPUT" : "RECEPTION DESK · CLEAR", {
    size: 8,
    color: agents.length ? 0xffbec8 : 0xc5d0df,
    anchor: 0.5,
  });
  deskLabel.position.set(centerX, table.y + table.height / 2);
  parent.addChild(deskLabel);
  if (reception.overflowCount > 0) {
    const overflow = label(`+${reception.overflowCount} waiting in roster`, {
      size: 8,
      color: 0xf0c878,
      anchor: 0.5,
    });
    overflow.position.set(centerX, table.y + table.height - 7);
    parent.addChild(overflow);
  }
}

function drawHallways(stage: Container, layout: OfficeLayout) {
  const hall = new Graphics();
  for (const y of [OFFICE_GEOMETRY.ceoBandHeight, layout.barBandY - OFFICE_GEOMETRY.hallwayHeight]) {
    hall.rect(4, y, layout.officeWidth - 8, OFFICE_GEOMETRY.hallwayHeight).fill(0x252537);
    hall.rect(4, y, layout.officeWidth - 8, 1).fill({ color: 0x6c6990, alpha: 0.35 });
    for (let x = 20; x < layout.officeWidth - 20; x += 18) {
      hall.rect(x, y + 16, 7, 1).fill({ color: 0x77749a, alpha: 0.38 });
    }
  }
  stage.addChild(hall);
}

function drawRoom(
  stage: Container,
  room: OfficeRoom,
  rect: OfficeRoomRect,
  projection: HerdrOfficeProjection,
  selectedKey: string | null,
  textures: readonly Texture[],
  animated: AnimatedItem[],
  onSelect: (key: string) => void,
  onActivateAgent: (key: string) => void,
  onActivateRoom: (key: string) => void,
) {
  const host = projection.hosts.find(({ key }) => key === room.hostKey);
  if (!host) {
    return;
  }
  const theme = THEMES[host.deterministicSkin.themeIndex % THEMES.length];
  const parent = new Container();
  const floor = new Graphics();
  drawTiledFloor(floor, rect.x, rect.y, rect.width, rect.height, theme.floorA, theme.floorB);
  floor.rect(rect.x, rect.y, rect.width, 34).fill({ color: theme.wall, alpha: 0.76 });
  floor.roundRect(rect.x, rect.y, rect.width, rect.height, 4).stroke({
    width: selectedKey === room.key ? 4 : 2,
    color: selectedKey === room.key ? 0xffffff : theme.accent,
    alpha: selectedKey === room.key ? 0.92 : 0.78,
  });
  makeInteractive(floor, room.key, onSelect, onActivateRoom);
  parent.addChild(floor);
  addSign(
    parent,
    rect.x + rect.width / 2 - 126,
    rect.y - 5,
    `${shortLabel(room.displayLabel.toUpperCase(), 26)} · ${host.deterministicSkin.badge}`,
    theme.accent,
    252,
    room.key,
    onSelect,
    onActivateRoom,
  );
  const hostText = label(`${host.displayLabel} · ${host.connectionState}${room.stale ? " · STALE" : ""}`, {
    size: 9,
    color: room.stale ? 0xffb0ba : 0xbcc8d9,
  });
  hostText.position.set(rect.x + 12, rect.y + 20);
  parent.addChild(hostText);
  drawWindow(parent, rect.x + rect.width / 2 - 18, rect.y + 17);
  drawPlant(parent, rect.x + 14, rect.y + rect.height - 18, theme.accent);
  drawPlant(parent, rect.x + rect.width - 16, rect.y + rect.height - 18, theme.accent);

  const agentByKey = new Map(room.roomAgents.map((agent) => [agent.key, agent]));
  room.desks.forEach((desk, index) => {
    const occupant = desk.occupantAgentKey ? agentByKey.get(desk.occupantAgentKey) : undefined;
    drawTabDesk(
      parent,
      desk,
      occupant,
      rect,
      index,
      theme.accent,
      selectedKey,
      textures,
      animated,
      onSelect,
      onActivateAgent,
    );
  });
  room.roomAgents
    .filter(({ placement }) => placement === "standing")
    .forEach((agent, index) => {
      drawStandingAgent(
        parent,
        agent,
        rect,
        index,
        selectedKey,
        textures,
        animated,
        onSelect,
        onActivateAgent,
      );
    });

  const overflow: string[] = [];
  if (room.omittedDeskCount > 0) {
    overflow.push(`+${room.omittedDeskCount} desks`);
  }
  if (room.omittedAgentCount > 0) {
    overflow.push(`+${room.omittedAgentCount} agents`);
  }
  if (overflow.length > 0) {
    const copy = label(`${overflow.join(" · ")} in roster`, {
      size: 9,
      color: 0xd7deea,
      anchor: { x: 1, y: 0 },
    });
    copy.position.set(rect.x + rect.width - 18, rect.y + rect.height - 18);
    parent.addChild(copy);
  }
  if (room.stale) {
    parent.alpha = 0.68;
    const stale = new Graphics();
    stale.rect(rect.x, rect.y, rect.width, rect.height).fill({ color: 0x7b2735, alpha: 0.08 });
    parent.addChild(stale);
  }
  stage.addChild(parent);
}

function drawTabDesk(
  parent: Container,
  desk: OfficeDesk,
  occupant: OfficeAgent | undefined,
  rect: OfficeRoomRect,
  index: number,
  accent: number,
  selectedKey: string | null,
  textures: readonly Texture[],
  animated: AnimatedItem[],
  onSelect: (key: string) => void,
  onActivateAgent: (key: string) => void,
) {
  const anchor = deskAnchor(rect, index);
  const tabName = label(shortLabel(desk.displayLabel, 18), {
    size: 9,
    color: selectedKey === desk.key ? 0xffffff : 0xdce6f3,
    anchor: 0.5,
  });
  const plateWidth = Math.max(58, Math.min(anchor.stationSpan - 6, tabName.width + 14));
  const tabPlate = new Graphics();
  tabPlate.roundRect(anchor.x - plateWidth / 2, anchor.nameY, plateWidth, 16, 4)
    .fill({ color: selectedKey === desk.key ? accent : 0x1c2736, alpha: 0.96 });
  tabPlate.roundRect(anchor.x - plateWidth / 2, anchor.nameY, plateWidth, 16, 4)
    .stroke({ width: selectedKey === desk.key ? 2 : 1, color: accent, alpha: 0.82 });
  makeInteractive(tabPlate, desk.key, onSelect);
  parent.addChild(tabPlate);
  tabName.position.set(anchor.x, anchor.nameY + 8);
  makeInteractive(tabName, desk.key, onSelect);
  parent.addChild(tabName);

  const chairY = anchor.characterFeetY - OFFICE_GEOMETRY.characterHeight * 0.18;
  drawChair(parent, anchor.x, chairY, accent);
  if (occupant) {
    const cue = occupant.stale ? { label: "STALE", color: 0x79869a } : STATUS_CUES[occupant.semanticStatus];
    const status = label(`${shortLabel(occupant.displayLabel, 11)} · ${cue.label}`, {
      size: 7,
      color: 0x111722,
      anchor: 0.5,
    });
    const statusWidth = Math.max(54, Math.min(anchor.stationSpan - 4, status.width + 10));
    const statusPlate = new Graphics();
    statusPlate.roundRect(anchor.x - statusWidth / 2, anchor.nameY + 18, statusWidth, 12, 3)
      .fill({ color: cue.color, alpha: 0.96 });
    makeInteractive(statusPlate, occupant.key, onSelect, onActivateAgent);
    parent.addChild(statusPlate);
    status.position.set(anchor.x, anchor.nameY + 24);
    makeInteractive(status, occupant.key, onSelect, onActivateAgent);
    parent.addChild(status);
    if (occupant.semanticStatus === "working" && !occupant.stale) {
      animated.push({ kind: "status", node: statusPlate, baseAlpha: 1, phase: animated.length * 7 });
    }
    const character = drawCharacter(
      parent,
      textures[occupant.characterIndex] ?? Texture.EMPTY,
      anchor.x,
      anchor.characterFeetY,
      occupant.semanticStatus === "working",
      occupant.stale,
      animated,
      occupant.key,
      onSelect,
      selectedKey,
      onActivateAgent,
    );
    character.alpha = occupant.stale ? 0.56 : 1;
    drawChairArms(parent, anchor.x, chairY, accent);
  } else {
    drawChairArms(parent, anchor.x, chairY, accent);
    const empty = label("EMPTY", { size: 8, color: 0x7f8da1, anchor: 0.5 });
    empty.position.set(anchor.x, anchor.nameY + 25);
    parent.addChild(empty);
  }
  const deskNode = drawDesk(
    parent,
    anchor.x - OFFICE_GEOMETRY.deskWidth / 2,
    anchor.deskY,
    accent,
    occupant?.semanticStatus === "working" && !occupant.stale,
    animated,
  );
  makeInteractive(deskNode, desk.key, onSelect);
}

function drawStandingAgent(
  parent: Container,
  agent: OfficeAgent,
  rect: OfficeRoomRect,
  index: number,
  selectedKey: string | null,
  textures: readonly Texture[],
  animated: AnimatedItem[],
  onSelect: (key: string) => void,
  onActivateAgent: (key: string) => void,
) {
  const anchor = standingAnchor(rect, index);
  const cue = agent.stale ? { label: "STALE", color: 0x79869a } : STATUS_CUES[agent.semanticStatus];
  const name = label(shortLabel(agent.displayLabel, 10), {
    size: 8,
    color: 0xf2f4f8,
    anchor: 0.5,
  });
  name.position.set(anchor.x, anchor.nameY + 6);
  makeInteractive(name, agent.key, onSelect, onActivateAgent);
  parent.addChild(name);
  const state = label(cue.label, { size: 7, color: cue.color, anchor: 0.5 });
  state.position.set(anchor.x, anchor.nameY + 18);
  makeInteractive(state, agent.key, onSelect, onActivateAgent);
  parent.addChild(state);
  const character = drawCharacter(
    parent,
    textures[agent.characterIndex] ?? Texture.EMPTY,
    anchor.x,
    anchor.characterFeetY,
    agent.semanticStatus === "working",
    agent.stale,
    animated,
    agent.key,
    onSelect,
    selectedKey,
    onActivateAgent,
  );
  character.alpha = agent.stale ? 0.56 : 1;
}

function drawAgentBar(
  stage: Container,
  layout: OfficeLayout,
  projection: HerdrOfficeProjection,
  selectedKey: string | null,
  textures: readonly Texture[],
  animated: AnimatedItem[],
  onSelect: (key: string) => void,
  onActivateAgent: (key: string) => void,
) {
  const x = 4;
  const y = layout.barBandY;
  const width = layout.officeWidth - 8;
  const room = new Container();
  const floor = new Graphics();
  drawTiledFloor(floor, x, y, width, OFFICE_GEOMETRY.barBandHeight, 0x17140f, 0x11100d);
  floor.rect(x, y, width, 34).fill({ color: 0x4a3b22, alpha: 0.72 });
  floor.roundRect(x, y, width, OFFICE_GEOMETRY.barBandHeight, 4)
    .stroke({ width: 2, color: 0xb59048, alpha: 0.72 });
  room.addChild(floor);
  addSign(room, x + width / 2 - 72, y - 5, "AGENT BAR", 0xa17d37, 144);
  const copy = label("IDLE and DONE agents are off the work floor, with their structured status retained", {
    size: 10,
    color: 0xd1c39f,
  });
  copy.position.set(x + 14, y + 20);
  room.addChild(copy);
  const counter = new Graphics();
  counter.roundRect(x + 20, y + 88, width - 40, 24, 8).fill(0x4c3122);
  counter.roundRect(x + 24, y + 92, width - 48, 16, 6).fill(0x75482d);
  room.addChild(counter);

  const columns = 8;
  const stationSpan = (width - 32) / columns;
  projection.barAgents.forEach((agent, index) => {
    const column = index % columns;
    const rowIndex = Math.floor(index / columns);
    const px = x + 16 + stationSpan * (column + 0.5);
    const rowY = y + 38 + rowIndex * 116;
    const cue = agent.stale ? { label: "STALE", color: 0x79869a } : STATUS_CUES[agent.semanticStatus];
    const name = label(shortLabel(agent.displayLabel, 14), {
      size: 9,
      color: 0xf0ece5,
      anchor: 0.5,
    });
    name.position.set(px, rowY + 6);
    makeInteractive(name, agent.key, onSelect, onActivateAgent);
    room.addChild(name);
    const state = label(cue.label, { size: 8, color: cue.color, anchor: 0.5 });
    state.position.set(px, rowY + 20);
    makeInteractive(state, agent.key, onSelect, onActivateAgent);
    room.addChild(state);
    const character = drawCharacter(
      room,
      textures[agent.characterIndex] ?? Texture.EMPTY,
      px,
      rowY + 103,
      false,
      agent.stale,
      animated,
      agent.key,
      onSelect,
      selectedKey,
      onActivateAgent,
    );
    character.alpha = agent.stale ? 0.56 : 1;
  });
  if (projection.coverage.omittedBarAgents > 0) {
    const overflow = label(`+${projection.coverage.omittedBarAgents} more in roster`, {
      size: 9,
      color: 0xe5cf98,
      anchor: { x: 1, y: 0 },
    });
    overflow.position.set(x + width - 16, y + 20);
    room.addChild(overflow);
  }
  stage.addChild(room);
}

function drawCharacter(
  parent: Container,
  texture: Texture,
  x: number,
  feetY: number,
  working: boolean,
  stale: boolean,
  animated: AnimatedItem[],
  key: string,
  onSelect: (key: string) => void,
  selectedKey: string | null,
  onActivateAgent?: (key: string) => void,
) {
  const container = new Container();
  container.position.set(x, feetY);
  addCharacterSprite(container, texture);
  if (selectedKey === key) {
    const selected = new Graphics();
    selected.ellipse(0, -2, 25, 8).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
    container.addChildAt(selected, 0);
  }
  makeInteractive(container, key, onSelect, onActivateAgent);
  if (working && !stale) {
    animated.push({ kind: "character", node: container, baseY: feetY, phase: animated.length * 7 });
  }
  parent.addChild(container);
  return container;
}

function addCharacterSprite(container: Container, texture: Texture) {
  if (texture !== Texture.EMPTY) {
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5, 1);
    sprite.scale.set(OFFICE_GEOMETRY.characterHeight / Math.max(1, texture.height));
    sprite.roundPixels = true;
    container.addChild(sprite);
  } else {
    const fallback = label("◆", { size: 22, color: 0xb4befe, anchor: 0.5 });
    fallback.position.y = -22;
    container.addChild(fallback);
  }
}

function drawChair(parent: Container, x: number, y: number, accent: number) {
  const chair = new Graphics();
  const frame = blendColor(accent, 0x0b0d16, 0.3);
  const cushion = blendColor(accent, 0x20243a, 0.38);
  chair.ellipse(x, y + 13, 28, 7).fill({ color: 0x000000, alpha: 0.24 });
  chair.rect(x - 2, y + 1, 4, 11).fill(frame);
  chair.rect(x - 13, y + 10, 26, 3).fill(frame);
  chair.circle(x - 13, y + 13, 3).fill(frame);
  chair.circle(x + 13, y + 13, 3).fill(frame);
  chair.ellipse(x, y, 27, 11).fill(cushion);
  chair.roundRect(x - 20, y - 31, 40, 22, 7).fill(frame);
  chair.roundRect(x - 16, y - 28, 32, 15, 5).fill(cushion);
  chair.roundRect(x - 13, y - 25, 26, 3, 2).fill({ color: accent, alpha: 0.48 });
  parent.addChild(chair);
}

function drawChairArms(parent: Container, x: number, y: number, accent: number) {
  const arms = new Graphics();
  const color = blendColor(accent, 0x0e1020, 0.18);
  arms.roundRect(x - 20, y - 14, 6, 17, 3).fill(color);
  arms.roundRect(x + 14, y - 14, 6, 17, 3).fill(color);
  parent.addChild(arms);
}

function drawDesk(
  parent: Container,
  x: number,
  y: number,
  accent: number,
  working: boolean,
  animated: AnimatedItem[],
) {
  const desk = new Graphics();
  desk.ellipse(x + 24, y + 30, 30, 6).fill({ color: 0x000000, alpha: 0.22 });
  desk.roundRect(x, y, 48, 26, 3).fill(0x765b38);
  desk.roundRect(x + 2, y + 2, 44, 22, 2).fill(0xae8b5d);
  desk.roundRect(x + 14, y + 10, 21, 13, 2).fill(blendColor(accent, 0x101722, 0.7));
  desk.roundRect(x + 16, y + 12, 17, 8, 1).fill(working ? 0x347d86 : 0x172131);
  desk.rect(x + 1, y + 24, 46, 2).fill({ color: accent, alpha: 0.78 });
  parent.addChild(desk);
  if (working) {
    const glow = new Graphics();
    glow.roundRect(x + 16, y + 12, 17, 8, 1).fill({ color: 0xc9fff4, alpha: 0.18 });
    parent.addChild(glow);
    animated.push({ kind: "monitor", node: glow, baseAlpha: 0.18, phase: animated.length * 7 });
  }
  return desk;
}

function drawWindow(parent: Container, x: number, y: number) {
  const windowNode = new Graphics();
  windowNode.roundRect(x, y, 36, 23, 3).fill(0x504955);
  windowNode.rect(x + 3, y + 3, 14, 7).fill(0x3f6888);
  windowNode.rect(x + 19, y + 3, 14, 7).fill(0x537b96);
  windowNode.rect(x + 3, y + 12, 14, 7).fill(0x355d7c);
  windowNode.rect(x + 19, y + 12, 14, 7).fill(0x446f8d);
  parent.addChild(windowNode);
}

function drawPlant(parent: Container, x: number, y: number, accent: number) {
  const plant = new Graphics();
  plant.roundRect(x - 6, y, 12, 8, 2).fill(0xa65c46);
  plant.circle(x, y - 4, 7).fill(blendColor(accent, 0x4f956f, 0.7));
  plant.circle(x - 5, y - 7, 4).fill(0x5b9c78);
  plant.circle(x + 5, y - 7, 4).fill(0x69aa85);
  parent.addChild(plant);
}

function drawTiledFloor(
  graphics: Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  first: number,
  second: number,
) {
  for (let offsetY = 0; offsetY < height; offsetY += OFFICE_GEOMETRY.tile) {
    for (let offsetX = 0; offsetX < width; offsetX += OFFICE_GEOMETRY.tile) {
      graphics.rect(x + offsetX, y + offsetY, OFFICE_GEOMETRY.tile, OFFICE_GEOMETRY.tile)
        .fill(((offsetX + offsetY) / OFFICE_GEOMETRY.tile) % 2 === 0 ? first : second);
    }
  }
}

function addSign(
  parent: Container,
  x: number,
  y: number,
  value: string,
  color: number,
  width: number,
  key?: string,
  onSelect?: (key: string) => void,
  onActivate?: (key: string) => void,
) {
  const background = new Graphics();
  background.roundRect(x, y, width, 19, 4).fill(color);
  background.roundRect(x, y, width, 19, 4)
    .stroke({ width: 1, color: blendColor(color, 0xffffff, 0.32), alpha: 0.72 });
  if (key && onSelect) {
    makeInteractive(background, key, onSelect, onActivate);
  }
  parent.addChild(background);
  const copy = label(value, { size: 10, color: 0xffffff, anchor: 0.5 });
  copy.position.set(x + width / 2, y + 9.5);
  if (key && onSelect) {
    makeInteractive(copy, key, onSelect, onActivate);
  }
  parent.addChild(copy);
}

function makeInteractive(
  node: Container | Graphics | Text,
  key: string,
  onSelect: (key: string) => void,
  onActivate?: (key: string) => void,
) {
  node.eventMode = "static";
  node.cursor = "pointer";
  node.on("pointertap", (event) => {
    event.stopPropagation();
    if (event.detail === 0) {
      pointerSequences.delete(onSelect);
      canvasActivationCandidates.delete(onSelect);
      onSelect(key);
      return;
    }
    const now = window.performance.now();
    const prior = pointerSequences.get(onSelect);
    const isSecondClick = prior?.key === key
      && (event.detail === 2 || now - prior.at <= 500);
    onSelect(key);
    if (isSecondClick) {
      pointerSequences.delete(onSelect);
      canvasActivationCandidates.delete(onSelect);
      onActivate?.(key);
      return;
    }
    pointerSequences.set(onSelect, {
      key,
      at: now,
      x: event.global.x,
      y: event.global.y,
      activate: onActivate,
    });
    const candidate = canvasActivationCandidates.get(onSelect);
    if (onActivate && (!candidate || now - candidate.at > 1_000)) {
      canvasActivationCandidates.set(onSelect, {
        key,
        at: now,
        x: event.global.x,
        y: event.global.y,
        activate: onActivate,
      });
    }
  });
}

function label(
  value: string,
  options: {
    size?: number;
    color?: number;
    anchor?: number | { x: number; y: number };
  } = {},
) {
  const text = new Text({
    text: value,
    resolution: 4,
    style: new TextStyle({
      fontSize: options.size ?? 9,
      fill: options.color ?? 0xffffff,
      fontWeight: "600",
      fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      dropShadow: { alpha: 0.24, distance: 1, color: 0x000000 },
    }),
  });
  if (typeof options.anchor === "number") {
    text.anchor.set(options.anchor);
  } else if (options.anchor) {
    text.anchor.set(options.anchor.x, options.anchor.y);
  }
  return text;
}

function shortLabel(value: string, limit: number) {
  const points = [...value];
  return points.length <= limit ? value : `${points.slice(0, Math.max(1, limit - 1)).join("")}…`;
}

function hostColor(host: OfficeHost) {
  return THEMES[host.deterministicSkin.themeIndex % THEMES.length].accent;
}

function blendColor(from: number, to: number, amount: number) {
  const ratio = Math.max(0, Math.min(1, amount));
  const fromRed = (from >> 16) & 0xff;
  const fromGreen = (from >> 8) & 0xff;
  const fromBlue = from & 0xff;
  const toRed = (to >> 16) & 0xff;
  const toGreen = (to >> 8) & 0xff;
  const toBlue = to & 0xff;
  return (
    (Math.round(fromRed + (toRed - fromRed) * ratio) << 16) |
    (Math.round(fromGreen + (toGreen - fromGreen) * ratio) << 8) |
    Math.round(fromBlue + (toBlue - fromBlue) * ratio)
  );
}

function ensureDiagnostics(): OfficeRendererDiagnostics {
  if (!window.__HERDR_WORLD_RENDERER__) {
    window.__HERDR_WORLD_RENDERER__ = {
      mounts: 0,
      destroys: 0,
      activeApplications: 0,
      activeTickers: 0,
      activeObservers: 0,
      activeListeners: 0,
      canvases: 0,
      frames: 0,
      ready: false,
      reducedMotion: false,
      lastError: null,
      animation: { characters: 0, monitors: 0, statuses: 0 },
      layout: null,
    };
  }
  return window.__HERDR_WORLD_RENDERER__;
}

async function loadTexture(url: string) {
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  if (typeof image.decode === "function") {
    await image.decode();
  } else {
    await new Promise<void>((resolve, reject) => {
      image.addEventListener("load", () => resolve(), { once: true });
      image.addEventListener("error", () => reject(new Error("character asset unavailable")), {
        once: true,
      });
    });
  }
  return Texture.from(image);
}

function destroyTextures(textures: readonly Texture[]) {
  for (const texture of textures) {
    if (texture !== Texture.EMPTY) {
      texture.destroy(true);
    }
  }
}
