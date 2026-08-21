# Herdr World identity, open-source policy, and upstream boundaries

- **Spec ID:** `004-world-packaging-and-upstream-boundaries`
- **Status:** Approved
- **Created:** 2026-08-10
- **Revised:** 2026-08-21
- **Owner:** Yaswanth Narvaneni
- **Reviewers:** IvoryHeart (repository owner)
- **Approved by:** Yaswanth Narvaneni
- **Approved at:** 2026-08-21

> This revision records the owner's naming, copyright, licensing, separation,
> and velocity decisions. Repository extraction and live migration are defined
> by Spec 016; installation and release orchestration are defined by Spec 017.

## 1. Purpose

Herdr World is an independent open-source product built on Herdr and derived in
part from Herdr Web. It needs a stable identity, a small and auditable
relationship with those upstreams, and enough provenance for people to use,
modify, and redistribute it without mistaking downstream work for an official
upstream release.

This specification settles those policy decisions. It does not require Herdr
or Herdr Web maintainers to accept a proposal before Herdr World can develop or
release compatible downstream work.

## 2. Adopted decisions

| Decision | Adopted value |
| --- | --- |
| Product and primary repository | **Herdr World** / `herdr-world` |
| Generic dependency repository | `herdr-world-foundation` |
| Copyright holder for pre-existing and Yaswanth-authored original World work | **Yaswanth Narvaneni** |
| Original World code license | Apache License 2.0 |
| Original Foundation additions | MIT, to align with Herdr Web |
| Inbound contributions | DCO sign-off; no CLA initially |
| Support | GitHub Discussions for help and Issues for reproducible bugs; best effort, latest stable release |
| Security | GitHub private vulnerability reporting, with a documented fallback contact before release |
| Initial release scope | Source release first; binary and mobile gates remain separate |
| Upstream relationship | Optional collaboration lane, never a downstream release dependency |

Third-party files retain their existing licenses. In particular, Herdr remains
Apache-2.0, Herdr Web remains MIT, Claw-Empire assets remain Apache-2.0, PixiJS
remains MIT, and bundled fonts retain their own licenses. A repository-level
license MUST NOT be represented as relicensing those components.

The public description SHALL include this meaning, with wording that may be
edited for style but not substance:

> Herdr World is an independent downstream project compatible with Herdr and
> derived in part from Herdr Web. It is not affiliated with, sponsored by,
> endorsed by, or maintained by the Herdr or Herdr Web projects.

## 3. Product and repository model

The dependency direction is normative:

```text
herdrdev/herdr                           Apache-2.0 runtime and public APIs
       │
       v
IvoryHeart/herdr-world-foundation       upstream-aligned generic browser,
       │                                bridge, Spaces and compatibility slice
       │ exact versioned package/artifact
       v
IvoryHeart/herdr-world                  World product, Office and future
                                        surfaces, providers and distribution
```

All downstream-facing names use Herdr World branding. “Foundation” describes
the generic dependency; it does not imply that it is official Herdr or Herdr
Web infrastructure.

| Component | Canonical identity | Ownership and license |
| --- | --- | --- |
| Runtime and public plugin/API contracts | `herdrdev/herdr` | Upstream; Apache-2.0 |
| Generic browser/bridge repository | `herdr-world-foundation` | Herdr Web-derived; preserved MIT plus separately identified Apache vendored code |
| Public browser package and surface contract | `@herdr-world/foundation` | Foundation; MIT additions and inherited notices |
| Bridge executable | `herdr-world-bridge` | Foundation distribution component |
| Narrow compatibility crate | `herdr-world-compat` | Foundation-vendored Herdr slice; Apache-2.0 provenance retained |
| Product repository, command and artifact prefix | `herdr-world` | Yaswanth Narvaneni for pre-existing/Yaswanth-authored work, plus later contributors for their work; original code Apache-2.0 |
| Office, future Graph/City surfaces and World providers | World product | Downstream; original code Apache-2.0 with contributor copyrights preserved unless a file says otherwise |

