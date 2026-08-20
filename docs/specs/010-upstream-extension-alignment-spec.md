# Herdr plugin, capability, provider, and surface alignment

- **Spec ID:** `010-upstream-extension-alignment`
- **Status:** Draft
- **Created:** 2026-08-12
- **Revised:** 2026-08-20
- **Owner:** Herdr Web / Herdr World foundations
- **Reviewers:** IvoryHeart (repository owner)
- **Approved by:** —
- **Approved at:** —

> This revision withdraws the proposed generic `/api/extensions` registry.
> Current Herdr plugin discovery, public CLI/socket/session APIs, Herdr Web
> bridge capabilities, and compiled browser surfaces already provide distinct
> mechanisms. This specification aligns those mechanisms and permits a custom
> downstream contract only for a demonstrated remaining data gap.

## 1. Purpose

Herdr World needs reusable integrations without creating a second plugin
system or a second browser capability catalogue. The earlier draft proposed a
generic registry even though Herdr already owns executable plugin discovery and
Herdr Web already exposes bridge capabilities. That would have introduced a
new term and transport without a proven consumer.

This specification defines how a feature is classified, discovered, and
packaged. It also requires the existing observability integration to be
characterized against current public Herdr APIs before its downstream provider
boundary is expanded.

## 2. Upstream mechanisms

| Need | Authoritative mechanism |
| --- | --- |
| Executable workflow, action, event hook, startup restoration, terminal pane, or link handler | Herdr plugin manifest and public CLI/socket API |
| Installed plugin metadata or actions | Herdr `plugin.list`, `plugin.action.list`, and related public API methods |
| Read-only or writable live terminal stream for an external client/process | `herdr terminal session observe` or `control` |
| Browser bridge compatibility, supported commands, and optional bridge feature availability | Herdr Web `GET /api/capabilities` and `BridgeRuntime.capabilities` |
| Trusted browser view included in a particular product build | Spec 011 compiled-in surface assembly |
| External historical/aggregate data absent from Herdr | A narrow downstream provider contract after a recorded gap analysis |

Herdr's plugin registry and Herdr Web's bridge capability response are not
interchangeable. The former describes installed executable packages in the
runtime; the latter describes what a particular browser bridge endpoint can
safely serve. A compiled browser surface is product composition rather than
runtime plugin installation.

## 3. Scope

This feature includes:

- a mandatory classification record for current and future extensions;
- removal of `/api/extensions` and a generic extension registry from the plan;
- an inventory of the observability contract against current public Herdr
  state, events, reports, plugin APIs, and terminal-session APIs;
- a thin, typed browser mapping for upstream plugin metadata/actions only if a
  separately approved browser use case requires it;
- continued use of `/api/capabilities` for bridge feature admission;
- downstream provider contracts only for semantic or historical data not
  available through upstream public mechanisms;
- compatibility fixtures and ownership tests that prevent the mechanisms from
  drifting into duplicate registries; and
- guidance for optional Herdr World companion plugins.

## 4. Non-goals

- No `GET /api/extensions`, generic extension descriptor, or registry version.
- No dynamic JavaScript loading, web marketplace, plugin SDK, sandbox, or
  remote module URL.
- No fork of `herdr-plugin.toml`, Herdr plugin IDs, source metadata, action
  descriptors, warning behavior, or marketplace discovery.
- No representation of Herdr World, Herdr Web, Office, Graph, or City as a
  Herdr plugin. They are applications or compiled browser surfaces.
- No automatic exposure of all plugin commands to a browser.
- No generic snapshot/event envelope invented before two concrete consumers
  demonstrate the same bounded semantics.
- No change to the approved and implemented observability routes or payloads in
  this classification slice.

## 5. Requirements

### Requirement: Classify every extension before implementation

Every new integration SHALL have an extension decision record containing:

```text
feature_id
user_need
runtime_or_presentation
required_semantics
existing_herdr_apis
existing_web_capabilities
selected_mechanism
documented_gap
security_authority
upstream_target
downstream_owner
```

The decision SHALL select exactly one primary owner: Herdr plugin/API, Herdr
Web bridge capability, compiled World surface, or downstream provider. Other
layers MAY adapt the result for presentation but MUST NOT redefine its identity
or lifecycle.

#### Scenario: A Git workflow is proposed

