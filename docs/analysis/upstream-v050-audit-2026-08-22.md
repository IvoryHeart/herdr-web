# Herdr Web v0.5.0 read-only audit

- **Date:** 2026-08-22
- **Downstream implementation base:** `origin/main` at
  `57ba410c0b4bdd4ba43a43847a2c765dc076ffa5`
- **Previously audited upstream Web baseline:**
  `cff6335683acc20cbb76c24b67d03f9e75dd78e6`
- **Herdr Web v0.5.0:**
  `4718dade4b21d6b91119a3ee1cf4e88d5c36e344`
- **Current `kcosr/herdr-web` `upstream/main`:**
  `e67537b6bdd99fe489584252ba2f84ea070a3193`
- **Herdr v0.5.0 tag, recorded to prevent ambiguity:**
  `763f6ebe3b33cc5603c51f2bcfcfb015c5aca90a`

The Web and Herdr tags named `v0.5.0` are different repositories and different
immutable objects. This audit uses the explicit Web commit above and did not
use the ambiguous local tag named `v0.5.0`. It is a read-only comparison; no
upstream commit was replayed into this tranche.

## Audit evidence

The exact remote observations were:

```text
git ls-remote git@github.com:kcosr/herdr-web.git \
  refs/tags/v0.5.0 refs/heads/main
4718dade4b21d6b91119a3ee1cf4e88d5c36e344  refs/tags/v0.5.0
e67537b6bdd99fe489584252ba2f84ea070a3193  refs/heads/main

git ls-remote git@github.com:herdrdev/herdr.git \
  refs/tags/v0.5.0 refs/tags/v0.5.0^{}
763f6ebe3b33cc5603c51f2bcfcfb015c5aca90a  refs/tags/v0.5.0^{}
```

The exact comparison
`git diff --stat 4718dade4b21d6b91119a3ee1cf4e88d5c36e344..e67537b6bdd99fe489584252ba2f84ea070a3193`
contains only the next-release `CHANGELOG.md` preparation. The v0.5.0 concern
commits are:

| Concern | Immutable upstream evidence |
| --- | --- |
| Protocol 20 and Herdr compatibility | `816f25a668f10b506e61aed9b25547d7a0bab532`; PR #69 merge `85bd55d197cd8493433219f70f5443b9415d7d3f`; Web issue #65 is closed as of `2026-08-21T22:55:27Z`. |
| Terminal-output gzip | `952c7f65df61211c69710d22b0d3d55fec057212` and ArrayBuffer fix `8e338e7affbc7379224bd05f07efd47e8fa526fa`; release PR #59. |
| Touch-device static cursor | `d881f26744968eafb3b470d7b942a33fdd95a8d5`; release PR #60. |
| Wrapped mobile URL copying | `a4eb5285d54ac6bd5e5def4fc4233a5ba5c69b28`; release PR #61. |
| Attention-agent recency sorting | `9af4abdf991787dead9399869da3204312f28608`; release PR #68. |
| Web v0.5.0 release | `4718dade4b21d6b91119a3ee1cf4e88d5c36e344`. |

## Adoption matrix

| Concern | Downstream/current comparison | Classification | Tranche disposition |
| --- | --- | --- | --- |
| Protocol-20 support and closed issue #65 | The current downstream baseline already requires Herdr v0.8.2+ and exact terminal protocol 20 through the completed Spec 015 work. Upstream v0.5.0 now carries the corresponding compatibility fix and closes #65. | **already present** | Retained as-is; no protocol replay. |
| Terminal-output gzip compression | Upstream changes both bridge framing and `TerminalView`. The downstream baseline now routes terminal transport through the merged shared `terminalSessionOwner` (#22), whose characterization and replay guarantees predate the gzip path. | **downstream conflict** | Do not replay here. Reconcile compression with the shared owner in the later Foundation replay, with owner-level frame ordering and stale-socket tests. |
| Touch-device static cursor behavior | Upstream passes a touch-derived cursor-blink setting into the renderer. The downstream baseline's renderer still uses a static `cursorBlink: true`; this is independent of the contract kernel. | **adopt later in Foundation** | Audit and adopt with the existing touch, focus, and renderer characterization suite. |
| Wrapped mobile URL copying | The downstream baseline already rejoins URLs for detection/opening, but does not contain v0.5.0's mobile copy normalizer for indented canvas-wrapped continuations. | **adopt later in Foundation** | Preserve as a focused renderer/selection follow-up; no contract or protocol change in this PR. |
| Attention-agent recency sorting | Downstream already records qualified agent status transitions and exposes an explicit `lastStatusChange` sort. Upstream v0.5.0 instead adds recency as an attention-band tie-breaker, so the user-visible ordering contract differs. | **downstream conflict** | Do not replay. Reconcile only after the World activity/attention characterization is reviewed in Foundation. |
| Shared terminal owner / `SurfaceHostV1` | Neither Web v0.5.0 nor current upstream `main` contains the downstream merged `terminalSessionOwner` or the Spec 011 typed host contract. | **not applicable** | Keep the accepted owner and implement the narrow host adapter in this tranche. |

No concern was classified as superseded in this audit. The upstream audit does
not expand this PR into a Web v0.5.0 replay.
