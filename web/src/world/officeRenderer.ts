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
import type { OfficeAgent, OfficeHost, OfficeRoom, HerdrOfficeProjection } from "./herdrOfficeProjection";
import { deskAnchor, OFFICE_GEOMETRY, resolveOfficeLayout } from "./officeGeometry";
import type { OfficeLayout, OfficeRoomRect } from "./officeGeometry";

const CHARACTER_URLS = Array.from(
  { length: 12 },
  (_, index) => `/world/characters/${index + 1}-D-1.png`,
);

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
  done: { label: "AT REVIEW", color: 0xf0c878 },
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
    reviewBandHeight: number;
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
    CHARACTER_URLS.map((url) =>
      loadTexture(url).catch(() => Texture.EMPTY),
    ),
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

  const renderScene = (layout: OfficeLayout, force = false) => {
    if (disposed) {
      return;
    }
    const scrollTop = scrollElement?.scrollTop ?? 0;
    const viewportHeight = Math.min(
      layout.totalHeight,
      Math.max(1, scrollElement?.clientHeight ?? layout.totalHeight),
    );
    const overscan =
      (OFFICE_GEOMETRY.roomHeight + OFFICE_GEOMETRY.roomGap) * VIRTUAL_ROOM_ROW_OVERSCAN;
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
    drawCeoBand(app.stage, layout, currentProjection, currentSelectedKey, textures, animated, select);
    drawHallways(app.stage, layout);
    visibleRooms.forEach((rect) => {
      const room = currentProjection.rooms[rect.index];
      if (room) {
        drawRoom(app.stage, room, rect, currentProjection, currentSelectedKey, textures, animated, select);
      }
    });
    drawReviewBand(
      app.stage,
      layout,
      currentProjection,
      currentSelectedKey,
      textures,
      animated,
      select,
    );
    diagnostics.ready = true;
    diagnostics.reducedMotion = reducedMotion;
    diagnostics.animation = {
      characters: animated.filter((item) => item.kind === "character").length,
      monitors: animated.filter((item) => item.kind === "monitor").length,
      statuses: animated.filter((item) => item.kind === "status").length,
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
    const width = Math.max(OFFICE_GEOMETRY.minOfficeWidth, Math.floor(requestedWidth || 0));
    const layout = resolveOfficeLayout(width, currentProjection.rooms.length);
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
      reviewBandHeight: OFFICE_GEOMETRY.reviewBandHeight,
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
    app.ticker.remove(ticker);
    app.destroy(true, { children: true });
    destroyTextures(textures);
    diagnostics.activeApplications = Math.max(0, diagnostics.activeApplications - 1);
    diagnostics.activeTickers = Math.max(0, diagnostics.activeTickers - 1);
    diagnostics.activeObservers = Math.max(0, diagnostics.activeObservers - 1);
    diagnostics.activeListeners = Math.max(
      0,
      diagnostics.activeListeners - (scrollElement ? 2 : 1),
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
        diagnostics.activeListeners - (scrollElement ? 2 : 1),
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
      .rect(2, 2 + (layout.totalHeight - 4) * (band / 14), layout.officeWidth - 4, layout.totalHeight / 14 + 1)
      .fill({ color: blendColor(0x15152a, 0x090914, band / 13), alpha: 0.9 });
  }
  background
    .roundRect(2, 2, layout.officeWidth - 4, layout.totalHeight - 4, 5)
    .stroke({ width: 2, color: 0x2a2a48, alpha: 0.8 });
  stage.addChild(background);
}

function drawCeoBand(
  stage: Container,
  layout: OfficeLayout,
  projection: HerdrOfficeProjection,
  selectedKey: string | null,
  textures: readonly Texture[],
  animated: AnimatedItem[],
  onSelect: (key: string) => void,
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
  addSign(band, 12, 8, "CEO OFFICE", 0x76571c, 94);
  const subtitle = label("ONE HERDR CLIENT · ALL ADMITTED HOSTS", { size: 9, color: 0xd8bd7c });
  subtitle.position.set(118, 11);
  band.addChild(subtitle);

  drawChair(band, 74, 92, 0x8c6e35);
  const viewer = new Container();
  viewer.position.set(74, 102);
  const viewerTexture = textures[0] ?? Texture.EMPTY;
  if (viewerTexture !== Texture.EMPTY) {
    const viewerSprite = new Sprite(viewerTexture);
    viewerSprite.anchor.set(0.5, 1);
    viewerSprite.scale.set(
      OFFICE_GEOMETRY.characterHeight / Math.max(1, viewerTexture.height),
    );
    viewerSprite.roundPixels = true;
    viewer.addChild(viewerSprite);
  } else {
    const viewerFallback = label("◆", { size: 22, color: 0xf0c878, anchor: 0.5 });
    viewerFallback.position.y = -22;
    viewer.addChild(viewerFallback);
  }
  const crown = label("♛", { size: 14, color: 0xf0c878, anchor: 0.5 });
  crown.position.set(0, -76);
  viewer.addChild(crown);
  band.addChild(viewer);
  drawChairArms(band, 74, 92, 0x8c6e35);

  const ceoDesk = new Graphics();
  ceoDesk.roundRect(28, 80, 92, 44, 5).fill(0x493728);
  ceoDesk.roundRect(31, 83, 86, 38, 4).fill(0x705234);
  ceoDesk.roundRect(55, 88, 38, 20, 3).fill(0x182031);
  ceoDesk.roundRect(60, 93, 28, 11, 2).fill(0x356c9e);
  band.addChild(ceoDesk);
  const you = label("YOU", { size: 9, color: 0xf6e3b2, anchor: 0.5 });
  you.position.set(74, 135);
  band.addChild(you);

  const receptionHosts = projection.hosts
    .filter((host) => host.connectionState !== "disabled")
    .slice(0, 6);
  const tableWidth = 330;
  const tableX = Math.floor((layout.officeWidth - tableWidth) / 2);
  const tableY = 87;
  const table = new Graphics();
  table.roundRect(tableX, tableY, tableWidth, 38, 14).fill(0x2b2018);
  table.roundRect(tableX + 4, tableY + 4, tableWidth - 8, 30, 11).fill(0x513b29);
  table
    .roundRect(tableX, tableY, tableWidth, 38, 14)
    .stroke({ width: 1, color: 0xc39a55, alpha: 0.45 });
  band.addChild(table);
  const tableLabel = label("HOST RECEPTION · 6 SEATS", {
    size: 11,
    color: 0xe3c887,
    anchor: 0.5,
  });
  tableLabel.position.set(tableX + tableWidth / 2, tableY + 19);
  band.addChild(tableLabel);
  const seatXs = [tableX + 58, tableX + 165, tableX + 272];
  const seats = [
    ...seatXs.map((x) => ({ x, feetY: tableY + 1, badgeY: 35 })),
    ...seatXs.map((x) => ({ x, feetY: tableY + 92, badgeY: 145 })),
  ];
  receptionHosts.forEach((host, index) => {
    const seat = seats[index];
    const character = drawCharacter(
      band,
      textures[host.deterministicSkin.themeIndex % textures.length],
      seat.x,
      seat.feetY,
      false,
      false,
      animated,
      host.key,
      onSelect,
      selectedKey,
    );
    character.alpha = host.stale ? 0.55 : 0.92;
    const badge = label(`${host.deterministicSkin.badge} · ${host.displayLabel}`, {
      size: 9,
      color: hostColor(host),
      anchor: 0.5,
    });
    badge.position.set(seat.x, seat.badgeY);
    band.addChild(badge);
  });
  if (projection.coverage.omittedReceptionists > 0) {
    const overflow = label(`+${projection.coverage.omittedReceptionists} hosts in roster`, {
      size: 9,
      color: 0xd7c394,
      anchor: { x: 1, y: 0 },
    });
    overflow.position.set(layout.officeWidth - 18, 14);
    band.addChild(overflow);
  }
  stage.addChild(band);
}

function drawHallways(stage: Container, layout: OfficeLayout) {
  const hall = new Graphics();
  for (const y of [OFFICE_GEOMETRY.ceoBandHeight, layout.reviewBandY - OFFICE_GEOMETRY.hallwayHeight]) {
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
) {
  const host = projection.hosts.find((entry) => entry.key === room.hostKey);
  if (!host) {
    return;
  }
  const theme = THEMES[host.deterministicSkin.themeIndex % THEMES.length];
  const parent = new Container();
  const floor = new Graphics();
  drawTiledFloor(floor, rect.x, rect.y, rect.width, rect.height, theme.floorA, theme.floorB);
  floor.rect(rect.x, rect.y, rect.width, 34).fill({ color: theme.wall, alpha: 0.76 });
  floor
    .roundRect(rect.x, rect.y, rect.width, rect.height, 4)
    .stroke({
      width: selectedKey === room.key ? 4 : 2,
      color: selectedKey === room.key ? 0xffffff : theme.accent,
      alpha: selectedKey === room.key ? 0.92 : 0.78,
    });
  makeInteractive(floor, room.key, onSelect);
  parent.addChild(floor);
  addSign(
    parent,
    rect.x + rect.width / 2 - 126,
    rect.y - 5,
    `${room.displayLabel.toUpperCase()} · ${host.deterministicSkin.badge}`,
    theme.accent,
    252,
    room.key,
    onSelect,
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
  const rug = new Graphics();
  rug
    .roundRect(rect.x + 26, rect.y + 52, rect.width - 52, rect.height - 72, 7)
    .fill({ color: theme.accent, alpha: 0.08 });
  rug
    .roundRect(rect.x + 31, rect.y + 57, rect.width - 62, rect.height - 82, 5)
    .stroke({ width: 1, color: theme.accent, alpha: 0.18 });
  parent.addChild(rug);

  room.visibleAgents.forEach((agent, index) => {
    drawAgentStation(parent, room, agent, host, rect, index, theme.accent, selectedKey, textures, animated, onSelect);
  });
  if (room.overflowCount > 0) {
    const badge = new Graphics();
    badge
      .roundRect(rect.x + rect.width - 96, rect.y + rect.height - 29, 80, 18, 5)
      .fill({ color: 0x101722, alpha: 0.96 });
    badge
      .roundRect(rect.x + rect.width - 96, rect.y + rect.height - 29, 80, 18, 5)
      .stroke({ width: 1, color: theme.accent, alpha: 0.72 });
    parent.addChild(badge);
    const copy = label(`+${room.overflowCount} in roster`, { size: 9, color: 0xd7deea, anchor: 0.5 });
    copy.position.set(rect.x + rect.width - 56, rect.y + rect.height - 20);
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

function drawAgentStation(
  parent: Container,
  room: OfficeRoom,
  agent: OfficeAgent,
  host: OfficeHost,
  rect: OfficeRoomRect,
  index: number,
  accent: number,
  selectedKey: string | null,
  textures: readonly Texture[],
  animated: AnimatedItem[],
  onSelect: (key: string) => void,
) {
  const anchor = deskAnchor(rect, index);
  const name = label(agent.displayLabel, { size: 10, color: 0x202838, anchor: 0.5 });
  const nameWidth = Math.max(54, Math.min(anchor.stationSpan - 6, name.width + 14));
  const namePlate = new Graphics();
  namePlate
    .roundRect(anchor.x - nameWidth / 2, anchor.nameY, nameWidth, 16, 4)
    .fill({ color: 0xf0f2f5, alpha: 0.94 });
  if (selectedKey === agent.key) {
    namePlate
      .roundRect(anchor.x - nameWidth / 2 - 2, anchor.nameY - 2, nameWidth + 4, 20, 5)
      .stroke({ width: 2, color: 0xffffff, alpha: 0.96 });
  }
  makeInteractive(namePlate, agent.key, onSelect);
  parent.addChild(namePlate);
  name.position.set(anchor.x, anchor.nameY + 8);
  parent.addChild(name);

  const cue = agent.stale ? { label: "STALE", color: 0x79869a } : STATUS_CUES[agent.semanticStatus];
  const status = label(cue.label, { size: 8, color: 0x111722, anchor: 0.5 });
  const statusWidth = Math.max(48, status.width + 12);
  const statusPlate = new Graphics();
  statusPlate
    .roundRect(anchor.x - statusWidth / 2, anchor.nameY + 18, statusWidth, 12, 3)
    .fill({ color: cue.color, alpha: 0.96 });
  parent.addChild(statusPlate);
  status.position.set(anchor.x, anchor.nameY + 24);
  parent.addChild(status);
  if (agent.semanticStatus === "working" && !agent.stale) {
    animated.push({ kind: "status", node: statusPlate, baseAlpha: 1, phase: animated.length * 7 });
  }
  if (agent.semanticStatus === "blocked") {
    const attention = label("!", { size: 11, color: 0xffffff, anchor: 0.5 });
    const attentionBg = new Graphics();
    attentionBg.circle(anchor.x + nameWidth / 2 + 5, anchor.nameY + 7, 7).fill(0xd94e64);
    parent.addChild(attentionBg);
    attention.position.set(anchor.x + nameWidth / 2 + 5, anchor.nameY + 7);
    parent.addChild(attention);
  }

  const chairY = anchor.characterFeetY - OFFICE_GEOMETRY.characterHeight * 0.18;
  drawChair(parent, anchor.x, chairY, accent);
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
  );
  character.alpha = agent.stale ? 0.56 : agent.semanticStatus === "idle" ? 0.9 : 1;
  drawChairArms(parent, anchor.x, chairY, accent);
  const desk = drawDesk(
    parent,
    anchor.x - OFFICE_GEOMETRY.deskWidth / 2,
    anchor.deskY,
    accent,
    agent.semanticStatus === "working" && !agent.stale,
    animated,
  );
  makeInteractive(desk, agent.key, onSelect);
  const hostBadge = label(host.deterministicSkin.badge, {
    size: 8,
    color: blendColor(hostColor(host), 0xffffff, 0.42),
    anchor: 0.5,
  });
  hostBadge.position.set(anchor.x, anchor.deskY + OFFICE_GEOMETRY.deskHeight + 7);
  parent.addChild(hostBadge);
}

function drawReviewBand(
  stage: Container,
  layout: OfficeLayout,
  projection: HerdrOfficeProjection,
  selectedKey: string | null,
  textures: readonly Texture[],
  animated: AnimatedItem[],
  onSelect: (key: string) => void,
) {
  const x = 4;
  const y = layout.reviewBandY;
  const width = layout.officeWidth - 8;
  const room = new Container();
  const floor = new Graphics();
  drawTiledFloor(floor, x, y, width, OFFICE_GEOMETRY.reviewBandHeight, 0x17140f, 0x11100d);
  floor.rect(x, y, width, 34).fill({ color: 0x4a3b22, alpha: 0.72 });
  floor
    .roundRect(x, y, width, OFFICE_GEOMETRY.reviewBandHeight, 4)
    .stroke({ width: 2, color: 0xb59048, alpha: 0.72 });
  room.addChild(floor);
  addSign(room, x + width / 2 - 78, y - 5, "DONE TO REVIEW", 0xa17d37, 156);
  const copy = label("Completed agents wait here for your review", {
    size: 9,
    color: 0xd1c39f,
  });
  copy.position.set(x + 14, y + 20);
  room.addChild(copy);
  projection.reviewAgents.forEach((agent, index) => {
    const px = x + width * ((index + 1) / (projection.reviewAgents.length + 1));
    const py = y + 137;
    const host = projection.hosts.find((entry) => entry.key === agent.hostKey);
    const stale = agent.stale;
    const name = label(agent.displayLabel, { size: 10, color: 0x252a34, anchor: 0.5 });
    const plateWidth = Math.max(58, name.width + 14);
    const plate = new Graphics();
    plate
      .roundRect(px - plateWidth / 2, y + 38, plateWidth, 17, 4)
      .fill({ color: 0xf1f0eb, alpha: stale ? 0.58 : 0.9 });
    if (selectedKey === agent.key) {
      plate
        .roundRect(px - plateWidth / 2 - 2, y + 36, plateWidth + 4, 21, 5)
        .stroke({ width: 2, color: 0xffffff, alpha: 0.96 });
    }
    makeInteractive(plate, agent.key, onSelect);
    room.addChild(plate);
    name.position.set(px, y + 46);
    room.addChild(name);
    const state = label(stale ? "STALE · AT REVIEW" : "AT REVIEW", {
      size: 8,
      color: stale ? 0xffb0ba : 0xf0c878,
      anchor: 0.5,
    });
    state.position.set(px, y + 63);
    room.addChild(state);
    const character = drawCharacter(
      room,
      textures[agent.characterIndex] ?? Texture.EMPTY,
      px,
      py,
      false,
      stale,
      animated,
      agent.key,
      onSelect,
      selectedKey,
    );
    character.alpha = stale ? 0.56 : 1;
    if (host) {
      const badge = label(host.deterministicSkin.badge, {
        size: 8,
        color: hostColor(host),
        anchor: 0.5,
      });
      badge.position.set(px, py + 9);
      room.addChild(badge);
    }
  });
  if (projection.coverage.omittedReviewAgents > 0) {
    const overflow = label(`+${projection.coverage.omittedReviewAgents} more in roster`, {
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
) {
  const container = new Container();
  container.position.set(x, feetY);
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
  if (selectedKey === key) {
    const selected = new Graphics();
    selected
      .ellipse(0, -2, 25, 8)
      .stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
    container.addChildAt(selected, 0);
  }
  makeInteractive(container, key, onSelect);
  if (working && !stale) {
    animated.push({ kind: "character", node: container, baseY: feetY, phase: animated.length * 7 });
  }
  parent.addChild(container);
  return container;
}

function drawChair(parent: Container, x: number, y: number, accent: number) {
  const chair = new Graphics();
  chair.ellipse(x, y + 5, 18, 6).fill({ color: 0x000000, alpha: 0.2 });
  chair.ellipse(x, y, 15, 9).fill(blendColor(accent, 0x10131f, 0.24));
  chair.roundRect(x - 14, y - 14, 28, 8, 4).fill(blendColor(accent, 0x000000, 0.3));
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
    animated.push({
      kind: "monitor",
      node: glow,
      baseAlpha: 0.18,
      phase: animated.length * 7,
    });
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
      graphics
        .rect(x + offsetX, y + offsetY, OFFICE_GEOMETRY.tile, OFFICE_GEOMETRY.tile)
        .fill(((offsetX + offsetY) / OFFICE_GEOMETRY.tile) % 2 === 0 ? first : second);
    }
  }
}

function addSign(
  parent: Container,
  x: number,
  y: number,
  text: string,
  color: number,
  width: number,
  key?: string,
  onSelect?: (key: string) => void,
) {
  const background = new Graphics();
  background.roundRect(x, y, width, 19, 4).fill(color);
  background
    .roundRect(x, y, width, 19, 4)
    .stroke({ width: 1, color: blendColor(color, 0xffffff, 0.32), alpha: 0.72 });
  if (key && onSelect) {
    makeInteractive(background, key, onSelect);
  }
  parent.addChild(background);
  const copy = label(text, { size: 10, color: 0xffffff, anchor: 0.5 });
  copy.position.set(x + width / 2, y + 9.5);
  parent.addChild(copy);
}

function makeInteractive(node: Container | Graphics, key: string, onSelect: (key: string) => void) {
  node.eventMode = "static";
  node.cursor = "pointer";
  node.on("pointertap", () => onSelect(key));
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
    resolution: 2,
    style: new TextStyle({
      fontSize: options.size ?? 9,
      fill: options.color ?? 0xffffff,
      fontWeight: "600",
      fontFamily: "Geist Variable, Inter, ui-sans-serif, system-ui, sans-serif",
      dropShadow: { alpha: 0.3, distance: 1, color: 0x000000 },
    }),
  });
  if (typeof options.anchor === "number") {
    text.anchor.set(options.anchor);
  } else if (options.anchor) {
    text.anchor.set(options.anchor.x, options.anchor.y);
  }
  return text;
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
