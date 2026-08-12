# Generic Herdr Web extension registry foundation

- **Spec ID:** `010-generic-extension-registry`
- **Status:** Draft
- **Created:** 2026-08-12
- **Owner:** Herdr Web / Herdr World foundations
- **Reviewers:** IvoryHeart (repository owner)
- **Approved by:** —
- **Approved at:** —

> This draft promotes SUG-001 into a small upstream-compatible foundation.
> It establishes generic extension discovery and capability metadata without
> replacing the existing observability transport in the first implementation.

## 1. Purpose

Provide one stable bridge-owned discovery surface for optional Herdr Web
extensions so observability, future providers, and future World projections can
be advertised and admitted without adding a new one-off capability shape for
each extension.

## 2. Scope

- A language-neutral registry descriptor contract under
  `contracts/extensions/`.
- A bridge-owned in-process registry with bounded descriptor validation.
- A read-only `GET /api/extensions` discovery endpoint.
- Registration of the existing observability extension as the first descriptor,
  without changing its existing descriptor, snapshot, configuration, or event
  endpoints.
- Browser-side parsing and tests for the generic registry response, without
  changing Office presentation or requiring the UI to consume the registry yet.
- Documentation of the contribution boundary between registry, extension
  transport, provider, projection, and packaging.

## 3. Non-goals

- No dynamic plugin loading, arbitrary code execution, marketplace, or remote
  extension installation.
- No authenticated multi-server coordinator, discovery service, or SSH
  credential handling.
- No replacement or breaking change to
  `/api/extensions/observability`, its snapshot route, its configuration route,
  or `WS /ws/extensions/observability`.
- No generic snapshot/event payload transport in this first registry slice;
  extension-specific transports remain valid until a separately approved
  transport extension.
- No Office UI, metrics-board, provider-query, OTEL Collector, or Herdr Server
  changes.

## 4. Context and constraints

The repository already contains the approved observability contract and a
provider-specific bridge transport. The registry is a discovery seam above
those transports, not a second observability schema. The bridge remains the
trust boundary: browser responses MUST NOT include provider credentials,
backend connection strings, or arbitrary provider configuration.

The registry MUST be useful when no optional provider is configured. In that
case, the observability extension remains discoverable with `unavailable`
health rather than disappearing or preventing normal Herdr Web operation.

## 5. Requirements

### Requirement: Advertise registered extensions

The bridge SHALL expose a read-only registry response containing every
compiled-in optional extension descriptor, including extensions whose provider
is unavailable or degraded.

#### Scenario: No optional provider is configured

- **GIVEN** Herdr Web starts with the default unavailable observability
  provider
- **WHEN** the browser requests `GET /api/extensions`
- **THEN** the response includes the observability extension with bounded
  metadata and `unavailable` health, while core capabilities remain usable.

### Requirement: Keep the registry descriptor generic

Registry descriptors SHALL use generic extension identifiers, contract versions,
provider identifiers, capability names, target scopes, health, and observation
time. The registry MUST NOT encode OTEL-specific fields or Office rendering
concepts.

#### Scenario: A future Git extension is added

- **GIVEN** a future extension provides a valid descriptor
- **WHEN** it is registered beside observability
- **THEN** the registry can advertise it without changing the registry schema
  or adding a provider-specific field.

### Requirement: Validate and bound registry data

The bridge SHALL validate extension IDs, provider IDs, capability names, target
scopes, contract versions, health values, timestamps, uniqueness, and collection
limits before serializing a registry response. Browser parsing SHALL apply the
same structural and size bounds before admitting descriptors into client state.

#### Scenario: A malformed descriptor is registered

- **GIVEN** a descriptor has duplicate capabilities, an invalid identifier, or
  an incompatible registry version
- **WHEN** the registry is built or parsed
- **THEN** the descriptor is rejected or the response is treated as malformed;
  it is never presented as authoritative extension state.

### Requirement: Preserve extension transport ownership

The registry SHALL advertise discovery metadata only. Each extension MAY retain
its own approved snapshot, event, configuration, or command transport, and the
registry MUST NOT imply that every extension supports a common data endpoint.

#### Scenario: Observability uses its existing transport

- **GIVEN** the observability extension appears in the generic registry
- **WHEN** Office requests observability data
- **THEN** it continues using the existing observability contract and routes;
  the registry addition does not duplicate or reinterpret those payloads.

### Requirement: Preserve bridge security boundaries

The registry endpoint SHALL use the existing bridge host/origin policy and
shall never serialize provider credentials, backend URLs, authorization data,
SSH keys, or arbitrary provider configuration.

#### Scenario: A provider has a configured backend URL

- **GIVEN** the bridge has an operator-configured provider endpoint
- **WHEN** the registry descriptor is serialized
- **THEN** only a safe provider identifier and bounded capability/health
  metadata are returned; the endpoint is absent.

### Requirement: Keep the core product optional-safe

Registry construction, validation, or an unavailable extension MUST NOT block
the core Herdr snapshot, terminal, Spaces, or Office paths.

#### Scenario: Registry metadata fails validation

- **GIVEN** one optional descriptor cannot be validated
- **WHEN** the browser requests the registry
- **THEN** the bridge returns a bounded registry error or omits only the invalid
  optional descriptor according to the documented policy, while core routes
  remain available.

## 6. Data and interface contract

The initial registry response is:

```json
{
  "registry_version": { "major": 1, "minor": 0 },
  "extensions": [
    {
      "extension_id": "observability",
      "contract_version": { "major": 1, "minor": 0 },
      "provider_id": "none",
      "capabilities": [
        { "name": "observability.metrics", "operations": ["snapshot"] }
      ],
      "target_scopes": ["host", "workspace", "tab", "pane"],
      "health": "unavailable",
      "observed_at": 0
    }
  ]
}
```

The contract SHALL define:

- registry major/minor version with compatible-minor rules;
- a stable lower-case extension ID and provider ID;
- namespaced capability names and bounded operation names;
- bounded target-scope strings;
- the health values `available`, `unavailable`, `degraded`, `offline`,
  `incompatible`, and `unauthorized`; and
- a non-negative observation timestamp.

`GET /api/extensions` is the only new route in this slice. The response is
read-only, contains no secrets, and is subject to the existing bridge CORS and
host policy. The browser client MAY cache the response for the active bridge
generation, but the registry is not authoritative Herdr topology.

## 7. Privacy and security

- Registry descriptors MUST contain only discovery metadata.
- Provider credentials, backend URLs, connection strings, prompts, logs,
  terminal output, and raw telemetry MUST NOT appear in registry fixtures or
  browser responses.
- Capability metadata is not authentication and MUST NOT grant a provider or
  browser new Herdr mutation authority.
- The endpoint MUST inherit the bridge's existing host/origin policy and
  request-size limits.

## 8. Acceptance evidence

- Contract fixtures cover an available registry, unavailable observability,
  malformed descriptors, duplicate fields, and registry major mismatch.
- Rust tests cover registry construction, observability adaptation, bounds,
  route response, and credential/endpoint omission.
- TypeScript tests cover generic registry parsing and malformed-response
  rejection.
- Frontend lint/build and the full web test suite pass.
- Bridge tests pass when a Rust toolchain is available.
- Documentation maps the registry to the intended upstream Herdr Web seam and
  records that generic data transport remains a later extension.

## 9. Deferred decisions

- A generic snapshot/event envelope and common transport route.
- Dynamic extension registration or server-side plugin discovery.
- Authenticated remote extension discovery.
- Registry aggregation across multiple bridges.
- Whether the registry contract belongs in Herdr Web, Herdr Server, or a
  separately released Herdr World contract package after upstream review.
