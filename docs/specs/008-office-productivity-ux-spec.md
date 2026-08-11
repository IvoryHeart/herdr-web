# Office productivity UX

- **Spec ID:** `008-office-productivity-ux`
- **Status:** Approved
- **Created:** 2026-08-11
- **Owner:** Herdr Web / Office
- **Reviewers:** —
- **Approved by:** Requester
- **Approved at:** 2026-08-11

> This contract records the selected SUG-028, SUG-007, SUG-018, SUG-025,
> SUG-004, and SUG-023 delivery slice. The existing Herdr Web and Herdr
> protocols remain the compatibility boundary.

## 1. Purpose

Make the Office comfortable for repeated daily use: terminal windows should
track their shells during resize, the view should survive a refresh, rooms
should use space according to their contents, and the user should be able to
understand selected agent work at a glance.

## 2. Scope

- Frame-aligned inner terminal refits during Office conversation-window resize.
- Browser-local persistence of lightweight Office window geometry, ordering,
  and scroll position.
- Variable room widths and per-room desk/standing columns, with tighter CEO
  and reception composition.
- Optional harness-reported task summaries carried through existing snapshot
  and activity parsing and shown in a persistent selected-agent callout.
- A small direct-federation coordinator affordance to enable or disable all
  saved bridge profiles together.

## 3. Non-goals

- No terminal content, command history, credentials, SSH keys, or Herdr state
  are persisted by the saved Office view.
- No central gateway, browser-managed SSH, authentication, RBAC, discovery,
  or new multi-server protocol is introduced.
- No task-summary producer, TTL, redaction service, or upstream Herdr schema is
  invented in this downstream slice.
- No named preset editor, metrics/provider change, or mobile-specific layout is
  required.

## 4. Context and constraints

Herdr Web already qualifies runtime identities by bridge profile and performs
direct browser federation. A bridge may omit the optional task-summary field;
older snapshots and activity messages must remain valid. The Office renderer
must continue to preserve semantic targets and connector anchors while room
geometry changes.

## 5. Requirements

### Requirement: Keep terminal refits visually aligned

The embedded terminal SHALL schedule host-size refits at animation-frame
cadence during a resize interaction and SHALL cancel pending work on teardown.

#### Scenario: User resizes a conversation window quickly

- **GIVEN** the outer Office window changes size repeatedly
- **WHEN** the browser delivers resize observations
- **THEN** the inner terminal refits on the next frame without an additional
  trailing UI debounce that makes it visibly lag the outer window.

### Requirement: Restore lightweight Office view state

The Office SHALL persist bounded browser-local geometry, window order, and
scroll position, and SHALL restore only that UI state after refresh.

#### Scenario: User refreshes the Office

- **GIVEN** one or more Office conversation windows have been moved or resized
- **WHEN** the Office is loaded again in the same browser profile
- **THEN** the saved geometry, order, and scroll position are restored without
  restoring terminal buffers or changing Herdr runtime state.

### Requirement: Compose rooms from their contents

The Office SHALL derive room width and local anchor columns from each room's
desk and standing-agent counts while retaining minimum readable dimensions and
the configured inter-room gap.

#### Scenario: A sparse room is next to a dense room

- **GIVEN** two rooms have different desk counts
- **WHEN** the Office layout is resolved
- **THEN** their widths and anchors reflect those counts and room boundaries do
  not overlap.

### Requirement: Surface trusted optional task summaries

The browser SHALL accept an optional bounded task summary from a compatible
bridge, preserve compatibility when it is absent or null, and prefer it in a
selected-agent callout.

#### Scenario: A harness reports a current task

- **GIVEN** an admitted pane includes a non-empty task summary
- **WHEN** its agent is selected in the Office
- **THEN** a persistent, bounded status callout shows that summary alongside
  the agent identity and current state.

### Requirement: Coordinate direct bridge admission

Settings SHALL provide an explicit action to enable or disable all currently
saved bridge profiles as one direct-federation browser selection.

#### Scenario: User prepares a multi-host Office

- **GIVEN** several bridge profiles are saved
- **WHEN** the user chooses Enable all
- **THEN** each available profile is admitted to the browser's federated Office
  scope, while each profile continues to probe and fail independently.

## 6. Data and interface contract

The view preference record is versioned and bounded in browser-local storage.
It contains only conversation identifiers, geometry, order, and scroll offset.
`task_summary` is an optional string on pane snapshots and activity updates;
the Office trims it and caps its displayed length at 160 characters. No new
bridge route is required for this slice.

## 7. Privacy and security

- View persistence MUST NOT contain terminal output, input, auth material, or
  process secrets.
- Summaries are treated as untrusted presentation text: whitespace is trimmed,
  length is bounded, and raw terminal content is never inferred.
- Bridge coordination changes browser profile admission only; it does not
  broaden bridge host/origin policy or create a new trust boundary.

## 8. Acceptance evidence

- Unit tests cover view storage validation, geometry, bridge fleet ordering,
  activity compatibility, projection, and callout presentation.
- Frontend lint, production build, and the full Vitest suite pass.
- World browser tests are attempted against the fixture server; any runner
  instability is recorded in the implementation summary rather than hidden.
- Suggestions and development documentation record the delivered slice and
  the boundaries of deferred upstream work.

## 9. Deferred decisions

- Named Office presets and cross-device synchronization.
- A native Herdr task-summary producer, freshness/TTL, privacy filtering, and
  upstream extension contract.
- Authenticated discovery or a central multi-server coordinator.
- Further terminal resize smoothing if the remaining renderer-level delay is
  still visible after field use.
