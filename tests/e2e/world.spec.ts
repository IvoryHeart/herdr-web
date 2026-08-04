import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import {
  deskAnchor,
  receptionAgentAnchor,
  resolveOfficeLayout,
  resolveReceptionLayout,
  standingAnchor,
} from "../../web/src/world/officeGeometry";
import { hostStore } from "./hostStore";

test.describe.configure({ timeout: 90_000 });

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:4173/__fixture/reset");
  await page.addInitScript((store) => {
    localStorage.setItem("herdrWeb.bridgeBackends.v2", JSON.stringify(store));
  }, hostStore());
});

test("uses one persistent frame for direct World entry, history, and view switching", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/world");
  await waitForOffice(page);

  const frame = page.locator(".app");
  await expect(frame).toHaveCount(1);
  await expect(page.locator("aside.sidebar")).toHaveCount(1);
  await expect(page.locator("section.stage")).toHaveCount(1);
  await expect(page.getByRole("group", { name: "Spaces | Office" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Office", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("group", { name: "Sidebar view" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Pixel Office", exact: true })
      .getByText("Pixel Office", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("group", { name: "Sidebar scope" })).toBeVisible();

  await expect(page.locator(".agent-row").filter({ hasText: "Codex A" })).toBeVisible();
  await expect(page.locator(".agent-row").filter({ hasText: "Codex B" })).toHaveCount(0);
  await page.getByRole("group", { name: "Host" }).getByRole("button", { name: "All", exact: true }).click();
  await expect(
    page.getByRole("group", { name: "Host" }).getByRole("button", { name: "All", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await waitForLiveOffice(page);
  await page.getByRole("button", { name: "Remote B, compatible" }).click();
  await expect(page.locator(".agent-row").filter({ hasText: "Codex B" })).toBeVisible();
  await page.getByRole("group", { name: "Host" }).getByRole("button", { name: "All", exact: true }).click();

  await frame.evaluate((element) => element.setAttribute("data-checkpoint-frame", "stable"));
  await page.getByRole("group", { name: "Host" }).getByRole("button", { name: "All", exact: true }).click();
  await page.getByRole("button", { name: "Spaces", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("group", { name: "Sidebar view" })).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Host" })
      .getByRole("button", { name: "All", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(frame).toHaveAttribute("data-checkpoint-frame", "stable");

  await page.goBack();
  await expect(page).toHaveURL(/\/world$/);
  await waitForOffice(page);
  await expect(frame).toHaveAttribute("data-checkpoint-frame", "stable");
  await expect(page.getByRole("group", { name: "Sidebar view" })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("group", { name: "Sidebar view" })).toBeVisible();

  await page.goto("/world");
  await waitForOffice(page);
  await page.getByRole("group", { name: "Host" }).getByRole("button", { name: "All", exact: true }).click();
  await waitForLiveOffice(page);
  await page.reload();
  await waitForOffice(page);
  await expect(page.locator(".app")).toHaveCount(1);
  await expect(page.locator("canvas[data-office-canvas='true']")).toHaveCount(1);
});

test("disposes the renderer across ten switches without reconnecting core observation", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  const sockets: string[] = [];
  const requests: string[] = [];
  page.on("websocket", (socket) => sockets.push(socket.url()));
  page.on("request", (networkRequest) => requests.push(networkRequest.url()));

  await page.goto("/world");
  await waitForOffice(page);
  await page.getByRole("group", { name: "Host" }).getByRole("button", { name: "All", exact: true }).click();
  await waitForLiveOffice(page);
  await expect.poll(() => coreSocketUrls(sockets).length).toBeGreaterThanOrEqual(6);
  expect(terminalSocketUrls(sockets)).toEqual([]);
  const initialCoreSockets = coreSocketUrls(sockets).length;
  const initialLog = await fixtureLog(request);
  const lifecycleStartedAt = Date.now();

  const frame = page.locator(".app");
  await frame.evaluate((element) => element.setAttribute("data-lifecycle-frame", "stable"));
  for (let index = 0; index < 10; index += 1) {
    await page.getByRole("button", { name: "Spaces", exact: true }).click();
    await expect(page.locator("canvas[data-office-canvas='true']")).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => window.__HERDR_WORLD_RENDERER__?.activeApplications ?? 0))
      .toBe(0);
    await page.getByRole("button", { name: "Office", exact: true }).click();
    await waitForOffice(page);
    await expect(frame).toHaveAttribute("data-lifecycle-frame", "stable");
  }

  expect(coreSocketUrls(sockets)).toHaveLength(initialCoreSockets);
  const terminalBeforeWorldIdle = terminalSocketUrls(sockets).length;
  await page.waitForTimeout(350);
  expect(terminalSocketUrls(sockets)).toHaveLength(terminalBeforeWorldIdle);
  const currentLog = await fixtureLog(request);
  const periodicRefreshBound =
    Math.ceil((Date.now() - lifecycleStartedAt) / CORE_SNAPSHOT_REFRESH_INTERVAL_MS) + 1;
  expect(currentLog.snapshotRequests - initialLog.snapshotRequests)
    .toBeLessThanOrEqual(periodicRefreshBound);
  expect(currentLog.capabilityRequests).toBe(initialLog.capabilityRequests);

  const diagnostics = await page.evaluate(() => window.__HERDR_WORLD_RENDERER__);
  expect(diagnostics).toMatchObject({
    mounts: 11,
    destroys: 10,
    activeApplications: 1,
    activeTickers: 1,
    activeObservers: 1,
    activeListeners: 3,
    canvases: 1,
    ready: true,
  });

  await page.getByRole("button", { name: "Spaces", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => window.__HERDR_WORLD_RENDERER__?.activeApplications ?? -1))
    .toBe(0);
  expect(await page.evaluate(() => window.__HERDR_WORLD_RENDERER__)).toMatchObject({
    mounts: 11,
    destroys: 11,
    activeApplications: 0,
    activeTickers: 0,
    activeObservers: 0,
    activeListeners: 0,
    canvases: 0,
    ready: false,
  });

  expect(
    requests.filter((url) =>
      /\/api\/(world|economy)|visualizations|ai-observability|unpkg|jsdelivr|cdnjs/i.test(url),
    ),
  ).toEqual([]);
});

test("keeps the semantic view usable with reduced motion and renderer failure", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/world");
  await waitForOffice(page);
  await page.getByRole("group", { name: "Host" }).getByRole("button", { name: "All", exact: true }).click();
  await waitForLiveOffice(page);
  expect(await page.evaluate(() => window.__HERDR_WORLD_RENDERER__)).toMatchObject({
    reducedMotion: true,
    animation: { characters: 1, monitors: 1, statuses: 1 },
  });
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(
    accessibility.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await expect.poll(() => page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(2);
  await expect(page.getByRole("group", { name: "Spaces | Office" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Sidebar view" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Sidebar scope" })).toBeVisible();
  const zoomAccessibility = await new AxeBuilder({ page }).analyze();
  expect(
    zoomAccessibility.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
  await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });

  await page.addInitScript(() => {
    window.__HERDR_WORLD_FORCE_RENDERER_FAILURE__ = true;
  });
  await page.reload();
  await expect(page.getByText("Visual scene unavailable", { exact: true })).toBeVisible();
  await waitForLiveOffice(page);
  await expect(page.getByRole("group", { name: "Sidebar view" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Host" })).toBeVisible();
  await expect(page.getByRole("button", { name: "localhost, compatible" })).toBeEnabled();
  await expect(page.locator("canvas[data-office-canvas='true']")).toHaveCount(0);
});

test("uses stage-first compact navigation and horizontal office scrolling at 375px", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/world");
  await waitForOffice(page);
  await expect(page.getByRole("button", { name: "Back to Herdr sidebar" })).toBeVisible();
  await expect
    .poll(() =>
      page.locator(".world-stage-scroll").evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      })),
    )
    .toMatchObject({ clientWidth: 375, scrollWidth: 1000 });

  await page.getByRole("button", { name: "Back to Herdr sidebar" }).click();
  await page.getByRole("group", { name: "Host" }).getByRole("button", { name: "All", exact: true }).click();
  await expect(page.getByRole("button", { name: "Office", exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Sidebar view" })).toBeVisible();
  await waitForLiveOffice(page);
  const room = page.locator(".space-row").first();
  await room.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(room).toBeFocused();
  expect(await room.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  await page.getByRole("button", { name: "Office", exact: true }).click();
  await expect(page.getByRole("button", { name: "Back to Herdr sidebar" })).toBeVisible();
});

test("opens one stable live conversation bubble for the selected Office agent", async ({
  page,
}) => {
  await page.goto("/world");
  await waitForOffice(page);
  await page.getByRole("group", { name: "Host" }).getByRole("button", { name: "All", exact: true }).click();
  await waitForLiveOffice(page);

  const bubble = page.locator("[data-world-conversation='open']");
  const firstAgent = page.locator(".agent-row").filter({ hasText: "Codex A" });
  await firstAgent.click();
  await expect(bubble).toBeVisible();
  await expect(bubble).toHaveAttribute("data-agent-key", /.+/);
  await expect(bubble.getByRole("button", { name: "Close agent conversation" })).toBeVisible();
  await expect(bubble.locator(".terminal-stage")).toBeVisible();
  const connector = page.locator(".world-conversation-connector");
  await expect(connector).toBeVisible();
  await expect(connector.locator("path[data-anchor='workbench']")).toHaveCount(1);
  await expect(connector.locator("path[data-anchor='agent']")).toHaveCount(1);

  const slot = page.locator(".world-conversation-slot");
  const before = await slot.boundingBox();
  expect(before).not.toBeNull();
  const stageBox = await page.locator(".world-stage-shell").boundingBox();
  expect(stageBox).not.toBeNull();
  expect(before?.width ?? 0).toBeGreaterThanOrEqual(560);
  expect(before?.width ?? 0).toBeGreaterThan(before?.height ?? 0);
  expect(Math.abs(
    (before?.x ?? 0) + (before?.width ?? 0) / 2 -
      ((stageBox?.x ?? 0) + (stageBox?.width ?? 0) / 2),
  )).toBeLessThanOrEqual(1);
  expect(Math.abs(
    (before?.y ?? 0) + (before?.height ?? 0) / 2 -
      ((stageBox?.y ?? 0) + (stageBox?.height ?? 0) / 2),
  )).toBeLessThanOrEqual(1);
  await page.locator(".world-stage-scroll").evaluate((element) =>
    element.scrollTo({ top: element.scrollHeight, behavior: "auto" }),
  );
  const after = await slot.boundingBox();
  expect(after).not.toBeNull();
  expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeLessThanOrEqual(1);
  expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThanOrEqual(1);

  const secondAgent = page.locator(".agent-row").filter({ hasText: "Codex B" });
  await secondAgent.click();
  await expect(bubble).toHaveAttribute("data-agent-key", /.+/);
  await expect(bubble).toContainText("Codex B");
  await expect(page.locator("[data-world-conversation='open']")).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(bubble).toHaveCount(0);
});

test("opens the conversation target in the full Spaces terminal", async ({ page }) => {
  await page.goto("/world");
  await waitForOffice(page);
  await page.locator(".agent-row").filter({ hasText: "Codex A" }).click();

  const bubble = page.locator("[data-world-conversation='open']");
  await expect(bubble).toBeVisible();
  await bubble.getByRole("button", { name: "Open full terminal in Spaces" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".stage-title")).toHaveText("Codex A");
  await expect(page.locator("[data-world-conversation='open']")).toHaveCount(0);
  await expect(page.locator(".terminal-stage")).toBeVisible();
});

test("opens the attached terminal when an occupied desk is selected", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:4173/__fixture/state", {
    data: { hostId: "host-a", snapshotVariant: "large" },
  });
  await page.goto("/world");
  await waitForOffice(page);
  await expect(page.locator(".agent-row").filter({ hasText: "Agent 01" })).toBeVisible();

  const officeWidth = await page.evaluate(
    () => window.__HERDR_WORLD_RENDERER__?.layout?.officeWidth ?? 1_000,
  );
  const layout = resolveOfficeLayout(officeWidth, [
    { deskCount: 8, standingCount: 2 },
    ...Array.from({ length: 127 }, () => ({ deskCount: 1, standingCount: 0 })),
  ]);
  const desk = deskAnchor(layout.rooms[0], 0);
  await page.locator("canvas[data-office-canvas='true']").click({
    position: { x: desk.x, y: desk.deskY + 12 },
  });

  const bubble = page.locator("[data-world-conversation='open']");
  await expect(bubble).toBeVisible();
  await expect(bubble).toContainText("Agent 01");
  await expect(bubble.locator(".terminal-overlay")).toHaveCount(0);
});

test("keeps a desk terminal open when its idle agent moves onto the work floor", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:4173/__fixture/state", {
    data: { hostId: "host-a", snapshotVariant: "idle-desk" },
  });
  await page.goto("/world");
  await waitForOffice(page);

  const officeWidth = await page.evaluate(
    () => window.__HERDR_WORLD_RENDERER__?.layout?.officeWidth ?? 1_000,
  );
  const layout = resolveOfficeLayout(officeWidth, [
    { deskCount: 8, standingCount: 2 },
    ...Array.from({ length: 127 }, () => ({ deskCount: 1, standingCount: 0 })),
  ]);
  const desk = deskAnchor(layout.rooms[0], 7);
  await page.locator("canvas[data-office-canvas='true']").click({
    position: { x: desk.x, y: desk.deskY + 12 },
  });

  const bubble = page.locator("[data-world-conversation='open']");
  await expect(bubble).toBeVisible();
  await expect(bubble).toContainText("Agent 09");

  const eventResponse = await request.post("http://127.0.0.1:4173/__fixture/ws-event", {
    data: {
      hostId: "host-a",
      path: "/ws/activity",
      event: {
        type: "pane.agent_status_changed",
        pane_id: "large-pane-8",
        workspace_id: "workspace-1",
        agent_status: "working",
        agent: "codex",
        title: null,
        display_agent: "Agent 09",
        state_labels: { working: "Running" },
      },
    },
  });
  expect((await eventResponse.json()).sent).toBeGreaterThan(0);

  await expect(bubble).toBeVisible();
  await expect(page.locator(".agent-row").filter({ hasText: "Agent 09" }).first()).toContainText("Running");
});

