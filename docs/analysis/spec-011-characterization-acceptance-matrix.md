# Spec 011 characterization and future acceptance matrix

## 2026-08-22 contract/lifecycle-kernel tranche

- **Implementation base:** `origin/main` at
  `57ba410c0b4bdd4ba43a43847a2c765dc076ffa5`
- **Branch:** `codex/spec-011-surface-contract-v1`
- **Delivered phase:** public typed surface/settings contract, exact API
  compatibility check, deterministic assembly validation, typed serialized
  lifecycle kernel, and least-purpose `SurfaceHostV1` terminal/command/
  capability/navigation adapter.
- **Focused evidence:** `surfaceContract.test.ts` — 20 tests pass; the
  coverage includes API match/mismatch, malformed and duplicate assemblies,
  compile-time generic rejection, load/context/factory/disposer races, stale
  generations including rejected stale loads, independent kernels, settings
  lifecycle, qualified identities, canonical direct/host owner sharing,
  abort-closed authority, semantic commands, and narrow terminal handles
  backed by `terminalSessionOwners`.
- **Public entry:** `web/src/surfaces.ts` is the documented contract facade.
  It is exercised as a conformance seam; the current App still mounts through
  `surfaceRegistry` and has not been cut over.
- **Upstream evidence:** the dated immutable audit is
  [`upstream-v050-audit-2026-08-22.md`](upstream-v050-audit-2026-08-22.md).
