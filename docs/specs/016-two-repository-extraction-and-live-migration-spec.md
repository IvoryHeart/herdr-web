# Herdr World two-repository extraction and live migration

- **Spec ID:** `016-two-repository-extraction-and-live-migration`
- **Status:** In review
- **Created:** 2026-08-21
- **Revised:** 2026-08-21
- **Owner:** Yaswanth Narvaneni / Herdr World
- **Reviewers:** IvoryHeart (repository owner)
- **Approved by:** —
- **Approved at:** —

> This specification performs the immediate physical separation selected in
> Spec 004. It also defines a live-preview and cutover discipline so repository,
> package, and protocol changes remain visible on the owner's workstation while
> implementation proceeds.

## 1. Purpose

The current `IvoryHeart/herdr-web` repository contains an upstream-derived
generic browser/bridge and downstream World behavior in one source and bundle
graph. The target is two independently buildable repositories under Herdr
World branding:

- `IvoryHeart/herdr-world-foundation`, tracking generic Herdr Web concerns; and
- `IvoryHeart/herdr-world`, containing the World product and consuming a
  versioned Foundation artifact.

The split SHALL happen now rather than being simulated indefinitely by folders
in one repository. The migration must preserve upstream ancestry, current user
data, and a working local UI, while making rollback straightforward.

## 2. Verified starting point

At authoring time:

- downstream `origin/main` is
  `bbf0d8ef652e740824174091382667e2c2e0df60`;
- audited Herdr Web `main` is
  `cff6335683acc20cbb76c24b67d03f9e75dd78e6`;
- supported Herdr stable v0.8.2 is
  `9eb521456ac0d19d3ab3d9d7cea3cca10baa8a4c`, terminal protocol 20;
- the workstation's existing `127.0.0.1:8787` service was observed running an
  older Herdr v0.8.0/protocol-19 daemon and bridge; and
- the owner has authorized upgrading that local Herdr setup to the supported
  protocol-20 baseline.

Implementation SHALL refresh the three upstream heads immediately before
extraction and record any change. The immutable commits above remain the audit
baseline, not a direction to ignore newer compatible upstream work.

## 3. Target repositories and artifacts

```text
herdr-world-foundation/
  generic shell + Spaces
  BridgeManager and browser runtime services
  herdr-world-bridge
  herdr-world-compat (minimal vendored Herdr slice)
  @herdr-world/foundation package and conformance app
  upstream comparison/replay ledger

herdr-world/
  product entry and Herdr World branding
  Office and future approved surfaces
  World-owned settings, projection, providers and assets
  installer/release assembly
  exact @herdr-world/foundation dependency
```

Foundation SHALL start from current Herdr Web Git ancestry and receive only
generic, independently reviewable downstream concerns. World SHALL preserve
the current public repository history through a GitHub repository rename; its
default branch may delete extracted generic source, but history MUST NOT be
rewritten to pretend the combined phase did not exist.

## 4. Scope

This feature includes:

- creating the Foundation repository from a refreshed Herdr Web baseline;
- replaying the approved generic downstream patch set by concern;
- publishing or locally releasing the exact package contract from Spec 011;
- renaming the existing repository/product to `herdr-world`;
- switching World from generic source ownership to an exact Foundation
  dependency;
- removing duplicate generic implementation from the World default branch;
- migrating package, binary, environment, data-directory, browser-storage,
  PWA, mobile, and documentation identities;
- independent and cross-repository CI;
- protocol-20 local upgrade, continuous preview, controlled cutover, and
  rollback; and
- a machine-readable compatibility/assembly manifest joining both releases.

## 5. Non-goals

- No Git history rewrite, subtree split presented as original authorship, or
  deletion of public audit history.
- No monorepo, Git submodule, mutable Git URL, required sibling checkout, or
  source-path alias as the released dependency model.
- No new World feature, Graph/City surface, generic registry, provider
  framework, or browser plugin platform.
- No dependency on an upstream PR being accepted.
- No forced mobile release or app-store migration in this work; the new mobile
  identity and migration consequences must nevertheless be documented.
- No destructive deletion of legacy user data during migration or uninstall.

## 6. Requirements

### Requirement: Refresh and freeze extraction inputs

Before moving source, the implementation SHALL:

1. fetch Herdr, Herdr Web, and the downstream default branch;
2. record exact commits, releases, licenses, and protocol/API versions;
3. run the current downstream test and live acceptance baseline;
4. classify each downstream commit/concern as Foundation, World, historical
   only, or upstream candidate; and
