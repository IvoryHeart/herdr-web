# Generic rectangular Office room layout — publication and bounded-failure rules

- **Parent spec:** [`012-generic-rectangular-office-room-layout-spec.md`](012-generic-rectangular-office-room-layout-spec.md)
- **Previous extension:** [`012-generic-rectangular-office-room-layout-spec-extension-001.md`](012-generic-rectangular-office-room-layout-spec-extension-001.md)
- **Spec ID:** `012-generic-rectangular-office-room-layout-extension-002`
- **Status:** In review
- **Created:** 2026-08-13
- **Owner:** Downstream Herdr World / Office presentation layer
- **Reviewers:** IvoryHeart (repository owner)
- **Approved by:** —
- **Approved at:** —

> This compatible extension closes the remaining contract gaps before
> implementation: pure geometry versus published layout revisions, finite-cap
> failure handling, rectangle containment, downstream ownership, provenance,
> and browser-local settings semantics.

## 1. Purpose

Extension 001 separates viewport and logical-canvas widths and introduces a
shared immutable layout for the Pixi and DOM presenters. It does not yet define
how a pure resolver can coexist with a monotonic publication revision or what
happens when bounded minima cannot fit within bounded maxima. This extension
defines those responsibilities and deterministic failure policies without
changing Herdr, bridge, or upstream contracts.

## 2. Scope

- Separate pure geometry resolution from stateful layout publication.
- Define normalization and ordering for all width/capacity inputs.
- Define emergency ellipsis, content-item omission, priority, and omission
  reasons for bounded-cap failures.
- Make the complete rectangle containment invariant mechanically testable.
- Clarify that this is downstream Herdr World / Office presentation work.
- Require provenance and modified-file notices for Apache-derived Office code,
  while keeping new decoration original and code-native unless separately
  sourced and recorded.
- Define atomic settings preservation as one synchronous read-modify-write
  within a browsing context, without claiming cross-tab transactions.

## 3. Non-goals

- No changes to the approved parent or Extension 001 requirements.
- No Herdr core, upstream workspace, bridge protocol, or identity contract.
- No cross-tab settings transaction protocol.
- No new external artwork or unrecorded adapted assets.
- No change to the deferred final mobile composition.

## 4. Context and constraints

The downstream Office presentation layer has two different kinds of state:
pure geometry derived from normalized inputs and publication state that tells
presenters which immutable result is current. These must not be conflated.

The Office also has finite logical-canvas and room caps. A label or content
item can therefore be too large even after all ordinary layout expansion has
been used. The resolver must return a bounded, inspectable result rather than
producing an impossible width equation, infinite growth, or pixels outside a
room.

The implementation modifies downstream TypeScript adaptations of the
Apache-derived Office geometry/drawing surface. It SHALL follow the existing
provenance and modification-notice requirements in
[`docs/world-assets.md`](../world-assets.md). The CEO Office and Agent Bar are
presentation concepts owned by downstream Herdr World / Office; they are not
Herdr Web core or upstream protocol objects.

## 5. Requirements

### Requirement: Separate pure geometry from layout publication

The implementation SHALL expose two distinct responsibilities:

```ts
const geometry = resolveOfficeGeometry(normalizedInput); // pure
const layout = publishOfficeLayout(revision, geometry);  // stateful controller
```

`resolveOfficeGeometry` SHALL be deterministic and side-effect free. It SHALL
not allocate, read clocks, inspect DOM/Pixi state, or create a monotonic
revision. It returns geometry plus normalized diagnostics and omission data.

`publishOfficeLayout` SHALL own publication state. It SHALL increment the
layout revision exactly once when a new normalized-input generation is
published, retain the same revision for repeated publication of the same
generation, and return one immutable layout object containing the revision and
geometry. A controller MAY use a caller-owned generation or normalized-input
fingerprint, but identical inputs in one controller MUST not cause revision
churn.

The controller SHALL separately track `canvasRenderedRevision`. The DOM overlay
MUST be hidden or non-interactive until both `layoutRevision` and
`canvasRenderedRevision` equal the published layout revision. Receiving the
same object reference alone is not proof that Pixi has rendered it.

#### Scenario: Identical geometry is published twice

- **GIVEN** a normalized input generation has already been published
- **WHEN** the same generation is requested again without an input change
- **THEN** pure geometry is equal and the controller does not increment the
  layout revision.

#### Scenario: Geometry changes before canvas rendering completes

- **GIVEN** the published layout is revision `N` and Pixi has rendered `N`
- **WHEN** a new normalized generation publishes revision `N+1` before Pixi
  reports completion