Foundation SHALL be usable and testable without the World repository. World
SHALL consume a released or locally packed exact Foundation version through
its public API; Foundation MUST NOT import World source, art, branding, or
provider code.

## 4. Scope

This specification includes:

- product identity, copyright, license scopes, and non-endorsement wording;
- the two-repository ownership and dependency model;
- source, art, dependency, and generated-file provenance;
- a lightweight contribution, support, security, and governance baseline;
- focused contribution lanes for Herdr, Herdr Web, Foundation, and World;
- release material needed to preserve third-party licenses and notices; and
- a downstream-first workflow when an upstream proposal is delayed or declined.

Physical extraction, package mechanics, legacy-name migration, live preview,
the installer, and atomic updates are intentionally delegated to Specs 011,
016, and 017.

## 5. Non-goals

- No new Herdr runtime, plugin registry, browser plugin marketplace, or central
  multi-host coordinator.
- No requirement that Herdr World, Office, or Foundation be represented as a
  Herdr plugin.
- No requirement to wait for upstream discussion, review, or merge before
  shipping a compatible Foundation or World fix.
- No history rewrite. Existing public history remains part of the audit trail.
- No automatic clean-room rewrite of Office code merely because intermediate
  source files were untracked.
- No mandatory art replacement when an existing asset has adequate open-source
  provenance and notices. Product branding is a separate requirement.
- No binary signing requirement for the first source-only release. Checksums,
  manifests, and source/component notices still apply to published artifacts.

## 6. Requirements

### Requirement: Publish the adopted identity and license scopes

The `herdr-world` repository SHALL contain:

- an Apache-2.0 root license for original World code;
- `NOTICE` or equivalent third-party notices that identify inherited and
  redistributed components without claiming ownership of them;
- an exact `Copyright (c) 2026 Yaswanth Narvaneni` notice scoped to
  pre-existing and Yaswanth-authored original World work;
- the independent-downstream statement from Section 2;
- contribution, code-of-conduct, security, support, and governance documents;
  and
- a component map explaining which paths have a different inherited license.

The `herdr-world-foundation` repository SHALL retain the Herdr Web MIT license
and copyright notice exactly as received, add the downstream holder for new
Foundation work without replacing the upstream notice, and preserve the Herdr
Apache-2.0 license and modification records for vendored compatibility files.

DCO sign-off grants the right to submit a contribution under the repository's
license; it does not assign the contributor's copyright. Later contributor-
authored work SHALL retain its contributor copyright and attribution under the
applicable Apache-2.0 or MIT repository scope. Notices and component maps MUST
NOT imply that Yaswanth Narvaneni owns work authored by another contributor
unless a separate documented assignment actually exists.

#### Scenario: A reader inspects a mixed repository

- **GIVEN** a clean checkout contains original, adapted, and redistributed work
- **WHEN** the reader opens the root license and notices
- **THEN** the owner and applicable license of each component class are clear
  without assuming every file was written or relicensed by Herdr World, and a
  DCO contribution remains attributed to its contributor.

### Requirement: Preserve auditable upstream relationships

Foundation SHALL record the exact Herdr Web upstream URL and synchronization
commit. Its Git history SHALL retain upstream ancestry, and a named `upstream`
remote or equivalent documented fetch command SHALL be available to
maintainers. The compatibility slice SHALL record the exact Herdr tag, commit,
source paths, file hashes, local modifications, and refresh procedure.

World SHALL record the exact Foundation release, package checksum, surface API
version, and Herdr compatibility range used by each release. A clean checkout
MUST NOT depend on an undocumented sibling directory or mutable default branch.

#### Scenario: An upstream release changes

- **GIVEN** Herdr Web or Herdr publishes a new release
- **WHEN** Foundation evaluates it
- **THEN** the comparison baseline, accepted patches, conflicts, tests, and
  resulting Foundation version are recorded independently of World features.