5. freeze a migration inventory containing every source, asset, package,
   executable, environment variable, data path, browser key, URL, mobile ID,
   public API, and artifact name affected by the split.

Uncommitted files from a developer worktree MUST NOT be silently copied into
either repository. They require an explicit owner and disposition.

#### Scenario: Upstream moved after this spec was approved

- **GIVEN** Herdr Web `main` differs from the authoring baseline
- **WHEN** extraction begins
- **THEN** the new head and diff are recorded, already-upstream changes are not
  replayed, and a conflict is resolved as a focused Foundation patch rather
  than by copying the full downstream tree.

### Requirement: Establish the package seam before deleting source

World orchestration SHALL first move behind the approved Spec 011 registration
and Foundation public exports. A packed Foundation artifact SHALL successfully
build and run World from clean, separate checkouts before the corresponding
generic source is removed from World.

For local development, a workspace override MAY point to a packed tarball or a
documented local package link, but CI and release tests MUST use a content-
addressed tarball or registry artifact. The lockfile and assembly manifest
remain authoritative.

#### Scenario: The adjacent Foundation checkout is renamed

- **GIVEN** World has no sibling at the developer's expected path
- **WHEN** its clean build runs
- **THEN** it succeeds from the declared package artifact or fails with a
  missing declared dependency, never by resolving a private source alias.

### Requirement: Create Foundation with upstream ancestry and a patch ledger

`herdr-world-foundation` SHALL be created from current `kcosr/herdr-web` Git
history. Generic downstream changes SHALL be replayed as small commits grouped
by concern and linked to their original downstream commits and any upstream
issue/PR. Foundation's default branch MUST exclude World surfaces, World assets,
World providers, World branding, and World release/installer policy.

The initial ledger SHALL at least classify protocol-20 compatibility, supervised
development, terminal IME replay, dialog/menu focus restoration, screen-reader
text, attach-focus protection, multi-bridge behavior, and any remaining generic
accessibility or bridge fixes. Changes already present upstream are recorded as
adopted and are not replayed.

Foundation SHALL run its conformance app and tests without the World repository.

#### Scenario: A useful change mixes generic and Office code

- **GIVEN** one historical commit touches both concerns
- **WHEN** it is replayed into Foundation
- **THEN** only the generic behavior and its independent tests are reconstructed;
  the original commit is cited and Office code remains in World.

### Requirement: Rename the existing repository without rewriting history

The existing `IvoryHeart/herdr-web` GitHub repository SHALL be renamed to
`IvoryHeart/herdr-world` after the Foundation artifact can support the World
build. GitHub redirects MAY preserve old clone URLs, but active docs, badges,
remotes, issue templates, package metadata, and contribution links SHALL use
the canonical World URL.

The history SHALL retain upstream Herdr Web and earlier project names as factual
provenance. Documentation SHALL explain the rename and separation rather than
mass-edit historical specifications, summaries, changelogs, or commit messages.

#### Scenario: An old link targets `IvoryHeart/herdr-web`

- **GIVEN** GitHub provides a rename redirect
- **WHEN** a user follows an old issue or commit link
- **THEN** history remains reachable, while current navigation and new release
  metadata identify `herdr-world`.

### Requirement: Remove duplicate generic ownership from World

After the package cutover, World SHALL contain its product entry, surfaces,
providers, assets, docs, and assembly logic, but MUST NOT retain a second
editable copy of Foundation shell, Spaces, bridge manager, bridge executable,
or compatibility crate. Temporary compatibility shims SHALL have an owner,
removal release, and tests; they MUST NOT become an indefinite fork hidden in
World.

The final import and bundle audit SHALL prove:

- Foundation has no World import or emitted asset;
- World imports only documented Foundation package exports;
- no Foundation source is copied during World build;
- Foundation and World version/license boundaries appear in the assembly
  manifest; and
- both repositories build from clean independent checkouts.

#### Scenario: A World test imports a private Foundation helper

- **GIVEN** the import is not in the package exports map
- **WHEN** clean cross-repository CI runs
- **THEN** resolution fails and the implementation either adds a reviewed
  public API or keeps the behavior World-owned.

### Requirement: Rename operational identities with bounded compatibility

Canonical new identities SHALL include:

