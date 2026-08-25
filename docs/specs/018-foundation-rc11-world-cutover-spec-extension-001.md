# Foundation `v0.1.0-rc.11` final input extension for Spec 018

- **Parent spec:** [`018-foundation-rc7-world-cutover-spec.md`](018-foundation-rc7-world-cutover-spec.md)
- **Extension ID:** `018-foundation-rc11-world-cutover-extension-001`
- **Status:** Approved
- **Created:** 2026-08-25
- **Requested by:** IvoryHeart (repository owner)
- **Approved by:** IvoryHeart (repository owner)
- **Approved at:** 2026-08-25

> The approved rc7 parent remains unchanged. This extension supersedes only
> its immutable Foundation dependency input; it does not widen the World
> cutover scope or authorize a product, bridge, terminal-owner, repository,
> artwork, licensing, installer, legacy-deletion, or World-release change.

## 1. Consolidated dependency history

This final record replaces the uncommitted rc8, rc9, and rc10 working notes.
Those intermediate candidates were integration inputs, not combined runtime
dependencies:

- Foundation PR #9 supplied terminal-upload accessibility, retained/offline
  Spaces admission, recovery, independent extension transport, and atomic
  recovery-fact admission;
- PR #10 corrected terminal-capability admission and recovery re-handshake;
- rc.10 added strict structural-command, per-runtime capability, snapshot, and
  recovery/capability-revocation admission; and
- PR #13 completed generic contributed-shell composition, transparent
  `ManagedTerminal` presentation, downstream branding, same-origin runtime
  labels, CSP-safe fonts, and settings accessibility.

Only the reviewed, merged, public rc.11 input below is normative for World.

## 2. Immutable final input

| Field | Value |
| --- | --- |
| Release | `v0.1.0-rc.11` |
| Release URL | `https://github.com/IvoryHeart/herdr-world-foundation/releases/tag/v0.1.0-rc.11` |
| Candidate archive URL | `https://github.com/IvoryHeart/herdr-world-foundation/releases/download/v0.1.0-rc.11/herdr-world-foundation-candidate-44507575918e4f745ec35970142fafed2b89113e.tar.gz` |
| Source commit | `44507575918e4f745ec35970142fafed2b89113e` |
| Annotated tag object | `addc1e3639830c2ebf9b24385ac9725e4bd51f26` |
| Tag peeled commit | `44507575918e4f745ec35970142fafed2b89113e` |
| Merged-main CI | `https://github.com/IvoryHeart/herdr-world-foundation/actions/runs/32897653252` |
| CI artifact wrapper SHA-256 | `06511346aef7f3bdf8cf34700d4a1b505e09f4484a7b7f906d8cde08a656af3f` |
| Candidate archive SHA-256 | `54c360191a442f6e19234ee246b13dfbb02c71fe9d91755fae34e86ffbfdbdd0` |
| Archive checksum-file SHA-256 | `6ec906a1644421dba8c8728e1da0e27bd36d47697e3d77e11ea06607033fcda0` |
| Manifest SHA-256 | `015d5180deac6600a701fc6e9c75c5fc66cf12d4d117e65d15fde1fd9328b2ae` |
| Manifest checksum-file SHA-256 | `c0f4921e744378afd2ae54cc15a8e49bc6615efb2760da62aa578bb3dc05ed10` |
| `SHA256SUMS` SHA-256 | `cb8ce27512ce0571c4434605903b6ad14a75c312923c6526397e6d5e1c219e15` |
| npm package | `@herdr-world/foundation@0.1.0` |
| npm package SHA-256 | `2297869b5bbac30d8b53608b2142d59afb89d318ca4dee30228c42abf8e282c5` |
| npm SRI | `sha512-apuF/Bw6Z6BTglya7MOGnRevmkDUVYsETGf6mQBhNTh5MoS5ezPgIYbO+uSGjxzv5xzzvksULRMTNSZbcZ74qw==` |
| npm integrity-file SHA-256 | `23c5d4562774dbcda3b6799a7a822ac864b820f1051b00121216a0c525f5cf2b` |
| npm checksum-file SHA-256 | `ff016301399bc612f7bf8c9b4ddea1971f13dfa639bdce4ef7bbcabaed0b2eb8` |
| Foundation bridge SHA-256 | `65cb7d232d1fa3079e81d7b75caf4dba4b75b2b236a935aaeb380b5aee42622c` |
| Bridge checksum-file SHA-256 | `d44668c4c73fba1f835b7df6296347e24df1709e6770d2107a3dbc20583bdb83` |
| Candidate provenance digest | `57156984f33b4165370327b2a832ed04e880849011e692a65e6584b62b26f218` |
| Surface API / Bridge API / web compatibility | `1` / `1` / `1` |
| Herdr compatibility | `0.8.2` at `9eb521456ac0d19d3ab3d9d7cea3cca10baa8a4c` |
| Terminal protocol | `20` |

The downloaded release archive and all four detached assets are byte-identical
to the exact green merged-main CI candidate. The package is also byte-identical
to the unpublished integration package used for complete local World parity.

## 3. Materialization and scope

World downloads the five declared release assets into `.foundation-cache/`,
verifies their pinned hashes, detached checksums, archive safety, standalone
asset/archive byte equality, full member ledger, source, package SRI,
declarations, exports, bridge, provenance, licenses, APIs, and compatibility,
then installs only the extracted packed npm tarball. The committed dependency
and lockfile use a repository-relative content-addressed cache path. No local
candidate environment input, absolute path, sibling checkout, source alias,
private import, mutable Git dependency, second bridge, or second terminal owner
is accepted.

World retains its existing bridge, observability routes, Office implementation,
assets, storage keys, and presentation. The Foundation bridge is verified only
as release provenance and is neither run nor packaged by World. All Spec 018
requirements, acceptance evidence, rollback safeguards, ownership boundaries,
and deferred work remain in force.
