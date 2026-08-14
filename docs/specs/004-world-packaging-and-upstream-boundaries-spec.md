# World packaging and upstream contribution boundaries

- **Spec ID:** `004-world-packaging-and-upstream-boundaries`
- **Status:** Draft
- **Created:** 2026-08-10
- **Owner:** Herdr Office downstream project
- **Reviewers:** IvoryHeart (repository owner)
- **Approved by:** —
- **Approved at:** —

> This draft defines how the downstream World family is organized while
> preserving small, reviewable upstream contribution units. It does not
> authorize upstream PRs or a repository rename until approved.

## 1. Purpose

The downstream project now contains Herdr Web integration, the `herdr-world`
runtime,
and planned Office, Graph, City, observability, and packaging work. These
components need to evolve together locally without becoming a monolith that
cannot be proposed upstream in understandable pieces.

This specification defines the source boundaries, dependency direction,
ownership metadata, test boundaries, and contribution units for the World
family. The product umbrella is `herdr-world`; Office, Graph, and City are
projections over shared Herdr state. The current repository and package paths
may continue using `herdr-web` during migration, but all assembled components
belong to the `herdr-world` product.

The specification is intentionally a boundary and release-readiness contract,
not a request to move every current file immediately. Physical extraction is
allowed only after the interfaces and acceptance evidence below exist.

## 2. Scope

This feature includes:

- a documented mono-repo package map for contracts, Herdr Web transport,
  provider adapters, projections, and distribution;
- one-way dependency rules that keep contracts independent of providers,
  Herdr Web, and visual projections;
- explicit upstream contribution units and ownership for each boundary;
- package-local validation plus a root acceptance gate for the assembled
  downstream product;
- source provenance rules for the Herdr compatibility layer and external
  upstream references;
- a downstream assembly model that pins or selects components without copying
  their source into multiple packages; and
- a release manifest that records product identity, component revisions,
  generated inputs, and artifact contents for every assembled build;
- a migration path that allows a package to remain downstream-only if an
  upstream proposal is declined.

The initial source map is:

```text
contracts/observability/  language-neutral schema, fixtures, compatibility rules
bridge/                   downstream Herdr client and browser transport
providers/                OTEL/backend/project-specific adapters
projections/office/       Office presentation and interaction
projections/graph/        future Graph presentation
projections/city/         future City presentation
packaging/                pinned component assembly and release tooling
```

Existing repository paths MAY be migrated toward this map incrementally. The
boundary and dependency rules apply before physical extraction is complete.

The transition ownership map is:

| Boundary | Current implementation | Boundary owner | Intended upstream status |
| --- | --- | --- | --- |
| Herdr Web core and browser runtime | `web/src/`, `bridge/src/web_bridge.rs` | Herdr Web core maintainers | upstream candidate where generic |
| Herdr compatibility | `vendor/herdr-compat/` | Herdr Web downstream compatibility owner | upstream-aligned compatibility slice |
| Provider-neutral contracts | `contracts/observability/` | Herdr World contracts owner | separate contract proposal |
| Provider transport and adapters | `bridge/src/observability*.rs` | Herdr World provider owner | downstream until a generic target is accepted |
| World projections | `web/src/world/` and Office assets | Herdr World projection owner | downstream |
| Assembly and release artifacts | `scripts/`, `packaging/` when extracted | Herdr World release owner | downstream |

Each row is a temporary ownership assignment until the corresponding package
is physically extracted. A change that crosses rows MUST identify each
affected contribution unit in its change record.

## 3. Non-goals

- No upstream PR is required by this specification.
- No immediate move of the complete Herdr source tree into this repository.
- No public npm, Rust, plugin, or marketplace publication requirement.
- No immediate physical repository rename or package extraction; the chosen
  product umbrella is `herdr-world`.
- No multi-server gateway, SSH credential manager, or remote discovery system.
- No new OTEL provider implementation or Office observability board behavior;
  the existing downstream implementation remains governed by the separate
  observability provider/projection specification.
- No requirement that every package be independently versioned or released
  before the versioning policy is approved.

## 4. Context and constraints

Herdr Server and the upstream Herdr Web project have separate ownership. This
repository must remain useful as a downstream product even when an upstream
proposal is not accepted. The current bridge deliberately keeps a minimal,
auditable Herdr compatibility layer rather than vendoring the complete Herdr
source tree.

The World runtime may consume shared Herdr topology, but a projection MUST NOT
become the owner of provider credentials, bridge protocol details, or raw
telemetry access. The existing observability contract is the boundary for
optional data; the packaging design must preserve its independence.

