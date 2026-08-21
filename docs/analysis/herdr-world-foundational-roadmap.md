# Herdr World two-repository roadmap

- **Status:** Planning baseline; implementation requires approved specs
- **Revised:** 2026-08-21
- **Downstream baseline:** `bbf0d8ef652e740824174091382667e2c2e0df60`
- **Upstream reassessment:**
  [`upstream-plugin-surface-reassessment-2026-08-20.md`](upstream-plugin-surface-reassessment-2026-08-20.md)

## Decision

Herdr World will move immediately to two independently buildable repositories
under one downstream brand:

```text
herdrdev/herdr
      │ public APIs / terminal protocol
      v
IvoryHeart/herdr-world-foundation
      │ exact versioned package + bridge artifact
      v
IvoryHeart/herdr-world
```

`herdr-world-foundation` is the thin, upstream-aligned browser and bridge layer
derived from Herdr Web. It owns the shell, Spaces, bridge manager, multi-bridge
profiles, capabilities, runtime cache, terminal transport, bridge executable,
and minimal Herdr compatibility slice.

`herdr-world` is the product. It owns branding, Office and future surfaces,
World settings/projection, downstream providers, installation, and releases.
It consumes Foundation through a public exact-version package boundary and
does not carry a second editable copy of Foundation.

Herdr and Herdr Web remain acknowledged upstreams. Focused proposals are
welcome, but their review/merge timelines never block Foundation or World
development and release.

## Settled product policy

| Topic | Decision |
| --- | --- |
| Owner | Yaswanth Narvaneni for pre-existing/Yaswanth-authored work; later contributors retain their copyrights under the project license |
| Product/repository | Herdr World / `herdr-world` |
| Generic dependency | `herdr-world-foundation` |
| World original-code license | Apache-2.0 |
| Foundation additions | MIT, preserving inherited MIT/Apache scopes |
| Surface model | Trusted compile-time packages, not runtime browser plugins |
| Multi-host default | Existing direct browser connections to multiple bridges |
| Optional topology | `herdr-mirror` or companions only when explicitly selected |
| Upstream policy | Reconstruct focused patches; never wait to ship downstream |
| First release | Source-first; binaries/mobile have separate gates |

## Current compatibility and live baseline

| Project | Audited state | Consequence |
| --- | --- | --- |
| Herdr | v0.8.2 at `9eb521456ac0d19d3ab3d9d7cea3cca10baa8a4c`, terminal protocol 20 | Canonical Foundation/World development baseline. Refresh before implementation. |
| Herdr Web | v0.4.3; audited `main` `cff6335683acc20cbb76c24b67d03f9e75dd78e6` | Foundation starts from current upstream ancestry and replays only remaining generic concerns. |
| Downstream | `origin/main` `bbf0d8ef652e740824174091382667e2c2e0df60` | Contains completed Spec 015 compatibility/replay work and the combined World implementation to separate. |
| Local live service | Initially observed on Herdr v0.8.0/protocol 19; upgraded during PR review to v0.8.2/protocol 20 | Validation first used an isolated daemon with bridge 8788/browser 5174, then the real-socket preview reported 5 workspaces/11 panes before bridge/assets cut over on 8787. Future protocol changes retain this parallel-candidate discipline. |
| Herdr plugins | Public manifests/actions/hooks/panes/link handlers and terminal observe/control | Runtime workflows use upstream mechanisms rather than a World registry. |
| herdr-mirror | Optional MIT plugin/companion using public terminal APIs | Useful evidence and optional topology, not a required layer. |

## Governing specifications

| Spec | Responsibility | Does not own |
| --- | --- | --- |
| [004](../specs/004-world-packaging-and-upstream-boundaries-spec.md) | Identity, copyright/license scopes, provenance, project policy, upstream/downstream lanes | Code extraction or installer mechanics |
| [011](../specs/011-surface-composition-spec.md) | Public Foundation package API, typed surface host, lifecycle and assembly proof | Repository rename or dynamic plugins |
| [016](../specs/016-two-repository-extraction-and-live-migration-spec.md) | Physical split, exact dependency, renames/data migration, CI, local preview/cutover | New product features or release installer |
| [010](../specs/010-upstream-extension-alignment-spec.md) | Plugin/capability/surface/provider classification and observability source audit | Package extraction or a new registry |
| [017](../specs/017-herdr-world-installer-and-release-orchestration-spec.md) | End-user install, manifest, supervision, update/rollback and multi-host guidance | Herdr runtime or plugin reimplementation |

Spec 015 is implemented compatibility history and remains immutable.

## Delivery order

```text
P0 protocol-20 implementation (Spec 015, complete)
      ↓
P1 identity and open-source policy (Spec 004)
      ↓
P2 cross-repository surface/package seam (Spec 011)
      ↓
P3 physical extraction, rename and live migration (Spec 016)
      ↓
P4 integration/provider ownership cleanup (Spec 010)
      ↓
P5 installer and release orchestration (Spec 017)
      ↓
P6 source release + continuing focused upstream proposals
```

Spec 010's read-only observability audit can run in parallel after P1, but its
provider refactor should land after the World/Foundation ownership boundary is
real. This avoids optimizing the provider inside a source graph that is about
to move.

## P1 — identity and open-source policy

### Work

- Apply `Yaswanth Narvaneni` and Apache-2.0 to original World work.
- Preserve Herdr Web MIT and vendored/asset/font component licenses.
- Publish independent-downstream wording and current project governance.
- Add the owner provenance statement for historical Office work, citing the
  approval/integration commits and recorded hashes.
- Replace upstream product branding with an original or clearly licensed World
  mark before the first branded release; treat sprite replacement as optional
  when Apache-2.0 notices are complete.
