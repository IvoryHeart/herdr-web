#!/usr/bin/env node

import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const root = fileURLToPath(new URL("..", import.meta.url));
const staticDir = join(root, "web", "dist");
const logs = new Map();
const fixtureStates = new Map();
const servers = [];

const fixtures = [
  {
    id: "host-a",
    port: 4173,
    label: "Fixture A",
    variant: "compatible",
    serveStatic: true,
  },
  { id: "host-b", port: 4174, label: "Fixture B", variant: "compatible" },
  {
    id: "host-c",
    port: 4175,
    label: "Incompatible C",
    variant: "incompatible",
  },
  { id: "host-d", port: 4176, label: "Malformed D", variant: "malformed" },
];

for (const fixture of fixtures) {
  logs.set(fixture.id, emptyLog());
  fixtureStates.set(fixture.id, defaultFixtureState());
  servers.push(await startFixture(fixture));
}

process.stdout.write("Herdr Web browser fixtures listening on 4173-4176\n");

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    Promise.all(
      servers.map((server) => new Promise((resolve) => server.close(resolve))),
    ).finally(() => process.exit(0));
  });
}

async function startFixture(fixture) {
  const webSockets = new WebSocketServer({ noServer: true });
  const server = createServer(async (request, response) => {
    setCorsHeaders(request, response);
    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${fixture.port}`);
    if (url.pathname === "/__fixture/requests") {
      json(response, 200, Object.fromEntries(logs));
      return;
    }
    if (url.pathname === "/__fixture/reset" && request.method === "POST") {
      for (const [id] of logs) {
        logs.set(id, emptyLog());
        fixtureStates.set(id, defaultFixtureState());
      }
      json(response, 200, { ok: true });
      return;
    }
    if (url.pathname === "/__fixture/state" && request.method === "POST") {
      const body = await readJson(request);
      const target = fixtures.find((candidate) => candidate.id === body.hostId);
      if (!target || !setFixtureState(target.id, body)) {
        json(response, 400, { error: "invalid fixture state" });
        return;
      }
      json(response, 200, { ok: true });
      return;
    }
    if (url.pathname === "/api/capabilities") {
      logs.get(fixture.id).capabilityRequests += 1;
      if (fixture.variant === "malformed") {
        json(response, 200, { bridge_api_version: "invalid", commands: "all" });
        return;
      }
      json(response, 200, capabilities(fixture, fixtureStates.get(fixture.id)));
      return;
    }
    if (url.pathname === "/api/snapshot") {
      logs.get(fixture.id).snapshotRequests += 1;
      const state = fixtureStates.get(fixture.id);
      if (state.snapshotMode === "offline") {
        json(response, 503, { error: "fixture offline" });
        return;
      }
      if (state.snapshotMode === "malformed") {
        json(response, 200, {});
        return;
      }
      json(response, 200, snapshot(fixture));
      return;
    }
    if (url.pathname === "/api/command" && request.method === "POST") {
      const body = await readJson(request);
      logs.get(fixture.id).commands.push(body);
      json(response, 200, { pane_id: `${fixture.id}-created` });
      return;
    }
    if (url.pathname === "/api/selection" && request.method === "POST") {
      const body = await readJson(request);
      logs.get(fixture.id).selections.push(body);
      json(response, 200, { ok: true });
      return;
    }
    if (fixture.serveStatic) {
      serveStaticFile(url.pathname, response);
      return;
    }
    json(response, 404, { error: "not found" });
  });

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${fixture.port}`);
    if (!url.pathname.startsWith("/ws/")) {
      socket.destroy();
      return;
    }
    webSockets.handleUpgrade(request, socket, head, (webSocket) => {
      webSocket.fixtureUrl = url;
      webSockets.emit("connection", webSocket, request);
    });
  });

  webSockets.on("connection", (webSocket) => {
    const url = webSocket.fixtureUrl;
    if (url.pathname !== "/ws/terminal") {
      return;
    }
    const log = logs.get(fixture.id);
    log.connections += 1;
    webSocket.send(
      Buffer.from(
        `\u001b[32m${fixture.label} terminal ready — λ🙂\u001b[0m\r\n`,
      ),
    );
    webSocket.on("message", (data, isBinary) => {
      if (isBinary) {
        log.terminalInput.push({ type: "binary", bytes: [...data] });
        return;
      }
      try {
        const frame = JSON.parse(String(data));
        if (frame.type === "input") {
          log.terminalInput.push(frame);
          webSocket.send(Buffer.from(frame.data));
        } else if (frame.type === "resize") {
          log.terminalResize.push(frame);
        }
      } catch {
        webSocket.close(1003, "invalid fixture frame");
      }
    });
  });

  await new Promise((resolve) =>
    server.listen(fixture.port, "127.0.0.1", resolve),
  );
  return server;
}

