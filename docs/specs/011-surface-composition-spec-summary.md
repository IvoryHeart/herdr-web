# Spec 011 implementation summary — versioned Foundation-to-World surface composition

- **Spec:** `011-surface-composition`
- **Status:** Implemented in the current integration repository
- **Surface API:** `1`
- **Foundation package:** `@herdr-world/foundation@0.1.0`
- **Foundation artifact:** produced by `npm run foundation:pack`
- **Artifact SHA-512:** `sha512-pt2uwBgWT20nfEACTbEp7AuEiJpMQmcRUaQW+nIF2i6sBSC6sApZzL8fAYf/Qw4uYIlZXTZaKCcVNuErbOkEEg==`
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
- Routed production World selection, Spaces handoff, and Office room commands
  through the registration-provided `SurfaceHostV1`; conversation panels and
  Spaces terminal views now acquire the same host-owned transport fanout and
  release only their own view references without closing Herdr panes.
- Made the packed Foundation conformance application render generic
  runtime/workspace navigation and terminal lifecycle behavior, including a
  multi-runtime selection proof. Fixed the generic Spaces view to retain the
  selected runtime instead of always rendering runtime one.
- Made pending surface terminal attachment reject on cancellation, transport
  error, or WebSocket close, with exactly-once close regression coverage.
- Added generation-scoped lifecycle handling for surfaces and settings:
  load-before-context, fresh context generations, cancellation, stale-result
  rejection, failed-factory no-dispose behavior, awaited replacement, delayed
  and rejecting disposer containment, resource-complete cleanup before
  rejection, concurrent retry race handling, and exactly-once disposal.
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
  settings parity, delayed/rejecting cleanup, shared-terminal, qualified
  multi-bridge identity, conformance, and existing web tests (`62 files`,
  `432 passed`).
- `npm run test:foundation-boundary`: exact packed-consumer and emitted-output
  audit.
- `npm run foundation:pack`: package metadata and SHA-512 artifact record.
- `npm run check`: vendor, packed Foundation compliance, lint, Vitest, Rust tests,
  release-compliance tests, TypeScript/Vite build, and bridge build all passed.
- `npm run test:e2e`: 45 passed, 2 documented skips; the Foundation conformance
  browser test and existing World characterization suite passed.
- Focused host-boundary and terminal transport tests: 5 tests passed across
  `world/assembly.test.tsx`, `foundationConformance.test.tsx`, and
  `surfaceTerminal.test.ts`.
- Existing browser suite remains the characterization source for current
  protocol-20 Spaces/Office behavior and the two documented skips: `45 passed`,
  `2 skipped`.

## Live validation

- Candidate bridge: `http://127.0.0.1:8789/`; Vite HMR: `http://127.0.0.1:5175/`.
- The candidate reported Herdr `0.8.2`, bridge API `1`, `web_compat` `1`, and
  terminal protocol `20`; the existing services on ports `8787` and `8788`
  were left untouched.
- Shell + Spaces and World + Office were browser-checked at the candidate URL;
  Office rendered its live canvas without page errors.
- Candidate logs remain at `/tmp/herdr-world-spec011-bridge-8789.log` and
  `/tmp/herdr-world-spec011-vite-5175.log` while the preview is running.

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
  protocol-20 terminal renderer remains the pixel consumer while its input,
  resize, scroll, and output subscription cross the public host handle.
  Direct renderer extraction remains part of Spec 016.
- No dynamic browser plugin registry, second bridge manager, new capability
  catalogue, Graph, City, provider cleanup, installer, or branding migration
  is included.
