# Herdr World Foundation package seam

The current integration repository publishes the future Foundation boundary as
`@herdr-world/foundation`. The package is deliberately small and has one
documented public subpath:

```ts
import {
  FOUNDATION_SURFACE_API_VERSION,
  createProductAssembly,
  defineProductSettings,
  defineSurface,
} from "@herdr-world/foundation/surfaces";
```

Consumers use the exact package artifact produced by:

```bash
npm run foundation:pack
npm run test:foundation-boundary
```

The packed artifact records the package version and content integrity,
surface API `1`, bridge API `1`, `web_compat` `1`, supported Herdr `>=0.8.2`,
and terminal protocol `20`. The tarball integrity is written to
`dist-packages/foundation-artifact.json` for joined CI and assembly evidence.

The public API includes:

- `SurfaceDefinition`, `SurfaceRegistration<Context>`, and opaque registration
  storage created by `defineSurface`;
- `ProductSettingsContribution<Context>` and opaque settings storage created by
  `defineProductSettings`;
- `ProductAssembly` and exact API-version, duplicate ID/route, bridge-feature,
  qualified-target, and semantic-command validation;
- `SurfaceHostV1`, generation-scoped `AbortSignal`, host-managed terminal
  handles, and `SharedTerminalHandlePool`; and
- `SurfaceLifecycle`, which enforces load-before-context, one context per
  generation, stale-result rejection, abort, exactly-once disposal, awaited
  replacement, and contained post-cleanup rejection.

`web/src/surfaceRegistry.tsx` is the Foundation conformance registry and
contains only Spaces. `web/src/productAssembly.tsx` is the current integration
World assembly; it adds Office and Office settings through the public opaque
registration API. Foundation package output is built only from
`packages/foundation` and does not contain World source, assets, providers, or
branding.

The local `file:` dependency is a development convenience while both products
are still in this integration repository. The boundary audit installs the
exact `npm pack` output into a clean temporary consumer, with no source alias,
sibling checkout, or private import. Spec 016 remains responsible for the
physical repository extraction and final immutable dependency cutover.
