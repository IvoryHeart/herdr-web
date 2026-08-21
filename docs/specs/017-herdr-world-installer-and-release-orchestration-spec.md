# Herdr World installer and version-locked release orchestration

- **Spec ID:** `017-herdr-world-installer-and-release-orchestration`
- **Status:** In review
- **Created:** 2026-08-21
- **Revised:** 2026-08-21
- **Owner:** Yaswanth Narvaneni / Herdr World
- **Reviewers:** IvoryHeart (repository owner)
- **Approved by:** —
- **Approved at:** —

> This specification turns the separated repositories into one understandable
> end-user installation while retaining exact component ownership and versions.

## 1. Purpose

A user should be able to install and run Herdr World without cloning multiple
repositories, guessing compatible versions, or manually supervising a daemon
and bridge. The distribution should install three explicit layers—Herdr,
Foundation, and World—while making it clear which project owns each layer.

The installer is a Herdr World assembly tool, not a new runtime or a claim that
Herdr/Foundation are one relicensed package.

## 2. Distribution model

The default installation contains:

```text
required: compatible Herdr runtime
required: exact Herdr World Foundation bridge/runtime artifact
required: exact Herdr World UI/product artifact
optional: separately selected Herdr plugins or companions
```

The public command and installation identity is `herdr-world`. The initial
implementation MAY be a repository-owned CLI or script, but its manifest,
verification, lifecycle, and rollback behavior are normative.

## 3. Scope

This feature includes:

- a versioned distribution manifest joining World, Foundation, and Herdr;
- user-local install, verification, doctor, start, stop, status, update,
  rollback, and uninstall behavior;
- optional installation of a compatible Herdr release with explicit consent;
- foreground development and supervised background operation;
- readiness, logs, port selection, data preservation, and failure isolation;
- atomic version activation and rollback;
- complete notices, SBOMs, checksums, and assembly provenance; and
- direct multi-host guidance with optional companions kept optional.

## 4. Non-goals

- No replacement for Herdr's own updater, configuration, sessions, or plugin
  management.
- No automatic system-wide installation, `sudo`, firewall change, non-loopback
  exposure, or remote credential setup.
- No mandatory `herdr-mirror`, central gateway, provider, or optional plugin.
- No installation from mutable branches or unverified arbitrary URLs.
- No promise of every operating system in the first release.
- No deletion of user data during ordinary uninstall or rollback.

## 5. Requirements

### Requirement: Publish one immutable distribution manifest

Each World release SHALL publish a machine-readable manifest containing at
least:

```text
schema_version
world: version, source_commit, artifact_url, artifact_sha256
foundation: version, source_commit
foundation.package: immutable_url, sha256, npm_integrity
foundation.bridge[platform/architecture]: immutable_url, sha256
surface_api_version
bridge_api_version
web_compat
herdr: version, source_commit_or_release, terminal_protocol
herdr.artifact[platform/architecture]: immutable_url, sha256
platform_and_architecture
included_optional_components
license_notice_bundle: immutable_url + sha256, or enclosing_artifact + member_path + member_sha256
sbom: immutable_url + sha256, or enclosing_artifact + member_path + member_sha256
```

Every required layer and release document SHALL have both a locator and a
digest. A member embedded in another verified artifact MAY use its enclosing
artifact locator plus a normalized member path and member digest; a digest
without either an immutable URL or an enclosing-artifact member is invalid.
Every URL SHALL resolve to an immutable release asset. The installer SHALL
verify the enclosing artifact before extraction, reject duplicate/path-
traversing members, verify member digests, and fail closed on missing,
mismatched, or unsupported fields. Lockfiles and component manifests remain
available for source builds.

#### Scenario: A Foundation asset is replaced at its URL

- **GIVEN** its bytes no longer match the World manifest
- **WHEN** installation or update runs
- **THEN** activation stops, the current version remains active, and the error
  identifies the component without executing the unverified file.

### Requirement: Detect and install a compatible Herdr explicitly

The installer SHALL detect the current Herdr binary, daemon version, terminal
protocol, update channel, socket, health, resolved executable path, and install
provenance without reading terminal content. Provenance SHALL distinguish at
least Herdr direct/self-managed, Herdr World-owned isolated, Homebrew, mise,
Nix, and unknown/external management. The installation record and both target
and rollback triples SHALL retain the provenance, absolute selected binary,
manager where applicable, config/socket profile, and which actor owns update,
rollback, and uninstall. A compatible managed installation MAY be reused, but
reuse does not transfer ownership to Herdr World.