| Kind | Legacy identity | Canonical identity |
| --- | --- | --- |
| Root/product package | `herdr-web` / `@herdr/web` | `herdr-world` and World-owned package names |
| Foundation package | none | `@herdr-world/foundation` |
| Bridge binary | `herdr-web-bridge` | `herdr-world-bridge` |
| Compatibility crate | `herdr-compat` | `herdr-world-compat` |
| Desktop wrapper/artifact | `herdr-web*` | `herdr-world*` |
| Data/config/log prefix | `herdr-web` / `herdr-web.log` | `herdr-world` / `herdr-world.log` |
| Environment prefix | `HERDR_WEB_*` | `HERDR_WORLD_*` |
| Browser/PWA visible name | Herdr Web | Herdr World |
| Android identity | `dev.herdr.web` | `io.github.ivoryheart.herdrworld` before the first World mobile release |

Implementation SHALL produce a complete generated inventory rather than rely
only on this table. Stable external identifiers such as protocol message IDs,
stored bridge IDs, launcher action IDs, and browser keys SHALL be classified
before renaming.

For one World major release:

- old CLI wrapper names and `HERDR_WEB_*` variables SHALL be supported as
  deprecated aliases where safe;
- a canonical `HERDR_WORLD_*` value wins if both are set;
- warnings MUST omit values that may contain paths, origins, or credentials;
- legacy data is copied/read through into the new location and is never deleted
  automatically; and
- browser/Capacitor preference migration is idempotent and preserves configured
  bridges, display/navigation settings, World settings, completion state, and
  unsent note drafts.

An Android application-ID change creates a separate application identity and
cannot silently inherit private app storage. Mobile release SHALL remain gated
until export/import or an explicitly retained ID is reviewed and tested.

#### Scenario: Both legacy and canonical environment variables exist

- **GIVEN** `HERDR_WEB_BRIDGE_PORT` and `HERDR_WORLD_BRIDGE_PORT` are set
- **WHEN** the new launcher starts
- **THEN** the World value wins, one redacted deprecation warning identifies
  the old variable name, and behavior is covered by a migration test.

#### Scenario: The first World run finds legacy notes and uploads

- **GIVEN** canonical data directories are empty and legacy data exists
- **WHEN** migration is requested or first-run migration executes
- **THEN** data is copied atomically, the old data remains recoverable, repeat
  execution is idempotent, and a manifest records the result without note or
  terminal content.

### Requirement: Upgrade the workstation to the supported protocol safely

The local development daemon SHALL be upgraded from Herdr v0.8.0/protocol 19
to the exact stable release supported by the current Foundation (initially
v0.8.2/protocol 20). Before upgrade, implementation SHALL record the current
binary version, server/socket status, active session names, bridge command,
static asset directory, and a rollback binary or documented reinstall path.

Herdr's supported live-handoff updater SHOULD be used when available. After
handoff, a newly built protocol-20 Foundation bridge and matching browser assets
SHALL replace the protocol-19 service on port 8787 only after health checks pass
on an alternate port. The old bridge binary/assets SHALL remain available until
the owner accepts the new full-app behavior.

Protocol 19 remains a negative/legacy test fixture; it need not remain running.

#### Scenario: Herdr upgrades but the new bridge fails health checks

- **GIVEN** the protocol-20 daemon is running and the candidate bridge cannot
  pass capabilities/snapshot checks
- **WHEN** cutover evaluation runs
- **THEN** port 8787 is not switched to the failed candidate, diagnostics and
  rollback instructions are reported, and no user data is deleted.

### Requirement: Provide isolated continuous preview and status

Implementation SHALL provide one documented command that starts or reuses a
World development preview with hot reload and prints:

- the user-facing preview URL;
- Foundation bridge URL and version;
- Herdr version, protocol, session/socket profile;
- process IDs and log paths;
- package/commit versions; and
- the command to stop only those preview processes.

The preview SHALL use loopback, collision-checked ports, distinct logs, build
outputs, caches, and state directories. Automated destructive tests SHALL use a
disposable Herdr session/socket. A preview MAY connect to the owner's real
session only through an explicit flag and MUST NOT run terminal-input,
close/delete, migration, or reset tests against it.

The implementation SHALL maintain a machine-readable status record in an
ignored runtime directory and provide a status/doctor command that reports
stale PIDs, port conflicts, version mismatch, health failures, and recent logs.

#### Scenario: Port 8787 is serving the accepted local build

- **GIVEN** an agent starts a new World preview
- **WHEN** the preferred candidate port is unavailable
- **THEN** it selects another loopback port, prints the actual URL, and neither
  kills nor overwrites the process on 8787.

### Requirement: Use explicit visual checkpoints and controlled cutover

The implementation agent SHALL keep the owner informed at these checkpoints:

1. Foundation conformance app running;
2. World running from the packed Foundation dependency;
3. renamed identities and migrated preferences visible; and
4. production-mode candidate ready for port-8787 cutover.

