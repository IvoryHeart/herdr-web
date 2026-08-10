# Herdr observability contract

This directory is the language-neutral, upstreamable boundary for optional
observability extensions. It is deliberately independent of Herdr Server,
Herdr Web rendering, and any particular telemetry backend.

## Package boundary

```text
contracts/observability/       schema, versioning, fixtures, compatibility rules
bridge/src/observability.rs    downstream provider seam and browser transport
bridge/src/observability_prometheus.rs optional existing-sink adapter
web/src/observability.ts       browser types, validation, and transport client
web/src/world/officeObservability.ts provider-neutral Office projection data
```

The bridge owns access control, provider capability admission, bounded
transport, and event recovery. Providers own how data is obtained. The
browser never receives provider credentials or connects directly to a backend.

## Versioning

The initial contract is `1.0`. A compatible minor version may add optional
fields or capabilities. Required-field removal or a semantic change requires a
new major version. Provider-specific payloads use a namespaced `namespace`
inside the envelope payload.

## Transport

The downstream bridge exposes:

- `GET /api/extensions/observability` for the descriptor;
- `GET /api/extensions/observability/snapshot` for a bounded snapshot; and
- `WS /ws/extensions/observability` for ordered events and resync notices.

The event stream is intentionally recoverable rather than durable. If a
consumer reconnects after a gap, or the bridge receiver lags, it receives a
resync notice and must request a fresh snapshot.

## Provider status

The default provider is an explicit `unavailable` provider. This keeps normal
Herdr Web operation independent from observability and gives a downstream
adapter or a later Herdr Server provider a stable seam. The current optional
Prometheus adapter is configured separately and never exposes its backend
credentials or connection details to the browser.