The current release is a private assembled `herdr-web` runtime. The packaging
boundary should support a future `herdr-world` release without requiring all
upstream projects to adopt the same repository layout or release cadence.

## 5. Requirements

### Requirement: Define package ownership

Each package boundary SHALL have one documented owner, public input boundary,
output boundary, test command, and upstream target or an explicit
downstream-only designation.

#### Scenario: A new provider is added

- **GIVEN** a provider needs OTEL or backend-specific access
- **WHEN** it is added to the mono-repo
- **THEN** its credentials, backend client, configuration, and tests remain in
  the provider package and its World-facing output crosses the shared
  observability contract.

### Requirement: Enforce dependency direction

Dependencies SHALL flow from stable contracts toward adapters and projections:

```text
contracts → bridge/provider adapters → projections → packaging
```

Contracts MUST NOT import Herdr Web, provider, backend, or projection code.
Projections MUST NOT connect directly to Herdr Server, OTEL infrastructure, or
provider backends.

#### Scenario: Office renders optional telemetry

- **GIVEN** Office needs an observability value
- **WHEN** it requests that value
- **THEN** it consumes the validated contract through the bridge/provider
  boundary and does not know whether the source is an adapter or Herdr Server.

### Requirement: Keep contribution units separable

The repository SHALL identify independent contribution units for:

1. language-neutral contracts and fixtures;
2. generic Herdr Web capability admission and transport;
3. provider adapters;
4. World projections; and
5. downstream packaging and release assembly.

Each unit MUST be testable without copying unrelated package source into an
upstream proposal.

#### Scenario: An upstream accepts only the contract

- **GIVEN** an upstream accepts the contract and fixtures but declines the
  bridge or projection changes
- **WHEN** the downstream release is assembled
- **THEN** the downstream provider and projection remain usable against the
  accepted contract without duplicating or rewriting the contract.

### Requirement: Preserve provenance and compatibility

External source references, compatibility crates, generated artifacts, and
downstream patches SHALL declare their provenance, refresh procedure, and
compatibility baseline. The repository MUST NOT depend on an undeclared
external checkout at build time.

#### Scenario: Herdr changes its protocol

- **GIVEN** an upstream Herdr protocol or API changes
- **WHEN** the compatibility layer is refreshed
- **THEN** the baseline, compatibility tests, and any downstream adaptation
  are reviewable independently of projection changes.

### Requirement: Make the repository independent of legacy workspaces

The assembled product, its tests, and its active operator documentation SHALL
work from a clean `herdr-web` checkout without an undeclared sibling checkout,
absolute workstation path, or legacy project name. Historical provenance MAY
refer to an earlier workspace, but it MUST be marked as historical and MUST
NOT be an operational instruction or build input.

#### Scenario: A new agent starts from the repository root

- **GIVEN** only this repository and its declared package/build prerequisites
  are available
- **WHEN** the agent runs the documented startup, test, and packaging commands
- **THEN** the commands do not require a legacy observability workspace or
  another undeclared source tree.

### Requirement: Separate stable identity from local configuration identity

The assembled product SHALL distinguish the product namespace, package and
artifact identifiers, upstream compatibility baseline, provider/source
instance identity, browser-local bridge profile identity, and boot/generation
identity. A browser-local storage key MUST NOT be used as a provider or
artifact identity.

Routes and persisted keys that change during a namespace migration SHALL have
an idempotent compatibility migration. The migration MUST preserve existing
hosts, Office settings, and completion state, and MUST be covered by a test.

### Requirement: Define a core-only proof

The repository SHALL provide a repeatable core-only build and dependency audit
that succeeds without World projections, Office assets, observability provider
implementations, or provider-specific bridge modules. The proof MUST inspect
the compiled dependency graph or final bundle contents in addition to source
keyword scans.

#### Scenario: The Office package is unavailable

- **GIVEN** the downstream Office projection and provider packages are absent
  or disabled
- **WHEN** the core-only build and test gate runs
- **THEN** Herdr Web core builds, serves Spaces, and passes its core checks
  without importing or bundling World code.

### Requirement: Keep contract representations synchronized

Each cross-language contract SHALL name one canonical representation. The
repository MUST validate positive and negative fixtures against that source,
exercise Rust and TypeScript decoding against the same fixtures, compare
declared versions and limits, and fail when checked-in generated
representations differ from the canonical source.

