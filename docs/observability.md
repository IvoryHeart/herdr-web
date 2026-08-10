# Herdr observability extension boundary

Spec 002 establishes a downstream, upstreamable contract for optional
observability data. It does not add an OTEL client, backend credentials, or an
Office board yet.

## Current implementation

The repository now contains:

- [`contracts/observability/`](../contracts/observability/), the language-neutral
  v1 schema and provider fixtures;
- `bridge/src/observability.rs`, the bounded provider trait, unavailable default
  provider, snapshot response, event sequencing, and resync boundary; and
- `web/src/observability.ts`, the browser validator and transport client.

The bridge exposes the descriptor and snapshot at:

```text
GET /api/extensions/observability
GET /api/extensions/observability/snapshot
WS  /ws/extensions/observability
```

The default provider is explicitly `unavailable`, so normal Herdr Web
snapshot, terminal, Spaces, and Office behaviour does not depend on an
observability backend. A provider failure becomes `degraded` with an empty
bounded snapshot rather than a page-level failure. Event gaps produce a
resync message; consumers recover by requesting a fresh snapshot.

## Ownership and upstream PR seams

```text
observability contract  → schemas, versioning, validation, fixtures
provider adapter        → Collector/backend/project-specific access
Herdr Web bridge        → capability admission, transport, bounds, recovery
Office/World projection → presentation and navigation
distribution            → version pinning and component assembly
```

The first upstream-oriented contribution should be the contract and fixtures,
reviewable without OTEL or Herdr Server changes. A separate Herdr Web bridge
proposal can then carry the generic extension transport. A Herdr Server
proposal, if accepted later, should adapt server-owned topology and events to
the same contract without importing Office code. A provider adapter remains a
separate contribution because its deployment, credentials, backend, and
signal support are independent decisions.

## Security boundary

The browser receives only validated, bounded contract payloads. Provider
credentials, backend URLs, connection strings, SSH keys, raw unbounded logs,
and arbitrary backend responses are not part of the browser contract. Remote
access remains governed by the existing bridge Host/Origin policy and
operator-managed SSH, VPN, TLS, firewall, or authenticated reverse proxy.

## Naming note

The broader product direction is a `World` family with projections such as
`Office`, `Graph`, and `City`. This repository still uses its current
`herdr-web` package/repository identity until a separate naming and packaging
change is approved; Spec 002 deliberately keeps the contract independent of
that branding decision.