test("shows perceptible working animation when motion is allowed", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/world");
  await waitForOffice(page);
  await page.getByRole("group", { name: "Host" }).getByRole("button", { name: "All", exact: true }).click();
  await waitForLiveOffice(page);
  const start = await page.evaluate(() => window.__HERDR_WORLD_RENDERER__?.frames ?? 0);
  await page.waitForTimeout(1_000);
  const diagnostics = await page.evaluate(() => window.__HERDR_WORLD_RENDERER__);
  expect(diagnostics?.reducedMotion).toBe(false);
  expect(diagnostics?.animation).toEqual({ characters: 1, monitors: 1, statuses: 1 });
  expect((diagnostics?.frames ?? 0) - start).toBeGreaterThan(2);
});

test("keeps single-click and empty-desk gestures read-only, then opens a canvas agent on double-click", async ({
  page,
  request,
}) => {
  const sockets: string[] = [];
  page.on("websocket", (socket) => sockets.push(socket.url()));
  await page.goto("/world");
  await waitForOffice(page);
  await expect(page.locator(".agent-row").filter({ hasText: "Codex A" })).toBeVisible();
  await expect(
    page.getByText("Double-click a room or agent to open it in Spaces", {
      exact: true,
    }),
  ).toBeVisible();

  const firstRoom = page.locator(".space-row").first();
  await firstRoom.click();
  await page.evaluate(() => new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  }));
  expect(await firstRoom.getAttribute("data-active")).toBe("true");
  expect(terminalSocketUrls(sockets)).toEqual([]);

  const officeWidth = await page.evaluate(
    () => window.__HERDR_WORLD_RENDERER__?.layout?.officeWidth ?? 1_000,
  );
  const layout = resolveOfficeLayout(officeWidth, [{ deskCount: 1, standingCount: 0 }]);
  const agent = deskAnchor(layout.rooms[0], 0);
  const canvas = page.locator("canvas[data-office-canvas='true']");
  const position = { x: agent.x, y: agent.characterFeetY - 34 };

  await canvas.dblclick({ position });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".stage-title")).toHaveText("Codex A");
  await expect
    .poll(() => terminalSocketUrls(sockets).filter((url) => url.startsWith("ws://127.0.0.1:4173")))
    .toHaveLength(1);
  await expect
    .poll(async () => {
      const logs = await (await request.get("http://127.0.0.1:4173/__fixture/requests")).json();
      return logs["host-a"].connections;
    })
    .toBe(1);
});