If Herdr is absent or an owned direct/isolated installation is incompatible,
an interactive install MAY offer the exact manifest version and explain that
Herdr is an independent Apache-2.0 upstream component.

Interactive installation requires confirmation before downloading, replacing,
or handing off Herdr. Non-interactive installation requires an explicit flag
such as `--install-herdr`; absence of that flag fails with actionable guidance.
The current Herdr self-updater selects the configured channel and accepts
`--handoff`, but does not accept an exact version argument. The installer MAY
invoke it only after fetching and verifying the channel metadata and proving
that the selected version, terminal protocol, platform asset URL, and SHA-256
exactly equal the World distribution manifest. If the channel has advanced,
the metadata cannot be proven, or any field differs, the installer MUST NOT use
the channel updater. For an installer-owned direct/isolated target it SHALL
download and verify the manifest's exact immutable Herdr release asset and use
the documented exact-version install/handoff path.

The installer MUST NOT overwrite, replace, shadow ambiguously, change the
channel of, uninstall, or claim rollback authority over a Homebrew-, mise-,
Nix-, or unknown-manager-owned executable. For an incompatible managed install
it SHALL choose one of two explicit paths:

1. stop with manager-specific update/pin guidance—or a non-mutating
   unknown-owner diagnostic—let the user perform the owner-managed operation,
   and re-detect/re-verify that the resulting exact version, protocol, binary
   path, and artifact identity satisfy the World manifest before continuing;
   or
2. with explicit consent, install the exact manifest asset into a versioned
   Herdr World-owned isolated location and run it by recorded absolute path on
   a separate config/socket profile, leaving the managed binary, PATH, service,
   and sessions untouched.

An isolated install MUST NOT rely on PATH precedence. Status, doctor, update,
rollback, service definitions, and uninstall SHALL address its absolute path
and socket. Removing World may remove only the isolated Herdr versions it owns;
it MUST NOT remove or modify the manager-owned installation.

#### Scenario: Protocol 19 is running but World requires protocol 20

- **GIVEN** a healthy older daemon owns the default socket
- **WHEN** interactive installation runs
- **THEN** it offers the exact supported upgrade, records rollback information,
  performs handoff only after confirmation, and rechecks daemon health before
  activating the Foundation bridge.

#### Scenario: Stable advances for a direct installation

- **GIVEN** World pins Herdr vN, a direct/self-managed installation is selected,
  and the stable channel now selects vN+1
- **WHEN** installation evaluates `herdr update --handoff`
- **THEN** it refuses the channel updater for this assembly and either stops
  with exact-version direct-install guidance or, after explicit consent,
  installs the immutable vN asset as a separate World-owned isolated binary;
  it does not overwrite the selected direct installation.

#### Scenario: A package-manager-owned Herdr is incompatible

- **GIVEN** Homebrew, mise, or Nix owns the selected Herdr binary and its
  version does not satisfy the World manifest
- **WHEN** interactive installation evaluates remediation
- **THEN** it neither overwrites nor shadows that binary; it stops with exact
  manager guidance or, after explicit consent, installs and records an isolated
  World-owned binary/socket and leaves the managed installation untouched.

### Requirement: Install to a user-owned versioned layout

The default installation SHALL require no elevated privileges and SHALL keep
immutable versions separate from mutable configuration/data. Exact paths may
follow platform conventions, with semantics equivalent to:

```text
.../herdr-world/versions/<world-version>/
.../herdr-world/foundation/<foundation-version>/
.../herdr-world/current -> versions/<world-version>
.../herdr-world/config/
.../herdr-world/data/
.../herdr-world/logs/
```

Activation SHALL be atomic. A failed install or update MUST NOT overwrite the
currently active version. At least the previous known-good World/Foundation
pair and its manifest SHALL be retained for rollback.

#### Scenario: Power or build failure occurs before activation

- **GIVEN** the current release is healthy
- **WHEN** staging the next release fails
- **THEN** the active pointer and service command still reference the healthy
  release and incomplete staging is reported as removable.

### Requirement: Provide coherent lifecycle commands

The distribution SHALL provide discoverable semantics equivalent to:

```text
herdr-world install
herdr-world doctor
herdr-world start [--foreground]
herdr-world stop
herdr-world status
herdr-world update
herdr-world rollback
herdr-world uninstall [--purge-data]
```

