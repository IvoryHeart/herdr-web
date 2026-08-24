# Herdr World cutover to Foundation `v0.1.0-rc.7`

- **Spec ID:** `018-foundation-rc7-world-cutover`
- **Status:** Approved
- **Created:** 2026-08-24
- **Owner:** Herdr World
- **Reviewers:** IvoryHeart (repository owner)
- **Approved by:** IvoryHeart (explicit implementation request)
- **Approved at:** 2026-08-24

> This is the immutable contract for the requested World cutover. The owner
> approval in the implementation request authorizes this exact scope and does
> not authorize repository renaming, release publication, or product redesign.

## 1. Purpose

Switch the existing World product from the combined generic source ownership to
the published Foundation package while preserving Office behavior, World
ownership, the existing World bridge, user state, and protocol-20 operation.

## 2. Scope

This tranche SHALL:

- materialize and verify the published Foundation candidate from a clean
  checkout into a gitignored cache;
- pin the exact packed package and record its release, source, hashes, SRI,
  API versions, compatibility, and ownership in a World assembly manifest;
- compose Foundation Spaces at `/` and World Office at `/world` through
  documented Foundation exports;
- retain World-owned Office rendering, projection, assets, settings,
  observability schemas/parsers/providers, storage keys, and typed child
  routes;
- use public `SurfaceHostV1` facts, selected runtimes, commands, launchers,
  and `ManagedTerminal` handles;
- route observability descriptor, snapshot, config read, and config update
  requests through `SurfaceHostV1.extensions.request`, while World validates
  the returned `unknown` JSON; and
- retain the legacy generic source as an unreferenced fallback until packed
  parity and the complete acceptance suite prove it can be removed later.

## 3. Non-goals

This tranche SHALL NOT:

- copy or modify Foundation source, use a sibling checkout, or use a source
  alias in production or clean CI;
- replace the World bridge with the Foundation bridge or add a companion
  service, second bridge manager, second terminal owner, generic registry, or
  generalized extension/provider framework;
- redesign Office, change navigation/history, storage keys, settings,
  responsive behavior, accessibility, keyboard/focus/IME/upload/terminal
  behavior, or observability/provider architecture to simplify packaging;
- rename the repository or product, modify installers/releases/plugins,
  change artwork or licensing identity, or publish a World release; or
- perform terminal input or destructive workspace, note, session, migration,
  or reset actions against the owner’s live session.

## 4. Immutable Foundation input

The only Foundation dependency accepted by this contract is:

| Field | Value |
| --- | --- |
| Release | `v0.1.0-rc.7` |
| Source commit | `a7c67eda0ce369c7d195fc0c77409eb7804decad` |
| Release URL | `https://github.com/IvoryHeart/herdr-world-foundation/releases/tag/v0.1.0-rc.7` |
| Candidate archive URL | `https://github.com/IvoryHeart/herdr-world-foundation/releases/download/v0.1.0-rc.7/herdr-world-foundation-candidate-a7c67eda0ce369c7d195fc0c77409eb7804decad.tar.gz` |
| Archive SHA-256 | `8ecd29eaa1abc788de54a8ea0bacf6145be2fde467b72ea8d5ed204ff43c2c47` |
| Manifest SHA-256 | `569ecce02185d94d60e0862875bc0f0e4506af1d8e633ff8f1debc934c119366` |
| npm package SHA-256 | `d8623a74fa9fbb4720077a76b9953306fc45c0dd7bf6e785eb7b7ac2eb1220ac` |
| npm SRI | `sha512-ZSyVQt1SfCXelOECvU3WEh1hpoP7Gz8VDNptjNRfoR1a785imFx+Izf4h9YcwWPkBcKAsDqNGSl3afkpDFf2Eg==` |
| Foundation bridge SHA-256 | `3c5fea2272e10caf209087bedcf8896ab66cc6b20cb5d224583edcb1b3f2dcc2` |
| Foundation package | `@herdr-world/foundation@0.1.0` |
| Surface API | `1` |
| Bridge API | `1` |
| Web compatibility | `1` |
| Herdr compatibility | `0.8.2` |
| Terminal protocol | `20` |