test("uses the same double-click shortcut for an Agent Bar sprite and roster row", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:4173/__fixture/state", {
    data: { hostId: "host-a", snapshotVariant: "large" },
  });
  await page.goto("/world");
  await waitForOffice(page);
  const barAgent = page.locator(".agent-row").filter({ hasText: "Agent 14" });
  await expect(barAgent).toContainText("Ready for review");

  await barAgent.dblclick();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".stage-title")).toHaveText("Agent 14");

  await page.getByRole("button", { name: "Office", exact: true }).click();
  await waitForOffice(page);
  await page.locator(".agent-row").filter({ hasText: "Agent 13" }).click();
  await page.getByRole("button", { name: "Close agent conversation" }).click();
  await expect(page.locator(".world-stage-notice")).toContainText("Double-click a room or agent");
  const stage = page.locator(".world-stage-scroll");
  await stage.evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: "auto" }));
  await expect.poll(() => stage.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const officeWidth = await page.evaluate(
    () => window.__HERDR_WORLD_RENDERER__?.layout?.officeWidth ?? 1_000,
  );
  const layout = resolveOfficeLayout(officeWidth, [
    { deskCount: 8, standingCount: 2 },
    ...Array.from({ length: 127 }, () => ({ deskCount: 1, standingCount: 0 })),
  ]);
  const scrollTop = await stage.evaluate((element) => element.scrollTop);
  const barX = Math.floor(officeWidth / 2) + 4 + 152;
  const barWidth = officeWidth - 20 - barX;
  const stationSpan = barWidth / 5;
  const position = {
    x: barX + stationSpan * 2.5,
    y: layout.barBandY + 136 - scrollTop,
  };

  await page.locator("canvas[data-office-canvas='true']").dblclick({ position });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".stage-title")).toHaveText("Agent 14");
});

