# Upstream provenance and local delta

This repository is a GitHub fork of
[`kcosr/herdr-web`](https://github.com/kcosr/herdr-web). The Herdr Web federated
client foundation begins at the exact upstream commit below:

```text
67a4ace73fcd554af39586769dc86d4d9e82f09b
```

The MIT license and copyright notice are preserved in [`LICENSE`](LICENSE).
Git ancestry is preserved, `origin` points at `IvoryHeart/herdr-web`, and a
checkout used for delivery keeps `kcosr/herdr-web` as the `upstream` remote.
Reviewers can verify the relationship without trusting this document:

```bash
git merge-base --is-ancestor 67a4ace73fcd554af39586769dc86d4d9e82f09b HEAD
git remote -v
git diff --stat 67a4ace73fcd554af39586769dc86d4d9e82f09b...HEAD
```

## 2026-08-14 synchronization audit

The canonical Herdr source upstream is `herdrdev/herdr`. At the audit point,
its observed `master` commit was:

```text
d76657f2c7fc18dcce3b9af43842c8afaba1646b
```

The audited Herdr Web upstream head is
`98975226737821182f87a1eece8a080fffc4020e` (`9897522`), the PR #56 favicon
attribution follow-up (`Reference PR 56 and credit favicon contributor.`) on
`kcosr/herdr-web`. The Herdr source observation reported protocol 20 at that
point; it is a dated, non-normative observation and does not change this
repository's reviewed Herdr `v0.8.0` / terminal-protocol-19 compatibility
contract. This synchronization slice adopts only the compatible Herdr Web
favicon and square-icon alignment fixes.

The adopted upstream source commits and contributor records are:

- Favicon: `dfb6adda4b20072a01ef7b54585a51e3ea6107e7`, authored by Craig P.
  Motlin (@motlin) in [PR #56](https://github.com/kcosr/herdr-web/pull/56).
- Square-icon centering: `d0a2bc482890c8d3b0469eb0c042186c708783fc`, authored by
  Philippe SEGATORI (@tigitz) in [PR #55](https://github.com/kcosr/herdr-web/pull/55).
- PR #55 attribution follow-up: `f30e595b6cf15be4e72f758f759112e01164e923`.

## Untouched baseline result

The clean baseline was checked on 2026-08-01 before product edits with Node
22.16.0/npm 11.7.0 and Rust stable 1.97.1:

```text
npm ci
npm ci --prefix web
npm run check

vendor layout: pass
frontend lint: pass
frontend tests: 30 files, 241 tests passed
Herdr compatibility tests: 112 passed
bridge tests: 130 passed
frontend production build: pass
bridge debug build: pass
```

The first attempt documented two workstation-only prerequisites: the system
Rust 1.75 installation lacked `cargo-fmt`, and its Cargo could not read the
checked-in version-4 lockfiles. No tracked file changed. Supplying current
Rust stable plus `rustfmt` produced the clean result above.

## Categorized local delta

All commits after the pinned baseline belong to one of these reviewed groups:

1. application boundaries: app shell, core navigation, static internal surface
   registry, host registry, runtime client/cache, and terminal-session seams;
2. federation correctness: stable host profiles, qualified runtime identity,
   exact command/terminal routing, compatibility isolation, and stale-host
   control gating;
3. bridge contract and security: explicit bridge/Herdr version capabilities,
   bounded diagnostics, loopback defaults, and explicit non-loopback Host and
   Origin configuration;
4. verification: unit, bridge, multi-host, partial-failure, terminal-fanout,
   browser, responsive, accessibility, security, and independence fixtures;
5. World downstream integration: the optional Pixel Office projection, bounded
   observability contract/provider seam, Office settings, and browser lifecycle
   coverage;
6. operations and provenance: CI containment, trusted-access guidance,
   acceptance evidence, source/asset provenance, and this auditable delta
   record.

The World, Pixel Office, and observability work is downstream integration in
this fork. It is intentionally not represented as an upstream Herdr Web
requirement. The upstreamable units remain the generic contracts, bridge
capability/transport changes, and any independently reviewable compatibility
fixes; Office presentation, provider deployment assumptions, and assembled
World packaging remain downstream until their boundaries are accepted.

This repository does not add authentication, RBAC, SSH management, a public
plugin SDK, or a central fleet gateway.
