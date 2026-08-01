# Operating federated Herdr Web

Herdr Web uses one host-local bridge per Herdr runtime and direct browser federation. It has no
central gateway, fleet controller, SSH manager, authentication layer, or RBAC. Every browser that a
bridge admits has terminal-equivalent access to that Herdr runtime.

## One host on loopback

Start Herdr, build the client, and run the bridge with its loopback defaults:

```bash
herdr
npm run build
scripts/run-bridge.sh --bridge-label "Laptop"
```

Open `http://127.0.0.1:8787`. Loopback Host and same-origin browser requests are admitted by default.
The label is diagnostic; the browser profile label remains the user's navigation label.

Use `--session NAME` to select a named Herdr runtime. The bridge then ignores
`HERDR_SOCKET_PATH`. One bridge process still targets only that one runtime:

```bash
PORT=8788 scripts/run-bridge.sh --session project-b --bridge-label "Project B"
```

## Two directly reachable hosts

Suppose the page is opened from `http://host-a:8787` and the browser must also call
`http://host-b:8787`. Start these independently on their respective hosts:

```bash
# host A: serves the page and its local Herdr bridge
HOST=0.0.0.0 scripts/run-bridge.sh \
  --bridge-label "Host A" \
  --allow-host host-a \
  --allow-origin http://host-a:8787 \
  --allow-connect-origin http://host-b:8787

# host B: admits direct calls from the page served by host A
HOST=0.0.0.0 scripts/run-bridge.sh \
  --bridge-label "Host B" \
  --allow-host host-b \
  --allow-origin http://host-a:8787
```

Add `http://host-b:8787` in Settings → Bridge in the browser. `--allow-origin` on B authorizes the
page origin to call B. `--allow-connect-origin` on A adds B's HTTP and WebSocket origins to the CSP
of the page A serves. Neither option is authentication. Never expose this configuration to an
untrusted network.

Non-loopback startup fails unless both an explicit `--allow-host` and `--allow-origin` are present.
Add each exact hostname and origin that is required; avoid permissive DNS, wildcard proxy, or CSP
configuration.

## Operator-managed SSH forwarding

Keep both bridges on loopback and create two tunnels using normal OpenSSH configuration. Herdr Web
never reads, generates, stores, rotates, or invokes SSH keys:

```bash
# Map remote Bridge A and Bridge B to distinct local ports.
ssh -N -L 18787:127.0.0.1:8787 host-a
ssh -N -L 28787:127.0.0.1:8787 host-b
```

Open `http://127.0.0.1:18787` and add `http://127.0.0.1:28787` as Host B. Because the URLs are
loopback but have different origins, start B with the page origin admitted and start page-serving A
with the forwarded B origin in CSP:

```bash
# on host A
scripts/run-bridge.sh \
  --allow-connect-origin http://127.0.0.1:28787 \
  --bridge-label "Host A"

# on host B
scripts/run-bridge.sh \
  --allow-origin http://127.0.0.1:18787 \
  --bridge-label "Host B"
```

VPN and authenticated reverse-proxy access are also operator responsibilities. When a proxy changes
the externally visible Host or Origin, configure the bridge for those exact values and configure the
page-serving CSP for every bridge origin. The proxy must preserve WebSocket upgrades.

## Failure and compatibility behavior

Each profile is probed independently. Protocol `16`, any unreviewed terminal protocol newer than
`17`, an incompatible bridge API, missing feature declarations, or malformed capability data blocks
that host without blocking compatible hosts. A network failure marks only that profile offline.
Stale topology may remain visible for orientation, but structural commands, terminal input, and
resize stay unavailable until the same host connection is freshly compatible again.

Workspace, pane, and terminal IDs may collide across Herdr hosts. The browser always qualifies them
with the owning profile and never reroutes a failed command or terminal stream to another host.

If the bridge serving the page stops, already loaded browser code can continue talking to other
reachable bridges. A full browser reload still requires the serving bridge or another operator-
provided static origin with equivalent CSP, because this increment does not add an independent web
asset service or central gateway.

## Verification checklist

- Load two compatible host profiles in one browser and confirm both appear in All-host scope.
- Type, send control input, resize/refit, and create/rename/move/close on each owning host.
- Disconnect one bridge and confirm the other host remains navigable and controllable.
- Configure a protocol-`16` or malformed fixture and confirm it is visible but not controllable.
- Attach two browser clients to one terminal and confirm both see output; document that last resize
  wins and the Refit button reasserts the current browser size.
- Verify desktop widths 1440 and 1920, and mobile width 375 with host switching and terminal access.
- Run `npm run check:acceptance` before delivery.
