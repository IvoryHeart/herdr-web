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

## 2026-08-20 Spec 015 protocol-20 audit

This audit was fetched immediately before approving and implementing Spec 015
work unit 1. No upstream protocol-20 fix had landed, so this downstream branch
does not compete with an existing fix.

Exact fetched revisions:

| Source | Revision or state | Evidence |
| --- | --- | --- |
| Herdr stable release | `v0.8.2`, peeled commit `9eb521456ac0d19d3ab3d9d7cea3cca10baa8a4c`; tag object `34ba52cc6ff3b723e6fc0130485ec24582dbe205` | `git ls-remote git@github.com:herdrdev/herdr.git refs/tags/v0.8.2 refs/tags/v0.8.2^{}` |
| Herdr current `master` | `2c042bb2ce845ca4c7fbe03df3e7eb041abd0252` | `git ls-remote ... HEAD refs/heads/master` and clean checkout |
| Herdr current contribution policy | `CONTRIBUTING.md` blob `93e8b9c20a79e69b7009f12024530e3e11720c75`; `.github/APPROVED_CONTRIBUTORS` blob `81f714f54047f9e15c7f2cc2e75af1a718ed3b22` | Current Herdr checkout; unsolicited implementation contributions are restricted to maintainers/approved contributors, and IvoryHeart is not listed |
| Herdr Web current `main` | `cff6335683acc20cbb76c24b67d03f9e75dd78e6` | `git ls-remote git@github.com:kcosr/herdr-web.git HEAD refs/heads/main` |
| Herdr Web current contribution policy | `CONTRIBUTING.md` blob `0b8d5147a94d2282846700957b638421e3570aa5` | Current Web `main`; focused pull requests are welcome and larger work should be discussed in an issue |
| Herdr Web issue #65 | Open; updated `2026-08-20T03:06:52Z`, 0 comments, no linked development PR | `gh api repos/kcosr/herdr-web/issues/65` fetched 2026-08-20 |

The v0.8.2 release wire/API slice was compared with current Herdr `master`:
`git diff --stat 9eb521456ac0d19d3ab3d9d7cea3cca10baa8a4c..2c042bb2ce845ca4c7fbe03df3e7eb041abd0252 -- src/protocol/wire.rs src/api/schema.rs src/api/schema src/server/headless.rs`
was empty. The current release therefore remains the reviewed contract. The
vendored source is Apache-2.0 from Herdr v0.8.2; source paths, destination
hashes, license hash, local adaptations, and repeatable commands are recorded
in [`vendor/herdr-compat/VENDOR-MANIFEST.toml`](vendor/herdr-compat/VENDOR-MANIFEST.toml).

Issue #65 remains open and still describes the old protocol-19 incompatibility:
the current Web binary reports protocol 20 as incompatible and requests 19.
This work unit resolves that downstream compatibility gap. No upstream Herdr
PR or maintainer comment was opened or added.

### Web v0.4.3 replay adoption matrix

The following current Web work remains deliberately outside Spec 015 work unit
1. It is follow-up replay work for the separate Web v0.4.2/v0.4.3 behavior
slice, not a protocol bridge prerequisite:

| Concern | Current upstream evidence | Work-unit-1 disposition |
| --- | --- | --- |
| Dev-server workflow | merged PR #57, `4c2ef62` | Not applicable; active local setup is retained and protocol docs are updated |
| Terminal IME/composition replay | merged PR #58, `e13c83d` | Deferred follow-up; not adopted here |
| Dialog/menu focus behavior | merged PR #62, `346beee` | Deferred follow-up; not adopted here |
| Terminal accessibility replay | merged PR #64, `eb47f62` | Deferred follow-up; not adopted here |
| Static asset/cache policy | current Web `main` `cff6335683acc20cbb76c24b67d03f9e75dd78e6` | Not applicable; no protocol-20 bridge change required |

The downstream branch intentionally contains no Web v0.4.2/v0.4.3 dev, IME,
focus, accessibility, or replay implementation. Specs 004, 010, and 011,
generic extension registries, World-only work, and packaging extraction remain
outside this PR as required by Spec 015.

### Stock daemon evidence

The live check used the unmodified Herdr v0.8.2 checkout at
`9eb521456ac0d19d3ab3d9d7cea3cca10baa8a4c`, built with the upstream-required
Zig `0.15.2` toolchain:

```bash
ZIG=/path/to/zig cargo build --release --bin herdr
HERDR_BIN=/path/to/herdr-v0.8.2/target/release/herdr \
  HERDR_WEB_BRIDGE_BIN="$PWD/bridge/target/debug/herdr-web-bridge" \
  HERDR_WEB_STATIC_DIR="$PWD/web/dist" \
  scripts/live-stock-v082.sh
```

The repeatable runner starts two disposable stock daemons with explicit socket
overrides, creates one workspace/pane in each, starts two isolated bridges, and
executes `scripts/live-bridge-smoke.mjs`. On 2026-08-20 it passed startup,
capabilities, snapshots, API command plus event, terminal attach/input/resize/
scroll, shared fan-out, detach/reattach, and independent multi-bridge routing.
The live output also confirmed that stock v0.8.2 keeps the browser's
`TerminalAttach` stream open when a pane emits BEL bytes. Stock Herdr forwards
the `TerminalBell` side effect only to a foreground full-app client, not to a
`TerminalAttach` client; exact bridge conversion to bounded BEL output is
therefore proven by the frozen protocol fixtures and focused bridge tests, while
the stock live limitation is retained for reviewer attention.