- Define fail-closed component/notice/checksum/SBOM release evidence.

### Exit gate

- No unresolved identity or repository-boundary choice remains.
- Every distributed non-original component has a recorded source/license
  disposition or a named pre-release replacement task.
- Upstream waiting states are explicitly non-blocking.

## P2 — public Foundation surface seam

### Work

- Publish `@herdr-world/foundation` with surface API version 1.
- Bind surface metadata, typed context, lazy component and disposer.
- Keep bridge profiles, runtimes, commands and terminals Foundation-owned.
- Move World orchestration behind the Office registration/product contribution.
- Build Foundation conformance (shell + Spaces) and World (Foundation + Office)
  from an exact packed artifact.
- Add cancellation, cleanup, error-boundary, multi-bridge identity and terminal
  sharing tests.

### Exit gate

- A clean World checkout consumes only public package exports.
- A clean Foundation checkout contains and emits no World code or asset.
- The current Office and Spaces behavior survives the seam.

## P3 — extract, rename and keep the product observable

### Work

- Refresh upstream, inventory the delta, and create Foundation from Herdr Web
  ancestry.
- Replay generic patches by concern with provenance and conformance tests.
- Publish an immutable Foundation package/bridge candidate.
- Switch World to that artifact before removing duplicate generic source.
- Rename the existing GitHub repository to `herdr-world`; do not rewrite
  history.
- Migrate binaries, packages, environment variables, data paths, browser keys,
  PWA/mobile identity, docs, automation, and artifact names with bounded legacy
  aliases.
- Preserve the completed local protocol-20 baseline and use a parallel
  daemon/socket plus exact daemon+bridge compatibility transaction for future
  protocol changes.
- Keep a loopback hot-reload preview with status/log/stop commands and use
  explicit owner visual checkpoints before production cutover.

### Exit gate

- The two default branches build independently from clean checkouts.
- World has one exact Foundation dependency and no duplicate generic core.
- Local protocol-20 World passes capabilities, snapshot, navigation, terminals,
  Office, multi-bridge, refresh, and rollback checks.
- Legacy data remains recoverable and migrations are idempotent.

## P4 — align integrations and data ownership

### Work

- Add a decision record for every integration.
- Complete the observability field/event matrix against current public Herdr.
- Move authoritative live Herdr facts to Herdr/Foundation paths.
- Retain providers only for proven historical/aggregate/external gaps.
- Use Herdr plugins/public terminal session APIs for executable companions.
- Prove no exact generic `GET /api/extensions` index, duplicate plugin
  catalogue, second bridge manager, or mandatory mirror exists while retaining
  the approved observability-specific child routes.

### Exit gate

- Every fact, action, surface and optional process has one primary owner.
- Provider failure is local and credentials remain outside browser contexts.
- Existing approved observability behavior has an explicit compatibility plan.

## P5 — install and operate the three layers coherently

### Work

- Publish a manifest pinning World, Foundation, Herdr, protocol/API versions,
  hashes, notices and SBOMs.
- Provide user-local install/doctor/start/stop/status/update/rollback/uninstall.
- Reuse a compatible Herdr or offer an explicit exact upgrade.
- Supervise core and optional components with separate health/failure states.
- Default to loopback and direct multi-bridge; keep optional companions opt-in.
- Stage updates atomically and retain a known-good compatible
  Herdr/Foundation/World rollback triple and user data.

### Exit gate

- A clean machine can install the exact three required layers without cloning
  sibling repositories.
- Manifest/checksum mismatch fails before execution.
- Failed update and uninstall preserve data and can restore the previous pair.
- Offline component versions, source, licenses and notices are inspectable.

## P6 — release and upstream collaboration

### Source release

The first release should be source-first. It occurs after Specs 004, 011, and
016 gates pass and the selected compatibility matrix is live-tested. Spec 010
must at least classify shipped integrations. A binary release additionally
requires Spec 017 artifact and signing decisions; mobile remains separate.

### Focused upstream work

For each generic candidate:

1. refresh the relevant upstream;
2. confirm the issue/change is still absent;
3. open the discussion/issue required by current policy;
4. reconstruct one concern from the current upstream head;
5. exclude Foundation naming and all World product material; and
6. track the result without coupling it to a downstream release.

## Recommended implementation PR sequence

1. **Policy/docs PR:** Spec 004 implementation only.
2. **Surface-seam PR:** Spec 011 behavior and package contract in the current
   integration repository, without deleting fallback source.
3. **Foundation bootstrap PR:** new repository, replay ledger, conformance app,
   package/bridge artifact.
4. **World package-cutover PR:** consume the immutable artifact; run clean
   cross-repository and visual acceptance.
5. **World rename/removal PR:** canonical identities, delete duplicate generic
   source, data aliases/migration, CI links and repository rename coordination.
6. **Integration-alignment PRs:** audit first, then one provider/companion change
   per proven gap.
7. **Installer PRs:** manifest/doctor first, then lifecycle/update/rollback.

Foundation bootstrap and World cutover are coordinated but remain separately
reviewable. Do not use one indefinitely growing PR for the whole programme;
the immutable Foundation artifact is the natural review and rollback boundary.

## Non-negotiable stop conditions

Do not delete generic World-tree source, cut over the live service, or publish a
release while any applicable condition is true:

- World cannot build from the exact packed Foundation artifact;
- Foundation contains World code, art, branding, provider, or installer files;
- the candidate cannot use the supported Herdr protocol;
- package/API mismatch is accepted silently;
- data migration would overwrite/delete its only recoverable copy;
- a script would signal an unverified process or run destructive tests against
  the owner's real session;
- required redistributed material lacks its license/notice/provenance entry; or
- a release relies on a mutable branch, undeclared sibling checkout, secret, or
  workstation-specific path.
