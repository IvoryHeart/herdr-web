# Local development

Work from the `herdr-web` repository root:

```bash
cd /home/ny/Forge/ai-palace/herdr-web
```

## Quick start

Herdr Web is a client of a running Herdr server. Start or attach to the normal
Herdr session first:

```bash
herdr status server
herdr session list
herdr
```

The last command is only needed when the server/session is not already
running. It must leave the default socket at:

```text
~/.config/herdr/herdr.sock
```

Then start the web development stack from this repository:

```bash
npm run dev:local
```

This command:

1. Reuses a healthy bridge on `127.0.0.1:8787`, or starts one with
   `scripts/run-bridge.sh`.
2. Checks the local Herdr socket before starting a new bridge.
3. Builds the bridge or static web assets only when the expected local build
   outputs are missing.
4. Starts the Vite frontend and points its `/api` and `/ws` proxy at the
   bridge.

Open the bridge URL for the complete app, including the production-rendered
Office surface:

```text
http://127.0.0.1:8787
```

The command also starts Vite for frontend hot reload. Vite normally uses
`http://127.0.0.1:5173`; if that port is occupied it reports the next port,
such as `5174`. The bridge URL remains the canonical full-app URL.

Stop the foreground Vite process with `Ctrl-C`; a bridge started by
`dev:local` is stopped with it. An already-running bridge is left untouched.

## What must be running

| Layer | Required | Purpose | Default endpoint |
| --- | --- | --- | --- |
| Herdr server/session | Yes | Owns workspaces, tabs, panes, agents, and terminals | `~/.config/herdr/herdr.sock` |
| `herdr-web-bridge` | Yes | Converts browser HTTP/WebSocket traffic to Herdr protocol traffic | `http://127.0.0.1:8787` |
| Vite frontend | Only for HMR | Serves current React/TypeScript source during development | `http://127.0.0.1:5173` or next free port |
| OTEL/Prometheus stack | Optional | Supplies the Office `OTEL · LAST 24H` metrics board | Prometheus `http://127.0.0.1:9101` |

Herdr session data and the live Office roster do not depend on OTEL. If the
telemetry stack is absent, the Office metrics board reports unavailable while
the Herdr state and Office rooms remain usable.

## Manual startup

Use two terminals when debugging a layer independently:

```bash
# Terminal 1: from herdr-web/
scripts/run-bridge.sh

# Terminal 2: from herdr-web/
npm run dev:web
```

For the simplest no-HMR run, build once and open the bridge directly:

```bash
npm run build
scripts/run-bridge.sh
```

To target a named Herdr session:

```bash
HERDR_SESSION=my-session scripts/run-bridge.sh
```

To target an explicit socket:

```bash
HERDR_SOCKET_PATH=/absolute/path/to/herdr.sock scripts/run-bridge.sh
```

## Optional Office telemetry

The separate `ai-observability` repository contains the optional OTEL
Collector, Prometheus, Loki, and Grafana stack. It is not required for Herdr
Web sessions or the live Office state.

From a sibling checkout, start it with:

```bash
cd /home/ny/Forge/ai-palace/ai-observability
docker compose up -d
```

Then restart the Herdr Web bridge with the Prometheus provider enabled:

```bash
cd /home/ny/Forge/ai-palace/herdr-web
# Stop an existing bridge on 8787 first if dev:local reports that it is healthy.
HERDR_WORLD_OTEL_PROMETHEUS_URL=http://127.0.0.1:9101 npm run dev:local
```

`dev:local` deliberately reuses a healthy existing bridge, so it cannot apply
new bridge environment variables to a process that is already running.

The stack's useful local endpoints are Prometheus `9101`, Loki `3111`, and
Grafana `3002`. OTLP receivers use `4317` and `4318` for telemetry producers.

## Fast diagnosis

Check each layer in order:

```bash
herdr status server
herdr session list
curl -fsS http://127.0.0.1:8787/api/capabilities
curl -fsS http://127.0.0.1:8787/api/snapshot
```

- No Herdr socket: start or attach to Herdr first.
- Bridge `502` from Vite: the bridge is not running on port `8787`.
- Empty snapshot: the bridge is connected to the wrong Herdr socket/session.
- Sessions visible but Office blank in Vite: use the bridge URL and inspect
  the browser console; the Office E2E coverage asserts that the renderer
  produces a live canvas.

## Temporary CI warning

The Office conversation resize test in
`tests/e2e/world.spec.ts` is temporarily skipped when the `CI` environment
variable is `true`. It still runs in local E2E runs. This is an explicit
containment measure for intermittent CI instability; the root cause has not
been identified and the skip must not be treated as a permanent pass.

Re-enable the test after a reproducible CI trace identifies and fixes the
ResizeObserver, animation-frame, pointer/keyboard, viewport, or terminal-canvas
timing issue involved. GitHub Issues are currently disabled for the repository,
so this warning is the repository's tracking record for now.