function capabilities(fixture, state) {
  return {
    bridge_api_version: 1,
    bridge_version: "0.1.0",
    herdr_version: "0.7.5",
    terminal_protocol:
      state.terminalProtocol ?? (fixture.variant === "incompatible" ? 16 : 17),
    configured_label: fixture.label,
    features:
      state.features ?? [
        "snapshot",
        "structural_events",
        "shared_selection",
        "terminal_attach",
        "terminal_input",
        "terminal_resize",
        "terminal_scroll",
        "terminal_shared_fanout",
      ],
    commands: [
      "workspace.create",
      "workspace.rename",
      "workspace.close",
      "workspace.focus",
      "tab.create",
      "tab.rename",
      "tab.close",
      "tab.focus",
      "pane.rename",
      "pane.close",
      "pane.split",
      "pane.focus_direction",
      "pane.move",
    ],
    web_compat: 1,
  };
}

function emptyLog() {
  return {
    commands: [],
    selections: [],
    terminalInput: [],
    terminalResize: [],
    connections: 0,
    capabilityRequests: 0,
    snapshotRequests: 0,
  };
}

function defaultFixtureState() {
  return {
    snapshotMode: "ready",
    terminalProtocol: null,
    features: null,
  };
}

function setFixtureState(hostId, value) {
  const current = fixtureStates.get(hostId);
  if (!current) {
    return false;
  }
  const snapshotMode = value.snapshotMode ?? current.snapshotMode;
  const terminalProtocol = value.terminalProtocol ?? current.terminalProtocol;
  const features = value.features ?? current.features;
  if (
    !["ready", "offline", "malformed"].includes(snapshotMode) ||
    (terminalProtocol !== null && terminalProtocol !== 16 && terminalProtocol !== 17) ||
    (features !== null &&
      (!Array.isArray(features) || features.some((feature) => typeof feature !== "string")))
  ) {
    return false;
  }
  fixtureStates.set(hostId, { snapshotMode, terminalProtocol, features });
  return true;
}

function snapshot(fixture) {
  const suffix = fixture.id.at(-1).toUpperCase();
  return {
    workspaces: [
      {
        workspace_id: "main",
        number: 1,
        label: "main",
        focused: true,
        pane_count: 1,
        tab_count: 1,
        active_tab_id: "tab-1",
        agent_status: fixture.id === "host-b" ? "blocked" : "working",
      },
    ],
    tabs: [
      {
        tab_id: "tab-1",
        workspace_id: "main",
        number: 1,
        label: `Agent ${suffix}`,
        focused: true,
        pane_count: 1,
        agent_status: fixture.id === "host-b" ? "blocked" : "working",
      },
    ],
    panes: [
      {
        pane_id: "p1",
        terminal_id: "t1",
        workspace_id: "main",
        tab_id: "tab-1",
        focused: true,
        cwd: `/fixture/${fixture.id}`,
        label: `Codex ${suffix}`,
        agent: "codex",
        display_agent: `Codex ${suffix}`,
        agent_status: fixture.id === "host-b" ? "blocked" : "working",
        state_labels:
          fixture.id === "host-b"
            ? { blocked: "Needs review" }
            : { working: "Running" },
        revision: 1,
      },
    ],
    layouts: [],
    selected_pane_id: "p1",
  };
}

function setCorsHeaders(request, response) {
  const origin = request.headers.origin;
  if (origin) {
    response.setHeader("access-control-allow-origin", origin);
    response.setHeader("vary", "Origin");
  }
  response.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
  response.setHeader("access-control-allow-headers", "content-type");
}

function json(response, status, value) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(value));
}

function serveStaticFile(requestPath, response) {
  const relative =
    requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const candidate = normalize(join(staticDir, relative));
  const file =
    candidate.startsWith(staticDir) &&
    existsSync(candidate) &&
    statSync(candidate).isFile()
      ? candidate
      : join(staticDir, "index.html");
  response.setHeader(
    "content-security-policy",
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' data: http://127.0.0.1:4174 ws://127.0.0.1:4174 http://127.0.0.1:4175 ws://127.0.0.1:4175 http://127.0.0.1:4176 ws://127.0.0.1:4176 http://127.0.0.1:4199 ws://127.0.0.1:4199; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  );
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("content-type", mimeType(file));
  createReadStream(file).pipe(response);
}

function mimeType(file) {
  return (
    {
      ".css": "text/css; charset=utf-8",
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".woff2": "font/woff2",
    }[extname(file)] ?? "application/octet-stream"
  );
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
