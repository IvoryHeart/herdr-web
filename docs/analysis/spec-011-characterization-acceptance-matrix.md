# Spec 011 characterization and future acceptance matrix

- **Phase:** characterization only
- **Base:** `c330b733cfc487b4f80cde2b5b461aa4520471e0`
- **Scope:** current `herdr-web` production behavior before Foundation extraction
- **Status:** the future host-owned gates below are not implemented by this PR

This document records the evidence boundary for the first Spec 011 PR. The
executable tests exercise the current `TerminalView`, bridge command helpers,
surface registry, and qualified Office handoff paths. They do not add a new
terminal owner, shared transport, package boundary, or production cutover.

## Current characterization evidence

| Current behavior | Evidence | Protected invariant |
| --- | --- | --- |
| Terminal attach and renderer transport | `TerminalView.characterization.test.tsx` | Qualified terminal ID, measured dimensions, `takeover=false`, configured output coalescing, ArrayBuffer/Blob delivery, and cleanup of the browser socket. |
| Terminal input and capability gates | `TerminalView.characterization.test.tsx`, `terminalSessions.test.ts` | JSON and binary input remain distinct; input, resize, scroll, and upload admission are independent. |
| Reconnection and lifecycle signals | `TerminalView.characterization.test.tsx`, `terminalReconnectPolicy.test.ts`, `terminalConnectionStatus.test.ts` | Unexpected close/error, connect timeout, online, visibility, native resume, close reasons, non-retryable closures, and bounded attach-conflict retries remain deterministic. |
| Focus, accessibility, and IME | `TerminalView.characterization.test.tsx`, `terminalAttachFocus.test.ts`, `terminalAccessibleText.test.ts`, `terminalImeFocus.test.ts`, `terminalImeInput.test.ts` | Pending attach does not steal a newly focused control; existing screen-reader and IME contracts remain covered. |
| Primary/split and multi-bridge isolation | `TerminalView.characterization.test.tsx`, `terminalSessions.test.ts`, `herdrOfficeProjection.test.ts`, `herdrOfficeHandoff.test.ts` | Same native IDs are qualified by bridge/runtime identity; output and socket ownership do not cross views or hosts. |
| Spaces ↔ Office navigation and Office commands | `spec011SurfaceCharacterization.test.tsx`, `herdrOfficeHandoff.test.ts`, `commands.test.ts`, `worldRuntime.test.ts` | Navigation preserves qualified observation; Office room create, rename, clear, and close requests use the selected bridge. |
| Office conversation release | `TerminalView.characterization.test.tsx` | Closing an Office conversation releases the browser transport view and does not issue a Herdr pane-close command. |

No test in this phase is skipped or marked as a substitute for an unimplemented
host-owned feature. Existing behavior remains the source of truth until the
future gates below are implemented.

## Future host-owned acceptance matrix

Every row is a blocking gate for the later Foundation/World implementation. A
row marked “future” is intentionally not claimed as passing in this PR.

| Future gate | Required scenario | Passing evidence | Status in this PR |
| --- | --- | --- | --- |
| Shared ownership | One host-owned terminal transport is shared by Spaces and Office. | Both views acquire handles from one owner; no surface constructs a raw terminal socket. | Future — no shared owner added. |
| Late subscriber state | A second view opens after initial output. | It receives the current terminal state before or with subsequent output, without replaying stale data from another owner. | Future — current views attach independently. |
| Focus-owned resize | More than one view can observe one PTY. | Only the focus owner may resize; a non-owner refit cannot change the shared PTY dimensions. | Future — current views each send their own resize. |
| Partial close | One view closes while another remains attached. | The remaining view stays attached, keeps receiving output, and retains the correct PTY size. | Future — current view cleanup is characterized only. |
| Final release | The last view releases its handle. | The browser transport closes; no pane-close command is sent to Herdr. | Future — no shared release count exists. |
| Single-owner reconnect | A shared transport disconnects and reconnects. | Exactly one owner schedules recovery and restores every subscribed renderer without duplicate sockets or stale writes. | Future — current reconnect tests cover one `TerminalView` owner per socket. |
| Protocol parity | Shared transport behavior is migrated. | Output coalescing, JSON/binary input, close reasons, connect timeout, foreground recovery, and retry policy match the characterization baseline. | Future — baseline is recorded above. |
| Qualified multi-bridge identity | Two hosts expose `(bridge-a, terminal-1)` and `(bridge-b, terminal-1)`. | They remain separate owners and renderer subscriptions; a handoff to bridge B cannot attach bridge A’s terminal. | Future shared-owner proof — current qualified identity tests pass. |

## Known gaps and proposed later seams

- A full App-level route/bridge/Office interaction test would require a
  substantive host/context refactor or broad provider harness. This PR keeps
  the gap explicit and tests the production navigation, command, runtime, and
  handoff seams that already exist.
- The later implementation needs a host-owned terminal handle seam around the
  current socket lifecycle. That seam must preserve the current attach query,
  renderer output ordering, admission gates, focus protection, close policy,
  and cleanup behavior before any duplicate `TerminalView` ownership is
  removed.
- Live preview was not started for this PR. Ports 8787, 8788, and 5174 were
  already occupied by existing services and were left untouched; no live
  validation claim is made.
