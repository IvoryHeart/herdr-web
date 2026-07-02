# Changelog

## [Unreleased]

### Breaking Changes

### Added

- Added an `Add note` action to pane and agent sidebar context menus, opening a quick-create
  dialog with a focused title and optional body that attaches the new note to the target pane.
  [PR #24](https://github.com/kcosr/herdr-web/pull/24)
- Added Mobile settings for an expanding terminal command input and Enter-as-newline
  editing, allowing long prompts to wrap and remain viewable while preserving send-on-Enter
  by default. [PR #21](https://github.com/kcosr/herdr-web/pull/21)
- Added bridge-tracked agent status transition activity with an Agents view sort option for
  `Last status change`, using semantic status changes rather than terminal output activity.
  [PR #23](https://github.com/kcosr/herdr-web/pull/23)
- Added server-side agent pins with pinned-first agent ordering, a pinned-only sidebar toggle, and
  a selected-pane header toggle plus a small pinned indicator on pinned agent rows.
  [PR #22](https://github.com/kcosr/herdr-web/pull/22)
- Added bridge-owned pane notes with a sidebar Notes view, desktop/mobile notes editor, pane
  attachment recovery states, and per-bridge note synchronization. Notes are exposed through the
  same bridge request policy as terminal controls, so allowed bridge clients can read and mutate
  saved note content. [PR #20](https://github.com/kcosr/herdr-web/pull/20)
- Added a Notes feature toggle plus persisted desktop notes panel sizing, notes list collapse
  state, notes panel open state, pane note tabs, and a dedicated Other notes list.
  [PR #20](https://github.com/kcosr/herdr-web/pull/20)
- Added a Markdown preview mode for notes that remembers Edit/Preview preference locally and keeps
  the Markdown renderer lazy-loaded until preview is used. [PR #20](https://github.com/kcosr/herdr-web/pull/20)

### Changed

- Unified the `session_key` reported by `/api/agent-activity` with the notes and agent-pins
  endpoints (`session:default` and FNV-1a socket hashes instead of a divergent local format).
- Extended the pinned-only sidebar toggle to the Tabs view so pinned panes can be found outside the
  Agents view. [PR #23](https://github.com/kcosr/herdr-web/pull/23)
- Notes created from the notes panel now open in Edit mode with the title selected, so the default
  title can be replaced immediately.

### Fixed

- Made the bridge close and cleanly reattach terminal sockets that fall behind fast output instead
  of silently dropping frames and corrupting the rendered stream.
- Moved the bridge's remaining blocking daemon round-trips (snapshot, selection, agent activity,
  rename-label lookups) off async worker threads, so a stalled daemon no longer freezes unrelated
  requests and terminal websockets.
- Bounded the bridge's per-terminal input queue so a client sending faster than the pty drains no
  longer grows bridge memory without limit.
- Fixed terminal session races where a client connecting while the previous one disconnected could
  be handed an already-detached session, and where the daemon handshake blocked all other terminal
  clients.
- Stopped the bridge from silently tightening permissions on a pre-existing operator-supplied
  `--upload-dir`; only directories the bridge creates itself are set to 0700.
- Applied the standard 120-byte label validation to `pane.rename` requests, matching every other
  rename/create command.
- Stopped a cancelled terminal mount from leaking an orphaned renderer and duplicated canvas when
  the pane changes while the terminal module is still loading.
- Made single-cell touch selections highlight correctly instead of silently storing a wrong
  scrollback row.
- Preserved combining characters and multi-codepoint emoji when copying terminal text via touch
  selection.
- Kept the selected note open while no pane is selected, so notes no longer deselect mid-edit when
  a bridge disconnects, has zero panes, or a notes refresh lands.
- Made Escape in settings number fields discard the typed value instead of committing it, and stop
  it from closing the whole settings dialog; out-of-range numbers now snap back to the clamped
  value in the field.
- Reordered Android hardware-back handling so open menus and dialogs close before the notes panel
  underneath them.
- Made Escape cancel the rename dialog from any focused control, not just the text input.
- Extended long-press text-selection prevention to the stage header pane title.
- Restored the intended drop shadow and muted URL color on the terminal selection sheet, which
  referenced undefined CSS variables.
- Validated agent-pins responses at the fetch boundary so a malformed bridge response degrades
  gracefully instead of crashing the sidebar render.
- Prevented sidebar row labels and terminal tab labels from being text-selected during long-press
  context-menu gestures.
- Fixed notes editor selection and autosave edge cases so switching to panes without notes clears
  the editor, deleting the selected note no longer shows a deleted note, and stale local save
  refreshes do not appear as external note changes. Also fixed mobile delete-dialog back handling
  and unresolved note recovery actions in the notes panel. [PR #20](https://github.com/kcosr/herdr-web/pull/20)
- On mobile, kept the note editor's terminal action available for the current pane and made it
  close the full-screen notes surface. [PR #20](https://github.com/kcosr/herdr-web/pull/20)
- Changed mobile notes back navigation so back closes the notes surface from the editor, while a
  separate header button shows the notes list. [PR #20](https://github.com/kcosr/herdr-web/pull/20)
- Kept the new-tab button pinned at the right edge of the top tab bar while the tab list scrolls.
  [PR #20](https://github.com/kcosr/herdr-web/pull/20)
- Improved terminal reconnect/resume handling so Android foregrounding and quick terminal switches
  keep the renderer stable, avoid stale tab flashes, and suppress transient connecting overlays.
  [PR #19](https://github.com/kcosr/herdr-web/pull/19)

### Removed

## [0.2.1] - 2026-06-20

### Added

- Added a Terminal font size setting. [PR #16](https://github.com/kcosr/herdr-web/pull/16)
- Added desktop click-to-open support for detected HTTP(S) terminal URLs.
  [PR #16](https://github.com/kcosr/herdr-web/pull/16)

### Changed

- Added a Mobile setting for long-press behavior, with Off, Copy, and Loupe modes; Loupe uses a
  two-stage endpoint flow, selected URLs keep the action sheet, and tapped HTTP(S) URLs open
  directly; original mobile selection work contributed by Will Hampson.
  [PR #16](https://github.com/kcosr/herdr-web/pull/16)

### Fixed

- Fixed Android/tablet bridge color picker dismissal so saving a backend after choosing a color
  keeps the Settings dialog open. [PR #16](https://github.com/kcosr/herdr-web/pull/16)
- Fixed sidebar keyboard shortcuts so agent and tab navigation follows the visible host/sidebar
  order across selected-host and all-host views. [PR #18](https://github.com/kcosr/herdr-web/pull/18)

## [0.2.0] - 2026-06-19

### Added

- Added multi-bridge connections, allowing multiple saved bridges to stay enabled at once with
  server chips and an all-agents sidebar overview. [PR #17](https://github.com/kcosr/herdr-web/pull/17)
- Added a bridge `--allow-connect-origin` option so bridge-served web pages can opt into connecting
  to other trusted bridge origins without relaxing the default Content Security Policy.
  [PR #17](https://github.com/kcosr/herdr-web/pull/17)
- Added a Host + workspace grouping option for agent lists.
  [PR #17](https://github.com/kcosr/herdr-web/pull/17)
- Added configurable bridge colors with a mobile-friendly color picker.
  [PR #17](https://github.com/kcosr/herdr-web/pull/17)

### Changed

- Moved sidebar agent/tab sorting and grouping controls into a vertical options menu, and removed
  redundant host prefixes from grouped tab labels. [PR #17](https://github.com/kcosr/herdr-web/pull/17)

## [0.1.2] - 2026-06-18

### Added

- Added a bridge-owned agent activity stream so pane status, title, display agent, and custom
  status updates reach connected browsers without waiting for a full snapshot refresh; concepts
  derived from the @roy-levi-amazon fork. [PR #11](https://github.com/kcosr/herdr-web/pull/11)
- Added Display settings for top/bottom app padding and mobile terminal controls size.
  [PR #13](https://github.com/kcosr/herdr-web/pull/13)
- Added configurable terminal input transport, with binary payload concepts derived from the
  @roy-levi-amazon fork. [PR #12](https://github.com/kcosr/herdr-web/pull/12)
- Added opt-in terminal input batching controls with a fixed 32-byte flush threshold for slow
  connections. [PR #12](https://github.com/kcosr/herdr-web/pull/12)
- Added a Shift-Tab key to the expanded mobile terminal key panel. [PR #11](https://github.com/kcosr/herdr-web/pull/11)

### Changed

- Coalesced fast terminal output bursts in the bridge before forwarding them to browser clients,
  with a per-client Terminal output batching setting for tuning frame churn during rapid TUI
  redraws; concepts derived from the @roy-levi-amazon fork.
  [PR #14](https://github.com/kcosr/herdr-web/pull/14)
- Reworked Settings into Bridge, Terminal, and Mobile areas, with horizontal area tabs on narrow
  screens. [PR #12](https://github.com/kcosr/herdr-web/pull/12)
- Improved browser startup by lazy-loading the terminal renderer with retry after load failures,
  adding installable mobile web app metadata and raster icons, and compressing static
  bridge-served web assets; concepts derived from the @roy-levi-amazon fork.
  [PR #10](https://github.com/kcosr/herdr-web/pull/10)

## [0.1.1] - 2026-06-17

### Breaking Changes

### Added

- Added a native Android setting, on by default, to blur text inputs and refit the terminal after
  the keyboard closes.
- Added an opt-in mobile terminal long-press selection setting with drag-to-copy selection, selected
  URL actions, and touch hit-testing for Ghostty-detected links.

### Changed

- Changed bridge URL validation so users can save HTTP bridge URLs at any valid host or IP address.

### Fixed

- Forced and reapplied Android dark system bar styling with light status/navigation bar icons.
- Removed duplicate bottom safe-area padding inside the mobile terminal controls.

### Removed

## [0.1.0] - 2026-06-16

### Added

- Initial release.
