import { expect, test } from "@playwright/test";
import { hostStore } from "./hostStore";

function hostButton(page: import("@playwright/test").Page, name: string) {
  return page.getByRole("group", { name: "Host" }).getByRole("button", { name, exact: true });
}

test.beforeEach(async ({ page, request }) => {
  await request.post("http://127.0.0.1:4173/__fixture/reset");
  await page.addInitScript((store) => {
    localStorage.setItem("herdrWeb.bridgeBackends.v2", JSON.stringify(store));
  }, hostStore());
});

test("one browser federates colliding native IDs and routes only to the owning bridge", async ({
  page,
  request,
}) => {
  await page.goto("/");

  await expect(
    hostButton(page, "Same origin"),
  ).toBeVisible();
  await expect(
    hostButton(page, "Remote B"),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "Host" })
    .getByRole("button", { name: "All", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /^Codex A / })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Codex B / })).toBeVisible();

  await hostButton(page, "Remote B").click();
  await page.getByRole("button", { name: /^Codex B / }).click();
  await expect(page.getByText("Agent B", { exact: true })).toBeVisible();
  await page.locator(".terminal-stage").click();
  await page.keyboard.type("routed-to-host-b");
  await page.keyboard.press("Control+C");
  await page.getByRole("button", { name: "New space" }).click();

  await expect
    .poll(async () => {
      const response = await request.get(
        "http://127.0.0.1:4173/__fixture/requests",
      );
      const logs = await response.json();
      return {
        hostACommands: logs["host-a"].commands,
        hostAInput: logs["host-a"].terminalInput,
        hostBCommands: logs["host-b"].commands.map(
          (command: { method: string }) => command.method,
        ),
        hostBInput: logs["host-b"].terminalInput
          .filter((message: { type: string }) => message.type === "input")
          .map((message: { data: string }) => message.data)
          .join(""),
      };
    })
    .toEqual({
      hostACommands: [],
      hostAInput: [],
      hostBCommands: expect.arrayContaining(["workspace.create"]),
      hostBInput: "routed-to-host-b\u0003",
    });
});

test("offline, incompatible, and malformed profiles stay isolated", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    hostButton(page, "Protocol C"),
  ).toBeVisible();
  await expect(
    hostButton(page, "Malformed D"),
  ).toBeVisible();
  await expect(
    hostButton(page, "Offline E"),
  ).toBeVisible();
  await expect(
    hostButton(page, "Same origin"),
  ).toBeVisible();

  await hostButton(page, "Offline E").click();
  await expect(page.getByRole("button", { name: "New tab" })).toHaveCount(0);
  await expect(page.locator(".xterm-helper-textarea")).toHaveCount(0);
  await expect(
    page.getByText("Could not reach the herdr bridge.", { exact: true }),
  ).toBeVisible();

  await hostButton(page, "Same origin").click();
  await expect(page.getByRole("button", { name: "New tab" })).toBeEnabled();
  await expect(page.getByRole("button", { name: /^Codex A / })).toBeVisible();
});

test("failed snapshots do not blank another host", async ({
  page,
  request,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto("/");
  await page
    .getByRole("group", { name: "Host" })
    .getByRole("button", { name: "All", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /^Codex A / })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Codex B / })).toBeVisible();

  await request.post("http://127.0.0.1:4173/__fixture/state", {
    data: { hostId: "host-b", snapshotMode: "offline" },
  });
  await page.getByRole("button", { name: "Refresh" }).click();

  await expect(page.getByRole("button", { name: /^main Same origin/ })).toBeVisible();
  await hostButton(page, "Same origin").click();
  await expect(page.getByRole("button", { name: "New tab" })).toBeEnabled();
  expect(pageErrors).toEqual([]);
});

