import { expect, test } from "@playwright/test";
import { hostStore } from "./hostStore";

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
    page.getByRole("button", { name: "Same origin, compatible" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remote B, compatible" }),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "Host" })
    .getByRole("button", { name: "All", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /^Codex A / })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Codex B / })).toBeVisible();

  await page.getByRole("button", { name: "Remote B, compatible" }).click();
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
    page.getByRole("button", { name: "Protocol C, incompatible" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Malformed D, incompatible" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Offline E, offline" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Same origin, compatible" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Offline E, offline" }).click();
  await expect(page.getByRole("button", { name: "New tab" })).toHaveCount(0);
  await expect(page.locator(".xterm-helper-textarea")).toHaveCount(0);
  await expect(
    page.getByText("Bridge disconnected", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Same origin, compatible" }).click();
  await expect(page.getByRole("button", { name: "New tab" })).toBeEnabled();
  await expect(page.getByRole("button", { name: /^Codex A / })).toBeVisible();
});

test("malformed snapshots are rejected without blanking another host", async ({
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
    data: { hostId: "host-b", snapshotMode: "malformed" },
  });
  await page.getByRole("button", { name: "Refresh" }).click();

  await expect(page.getByRole("button", { name: "Remote B, offline" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Codex B / })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Codex A / })).toBeVisible();
  await page.getByRole("button", { name: "Same origin, compatible" }).click();
  await expect(page.getByRole("button", { name: "New tab" })).toBeEnabled();
  expect(pageErrors).toEqual([]);
});

test("retained offline rows cannot publish selection or focus mutations", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Remote B, compatible" }).click();
  await page.getByRole("button", { name: /^Codex B / }).click();

  const beforeResponse = await request.get("http://127.0.0.1:4173/__fixture/requests");
  const before = await beforeResponse.json();
  const beforeCommands = before["host-b"].commands.length;
  const beforeSelections = before["host-b"].selections.length;

  await request.post("http://127.0.0.1:4173/__fixture/state", {
    data: { hostId: "host-b", snapshotMode: "offline" },
  });
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByRole("button", { name: "Remote B, offline" })).toBeVisible();
  await page
    .getByRole("group", { name: "Host" })
    .getByRole("button", { name: "All", exact: true })
    .click();
  await page.getByRole("button", { name: /^Codex B / }).click();

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

test("core surface capabilities are enforced per host", async ({ page, request }) => {
  await request.post("http://127.0.0.1:4173/__fixture/state", {
    data: { hostId: "host-b", features: ["snapshot"] },
  });
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Remote B, incompatible" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Same origin, compatible" })).toBeVisible();
  await page.getByRole("button", { name: "Remote B, incompatible" }).click();
  await expect(page.getByText("Missing terminal_attach capability", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "New tab" })).toHaveCount(0);
});

test("recovery re-handshakes capabilities before restoring controls", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Remote B, compatible" })).toBeVisible();

  await request.post("http://127.0.0.1:4173/__fixture/state", {
    data: { hostId: "host-b", snapshotMode: "offline" },
  });
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByRole("button", { name: "Remote B, offline" })).toBeVisible();

  await request.post("http://127.0.0.1:4173/__fixture/state", {
    data: { hostId: "host-b", snapshotMode: "ready", terminalProtocol: 16 },
  });
  await page.getByRole("button", { name: "Refresh" }).click();

  await expect(page.getByRole("button", { name: "Remote B, incompatible" })).toBeVisible();
  await page.getByRole("button", { name: "Remote B, incompatible" }).click();
  await expect(page.getByRole("button", { name: "New tab" })).toBeDisabled();
  await expect
    .poll(async () => {
      const response = await request.get("http://127.0.0.1:4173/__fixture/requests");
      const logs = await response.json();
      return logs["host-b"].capabilityRequests;
    })
    .toBeGreaterThanOrEqual(2);
});
