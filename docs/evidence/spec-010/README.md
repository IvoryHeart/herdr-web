# Spec 010 acceptance evidence

This evidence applies to the Herdr Web tree at implementation commit
`518d4be476cfba900cab2921749cab9396f9ee24`, descended from the immutable upstream baseline
`67a4ace73fcd554af39586769dc86d4d9e82f09b`. The approved product contract is
ai-observability Spec 010 at `ecde9e1`.

## Automated gate

The final gate ran on 2026-08-01 with Node 22.16.0/npm 11.7.0, Chromium, and Rust stable 1.97.1:

```bash
npm ci
npm ci --prefix web
CARGO_HOME=/tmp/herdr-web-cargo \
RUSTUP_HOME=/tmp/herdr-web-rustup \
PATH=/tmp/herdr-web-cargo/bin:$PATH \
npm run check:acceptance
```

Result:

- vendor layout and frontend ESLint: pass;
- Rust format checks: pass;
- frontend unit/component tests: 35 files, 256 passed;
- vendored Herdr compatibility tests: 112 passed;
- Rust bridge tests: 131 passed;
- frontend production build and Rust bridge build: pass;
- browser fixture tests: 6 passed, with the environment-gated live SSH smoke skipped in the
  non-live suite and run separately below;
- root and frontend npm audit: zero vulnerabilities;
- Rust audit: zero vulnerabilities, with warnings for unmaintained `bincode 2.0.1`
  (`RUSTSEC-2025-0141`) and `anyhow 1.0.102` soundness (`RUSTSEC-2026-0190`);
- independence audit: pass;
- `git diff --check`: pass.

## Live Herdr evidence

Disposable named Herdr `0.7.5` sessions were used so the user's default session was not modified.
Each session had its own bridge and terminal process. The sessions were stopped and deleted after
the smoke tests; only the pre-existing default Herdr session remained.

`scripts/live-authority-smoke.sh` drove create, rename, split, move, focus, and close through the
native Herdr CLI, polling the bridge snapshot after each external operation. Every change reconciled
from Herdr, including the moved pane's native target and final removal; no browser or bridge topology
database was written.

`scripts/live-bridge-smoke.mjs` connected two browser-equivalent WebSocket clients to Host A and one
to Host B. It proved:

- Herdr `0.7.5`, terminal protocol `17`, bridge API `1`, and required feature handshakes;
- ANSI colour and Unicode output delivered to both Host A subscribers and visible through native
  `herdr pane read`;
- paste-shaped input, `ArrowUp`, `F1`, `Ctrl+A`, and `Ctrl+C` arrived as the expected terminal bytes;
- scroll messages stayed on the attached terminal;
- last resize produced native `stty size` output `28 91`, followed by explicit refit output `31 101`;
- reconnect resumed the same process, and both browser subscribers received later output;
- independent Host A and Host B markers reached only their selected Herdr processes.

The existing unit suites add browser selection/copy, touch selection, mouse-capture protocol,
scroll framing, input chunk ordering, reconnect policy, attach fanout, last-subscriber cleanup, and
managed launcher rollback coverage.

## Two-endpoint SSH forwarding smoke

The documented two-remote-host topology was exercised locally with two independent ephemeral
OpenSSH server endpoints, two independent Herdr sessions/bridges, and one operator-owned forward per
endpoint:

```text
browser http://127.0.0.1:18787 -> SSH endpoint A -> bridge A -> Herdr A
browser http://127.0.0.1:28787 -> SSH endpoint B -> bridge B -> Herdr B
```

Bridge A's CSP explicitly admitted the forwarded B origin; Bridge B explicitly admitted the page
origin. `tests/e2e/live-ssh.spec.ts` passed and native Host B output contained
`SPEC010_SSH_BROWSER_OK`. The application received only the two loopback bridge URLs. SSH processes,
keys, host verification, and forwarding were outside the application. All generated keys,
configurations, OpenSSH processes, bridges, and disposable Herdr sessions were removed afterward.

## Acceptance map

1. Provenance: `UPSTREAM.md`, preserved `LICENSE`, exact baseline, both remotes, and Git ancestry.
2. Baseline/delivered checks: `UPSTREAM.md`, `.github/workflows/ci.yml`, and the automated gate above.
3. Boundaries: `AppShell.tsx`, `hostRegistry.tsx`, `runtimeClient.ts`, `terminalSessions.ts`,
   `CoreNavigation.tsx`, `surfaceRegistry.tsx`, and registry mount tests.
4. Herdr authority: `live-authority-smoke.sh`, runtime-cache reconciliation tests, native snapshot
   adapter tests, and the live external mutation result above.
5. Terminal fidelity: `live-bridge-smoke.mjs`, terminal protocol/renderer unit tests, and the live
   output/input/resize/reconnect result above.
6. Structural commands: the bridge's exact allowlist plus create/rename/split/move/launch/focus/
   close validation and rollback tests; dangerous or unknown commands are rejected.
7. Two-host federation: `federation.spec.ts` uses colliding native IDs and proves All-host grouping,
   exact Host B input/command routing, and zero Host A delivery.
8. Partial failure: the same browser fixture includes compatible, offline, protocol-incompatible,
   malformed, and reachable hosts; failure and controls remain profile-local.
9. Multi-client: bridge fanout/attach/cleanup unit tests and the live two-subscriber smoke above.
10. Security: request-policy/CSP/CLI tests, `security-audit.sh`, non-loopback explicit Host/Origin
    requirements, bounded errors, npm/Rust audits, and credential scans.
11. Prohibited subsystems: `independence-audit.sh` and source scans cover auth/RBAC/TLS/SSH-key/
    tunnel/VPN managers, privilege escalation, fleet gateways, second multiplexers, observability,
    and dynamic plugins.
12. SSH: `docs/federation.md`, `live-ssh.spec.ts`, and the two-endpoint result above.
13. Responsive captures: the four PNG files beside this document cover 1440×900, 1920×1200,
    375×812 switcher, and 375×812 full-width terminal states.
14. Accessibility: `accessibility.spec.ts` verifies serious/critical Axe findings are absent, visible
    keyboard focus, semantic labels, dialog focus restoration, reduced motion, and refit operation.
15. Independence: source and dependency-graph audit pass without legacy imports, routes, stacks,
    processes, caches, or test gates; ai-observability remained untouched during implementation.
16. Operations: `README.md`, `docs/architecture.md`, `docs/federation.md`, and `docs/release.md` cover
    one/two-host startup, compatibility, Origin/CSP, trusted exposure, transport ownership, and reload.
17. Final hygiene: clean whitespace check plus tracked-tree credential, source-path, and bounded-
    diagnostic scans after this evidence was committed.

## Constraints and deviations

- The bridge intentionally remains coupled to Herdr's private `0.7.5`/protocol-17 compatibility
  surface; other terminal protocols are blocked.
- Shared terminal input is trusted-user input and latest resize wins; there is no input ownership or
  resize lease.
- Reloading the web application still depends on its serving bridge/static origin.
- The RustSec warnings above remain upstream dependency constraints; no vulnerability was reported.
- The production build reports the existing Ghostty Web chunk-size advisory.
- The SSH smoke used two isolated endpoints on one workstation because external host credentials are
  intentionally outside the repository and test environment. It exercised the documented two-
  endpoint network, Origin, CSP, WebSocket, routing, and key-separation contract without weakening it.
- No product-contract deviation was introduced.