Provider/source identity and display labels SHALL be separate fields in the
contract or its surrounding provider descriptor. The contract MUST NOT infer
identity from browser storage or credentials.

### Requirement: Keep optional packages non-blocking

The absence or failure of an optional provider or projection SHALL NOT prevent
the core Herdr Web bridge and existing Spaces/Office operation from building
or running.

#### Scenario: Provider dependencies are unavailable

- **GIVEN** no provider package is configured or its backend is offline
- **WHEN** the assembled World product starts
- **THEN** core Herdr Web operation remains available and the optional package
  reports its bounded unavailable/degraded state.

### Requirement: Define downstream assembly

The packaging boundary SHALL select compatible component versions or commits,
run the required package-local checks, and produce one traceable assembled
release. The assembly MUST record the source revision of each component and
MUST NOT silently include unreviewed source copies.

#### Scenario: A projection is downstream-only

- **GIVEN** Graph or City is not accepted upstream
- **WHEN** a World release is assembled
- **THEN** it can include the projection through the downstream assembly
  manifest without changing the contract or Herdr Web upstream units.

### Requirement: Make assembly traceable

Every assembled build SHALL produce a machine-readable manifest with this
minimum shape:

```text
schema_version
product_id
release_id
source_revision
components[]:
  component_id
  role
  source_repository
  source_revision
  upstream_target
  upstream_status
  content_sha256
  generated_from
artifacts[]:
  artifact_id
  path
  content_sha256
```

The manifest MUST use immutable revisions or content-addressed inputs. Build
scripts MUST NOT fetch arbitrary source at build time. A release check SHALL
fail when a selected component lacks a revision, provenance status, or final
artifact hash.

#### Scenario: A contribution is declined upstream

- **GIVEN** an upstream proposal is declined or deferred
- **WHEN** the downstream assembly is rebuilt
- **THEN** the component remains explicitly marked `downstream-only` in the
  manifest and is not silently copied into an upstream contribution branch.

## 6. Data and interface contract

Every package boundary SHALL document:

```text
package_id             stable local identifier
owner                  responsible project or maintainer
inputs                 contracts, APIs, or assets consumed
outputs                APIs, schemas, assets, or binaries produced
upstream_target        repository and intended contribution unit, if any
version_policy         compatibility and release relationship
test_command           package-local validation command
security_boundary      credentials, network, and data ownership
```

The assembly manifest SHALL reference immutable commits, release tags, or
equivalent content-addressed revisions. Runtime payload contracts remain
owned by their contract package; packaging metadata MUST NOT redefine them.

## 7. Privacy and security

- Provider credentials, SSH keys, backend URLs, and connection strings MUST
  remain outside contract fixtures, browser bundles, and projection assets.
- Package metadata MUST identify whether a component makes network requests or
  handles sensitive data.
- Build and packaging scripts MUST NOT fetch arbitrary source at build time.
- Upstream compatibility code MUST be limited to the reviewed surface needed by
  the bridge and MUST retain its source/license provenance.
- A downstream-only package MUST NOT gain permission to mutate Herdr state
  merely by being included in the assembled release.

## 8. Acceptance evidence

Acceptance SHALL include:

- a package ownership/dependency map checked into `docs/`;
- a contribution matrix mapping each package to its intended upstream target
  or downstream-only status;
- a dependency-direction audit or equivalent static check;
- compatibility and package-local test commands documented and runnable;
- an assembly smoke test that records selected component revisions;
- a provenance/vendor check for upstream compatibility code; and
- a dry-run contribution review showing that contract, bridge, provider,
  projection, and packaging changes can be described separately.
- a clean-checkout startup/test/package run with no legacy workspace;
- a core-only build and compiled dependency or bundle-content audit;
- a contract fixture and generated-representation drift check;
- a storage-key/route migration test when identifiers change; and
- an assembled release manifest containing immutable component revisions and
  artifact hashes.

## 9. Deferred decisions

- Exact physical directory extraction and package manager work.
- Independent versioning versus one World release version.
- Public registry/release publication and marketplace policy.
- Physical repository split into Office, Graph, City, or provider repositories;
  the `herdr-world` umbrella decision is not deferred.
- The sequence and timing of actual upstream PRs.
- Multi-server aggregation and remote connection management.
- OTEL provider source, signal selection, cost calculation, and Office board
  design; these require the separate draft observability provider/projection
  specification.
- The physical format and publication location of the assembly manifest; its
  required fields and traceability rules above are not deferred.