- **Validation evidence:** focused contract `20/20`; full web `60/60` files,
  `455/455` tests; retained terminal/focus/IME/accessibility/output suite
  `10/10` files, `69/69` tests; E2E `44 passed`, `2 skipped`; security and
  independence audits passed; `npm run check` passed. The existing CI-only
  Office resize skip remains unchanged and is tracked as
  [issue #7](https://github.com/IvoryHeart/herdr-web/issues/7).

This is a contract/kernel tranche, not completion of Spec 011, the package
seam, the Foundation repository, or the App/Office extraction.

- **Phase:** shared terminal owner implementation
- **Base:** `cbd9a0c406806f3fbb5fe9b783b2e52082f688da` (merged PR #21)
- **Scope:** current `herdr-web` production behavior before Foundation extraction
- **Status:** the shared terminal-owner gates below are implemented and evidenced by this PR; the later package/repository seam remains deferred

This document records the evidence boundary for the current Spec 011 phase. The
executable tests exercise the current `TerminalView`, Foundation-owned shared
transport, bridge command helpers, surface registry, and qualified Office
handoff paths. The package boundary, second repository, and production cutover
remain deferred.

## Current characterization evidence

| Current behavior | Evidence | Protected invariant |
| --- | --- | --- |
| Terminal attach and renderer transport | `TerminalView.characterization.test.tsx` | Qualified terminal ID, measured dimensions, `takeover=false`, configured output coalescing, ArrayBuffer/Blob delivery, and cleanup of the browser socket. |
| Terminal input and capability gates | `TerminalView.characterization.test.tsx`, `terminalSessions.test.ts` | JSON and binary input remain distinct; input, resize, scroll, and upload admission are independent. |
| Reconnection and lifecycle signals | `TerminalView.characterization.test.tsx`, `terminalReconnectPolicy.test.ts`, `terminalConnectionStatus.test.ts` | Unexpected close/error, connect timeout, online, visibility, native resume, close reasons, non-retryable closures, and bounded attach-conflict retries remain deterministic. |
| Focus, accessibility, and IME | `TerminalView.characterization.test.tsx`, `terminalAttachFocus.test.ts`, `terminalAccessibleText.test.ts`, `terminalImeFocus.test.ts`, `terminalImeInput.test.ts` | Pending attach does not steal a newly focused control; existing screen-reader and IME contracts remain covered. |
| Primary/split and multi-bridge isolation | `TerminalView.characterization.test.tsx`, `terminalSessions.test.ts`, `herdrOfficeProjection.test.ts`, `herdrOfficeHandoff.test.ts` | Same native IDs are qualified by bridge/runtime identity; output and socket ownership do not cross views or hosts. |
| Spaces ↔ Office navigation and Office commands | `tests/e2e/world.spec.ts` (real App navigation/history, room management, and exact colliding-host handoff), `tests/e2e/federation.spec.ts`, `herdrOfficeHandoff.test.ts`, `commands.test.ts`, `worldRuntime.test.ts` | The real fixture path preserves route/bridge behavior; fixture logs prove room commands and terminal handoff reach the selected host. |
| Office conversation release | `TerminalView.characterization.test.tsx` | Closing an Office conversation releases the browser transport view and does not issue a Herdr pane-close command. |

No test in this phase is skipped or marked as a substitute for an unimplemented
host-owned feature. Existing behavior remains the source of truth until the
future gates below are implemented.

## Future host-owned acceptance matrix

Every row is a blocking gate for the later Foundation/World implementation.
Rows marked “Implemented” record executable evidence established in this
shared-owner phase; the public package/repository seam remains future work.

| Future gate | Required scenario | Passing evidence | Status in this PR |
| --- | --- | --- | --- |
| Shared ownership | One host-owned terminal transport is shared by Spaces and Office. | Both views acquire handles from one owner; no surface constructs a raw terminal socket. | Implemented — `terminalSessionOwner.test.ts`, `TerminalView.characterization.test.tsx`. |
| Late subscriber state | A second view opens after initial output. | It receives the current terminal state before or with subsequent output, without replaying stale data from another owner. If the frame or byte bound would evict the stateful ANSI prefix, the owner invalidates replay while preserving live fanout; the next late subscriber is gated and requests one fresh attach-epoch resync instead of receiving a raw suffix. | Implemented — ordered replay, lossless frame/byte overflow fanout, oversized repaint, one late-subscriber resync, reconnect-epoch clearing, and stale-socket isolation are tested in `terminalSessionOwner.test.ts`. |
| Focus-owned resize | More than one view can observe one PTY. | Only the focus owner may resize; a non-owner refit cannot change the shared PTY dimensions. | Implemented — exclusive resize and deterministic transfer are tested in `terminalSessionOwner.test.ts`. |
| Partial close | One view closes while another remains attached. | The remaining view stays attached, keeps receiving output, and retains the correct PTY size. | Implemented — Office release leaves the Spaces renderer and owner connected in `TerminalView.characterization.test.tsx`. |
| Final release | The last view releases its handle. | The browser transport closes; no pane-close command is sent to Herdr. | Implemented — final release close count and no pane-close command are tested in `TerminalView.characterization.test.tsx`. |
| Single-owner reconnect | A shared transport disconnects and reconnects. | Exactly one owner schedules recovery and restores every subscribed renderer without duplicate sockets or stale writes. | Implemented — one scheduler and all-subscriber restoration are tested in `terminalSessionOwner.test.ts`. |
| Protocol parity | Shared transport behavior is migrated. | Output coalescing, JSON/binary input, close reasons, connect timeout, foreground recovery, and retry policy match the characterization baseline. | Implemented — merged PR #21 suite plus `terminalSessionOwner.test.ts` pass. |
| Qualified multi-bridge identity | Two hosts expose `(bridge-a, terminal-1)` and `(bridge-b, terminal-1)`. | They remain separate owners and renderer subscriptions; a handoff to bridge B cannot attach bridge A’s terminal. | Implemented — duplicate bridge IDs and stale generation output are tested in `terminalSessionOwner.test.ts`; production isolation remains in characterization coverage. |

## Known gaps and proposed later seams

- The real fixture e2e coverage is the App-level route/bridge/Office evidence;
  no duplicate unit harness is added for behavior that would merely echo props
  or call command helpers directly. The later typed host/context adapter still
  needs its own integration evidence when the package seam is introduced.
- The later public host/context seam must expose this owner through a narrow
  typed handle without reintroducing raw sockets or a second bridge manager.
  The current owner preserves the attach query, renderer output ordering,
  admission gates, focus protection, close policy, cleanup behavior, and
  lossless live fanout when bounded late-subscriber replay becomes incomplete.
- The contract-tranche preview is running at `http://127.0.0.1:5191/` with its
  protocol-20 bridge at `http://127.0.0.1:8791/`; the existing installations on
  8787, 8788, 8790, 5174, and 5190 remain untouched. Manual preview validation
  is limited to the configured daemon state and does not claim a production
  cutover.