### Requirement: Keep upstream contribution optional and reconstructable

A generic fix MAY ship in Foundation immediately after downstream review. If
it is suitable upstream, maintainers SHALL reconstruct it as one focused branch
from the current upstream head with only the concern, tests, minimal docs, and
required changelog entry. World branding, surfaces, providers, art, installer
files, and unrelated downstream history MUST be absent.

The upstream ledger SHALL use `not-proposed`, `discussion`, `proposed`,
`accepted`, `declined`, `superseded`, or `downstream-only`, with a URL where one
exists. An upstream issue or pull request remaining open MUST NOT block a
Foundation or World release.

Herdr contribution rules SHALL be checked immediately before contact. Product
or API proposals use the current Herdr discussion process; implementation PRs
are opened only when the contributor is currently permitted. Herdr Web changes
follow its current focused-contribution policy.

#### Scenario: A generic accessibility fix is waiting upstream

- **GIVEN** the fix passes Foundation compatibility and regression tests
- **WHEN** upstream review has not completed
- **THEN** Foundation and World may release it, while the ledger records the
  pending proposal and its clean upstream branch.

### Requirement: Classify new integrations before creating infrastructure

Every new integration SHALL first consider, in order:

1. Herdr public CLI/socket/session APIs and Herdr plugins for runtime workflows;
2. Foundation's existing bridge, multi-bridge profiles, runtime cache,
   terminal transport, and `/api/capabilities` response;
3. the compile-time World surface contract from Spec 011; and
4. a narrow World provider only for a recorded semantic or historical-data gap.

It MUST NOT introduce a second plugin registry, bridge-profile owner,
capability endpoint, or terminal abstraction for an already-covered use case.
Spec 010 defines the evidence and classification format.

#### Scenario: A second visualization is proposed

- **GIVEN** it only presents facts already available through the host
- **WHEN** its architecture is reviewed
- **THEN** it is a World surface consuming the Foundation host contract, not a
  new bridge, daemon, or runtime plugin system.

### Requirement: Record source and art provenance proportionately

A machine-readable component/asset manifest SHALL distinguish:

- copied files and byte-identical assets;
- adapted or modified files;
- original work;
- generated outputs and their canonical inputs; and
- reference-only projects from which no distributed file was copied.

Each non-original distributed item SHALL record source repository, immutable
revision, source path, destination path, applicable license, required notice,
and source/destination hashes where practical. Generated release outputs need
an assembly manifest rather than fictitious source authorship.

Current character sprites are byte-identical to the recorded Claw-Empire
Apache-2.0 files and MAY remain when their license and attribution ship with
the artifact. Pixel Agents is currently reference-only and MUST NOT be named as
the source or license of a World file unless a later file-level comparison
establishes that relationship. PixiJS and fonts retain their own notices.

World application/PWA branding SHALL use a World-owned or explicitly licensed
product mark before the first Herdr World-branded release. Upstream Herdr logos
MAY appear only for nominative documentation with their exact provenance and
must not be the World product mark. Screenshots SHALL be regenerated after the
branding and surface composition are final.

#### Scenario: Existing open-source sprites remain in Office

- **GIVEN** the shipped bytes match the recorded Claw-Empire revision
- **WHEN** a World source or binary artifact is assembled
- **THEN** the artifact carries the required Apache-2.0 material and manifest
  entry, and no Pixel Agents authorship is implied.

### Requirement: Close the Office adaptation evidence gap with owner evidence

The repository SHALL add a committed provenance statement by Yaswanth
Narvaneni recording that the historical Office reference implementation was
created by or under the owner's authority in the personal ai-observability /
ai-palace work and was intentionally approved for adaptation into this project.
It SHALL cite at least:

- approval commit `7be916e3c4713582c72665cd787ef0300658ea26`;
- initial World integration commit
  `c69defe64687882158af30ae2f8375dde165dba4`;
- the recorded historical source hashes; and
- any portions mapped to Claw-Empire or another third-party source.