- **THEN** the DOM overlay remains hidden or non-interactive until
  `canvasRenderedRevision` also becomes `N+1`.

### Requirement: Normalize widths, caps, and capacities deterministically

All numeric layout inputs SHALL be normalized before geometry resolution:

- non-finite values use their declared finite default;
- negative finite values normalize to `0`;
- fractional finite values are rounded down to integer logical units;
- missing values use the declared default; and
- normalized values are never allowed to become `NaN`, `Infinity`, or
  negative.

The normalized constants SHALL obey this ordering:

```text
0 <= minimumRoomWidth
  <= maximumExpandedRoomWidth
  <= maximumExpandedCanvasWidth
  and
0 <= minimumLogicalCanvasWidth
  <= maximumExpandedCanvasWidth
```

If input caps violate that ordering, normalization SHALL raise the relevant
maximum to the largest required minimum before resolution. If a required
minimum itself is non-finite, negative, or otherwise invalid, the declared
finite default is used first. `maximumExpandedCanvasWidth` is therefore never
less than either logical or room minimum, and `maximumExpandedRoomWidth` is
never greater than the normalized canvas cap.

`maxContentItems` SHALL be a finite positive integer capacity. The initial
bounded default and hard cap are both `128`; descriptors may request fewer but
not more. The resolver SHALL report all items beyond the capacity rather than
silently changing the declared order.

#### Scenario: Width inputs are malformed

- **GIVEN** a viewport or cap is negative, fractional, `NaN`, or infinite
- **WHEN** the input is normalized
- **THEN** it becomes the documented finite default or non-negative floored
  value, the ordering invariant holds, and the pure resolver receives only
  finite non-negative integers.

### Requirement: Define bounded text failure behavior

In `expand` mode, the presentation layer SHALL first measure the full
normalized room and host labels using the declared font/style contract. If the
full measured header cannot fit within `maximumExpandedRoomWidth` after fixed
icons, actions, and gaps, the visual label SHALL use emergency ellipsis to fit
the bounded header rectangle. Emergency ellipsis is a cap-failure fallback,
not a change to the user's saved title mode.

The full bounded room and host names SHALL remain available in semantic DOM
regardless of emergency ellipsis or action permissions.

#### Scenario: An expanded label exceeds the hard room cap

- **GIVEN** `longRoomTitleMode` is `expand` and the full measured header is
  wider than `maximumExpandedRoomWidth`
- **WHEN** the layout is resolved
- **THEN** the visual label uses deterministic emergency ellipsis inside the
  header rectangle, the room remains within its cap, and the full label remains
  in semantic DOM.

### Requirement: Define content-item priority and omission

Every bounded content item SHALL declare `importance` as `required`,
`preferred`, or `optional`, a deterministic declared order, minimum and
preferred dimensions, and a stable id. Numeric priority MAY refine ordering
within an importance class.

Selection order SHALL be: required items in declared order, then preferred
items by descending numeric priority and declared order, then optional items by
descending numeric priority and declared order. Packing SHALL preserve that
selected order within each declared flow.

When a content item cannot be represented within the normalized caps, the
resolver SHALL return an omission record with one of these stable reasons:

- `content-item-count-cap` — the bounded item capacity was reached;
- `required-minimum-exceeds-room-cap` — a required item cannot fit the maximum
  room width;
- `optional-minimum-exceeds-room-cap` — a preferred or optional item cannot fit
  the maximum room width;
- `canvas-capacity-exhausted` — the bounded canvas cannot provide another
  permitted row/region; or
- `invalid-content-descriptor` — required descriptor data failed
  normalization.

Required items MUST NOT be silently dropped. If a required item exceeds the
  room cap, it is returned as an omitted required item and the room includes a
  bounded accessible overflow marker inside its content-safe rectangle.
Preferred and optional items MAY be omitted according to the stable reasons
above. The result SHALL include counts grouped by reason and importance.

#### Scenario: Content exceeds the item capacity

- **GIVEN** a descriptor contains more than `maxContentItems` items
- **WHEN** the resolver selects content
- **THEN** the first items selected by the declared importance/priority/order
  policy receive rectangles, later items receive
  `content-item-count-cap`, and the result exposes deterministic omission
  counts without growing beyond the canvas cap.

#### Scenario: A required board exceeds the room cap

- **GIVEN** a required content item has a minimum width greater than
  `maximumExpandedRoomWidth`
- **WHEN** the resolver resolves its region
- **THEN** it returns the item with
  `required-minimum-exceeds-room-cap`, places a bounded accessible overflow
  marker inside the room, and emits no out-of-bounds item pixels.