test("opens the same standing room agent from its semantic row and canvas sprite", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:4173/__fixture/state", {
    data: { hostId: "host-a", snapshotVariant: "large" },
  });
  await page.goto("/world");
  await waitForOffice(page);
  const standingAgent = page.locator(".agent-row").filter({ hasText: "Agent 10" });
  await expect(standingAgent).toContainText("Running");

  await standingAgent.dblclick();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".stage-title")).toHaveText("Agent 10");

  await page.getByRole("button", { name: "Office", exact: true }).click();
  await waitForOffice(page);
  await page.locator(".agent-row").filter({ hasText: "Agent 02" }).click();
  await page.getByRole("button", { name: "Close agent conversation" }).click();
  await expect(page.locator(".world-stage-notice")).toContainText("Double-click a room or agent");
  const officeWidth = await page.evaluate(
    () => window.__HERDR_WORLD_RENDERER__?.layout?.officeWidth ?? 1_000,
  );
  const layout = resolveOfficeLayout(officeWidth, [
    { deskCount: 8, standingCount: 2 },
    ...Array.from({ length: 127 }, () => ({ deskCount: 1, standingCount: 0 })),
  ]);
  const anchor = standingAnchor(layout.rooms[0], 1);
  const stage = page.locator(".world-stage-scroll");
  const scrollTop = layout.roomStartY - 40;
  await stage.evaluate((element, top) => element.scrollTo({ top, behavior: "auto" }), scrollTop);
  await expect.poll(() => stage.evaluate((element) => element.scrollTop)).toBe(scrollTop);
  const canvas = page.locator("canvas[data-office-canvas='true']");

  await canvas.dblclick({
    position: {
      x: anchor.x,
      y: anchor.characterFeetY - scrollTop - 34,
    },
  });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".stage-title")).toHaveText("Agent 10");
});