Untracked intermediate files are an evidence limitation and SHALL be described
as such; they are not by themselves evidence that permission is absent. Any
material portion that the owner cannot attest to or map to a compatible source
MUST be replaced before release. A wholesale clean-room rewrite is not required
for attested original work or properly attributed compatible work.

#### Scenario: A reviewer audits `officeGeometry.ts`

- **GIVEN** the original intermediate file was not committed
- **WHEN** its provenance record is inspected
- **THEN** the reviewer can follow owner authorization, immutable integration
  commits, historical hashes, modification notices, and third-party mappings;
  only an identified unsupported remainder triggers replacement.

### Requirement: Produce complete, fail-closed release material

Every published source or binary artifact SHALL contain or accompany:

- source and assembly manifests with exact component versions and hashes;
- applicable license and notice texts for redistributed code, art, and fonts;
- a dependency inventory or SBOM generated from locked npm and Cargo inputs;
- cryptographic checksums;
- the supported Herdr/Foundation compatibility matrix;
- clean-checkout build instructions; and
- a record of any optional component omitted from the artifact.

Release validation SHALL fail when a required manifest entry, license, notice,
checksum, or declared component is missing. It SHALL distinguish required
redistribution evidence from optional project enhancements. Artifact signing
MAY be deferred for a source-only prerelease and MUST be decided before public
binaries are called stable.

#### Scenario: A license tool cannot classify a transitive dependency

- **GIVEN** the dependency is included in a published artifact
- **WHEN** release validation encounters unresolved metadata
- **THEN** the artifact is not published until the dependency is manually
  classified, replaced, or excluded with evidence.

### Requirement: Use lightweight public project governance

The project SHALL document:

- owner/maintainer authority for specs, releases, security fixes, and branding;
- DCO sign-off for inbound commits and no CLA unless policy changes later;
- Contributor Covenant 2.1 or an explicitly selected alternative;
- private security reporting and which released versions receive fixes;
- latest-stable, best-effort support with no SLA; and
- the separate issue/discussion lanes for Herdr, Herdr Web, Foundation, and
  World.

These documents SHALL be concise and MUST NOT claim upstream maintainers
support World users.

#### Scenario: A contributor finds a bridge bug

- **GIVEN** the bug is reproducible in Foundation and potentially Herdr Web
- **WHEN** the contributor opens the contribution guide
- **THEN** they can fix it in Foundation without waiting upstream and can see
  how a separate focused upstream proposal may be prepared.

## 7. Privacy and security

- No repository, source archive, SBOM, log bundle, screenshot, or release
  artifact may contain provider credentials, local browser data, Herdr session
  content, home-directory paths, or private sibling-checkout references.
- Foundation's bridge remains loopback-only by default. Any non-loopback bind,
  upload path, or cross-origin allowance remains explicit and documented.
- Provider secrets remain server-side and outside surface contracts.
- Security scans are release evidence, not a substitute for dependency license
  and notice review.

## 8. Acceptance evidence

Approval of this policy specification requires:

1. confirmation that the adopted decisions in Section 2 match the owner's
   intent;
2. review of the two-repository dependency diagram and component names;
3. review of the Office owner-attestation remedy; and
4. confirmation that upstream acceptance and art replacement do not block the
   structural split.

Implementation completion later requires:

- both repositories contain the prescribed identity/license documents;
- provenance and third-party manifests validate from clean checkouts;
- a Foundation package and World source artifact contain their required
  licenses/notices and exclude secrets/workstation paths;
- a focused generic patch can be reconstructed from current Herdr Web without
  World files; and
- release validation fails closed for a deliberately omitted required notice.

## 9. Implementation boundary

This specification authorizes policy and documentation work after approval.
It does not by itself authorize product-code extraction. Spec 011 defines the
public package seam, Spec 016 defines repository migration and live cutover,
and Spec 017 defines end-user installation and updates. Each remains subject to
the repository's immutable-spec approval workflow.
