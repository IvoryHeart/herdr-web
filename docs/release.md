# Release Process

Herdr World is an open-source downstream project in the current combined,
pre-extraction checkout. Releases create Git tags and GitHub releases for the
source-first Herdr World release; they do not publish npm packages, and package
versions are not release versions. The checkout retains legacy `herdr-web`
operational identifiers only where the approved migration boundary requires
them.

## Prerequisites

- Clean `main` branch.
- Node.js 22 or newer.
- Rust stable.
- JDK 21 and Android SDK when validating the Android shell.
- GitHub CLI authenticated as a user that can create releases.
- A local Herdr `v0.8.2` or newer session reporting terminal protocol `20` for browser and packaged
  bridge smoke testing.

## Prepare

1. Confirm the changelog has user-facing notes under `## [Unreleased]`.
   Entries merged through pull requests should include the PR number or link before the PR is
   merged.
2. Confirm the vendored Herdr compatibility crate is intentional and clean:

```bash
scripts/check-vendor.sh
```

3. Run the full automated check:

```bash
npm run check
```

The check includes the fail-closed provenance and release-compliance tests.
For a release-specific clean-checkout gate, also run:

```bash
npm run release:compliance -- --check-clean
```

Do not cut a release without bridge test/build coverage.

## Initial Release Artifact

Spec 004 defines a source-first initial release. Build and upload only the source
archive from the final release commit or tag. Do not upload or publish desktop,
Android, APK, or other binary artifacts until the separate approved extraction,
installer, and release-orchestration gates authorize them.

The source archive is built with `scripts/package-source.sh vX.Y.Z`. The command
requires a clean checkout and includes generated source/assembly manifests,
npm/Cargo SBOMs, required notices, and checksums. Inspect the exact archive
member list and run the packaged artifact audit before upload. Do not commit
generated tarballs, APKs, or build-service outputs.

```bash
npm ci
npm ci --prefix web
scripts/package-source.sh vX.Y.Z
node scripts/release-compliance.mjs --audit-artifact \
  dist-packages/herdr-world-vX.Y.Z-source
```

## Validation-only Platform Builds

The desktop and Android helpers remain available for local validation and CI
evidence. They are not authorized initial release assets and must not be
uploaded to the GitHub release by this process.

Linux desktop validation:

```bash
npm ci
npm ci --prefix web
scripts/package-tarball.sh vX.Y.Z linux-x86_64
node scripts/release-compliance.mjs --audit-artifact \
  dist-packages/herdr-web-vX.Y.Z-linux-x86_64
```

macOS validation uses the same command with `macos-arm64` or `macos-x86_64`
on the corresponding host. Android validation uses
`npm run android:build:debug`. Keep all such outputs local or in CI evidence;
do not stage them under public release asset names.


## Browser And Federation Smoke

Start or attach a Herdr `v0.8.2` or newer session reporting terminal protocol `20`:

```bash
herdr
```

Build and run the web bridge:

```bash
npm run build
scripts/run-bridge.sh
```

Open `http://127.0.0.1:8787` and verify:

- The app loads the workspace, tab, pane, and split layout snapshot.
- Multiple browser clients can attach to the same terminal.
- Pane selection syncs between browser clients.
- Typing, mobile text input, stage-only input, tap-focus setting, scrolling, and refit work.
- Desktop IME composition commits once and canceled preedit is not replayed; dialog/menu focus
  returns to the invoking control.
- Settings → Terminal → Screen-reader text is off by default; when enabled, its mirror contains
  only a bounded visible terminal viewport, including visible scrolled-back rows, and does not
  expose unbounded terminal history or hidden cells.
- New tabs can launch Shell and every enabled managed built-in agent.
- Split right/down can launch Shell and every enabled managed built-in agent.
- A custom preset launches its exact configured `argv`, including a wrapper or SSH-shaped command,
  without a built-in agent executable being prepended.
- A forced managed-agent launch failure removes the tab or split created for that launch.
- Upload button, paste upload, and drop upload place shell-quoted file paths in the terminal.
- Pane notes can be created, edited, reloaded, and recovered from the Notes view.
- Binding to `HOST=0.0.0.0` is only used on a trusted network.

Then follow the two-host procedure in [federation.md](federation.md) and verify direct browser
connections to both bridges, collision-safe host-qualified navigation and command routing, isolated
offline/incompatible host states, terminal input and resize, and serving-host reload behavior. Run
the automated acceptance gate from a clean dependency install:

```bash
npm run check:acceptance
```

Repeat the startup, terminal attach, and launcher checks with an unpacked desktop tarball as local
validation evidence. Do not upload that binary from the source-first release flow. Confirm the
bridge rejects every protocol other than `20`
instead of serving a partially compatible UI.

## Cut

Choose the GitHub release version explicitly and run:

```bash
node scripts/release.mjs v0.1.0
```

The script:

- requires a clean `main` branch
- promotes `CHANGELOG.md` from `Unreleased` to the release version/date
- removes empty unused subsections from the released version notes
- runs `npm run check`
- commits `Release vX.Y.Z`
- tags `vX.Y.Z`
- pushes `main` and the tag atomically
- creates a GitHub release with notes extracted from `CHANGELOG.md`
- opens the next `## [Unreleased]` changelog section and pushes it

The release script does not upload binary artifacts. The source archive is
uploaded separately after the release exists; desktop and mobile binaries are
not authorized release assets in this source-first flow.

## Android Validation

Before distributing Android builds, follow [docs/android.md](android.md): run
`npm run android:build:debug`, and smoke test bridge configuration on a device or emulator with a
bridge started using `--allow-origin http://localhost`. Revisit the Android backup policy before
adding any pairing token or other secret storage.

## Upload Artifacts

After `node scripts/release.mjs vX.Y.Z` creates the GitHub release, upload only
the source archive and its checksum. Upload only artifacts built from the final
release commit or tag and inspected with the source artifact audit.

```bash
gh release upload vX.Y.Z \
  dist-packages/herdr-world-vX.Y.Z-source.tar.gz \
  dist-packages/herdr-world-vX.Y.Z-source.tar.gz.sha256
```

Do not upload desktop tarballs, Android packages, APKs, or other binary/mobile
artifacts from this release flow. Their publication requires the separate
approved gates documented by the later extraction and installer specifications.

## After

- Confirm the GitHub release exists and points at the expected tag.
- Confirm release assets and checksum files are attached.
- Confirm `CHANGELOG.md` on `main` has a fresh empty `## [Unreleased]` section.