test("single-clicks then double-clicks the exact colliding host room", async ({
  page,
  request,
}) => {
  const sockets: string[] = [];
  page.on("websocket", (socket) => sockets.push(socket.url()));
  const collisionStore = hostStore();
  collisionStore.enabledBridgeIds = ["same-origin", "host-b"];
  collisionStore.backends = collisionStore.backends.map((backend) =>
    backend.id === "host-b" ? { ...backend, name: "localhost" } : backend,
  );
  await page.addInitScript((store) => {
    localStorage.setItem("herdrWeb.bridgeBackends.v2", JSON.stringify(store));
  }, collisionStore);
  await page.goto("/world");
  await waitForOffice(page);
  await page.getByRole("group", { name: "Host" }).getByRole("button", { name: "All", exact: true }).click();
  await waitForLiveOffice(page);
  const rooms = page.locator(".space-row").filter({ hasText: "main" });
  await expect(rooms).toHaveCount(2);
  const hostARoom = rooms.nth(0);
  await page.locator(".app").evaluate((element) =>
    element.setAttribute("data-room-handoff-frame", "stable"));

  await hostARoom.click();
  await expect(page).toHaveURL(/\/world$/);
  await expect(hostARoom).toHaveAttribute("data-active", "true");
  expect(terminalSocketUrls(sockets)).toEqual([]);

  const officeWidth = await page.evaluate(
    () => window.__HERDR_WORLD_RENDERER__?.layout?.officeWidth ?? 1_000,
  );
  const layout = resolveOfficeLayout(officeWidth, [
    { deskCount: 1, standingCount: 0 },
    { deskCount: 1, standingCount: 0 },
  ]);
  const hostBRect = layout.rooms[1];
  await page.locator("canvas[data-office-canvas='true']").dblclick({
    position: {
      x: hostBRect.x + hostBRect.width - 70,
      y: hostBRect.y + 54,
    },
  });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".app")).toHaveAttribute("data-room-handoff-frame", "stable");
  await expect(page.locator(".stage-title")).toHaveText("Codex B");
  await expect
    .poll(() => terminalSocketUrls(sockets).filter((url) => url.startsWith("ws://127.0.0.1:4174")))
    .toHaveLength(1);
  await expect
    .poll(async () => {
      const logs = await (await request.get("http://127.0.0.1:4173/__fixture/requests")).json();
      return { hostA: logs["host-a"].connections, hostB: logs["host-b"].connections };
    })
    .toEqual({ hostA: 0, hostB: 1 });

  await page.getByRole("button", { name: "Office", exact: true }).click();
  await waitForOffice(page);
  await page.locator(".space-row").first().click();
  await expect(page.locator(".space-row").first()).toHaveAttribute("data-active", "true");
  await page.locator("canvas[data-office-canvas='true']").dblclick({
    position: {
      x: hostBRect.x + hostBRect.width - 70,
      y: hostBRect.y + 54,
    },
  });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".stage-title")).toHaveText("Codex B");
});

