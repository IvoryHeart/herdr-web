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
5. operations and provenance: CI, trusted-access guidance, SSH-forwarding
   examples, acceptance evidence, and this auditable delta record.

No local category introduces World, Pixel Office, OpenTelemetry, authentication,
RBAC, SSH management, a public plugin SDK, or a central fleet gateway.
