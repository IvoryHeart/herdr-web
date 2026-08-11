# Implementation summary — Office UX and seat actions

- **Parent spec:** [`007-office-ux-and-seat-actions-spec.md`](007-office-ux-and-seat-actions-spec.md)
- **Implemented at:** 2026-08-11
- **Implementation status:** Core slice delivered; bounded canvas callouts and room-targeted seat actions delivered

> The approved contract is retained unchanged. This record describes the
> delivered implementation and its operational limits.

### 2026-08-11 — Delivered implementation

- **Implemented:** Commits [`05102fe`](../../commit/05102fe), [`59e64ed`](../../commit/59e64ed), and [`f526640`](../../commit/f526640) approve the contract and add the accessible Office selection flow, bounded activity-transition age, capability-gated `New seat` launcher flow, the `Economy` / `Workforce` board labels, and compact agent context in the embedded terminal window title bar. The current UX refinement adds semantic state colours, bounded hover callouts for agents, desks, rooms, and hosts, and an in-room `+` action that targets the room’s real Herdr workspace. The new seat uses the existing admitted runtime, workspace, launcher preset, and bridge command paths; it does not create Office-only desks.
- **Evidence:** `npm run test:web` — 48 files / 328 tests passed; `npm run lint:web` passed; `npm run build:web` passed with the existing large-chunk warning; the full World browser suite passed 24/24, including the room-callout/new-seat regression. The browser coverage includes lifecycle, responsive layout, terminal movement, gesture parity, stale-host handoff suppression, and rapid-resize recovery.
- **Constraints / operational notes:** Activity context currently shows only the latest qualified status-transition age, or `No transition data available`; it does not fabricate a timeline. New seats become visible in Office only after admitted snapshot reconciliation. Normal Herdr exit and pane close remain the authoritative lifecycle.
- **Drift from approved spec:** None. The bounded activity display is the permitted first-slice form of activity context.
- **Interaction refinement:** The embedded terminal title bar now carries the selected agent’s compact, colour-coded state/activity summary and a maximize action for opening the full terminal in Spaces. Host information remains in the terminal title bar; the old bottom selection/status panel, page-level title-bar inspector, and text handoff button have been removed. Escape remains available to the focused Herdr terminal stream.
- **Callouts and seat placement:** In-scene callouts use bounded authoritative metadata with the existing roster as the semantic fallback. Each room exposes a `+` at the next available desk location; after Herdr admits the created tab, the new desk occupies that location and the action advances to the next slot.
- **Resize safety:** Terminal fitting is debounced during rapid host-size changes and its pending timer/frame is cancelled during teardown, preventing a resize burst from monopolising the page or leaving stale renderer work behind.
