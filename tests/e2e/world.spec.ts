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
  await expect(page.getByRole("heading", { name: "Roster" })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Pixel Office", exact: true })
      .getByText("Pixel Office", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("group", { name: "Sidebar view" })).toHaveCount(0);

  await expect(page.locator(".world-agent-row").filter({ hasText: "Codex A" })).toBeVisible();
  await expect(page.locator(".world-agent-row").filter({ hasText: "Codex B" })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Host" })).toBeDisabled();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Host" })).toBeEnabled();
  await waitForLiveOffice(page);
  await expect(page.getByText("Partial host coverage", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Host" }).selectOption("host-b");
  await expect(page.getByText("Herdr host profile", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Roster" })).toBeVisible();
  await page.getByRole("combobox", { name: "Host" }).selectOption("all");

  await frame.evaluate((element) => element.setAttribute("data-checkpoint-frame", "stable"));
  await page.getByRole("button", { name: "All", exact: true }).click();
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
  await expect(page.getByText("Herdr host profile", { exact: true })).toBeVisible();
  await expect(
    page.getByLabel("Inspector").getByText("Remote B · HOST 02", { exact: true }),
  ).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("group", { name: "Sidebar view" })).toBeVisible();

  await page.goto("/world");
  await waitForOffice(page);
  await page.getByRole("button", { name: "All", exact: true }).click();
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
  await page.getByRole("button", { name: "All", exact: true }).click();
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
  await page.getByRole("button", { name: "All", exact: true }).click();
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
  await expect(page.getByRole("heading", { name: "Roster" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Inspector" })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Roster" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Inspector" })).toBeVisible();
  await expect(page.getByRole("button", { name: /main, Same origin, live/ })).toBeEnabled();
  await expect(page.locator("canvas[data-office-canvas='true']")).toHaveCount(0);
});

test("uses stage-first compact navigation and horizontal office scrolling at 375px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/world");
  await waitForOffice(page);
  await expect(page.getByRole("button", { name: "Back to Office roster" })).toBeVisible();
  await expect
    .poll(() =>
      page.locator(".world-stage-scroll").evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      })),
    )
    .toMatchObject({ clientWidth: 375, scrollWidth: 1000 });

  await page.getByRole("button", { name: "Back to Office roster" }).click();
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.getByRole("button", { name: "View office" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Roster" })).toBeVisible();
  await waitForLiveOffice(page);
  const room = page.getByRole("button", { name: /main, Same origin, live/ });
  await room.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(room).toBeFocused();
  expect(await room.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  await page.getByRole("button", { name: "View office" }).click();
  await expect(page.getByRole("button", { name: "Back to Office roster" })).toBeVisible();
});

test("shows perceptible working animation when motion is allowed", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/world");
  await waitForOffice(page);
  await page.getByRole("button", { name: "All", exact: true }).click();
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
  await expect(page.locator(".world-agent-row").filter({ hasText: "Codex A" })).toBeVisible();
  await expect(
    page.getByText("Double-click a room or agent to open it in Spaces, or use Inspector", {
      exact: true,
    }),
  ).toBeVisible();

  const firstRoom = page.locator(".world-room-row").first();
  await firstRoom.click();
  await page.evaluate(() => new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  }));
  expect(await firstRoom.getAttribute("data-selected")).toBe("true");
  await expect(page.getByText("Herdr workspace room", { exact: true })).toBeVisible();
  await page.waitForTimeout(600);
  await page.locator(".world-desk-row").first().dblclick();
  await expect(page).toHaveURL(/\/world$/);
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
  const barAgent = page.locator(".world-agent-row").filter({ hasText: "Agent 14" });
  await expect(barAgent).toContainText("Done · Agent Bar");

  await barAgent.dblclick();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".stage-title")).toHaveText("Agent 14");

  await page.getByRole("button", { name: "Office", exact: true }).click();
  await waitForOffice(page);
  await page.locator(".world-agent-row").filter({ hasText: "Agent 13" }).click();
  await expect(page.locator(".world-inspector")).toContainText("Agent 13");
  const stage = page.locator(".world-stage-scroll");
  await stage.evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: "auto" }));
  await expect.poll(() => stage.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const canvas = page.locator("canvas[data-office-canvas='true']");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const barStationSpan = ((box?.width ?? 1_000) - 40) / 8;
  const position = {
    x: 20 + barStationSpan * 2.5,
    y: (box?.height ?? 640) - 203,
  };

  await canvas.dblclick({ position });
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
  const standingAgent = page.locator(".world-agent-row").filter({ hasText: "Agent 10" });
  await expect(standingAgent).toContainText("Working · standing in workspace");

  await standingAgent.dblclick();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".stage-title")).toHaveText("Agent 10");

  await page.getByRole("button", { name: "Office", exact: true }).click();
  await waitForOffice(page);
  await page.locator(".world-agent-row").filter({ hasText: "Agent 02" }).click();
  await expect(page.locator(".world-inspector")).toContainText("Agent 02");
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
    backend.id === "host-b" ? { ...backend, name: "Same origin" } : backend,
  );
  await page.addInitScript((store) => {
    localStorage.setItem("herdrWeb.bridgeBackends.v2", JSON.stringify(store));
  }, collisionStore);
  await page.goto("/world");
  await waitForOffice(page);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await waitForLiveOffice(page);
  const rooms = page.locator(".world-room-row").filter({ hasText: "main" });
  await expect(rooms).toHaveCount(2);
  const hostARoom = rooms.nth(0);
  const hostBRoom = rooms.nth(1);
  await page.locator(".app").evaluate((element) =>
    element.setAttribute("data-room-handoff-frame", "stable"));

  await hostARoom.click();
  await expect(page).toHaveURL(/\/world$/);
  await expect(page.locator(".world-inspector")).toContainText("Same origin · HOST 01");
  expect(terminalSocketUrls(sockets)).toEqual([]);

  await hostBRoom.dblclick();
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
  await page.locator(".world-room-row").first().click();
  await expect(page.locator(".world-inspector")).toContainText("Same origin · HOST 01");
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
    backend.id === "host-b" ? { ...backend, name: "Same origin" } : backend,
  );
  await page.addInitScript((store) => {
    localStorage.setItem("herdrWeb.bridgeBackends.v2", JSON.stringify(store));
  }, collisionStore);
  await page.goto("/world");
  await waitForOffice(page);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await waitForLiveOffice(page);
  await expect(page.getByRole("button", { name: "Same origin, compatible" })).toHaveCount(2);
  await expect(page.getByRole("combobox", { name: "Host" }).locator("option")).toContainText([
    "All hosts",
    "Same origin · HOST 01",
    "Same origin · HOST 02",
    "Protocol C · HOST 03",
    "Malformed D · HOST 04",
    "Offline E · HOST 05",
  ]);

  await page.locator(".world-agent-row").filter({ hasText: "Codex B" }).dblclick();

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
  await page.locator(".world-agent-row").filter({ hasText: "Codex A" }).click();
  await expect(page.locator(".world-inspector")).toContainText("Codex A");
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
  await page.getByRole("button", { name: "All", exact: true }).click();
  await waitForLiveOffice(page);
  await page.getByRole("button", { name: "Remote B, compatible" }).click();

  await request.post("http://127.0.0.1:4173/__fixture/state", {
    data: { hostId: "host-b", snapshotMode: "offline" },
  });
  await page.getByRole("button", { name: "Refresh" }).click();

  await expect(page.getByRole("button", { name: "Remote B, offline" })).toBeVisible();
  await page.getByRole("button", { name: "All", exact: true }).click();
  const staleAgent = page.locator(".world-agent-row").filter({ hasText: "Codex B" });
  await expect(staleAgent).toContainText("Stale");
  await staleAgent.click();
  await expect(page.getByRole("button", { name: "Open agent in Spaces" })).toBeDisabled();
  await staleAgent.dblclick();
  await expect(page).toHaveURL(/\/world$/);
  await expect(page.locator(".world-handoff-status")).toContainText("not live");
  await expect(page.locator(".world-agent-row").filter({ hasText: "Codex A" })).not.toContainText(
    "Stale",
  );
});

async function waitForOffice(page: import("@playwright/test").Page) {
  await expect
    .poll(() => page.evaluate(() => window.__HERDR_WORLD_RENDERER__?.ready ?? false))
    .toBe(true);
  await expect(page.locator("canvas[data-office-canvas='true']")).toHaveCount(1);
}

async function waitForLiveOffice(page: import("@playwright/test").Page) {
  await expect(page.locator(".world-agent-row").filter({ hasText: "Codex A" })).toBeVisible();
  await expect(page.locator(".world-agent-row").filter({ hasText: "Codex B" })).toBeVisible();
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
