# Spec 016 implementation summary: Foundation v0.1.0 candidate cutover

- **Spec ID:** `016-two-repository-extraction-and-live-migration`
- **Implementation tranche:** World package cutover against Foundation `v0.1.0-rc.1`
- **Reviewed World base:** `5b0794c95bafa2cb7ed6b61ae8ea7a7ba269f26e`
- **Foundation source:** `a6104b683963651d60a061cfcbd91d9fdc5effde`
- **Status:** Ready for review; not merged

## Delivered

- Published the owner-approved Foundation candidate from the exact reviewed
  source commit as annotated tag `v0.1.0-rc.1` and a GitHub prerelease. The
  inherited `v0.1.0` tag was not changed.
- Checked in the exact Foundation package tarball and independently verified
  candidate archive, bridge, package SRI, SHA256SUMS ledger, manifests,
  inventories, licenses, notices, and provenance.
- Replaced the selected World entrypoint with
  `mountFoundationBrowser`, Foundation stylesheet assets, and an explicit
  `worldProductAssembly` containing Foundation conformance surfaces plus
  World Office.
- Adapted Office to public `SurfaceHostV1` facts, navigation, capability
  admission, and focus commands. The selected path has no sibling checkout,
  private Foundation import, or local terminal-owner fallback.
- Added a static compatibility declaration and negative gates for artifact
  tampering, Surface API, bridge API, webCompat, bridge version, Herdr version,
  and terminal protocol mismatches.
- Added a second Vite HTML entry for `/world/`, making the deep link survive
  the released bridge's `/world` to `/world/` canonicalization on refresh.

## Evidence

The release pin is recorded in `vendor/foundation/README.md`,
`provenance/assembly-manifest.json`, and `provenance/compatibility.json`.
The package verifier reports package SHA-256
`aaa33b18330cf2101dae754b3facc99b529c9d4196d6098cd74d57a84954e699`, release
archive SHA-256
`ca85b418b7b64f7173701b8d87fbf1957547899a381fa8c502f8ddb85dac6d07`, bridge
SHA-256 `a8041e7e6d888678185c0c934f5a0f9162cb43fe84b54e8c1f468aaa6431b7fa`,
and 409 verified ledger entries.

Automated package-boundary, negative-compatibility, Surface API, web unit,
lint, production build, and three-test Foundation browser acceptance gates
pass. The production import and deferred-source audit is recorded in
`provenance/world-bundle-audit.md`.

The live loopback preview used the exact released Foundation bridge binary on
port `8789`, connected read-only to the existing protocol-20 daemon. It
validated capabilities, a structural snapshot, Office rendering, refresh,
Spaces terminal attach/focus, and 1440x900/390x844 screenshots. No terminal
input was sent. The preview and its port were stopped after validation; the
owner's port `8787` service and installation were not modified.

## Intentional drift and deferral

The generic `App.tsx`/`AppShell` tree, local bridge/runtime owner modules,
legacy World settings/handoff code, and co-located generic CSS remain as
temporary removal candidates. Their deletion, repository rename, identity
migration, installer work, and feature restoration remain outside this PR.
The inherited pre-cutover browser specs remain in-tree as historical coverage;
the active browser gate is the public Foundation cutover suite.