test("retained offline rows cannot publish selection or focus mutations", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await hostButton(page, "Remote B").click();
  await page.getByRole("button", { name: /^Codex B / }).click();

  const beforeResponse = await request.get("http://127.0.0.1:4173/__fixture/requests");
  const before = await beforeResponse.json();
  const beforeCommands = before["host-b"].commands.length;
  const beforeSelections = before["host-b"].selections.length;

  await request.post("http://127.0.0.1:4173/__fixture/state", {
    data: { hostId: "host-b", snapshotMode: "offline" },
  });
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(hostButton(page, "Remote B")).toBeVisible();
  await page
    .getByRole("group", { name: "Host" })
    .getByRole("button", { name: "All", exact: true })
    .click();

  await expect
    .poll(async () => {
      const response = await request.get("http://127.0.0.1:4173/__fixture/requests");
      const logs = await response.json();
      return {
        commands: logs["host-b"].commands.length,
        selections: logs["host-b"].selections.length,
      };
    })
    .toEqual({ commands: beforeCommands, selections: beforeSelections });
});

test("Foundation terminal attachment stays routed to the selected bridge", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:4173/__fixture/state", {
    data: { hostId: "host-b", features: ["snapshot", "terminal_attach"] },
  });
  await page.goto("/");
  await hostButton(page, "Remote B").click();
  await expect
    .poll(async () => {
      const response = await request.get("http://127.0.0.1:4173/__fixture/requests");
      const logs = await response.json();
      return logs["host-b"].connections;
    })
    .toBe(1);
  await expect(page.getByRole("region", { name: /terminal/i }).last()).toBeVisible();
});

test("partial structural command declarations do not publish unsupported commands", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:4173/__fixture/state", {
    data: { hostId: "host-b", commands: ["workspace.rename"] },
  });
  await page.goto("/");
  await hostButton(page, "Remote B").click();

  await expect(page.getByRole("button", { name: "New space" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New tab" })).toBeVisible();

  const response = await request.get("http://127.0.0.1:4173/__fixture/requests");
  const logs = await response.json();
  expect(logs["host-b"].commands).toEqual([]);
});

test("core surface capabilities are enforced per host", async ({ page, request }) => {
  await request.post("http://127.0.0.1:4173/__fixture/state", {
    data: { hostId: "host-b", features: ["snapshot"] },
  });
  await page.goto("/");

  await expect(hostButton(page, "Remote B")).toBeVisible();
  await expect(hostButton(page, "Same origin")).toBeVisible();
  await hostButton(page, "Remote B").click();
  await expect(page.getByRole("button", { name: "New tab" })).toBeVisible();
  await expect(page.locator("textarea.ghostty-hidden-input")).toHaveCount(1);
});

test("recovery re-handshakes capabilities before restoring controls", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(hostButton(page, "Remote B")).toBeVisible();

  await request.post("http://127.0.0.1:4173/__fixture/state", {
    data: { hostId: "host-b", snapshotMode: "offline" },
  });
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(hostButton(page, "Remote B")).toBeVisible();
  await hostButton(page, "Remote B").click();

  const eventResponse = await request.post("http://127.0.0.1:4173/__fixture/ws-event", {
    data: {
      hostId: "host-b",
      path: "/ws/activity",
      event: {
        type: "pane.agent_status_changed",
        pane_id: "p1",
        workspace_id: "main",
        agent_status: "working",
        agent: "codex",
        title: "Still stale",
        display_agent: "Codex B",
        state_labels: { working: "Running" },
      },
    },
  });
  expect((await eventResponse.json()).sent).toBeGreaterThan(0);
  await expect(hostButton(page, "Remote B")).toBeVisible();

  await request.post("http://127.0.0.1:4173/__fixture/state", {
    data: { hostId: "host-b", snapshotMode: "ready", terminalProtocol: 19 },
  });
  await page.getByRole("button", { name: "Refresh" }).click();

  await expect(hostButton(page, "Remote B")).toBeVisible();
  await hostButton(page, "Remote B").click();
  await expect(page.getByRole("button", { name: "New tab" })).toBeVisible();
  await expect
    .poll(async () => {
      const response = await request.get("http://127.0.0.1:4173/__fixture/requests");
      const logs = await response.json();
      return logs["host-b"].capabilityRequests;
    })
    .toBeGreaterThanOrEqual(1);
});
