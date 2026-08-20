# Herdr World open-source packaging and upstream contribution boundaries

- **Spec ID:** `004-world-packaging-and-upstream-boundaries`
- **Status:** Draft
- **Created:** 2026-08-10
- **Revised:** 2026-08-20
- **Owner:** Herdr World downstream project
- **Reviewers:** IvoryHeart (repository owner)
- **Approved by:** —
- **Approved at:** —

> This revision replaces the earlier private-package framing with an explicit
> open-source distribution and upstream-contribution contract. It does not
> authorize a release, repository rename, or upstream pull request until the
> applicable decisions and gates below are approved.

## 1. Purpose

Herdr World is a downstream distribution built from Herdr Web, optional World
browser surfaces such as Office, provider adapters, and optional Herdr plugins.
The repository must remain easy to synchronize with both upstream projects,
must let generic fixes travel upstream without World branding or product code,
and must be legally and operationally complete enough for other people to
build, inspect, modify, and redistribute.

This specification defines the product boundaries, source layout, dependency
direction, contribution lanes, attribution obligations, and public-release
gates. It deliberately treats Herdr, Herdr Web, Herdr plugins, browser
surfaces, and provider adapters as different extension mechanisms rather than
placing them behind a new generic registry.

## 2. Architectural ownership

The following ownership model is normative:

| Layer | Owner and source of truth | Herdr World relationship |
| --- | --- | --- |
| Runtime/session semantics, CLI/socket API, terminal session streams, plugin manifests/actions/hooks/panes | [`herdrdev/herdr`](https://github.com/herdrdev/herdr) | Consume the public API; propose neutral runtime gaps through the upstream process. |
| Browser bridge, multi-bridge profiles, terminal transport, `/api/capabilities`, Spaces, and generic browser shell behavior | [`kcosr/herdr-web`](https://github.com/kcosr/herdr-web) | Preserve ancestry; reconstruct focused generic changes on current upstream. |
| World assembly, Office/Graph/City browser projections, World branding/art, provider adapters, and release packaging | Herdr World | Downstream-owned and openly released from this repository. |
| Optional reusable runtime workflows or companion processes | Independently installable Herdr plugins | Use `herdr-plugin.toml` and public CLI/socket/session APIs; do not redefine the plugin manifest. |

Herdr World and Herdr Web are applications/distributions, not Herdr plugins.
A World release MAY include or recommend separately installable Herdr plugins,
but MUST NOT describe the whole web application or a browser projection as a
plugin while Herdr plugin v1 has no native non-terminal UI contract.

## 3. Scope

This feature includes:

- an upstream-preserving repository and branch strategy;
- logical and physical boundaries for upstream-aligned code, downstream
  surfaces, contracts, providers, optional plugins, and packaging;
- a reuse-before-create decision rule for every new integration;
- independent build/test evidence for generic Web and assembled World output;
- a clean-checkout, reproducible release assembly with immutable component
  provenance and artifact hashes;
- complete source, art, dependency, license, notice, and modification records;
- public contributor, security-reporting, support, and governance documents;
- a documented process for focused proposals to each upstream; and
- a downstream fallback when an upstream proposal is declined or deferred.

The target logical layout is:

```text
bridge/                       upstream-aligned Herdr Web bridge
web/                          upstream-aligned Herdr Web application/core
vendor/herdr-compat/          narrowly vendored, traced compatibility source
world/
  contracts/                  canonical downstream cross-language contracts
  providers/                  optional provider adapters
  web/                        Office and future compiled-in World surfaces
  plugins/                    optional, independently installable Herdr plugins
  packaging/                  assembly, provenance, notices, SBOM and release
third_party/                  redistributed licenses/notices not kept upstream
```

The exact package-manager workspace layout MAY be selected during
implementation. Existing `web/src/world`, `contracts`, provider, and packaging
paths MAY migrate incrementally, but the final dependency and release audits
MUST prove the boundaries even if some paths have not moved yet. Upstream-
aligned directories SHOULD retain upstream file paths where that materially
reduces synchronization conflicts.

## 4. Non-goals

- No central multi-server gateway, SSH credential manager, or duplicate bridge
  coordinator. Herdr Web's existing `BridgeManager` remains authoritative.
- No dynamic browser plugin loader, marketplace, or execution sandbox.
- No replacement for Herdr's plugin registry, manifests, CLI, or socket API.
- No claim that all World code is suitable for either upstream.
- No requirement to publish to npm, crates.io, or a Herdr plugin marketplace in
  the first release; source and release artifacts are in scope.
- No legal conclusion that a dependency or asset is redistributable merely
  because it is publicly accessible. The recorded license and notice determine
  the release gate.
- No Graph, City, new telemetry provider, or new browser extension behavior.

## 5. Requirements

### Requirement: Preserve upstream ancestry and product identity

The repository SHALL preserve auditable Git ancestry to Herdr Web, a named
`upstream` remote, and a dated synchronization baseline. The public product
SHALL identify itself as Herdr World and SHALL identify Herdr and Herdr Web as
independent upstream projects without implying sponsorship or endorsement.

The downstream repository MAY be renamed to `herdr-world` after the repository
owner approves its legal name, package namespaces, artifact names, and legacy
aliases. A rename MUST preserve history and documented upstream remotes.

#### Scenario: A user inspects the source relationship

- **GIVEN** a clean public checkout
- **WHEN** the user reads its provenance and repository documentation
- **THEN** they can identify the Herdr Web baseline, current downstream delta,
  upstream URLs, licenses, and Herdr World-owned components without relying on
  an undocumented sibling checkout.

### Requirement: Enforce reuse before creating an extension

Every proposed integration SHALL be classified in this order:

1. use a public Herdr CLI/socket/session API and, for executable workflows, a
   Herdr plugin;
2. use Herdr Web's existing bridge runtime and `/api/capabilities` for browser
   transport and compatibility;
3. use the trusted compiled-in surface assembly for browser presentation; or
4. introduce a downstream provider/contract only after documenting the
   semantic or historical-data gap in the first three mechanisms.

A change record MUST state the chosen mechanism and why an earlier mechanism
is insufficient. It MUST NOT add a second plugin registry, bridge-profile
owner, capability endpoint, or terminal-session abstraction for a use case
already covered by an upstream public contract.

#### Scenario: A contributor proposes an activity integration

- **GIVEN** Herdr already exposes the required agent state or event through its
  public API
- **WHEN** the proposal is classified
- **THEN** it consumes that API directly or through a Herdr plugin and does not
  add a provider-specific browser discovery registry.

### Requirement: Keep package ownership and dependencies explicit

Every logical package SHALL document its owner, public inputs, public outputs,
network and secret boundary, test command, version policy, and upstream target
or `downstream-only` status.

Dependencies SHALL flow in the following direction:

```text
Herdr public API / Herdr Web core
              ↓
downstream contracts → provider adapters
              ↓              ↓
        compiled World surfaces
              ↓
       World release assembly
```

Contracts MUST NOT import bridge, provider, projection, or packaging code.
World surfaces MUST NOT own bridge profiles, raw Herdr sockets, provider
credentials, or release assembly. Optional plugins MUST remain installable and
testable without importing the browser application.

#### Scenario: Office consumes historical metrics

- **GIVEN** historical metrics are not available from the public Herdr API
- **WHEN** Office renders them
- **THEN** the data crosses a canonical downstream contract from an optional
  provider adapter, while credentials and backend configuration stay outside
  the browser surface.

### Requirement: Make generic and World assemblies mechanically separate

The repository SHALL provide a repeatable generic Herdr Web build and an
assembled Herdr World build. The generic build MUST exclude World surfaces,
World art, provider implementations, downstream contracts, and World branding.
The World build SHALL select downstream components through an explicit
assembly entry or manifest rather than registering them in generic core source.

The proof MUST inspect the final dependency graph or emitted bundle contents;
source keyword scans alone are insufficient.

#### Scenario: World sources are unavailable

- **GIVEN** World packages and assets are disabled or absent
- **WHEN** the generic build and smoke tests run
- **THEN** the upstream-aligned shell and Spaces build and run without a World
  import, provider adapter, or World asset in the output.

### Requirement: Keep upstream contribution units reconstructable

An upstream contribution SHALL be created on a dedicated branch or worktree
from the current target upstream head, not by opening a pull request from the
downstream integration branch. It SHALL contain one generic concern, its tests,
the minimum documentation, and required changelog entry. It MUST exclude World
branding, Office art and behavior, provider-specific contracts, downstream
release files, and unrelated downstream history.

Before work begins:

- a larger Herdr Web feature, new product area, or architectural change MUST
  first be discussed in a focused Herdr Web issue;
- a Herdr product/API proposal MUST use GitHub Discussions unless it is a
  personally reproduced bug suitable for the bug template; and
- no Herdr implementation pull request may be opened unless the authenticated
  account is a maintainer or appears in Herdr's current
  `.github/APPROVED_CONTRIBUTORS` list.

The assembly manifest SHALL record each candidate as `not-proposed`,
`discussion`, `proposed`, `accepted`, `declined`, `superseded`, or
`downstream-only` with the upstream URL when one exists.

#### Scenario: A generic bridge fix is ready

- **GIVEN** the fix is currently present inside Herdr World
- **WHEN** it is prepared for Herdr Web
- **THEN** it is reproduced on current `kcosr/herdr-web` main as one focused
  change and can be reviewed without installing or understanding World.

### Requirement: Preserve source and generated-code provenance

Every vendored or adapted source set SHALL record the source repository,
immutable revision, source paths, selected files, license identifier, copyright
notice, local modifications, refresh procedure, and content hashes. Generated
files SHALL also identify their generator and canonical input.

The build MUST NOT require an undeclared external checkout or fetch mutable
source. Vendored Herdr compatibility code MUST remain the smallest reviewed
wire/API slice required by the bridge and MUST have drift and protocol tests.

#### Scenario: The Herdr compatibility layer is refreshed

- **GIVEN** a new supported Herdr release changes the protocol
- **WHEN** compatibility source is updated
- **THEN** its exact tag and commit, copied files, license, protocol delta,
  local adaptations, and verification are reviewable independently from
  Office and provider changes.

### Requirement: Make art and design provenance unambiguous

The provenance manifest SHALL distinguish byte-for-byte copied assets,
modified assets, adapted source, generated assets, and non-copied design
references. It MUST NOT attribute a file to Pixel Agents, Claw-Empire, PixiJS,
or another project merely because the file is visually related.

The current character sprites are byte-identical to tracked Claw-Empire files
at the recorded Apache-2.0 revision and MUST retain that license, copyright
attribution, and any upstream NOTICE. The TypeScript geometry/renderer files
were adapted from separately hashed historical JavaScript files that were
untracked in the reference checkout. Their release entry MUST therefore include
immutable, reviewable evidence that identifies those exact source hashes,
copyright holder, Apache-2.0 grant or other permission, and the prominent
modified-file notices; the tracked sprite provenance alone does not prove the
adapted source's status.

Pixel Agents is a separately reviewed MIT project and possible design
reference; its license MUST NOT be listed as the license for a distributed
World file unless a file-level audit proves that relationship. Replacing the
art does not remove obligations for any previously distributed adapted source
or asset.

#### Scenario: A character asset is replaced

- **GIVEN** a new original or third-party sprite replaces a current sprite
- **WHEN** a release is assembled
- **THEN** the manifest records the new file's origin and rights, omits the old
  file from the artifact, and retains notices only where still required by
  distributed or adapted material.

### Requirement: Ship complete open-source compliance material

Every public source or binary release SHALL include, as applicable:

- the project license and approved copyright-holder statement;
- upstream Herdr Web MIT and Herdr/vendored Apache-2.0 notices;
- third-party license texts and notices for npm, Cargo, fonts, art, and other
  redistributed material;
- prominent modification notices for Apache-2.0-derived files;
- a machine-readable source/art provenance manifest;
- browser, bridge, and packaged-artifact SBOMs using a documented SPDX or
  CycloneDX version;
- the exact source revision, component revisions, build-tool versions,
  checksums, and generated assembly manifest; and
- an offline location inside each artifact where licenses and notices can be
  inspected.

A release check SHALL fail closed on missing or unresolved fields. License
scanners MAY assist but MUST NOT silently decide ambiguous ownership,
trademark, or asset provenance.

#### Scenario: A dependency lacks resolved licensing metadata

- **GIVEN** an npm, Cargo, font, or art item would enter a public artifact
- **WHEN** the compliance gate cannot resolve its license or required notice
- **THEN** packaging fails and identifies the exact component instead of
  producing a partially attributed release.

### Requirement: Publish contributor and security boundaries

Before public release, the repository SHALL contain contributor documentation
that explains the spec workflow, development setup, test commands, source
boundaries, sign-off/CLA decision, and the separate Herdr, Herdr Web, and World
contribution lanes. It SHALL also contain a security policy with a private
reporting path, supported-version policy, response expectations, and an
explicit statement that plugins and provider adapters execute with their
documented local privileges.

The repository SHALL record the selected code of conduct and governance model,
including who can approve specs and releases. Templates MUST NOT encourage
contributors to bypass either upstream's contribution policy.

#### Scenario: A contributor finds a runtime API gap

- **GIVEN** the gap belongs to Herdr rather than World
- **WHEN** the contributor reads the contribution guide
- **THEN** they are directed to the allowed Herdr Discussion or bug-report
  route and are not instructed to open an unauthorized implementation PR.

### Requirement: Keep releases reproducible and traceable

Every release assembly SHALL use immutable or content-addressed inputs and
produce a machine-readable manifest with at least:

```text
schema_version
product_id
release_version
source_repository
source_revision
dirty_state
build_environment
components[]:
  component_id
  role
  source_repository
  source_revision
  upstream_target
  upstream_status
  license_expression
  content_sha256
  generated_from
artifacts[]:
  artifact_id
  path
  media_type
  content_sha256
  sbom_path
```

Release commands SHALL work from a clean checkout without absolute workstation
paths, undeclared sibling repositories, browser-local state, or provider
credentials. The release process SHALL produce a source archive and checksums,
and SHALL document verification and rollback procedures.

#### Scenario: A downstream component was declined upstream

- **GIVEN** a component remains useful to World after an upstream decline
- **WHEN** a World release is built
- **THEN** it is included only through the downstream assembly and recorded as
  `declined` or `downstream-only`, with no implication that upstream ships it.

### Requirement: Keep optional components failure-isolated

The absence, incompatibility, or failure of an optional provider, plugin, or
World surface MUST NOT prevent the generic Herdr Web build or supported core
operation. Optional component health SHALL be bounded and MUST NOT expose
credentials, backend URLs, terminal content, prompts, or raw provider errors
to unrelated components.

#### Scenario: No observability provider is configured

- **GIVEN** a user starts Herdr World without an external telemetry backend
- **WHEN** the shell and Office load
- **THEN** core Herdr operation remains available and only the optional
  observability feature reports a bounded unavailable or degraded state.

## 6. Privacy and security

- Provider credentials, SSH keys, tokens, backend URLs, prompts, terminal
  output, and environment variables MUST NOT enter public fixtures, browser
  bundles, provenance manifests, or SBOM metadata.
- Browser surfaces MUST NOT receive raw Herdr sockets or provider configuration
  through the supported composition API.
- Herdr plugins are trusted local executables, not sandboxed web extensions;
  their installation and privilege model MUST be stated accurately.
- Release automation MUST use least-privilege credentials, pin third-party
  actions by immutable revision, and keep signing/publishing authority separate
  from ordinary pull-request checks.
- A public release MUST NOT be described as secure merely because it binds to
  loopback by default; supported remote-access and origin policies remain
  explicit operational decisions.

## 7. Acceptance evidence

Approval-to-implementation evidence SHALL include:

- a checked-in ownership/dependency/contribution matrix;
- generic Web and World build commands with final bundle/dependency audits;
- a clean-checkout test and package run;
- canonical contract fixture and cross-language drift checks;
- a vendoring/protocol provenance check;
- a machine-readable source/art provenance manifest and validation tests;
- complete offline license/notice output, including modified-file evidence;
- browser, bridge, and assembled-artifact SBOMs;
- an assembly manifest containing immutable revisions and artifact hashes;
- `CONTRIBUTING.md`, `SECURITY.md`, governance/code-of-conduct decisions, and
  an explicit upstream contribution guide;
- a dry-run reconstruction of at least one generic change from current Herdr
  Web upstream without World content; and
- a release dry run that fails for deliberately missing license, notice,
  provenance, or compatibility data.

## 8. Release blockers and deferred decisions

The following are release blockers, not optional polish:

- the downstream legal copyright holder and project license are unresolved;
- Herdr World name, logos, package identifiers, or descriptions could imply
  upstream ownership or endorsement;
- source or art provenance, required licenses, notices, or modification records
  are incomplete;
- supported Herdr/Herdr Web versions and protocol compatibility are untested;
- generic and World outputs cannot be built and audited independently;
- contributor/security/governance paths are absent; or
- reproducible source, checksums, SBOMs, and an assembly manifest are absent.

The following MAY remain deferred after this specification is implemented:

- npm, crates.io, mobile-store, or Herdr marketplace publication;
- independent package versioning versus one World release version;
- physical repository splits for providers, plugins, Graph, or City;
- artifact signing or provenance services beyond checksums for the first
  source-only pre-release, if the release is clearly labeled and the decision
  is documented; and
- dynamic or untrusted browser extensions, which require a separate threat
  model and approved specification.