- **GIVEN** the workflow can run as an action or event hook using the Herdr CLI
- **WHEN** its extension record is reviewed
- **THEN** it is classified as a Herdr plugin rather than a new bridge
  extension with a World-specific discovery descriptor.

### Requirement: Reuse Herdr plugin discovery without copying it

When World needs to display installed plugin information or invoke a supported
plugin action, the bridge SHALL obtain canonical data through Herdr's public
`plugin.list`, `plugin.action.list`, and `plugin.action.invoke` APIs. It MUST
NOT parse manifests independently, maintain a second installed-plugin list, or
assign alternative plugin/action identities.

Browser invocation MUST use an explicit allow-list and preserve Herdr's own
enabled, platform, context, qualification, warning, and error semantics. The
browser MUST NOT receive a general socket or arbitrary argv channel.

Adding this browser mapping requires a separately approved user-facing spec;
this requirement defines the boundary, not an implementation mandate.

#### Scenario: Office offers a plugin action

- **GIVEN** an approved Office feature needs one installed plugin action
- **WHEN** the action list is rendered and invoked
- **THEN** its identity and availability come from Herdr, while the bridge
  admits only the approved operation and does not create a World plugin record.

### Requirement: Keep browser capability admission in `/api/capabilities`

Bridge routes and optional browser-safe behaviors SHALL be advertised through
the existing bounded `GET /api/capabilities` response. New optional capability
objects SHALL use additive versioned fields and MUST preserve existing client
compatibility rules.

The project MUST NOT add a parallel `/api/extensions` response to advertise
the same bridge behavior. Capability metadata is compatibility information,
not authentication, provider configuration, or installed-plugin discovery.

#### Scenario: A bridge can list plugin actions

- **GIVEN** a future approved bridge implements the safe plugin-action mapping
- **WHEN** a browser probes it
- **THEN** `/api/capabilities` contains one bounded versioned capability for
  that mapping and no generic extension registry is consulted.

### Requirement: Keep surface composition independent of plugin discovery

Trusted browser surfaces SHALL be selected by the compile-time World assembly
defined by Spec 011. Surface availability MAY depend on bridge capabilities,
but it MUST NOT depend on a Herdr plugin being reclassified as browser code or
on a runtime-discovered JavaScript module.

A companion Herdr plugin MAY provide runtime actions, reports, or a supervised
external service consumed through a documented public API. The plugin package,
service process, provider adapter, and browser surface MUST retain separate
identities and lifecycle rules.

#### Scenario: World ships an observability companion

- **GIVEN** a future companion plugin contributes Herdr actions or metadata
- **WHEN** the World release recommends or bundles it
- **THEN** Herdr installs it as an ordinary plugin while Office remains a
  compiled surface and the bridge/provider boundary remains independently
  optional.

### Requirement: Audit observability against current public APIs

Before extending or replacing the existing observability transport, the
implementation SHALL produce a field-level matrix for every current descriptor,
snapshot, event, health, and target-correlation field. Each field SHALL be
classified as:

- directly available from a stable Herdr public API/event/report;
- derivable without scraping terminal content;
- available from a Herdr plugin or plugin-owned report;
- external historical/aggregate telemetry not represented by Herdr; or
- obsolete or presentation-only.

Current Herdr public session streams and plugin APIs SHALL be included in the
audit. Terminal text MUST NOT be scraped to infer semantic status when a public
agent/runtime fact exists. Existing provider routes SHALL remain compatible
during the audit.

#### Scenario: Agent status already exists in Herdr

- **GIVEN** an observability field duplicates authoritative public agent state
- **WHEN** the field matrix is completed
- **THEN** the plan records Herdr as its source and does not require an
  external metrics provider to reproduce that state.

#### Scenario: A cost time series is absent from Herdr

- **GIVEN** bounded historical cost data is required and no stable Herdr API
  supplies it
- **WHEN** the field matrix is completed
- **THEN** the exact gap, retention semantics, identity correlation, and
  privacy boundary justify keeping a narrow optional provider contract.

### Requirement: Prefer public terminal session APIs for companion clients

An external process that needs live pane content SHALL evaluate
`herdr terminal session observe` first and `control` only when writable input,
resize, scroll, release, or takeover authority is required. It MUST NOT couple
to Herdr's private TUI client protocol when the public session stream satisfies
the use case.

