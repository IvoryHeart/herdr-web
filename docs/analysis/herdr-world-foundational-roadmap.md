# Herdr World foundational roadmap

- **Status:** Planning baseline; implementation still requires approved specs
- **Date:** 2026-08-12
- **Based on:** [`herdr-world-repository-analysis.md`](herdr-world-repository-analysis.md)
- **Branch:** `codex/foundational-extension-registry`

## Decision

The analysis findings are accepted. No material finding is being refuted.
The only clarification is that the repository has no active build-time or
runtime dependency on `ai-observability`; the remaining problem is active setup
documentation, test wording, historical provenance, and adapted Office source
and art provenance.

The work will proceed in this order:

```text
P0 release safety and identity
        ↓
P1 package, surface, bridge, and contract boundaries
        ↓
P2 upstream contribution reconstruction
        ↓
P3 generic extension registry and provider expansion
        ↓
P4 public Herdr World release
```

The current daily-use Office experience remains stable throughout this work.
Foundational changes must preserve core Herdr Web operation when World,
Office, or optional providers are absent.

## Progress on this roadmap

The first non-licensing tranche is now prepared on this branch:

- P0-D active legacy-reference cleanup is complete for operational docs and
  the World E2E network guard. The historical analysis remains the sole audit
  record for the former workspace relationship.
- Draft Spec 004 has been revised with package ownership, clean-checkout
  independence, identity separation, core-only proof, contract drift gates,
  and traceable assembly-manifest requirements.
- Draft Spec 011 defines the typed surface host context, trusted assembly
  registration, slot/route ownership, admission states, and core-only proof.
- Draft Spec 010 remains intentionally unimplemented until the surface and
  bridge extension boundaries are reviewed; no registry runtime behavior has
  been added by this branch.

The next action requiring product-code changes is approval of the revised
packaging and surface drafts. Until then, implementation remains limited to
mechanical documentation/test corrections and reviewable planning artifacts.

## Current baseline

Already delivered and treated as compatibility constraints:

- Herdr-authoritative sessions, tabs, panes, agents, and terminal state.
- Host-qualified federation, generation-safe caches, capability admission, and
  operation-level command allow-listing.
- Optional observability contract, Prometheus adapter, provider health, and
  bounded Office projection.
- Responsive Pixel Office, Agent Bar, settings, room/seat actions, callouts,
  completion markers, and terminal/window persistence.

Partially delivered but not yet cleanly separated:

- Surface registry: useful discovery/lazy loading, but Office is still a core
  registration and `App.tsx` remains the orchestration boundary.
- Bridge extensions: observability is bounded and tested, but its provider
  implementation is still compiled into the main bridge module.
- Contract boundary: Rust, TypeScript, JSON Schema, and fixtures are manually
  maintained and need drift verification.
- Packaging: a private tarball exists, but it lacks complete notices,
  provenance, SBOM, and release-manifest enforcement.
- Generic extension registry: `010-generic-extension-registry-spec.md` is a
  draft only and must be revised after the surface and extension taxonomy are
  agreed.

## P0 — release safety and identity

P0 is the first implementation tranche because it protects every later
architecture and upstream contribution from releasing material whose rights,
origin, or identity cannot be explained.

### P0-A: provenance and redistribution gate

Create an approved machine-readable provenance manifest covering source,
images, fonts, generated artifacts, vendored Herdr compatibility code, and
bundled dependencies. Add a deterministic check that validates hashes,
required fields, and redistribution status.

The exact Pixel Office character assets are now traceable to Claw-Empire
revision `66a24ea7df2435ef897c48c147deb7ec572c01c2`, whose repository carries
an Apache-2.0 license and copyright notice for GreenSheep01201. The remaining
work is to encode that evidence in the repository's provenance manifest,
retain the Apache license in the release notice bundle, identify the adapted
files, and add required modified-file notices. The release gate must still
reject artifacts when attribution, modified-file notices, or packaging
compliance is absent; the rights decision itself is no longer the blocker.

### P0-B: notices, licenses, and SBOM

Add the project notice bundle, upstream Herdr Web and Herdr notices, vendored
Herdr compatibility notice, third-party npm/Cargo notices, required font/art
licenses, and machine-readable browser/bridge SBOMs. Package them into the
tarball and expose an offline path for inspection.

### P0-C: product identity and version source

Choose the downstream legal copyright holder, Herdr World branding relationship,
package namespaces, binary names, Android identity, schema domain, storage-key
migration policy, and one release-version source. Record legacy aliases and
migration behavior rather than silently changing them.

### P0-D: legacy-reference cleanup

Replace active `ai-observability` setup instructions with Herdr World-owned
examples or generic configured-service guidance. Replace the production test’s
legacy-name network assertion with an explicit allowed-origin assertion.
Preserve historical evidence in a clearly labeled archive. Correct `UPSTREAM.md`
so it describes the current World and observability delta.

### P0 exit gate

- Clean checkout builds and tests without an external legacy checkout.
- No active documentation or test requires an absolute workstation path.
- Assets without the required attribution, modified-file notices, or
  packaging evidence cannot enter a public package.