### Requirement: Enforce nested rectangle containment

For every room and resolved content item, the general invariant SHALL be:

```text
inkBounds ⊆ clipRect ⊆ outerRect
```

The invariant includes furniture, labels, borders, shadows, decorative boards,
and selection treatment. `wallRect`, `headerRect`, and `contentSafeRect` SHALL
also be finite, non-negative, and contained by `outerRect`; their named
allowances MUST be included when calculating `inkBounds`.

#### Scenario: A decoration or shadow reaches a room edge

- **GIVEN** a room is rendered at a minimum or cap-limited size
- **WHEN** its visible bounds are calculated
- **THEN** `inkBounds` remains wholly inside `clipRect`, and `clipRect` remains
  wholly inside `outerRect`; the renderer does not rely on an adjacent road or
  room to hide overflow.

### Requirement: Preserve downstream ownership and provenance

The implementation SHALL identify this work as downstream Herdr World / Office
presentation code. It MUST NOT add CEO Office or Agent-Bar concepts to Herdr
core, upstream workspace state, or bridge protocol contracts.

Any modified Apache-derived geometry or drawing file SHALL retain or receive a
prominent modification notice satisfying the existing Apache-2.0 Section 4(b)
requirements and SHALL remain covered by the provenance record in
`docs/world-assets.md`. New room decoration SHALL be original code-native work
unless an asset is separately sourced, licensed, hashed, and added to the
provenance record.

#### Scenario: The implementation adds a wall board

- **GIVEN** a new wall board is needed for the visual style guide
- **WHEN** it is added to a room
- **THEN** it is implemented as original code-native geometry or receives the
  required explicit provenance; no uncredited external artwork is introduced.

### Requirement: Scope settings atomicity to one browsing context

“Atomic read-modify-write” SHALL mean one synchronous preserving update of the
complete `herdrWeb.worldLayout.v1` record within one browsing context: read the
current record, independently normalize sibling fields, merge the requested
field, and perform one `localStorage.setItem`.

The contract MUST NOT claim cross-tab transactional atomicity. Cross-tab
conflict detection, locking, or reconciliation requires a later approved
extension.

#### Scenario: One setting changes while its sibling is valid

- **GIVEN** the current browsing context stores valid alignment and title-mode
  fields
- **WHEN** one field is changed
- **THEN** one synchronous read-modify-write preserves the unchanged sibling and
  writes the normalized complete record.

## 6. Data and interface contract

The pure geometry function accepts normalized width/capacity inputs and
bounded descriptors and returns deterministic geometry, child rectangles,
containment bounds, and omission records. It does not return a monotonic
revision.

The stateful publication controller accepts a normalized-input generation and
pure geometry result and returns an immutable layout with:

- `layoutRevision`;
- `canvasRenderedRevision` state owned by the controller;
- the normalized width/capacity values;
- room, row, and content-item rectangles;
- nested wall/header/content/clip/ink bounds; and
- omission counts and stable reasons.

The browser-local settings codec remains the complete versioned
`WorldLayoutSettings` record from Extension 001. Its one-context update
operation is synchronous and preserving; no cross-tab guarantee is implied.

## 7. Privacy and security

No new data, network route, bridge capability, browser permission, or external
dependency is introduced. Omission diagnostics contain presentation metadata
only and do not expose workspace contents, terminal output, credentials, or
provider data.

## 8. Acceptance evidence

- Pure resolver tests prove deterministic output for identical normalized
  inputs and no revision side effects.
- Publication-controller tests prove one revision per normalized generation,
  stable repeated publication, and separate canvas-rendered revision gating.
- Normalization tests cover negative, non-finite, fractional, invalid ordering,
  cap, and `maxContentItems` inputs.
- Text tests cover expand-mode emergency ellipsis and full semantic labels.
- Content tests cover required/preferred/optional ordering, all omission
  reasons, required overflow markers, and deterministic omission counts.
- Geometry tests prove `inkBounds ⊆ clipRect ⊆ outerRect` for rooms and content
  items, including shadows, selection strokes, and decoration.
- Settings tests prove one-context synchronous preserving updates and make no
  cross-tab atomicity claim.
- Provenance checks verify modified-file notices, source/hash records, and
  original code-native decoration policy against `docs/world-assets.md`.
- Frontend lint, the full Vitest suite, production build, and exact narrow and
  desktop screenshots pass after implementation.

## 9. Deferred decisions

- Cross-tab settings conflict handling.
- New composition flows or span policies beyond those approved in Extension
  001.
- Final mobile room composition and interaction.
