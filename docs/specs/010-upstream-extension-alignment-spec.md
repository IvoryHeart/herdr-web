# Herdr plugin, Foundation capability, provider, and World surface alignment

- **Spec ID:** `010-upstream-extension-alignment`
- **Status:** Approved
- **Created:** 2026-08-11
- **Revised:** 2026-08-21
- **Owner:** Herdr World Foundation / Herdr World
- **Reviewers:** IvoryHeart (repository owner)
- **Approved by:** Yaswanth Narvaneni
- **Approved at:** 2026-08-21

> This specification reuses Herdr's plugin/public API model and Foundation's
> Herdr Web-derived browser runtime. It explicitly rejects a second generic
> extension registry, capability catalogue, or multi-bridge coordinator.

## 1. Purpose

Herdr World needs reusable integrations, additional visualizations, and
optional historical/aggregate providers. Herdr already owns executable plugin
discovery and public session APIs; the browser foundation already owns direct
multi-bridge profiles, capability probes, runtime caches, and terminals.

This specification defines how a proposed feature is classified and where its
authority lives. It also requires the current observability integration to be
audited against current public Herdr APIs so downstream providers contain only
facts that Herdr does not represent.

The audit and downstream changes may proceed at Herdr World velocity. Upstream
discussion or acceptance is useful but is not an implementation or release
gate.

## 2. Authoritative mechanisms

| Need | Authoritative mechanism | Repository lane |
| --- | --- | --- |
| Runtime workflow, action, event hook, startup restoration, terminal pane, or link handler | Herdr plugin manifest and public CLI/socket API | Herdr or separately installable plugin |
| Installed plugin metadata/actions | Herdr `plugin.list`, `plugin.action.list`, and related public methods | Herdr; adapted by Foundation only for an approved browser use case |
| External read/control of a live terminal | `herdr terminal session observe` or `control` | Herdr public API / optional companion |
| Browser bridge compatibility and feature admission | `GET /api/capabilities` and Foundation runtime capabilities | `herdr-world-foundation` |
| Multiple browser hosts | Existing direct multi-bridge profiles and qualified runtime identity | `herdr-world-foundation` |
| Trusted World visualization | Spec 011 compiled surface package API | `herdr-world` |
| Historical/aggregate data absent from Herdr | Narrow typed provider after a recorded gap analysis | `herdr-world` |
| End-user component supervision | Spec 017 installer/service owner | Herdr World distribution |

Herdr plugins, bridge capabilities, compiled surfaces, and providers have
different lifecycles and MUST NOT be collapsed into one “extension” registry.
`herdr-mirror` or another companion MAY be offered for a concrete topology, but
direct connections to multiple bridges remain the default browser topology.

## 3. Scope

This feature includes:

- a mandatory classification record for current and future integrations;
- withdrawal of the exact generic registry index `GET /api/extensions` from
  the plan while retaining approved observability-specific routes;
- a field-level audit of the observability contract against current public
  Herdr state, events, reports, plugins, and terminal-session APIs;
- a thin browser mapping for upstream plugin metadata/actions only after an
  approved browser use case;
- continued use of `/api/capabilities` for bridge feature admission;
- downstream provider contracts only for data unavailable through upstream
  public mechanisms;
- compatibility and ownership tests preventing duplicate registries and
  transports; and
- guidance for optional Herdr World companion plugins/processes.

## 4. Non-goals

- No exact `GET /api/extensions` generic index, generic extension descriptor,
  or registry version. This does not match or forbid child paths.
- No dynamic JavaScript loading, browser marketplace, plugin SDK, or remote
  module URL.
- No fork of Herdr plugin manifests, IDs, actions, warnings, or marketplace
  discovery.
- No representation of Foundation, World, Office, Graph, or City as a Herdr
  plugin.
- No automatic browser exposure of every plugin command.
- No second bridge manager, central multi-host gateway, or mandatory mirror.
- No generic snapshot/event envelope before two real consumers demonstrate the
  same bounded semantics.
- No removal or incompatible change to the approved
  `/api/extensions/observability`, `/api/extensions/observability/snapshot`, or
  `/api/extensions/observability/config` transports or their payloads without
  a separately numbered and approved migration spec defining replacements,
  compatibility window, and browser/settings migration.