The manifest and package compatibility record are authoritative for the
remaining Foundation bridge, Herdr audited-commit, platform, license,
provenance, and dependency-inventory fields. A missing, modified, mismatched,
or unsupported field MUST fail closed before dependency installation or app
startup.

## 5. Requirements

### Requirement: Materialize one verified packed dependency

World SHALL download or materialize only the declared release artifact into a
gitignored cache, verify the candidate archive, detached manifest, manifest
checksum, package checksum and SRI, bridge checksum, `SHA256SUMS`, source
commit, package/API versions, and compatibility before running `npm install`.
Clean CI SHALL perform the same verification before dependency installation.
No sibling checkout, editable Foundation source, mutable Git URL, or source
alias may satisfy the production dependency.

#### Scenario: A clean checkout has no Foundation sibling

- **GIVEN** only the World checkout and its declared cache are present
- **WHEN** dependency preparation and the production build run
- **THEN** the exact packed candidate is verified and consumed, or the build
  fails with a clear missing-artifact error.

#### Scenario: A candidate is changed or incompatible

- **GIVEN** any declared archive, manifest, package, bridge, SRI, API, or
  protocol value differs
- **WHEN** preparation runs
- **THEN** it fails before install/build and does not fall back to source,
  another release, or a sibling checkout.

### Requirement: Compose only through documented Foundation exports

The production assembly SHALL use Foundation’s documented package exports to
compose the Foundation shell and Spaces at `/` with the World-owned Office
surface at `/world`. World SHALL retain its product-settings contribution and
shall import only documented Foundation exports for surface definitions,
`SurfaceHostV1`, selected runtimes, commands, launchers, and `ManagedTerminal`.

#### Scenario: World and Spaces are navigated and refreshed

- **GIVEN** the packed Foundation assembly is running
- **WHEN** the user visits `/`, `/world`, navigates back/forward, or refreshes
- **THEN** the same Spaces and Office routes, history, restoration, and
  route-local error behavior remain available.

### Requirement: Preserve World-owned product behavior

World SHALL continue to own Office rendering, projection, rooms, selection,
Agent Bar, conversation bubbles, room lifecycle, seat launchers, handoffs,
settings, observability schemas/parsers/providers, assets, storage keys,
uploads, and typed child routes. Existing multi-bridge qualification,
colliding runtime identity handling, stale-generation protection, terminal
sharing, responsive layout, accessibility, keyboard/focus/IME behavior, and
browser error behavior SHALL remain covered by characterization and acceptance
tests.

#### Scenario: Two bridges expose colliding runtime IDs

- **GIVEN** two qualified runtimes contain the same runtime or pane ID
- **WHEN** Office selects, launches, hands off, or attaches to one of them
- **THEN** the selected `bridgeId`, connection key, and generation identify
  the target and no state or terminal is taken from the other bridge.

#### Scenario: A stale surface generation completes late

- **GIVEN** Office is disposed or replaced while an async host operation is
  pending
- **WHEN** the old operation resolves or rejects
- **THEN** its result cannot update the current route, provider, selection, or
  terminal state.

### Requirement: Keep the existing World bridge and canonical terminal owner

The existing World bridge SHALL continue to carry World-owned observability
transport and its existing routes/providers. World MUST NOT start the
Foundation bridge binary, create a companion process, or introduce another
bridge manager or terminal owner. Spaces and Office SHALL use Foundation’s
canonical terminal owner through public `ManagedTerminal` handles.

#### Scenario: Office shares a terminal with Spaces

- **GIVEN** Spaces is attached to a pane
- **WHEN** Office opens and closes a conversation bubble for that same
  qualified pane
- **THEN** both views share the canonical terminal owner, Office releases only
  its handle, and the pane and Spaces view remain intact.

### Requirement: Use the public extension transport seam

World SHALL call `SurfaceHostV1.extensions.request` for exactly these existing
extension operations:

