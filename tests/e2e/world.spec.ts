import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
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
  await page.goto("/world");
  await waitForOffice(page);

  const frame = page.locator(".app");
  await expect(frame).toHaveCount(1);
  await expect(page.locator("aside.sidebar")).toHaveCount(1);
  await expect(page.locator("section.stage")).toHaveCount(1);
  await expect(page.getByRole("group", { name: "Spaces | World" })).toBeVisible();
  await expect(page.getByRole("button", { name: "World", exact: true })).toHaveAttribute(
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

  const frame = page.locator(".app");
  await frame.evaluate((element) => element.setAttribute("data-lifecycle-frame", "stable"));
  for (let index = 0; index < 10; index += 1) {
    await page.getByRole("button", { name: "Spaces", exact: true }).click();
    await expect(page.locator("canvas[data-office-canvas='true']")).toHaveCount(0);
    await expect
      .poll(() => page.evaluate(() => window.__HERDR_WORLD_RENDERER__?.activeApplications ?? 0))
      .toBe(0);
    await page.getByRole("button", { name: "World", exact: true }).click();
    await waitForOffice(page);
    await expect(frame).toHaveAttribute("data-lifecycle-frame", "stable");
  }

  expect(coreSocketUrls(sockets)).toHaveLength(initialCoreSockets);
  const terminalBeforeWorldIdle = terminalSocketUrls(sockets).length;
  await page.waitForTimeout(350);
  expect(terminalSocketUrls(sockets)).toHaveLength(terminalBeforeWorldIdle);
  const currentLog = await fixtureLog(request);
  expect(currentLog.snapshotRequests - initialLog.snapshotRequests).toBeLessThanOrEqual(3);
  expect(currentLog.capabilityRequests).toBe(initialLog.capabilityRequests);

  const diagnostics = await page.evaluate(() => window.__HERDR_WORLD_RENDERER__);
  expect(diagnostics).toMatchObject({
    mounts: 11,
    destroys: 10,
    activeApplications: 1,
    activeTickers: 1,
    activeObservers: 1,
    activeListeners: 2,
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
  await expect(page.getByRole("group", { name: "Spaces | World" })).toBeVisible();
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
  await expect(page.getByRole("button", { name: "Back to World roster" })).toBeVisible();
  await expect
    .poll(() =>
      page.locator(".world-stage-scroll").evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      })),
    )
    .toMatchObject({ clientWidth: 375, scrollWidth: 1000 });

  await page.getByRole("button", { name: "Back to World roster" }).click();
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
  await expect(page.getByRole("button", { name: "Back to World roster" })).toBeVisible();
});

test("shows perceptible working animation when motion is allowed", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/world");
  await waitForOffice(page);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await waitForLiveOffice(page);
  const start = await page.evaluate(() => window.__HERDR_WORLD_RENDERER__?.frames ?? 0);
  await page.waitForTimeout(500);
  const diagnostics = await page.evaluate(() => window.__HERDR_WORLD_RENDERER__);
  expect(diagnostics?.reducedMotion).toBe(false);
  expect(diagnostics?.animation).toEqual({ characters: 1, monitors: 1, statuses: 1 });
  expect((diagnostics?.frames ?? 0) - start).toBeGreaterThan(8);
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

  await page.locator(".world-agent-row").filter({ hasText: "Codex B" }).click();
  const handoff = page.getByRole("button", { name: "Open agent in Spaces" });
  await expect(handoff).toBeEnabled();
  await handoff.click();

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