## 5. Requirements

### Requirement: Classify every integration before implementation

Every new integration SHALL have a decision record containing:

```text
feature_id
user_need
runtime_or_presentation
required_semantics
existing_herdr_apis
existing_foundation_capabilities
selected_mechanism
documented_gap
security_authority
upstream_candidate
downstream_owner
```

The record SHALL select exactly one primary owner: Herdr plugin/API,
Foundation bridge capability, compiled World surface, or World provider. Other
layers MAY adapt that result for presentation but MUST NOT redefine its identity
or lifecycle.

#### Scenario: A Git workflow is proposed

- **GIVEN** the workflow can run as an action or hook through the Herdr API
- **WHEN** its record is reviewed
- **THEN** it is classified as a Herdr plugin rather than a new Foundation
  endpoint or World discovery descriptor.

### Requirement: Reuse Herdr plugin discovery without copying it

If a browser use case needs plugin metadata or actions, Foundation SHALL query
the public Herdr methods and preserve upstream plugin IDs, action IDs, source,
warnings, and availability. It MAY expose a narrowly typed, allow-listed
mapping through an existing bridge feature and `/api/capabilities`; it MUST NOT
persist a second catalogue or synthesize World-specific plugin identities.

Browser invocation MUST pass through bridge-side authorization and parameter
validation. Plugin discovery alone does not authorize all actions for remote
browser use.

#### Scenario: Office offers an approved plugin action

- **GIVEN** the action exists in Herdr and browser policy allows it
- **WHEN** Office renders it
- **THEN** Office uses the upstream plugin/action IDs through Foundation's
  validated adapter and does not register a duplicate World action.

### Requirement: Keep bridge feature admission in `/api/capabilities`

Foundation SHALL keep compatibility, feature support, and allow-listed command
availability in the existing capabilities response and runtime model. New
browser features SHALL be additive there when necessary. They MUST NOT create
an extension-discovery endpoint or encode product surface installation.

#### Scenario: One of several bridges lacks a feature

- **GIVEN** a browser connects directly to two qualified Foundation bridges
- **WHEN** one reports the feature and one does not
- **THEN** the World surface uses the compatible host, marks the other
  unavailable, and does not require a coordinator or mirror to decide.

### Requirement: Keep surface composition independent of discovery

World surfaces SHALL be trusted compile-time registrations consumed through
the exact Foundation package defined by Spec 011. Their presence is decided by
the World build, not by Herdr plugin discovery or bridge capabilities. A
surface MAY display plugin/provider data, but does not become that plugin or
provider.

#### Scenario: World ships an observability companion

- **GIVEN** a separately installable process gathers historical metrics
- **WHEN** Office displays those metrics
- **THEN** Office remains a compiled World surface, the process has its own
  package/lifecycle/license, and Foundation remains unaware of Office.

### Requirement: Audit observability against current Herdr public APIs

Before extending the observability provider, the implementation SHALL create a
field-level matrix for every current value and event:

```text
field_or_event
meaning_and_freshness
current_source
public_herdr_source
transform_or_missing_semantics
selected_owner
migration_or_retention_reason
```

The audit SHALL include snapshot/state, agent/activity events, reports, plugin
methods, terminal session observe/control, reconnect/replay behavior, and the
currently supported Herdr release. A value available with equivalent semantics
from Herdr SHALL migrate to Herdr/Foundation ownership. A provider remains only
when it supplies genuinely absent history, aggregation, or external-domain
data.

The audit is evidence work and MUST NOT silently change an approved wire
contract. A behavior/schema migration requires its own approved spec or
extension.

#### Scenario: Agent status already exists in Herdr

- **GIVEN** the current public API exposes equivalent identity, state, and
  freshness
- **WHEN** the observability matrix is reviewed
- **THEN** Herdr becomes authoritative and the provider's duplicate field gets
  a compatibility migration or removal plan.

#### Scenario: A cost time series is absent from Herdr

- **GIVEN** no public Herdr API represents the historical aggregate
- **WHEN** the matrix is reviewed
- **THEN** a narrow World provider may remain and its retention, credentials,
  and failure behavior are documented.

### Requirement: Prefer public terminal session APIs for companions