Exact subcommand spelling MAY differ only if documented before implementation.
Commands SHALL identify the selected Herdr session/socket, Foundation/World
versions, bind address/port, service ownership, readiness, and logs.

`stop` SHALL target only a process recorded and verified as belonging to that
installation. `uninstall` preserves configuration, notes, uploads, preferences,
and rollback metadata by default; data removal requires a separate explicit
`--purge-data` confirmation.

#### Scenario: Another application owns the configured port

- **GIVEN** the recorded World service is stopped and an unrelated process owns
  the port
- **WHEN** `herdr-world stop` runs
- **THEN** it refuses to signal the unrelated PID and reports the ownership
  mismatch.

### Requirement: Supervise components without coupling their failure domains

Background operation SHALL use an available user-level service manager or a
documented repository-owned supervisor with equivalent PID, readiness, log,
restart/backoff, and shutdown behavior. Foreground mode SHALL remain available
for development and diagnosis.

Herdr, Foundation bridge, World UI, and optional companions retain separate
health states. A failed optional provider/plugin MUST NOT restart Herdr or make
shell + Spaces unavailable. A bridge failure MAY restart that exact bridge with
bounded backoff but MUST NOT kill an unrelated daemon/session.

#### Scenario: An optional provider repeatedly crashes

- **GIVEN** Herdr, Foundation, and World are healthy
- **WHEN** the provider exceeds its restart budget
- **THEN** status reports that optional feature degraded, stops retrying until
  the documented reset/update event, and leaves core World usable.

### Requirement: Default to local, direct multi-host operation

World SHALL bind loopback by default. Non-loopback bind, allowed host/origin,
TLS/reverse proxy, and upload exposure require explicit configuration and
warnings. The installer MUST NOT modify a firewall or SSH configuration.

For multiple hosts, documentation SHALL default to one compatible bridge per
host and Foundation's existing direct browser profiles with qualified host
identity. SSH forwarding MAY be documented. `herdr-mirror` or another companion
MAY be selected explicitly but MUST NOT be installed or required by default.

#### Scenario: A user adds a second machine

- **GIVEN** both machines run compatible bridges
- **WHEN** the second URL is added to World settings
- **THEN** the browser connects directly using existing multi-bridge behavior,
  and installation does not introduce a central coordinator.

### Requirement: Make doctor safe and actionable

`doctor` SHALL perform read-only checks for:

- manifest and artifact integrity;
- Herdr binary/daemon version, protocol, socket, and health;
- Herdr executable realpath, install provenance, owning manager, selected
  update/rollback actor, and ambiguous PATH shadowing;
- Foundation bridge/API/`web_compat` and package version;
- World/Foundation exact compatibility;
- port ownership and loopback exposure;
- required files, permissions, licenses/notices, and free space;
- service/PID/status-record consistency; and
- recent redacted error summaries.

It SHALL distinguish `healthy`, `degraded optional`, `action required`, and
`unsafe/incompatible`. It MUST NOT attach to terminal streams, run commands,
change configuration, migrate data, or restart processes unless the user
invokes a separate repair action.

#### Scenario: World and Foundation versions do not match

- **GIVEN** files from two releases were manually combined
- **WHEN** doctor runs
- **THEN** it reports the exact expected/observed versions and hashes, marks the
  installation incompatible, and recommends activation of a known manifest.

### Requirement: Update and rollback the assembly as one tested unit

Update SHALL download and verify a complete World manifest into staging, run
static compatibility checks, and optionally run an isolated smoke test before
activation. Foundation and World MUST NOT be updated independently behind the
active manifest.

Preflight SHALL calculate both the target triple and rollback triple:

```text
Herdr daemon/version/protocol/install provenance/absolute binary/socket profile
Foundation package + bridge/API/web_compat
World product + surface API
```

If Herdr does not change, or the previous World/Foundation pair explicitly
supports the target daemon, ordinary atomic World/Foundation activation and
rollback are permitted. If Herdr's terminal protocol changes and the previous
pair does not support the target daemon, the preferred flow SHALL run the exact
target triple on a parallel candidate socket/ports and leave the live triple
unchanged until acceptance.

Any flow that changes the live daemon before final acceptance SHALL include an
exact verified previous Herdr artifact and a confirmed method to restore the
complete compatible rollback triple. If downgrade requires a daemon restart or
cannot preserve pane processes, that consequence requires explicit confirmation
before activation. Without either previous-pair compatibility or confirmed
full-triple rollback, update MUST leave the live daemon unchanged.