| Operation | Method and path |
| --- | --- |
| Descriptor | `GET /api/extensions/{extensionId}` |
| Snapshot | `GET /api/extensions/{extensionId}/snapshot` |
| Config read | `GET /api/extensions/{extensionId}/config` |
| Config update | `PUT /api/extensions/{extensionId}/config` with JSON |

The request SHALL identify the target runtime using Foundation’s qualified
identity and SHALL advertise the `observability_extension` capability. World
continues to own observability payload schemas, parsing, providers, settings,
UI, and the existing bridge route implementations. The public response type is
`unknown`; World MUST validate it before use. World MUST NOT import raw fetch,
bridge URLs/headers, WebSockets, `BridgeManager`, private runtime types, or
private Foundation paths for these requests.

#### Scenario: An extension response has an invalid payload

- **GIVEN** Foundation returns JSON that is not a valid World observability
  descriptor, snapshot, or config shape
- **WHEN** World consumes the result
- **THEN** World rejects it through its existing error/provider behavior and
  does not treat unvalidated JSON as observability state.

### Requirement: Prove the packed boundary

The branch SHALL include a clean-checkout packed-package build and audits that
prove no Foundation source alias or private import is used, no private
Foundation path is emitted in production bundles, Foundation’s public exports
resolve from the packed package, Foundation excludes World/Office assets, and
the World bridge remains the only observability bridge. The legacy generic
fallback MAY remain in the tree only if production dependency resolution is
unreferenced and its later removal is recorded.

#### Scenario: The package is unavailable or an export is private

- **GIVEN** a clean consumer has only the packed package
- **WHEN** the import or build audit runs
- **THEN** missing/private exports fail clearly and no source-path fallback
  makes the build pass.

### Requirement: Validate and deploy with rollback safety

After all local acceptance passes, the existing installation on port `8787`
MAY be updated. Before activation, the exact current binary and `dist/` shall
be preserved as a rollback pair, the selected existing World bridge PID shall
be verified, and only that PID may be stopped. The Herdr daemon, user data,
existing session, and unrelated processes SHALL remain untouched. Live checks
are read-only with respect to the owner’s session and SHALL not send terminal
input or perform destructive actions. Temporary services MUST be stopped,
leaving only the useful `8787` installation running.

## 6. Data and interface contract

World SHALL commit a machine-readable assembly manifest containing the exact
Foundation release/source/package/API/compatibility inputs above, immutable
artifact URL, all relevant checksums and SRI, World commit, bridge ownership,
legacy fallback disposition, and cache/materialization mechanism. The lockfile
SHALL pin the exact packed package and integrity. Cross-bridge identity SHALL
remain qualified by `bridgeId`, connection key, and generation key.

Foundation’s public `extensions.request` contract is transport-only: it accepts
a validated extension ID, one of the four documented operations, a required
qualified runtime identity, the advertised feature admission, JSON for config
updates, and cancellation; it returns `unknown` JSON. World owns all payload
contracts and interpretation.

## 7. Privacy and security

Verification SHALL be content-addressed and fail closed. The cache SHALL be
gitignored and contain only published artifacts and derived verification data.
No credentials, bridge headers/URLs, terminal content, note bodies, or user
session data may be committed or written to the assembly manifest. Live
validation SHALL use loopback and read-only product interactions.

## 8. Acceptance evidence

Acceptance SHALL record successful results for:

- `npm run check`;
- `npm run test:e2e`;
- `npm run test:observability`;
- `npm run test:security`;
- `npm run test:independence`;
- the production build;
- a clean-checkout packed-package build;
- private-import, source-alias, and emitted-bundle audits;
- canonical terminal-owner, colliding-runtime, stale-generation, and
  observability transport tests;
- `git diff --check`;
- GitHub CI; and
- live `8787` checks for `/`, `/world`, Spaces, Office, terminal attach/output
  and conversation sharing, navigation/refresh, Office interactions,
  observability, responsive/mobile layout, and browser console/network errors.

## 9. Deferred decisions

Removal of the legacy generic source, repository/product rename, installer and
release orchestration, OSS identity/notices/assets cleanup, and the first World
prerelease are later tranches. No implementation in this tranche may make
those deferred decisions irreversible.