New companions SHALL use public terminal session observe/control rather than
copying Foundation's private protocol compatibility client unless a field-level
gap is demonstrated. Read-only needs use observe; control requires explicit
user authorization and must not steal the foreground full-app client's role.

`herdr-mirror` is an optional independently versioned topology component. Its
existence does not require World or Foundation to depend on it, and it is not a
replacement for direct multi-bridge profiles.

#### Scenario: A read-only pane is mirrored

- **GIVEN** public observe provides the required output and lifecycle
- **WHEN** the companion starts
- **THEN** it uses observe, cannot send input, and Foundation does not gain a
  second terminal protocol implementation.

### Requirement: Keep providers narrow and removable

A World provider SHALL define only its proven extra semantics, freshness,
availability, authentication location, retry/backoff, and retention behavior.
Provider credentials and raw configuration MUST remain outside browser surface
contexts. The provider SHALL map to a World-owned typed contract rather than
becoming a generic Foundation registry.

Provider absence, invalid credentials, timeout, or schema error MUST degrade
only the dependent World feature. Foundation shell, Spaces, other hosts, and
terminal sessions remain operational.

#### Scenario: A future Herdr release makes a provider field redundant

- **GIVEN** the public Herdr API now exposes equivalent semantics
- **WHEN** compatibility moves to that release
- **THEN** the provider field is deprecated and removed through a tested
  migration without changing the surface's presentation identity.

### Requirement: Supervise long-running optional processes explicitly

A Herdr plugin manifest is not assumed to supervise a daemon. Any long-running
provider or companion SHALL have an explicit owner for start, readiness,
restart/backoff, logs, update, and shutdown. Spec 017 owns installed-product
supervision; development scripts MAY own disposable local processes.

#### Scenario: An optional companion exits

- **GIVEN** World is otherwise healthy
- **WHEN** the companion crashes
- **THEN** supervision reports a bounded degraded state, respects backoff, and
  does not restart Herdr, Foundation, or unrelated providers.

### Requirement: Make absence of duplicate infrastructure verifiable

CI SHALL fail if implementation introduces the exact generic index route
`GET /api/extensions`, a generic extension registry, a second persisted
bridge-profile store, World surface registration inside Foundation, or
production imports of a retired generic registry. Route tests MUST distinguish
that exact index from the approved observability-specific child routes, which
remain required until a separately approved migration replaces them. Tests
SHALL also verify direct multi-bridge qualification and provider failure
isolation.

#### Scenario: A withdrawn design is copied into Foundation

- **GIVEN** code adds the exact `GET /api/extensions` descriptor index while
  the approved observability child routes remain registered
- **WHEN** architecture and route tests run
- **THEN** they fail only for the generic index and direct the contributor to
  plugin discovery, `/api/capabilities`, Spec 011 surfaces, or a documented
  provider gap without breaking the observability transport.

## 6. Privacy and security

- Plugin metadata exposed to browsers SHALL be allow-listed and must not reveal
  secrets, private paths, or unrestricted commands.
- Provider credentials stay server-side and are redacted from logs, errors,
  snapshots, browser storage, and package artifacts.
- Terminal observe/control uses least privilege and preserves Herdr's authority
  rules.
- Non-loopback bridge access remains explicit and governed by existing
  origin/host policy.

## 7. Acceptance evidence

Approval requires review of the ownership table, classification record, direct
multi-bridge default, and observability-audit boundary.

Implementation completion later requires:

1. a committed observability field/event matrix against the then-current Herdr
   stable release;
2. a decision record for every existing downstream integration;
3. tests proving plugin IDs/actions are preserved if browser mapping exists;
4. direct two-bridge tests without a mirror;
5. provider absence/failure/credential-redaction tests;
6. route/import scans proving no generic extension registry exists; and
7. an upstream ledger whose waiting/declined entries do not fail downstream CI
   or release validation.

## 8. Deferred decisions

- A browser UI for Herdr plugin actions; it requires a concrete approved use
  case and security review.
- A generic provider contract; it requires two proven providers with materially
  shared semantics.
- Any dynamic browser plugin platform or sandbox.
- Any central multi-host topology beyond existing direct bridges and separately
  selected optional companions.