test("revalidates a colliding live agent and opens its exact host in Spaces", async ({
  page,
  request,
}) => {
  const sockets: string[] = [];
  page.on("websocket", (socket) => sockets.push(socket.url()));
  const collisionStore = hostStore();
  collisionStore.enabledBridgeIds = ["same-origin", "host-b"];
  collisionStore.backends = collisionStore.backends.map((backend) =>
    backend.id === "host-b" ? { ...backend, name: "localhost" } : backend,
  );
  await page.addInitScript((store) => {
    localStorage.setItem("herdrWeb.bridgeBackends.v2", JSON.stringify(store));
  }, collisionStore);
  await page.goto("/world");
  await waitForOffice(page);
  await page.getByRole("group", { name: "Host" }).getByRole("button", { name: "All", exact: true }).click();
  await waitForLiveOffice(page);
  await expect(page.getByRole("button", { name: "localhost, compatible" })).toHaveCount(2);

  await page.locator(".agent-row").filter({ hasText: "Codex B" }).dblclick();

  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("group", { name: "Host" }).getByRole("button", { name: "All", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".stage-title")).toHaveText("Codex B");
  await expect
    .poll(() => terminalSocketUrls(sockets).filter((url) => url.startsWith("ws://127.0.0.1:4174")))
    .toHaveLength(1);
  await expect
    .poll(async () => {
      const logs = await (await request.get("http://127.0.0.1:4173/__fixture/requests")).json();
      return {
        hostA: logs["host-a"].connections,
        hostB: logs["host-b"].connections,
      };
    })
    .toEqual({ hostA: 0, hostB: 1 });

  await page.getByRole("button", { name: "Office", exact: true }).click();
  await waitForOffice(page);
  await page.locator(".agent-row").filter({ hasText: "Codex A" }).click();
  await page.getByRole("button", { name: "Close agent conversation" }).click();
  await expect(page.locator(".world-stage-notice")).toContainText("Double-click a room or agent");
  const officeWidth = await page.evaluate(
    () => window.__HERDR_WORLD_RENDERER__?.layout?.officeWidth ?? 1_000,
  );
  const hostBReception = resolveReceptionLayout(officeWidth, 2)[1];
  const waitingAgent = receptionAgentAnchor(hostBReception, 0);
  await page.locator("canvas[data-office-canvas='true']").dblclick({
    position: {
      x: waitingAgent.x,
      y: waitingAgent.characterFeetY - 34,
    },
  });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".stage-title")).toHaveText("Codex B");
});

