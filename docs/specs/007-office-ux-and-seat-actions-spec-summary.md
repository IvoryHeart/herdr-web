# Implementation summary — Office UX and seat actions

- **Parent spec:** [`007-office-ux-and-seat-actions-spec.md`](007-office-ux-and-seat-actions-spec.md)
- **Implemented at:** 2026-08-11
- **Implementation status:** Core slice delivered; canvas callouts remain planned

> The approved contract is retained unchanged. This record describes the
> delivered implementation and its operational limits.

### 2026-08-11 — Delivered implementation

- **Implemented:** Commits [`05102fe`](../../commit/05102fe), [`59e64ed`](../../commit/59e64ed), and [`f526640`](../../commit/f526640) approve the contract and add the accessible Office selection flow, bounded activity-transition age, capability-gated `New seat` launcher flow, the `Economy` / `Workforce` board labels, and compact agent context in the embedded terminal window title bar. The new seat uses the existing admitted runtime, workspace, launcher preset, and bridge command paths; it does not create Office-only desks.
- **Evidence:** `npm run test:web` — 48 files / 327 tests passed; `npm run lint:web` passed; `npm run build:web` passed with the existing large-chunk warning; `npx playwright test tests/e2e/world.spec.ts` — 22 tests passed; the rapid-resize terminal regression also passed. The browser suites cover accessible selection, real launcher submission, stale-host handoff suppression, gesture parity, responsive Office behavior, and recovery after fast viewport changes.
- **Constraints / operational notes:** Activity context currently shows only the latest qualified status-transition age, or `No transition data available`; it does not fabricate a timeline. New seats become visible in Office only after admitted snapshot reconciliation. Normal Herdr exit and pane close remain the authoritative lifecycle.
- **Drift from approved spec:** None. The bounded activity display is the permitted first-slice form of activity context.
- **Interaction refinement:** The embedded terminal title bar now carries the selected agent’s state, location, activity age, and `Open in Spaces` action. The old bottom selection/status panel and page-level title-bar inspector have been removed; the Herdr terminal stream remains unchanged.
- **Follow-up UX slice:** Canvas hover callouts for agents, desks, rooms, and hosts remain pending. They should be designed as bounded in-scene callouts with semantic/keyboard equivalents, then implemented separately from the terminal title-bar metadata.
- **Resize safety:** Terminal fitting is debounced during rapid host-size changes and its pending timer/frame is cancelled during teardown, preventing a resize burst from monopolising the page or leaving stale renderer work behind.
