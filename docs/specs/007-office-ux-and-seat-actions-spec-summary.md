# Implementation summary — Office UX and seat actions

- **Parent spec:** [`007-office-ux-and-seat-actions-spec.md`](007-office-ux-and-seat-actions-spec.md)
- **Implemented at:** 2026-08-11
- **Implementation status:** Complete

> The approved contract is retained unchanged. This record describes the
> delivered implementation and its operational limits.

### 2026-08-11 — Delivered implementation

- **Implemented:** Commits [`05102fe`](../../commit/05102fe), [`59e64ed`](../../commit/59e64ed), and [`f526640`](../../commit/f526640) approve the contract and add the accessible Office selection inspector, authoritative agent/desk/room/host metadata, bounded activity-transition age, capability-gated `New seat` launcher flow, and the `Usage` / `Workforce` board labels. The new seat uses the existing admitted runtime, workspace, launcher preset, and bridge command paths; it does not create Office-only desks.
- **Evidence:** `npm run test:web` — 48 files / 327 tests passed; `npm run lint:web` passed; `npm run build:web` passed with the existing large-chunk warning; `npx playwright test tests/e2e/world.spec.ts` — 22 tests passed. The browser suite covers accessible selection, real launcher submission, stale-host handoff suppression, gesture parity, and responsive Office behavior.
- **Constraints / operational notes:** Activity context currently shows only the latest qualified status-transition age, or `No transition data available`; it does not fabricate a timeline. New seats become visible in Office only after admitted snapshot reconciliation. Normal Herdr exit and pane close remain the authoritative lifecycle.
- **Drift from approved spec:** None. The bounded activity display is the permitted first-slice form of activity context.
- **Follow-up extension:** The bottom status line visible inside an opened terminal is rendered by the Herdr TUI stream, not herdr-web. Relocating its model/effort, cwd, and quota indicators into the web title bar requires a Herdr-side change or a new structured protocol contract and is intentionally outside this web implementation.
