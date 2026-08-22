# Spec 011 implementation summary — versioned Foundation-to-World surface composition

- **Spec:** `011-surface-composition`
- **Status:** Implemented in the current integration repository
- **Surface API:** `1`
- **Foundation package:** `@herdr-world/foundation@0.1.0`
- **Foundation artifact:** produced by `npm run foundation:pack`
- **Artifact SHA-512:** `sha512-7Rh4Cc12kHYG46ePyxTOZV/o8jy3SyFB8Mh6mH2m1QX8qMEd646GF4xgXvCQXCOUUEBPJOwUvz6hRdU1jVN+0Q==`
- **Physical extraction:** explicitly deferred to Spec 016

## Delivered behavior

- Added the public `@herdr-world/foundation` package and documented
  `@herdr-world/foundation/surfaces` export.
- Added typed surface definitions, typed registrations, `SurfaceHostV1`, product
  assemblies, one typed product-settings contribution, opaque generic storage,
  qualified runtime targets, existing bridge feature/command allow-lists, and
  host-managed shared terminal handles.
- Added exact API-version, ID, route, feature, command, and qualified-target
  validation. The conformance registry is Spaces at `/`; the World assembly
  contributes Office at `/world`.
- Added generation-scoped lifecycle handling for surfaces and settings:
  load-before-context, fresh context generations, cancellation, stale-result
  rejection, failed-factory no-dispose behavior, awaited replacement, delayed
  and rejecting disposer containment, and exactly-once disposal.
- Added a Foundation-only conformance application/test and retained existing
  World browser characterization coverage for Office, settings, navigation,
  conversations, completion, focus, accessibility, terminals, refresh, and
  multi-bridge behavior.
- Added a real packed artifact with package metadata for package version,
  integrity, surface API, bridge API, `web_compat`, supported Herdr, and
  terminal protocol. React and React DOM remain peer dependencies.
- Added a clean temporary consumer audit that installs the exact pack output,
  imports only the public subpath, checks emitted package content for World/
  Office material, checks peer singleton declarations, and rejects private
  Foundation imports.

## Test evidence

- `npm run test --prefix web`: lifecycle, type-negative, API validation,
  settings parity, shared-terminal, conformance, and existing web tests.
- `npm run test:foundation-boundary`: exact packed-consumer and emitted-output
  audit.
- `npm run foundation:pack`: package metadata and SHA-512 artifact record.
- Existing browser suite remains the characterization source for current
  protocol-20 Spaces/Office behavior and the two documented skips.

## Constraints and deviations

- This PR keeps the integration repository and generic fallback source intact;
  it does not create, rename, or delete repositories and does not perform the
  live migration. Those operations belong to Spec 016.
- The integration product still retains the existing World orchestration in
  its current application composition so behavior remains unchanged before
  physical extraction. The public registration/package seam is the mechanical
  boundary; moving those remaining files and deleting duplicate generic source
  is intentionally deferred to Spec 016.
- Registry publication is deferred; the content-addressed `npm pack` tarball is
  the v1 artifact as allowed by Spec 011.
- The shared terminal pool is a host-owned lifecycle primitive; the existing
  protocol-20 terminal renderer remains the transport authority until the
  physical Foundation extraction wires the adapter directly to the host.
- No dynamic browser plugin registry, second bridge manager, new capability
  catalogue, Graph, City, provider cleanup, installer, or branding migration
  is included.