test("isolates a stale host, retains its last-known room, and suppresses handoff", async ({
  page,
  request,
}) => {
  await page.goto("/world");
  await waitForOffice(page);
  await page.getByRole("group", { name: "Host" }).getByRole("button", { name: "All", exact: true }).click();
  await waitForLiveOffice(page);
  await page.getByRole("button", { name: "Remote B, compatible" }).click();

  await request.post("http://127.0.0.1:4173/__fixture/state", {
    data: { hostId: "host-b", snapshotMode: "offline" },
  });
  await page.getByRole("button", { name: "Refresh" }).click();

  await expect(page.getByRole("button", { name: "Remote B, offline" })).toBeVisible();
  await page.getByRole("group", { name: "Host" }).getByRole("button", { name: "All", exact: true }).click();
  const staleAgent = page.locator(".agent-row").filter({ hasText: "Codex B" });
  await expect(staleAgent).toBeVisible();
  await staleAgent.click();
  await staleAgent.dblclick();
  await expect(page).toHaveURL(/\/world$/);
  await expect(page.locator(".world-notice-handoff")).toContainText("not live");
});

async function waitForOffice(page: import("@playwright/test").Page) {
  await expect
    .poll(() => page.evaluate(() => window.__HERDR_WORLD_RENDERER__?.ready ?? false))
    .toBe(true);
  await expect(page.locator("canvas[data-office-canvas='true']")).toHaveCount(1);
}

async function waitForLiveOffice(page: import("@playwright/test").Page) {
  await expect(page.locator(".agent-row").filter({ hasText: "Codex A" })).toBeVisible();
  await expect(page.locator(".agent-row").filter({ hasText: "Codex B" })).toBeVisible();
}

function coreSocketUrls(urls: readonly string[]) {
  return urls.filter((url) => /\/ws\/(events|activity|ui-events)(?:\?|$)/.test(url));
}

function terminalSocketUrls(urls: readonly string[]) {
  return urls.filter((url) => /\/ws\/terminal(?:\?|$)/.test(url));
}

async function fixtureLog(request: import("@playwright/test").APIRequestContext) {
  const response = await request.get("http://127.0.0.1:4173/__fixture/requests");
  const all = (await response.json()) as Record<
    string,
    { snapshotRequests: number; capabilityRequests: number }
  >;
  return all["host-a"];
}

const CORE_SNAPSHOT_REFRESH_INTERVAL_MS = 10_000;