At each checkpoint the agent SHALL provide a URL, expected visible changes,
known differences, and the relevant log/status command. A breakage found by
tests or owner inspection SHALL be recorded with reproduction, affected
Foundation/World versions, disposition, and regression-test status.

Cutover SHALL occur only after health, capability, snapshot, navigation,
terminal attach/input/focus, Office, multi-bridge, and refresh checks pass. The
switch SHALL stop only the identified old bridge, start the reviewed candidate
with the intended state paths, verify port 8787, and retain a one-command
rollback. Herdr daemon restart or data migration shall not be conflated with
the bridge port switch when they can be verified separately.

#### Scenario: The owner finds an Office regression in preview

- **GIVEN** Foundation conformance is healthy but a World interaction differs
- **WHEN** the owner reports it
- **THEN** the old accepted URL remains available until disposition, the issue
  is assigned to the owning repository, and a regression test precedes cutover.

### Requirement: Establish independent and joined CI

Foundation CI SHALL test lint, unit/integration/browser behavior, bridge and
compatibility crates, vendor provenance, conformance build, package contents,
and supported stock Herdr. World CI SHALL test its surfaces/providers/product
against the exact locked Foundation artifact.

A joined compatibility job SHALL test:

```text
World version
Foundation package/bridge version
Foundation surface API
bridge API / web_compat
Herdr version / terminal protocol
artifact integrity hashes
```

Cancellation of superseded CI runs MAY remain enabled. Required checks must
pass on the final reviewed commit; older redundant runs need not finish.

#### Scenario: Foundation publishes a candidate release

- **GIVEN** World still pins the previous exact Foundation version
- **WHEN** Foundation CI passes
- **THEN** World does not change automatically; a dependency-update PR runs the
  joined matrix and records acceptance or incompatibility.

## 7. Migration sequence and gates

Implementation SHALL use this order, with reviewable commits and rollback at
each boundary:

1. **Baseline and inventory:** refresh sources, upgrade/test protocol 20 on a
   candidate, record names/data and behavior.
2. **Surface seam:** implement Spec 011 in the current integration tree without
   removing working code.
3. **Foundation creation:** replay generic concerns from current Herdr Web,
   prove conformance, and pack the exact artifact.
4. **World package cutover:** consume the artifact from a separate checkout and
   pass behavior/bundle tests.
5. **Repository rename and source removal:** rename to `herdr-world`, remove
   duplicate Foundation implementation, and repair current links/automation.
6. **Identity/data migration:** introduce canonical names, aliases, idempotent
   copy/read-through migration, and mobile deferral.
7. **Live product cutover:** run the production-mode candidate, obtain owner
   acceptance, switch 8787, and retain rollback.
8. **Close:** create implementation summaries with exact repositories, commits,
   packages, tests, preview findings, and deviations.

Steps 3–5 may be delivered as coordinated PRs across two repositories, but
World MUST NOT merge deletion of generic source before the referenced
Foundation artifact is immutable and accessible.

## 8. Privacy and security

- Runtime status files and logs MUST NOT record terminal/note content,
  credentials, auth headers, or unredacted environment values.
- Preview binds loopback by default and inherits the bridge's origin/host
  protections.
- Backups and migration copies use owner-only permissions where supported.
- Release and CI jobs MUST NOT depend on the owner's live socket, sessions,
  home-directory paths, or dirty worktree.
- Stop/restart commands resolve exact recorded PIDs and verify executable/port
  ownership; they MUST NOT use broad process-name kills.

## 9. Acceptance evidence

Approval requires review of the repository graph, migration sequence,
operational identity table, and live-preview/cutover policy.

Implementation completion later requires:

- two clean independent repositories and immutable Foundation artifact hashes;
- Foundation conformance and World packaged-consumer tests;
- source/bundle/license/provenance boundary audits;
- exact-version and incompatible-version negative tests;
- idempotent environment/data/browser preference migration tests;
- protocol-20 stock-daemon live evidence and protocol-19 rejection evidence;
- recorded URLs and owner feedback at all four visual checkpoints;
- successful production-mode cutover with status/doctor output; and
- a tested rollback that does not delete or corrupt legacy data.

## 10. Stop conditions

The implementation SHALL pause the affected migration step, while continuing
independent safe work, if:

- the Foundation artifact cannot build World without a source checkout;
- a file cannot be assigned confidently to Foundation or World;
- package/API version mismatch is silently accepted;
- migration would delete or overwrite the only copy of user data;
- the candidate cannot use the supported Herdr protocol;
- a preview script would kill or attach destructively to an unowned process; or
- World source removal would land before its exact Foundation dependency is
  available.