Automated Herdr replacement/rollback applies only to a direct or isolated
binary explicitly owned by the installation record. A package-manager-owned
daemon remains controlled by that manager: World MAY verify it and provide the
recorded manager command, but MUST NOT mutate it. If a managed daemon change is
needed and the previous Foundation/World pair would be incompatible afterward,
World SHALL keep the managed live triple unchanged and use the isolated target
path above until the user completes and confirms a manager-owned transition
whose compatible rollback path has also been recorded.

After activation, readiness and smoke checks SHALL cover capabilities,
snapshot, navigation, terminal attach/input/focus, Office, refresh, and a
configured multi-bridge path when available. Failure automatically reactivates
the preflight-approved compatible rollback triple. It MUST NOT reactivate a
protocol-incompatible previous bridge and then report Herdr rollback as an
unresolved user choice.

#### Scenario: New World starts but Office fails its smoke check

- **GIVEN** the previous assembly is retained
- **WHEN** post-activation acceptance fails
- **THEN** the service rolls back to the previous exact compatible triple,
  verifies health, and preserves logs for the failed version without deleting
  user data.

#### Scenario: A protocol-bump activation fails

- **GIVEN** the target triple uses protocol 20, the live rollback triple uses
  protocol 19, and the old Foundation bridge rejects protocol 20
- **WHEN** target acceptance fails after the live daemon changed
- **THEN** rollback restores the verified protocol-19 Herdr daemon together
  with its previous Foundation/World pair and reports any pre-approved restart
  consequence; it never starts the protocol-19 bridge against protocol 20.

### Requirement: Ship complete source and notice material

Installer artifacts SHALL include or link immutably to corresponding source,
component and assembly manifests, licenses/notices, SBOMs, and checksums as
required by Spec 004. Installed offline notices SHALL identify Herdr, Herdr Web
lineage in Foundation, Foundation, World, and redistributed code/art/fonts.

Source-only prereleases MAY defer executable signing. Stable public binaries
require an explicitly approved signing policy; the installer SHALL clearly
report unsigned artifacts and MUST NOT imply signatures exist.

#### Scenario: Installation completes without network access afterward

- **GIVEN** the release assets were verified during installation
- **WHEN** the user opens local notices and version information offline
- **THEN** all installed components, source revisions, licenses, versions, and
  hashes are inspectable without contacting a mutable website.

## 6. Privacy and security

- Downloads use HTTPS and immutable URLs plus hash verification; TLS alone is
  not artifact identity.
- No command logs provider credentials, tokens, terminal/note content, or full
  sensitive environment values.
- Config/data/backups use user-only permissions where supported.
- No install/update hook executes code from an optional plugin/provider before
  its package, license, permissions, and checksum are accepted.
- Remote exposure remains opt-in and must surface the bridge's authentication
  and origin-policy limitations.

## 7. Acceptance evidence

Approval requires review of the three-component manifest, user-local layout,
explicit Herdr update, direct multi-host default, and rollback model.

Implementation completion later requires:

- clean installation with no pre-existing Herdr;
- reuse of an already-compatible Herdr installation;
- compatible and incompatible direct, Homebrew, mise, Nix, and unknown-manager
  installation fixtures, including manager guidance, re-verification, and no
  overwrite/PATH-shadow/uninstall tests;
- explicit isolated World-owned Herdr install, absolute-path service,
  independent socket, rollback, and uninstall tests;
- protocol-19-to-20 parallel-candidate/handoff with complete compatible-triple
  rollback evidence;
- a stable-channel-advanced test proving the exact pinned Herdr artifact is
  selected instead of the newer channel target;
- checksum/manifest mismatch negative tests;
- missing-locator, embedded-member traversal/duplication, and member-digest
  negative tests;
- occupied-port and unrelated-PID safety tests;
- user service and foreground-mode acceptance;
- optional-component failure-isolation tests;
- atomic update failure and successful rollback tests;
- uninstall preservation and explicit purge tests; and
- offline license/notice/SBOM/source-manifest inspection.

## 8. Deferred decisions

- Registry/package-manager distribution beyond release assets.
- System-wide and managed enterprise installation.
- Windows service and mobile-store distribution.
- Automatic signing/key rotation infrastructure.
- A bundled optional plugin/provider catalogue.