- Every distributed item has verified provenance and applicable notices.
- Names, versions, routes, package identities, and storage migration are
  documented before implementation of public-release machinery.

## P1 — enforce internal boundaries

P1 turns the intended architecture into typed, testable seams before adding
more extensions.

### P1-A: packaging-boundary specification

Revise draft spec 004 with the analysis requirements: package ownership,
dependency direction, contribution matrix, assembly manifest, provenance
inputs, optional-failure behavior, and core-only acceptance proof. Approve it
before physical extraction or release restructuring.

### P1-B: surface-composition specification and implementation

Create and approve a new surface specification defining:

- typed host context and the smallest read/command capabilities;
- route, navigation, stage, sidebar, settings, and lifecycle ownership;
- loading, error, unavailable, and degraded surface states;
- selected/all scope, per-host minimums, and layered capability admission;
- assembly-owned downstream surface registration;
- synthetic-surface validation independent of the provider registry; and
- a core-only build/test proof with no Office imports or assets.

Implement the seam around the existing registry incrementally. Do not move
large files merely to create folders; move code only when the contract and
tests prove ownership.

### P1-C: bridge core/provider split

Define and implement separate responsibilities for core bridge transport,
trusted extension host, provider-neutral contract validation, provider
adapters, and World assembly. Preserve existing observability endpoints and
behavior while moving provider ownership behind an explicit boundary.

### P1-D: canonical contract and drift check

Choose the canonical observability representation, then validate every fixture
against it and verify Rust/TypeScript decoding against the same fixtures.
Generate or mechanically compare declared versions, limits, and enum values.

### P1 exit gate

- Core-only build succeeds without Office, World assets, or providers.
- `App.tsx` does not own downstream Office implementation imports.
- Core bridge does not own Prometheus/OTEL provider behavior.
- Optional provider/projection failure leaves core Herdr operation usable.
- Contract fixtures and language implementations cannot silently drift.

## P2 — reconstruct upstream contribution units

Upstream discussion begins while the P1 drafts are in review, before the
surface contract is frozen. The goal is to collect upstream constraints early;
no upstream implementation branch is cut until the relevant draft is
approved and the proposed slice has a concrete upstream target.

During and after P1 boundary work:

1. fetch and audit current `upstream/main` and Herdr compatibility revisions;
2. create one branch from current upstream per independent concern;
3. select generic, upstream-useful candidates such as federation identity,
   capability admission, bridge security, and surface composition;
4. remove Herdr World branding, Office assets, provider-specific contracts, and
   downstream product copy from each upstream branch;
5. add upstream-focused tests and documentation; and
6. record accepted, declined, or superseded outcomes in the assembly manifest.

The extension registry is discussed with upstream at this stage, not assumed
to be an upstream contract merely because it is generic in shape. A second
projection or synthetic surface can validate Spec 011 independently; it does
not wait for the P3 bridge-extension registry.

## P3 — generic registry and provider expansion

Revise draft spec 010 after the extension taxonomy, surface boundary, and
upstream intent are settled. Then implement the smallest compile-time trusted
registry:

- bounded discovery metadata;
- no dynamic code loading or marketplace semantics;
- observability registered through an adapter;
- existing observability routes retained for compatibility; and
- no provider credentials, backend URLs, or mutation authority in registry
  responses.

Only after this is stable should additional provider adapters or Graph/City
projections be considered.

## P4 — public Herdr World release

Define a separate release specification for versioning, signing, SBOMs,
provenance attestations, compatibility support, upgrade/storage migration,
rollback, offline notices, and security reporting. Produce public artifacts
only after P0 gates pass and the Office attribution/packaging evidence is
complete.

## Proposed reviewable work units

Each unit should be its own branch/PR and should not mix Office UX changes:

1. **P0 documentation/spec gate:** revise spec 004, create the surface spec,
   and record identity/provenance decisions.
2. **P0 provenance and release gate:** manifests, notices, SBOM generation,
   attribution/modified-file enforcement, and legacy-reference cleanup.
3. **P1 surface boundary:** typed surface host, assembly-owned registration,
   synthetic-surface validation, and core-only proof.
4. **P1 bridge boundary:** core/extension/provider split with compatibility
   tests.
5. **P1 contract drift gate:** canonical schema and cross-language fixture
   verification.
6. **P2 upstream branches:** one upstream concern per branch, based on current
   upstream.
7. **P3 registry:** revise and implement spec 010 after upstream discussion.
8. **P4 release:** public distribution only after attribution and release
   gates.

## Non-negotiable acceptance policy

No implementation should claim “public Herdr World distribution” while any of
the following is true:

- Office source or art redistribution is unlicensed or unverified;
- required licenses, notices, provenance, or SBOMs are absent;
- a build depends on an undeclared checkout or workstation path;
- core and downstream contributions cannot be built/tested independently; or
- an upstream PR contains World-specific assets, providers, branding, or
  unrelated aggregate history.