The choice between observe and control SHALL be least-authority and documented.
A web bridge that continues to use the protocol compatibility client MUST
explain which required browser terminal semantics are missing from the public
session facade and keep that compatibility layer isolated.

#### Scenario: A read-only monitoring pane is mirrored

- **GIVEN** an integration only needs live ANSI output
- **WHEN** its transport is selected
- **THEN** it uses the read-only observe facade and does not request terminal
  takeover or depend on private client messages.

### Requirement: Keep provider contracts narrow and evidence-based

A downstream provider contract SHALL contain only data that cannot be obtained
reliably through the selected public Herdr mechanism. It SHALL define canonical
schema ownership, bounded collections and strings, version compatibility,
source identity, freshness, partial failure, and cross-language fixtures.

Provider descriptors MUST NOT duplicate Herdr plugin source metadata or Herdr
Web bridge compatibility fields. Credentials, backend URLs, raw query strings,
terminal output, prompts, and arbitrary provider errors MUST NOT appear in
browser payloads or checked-in fixtures.

#### Scenario: A provider becomes unnecessary

- **GIVEN** a later Herdr public API supplies all semantics previously provided
  by an adapter
- **WHEN** the compatibility plan is reviewed
- **THEN** the adapter can be deprecated behind the canonical contract without
  changing surface identity or inventing a second source of truth.

### Requirement: Avoid unsupervised plugin-daemon assumptions

Herdr `[[startup]]` hooks SHALL be treated as one-shot restoration commands,
not daemon supervisors. A long-running companion process MUST have an explicit
operator, service-manager, or package-launcher lifecycle with restart,
shutdown, logging, upgrade, and failure behavior.

The browser and Herdr core MUST remain usable when that process is absent. A
plugin action MAY ask the external supervisor to start or inspect it, but the
manifest MUST NOT imply that Herdr guarantees daemon liveness.

#### Scenario: A companion process exits

- **GIVEN** an optional long-running provider exits after Herdr startup
- **WHEN** World next reads its bounded health
- **THEN** only that provider becomes unavailable and the documented
  supervisor—not a one-shot startup hook—is responsible for recovery.

### Requirement: Make the absence of a generic registry verifiable

The implementation SHALL include documentation and static or route-level tests
that prevent introduction of `/api/extensions`, a duplicate installed-plugin
registry, or a generic descriptor schema without a new approved specification.
Existing observability compatibility routes MAY retain the word `extensions`
in their paths; they MUST be documented as legacy feature-specific transport,
not a generic discovery system.

#### Scenario: A contributor copies the withdrawn endpoint design

- **GIVEN** a change adds generic `GET /api/extensions`
- **WHEN** architecture and route checks run
- **THEN** the change fails review or validation and directs the contributor to
  the extension classification record.

## 6. Privacy and security

- Herdr plugins execute as trusted local user code with broad CLI/socket
  authority; World documentation MUST NOT describe them as sandboxed.
- The browser SHALL receive only the minimum bounded plugin/action data needed
  for an approved feature and SHALL invoke only allow-listed semantic actions.
- Capability responses MUST NOT include secrets or grant authority.
- Public session observe/control streams can contain sensitive terminal data;
  access, logs, fixtures, and retention MUST follow the existing terminal
  security boundary.
- Provider adapters own credentials server-side and expose bounded semantic
  output only.

## 7. Acceptance evidence

Acceptance SHALL include:

- the extension decision record template and completed records for
  observability, Office, generic Web, and any proposed companion plugin;
- a field-level observability source matrix against current stable Herdr;
- tests or audits proving no generic `/api/extensions` route or descriptor was
  added;
- a mapping from browser capabilities to the existing
  `/api/capabilities` parser and compatibility tests;
- documentation that distinguishes Herdr plugins, bridge capabilities,
  compiled surfaces, and provider contracts;
- public-session API characterization for any long-lived terminal client;
- unchanged regression fixtures for the existing observability routes; and
- a reviewed list of true upstream API gaps, with Discussion links before any
  Herdr implementation proposal.

## 8. Deferred decisions

- Whether a concrete browser workflow warrants exposing an allow-listed subset
  of Herdr plugin actions.
- Whether observability needs a separately published companion Herdr plugin.
- Migration or retirement of the existing feature-specific observability
  routes after the field-level audit.
- A common provider envelope, only after at least two providers share identical
  semantics and lifecycle needs.
- Dynamic or untrusted browser extensions and their isolation model.
