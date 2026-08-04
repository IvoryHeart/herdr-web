# Implementation summary — Office agent conversation bubble

- **Parent spec:** [`001-office-agent-conversation-bubble-spec.md`](001-office-agent-conversation-bubble-spec.md)
- **Implemented at:** 2026-08-04
- **Implementation status:** Complete
- **Delivery state:** Working tree only; no commit, push, or PR created per request

> The approved parent specification remains unchanged. The desktop footprint
> extension is recorded in [`001-office-agent-conversation-bubble-spec-extension-001.md`](001-office-agent-conversation-bubble-spec-extension-001.md).

## 2026-08-04 — Delivered implementation

- **Implemented:**
  - Single-selecting a live Office agent from the canvas or shared sidebar opens
    one live terminal conversation bubble.
  - The bubble reuses `TerminalView`, the existing qualified terminal session
    descriptor, capability gates, WebSocket transport, input, mouse, scroll,
    resize, upload, selection, and mobile controls.
  - The bubble uses a fixed lower-right DOM slot. Its terminal remains fixed
    while the lightweight SVG connector follows the selected agent when that
    agent is visible and hides when it is off-screen.
  - Target replacement, explicit close, Escape close, stale/offline/
    incompatible suppression, and successful double-click handoff are covered.
  - Canvas single-click opening is delayed briefly to preserve the existing
    double-click gesture without allowing the new panel to intercept its second
    click.
  - Desktop width is approximately 40% when space permits, with narrow-screen
    fallback styling.

- **Evidence:**
  - `npm run check` — passed: vendor check, web lint, Rust formatting, 296 web
    tests, 112 compatibility tests, 131 bridge tests, web build, and bridge
    build.
  - `npx playwright test tests/e2e/world.spec.ts` — 12 passed.
  - `npx playwright test tests/e2e/world-visual.spec.ts -g "stable Office conversation bubble"` — passed.
  - Visual evidence: [`office-conversation-1440x900.png`](../evidence/spec-001-office-agent-conversation-bubble/office-conversation-1440x900.png).

- **Constraints / operational notes:**
  - A fixed panel can cover an underlying bar sprite. Use its close button (or
    Escape) before double-clicking a covered canvas target; sidebar double-click
    remains available without closing first.
  - No Herdr bridge, protocol, endpoint, or terminal transport changes were
    required.

- **Drift from approved spec:**
  - The approved parent requested an approximately quarter-viewport desktop
    target. The requested larger approximately 40% desktop footprint is
    implemented under extension 001; all other parent requirements are unchanged.

- **Follow-up extension:** None.

### 2026-08-04 — Centered placement refinement

- **Implemented:** Moved the static conversation panel from the lower-right
  slot to a centered Office-stage slot while retaining the approximately 40%
  desktop footprint and moving connector only.
- **Evidence:** Added centered-position assertions to the Office browser
  coverage and rebuilt the web assets.
- **Constraints / operational notes:** Terminal content remains rendered at
  its actual CSS dimensions; no transform or bitmap scaling was introduced.
- **Drift from approved spec:** Placement changed under extension 002 at the
  requester's direction; the earlier lower-right implementation is retained in
  the preceding delivery record as history.
- **Follow-up extension:** None.

### 2026-08-04 — Desk terminal selection refinement

- **Implemented:** Occupied desks now open the attached agent terminal;
  desks with a live non-agent pane open that shell terminal. Empty or
  unavailable desks remain selection-only.
- **Evidence:** `npx playwright test tests/e2e/world.spec.ts -g "attached terminal when an occupied desk"` — passed.
- **Constraints / operational notes:** The same admission, generation, stale,
  and capability checks used for agent selection apply to desk targets.
- **Drift from approved spec:** Desk terminal selection is implemented under
  extension 003; the parent agent-only behavior is unchanged.
- **Follow-up extension:** None.

### 2026-08-04 — Standard terminal footprint and movement resilience

- **Implemented:** Widened the centered conversation panel into a rectangular
  desktop terminal footprint suitable for an approximately 96×30 session,
  while retaining real CSS sizing and responsive narrow-screen behavior.
- **Implemented:** Kept the selected terminal anchored to its pane/terminal
  identity when a live status update moves an agent between the bar, reception,
  and work floor. Desk occupancy changes no longer dismiss an active terminal.
- **Evidence:** Added the desk idle-to-working transition regression to
  `tests/e2e/world.spec.ts`; the panel geometry test now requires a readable
  rectangular desktop footprint.
- **Drift from approved spec:** Geometry and target-lifecycle behavior are
  recorded under extension 004; parent spec and extensions 001–003 remain
  unchanged.
- **Follow-up extension:** None.

### 2026-08-04 — Dual workbench and agent connectors

- **Implemented:** Added separate connector endpoints for the selected
  agent's associated workbench and current visual position. The workbench line
  stays stable while the agent moves; the live-agent line follows destination
  changes when visible.
- **Implemented:** Connector styling now distinguishes the stable workbench
  line from the stronger live-agent line, and each endpoint is independently
  viewport-gated.
- **Evidence:** The stable conversation browser test now verifies both
  connector paths.
- **Drift from approved spec:** Dual connector behavior is recorded under
  extension 005; earlier specifications remain unchanged.
- **Follow-up extension:** None.

### 2026-08-04 — Full terminal handoff from Office

- **Implemented:** Added an “Open full terminal in Spaces” control to the
  conversation bubble. It preserves the attached pane, bridge, and tab
  context, closes the overlay, and focuses the standard Spaces terminal view.
- **Evidence:** Added an end-to-end handoff test covering Office selection,
  Spaces navigation, pane identity, and bubble closure.
- **Drift from approved spec:** Full Spaces handoff is recorded under extension
  006; earlier specifications remain unchanged.
- **Follow-up extension:** None.
